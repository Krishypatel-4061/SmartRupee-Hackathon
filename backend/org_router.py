from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db_connection import get_db_connection
import psycopg2

org_router = APIRouter()

ORG_ID = 1

class DisbursePayload(BaseModel):
    amount: float
    rule_type: str
    allowed_category: str
    is_geofenced: bool

class VerifyPayload(BaseModel):
    action: str

@org_router.get("/students")
def get_students():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.user_id, u.name, w.total_balance, w.available_balance, w.locked_balance,
                   STRING_AGG(DISTINCT sl.allowed_category, ', ') AS allowed_categories
            FROM users u
            JOIN org_student_map osm ON u.user_id = osm.student_id
            JOIN wallets w ON u.user_id = w.user_id
            LEFT JOIN smart_locks sl ON w.wallet_id = sl.wallet_id AND sl.status = 'Active'
            WHERE osm.org_id = %s AND u.role = 'Student'
            GROUP BY u.user_id, u.name, w.total_balance, w.available_balance, w.locked_balance
        """, (ORG_ID,))
        
        rows = cur.fetchall()
        students = []
        for row in rows:
            students.append({
                "id": row[0],
                "name": row[1],
                "total_balance": float(row[2]) if row[2] is not None else 0.0,
                "available_balance": float(row[3]) if row[3] is not None else 0.0,
                "locked_balance": float(row[4]) if row[4] is not None else 0.0,
                "allowed_category": row[5] if row[5] is not None else 'Any'
            })
        return students
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.post("/bulk-disburse")
def bulk_disburse(payload: DisbursePayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # SQL Step A: Select all wallet_ids for students where org_student_map org_id = 1
        cur.execute("""
            SELECT w.wallet_id, u.user_id
            FROM wallets w
            JOIN users u ON w.user_id = u.user_id
            JOIN org_student_map osm ON u.user_id = osm.student_id
            WHERE osm.org_id = %s AND u.role = 'Student'
        """, (ORG_ID,))
        wallets = cur.fetchall()
        
        if not wallets:
            return {"message": "No students found for this organization."}
            
        wallet_ids = [w[0] for w in wallets]
        user_ids = [w[1] for w in wallets]

        # SQL Step B: UPDATE wallets for students linked to org 1
        cur.execute("""
            UPDATE wallets 
            SET total_balance = total_balance + %s,
                locked_balance = locked_balance + %s
            WHERE user_id = ANY(%s)
        """, (payload.amount, payload.amount, user_ids))
        
        # SQL Step C: Insert a new row into smart_locks for each affected wallet
        for w_id in wallet_ids:
            cur.execute("""
                INSERT INTO smart_locks 
                (wallet_id, sender_id, amount, rule_type, allowed_category, is_geofenced, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'Active')
            """, (w_id, ORG_ID, payload.amount, payload.rule_type, payload.allowed_category, payload.is_geofenced))
            
        conn.commit()
        return {"message": "Funds successfully programmed and disbursed."}
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.get("/verifications")
def get_verifications():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT v.verification_id, u.name, v.document_url, v.lock_id, v.created_at
            FROM verifications v
            JOIN users u ON v.student_id = u.user_id
            WHERE v.reviewer_id = %s AND v.status = 'Pending'
        """, (ORG_ID,))
        
        rows = cur.fetchall()
        verifications = []
        for row in rows:
            verifications.append({
                "id": row[0],
                "student_name": row[1],
                "document_name": row[2],
                "lock_id": row[3],
                "date": row[4].isoformat() if len(row) > 4 and row[4] else None
            })
        return verifications
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.post("/verify/{verification_id}")
def verify_document(verification_id: int, payload: VerifyPayload):
    if payload.action not in ["Approve", "Reject"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'Approve' or 'Reject'.")
        
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if payload.action == "Reject":
            cur.execute("""
                UPDATE verifications 
                SET status = 'Rejected' 
                WHERE verification_id = %s AND status = 'Pending'
            """, (verification_id,))
            conn.commit()
            return {"success": True, "message": "Verification rejected."}
            
        elif payload.action == "Approve":
            cur.execute("""
                UPDATE verifications 
                SET status = 'Approved' 
                WHERE verification_id = %s AND status = 'Pending'
                RETURNING lock_id, student_id
            """, (verification_id,))
            record = cur.fetchone()
            
            if not record:
                raise HTTPException(status_code=404, detail="Pending verification not found or already processed.")
                
            lock_id, student_id = record
            
            cur.execute("""
                UPDATE smart_locks 
                SET status = 'Unlocked' 
                WHERE lock_id = %s 
                RETURNING amount
            """, (lock_id,))
            lock_record = cur.fetchone()
            
            amount = lock_record[0] if lock_record else 0
            
            cur.execute("""
                UPDATE wallets 
                SET locked_balance = locked_balance - %s,
                    available_balance = available_balance + %s
                WHERE user_id = %s
            """, (amount, amount, student_id))
            
            conn.commit()
            return {"success": True, "message": "Verification approved and funds unlocked."}
            
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.get("/analytics")
def get_analytics():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN t.status = 'Success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN t.status = 'Blocked_by_SmartRule' THEN 1 ELSE 0 END) as blocked_count
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            JOIN users u ON w.user_id = u.user_id
            JOIN org_student_map osm ON u.user_id = osm.student_id
            WHERE osm.org_id = %s AND u.role = 'Student' AND t.tx_type = 'Debit'
        """, (ORG_ID,))
        
        row = cur.fetchone()
        
        if not row or row[0] == 0 or row[0] is None:
            return {"total": 0, "success": 0, "blocked": 0, "compliance_rate": 0.0}
            
        total = int(row[0])
        success = int(row[1]) if row[1] is not None else 0
        blocked = int(row[2]) if row[2] is not None else 0
        
        compliance_rate = (success / total) * 100
            
        return {
            "total": total,
            "success": success,
            "blocked": blocked,
            "compliance_rate": float(round(compliance_rate, 2))
        }
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()