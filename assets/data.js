// Data Model for SmartRupee Parent Portal
const MOCK_PARENTS = [
  {
    parentId: "PARENT-001",
    parentName: "Mr. Sharma",
    email: "sharma@example.com",
    password: "demo123",
    wards: [
      {
        studentName: "Aarav Sharma",
        studentId: "101",
        grade: "8-B",
        school: "St. Xavier's High",
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav%20Sharma',
        walletId: 'W001'
      },
      {
        studentName: "Ananya Sharma",
        studentId: "103",
        grade: "5-A",
        school: "St. Xavier's High",
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya%20Sharma',
        walletId: 'W002'
      }
    ]
  }
];

const INITIAL_WALLETS = {
  'W001': { spendable: 1250.50, locked: 500.00, allowedCategories: ['Education', 'Food'] },
  'W002': { spendable: 850.00, locked: 200.00, allowedCategories: ['Books', 'Stationery'] }
};

const INITIAL_TRANSACTIONS = [
  { id: 'T001', studentId: '101', amount: 250.00, category: 'Food', status: 'spent', date: '2023-10-25T14:30:00Z', purpose: 'Lunch at Canteen' },
  { id: 'T002', studentId: '103', amount: 500.00, category: 'Education', status: 'locked', date: '2023-10-26T09:15:00Z', purpose: 'Exam Fees' },
  { id: 'T003', studentId: '101', amount: 120.00, category: 'Stationery', status: 'blocked', date: '2023-10-26T11:45:00Z', purpose: 'Gaming Store' },
  { id: 'T005', studentId: '101', amount: 300.00, category: 'Food', status: 'locked', date: '2023-10-27T08:00:00Z', purpose: 'Weekly Meal Plan' }
];

// Initialize localStorage if empty
if (!localStorage.getItem('parents')) {
  localStorage.setItem('parents', JSON.stringify(MOCK_PARENTS));
}
if (!localStorage.getItem('smartrupee_wallets')) {
  localStorage.setItem('smartrupee_wallets', JSON.stringify(INITIAL_WALLETS));
}
if (!localStorage.getItem('smartrupee_transactions')) {
  localStorage.setItem('smartrupee_transactions', JSON.stringify(INITIAL_TRANSACTIONS));
}

// Data access functions
window.SmartRupeeData = {
  getParents: () => JSON.parse(localStorage.getItem('parents')),
  
  // Compatibility layer for index.html and others
  getStudents: () => {
    const parent = window.SmartRupeeData.getLoggedInParent();
    if (!parent) return [];
    return parent.wards.map(w => ({
        id: w.studentId,
        name: w.studentName,
        avatar: w.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${w.studentName}`,
        walletId: w.walletId || `W${w.studentId}`
    }));
  },
  
  getWallets: () => JSON.parse(localStorage.getItem('smartrupee_wallets')),
  getTransactions: () => JSON.parse(localStorage.getItem('smartrupee_transactions')),
  
  getLoggedInParent: () => JSON.parse(localStorage.getItem('loggedInParent')),
  getSelectedStudent: () => {
    const ward = JSON.parse(localStorage.getItem('selectedWard'));
    if (!ward) return null;
    return {
        id: ward.studentId,
        name: ward.studentName,
        avatar: ward.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${ward.studentName}`,
        walletId: ward.walletId || `W${ward.studentId}`
    };
  },
  
  setLoggedInParent: (parent) => localStorage.setItem('loggedInParent', JSON.stringify(parent)),
  setSelectedStudent: (student) => {
    // Map back to ward structure if needed, but usually we just save the student object
    const ward = {
        studentId: student.id,
        studentName: student.name,
        avatar: student.avatar,
        walletId: student.walletId
    };
    localStorage.setItem('selectedWard', JSON.stringify(ward));
  },
  
  logout: () => {
    localStorage.removeItem('loggedInParent');
    localStorage.removeItem('selectedWard');
  },
  
  addTransaction: (transaction) => {
    const transactions = JSON.parse(localStorage.getItem('smartrupee_transactions')) || [];
    const newTransaction = {
      id: 'T' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
      date: new Date().toISOString(),
      ...transaction
    };
    transactions.unshift(newTransaction);
    localStorage.setItem('smartrupee_transactions', JSON.stringify(transactions));
    return newTransaction;
  },
  
  updateTransactionStatus: (id, status) => {
    const transactions = JSON.parse(localStorage.getItem('smartrupee_transactions')) || [];
    const index = transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      transactions[index].status = status;
      localStorage.setItem('smartrupee_transactions', JSON.stringify(transactions));
    }
  },
  
  getStudentById: (id) => {
    const students = window.SmartRupeeData.getStudents();
    return students.find(s => s.id === id);
  },
  
  getWalletByStudentId: (studentId) => {
    const student = window.SmartRupeeData.getStudentById(studentId);
    if (!student) return null;
    const wallets = JSON.parse(localStorage.getItem('smartrupee_wallets')) || {};
    return wallets[student.walletId];
  }
};
