import os
import csv
from collections import defaultdict

def analyze_student_spending(filename="student_transactions.csv"):
    if not os.path.exists(filename):
        return "⚠️ No data found. Please run generate_data.py first."

    category_totals = defaultdict(float)
    total_spent = 0.0

    try:
        with open(filename, mode='r') as file:
            reader = csv.DictReader(file)
            for row in reader:
                amount = float(row["Amount"])
                category = row["Category"]
                
                category_totals[category] += amount
                total_spent += amount
                
        if total_spent == 0:
            return "No spending recorded."

        # Find the highest spending category
        highest_category = max(category_totals, key=category_totals.get)
        highest_pct = (category_totals[highest_category] / total_spent) * 100

        # Hackathon Mock Output
        if highest_category == "Gaming":
            return f"Student spends {highest_pct:.1f}% of total budget (₹{category_totals[highest_category]:.2f}) on Gaming. Suggest setting up a ₹500 Smart Lock for Food next month to ensure grocery essentials are met."
        else:
            return f"Student spends {highest_pct:.1f}% on {highest_category}. Spending appears normal. Suggest locking ₹2000 for upcoming Education fees."

    except Exception as e:
        return f"Error analyzing data: {str(e)}"

if __name__ == "__main__":
    print("\n--- SmartRupee AI Analytics Mock ---")
    insight = analyze_student_spending()
    print(f">> INSIGHT: {insight}")
    print("------------------------------------\n")
