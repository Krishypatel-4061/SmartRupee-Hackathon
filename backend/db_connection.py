import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise Exception("Database URL not found in environment!")
    return psycopg2.connect(DATABASE_URL)

def setup_database():
    if not DATABASE_URL:
        print("❌ DATABASE_URL is not set.")
        return

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        print("Wiping old tables...")
        cur.execute("DROP TABLE IF EXISTS payment_requests CASCADE;")
        cur.execute("DROP TABLE IF EXISTS verifications CASCADE;")
        cur.execute("DROP TABLE IF EXISTS transactions CASCADE;")
        cur.execute("DROP TABLE IF EXISTS smart_locks CASCADE;")
        cur.execute("DROP TABLE IF EXISTS wallets CASCADE;")
        cur.execute("DROP TABLE IF EXISTS users CASCADE;")
        
        print("Creating tables...")
        
        cur.execute("""
        CREATE TABLE users (
            user_id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            role VARCHAR(50) NOT NULL,
            email VARCHAR(100) UNIQUE,
            college_name VARCHAR(100),
            year INT,
            major VARCHAR(100),
            linked_parent_id INTEGER REFERENCES users(user_id), 
            linked_org_id INTEGER REFERENCES users(user_id)
        );
        """)

        cur.execute("""
        CREATE TABLE wallets (
            wallet_id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
            total_balance NUMERIC DEFAULT 0,
            available_balance NUMERIC DEFAULT 0,
            locked_balance NUMERIC DEFAULT 0
        );
        """)

        cur.execute("""
        CREATE TABLE smart_locks (
            lock_id SERIAL PRIMARY KEY,
            wallet_id INTEGER REFERENCES wallets(wallet_id) ON DELETE CASCADE,
            sender_id INTEGER REFERENCES users(user_id),
            amount NUMERIC NOT NULL,
            rule_type VARCHAR(50),
            allowed_category VARCHAR(100) DEFAULT 'Unrestricted',
            required_document VARCHAR(100),
            is_geofenced BOOLEAN DEFAULT FALSE,
            status VARCHAR(50) DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cur.execute("""
        CREATE TABLE transactions (
            transaction_id SERIAL PRIMARY KEY,
            wallet_id INTEGER REFERENCES wallets(wallet_id) ON DELETE CASCADE,
            lock_id INTEGER REFERENCES smart_locks(lock_id),
            sender_id INTEGER REFERENCES users(user_id),
            amount NUMERIC NOT NULL,
            tx_type VARCHAR(50),
            merchant_name VARCHAR(100),
            merchant_category VARCHAR(100),
            status VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cur.execute("""
        CREATE TABLE verifications (
            verification_id SERIAL PRIMARY KEY,
            lock_id INTEGER REFERENCES smart_locks(lock_id) ON DELETE CASCADE,
            student_id INTEGER REFERENCES users(user_id),
            reviewer_id INTEGER REFERENCES users(user_id),
            document_name VARCHAR(255),
            status VARCHAR(50) DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        cur.execute("""
        CREATE TABLE payment_requests (
            request_id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES users(user_id),
            receiver_id INTEGER REFERENCES users(user_id),
            amount NUMERIC NOT NULL,
            purpose VARCHAR(255),
            note TEXT,
            urgency VARCHAR(50),
            proof_plan VARCHAR(50),
            proof_deadline TIMESTAMP,
            status VARCHAR(50) DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        print("Inserting Mock Data...")
        cur.execute("INSERT INTO users (user_id, name, role) VALUES (1, 'Vellore Institute of Technology', 'Organization');")
        cur.execute("INSERT INTO users (user_id, name, role) VALUES (2, 'Ramesh Kumar', 'Parent');")
        cur.execute("INSERT INTO users (user_id, name, role, linked_parent_id, linked_org_id) VALUES (3, 'Arjun Kumar', 'Student', 2, 1);")
        cur.execute("INSERT INTO users (user_id, name, role, linked_parent_id, linked_org_id) VALUES (4, 'Priya Sharma', 'Student', NULL, 1);")
        
        cur.execute("INSERT INTO wallets (wallet_id, user_id, total_balance, available_balance, locked_balance) VALUES (1, 3, 5000.00, 2000.00, 3000.00);")
        cur.execute("INSERT INTO wallets (wallet_id, user_id, total_balance, available_balance, locked_balance) VALUES (2, 4, 10000.00, 5000.00, 5000.00);")
        
        cur.execute("INSERT INTO smart_locks (lock_id, wallet_id, sender_id, amount, rule_type, allowed_category, status) VALUES (1, 1, 1, 3000.00, 'Category_Lock', 'Education', 'Active');")
        cur.execute("INSERT INTO smart_locks (lock_id, wallet_id, sender_id, amount, rule_type, allowed_category, status) VALUES (2, 2, 1, 5000.00, 'Document_Unlock', 'Books', 'Active');")

        cur.execute("INSERT INTO transactions (wallet_id, amount, tx_type, merchant_name, merchant_category, status) VALUES (1, 500, 'Debit', 'VIT Canteen', 'Food', 'Success');")
        cur.execute("INSERT INTO transactions (wallet_id, amount, tx_type, merchant_name, merchant_category, status) VALUES (1, 1500, 'Debit', 'Steam Games', 'Gaming', 'Blocked_by_SmartRule');")

        cur.execute("INSERT INTO verifications (lock_id, student_id, reviewer_id, document_name, status) VALUES (2, 4, 1, 'semester_3_marksheet.pdf', 'Pending');")

        conn.commit()
        cur.close()
        conn.close()
        print("✅ Database setup complete.")

    except Exception as e:
        print(f"❌ Error setting up database: {e}")

if __name__ == "__main__":
    setup_database()
