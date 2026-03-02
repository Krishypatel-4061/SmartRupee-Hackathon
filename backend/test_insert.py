import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
try:
    cur.execute("""
        INSERT INTO users (user_id, name, email, password, password_hash, role)
        VALUES (2, 'Rajesh Sharma', 'rajesh@example.com', 'password123', 'xxx', 'Parent') 
        ON CONFLICT (user_id) DO NOTHING;
    """)
    cur.execute("""
        INSERT INTO users (user_id, name, email, password, password_hash, role, college_name, year, major)
        VALUES (3, 'Aarav Sharma', 'aarav@example.com', 'password123', 'xxx', 'Student', 'Delhi University', 2, 'Computer Science')
        ON CONFLICT (user_id) DO NOTHING;
    """)
    cur.execute("""
        INSERT INTO parent_student_map (parent_id, student_id)
        VALUES (2, 3)
        ON CONFLICT DO NOTHING;
    """)
    
    cur.execute("""
        INSERT INTO wallets (user_id, total_balance, available_balance, locked_balance, allowed_category)
        VALUES (3, 5000.0, 3000.0, 2000.0, 'Any')
        ON CONFLICT (user_id) DO NOTHING;
    """)
    conn.commit()
    print("Inserted mock user data!")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
