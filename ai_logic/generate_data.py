import csv
import random
from datetime import datetime, timedelta

def generate_dummy_data(filename="student_transactions.csv", rows=50):
    categories = ["Food", "Education", "Gaming", "Travel", "Miscellaneous"]
    
    # Weights to simulate a student spending a lot on Gaming and Food
    weights = [0.3, 0.15, 0.4, 0.1, 0.05] 

    with open(filename, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(["Transaction_ID", "Date", "Amount", "Category"])

        start_date = datetime.now() - timedelta(days=30)
        
        for i in range(1, rows + 1):
            random_days = random.randint(0, 30)
            txn_date = start_date + timedelta(days=random_days)
            category = random.choices(categories, weights=weights)[0]
            
            # Generating realistic amounts based on category
            if category == "Gaming":
                amount = round(random.uniform(500, 2500), 2)
            elif category == "Food":
                amount = round(random.uniform(100, 600), 2)
            elif category == "Education":
                amount = round(random.uniform(1000, 5000), 2)
            else:
                amount = round(random.uniform(50, 1000), 2)

            writer.writerow([i, txn_date.strftime("%Y-%m-%d"), amount, category])

    print(f"✅ Generated {rows} rows of dummy data in {filename}")

if __name__ == "__main__":
    generate_dummy_data()
