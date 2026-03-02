from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db_connection import get_db_connection
import psycopg2

auth_router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

@auth_router.post("/login")
def login(request: LoginRequest):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT user_id, name, role
            FROM users
            WHERE email = %s AND password = %s
        """, (request.email, request.password))
        
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            
        return {
            "user_id": user[0],
            "name": user[1],
            "role": user[2].lower()
        }
    except psycopg2.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
