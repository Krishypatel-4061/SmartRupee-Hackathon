from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2

app = FastAPI(title="SmartRupee MVP API")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's a hackathon MVP, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import our router logic
from auth_router import auth_router
from org_router import org_router
from student_db import student_router
from parent_api import parent_router
from db_connection import get_db_connection

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(org_router, prefix="/org", tags=["Organization"])
app.include_router(student_router, prefix="/student", tags=["Student"])
app.include_router(parent_router, prefix="/parent", tags=["Parent"])

class PaymentRequest(BaseModel):
    wallet_id: int
    amount: float
    merchant_category: str

@app.post("/pay")
def process_payment(request: PaymentRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Step 1: Check Wallet Rules & Balance
        cur.execute("SELECT balance, allowed_category FROM wallets WHERE id = %s", (request.wallet_id,))
        wallet = cur.fetchone()
        
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
            
        balance, allowed_category = wallet
        
        # Smart Contract Logic (Validation)
        if allowed_category != "Any" and allowed_category.lower() != request.merchant_category.lower():
            
            # Log denied transaction
            cur.execute("""
                INSERT INTO transactions (wallet_id, amount, merchant_category, status)
                VALUES (%s, %s, %s, %s)
            """, (request.wallet_id, request.amount, request.merchant_category, 'denied'))
            conn.commit()
            
            raise HTTPException(
                status_code=403, 
                detail=f"Smart Contract Denied: Wallet restricted to '{allowed_category}' only, but merchant is '{request.merchant_category}'."
            )
            
        if balance < request.amount:
            raise HTTPException(status_code=400, detail="Insufficient Balance")
            
        # Step 2: Execute Payment
        new_balance = float(balance) - request.amount
        
        cur.execute("UPDATE wallets SET balance = %s WHERE id = %s", (new_balance, request.wallet_id))
        
        cur.execute("""
            INSERT INTO transactions (wallet_id, amount, merchant_category, status)
            VALUES (%s, %s, %s, %s)
        """, (request.wallet_id, request.amount, request.merchant_category, 'approved'))
        
        conn.commit()
        
        return {
            "status": "success",
            "message": "Payment Approved by Smart Contract",
            "new_balance": new_balance,
            "amount_paid": request.amount
        }
        
    except psycopg2.Error as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        conn.close()

@app.get("/balance/{wallet_id}")
def get_balance(wallet_id: int):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT balance, allowed_category FROM wallets WHERE id = %s", (wallet_id,))
        wallet = cur.fetchone()
        
        if not wallet:
            raise HTTPException(status_code=404, detail="Wallet not found")
            
        return {
            "wallet_id": wallet_id,
            "balance": wallet[0],
            "allowed_category": wallet[1]
        }
    finally:
        cur.close()
        conn.close()

# Keep backend running during dev: uvicorn main:app --reload
