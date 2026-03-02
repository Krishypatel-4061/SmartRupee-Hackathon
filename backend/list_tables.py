import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not set")
    exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
try:
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables = cur.fetchall()
    print("Tables:", [t[0] for t in tables])
    
    for table in [t[0] for t in tables]:
        print(f"\nColumns for {table}:")
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'")
        for col in cur.fetchall():
            print(f"  - {col[0]} ({col[1]})")
            
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
