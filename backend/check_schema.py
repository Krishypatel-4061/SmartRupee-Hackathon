import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
try:
    cur.execute("""
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
    """)
    rows = cur.fetchall()
    current_table = None
    for row in rows:
        if current_table != row[0]:
            current_table = row[0]
            print(f"\nTable: {current_table}")
        print(f"  - {row[1]} ({row[2]}) Nullable: {row[3]}")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
