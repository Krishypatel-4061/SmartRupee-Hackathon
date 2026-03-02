from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from db_connection import get_db_connection
import psycopg2

org_router = APIRouter()

class LoginPayload(BaseModel):
    identifier: str
    password: str

class DisbursePayload(BaseModel):
    amount: float
    rule_type: str
    allowed_category: str
    is_geofenced: bool

class VerifyPayload(BaseModel):
    action: str

# ---------- AUTHENTICATION ----------

@org_router.post("/login")
def org_login(payload: LoginPayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT user_id, name, email 
            FROM users 
            WHERE role = 'Organization' 
              AND (email = %s OR name = %s)
              AND password = %s
        """, (payload.identifier, payload.identifier, payload.password))
        
        org = cur.fetchone()
        if not org:
            raise HTTPException(status_code=401, detail="Invalid organization credentials")
            
        return {
            "success": True,
            "org": {
                "id": org[0],
                "name": org[1],
                "email": org[2]
            }
        }
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@org_router.get("/students")
def get_students(x_user_id: int = Header(..., description="Organization ID for auth")):
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
        """, (x_user_id,))
        
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
def bulk_disburse(payload: DisbursePayload, x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # SQL Step A: Select all wallet_ids for students where org_student_map org_id = injected x_user_id
        cur.execute("""
            SELECT w.wallet_id, u.user_id
            FROM wallets w
            JOIN users u ON w.user_id = u.user_id
            JOIN org_student_map osm ON u.user_id = osm.student_id
            WHERE osm.org_id = %s AND u.role = 'Student'
        """, (x_user_id,))
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
        for user_id, w_id in zip(user_ids, wallet_ids):
            cur.execute("""
                INSERT INTO smart_locks 
                (wallet_id, sender_id, amount, rule_type, allowed_category, is_geofenced, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'Active')
                RETURNING lock_id
            """, (w_id, x_user_id, payload.amount, payload.rule_type, payload.allowed_category, payload.is_geofenced))
            
            new_lock = cur.fetchone()
            lock_id = new_lock[0] if new_lock else None

            # Create Ledger Transaction for full traceability
            cur.execute("""
                INSERT INTO transactions
                (wallet_id, amount, tx_type, merchant_name, merchant_category, status)
                VALUES (%s, %s, 'Credit', 'Organization Disbursement', 'Scholarship', 'Locked')
            """, (
                w_id,
                payload.amount
            ))

            # Auto-generate a pending Document Verification request for the demo tracking
            if lock_id and payload.rule_type == "Document_Unlock":
                cur.execute("""
                    INSERT INTO verifications
                    (lock_id, student_id, reviewer_id, document_name, status)
                    VALUES (%s, %s, %s, 'requested_document.pdf', 'Pending')
                """, (
                    lock_id,
                    user_id,
                    x_user_id
                ))
            
        conn.commit()
        return {"message": "Funds successfully programmed and disbursed."}
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.get("/verification-queue")
def get_verification_queue(x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT v.verification_id, u.name as student_name, v.document_name, v.created_at, v.status
            FROM verifications v
            JOIN users u ON v.student_id = u.user_id
            WHERE v.reviewer_id = %s AND v.status = 'Pending'
            ORDER BY v.created_at DESC
        """, (x_user_id,))
        
        rows = cur.fetchall()
        verifications = []
        for row in rows:
            verifications.append({
                "id": row[0],
                "student_name": row[1],
                "document_type": row[2],
                "date": row[3].isoformat() if row[3] else None,
                "status": row[4]
            })
        return verifications
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.post("/verification-queue/{request_id}")
def resolve_verification(request_id: int, payload: VerifyPayload, x_user_id: int = Header(...)):
    if payload.action not in ["Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'Approved' or 'Rejected'.")
        
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE verifications
            SET status = %s, reviewer_id = %s
            WHERE verification_id = %s
            RETURNING student_id, lock_id
        """, (payload.action, x_user_id, request_id))
        
        record = cur.fetchone()
        
        if not record:
            raise HTTPException(status_code=404, detail="Pending verification request not found or already processed.")
            
        student_id = record[0]
        lock_id = record[1]
        
        if payload.action == "Approved" and lock_id:
            cur.execute("""
                UPDATE smart_locks 
                SET status = 'Unlocked' 
                WHERE lock_id = %s 
                RETURNING amount, wallet_id
            """, (lock_id,))
            lock_record = cur.fetchone()
            
            amount = lock_record[0] if lock_record else 0
            wallet_id = lock_record[1] if lock_record else None
            
            cur.execute("""
                UPDATE wallets 
                SET locked_balance = locked_balance - %s,
                    available_balance = available_balance + %s
                WHERE user_id = %s
            """, (amount, amount, student_id))
            
            if wallet_id:
                cur.execute("""
                    UPDATE transactions
                    SET status = 'Success'
                    WHERE transaction_id = (
                        SELECT transaction_id
                        FROM transactions
                        WHERE wallet_id = %s AND status = 'Locked' AND amount = %s
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                """, (wallet_id, amount))

        elif payload.action == "Rejected" and lock_id:
            cur.execute("SELECT amount, wallet_id FROM smart_locks WHERE lock_id = %s", (lock_id,))
            rec = cur.fetchone()
            if rec:
                amount, wallet_id = rec
                cur.execute("""
                    UPDATE transactions
                    SET status = 'Failed'
                    WHERE transaction_id = (
                        SELECT transaction_id
                        FROM transactions
                        WHERE wallet_id = %s AND status = 'Locked' AND amount = %s
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                """, (wallet_id, amount))
            
        conn.commit()
        return {"success": True, "message": f"Verification request {payload.action.lower()}."}
            
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@org_router.get("/analytics")
def get_analytics(x_user_id: int = Header(...)):
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
        """, (x_user_id,))
        
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