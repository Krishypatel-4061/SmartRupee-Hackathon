from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db_connection import get_db_connection
from typing import Optional
import psycopg2

student_router = APIRouter()

# ── MODELS ────────────────────────────────────────────────────────────────────

class SpendPayload(BaseModel):
    lock_id: int
    merchant_name: str
    merchant_category: str
    amount: float

class DocumentUploadPayload(BaseModel):
    lock_id: int
    document_name: str
    reviewer_id: int  # parent or org id who will verify

class PaymentRequestPayload(BaseModel):
    receiver_id: int          # parent or org id
    amount: float
    purpose: str
    note: Optional[str] = ""
    urgency: str              # 'normal', 'this_week', 'urgent'
    proof_plan: str           # 'receipt', 'certificate', 'trust_based'
    proof_deadline: Optional[str] = None

# ── WALLET ────────────────────────────────────────────────────────────────────

@student_router.get("/wallet/{student_id}")
def get_wallet(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT u.name, u.college_name, u.year, u.major,
                   w.wallet_id, w.total_balance, w.available_balance, w.locked_balance
            FROM users u
            JOIN wallets w ON u.user_id = w.user_id
            WHERE u.user_id = %s AND u.role = 'Student'
        """, (student_id,))

        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Student wallet not found.")

        return {
            "name":              row[0],
            "college_name":      row[1],
            "year":              row[2],
            "major":             row[3],
            "wallet_id":         row[4],
            "total_balance":     float(row[5]) if row[5] is not None else 0.0,
            "available_balance": float(row[6]) if row[6] is not None else 0.0,
            "locked_balance":    float(row[7]) if row[7] is not None else 0.0,
        }
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── TRANSACTIONS ──────────────────────────────────────────────────────────────

@student_router.get("/transactions/{student_id}")
def get_transactions(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT t.transaction_id, t.tx_type, t.amount, t.status,
                   t.merchant_name, t.merchant_category, t.created_at,
                   sl.allowed_category, sl.rule_type, sl.status AS lock_status,
                   sender.name AS sender_name
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            LEFT JOIN smart_locks sl ON t.lock_id = sl.lock_id
            LEFT JOIN users sender ON t.sender_id = sender.user_id
            WHERE w.user_id = %s
            ORDER BY t.created_at DESC
        """, (student_id,))

        rows = cur.fetchall()
        transactions = []
        for row in rows:
            transactions.append({
                "transaction_id":     row[0],
                "tx_type":            row[1],
                "amount":             float(row[2]) if row[2] is not None else 0.0,
                "status":             row[3],
                "merchant_name":      row[4],
                "merchant_category":  row[5],
                "created_at":         row[6].isoformat() if row[6] else None,
                "allowed_category":   row[7],
                "rule_type":          row[8],
                "lock_status":        row[9],
                "sender_name":        row[10],
            })
        return transactions
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── SMART LOCKS ───────────────────────────────────────────────────────────────

@student_router.get("/locks/{student_id}")
def get_locks(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT sl.lock_id, sl.amount, sl.rule_type, sl.allowed_category,
                   sl.is_geofenced, sl.status, sl.created_at,
                   sender.name AS sender_name, sender.user_id AS sender_id
            FROM smart_locks sl
            JOIN wallets w ON sl.wallet_id = w.wallet_id
            JOIN users sender ON sl.sender_id = sender.user_id
            WHERE w.user_id = %s
            ORDER BY sl.created_at DESC
        """, (student_id,))

        rows = cur.fetchall()
        locks = []
        for row in rows:
            locks.append({
                "lock_id":          row[0],
                "amount":           float(row[1]) if row[1] is not None else 0.0,
                "rule_type":        row[2],
                "allowed_category": row[3],
                "is_geofenced":     row[4],
                "status":           row[5],
                "created_at":       row[6].isoformat() if row[6] else None,
                "sender_name":      row[7],
                "sender_id":        row[8],
            })
        return locks
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── SPEND / QR SCAN ───────────────────────────────────────────────────────────

@student_router.post("/spend/{student_id}")
def attempt_spend(student_id: int, payload: SpendPayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT sl.lock_id, sl.allowed_category, sl.amount, sl.status, w.wallet_id, w.available_balance
            FROM smart_locks sl
            JOIN wallets w ON sl.wallet_id = w.wallet_id
            WHERE sl.lock_id = %s AND w.user_id = %s
        """, (payload.lock_id, student_id))

        lock = cur.fetchone()

        if not lock:
            raise HTTPException(status_code=404, detail="Lock not found for this student.")

        lock_id, allowed_category, lock_amount, lock_status, wallet_id, available_balance = lock
        available_balance = float(available_balance)

        if lock_status != "Unlocked":
            raise HTTPException(status_code=400, detail=f"This transfer is still {lock_status}. Cannot spend yet.")

        if available_balance < payload.amount:
            raise HTTPException(status_code=400, detail="Insufficient available balance.")

        if payload.merchant_category.lower() != allowed_category.lower():
            cur.execute("""
                INSERT INTO transactions
                (wallet_id, tx_type, amount, status, merchant_name, merchant_category)
                VALUES (%s, 'Debit', %s, 'Blocked_by_SmartRule', %s, %s)
            """, (wallet_id, payload.amount, payload.merchant_name, payload.merchant_category))

            conn.commit()
            return {
                "success":           False,
                "status":            "BLOCKED",
                "reason":            f"This transfer only allows: {allowed_category}. '{payload.merchant_category}' is not permitted.",
                "allowed_category":  allowed_category,
                "merchant_category": payload.merchant_category,
            }

        cur.execute("""
            UPDATE wallets
            SET available_balance = available_balance - %s,
                total_balance     = total_balance - %s
            WHERE wallet_id = %s
        """, (payload.amount, payload.amount, wallet_id))

        cur.execute("""
            INSERT INTO transactions
            (wallet_id, tx_type, amount, status, merchant_name, merchant_category)
            VALUES (%s, 'Debit', %s, 'Success', %s, %s)
        """, (wallet_id, payload.amount, payload.merchant_name, payload.merchant_category))

        conn.commit()

        cur.execute("SELECT available_balance FROM wallets WHERE wallet_id = %s", (wallet_id,))
        updated = cur.fetchone()

        return {
            "success":           True,
            "status":            "APPROVED",
            "amount_spent":      payload.amount,
            "merchant_name":     payload.merchant_name,
            "remaining_balance": float(updated[0]) if updated else 0.0,
        }

    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── DOCUMENT UPLOAD ───────────────────────────────────────────────────────────

@student_router.post("/upload-document/{student_id}")
def upload_document(student_id: int, payload: DocumentUploadPayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT sl.lock_id
            FROM smart_locks sl
            JOIN wallets w ON sl.wallet_id = w.wallet_id
            WHERE sl.lock_id = %s AND w.user_id = %s AND sl.status = 'Active'
        """, (payload.lock_id, student_id))

        lock = cur.fetchone()
        if not lock:
            raise HTTPException(status_code=404, detail="Active lock not found for this student.")

        cur.execute("""
            SELECT verification_id FROM verifications
            WHERE lock_id = %s AND student_id = %s AND status = 'Pending'
        """, (payload.lock_id, student_id))

        existing = cur.fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="A verification is already pending for this lock.")

        cur.execute("""
            INSERT INTO verifications (student_id, reviewer_id, lock_id, document_name, status)
            VALUES (%s, %s, %s, %s, 'Pending')
            RETURNING verification_id
        """, (student_id, payload.reviewer_id, payload.lock_id, payload.document_name))

        new_id = cur.fetchone()[0]
        conn.commit()

        return {
            "success":         True,
            "verification_id": new_id,
            "message":         "Document submitted. Waiting for reviewer approval."
        }

    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@student_router.get("/verifications/{student_id}")
def get_my_verifications(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT v.verification_id, v.document_name, v.status, v.created_at,
                   sl.allowed_category, sl.amount,
                   reviewer.name AS reviewer_name
            FROM verifications v
            JOIN smart_locks sl ON v.lock_id = sl.lock_id
            JOIN users reviewer ON v.reviewer_id = reviewer.user_id
            WHERE v.student_id = %s
            ORDER BY v.created_at DESC
        """, (student_id,))

        rows = cur.fetchall()
        verifications = []
        for row in rows:
            verifications.append({
                "verification_id":  row[0],
                "document_name":    row[1],
                "status":           row[2],
                "created_at":       row[3].isoformat() if row[3] else None,
                "allowed_category": row[4],
                "lock_amount":      float(row[5]) if row[5] is not None else 0.0,
                "reviewer_name":    row[6],
            })
        return verifications
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── PAYMENT REQUESTS ──────────────────────────────────────────────────────────

@student_router.post("/payment-request/{student_id}")
def create_payment_request(student_id: int, payload: PaymentRequestPayload):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO payment_requests
            (student_id, receiver_id, amount, purpose, note, urgency, proof_plan, proof_deadline, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Pending')
            RETURNING request_id
        """, (
            student_id,
            payload.receiver_id,
            payload.amount,
            payload.purpose,
            payload.note,
            payload.urgency,
            payload.proof_plan,
            payload.proof_deadline
        ))

        new_id = cur.fetchone()[0]
        conn.commit()

        return {
            "success":    True,
            "request_id": new_id,
            "message":    "Payment request sent. You will be notified when it is approved."
        }

    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@student_router.get("/payment-requests/{student_id}")
def get_payment_requests(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT pr.request_id, pr.amount, pr.purpose, pr.note,
                   pr.urgency, pr.proof_plan, pr.status, pr.created_at,
                   receiver.name AS receiver_name
            FROM payment_requests pr
            JOIN users receiver ON pr.receiver_id = receiver.user_id
            WHERE pr.student_id = %s
            ORDER BY pr.created_at DESC
        """, (student_id,))

        rows = cur.fetchall()
        requests = []
        for row in rows:
            requests.append({
                "request_id":    row[0],
                "amount":        float(row[1]) if row[1] is not None else 0.0,
                "purpose":       row[2],
                "note":          row[3],
                "urgency":       row[4],
                "proof_plan":    row[5],
                "status":        row[6],
                "created_at":    row[7].isoformat() if row[7] else None,
                "receiver_name": row[8],
            })
        return requests
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ── SPENDING ANALYTICS (AI INSIGHTS) ─────────────────────────────────────────

@student_router.get("/analytics/{student_id}")
def get_spending_analytics(student_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT t.merchant_category, SUM(t.amount) AS total
            FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            WHERE w.user_id = %s
              AND t.tx_type = 'Debit'
              AND t.status = 'Success'
            GROUP BY t.merchant_category
        """, (student_id,))

        rows = cur.fetchall()
        breakdown = {}
        total_spent = 0.0
        for row in rows:
            category = row[0] if row[0] else "Other"
            amount   = float(row[1]) if row[1] else 0.0
            breakdown[category] = amount
            total_spent += amount

        cur.execute("""
            SELECT COUNT(*) FROM transactions t
            JOIN wallets w ON t.wallet_id = w.wallet_id
            WHERE w.user_id = %s AND t.status = 'Blocked_by_SmartRule'
        """, (student_id,))

        blocked_count = cur.fetchone()[0] or 0

        cur.execute("""
            SELECT COALESCE(SUM(sl.amount), 0)
            FROM smart_locks sl
            JOIN wallets w ON sl.wallet_id = w.wallet_id
            WHERE w.user_id = %s
        """, (student_id,))

        total_received = float(cur.fetchone()[0])

        compliance_rate = round((total_spent / total_received) * 100, 2) if total_received > 0 else 0.0

        return {
            "breakdown":       breakdown,
            "total_spent":     round(total_spent, 2),
            "total_received":  round(total_received, 2),
            "blocked_count":   int(blocked_count),
            "compliance_rate": compliance_rate,
        }

    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()