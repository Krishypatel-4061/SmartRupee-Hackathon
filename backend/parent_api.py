from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from db_connection import get_db_connection
import psycopg2

parent_router = APIRouter()

# ---------- SCHEMAS ----------

class LoginPayload(BaseModel):
    parent_identifier: str
    password: str
    student_name: str
    student_id: int

class SendMoneyPayload(BaseModel):
    student_id: int
    amount: float
    rule_type: str
    allowed_category: str
    is_geofenced: bool

class VerifyPayload(BaseModel):
    action: str  # Approve / Reject


# ---------- AUTHENTICATION ----------

@parent_router.post("/login")
def parent_login(payload: LoginPayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Match parent by identifier and password
        cur.execute("""
            SELECT user_id, name, email 
            FROM users 
            WHERE role = 'Parent' 
              AND (email = %s OR name = %s)
              AND password = %s
        """, (payload.parent_identifier, payload.parent_identifier, payload.password))
        
        parent = cur.fetchone()
        if not parent:
            raise HTTPException(status_code=401, detail="Invalid parent details")
            
        # Match the provided child exactly
        cur.execute("""
            SELECT s.user_id 
            FROM users s
            JOIN parent_student_map psm ON s.user_id = psm.student_id
            WHERE psm.parent_id = %s 
              AND s.user_id = %s
              AND (s.name = %s OR s.name ILIKE %s)
              AND s.role = 'Student'
        """, (parent[0], payload.student_id, payload.student_name, f"%{payload.student_name}%"))
        
        student = cur.fetchone()
        if not student:
            raise HTTPException(status_code=401, detail="Student credentials don't match any ward linked to this parent.")

        cur.execute("""
            SELECT student_id FROM parent_student_map WHERE parent_id = %s
        """, (parent[0],))
        wards = [r[0] for r in cur.fetchall()]
        
        return {
            "success": True,
            "parent": {
                "id": parent[0],
                "parentName": parent[1],
                "email": parent[2],
                "wards": wards
            }
        }
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

# ---------- GET MY WARDS ----------

@parent_router.get("/wards")
def get_my_wards(x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                u.user_id,
                u.name,
                w.total_balance,
                w.available_balance,
                w.locked_balance
            FROM parent_student_map psm
            JOIN users u ON psm.student_id = u.user_id
            JOIN wallets w ON u.user_id = w.user_id
            WHERE psm.parent_id = %s
        """, (x_user_id,))

        rows = cur.fetchall()
        wards = []

        for r in rows:
            wards.append({
                "student_id": r[0],
                "name": r[1],
                "total_balance": float(r[2] or 0),
                "available_balance": float(r[3] or 0),
                "locked_balance": float(r[4] or 0)
            })

        return wards

    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ---------- SEND MONEY TO ONE WARD ----------

@parent_router.post("/send-money")
def send_money(payload: SendMoneyPayload, x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Check ownership
        cur.execute("""
            SELECT 1 FROM parent_student_map
            WHERE parent_id = %s AND student_id = %s
        """, (x_user_id, payload.student_id))

        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized ward")

        # Fetch wallet
        cur.execute("""
            SELECT wallet_id FROM wallets
            WHERE user_id = %s
        """, (payload.student_id,))
        wallet = cur.fetchone()

        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")

        wallet_id = wallet[0]

        # Update balances
        cur.execute("""
            UPDATE wallets
            SET total_balance = total_balance + %s,
                locked_balance = locked_balance + %s
            WHERE wallet_id = %s
        """, (payload.amount, payload.amount, wallet_id))

        # Create smart lock
        cur.execute("""
            INSERT INTO smart_locks
            (wallet_id, sender_id, amount, rule_type, allowed_category, is_geofenced, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'Active')
        """, (
            wallet_id,
            x_user_id,
            payload.amount,
            payload.rule_type,
            payload.allowed_category,
            payload.is_geofenced
        ))

        conn.commit()
        return {"success": True, "message": "Smart money sent to ward"}

    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ---------- VERIFICATION QUEUE (ONLY MY WARDS) ----------

@parent_router.get("/verifications")
def get_verifications(x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                v.verification_id,
                u.name,
                v.document_url,
                v.lock_id,
                v.created_at
            FROM verifications v
            JOIN users u ON v.student_id = u.user_id
            JOIN parent_student_map psm ON psm.student_id = u.user_id
            WHERE psm.parent_id = %s AND v.status = 'Pending'
        """, (x_user_id,))

        rows = cur.fetchall()
        result = []

        for r in rows:
            result.append({
                "verification_id": r[0],
                "student_name": r[1],
                "document_url": r[2],
                "lock_id": r[3],
                "created_at": r[4].isoformat() if r[4] else None
            })

        return result

    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ---------- APPROVE / REJECT VERIFICATION ----------

@parent_router.post("/verify/{verification_id}")
def verify_document(verification_id: int, payload: VerifyPayload):
    if payload.action not in ["Approve", "Reject"]:
        raise HTTPException(status_code=400, detail="Invalid action")

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Ownership + fetch
        cur.execute("""
            SELECT v.lock_id, v.student_id
            FROM verifications v
            JOIN parent_student_map psm ON psm.student_id = v.student_id
            WHERE v.verification_id = %s
              AND v.status = 'Pending'
              AND psm.parent_id = %s
        """, (verification_id, PARENT_ID))

        record = cur.fetchone()
        if not record:
            raise HTTPException(status_code=403, detail="Unauthorized or invalid verification")

        lock_id, student_id = record

        if payload.action == "Reject":
            cur.execute("""
                UPDATE verifications SET status = 'Rejected'
                WHERE verification_id = %s
            """, (verification_id,))
            conn.commit()
            return {"success": True, "message": "Verification rejected"}

        # Approve flow
        cur.execute("""
            UPDATE verifications SET status = 'Approved'
            WHERE verification_id = %s
        """, (verification_id,))

        cur.execute("""
            UPDATE smart_locks
            SET status = 'Unlocked'
            WHERE lock_id = %s
            RETURNING amount
        """, (lock_id,))

        amount = cur.fetchone()[0]

        cur.execute("""
            UPDATE wallets
            SET locked_balance = locked_balance - %s,
                available_balance = available_balance + %s
            WHERE user_id = %s
        """, (amount, amount, student_id))

        conn.commit()
        return {"success": True, "message": "Funds unlocked for ward"}

    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ---------- PARENT ANALYTICS ----------

@parent_router.get("/analytics")
def parent_analytics(x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN t.status = 'Success' THEN 1 ELSE 0 END),
                SUM(CASE WHEN t.status = 'Blocked_by_SmartRule' THEN 1 ELSE 0 END)
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            JOIN parent_student_map psm ON psm.student_id = w.user_id
            WHERE psm.parent_id = %s AND t.tx_type = 'Debit'
        """, (x_user_id,))

        row = cur.fetchone()
        total = row[0] or 0
        success = row[1] or 0
        blocked = row[2] or 0

        compliance = (success / total * 100) if total > 0 else 0

        return {
            "total": total,
            "success": success,
            "blocked": blocked,
            "compliance_rate": round(compliance, 2)
        }

    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ---------- PARENT TRANSACTIONS HISTORY ----------

@parent_router.get("/transactions")
def get_parent_transactions(x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT 
                t.transaction_id,
                t.amount,
                t.tx_type,
                t.merchant_name,
                t.merchant_category,
                t.status,
                t.created_at,
                u.user_id as student_id,
                u.name as student_name
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            JOIN parent_student_map psm ON psm.student_id = w.user_id
            JOIN users u ON w.user_id = u.user_id
            WHERE psm.parent_id = %s
            ORDER BY t.created_at DESC
        """, (x_user_id,))
        
        rows = cur.fetchall()
        txns = []
        for r in rows:
            txns.append({
                "id": str(r[0]),
                "amount": float(r[1]),
                "tx_type": r[2],
                "purpose": r[3] or "Smart Transfer",
                "category": r[4] or "Transfer",
                "status": r[5].lower() if r[5] else 'spent',
                "date": r[6].isoformat() if r[6] else None,
                "studentId": r[7],
                "student_name": r[8]
            })
        return txns
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@parent_router.get("/transactions/{student_id}")
def get_ward_transactions(student_id: int, x_user_id: int = Header(...)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Check ownership
        cur.execute("""
            SELECT 1 FROM parent_student_map
            WHERE parent_id = %s AND student_id = %s
        """, (x_user_id, student_id))

        if not cur.fetchone():
            raise HTTPException(status_code=403, detail="Unauthorized ward")

        cur.execute("""
            SELECT 
                t.transaction_id,
                t.amount,
                t.tx_type,
                t.merchant_name,
                t.merchant_category,
                t.status,
                t.created_at,
                u.user_id as student_id,
                u.name as student_name
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            JOIN users u ON w.user_id = u.user_id
            WHERE w.user_id = %s
            ORDER BY t.created_at DESC
        """, (student_id,))
        
        rows = cur.fetchall()
        txns = []
        for r in rows:
            txns.append({
                "id": str(r[0]),
                "amount": float(r[1]),
                "tx_type": r[2],
                "purpose": r[3] or "Smart Transfer",
                "category": r[4] or "Transfer",
                "status": r[5].lower() if r[5] else 'spent',
                "date": r[6].isoformat() if r[6] else None,
                "studentId": r[7],
                "student_name": r[8]
            })
        return txns
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()