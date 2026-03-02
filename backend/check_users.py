import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("NO DATABASE URL!")
    exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
try:
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
        ORDER BY ordinal_position;
    """)
    rows = cur.fetchall()
    print("Users table columns:")
    for row in rows:
        print(f"  - {row[0]}")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
