export interface Student {
  name: string;
  college: string;
  year: string;
  major: string;
}

export interface Wallet {
  total: number;
  locked: number;
  available: number;
}

export interface Transaction {
  id: number;
  sender: string;
  senderInitials: string;
  amount: number;
  status: 'locked' | 'unlocked' | 'spent';
  condition: string;
  unlockTrigger: string;
  date: string;
}

export interface Spending {
  academic: number;
  food: number;
  transport: number;
  other: number;
}

export interface Insight {
  type: 'positive' | 'warning' | 'critical';
  title: string;
  desc: string;
}

export interface Request {
  id: number;
  amount: number;
  purpose: string;
  note: string;
  urgency: 'normal' | 'this-week' | 'urgent';
  proof: string;
}

export interface MockData {
  student: Student;
  wallet: Wallet;
  transactions: Transaction[];
  spending: Spending;
  insights: Insight[];
  requests: Request[];
}

export const mockData: MockData = {
  student: { name: "Priya Kumar", college: "IIT Madras", year: "2nd Year", major: "Computer Science" },
  wallet: { total: 15000, locked: 8500, available: 6500 },
  transactions: [
    { id: 1, sender: "Rajesh Kumar", senderInitials: "RK", amount: 10000, status: "locked", condition: "Academic Only", unlockTrigger: "Upload mid-semester marksheet", date: "2 hours ago" },
    { id: 2, sender: "IIT Madras Scholarship", senderInitials: "IM", amount: 5000, status: "unlocked", condition: "Food & Academic", unlockTrigger: "Attendance uploaded", date: "3 days ago" },
    { id: 3, sender: "Rajesh Kumar", senderInitials: "RK", amount: 3000, status: "spent", condition: "Food Only", unlockTrigger: "Date: Oct 1", date: "1 week ago" }
  ],
  spending: { academic: 2400, food: 1800, transport: 800, other: 400 },
  insights: [
    { type: "positive", title: "Ahead of budget 🎉", desc: "You have spent ₹600 less on food than last week. Great discipline!" },
    { type: "warning", title: "Transport spike ⚠️", desc: "Transport spending is up ₹300 this week. Consider carpooling." },
    { type: "critical", title: "Academic budget low 🔴", desc: "Only ₹600 remaining in your academic allowance for this month." }
  ],
  requests: [
    { id: 1, amount: 2000, purpose: "Academic Supplies", note: "Need to buy Data Structures textbook before Monday exam.", urgency: "urgent", proof: "Receipt within 3 days" },
  ]
};

export const aiResponses = [
  "Based on your spending, you have ₹6,500 available this week. Your academic budget has ₹600 remaining — spend carefully!",
  "You are doing well on food this week — ₹200 under your usual average. Keep it up!",
  "A trip to Manali would cost roughly ₹4,000–₹6,000. At your current savings rate you could afford it in 3 weeks.",
  "Your biggest spend this month was academic at ₹2,400. This is within your condition limit — all good!",
  "I recommend keeping at least ₹2,000 as an emergency buffer before your next transfer arrives."
];
