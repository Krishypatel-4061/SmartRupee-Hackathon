/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { aiResponses, Transaction, Insight, mockData } from './types';
import { api } from './api';

// --- Components ---

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'warning' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500'
  };

  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 20, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className={`fixed top-0 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full text-white font-bold shadow-lg ${bgColors[type]}`}
    >
      {message}
    </motion.div>
  );
};

const LoadingOverlay = () => (
  <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center backdrop-blur-sm">
    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-rotate"></div>
  </div>
);

// --- Main App ---

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'login' | 'signup' | 'onboarding' | 'home' | 'history' | 'upload' | 'ai' | 'detail' | 'request' | 'parent' | 'scanner'>('login');
  const [user, setUser] = useState<{ email: string, name: string, role: 'student' | 'parent' } | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'warning' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'All' | 'Locked' | 'Unlocked' | 'Spent'>('All');
  const [currentScanMode, setCurrentScanMode] = useState<'approved' | 'blocked'>('approved');

  // ── LIVE DATA STATE ──────────────────────────────────────────────────────
  const [walletData, setWalletData] = useState<{
    name: string; college_name: string; year: string; major: string;
    wallet_id: number; total_balance: number; available_balance: number; locked_balance: number;
  } | null>(null);
  const [liveTransactions, setLiveTransactions] = useState<any[]>([]);
  const [liveLocks, setLiveLocks] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<{
    breakdown: Record<string, number>; total_spent: number; total_received: number;
    blocked_count: number; compliance_rate: number;
  } | null>(null);
  const [liveVerifications, setLiveVerifications] = useState<any[]>([]);
  const [livePaymentRequests, setLivePaymentRequests] = useState<any[]>([]);

  // ── Load all dashboard data from API ─────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    const studentId = Number(localStorage.getItem("user_id") || "3");
    try {
      const [wallet, txns, locks, analytics, verifs, payReqs] = await Promise.allSettled([
        api.getWallet(studentId),
        api.getTransactions(studentId),
        api.getLocks(studentId),
        api.getAnalytics(studentId),
        api.getVerifications(studentId),
        api.getPaymentRequests(studentId),
      ]);
      if (wallet.status === 'fulfilled') setWalletData(wallet.value);
      if (txns.status === 'fulfilled') setLiveTransactions(txns.value);
      if (locks.status === 'fulfilled') setLiveLocks(locks.value);
      if (analytics.status === 'fulfilled') setAnalyticsData(analytics.value);
      if (verifs.status === 'fulfilled') setLiveVerifications(verifs.value);
      if (payReqs.status === 'fulfilled') setLivePaymentRequests(payReqs.value);
    } catch (e) {
      console.warn('API unavailable, using mockData fallback', e);
    }
  }, []);

  // ── Session Persistence: Restore user on mount ─────────────────────────
  useEffect(() => {
    const savedUserId = localStorage.getItem("user_id");
    const savedUser = localStorage.getItem("user_info");
    if (savedUserId && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setCurrentScreen('home');
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
  }, []);

  // Refresh data when user is set (i.e. after login or on mount)
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, loadDashboardData]);

  // ── Adapter: map API locks to the shape the UI expects ────────
  const mappedTransactions: Transaction[] = liveLocks.length > 0
    ? liveLocks.map((lk: any, idx: number) => ({
      id: lk.lock_id ?? idx,
      sender: lk.sender_name || 'Unknown',
      senderInitials: (lk.sender_name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
      amount: lk.amount,
      status: lk.status === 'Active' ? 'locked' as const
        : lk.status === 'Unlocked' ? 'unlocked' as const
          : 'spent' as const,
      condition: lk.allowed_category || 'Unrestricted',
      unlockTrigger: lk.rule_type === 'Document_Unlock' ? 'Upload proof document' : (lk.rule_type || ''),
      date: lk.created_at ? new Date(lk.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent',
    }))
    : (mockData?.transactions || []);

  const mappedHistoryTransactions = liveTransactions.length > 0
    ? liveTransactions.map((tx: any, idx: number) => {
      let mappedStatus = 'spent';
      if (tx.status === 'locked' || tx.status === 'pending') {
        mappedStatus = 'locked';
      } else if (tx.status === 'blocked' || tx.status === 'blocked_by_smartrule' || tx.status === 'failed' || tx.status === 'rejected') {
        mappedStatus = 'locked'; // Visual fallback for locked/blocked
      } else if (tx.status === 'unlocked') {
        mappedStatus = 'unlocked';
      }
      return {
        id: tx.id ?? idx,
        sender: tx.purpose || 'Unknown',
        senderInitials: (tx.purpose || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        amount: tx.amount,
        status: mappedStatus as 'locked' | 'unlocked' | 'spent',
        condition: tx.category || 'General',
        unlockTrigger: tx.tx_type || 'Transfer',
        date: tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recent',
        originalStatus: tx.status
      };
    })
    : mappedTransactions;

  // Navigation helper
  const navigate = (screen: any, data: any = null) => {
    if (data) setSelectedTransaction(data);
    setCurrentScreen(screen);
    window.scrollTo(0, 0);
  };

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const simulateLoading = (callback: () => void) => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      callback();
    }, 1200);
  };

  // --- Screen Components ---

  const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const validateEmail = (val: string) => {
      if (!val.includes('@')) {
        setEmailError('Please enter a valid email');
      } else {
        setEmailError('');
      }
    };

    const validatePassword = (val: string) => {
      if (val.length < 6) {
        setPasswordError('Password must be at least 6 characters.');
      } else {
        setPasswordError('');
      }
    };

    // Helper functions for data mapping and formatting
    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const mapLockStatus = (status: string) => {
      switch (status) {
        case 'Active': return 'locked';
        case 'Unlocked': return 'unlocked';
        case 'Blocked_by_SmartRule': return 'locked';
        default: return 'spent'; // Assuming 'spent' for other statuses
      }
    };
    const formatDate = (dateString: string) => {
      if (!dateString) return 'Recent';
      return new Date(dateString).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    // EDITED: Real Backend Login Integration
    const handleLogin = async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!email || !password || emailError || passwordError) return;

      setIsLoggingIn(true);

      try {
        const data = await api.login(email, password);
        setIsSuccess(true);
        setTimeout(() => {
          localStorage.setItem("user_id", String(data.user_id));
          const userInfo = {
            email: email,
            name: data.name || "Student",
            role: (data.role as any) || "student"
          };
          localStorage.setItem("user_info", JSON.stringify(userInfo));
          setUser(userInfo);
          navigate('home');
        }, 500);
      } catch (err: any) {
        setIsLoggingIn(false);
        setIsShaking(true);
        showToast(err.message || "Invalid email or password", "error");
        setTimeout(() => setIsShaking(false), 1200);
      }
    };

    const handleDemoLogin = () => {
      setEmail("priya@iitm.ac.in");
      setPassword("demo123");
      setEmailError('');
      setPasswordError('');
      setTimeout(() => {
        setIsLoggingIn(true);
        setTimeout(() => {
          setIsSuccess(true);
          setTimeout(() => {
            localStorage.setItem("user_id", "4");
            setUser({ email: "priya@iitm.ac.in", name: "Priya Sharma", role: "student" });
            navigate('home');
          }, 500);
        }, 1200);
      }, 500);
    };

    const handleGoogleLogin = () => {
      setIsLoggingIn(true);
      setTimeout(() => {
        setIsSuccess(true);
        setTimeout(() => {
          localStorage.setItem("user_id", "4");
          setUser({ email: "priya@iitm.ac.in", name: "Priya Sharma", role: "student" });
          navigate('home');
        }, 500);
      }, 1200);
    };

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="min-h-screen bg-background-dark flex flex-col"
      >
        <div className="relative h-1/2 flex flex-col items-center justify-center px-6 overflow-hidden">
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[150%] h-[150%] bg-[radial-gradient(circle_at_center,rgba(124,59,237,0.3)_0%,transparent_60%)] pointer-events-none"></div>
          <div className="z-10 flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(124,59,237,0.4)]"
            >
              <span className="material-symbols-outlined text-white text-5xl">currency_rupee</span>
            </motion.div>
            <h1 className="text-white text-4xl font-black tracking-tight mt-2">SmartRupee</h1>
            <p className="text-[#94A3B8] text-sm font-medium">Every rupee, a contract.</p>
          </div>
          <div className="z-10 flex flex-wrap justify-center gap-2 mt-8">
            <div className="px-3 py-1.5 bg-primary/20 border border-primary/30 rounded-full flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-primary">lock</span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Programmable Money</span>
            </div>
            <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px] text-slate-300">auto_awesome</span>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">AI Powered</span>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ y: '100%' }} animate={{ y: 0 }}
          className="flex-1 bg-card-dark rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] relative z-20 border-t border-primary/20 flex flex-col p-8 -mt-10"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-700 rounded-full mt-3"></div>
          <div className="mt-4 mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Welcome, Student</h2>
            <p className="text-[#94A3B8] text-sm">Sign in to access your smart wallet</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 ml-1">College Email</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] text-xl">mail</span>
                <input
                  className={`w-full bg-[#1E1B4B] border-none rounded-[14px] py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:ring-2 transition-all ${emailError ? 'ring-2 ring-red-500' : 'focus:ring-primary/50'}`}
                  placeholder="student@university.edu"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => validateEmail(e.target.value)}
                />
              </div>
              <AnimatePresence>
                {emailError && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-500 text-[12px] ml-1">{emailError}</motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 ml-1">Password</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] text-xl">lock</span>
                <input
                  className={`w-full bg-[#1E1B4B] border-none rounded-[14px] py-4 pl-12 pr-12 text-white placeholder:text-slate-600 focus:ring-2 transition-all ${passwordError ? 'ring-2 ring-red-500' : 'focus:ring-primary/50'}`}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={(e) => validatePassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-primary"
                >
                  <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
              <AnimatePresence>
                {passwordError && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-500 text-[12px] ml-1">{passwordError}</motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="flex justify-end">
              <button type="button" className="text-sm font-semibold text-primary hover:underline">Forgot Password?</button>
            </div>

            <button
              disabled={isLoggingIn || isSuccess}
              className={`w-full py-4 rounded-2xl text-white font-bold text-lg shadow-lg transition-all active:scale-[0.98] mt-4 flex items-center justify-center ${isShaking ? 'animate-shake ring-2 ring-red-500' : ''} ${isSuccess ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-[#a855f7]'}`}
            >
              {isLoggingIn ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-rotate"></div>
              ) : isSuccess ? (
                <span className="material-symbols-outlined text-white text-2xl">check</span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="flex items-center my-8">
            <div className="flex-1 h-[1px] bg-slate-800"></div>
            <span className="px-4 text-xs font-medium text-slate-500 uppercase tracking-widest">or continue with</span>
            <div className="flex-1 h-[1px] bg-slate-800"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-[#1E1B4B] border border-slate-800 py-3.5 rounded-2xl text-slate-100 font-semibold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all mb-8"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M12 5.04c1.65 0 3.14.57 4.31 1.68l3.23-3.23C17.58 1.64 15 0 12 0 7.31 0 3.26 2.69 1.17 6.64l3.78 2.93C5.9 7.02 8.71 5.04 12 5.04z" fill="#EA4335"></path>
              <path d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.31h6.44c-.28 1.48-1.11 2.73-2.37 3.58l3.7 2.87c2.16-2 3.72-4.94 3.72-8.49z" fill="#4285F4"></path>
              <path d="M5.1 14.74c-.26-.79-.41-1.63-.41-2.5s.15-1.71.41-2.5L1.32 6.81C.48 8.44 0 10.22 0 12s.48 3.56 1.32 5.19l3.78-2.45z" fill="#FBBC05"></path>
              <path d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.7-2.87c-1.04.7-2.37 1.12-4.25 1.12-3.29 0-6.1-2.21-7.09-5.19l-3.78 2.45C3.26 21.31 7.31 24 12 24z" fill="#34A853"></path>
            </svg>
            Continue with Google
          </button>

          <div className="mt-auto text-center space-y-6 pb-4">
            <p className="text-sm font-medium text-slate-400">
              Don't have an account? <button onClick={() => navigate('signup')} className="text-primary font-bold hover:underline">Sign Up</button>
            </p>
            <button
              onClick={handleDemoLogin}
              className="mx-auto px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[#94A3B8] text-[12px] font-medium hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              Tap to demo login instantly
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  const SignUp = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [college, setCollege] = useState('');
    const [password, setPassword] = useState('');
    const [year, setYear] = useState('1st');
    const [isCreating, setIsCreating] = useState(false);

    const handleCreateAccount = () => {
      if (!name || !email || !college || !password || !year) {
        showToast("Please fill all fields", "warning");
        return;
      }
      setIsCreating(true);
      setTimeout(() => {
        setIsCreating(false);
        navigate('onboarding');
      }, 1200);
    };

    return (
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        className="min-h-screen bg-background-dark flex flex-col justify-end relative"
      >
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="px-8 pb-10 pt-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="text-primary">
              <span className="material-symbols-outlined text-4xl">currency_rupee</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">SmartRupee</h1>
          </div>
        </div>

        <div className="bg-card-dark rounded-t-[32px] w-full flex-grow flex flex-col p-8 border-t border-primary/10">
          <div className="w-12 h-1.5 bg-slate-700/50 rounded-full mx-auto mb-8"></div>
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2 leading-tight">Create Student Account</h2>
            <p className="text-slate-400 text-sm">Set up your smart wallet in 60 seconds</p>
          </div>

          <div className="space-y-6 mb-10">
            <div className="space-y-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">person</span>
                <input
                  className="w-full h-14 bg-[#1E1B4B] border-none rounded-xl pl-12 pr-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary transition-all"
                  placeholder="Full Name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">mail</span>
                <input
                  className="w-full h-14 bg-[#1E1B4B] border-none rounded-xl pl-12 pr-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary transition-all"
                  placeholder="College Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">school</span>
                <input
                  className="w-full h-14 bg-[#1E1B4B] border-none rounded-xl pl-12 pr-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary transition-all"
                  placeholder="College Name"
                  type="text"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                />
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">lock</span>
                <input
                  className="w-full h-14 bg-[#1E1B4B] border-none rounded-xl pl-12 pr-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-primary transition-all"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-white text-sm font-semibold mb-3">Current Year</p>
              <div className="flex justify-between gap-3">
                {['1st', '2nd', '3rd', '4th'].map(y => (
                  <button
                    key={y}
                    onClick={() => setYear(y)}
                    className={`flex-1 py-2.5 rounded-full text-sm font-bold border transition-all ${year === y ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-[#1E1B4B] text-slate-400 border-transparent'}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateAccount}
            disabled={isCreating}
            className="w-full h-14 bg-gradient-to-r from-primary to-[#a855f7] rounded-full text-white font-bold text-lg shadow-lg shadow-primary/20 hover:opacity-90 transition-all mb-8 flex items-center justify-center"
          >
            {isCreating ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-rotate"></div>
            ) : (
              "Create Account"
            )}
          </button>

          <div className="mt-auto text-center">
            <p className="text-slate-400 text-sm">
              Already have an account? <button onClick={() => navigate('login')} className="text-primary font-bold hover:underline">Sign In</button>
            </p>
          </div>
        </div>
      </motion.div>
    );
  };

  const Onboarding = () => {
    const [isActivating, setIsActivating] = useState(false);

    const handleActivate = () => {
      setIsActivating(true);
      setTimeout(() => {
        setIsActivating(false);
        setUser({ email: "priya@iitm.ac.in", name: "Priya Kumar", role: "student" });
        navigate('home');
      }, 1200);
    };

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="min-h-screen bg-background-dark flex flex-col relative overflow-hidden"
      >
        <header className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-white">
            <span className="material-symbols-outlined text-primary text-3xl">account_balance_wallet</span>
            <h2 className="text-slate-100 text-lg font-bold">SmartRupee</h2>
          </div>
          <div className="size-10 rounded-full border-2 border-primary/30 p-0.5">
            <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">person</span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 flex flex-col items-center pt-8">
          <div className="mb-6">
            <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
              <div className="size-16 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
                <span className="material-symbols-outlined text-white text-4xl">check_circle</span>
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-slate-100 text-[28px] font-extrabold leading-tight mb-2">You are in! 🎉</h1>
            <p className="text-slate-400 text-base font-normal px-4">Complete your profile to activate your wallet.</p>
          </div>

          <div className="w-full bg-card-dark rounded-2xl p-6 border border-primary/10 mb-8 shadow-[0_0_20px_0_rgba(124,59,237,0.15)]">
            <div className="flex flex-col items-center mb-6">
              <div className="size-20 rounded-full bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center text-white text-2xl font-bold mb-3">
                PK
              </div>
              <h3 className="text-slate-100 text-xl font-bold">Priya Kumar</h3>
              <p className="text-slate-400 text-sm">priya.kumar@university.edu</p>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Major</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl">school</span>
                  <input className="w-full bg-background-dark border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-slate-100 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-slate-600" placeholder="Computer Science" type="text" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Student ID</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xl">badge</span>
                  <input className="w-full bg-background-dark border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-slate-100 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-slate-600" placeholder="STU-2024-889" type="text" />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleActivate}
            disabled={isActivating}
            className="w-full bg-gradient-to-r from-primary to-[#9333ea] hover:opacity-90 transition-all text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 group shadow-lg shadow-primary/20"
          >
            {isActivating ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-rotate"></div>
            ) : (
              <>
                Activate My Wallet
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_forward</span>
              </>
            )}
          </button>

          <div className="mt-auto pb-8">
            <button onClick={() => navigate('home')} className="text-slate-400 hover:text-slate-300 text-sm font-medium underline underline-offset-4">Skip for now</button>
          </div>
        </main>

        <div className="absolute -top-24 -left-24 size-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-24 -right-24 size-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
      </motion.div>
    );
  };

  const TransactionDetail = ({ tx, ...props }: { tx: Transaction, [key: string]: any }) => {
    const [timelineStep, setTimelineStep] = useState(0);
    const [showBlocked, setShowBlocked] = useState(false);

    useEffect(() => {
      const timer1 = setTimeout(() => setTimelineStep(1), 300);
      const timer2 = setTimeout(() => setTimelineStep(2), 600);
      const timer3 = setTimeout(() => setTimelineStep(3), 900);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }, []);

    const handleSpendSimulation = () => {
      const category = prompt("Enter merchant category (e.g. Academic, Food, Shopping):");
      if (!category) return;

      simulateLoading(() => {
        const isAllowed = tx.condition.toLowerCase().includes(category.toLowerCase());
        if (isAllowed) {
          showToast("✓ Spend approved.", "success");
        } else {
          setShowBlocked(true);
        }
      });
    };

    return (
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-0 z-50 bg-background-dark flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5">
          <button onClick={() => navigate('home')} className="flex items-center justify-center size-10 rounded-full bg-card-dark text-slate-100 btn-press">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight">Transfer Details</h1>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 px-6 pb-32 overflow-y-auto">
          <div className={`mt-4 p-6 rounded-lg bg-card-dark border flex flex-col gap-4 relative overflow-hidden ${tx.status === 'locked' ? 'border-red-900/30' : 'border-emerald-900/30'
            }`}>
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl text-red-500">{tx.status === 'locked' ? 'lock' : 'lock_open'}</span>
            </div>
            <div className={`flex items-center gap-2 ${tx.status === 'locked' ? 'text-red-500' : 'text-emerald-500'}`}>
              <span className="material-symbols-outlined text-xl">{tx.status === 'locked' ? 'lock' : 'lock_open'}</span>
              <span className="text-xs font-bold uppercase tracking-widest">Programmable Hold</span>
            </div>
            <div>
              <h2 className="text-4xl font-bold text-white capitalize">{tx.status}</h2>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                This money can only be spent on: <span className="text-slate-100 font-medium">{tx.condition}</span>
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">Amount</span>
              <span className="text-white font-semibold text-lg">₹{tx.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">Sent By</span>
              <span className="text-white font-medium">{tx.sender}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">Date</span>
              <span className="text-white font-medium">{tx.date}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">Condition</span>
              <span className="text-white font-medium">{tx.condition}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">Unlock Trigger</span>
              <span className="text-white font-medium">{tx.unlockTrigger}</span>
            </div>
          </div>

          <div className="mt-10">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-6">Status Timeline</h3>
            <div className="relative space-y-8 ml-2">
              <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-800"></div>

              <motion.div
                initial={{ opacity: 0, x: -20 }} animate={timelineStep >= 1 ? { opacity: 1, x: 0 } : {}}
                className="relative flex items-start gap-4"
              >
                <div className="z-10 flex items-center justify-center size-6 rounded-full bg-green-500 text-white">
                  <span className="material-symbols-outlined text-sm">check</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-medium text-sm">Transfer Sent</span>
                  <span className="text-slate-500 text-xs">{tx.date}</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }} animate={timelineStep >= 2 ? { opacity: 1, x: 0 } : {}}
                className="relative flex items-start gap-4"
              >
                <div className={`z-10 flex items-center justify-center size-6 rounded-full ${tx.status === 'locked' ? 'bg-primary/20' : 'bg-green-500'}`}>
                  {tx.status === 'locked' ? <div className="size-3 rounded-full bg-primary pulse-dot"></div> : <span className="material-symbols-outlined text-sm text-white">check</span>}
                </div>
                <div className="flex flex-col">
                  <span className={`${tx.status === 'locked' ? 'text-primary font-bold' : 'text-white font-medium'} text-sm`}>
                    {tx.status === 'locked' ? 'Awaiting Proof Upload' : 'Proof Verified'}
                  </span>
                  <span className="text-slate-400 text-xs mt-1">{tx.unlockTrigger}</span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }} animate={timelineStep >= 3 ? { opacity: 1, x: 0 } : {}}
                className={`relative flex items-start gap-4 ${tx.status === 'locked' ? 'opacity-50' : ''}`}
              >
                <div className={`z-10 flex items-center justify-center size-6 rounded-full ${tx.status === 'unlocked' ? 'bg-primary/20' : 'bg-slate-800'}`}>
                  {tx.status === 'unlocked' ? <div className="size-3 rounded-full bg-primary pulse-dot"></div> : <div className="size-2 rounded-full bg-slate-600"></div>}
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-100 font-medium text-sm">Funds Unlocked</span>
                  <span className="text-slate-500 text-xs">{tx.status === 'unlocked' ? 'Available for spending' : 'Pending verification'}</span>
                </div>
              </motion.div>
            </div>
          </div>
        </main>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background-dark via-background-dark to-transparent">
          {tx.status === 'locked' ? (
            <button
              onClick={() => navigate('upload')}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all btn-press"
            >
              Upload Proof Document
            </button>
          ) : tx.status === 'unlocked' ? (
            <button
              onClick={handleSpendSimulation}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all btn-press"
            >
              Simulate Spend
            </button>
          ) : null}
        </div>

        <AnimatePresence>
          {showBlocked && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed inset-0 z-[120] bg-red-600 flex flex-col items-center justify-center p-8 text-center"
            >
              <span className="material-symbols-outlined text-[120px] text-white mb-6">lock</span>
              <h2 className="text-4xl font-black text-white mb-4 uppercase tracking-tight">Transaction Blocked</h2>
              <p className="text-white/90 text-lg mb-12 max-w-xs">
                This merchant is outside your allowed condition: <span className="font-bold">{tx.condition}</span>
              </p>
              <button
                onClick={() => setShowBlocked(false)}
                className="bg-white text-red-600 font-black px-12 py-4 rounded-full text-lg btn-press"
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const History = () => {
    const filteredTransactions = mappedHistoryTransactions.filter(tx => {
      if (historyFilter === 'All') return true;
      return tx.status === historyFilter.toLowerCase();
    });

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex flex-col min-h-screen pb-32"
      >
        <header className="pt-12 px-6 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">History</h1>
        </header>

        <div className="flex gap-2 px-6 overflow-x-auto no-scrollbar pb-4">
          {['All', 'Locked', 'Unlocked', 'Spent'].map(filter => (
            <button
              key={filter}
              onClick={() => setHistoryFilter(filter as any)}
              className={`flex items-center justify-center px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all btn-press ${historyFilter === filter ? 'bg-primary text-white' : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="flex-1 px-6 pt-4">
          <h3 className="text-[10px] font-bold tracking-[0.1em] text-slate-500 dark:text-slate-400 uppercase mb-4">THIS MONTH</h3>
          <div className="flex flex-col">
            {filteredTransactions.map(tx => (
              <div
                key={tx.id}
                onClick={() => navigate('detail', tx)}
                className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-white/5 card-hover"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.status === 'locked' ? 'bg-primary/20 text-primary' :
                    tx.status === 'unlocked' ? 'bg-emerald-500/20 text-emerald-500' :
                      'bg-rose-500/20 text-rose-500'
                    }`}>
                    <span className="material-symbols-outlined">{
                      tx.status === 'locked' ? 'lock' :
                        tx.status === 'unlocked' ? 'lock_open' :
                          'shopping_cart'
                    }</span>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-sm font-semibold dark:text-slate-100">{tx.sender}</p>
                    <p className="text-xs text-slate-500">{tx.date}</p>
                  </div>
                </div>
                <p className="text-sm font-bold dark:text-white">{tx.status === 'spent' ? '-' : '+'}₹{tx.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 w-full z-10">
          <div className="mx-4 mb-4 p-4 bg-surface-dark dark:bg-surface rounded-xl flex items-center justify-between shadow-lg border border-white/5">
            <div className="flex flex-col">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Received</p>
              <p className="text-sm font-bold text-white">₹{(walletData?.total_balance ?? mockData.wallet.total).toLocaleString()}</p>
            </div>
            <div className="h-8 w-[1px] bg-white/10"></div>
            <div className="flex flex-col text-right">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Spent</p>
              <p className="text-sm font-bold text-white">₹{(analyticsData?.total_spent ?? mockData.wallet.total - mockData.wallet.available).toLocaleString()}</p>
            </div>
          </div>
          <nav className="bg-white dark:bg-surface/95 backdrop-blur-md px-6 py-4 flex items-center justify-between border-t border-slate-100 dark:border-white/5">
            <button onClick={() => navigate('home')} className="flex flex-col items-center gap-1 text-slate-400 btn-press">
              <span className="material-symbols-outlined">house</span>
              <span className="text-[10px] font-medium">Home</span>
            </button>
            <button onClick={() => navigate('home')} className="flex flex-col items-center gap-1 text-slate-400 btn-press">
              <span className="material-symbols-outlined">account_balance_wallet</span>
              <span className="text-[10px] font-medium">Wallet</span>
            </button>
            <button className="relative flex flex-col items-center gap-1 text-primary btn-press">
              <div className="absolute -top-1 w-8 h-8 bg-primary/20 rounded-full blur-sm"></div>
              <span className="material-symbols-outlined relative z-10 fill-1">history</span>
              <span className="text-[10px] font-bold">History</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-slate-400 btn-press">
              <span className="material-symbols-outlined">person</span>
              <span className="text-[10px] font-medium">Profile</span>
            </button>
          </nav>
        </div>
      </motion.div>
    );
  };

  const DocumentUpload = () => {
    const [file, setFile] = useState<{ name: string, size: string } | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploaded, setIsUploaded] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        setFile({
          name: selectedFile.name,
          size: (selectedFile.size / 1024 / 1024).toFixed(2) + ' MB'
        });

        // Simulate upload
        let progress = 0;
        const interval = setInterval(() => {
          progress += 5;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            setIsUploaded(true);
          }
        }, 100);
      }
    };

    const handleSubmit = async () => {
      setIsLoading(true);
      try {
        const studentId = Number(localStorage.getItem("user_id") || "1");
        // Use the first active lock & its sender as reviewer for demo
        const activeLock = liveLocks.find((l: any) => l.status === 'Active');
        if (activeLock && file) {
          await api.uploadDocument(studentId, {
            lock_id: activeLock.lock_id,
            document_name: file.name,
            reviewer_id: activeLock.sender_id || 1,
          });
        }
        setShowSuccess(true);
        showToast("Document submitted successfully!", "success");
        loadDashboardData(); // refresh data
      } catch (err: any) {
        showToast(err.message || "Upload failed", "error");
      } finally {
        setIsLoading(false);
      }
    };

    if (showSuccess) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="fixed inset-0 z-[130] bg-background-dark flex flex-col items-center justify-center p-8 text-center"
        >
          <div className="size-24 rounded-full bg-emerald-500 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-white text-5xl">check</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Document Submitted! 🎉</h2>
          <p className="text-slate-400 mb-12">Waiting for approval. You will be notified when it is reviewed.</p>
          <button
            onClick={() => navigate('home')}
            className="w-full bg-primary text-white font-bold py-4 rounded-xl btn-press"
          >
            Back to Home
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex flex-col min-h-screen"
      >
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-border-muted px-6 py-4 bg-background-dark/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-4 text-primary">
            <div className="size-8 flex items-center justify-center bg-primary/10 rounded-lg">
              <span className="material-symbols-outlined text-primary text-2xl">account_balance_wallet</span>
            </div>
            <h2 className="text-slate-100 text-xl font-bold leading-tight tracking-tight">SmartRupee</h2>
          </div>
          <button onClick={() => navigate('home')} className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center btn-press">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-slate-100 text-3xl font-black leading-tight tracking-tight">Upload Documents</h1>
            <p className="text-slate-400 text-base font-normal">Submit proof to unlock your funds</p>
          </div>

          <div className="rounded-xl bg-surface border border-primary/10 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 rounded-full w-fit">
                  <span className="material-symbols-outlined text-amber-500 text-sm">lock</span>
                  <span className="text-amber-500 text-xs font-bold uppercase tracking-wider">Locked Funds</span>
                </div>
                <div className="flex flex-col">
                  <p className="text-amber-500 text-3xl font-black">₹{selectedTransaction?.amount.toLocaleString() || '5,000'}</p>
                  <p className="text-slate-400 text-sm mt-1">Sender: <span className="text-slate-200 font-medium">{selectedTransaction?.sender || 'Dad'}</span></p>
                </div>
                <div className="mt-2 border-t border-slate-700/50 pt-3">
                  <p className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">Required Proof</p>
                  <p className="text-slate-100 text-base font-semibold">{selectedTransaction?.unlockTrigger || 'Mid-Semester Marksheet'}</p>
                </div>
              </div>
              <div className="h-20 w-20 bg-primary/20 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-4xl">description</span>
              </div>
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-6 rounded-xl border-2 border-dashed border-primary/30 bg-surface/50 px-6 py-12 hover:border-primary/60 transition-colors cursor-pointer group"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
            />

            {!file ? (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-primary text-4xl">cloud_upload</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-slate-100 text-lg font-bold text-center">Tap to upload or drag here</p>
                  <p className="text-slate-400 text-sm font-normal text-center">PDF, JPG, PNG — Max 10MB</p>
                </div>
                <button className="mt-2 flex min-w-[140px] items-center justify-center rounded-full h-11 px-6 bg-primary/20 border border-primary/40 text-primary text-sm font-bold">
                  Select Files
                </button>
              </>
            ) : (
              <div className="w-full space-y-4">
                <div className="flex items-center gap-4">
                  <div className="size-12 bg-primary/20 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">description</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-white font-bold truncate">{file.name}</p>
                    <p className="text-slate-400 text-xs">{file.size}</p>
                  </div>
                  {isUploaded && <span className="material-symbols-outlined text-emerald-500">check_circle</span>}
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-primary"
                  />
                </div>
                <p className="text-center text-sm font-medium text-slate-400">
                  {isUploaded ? 'Ready to submit' : `Uploading... ${uploadProgress}%`}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-slate-100 text-xl font-bold tracking-tight">Previous Uploads</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="size-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-green-500">picture_as_pdf</span>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-slate-100 text-sm font-bold">Fee Receipt.pdf</p>
                    <p className="text-slate-400 text-xs tracking-tight">Oct 12, 2023</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                  <span className="text-green-500 text-[10px] font-black uppercase">Approved ✓</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface rounded-xl border border-white/5">
                <div className="flex items-center gap-4">
                  <div className="size-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-500">image</span>
                  </div>
                  <div className="flex flex-col">
                    <p className="text-slate-100 text-sm font-bold">ID Card.jpg</p>
                    <p className="text-slate-400 text-xs tracking-tight">Today, 2:15 PM</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/20">
                  <span className="material-symbols-outlined text-amber-500 text-[14px] animate-rotate">refresh</span>
                  <span className="text-amber-500 text-[10px] font-black uppercase">Pending Review</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <div className="p-6 sticky bottom-0 bg-background-dark/80 backdrop-blur-md">
          <button
            disabled={!isUploaded}
            onClick={handleSubmit}
            className={`w-full h-14 font-bold rounded-xl transition-all flex items-center justify-center gap-2 btn-press ${isUploaded ? 'bg-primary text-white shadow-[0_0_20px_rgba(124,61,237,0.4)]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
          >
            <span>Submit for Verification</span>
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </motion.div>
    );
  };

  const PaymentRequestFlow = () => {
    const [step, setStep] = useState(1);
    const [amount, setAmount] = useState('');
    const [urgency, setUrgency] = useState('Medium');
    const [proofType, setProofType] = useState('Receipt');
    const [showSuccess, setShowSuccess] = useState(false);

    const handleNext = () => setStep(prev => prev + 1);
    const handleBack = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
      setIsLoading(true);
      try {
        const studentId = Number(localStorage.getItem("user_id") || "1");
        await api.createPaymentRequest(studentId, {
          receiver_id: 1, // default receiver (parent)
          amount: Number(amount),
          purpose: proofType,
          note: '',
          urgency: urgency.toLowerCase() === 'high' ? 'urgent' : urgency.toLowerCase() === 'medium' ? 'this_week' : 'normal',
          proof_plan: proofType.toLowerCase(),
        });
        setShowSuccess(true);
        showToast("Request sent to parent!", "success");
        loadDashboardData();
      } catch (err: any) {
        showToast(err.message || "Request failed", "error");
      } finally {
        setIsLoading(false);
      }
    };

    if (showSuccess) {
      return (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-[200] bg-background-dark flex flex-col items-center justify-center p-8 text-center"
        >
          <div className="size-24 rounded-full bg-primary flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(124,61,237,0.5)]">
            <span className="material-symbols-outlined text-white text-5xl">send</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Request Sent!</h2>
          <p className="text-slate-400 mb-12">Your parent has been notified. You'll get the funds once they approve.</p>
          <button
            onClick={() => navigate('home')}
            className="w-full bg-primary text-white font-bold py-4 rounded-xl btn-press"
          >
            Back to Dashboard
          </button>
        </motion.div>
      );
    }

    return (
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-0 z-[150] bg-background-dark flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <button onClick={step === 1 ? () => navigate('home') : handleBack} className="flex items-center justify-center size-10 rounded-full bg-card-dark text-slate-100 btn-press">
            <span className="material-symbols-outlined">{step === 1 ? 'close' : 'arrow_back'}</span>
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-sm font-bold tracking-tight text-white">Request Money</h1>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3].map(s => (
                <div key={s} className={`h-1 w-4 rounded-full ${s <= step ? 'bg-primary' : 'bg-slate-800'}`}></div>
              ))}
            </div>
          </div>
          <div className="size-10"></div>
        </header>

        <main className="flex-1 px-6 py-8 overflow-y-auto">
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">How much do you need?</h2>
                <p className="text-slate-400">Enter the amount for your request</p>
              </div>

              <div className="relative">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-4xl font-bold text-slate-500">₹</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent border-none text-6xl font-black text-white focus:ring-0 pl-8 placeholder:text-slate-800 tabular-nums"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {['500', '1000', '2000', '5000'].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className="px-6 py-2 rounded-full bg-card-dark border border-white/5 text-slate-300 font-bold text-sm hover:bg-primary/10 hover:border-primary/30 transition-all btn-press"
                  >
                    +₹{val}
                  </button>
                ))}
              </div>

              <div className="space-y-4 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Urgency</p>
                <div className="flex gap-3">
                  {['Low', 'Medium', 'High'].map(u => (
                    <button
                      key={u}
                      onClick={() => setUrgency(u)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all btn-press ${urgency === u ? 'bg-primary/20 border-primary text-primary' : 'bg-card-dark border-white/5 text-slate-500'
                        }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">What's it for?</h2>
                <p className="text-slate-400">Select a category and proof type</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'Receipt', icon: 'receipt_long', label: 'Bill/Receipt' },
                  { id: 'Marksheet', icon: 'school', label: 'Marksheet' },
                  { id: 'Attendance', icon: 'event_available', label: 'Attendance' },
                  { id: 'Other', icon: 'more_horiz', label: 'Other' }
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => setProofType(type.id)}
                    className={`p-6 rounded-2xl border flex flex-col items-center gap-3 transition-all btn-press ${proofType === type.id ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/5' : 'bg-card-dark border-white/5 text-slate-400'
                      }`}
                  >
                    <span className="material-symbols-outlined text-3xl">{type.icon}</span>
                    <span className="text-xs font-bold">{type.label}</span>
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex gap-4">
                <span className="material-symbols-outlined text-blue-500">info</span>
                <p className="text-xs text-blue-200 leading-relaxed">
                  Your parent will see this condition. Funds will be <span className="font-bold">locked</span> until you upload the {proofType.toLowerCase()}.
                </p>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Review Request</h2>
                <p className="text-slate-400">Double check the details</p>
              </div>

              <div className="bg-card-dark rounded-2xl p-6 border border-white/5 space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Amount</span>
                  <span className="text-white font-black text-2xl">₹{Number(amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Urgency</span>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${urgency === 'High' ? 'bg-red-500/20 text-red-500' : urgency === 'Medium' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                    }`}>{urgency}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Condition</span>
                  <span className="text-white font-medium">Unlock with {proofType}</span>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <p className="text-slate-400 text-xs mb-2">Recipient</p>
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">VS</div>
                    <span className="text-white font-bold">Ved Suvariya (You)</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </main>

        <div className="p-6">
          <button
            disabled={step === 1 && !amount}
            onClick={step === 3 ? handleSubmit : handleNext}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all btn-press ${(step === 1 && !amount) ? 'bg-slate-800 text-slate-500' : 'bg-primary shadow-lg shadow-primary/20'
              }`}
          >
            {step === 3 ? 'Send Request' : 'Next Step'}
          </button>
        </div>
      </motion.div>
    );
  };

  const ParentPortal = () => {
    const [requests, setRequests] = useState<any[]>(livePaymentRequests.length > 0 ? livePaymentRequests.map((r: any) => ({ ...r, id: String(r.request_id), status: r.status?.toLowerCase() || 'pending', category: r.purpose, condition: r.proof_plan, date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent' })) : (mockData?.requests || []).map(r => ({ ...r, id: String(r.id), status: 'pending', category: r.purpose, condition: r.proof, date: 'Today' })));
    const [showDeclineSheet, setShowDeclineSheet] = useState(false);
    const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

    const handleAction = (id: string, action: 'approved' | 'declined') => {
      simulateLoading(() => {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: action } : r));
        showToast(`Request ${action === 'approved' ? 'Approved' : 'Declined'}`, action === 'approved' ? 'success' : 'error');
        if (action === 'declined') setShowDeclineSheet(false);
      });
    };

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex flex-col min-h-screen bg-[#0F172A]"
      >
        <header className="px-6 pt-12 pb-6 flex justify-between items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-white truncate">Parent Portal</h1>
            <p className="text-slate-400 text-sm truncate">Managing {(walletData?.name || mockData?.student?.name || 'Student').split(' ')[0]}'s Wallet</p>
          </div>
          <button onClick={() => navigate('login')} className="size-10 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-white btn-press">
            <span className="material-symbols-outlined">logout</span>
          </button>
        </header>

        <main className="flex-1 px-6 space-y-6 overflow-y-auto pb-32">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <span className="material-symbols-outlined text-6xl text-white">shield</span>
            </div>
            <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mb-1">Current Balance</p>
            <h2 className="text-4xl font-black text-white tabular-nums">₹12,450</h2>
            <div className="mt-4 flex gap-4">
              <div className="flex flex-col">
                <span className="text-indigo-200 text-[10px] uppercase font-bold">Spent Today</span>
                <span className="text-white font-bold">₹420</span>
              </div>
              <div className="w-[1px] bg-white/10"></div>
              <div className="flex flex-col">
                <span className="text-indigo-200 text-[10px] uppercase font-bold">Locked Funds</span>
                <span className="text-white font-bold">₹5,000</span>
              </div>
            </div>
          </div>

          <section className="space-y-4">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest px-1">Pending Requests</h3>
            <div className="space-y-4">
              {requests.filter(r => r.status === 'pending').map(req => (
                <motion.div
                  key={req.id}
                  layoutId={req.id}
                  className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 space-y-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="size-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <span className="material-symbols-outlined text-3xl">payments</span>
                      </div>
                      <div>
                        <p className="text-white font-bold text-lg">₹{req.amount.toLocaleString()}</p>
                        <p className="text-slate-400 text-xs">{req.date} • {req.category}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${req.urgency === 'High' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
                      }`}>{req.urgency}</span>
                  </div>

                  <div className="bg-slate-900/50 rounded-xl p-3 flex items-center gap-3 border border-white/5">
                    <span className="material-symbols-outlined text-indigo-400 text-sm">lock</span>
                    <p className="text-xs text-slate-300">Condition: <span className="text-white font-medium">Unlock with {req.condition}</span></p>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button
                      onClick={() => handleAction(req.id, 'approved')}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl text-sm shadow-lg shadow-indigo-600/20 btn-press"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => { setSelectedReqId(req.id); setShowDeclineSheet(true); }}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl text-sm btn-press"
                    >
                      Decline
                    </button>
                  </div>
                </motion.div>
              ))}
              {requests.filter(r => r.status === 'pending').length === 0 && (
                <div className="py-12 flex flex-col items-center text-center opacity-40">
                  <span className="material-symbols-outlined text-6xl mb-4">task_alt</span>
                  <p className="text-white font-medium">All caught up!</p>
                  <p className="text-slate-400 text-xs">No pending requests to review.</p>
                </div>
              )}
            </div>
          </section>
        </main>

        <div className="fixed bottom-8 left-0 w-full px-6">
          <button className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-2xl shadow-indigo-500/40 flex items-center justify-center gap-3 btn-press relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform"></div>
            <span className="material-symbols-outlined">send</span>
            <span>SEND MONEY INSTANTLY</span>
          </button>
        </div>

        <AnimatePresence>
          {showDeclineSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowDeclineSheet(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                className="fixed bottom-0 left-0 w-full z-50 bg-slate-900 rounded-t-[2rem] p-6 pb-12 border-t border-white/10"
              >
                <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6"></div>
                <h3 className="text-xl font-bold text-white mb-6">Decline Request</h3>
                <div className="space-y-3">
                  {['Too expensive', 'Unnecessary category', 'Wait until next month', 'Other'].map(reason => (
                    <button
                      key={reason}
                      onClick={() => handleAction(selectedReqId!, 'declined')}
                      className="w-full p-4 bg-white/5 rounded-xl text-left text-slate-200 font-medium border border-white/5 hover:bg-white/10 transition-all btn-press"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const QRScanner = () => {
    const [scanState, setScanState] = useState<'idle' | 'scanning' | 'success' | 'blocked'>('scanning');
    const [amount, setAmount] = useState('800');

    useEffect(() => {
      const timer = setTimeout(() => {
        setScanState(currentScanMode);
        // Toggle for next scan
        setCurrentScanMode(prev => prev === 'approved' ? 'blocked' : 'approved');
      }, 2500);
      return () => clearTimeout(timer);
    }, []);

    const handleConfirmPayment = async () => {
      setIsLoading(true);
      try {
        const studentId = Number(localStorage.getItem("user_id") || "1");
        // For demo, we just pick the first available active lock that matches a common category or 'General'
        const activeLock = liveLocks.find((l: any) => l.status === 'Active') || { lock_id: 0 };

        await api.attemptSpend(studentId, {
          lock_id: activeLock.lock_id,
          merchant_name: "Academic Book Store",
          merchant_category: "Academic",
          amount: Number(amount)
        });

        showToast(`Payment of ₹${amount} confirmed ✓`, 'success');
        await loadDashboardData();
        navigate('home');
      } catch (err: any) {
        showToast(err.message || "Payment failed", "error");
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        className="fixed inset-0 z-[150] bg-background-dark flex flex-col"
      >
        <header className="flex items-center justify-between px-6 py-5 z-20">
          <button onClick={() => navigate('home')} className="size-10 rounded-full bg-white/10 flex items-center justify-center text-white btn-press">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-white text-lg font-bold">Scan to Pay</h1>
          <button className="size-10 rounded-full bg-white/10 flex items-center justify-center text-white btn-press">
            <span className="material-symbols-outlined">flash_on</span>
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center px-8 pt-12 relative">
          <div className="relative w-64 h-64 flex items-center justify-center">
            {/* Corner Brackets */}
            <motion.div
              animate={{
                borderColor: scanState === 'success' ? '#10b981' : scanState === 'blocked' ? '#ef4444' : '#7c3bed',
                scale: scanState === 'success' ? 1.1 : 1
              }}
              className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg transition-colors duration-500"
            />
            <motion.div
              animate={{
                borderColor: scanState === 'success' ? '#10b981' : scanState === 'blocked' ? '#ef4444' : '#7c3bed',
                scale: scanState === 'success' ? 1.1 : 1
              }}
              className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg transition-colors duration-500"
            />
            <motion.div
              animate={{
                borderColor: scanState === 'success' ? '#10b981' : scanState === 'blocked' ? '#ef4444' : '#7c3bed',
                scale: scanState === 'success' ? 1.1 : 1
              }}
              className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg transition-colors duration-500"
            />
            <motion.div
              animate={{
                borderColor: scanState === 'success' ? '#10b981' : scanState === 'blocked' ? '#ef4444' : '#7c3bed',
                scale: scanState === 'success' ? 1.1 : 1
              }}
              className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-lg transition-colors duration-500"
            />

            <div className="w-full h-full bg-slate-900/40 rounded-lg overflow-hidden relative">
              {scanState === 'scanning' && (
                <motion.div
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_15px_rgba(124,61,237,0.8)] z-10"
                />
              )}

              <div className="absolute inset-0 flex items-center justify-center">
                <AnimatePresence>
                  {scanState === 'scanning' && (
                    <motion.span
                      initial={{ opacity: 0 }} animate={{ opacity: 0.2 }} exit={{ opacity: 0 }}
                      className="material-symbols-outlined text-[120px] text-white"
                    >
                      qr_code_scanner
                    </motion.span>
                  )}
                  {scanState === 'success' && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="size-24 rounded-full bg-emerald-500/20 border-4 border-emerald-500 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-emerald-500 text-5xl font-bold">check</span>
                    </motion.div>
                  )}
                  {scanState === 'blocked' && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="size-24 rounded-full bg-red-500/20 border-4 border-red-500 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-red-500 text-5xl font-bold">close</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-slate-400 text-sm leading-relaxed px-4">
            Point your camera at the merchant's <span className="text-primary font-medium">SmartRupee</span> QR code.
          </p>

          <div className="mt-auto w-full pb-16">
            <button className="w-full h-14 border-2 border-primary/40 text-primary font-bold rounded-xl hover:bg-primary/10 transition-colors flex items-center justify-center gap-3 btn-press">
              <span className="material-symbols-outlined text-xl">keyboard</span>
              Enter Code Manually
            </button>
            <button
              onClick={() => setCurrentScanMode(prev => prev === 'approved' ? 'blocked' : 'approved')}
              className="w-full mt-8 text-[10px] text-slate-600 font-bold uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
            >
              Switch demo mode: {currentScanMode}
            </button>
          </div>
        </main>

        {/* Result Overlays */}
        <AnimatePresence>
          {scanState === 'success' && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 w-full bg-card-dark rounded-t-[2.5rem] p-6 pb-10 border-t border-emerald-500/20 shadow-[0_-10px_40px_rgba(16,185,129,0.1)] z-30"
            >
              <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-6"></div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Academic Book Store</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="px-2 py-0.5 bg-emerald-500/10 rounded-full flex items-center gap-1 border border-emerald-500/20">
                      <span className="material-symbols-outlined text-[14px] text-emerald-500">book</span>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Academic</span>
                    </div>
                    <span className="text-slate-400 text-xs flex items-center">
                      <span className="material-symbols-outlined text-[14px] mr-1">verified</span> Verified
                    </span>
                  </div>
                </div>
                <div className="size-14 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                  <span className="material-symbols-outlined text-slate-500">store</span>
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800 mb-6">
                <p className="text-[10px] font-medium text-slate-500 uppercase mb-2">Enter Amount</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-light text-slate-400">₹</span>
                  <input
                    className="bg-transparent border-none p-0 text-4xl font-bold text-white focus:ring-0 w-full tabular-nums"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={handleConfirmPayment}
                className="w-full h-14 bg-emerald-500 text-background-dark font-bold rounded-xl flex items-center justify-center gap-2 btn-press"
              >
                <span className="material-symbols-outlined">lock_open</span>
                Confirm Payment
              </button>
            </motion.div>
          )}

          {scanState === 'blocked' && (
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 w-full h-[70%] bg-[#1A0505] rounded-t-[2.5rem] p-8 border-t border-red-900/30 z-30 flex flex-col"
            >
              <div className="w-12 h-1 bg-red-900/50 rounded-full self-center mb-8"></div>
              <div className="flex flex-col items-center text-center mb-6">
                <div className="size-16 bg-red-600/20 rounded-full flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-red-500 text-3xl">lock</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-100">Payment Blocked 🔒</h1>
              </div>

              <div className="bg-background-dark/80 rounded-2xl p-6 mb-8 border border-slate-800">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">GameZone Café</h3>
                    <p className="text-slate-400 text-sm">Merchant ID: 4829-XJ</p>
                  </div>
                  <div className="flex items-center gap-1 bg-red-500/10 text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-500/20">
                    <span className="material-symbols-outlined text-[14px]">sports_esports</span>
                    Gaming
                  </div>
                </div>
                <div className="border-t border-slate-800 pt-4 mt-4">
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Your current transfer only allows: <span className="text-slate-100 font-medium">Academic, Food</span>. Gaming is not permitted.
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-4">
                <button
                  onClick={() => setScanState('scanning')}
                  className="w-full h-14 rounded-xl border border-slate-100 text-slate-100 font-bold btn-press"
                >
                  Got it
                </button>
                <button
                  onClick={() => navigate('history')}
                  className="w-full text-primary font-medium text-sm flex items-center justify-center gap-1 btn-press"
                >
                  Switch to an unlocked transfer?
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const AIInsights = () => {
    const [messages, setMessages] = useState<{ text: string, sender: 'user' | 'ai' }[]>([
      { text: "Hi! I've analyzed your monthly trends. Would you like to see how to save an extra ₹1,200 next month?", sender: 'ai' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showBottomSheet, setShowBottomSheet] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const data = analyticsData ? Object.values(analyticsData.breakdown) : Object.values(mockData?.spending || {});
          const colors = ['#7c3bed', '#3b82f6', '#2dd4bf', '#475569'];
          const total = data.reduce((a, b) => a + b, 0);
          let startAngle = -Math.PI / 2;

          ctx.clearRect(0, 0, 200, 200);

          // Animate donut
          let currentProgress = 0;
          const animate = () => {
            currentProgress += 0.02;
            if (currentProgress > 1) currentProgress = 1;

            ctx.clearRect(0, 0, 200, 200);
            let currentAngle = -Math.PI / 2;

            data.forEach((val, i) => {
              const sliceAngle = (val / total) * 2 * Math.PI * currentProgress;
              ctx.beginPath();
              ctx.arc(100, 100, 80, currentAngle, currentAngle + sliceAngle);
              ctx.lineWidth = 16;
              ctx.strokeStyle = colors[i];
              ctx.stroke();
              currentAngle += sliceAngle;
            });

            if (currentProgress < 1) requestAnimationFrame(animate);
          };
          animate();
        }
      }
    }, []);

    const handleSendMessage = () => {
      if (!inputValue.trim()) return;

      const userMsg = inputValue;
      setMessages(prev => [...prev, { text: userMsg, sender: 'user' }]);
      setInputValue('');

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const response = aiResponses[Math.floor(Math.random() * aiResponses.length)];
        setMessages(prev => [...prev, { text: response, sender: 'ai' }]);
      }, 2700);
    };

    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex flex-col min-h-screen bg-background-dark"
      >
        <header className="flex items-center justify-between px-6 pt-12 pb-4 bg-background-dark/80 backdrop-blur-md sticky top-0 z-20">
          <button onClick={() => navigate('home')} className="size-10 rounded-full bg-white/10 flex items-center justify-center btn-press">
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold text-slate-100">AI Insights</h1>
          <div className="bg-primary/20 border border-primary/30 px-3 py-1 rounded-full flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Powered by Gemini</span>
            <span className="material-symbols-outlined text-[14px] text-primary fill-1">auto_awesome</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-48 space-y-6 scrollbar-hide">
          <div className="bg-card-dark rounded-2xl p-6 relative overflow-hidden shadow-[0_0_20px_rgba(124,59,237,0.15)] border border-primary/10 mt-2">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[50px] rounded-full"></div>
            <div className="flex flex-col items-center justify-center py-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <canvas ref={canvasRef} width="200" height="200" className="w-full h-full" />
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-bold text-white leading-none">₹{(analyticsData?.total_spent ?? mockData.wallet.total - mockData.wallet.available).toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">spent this week</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span className="text-xs text-slate-400">Food & Drinks</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-xs text-slate-400">Transport</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                  <span className="text-xs text-slate-400">Shopping</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                  <span className="text-xs text-slate-400">Others</span>
                </div>
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 px-1 uppercase tracking-widest">This Week's Insights</h2>
            {(analyticsData ? [
              ...(analyticsData.total_spent < analyticsData.total_received * 0.5
                ? [{ type: 'positive' as const, title: 'Under budget 🎉', desc: `You have spent only ₹${analyticsData.total_spent.toLocaleString()} of ₹${analyticsData.total_received.toLocaleString()} received. Great discipline!` }]
                : [{ type: 'warning' as const, title: 'Spending trending up ⚠️', desc: `You have spent ₹${analyticsData.total_spent.toLocaleString()} so far. Watch your budget.` }]),
              ...(analyticsData.blocked_count > 0
                ? [{ type: 'critical' as const, title: `${analyticsData.blocked_count} blocked transaction${analyticsData.blocked_count > 1 ? 's' : ''} 🔴`, desc: 'Some spend attempts were blocked by smart rules. Stay within allowed categories.' }]
                : [{ type: 'positive' as const, title: 'Perfect compliance ✅', desc: `Compliance rate: ${analyticsData.compliance_rate}%. All spending is within rules!` }]),
            ] : (mockData?.insights || [])).map((insight, i) => (
              <div key={i} className={`bg-card-dark rounded-xl p-4 border-l-[3px] flex items-center gap-4 ${insight.type === 'positive' ? 'border-green-500' : insight.type === 'warning' ? 'border-amber-500' : 'border-red-500'
                }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${insight.type === 'positive' ? 'bg-green-500/10 text-green-500' : insight.type === 'warning' ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                  <span className="material-symbols-outlined">{
                    insight.type === 'positive' ? 'check_circle' : insight.type === 'warning' ? 'warning' : 'error'
                  }</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{insight.title}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{insight.desc}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-4 pt-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
              Ask SmartRupee AI
              <span className="material-symbols-outlined text-xs fill-1 text-primary">auto_awesome</span>
            </h2>
            <div className="space-y-4">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'ai' && (
                    <div className="w-8 h-8 rounded-full bg-chat-ai border border-primary/20 flex items-center justify-center shrink-0 mr-2">
                      <span className="material-symbols-outlined text-sm text-primary fill-1">auto_awesome</span>
                    </div>
                  )}
                  <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[80%] ${msg.sender === 'user' ? 'bg-primary text-white rounded-tr-none shadow-lg shadow-primary/20' : 'bg-chat-ai text-slate-200 rounded-tl-none border border-white/5'
                    }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="w-8 h-8 rounded-full bg-chat-ai border border-primary/20 flex items-center justify-center shrink-0 mr-2">
                    <span className="material-symbols-outlined text-sm text-primary fill-1">auto_awesome</span>
                  </div>
                  <div className="bg-chat-ai p-3 rounded-2xl rounded-tl-none flex gap-1 items-center border border-white/5">
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce delay-100"></div>
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-center py-2">
              <button
                onClick={() => setShowBottomSheet(true)}
                className="border border-primary/50 text-primary text-[11px] font-semibold px-4 py-2 rounded-full flex items-center gap-2 bg-primary/5 hover:bg-primary/10 transition-colors btn-press"
              >
                <span className="material-symbols-outlined text-sm">lightbulb</span>
                Suggest Conditions for Next Month
              </button>
            </div>
          </section>
        </main>

        <div className="fixed bottom-0 left-0 w-full bg-background-dark/95 backdrop-blur-xl border-t border-white/5 pb-8 pt-4 z-30">
          <div className="px-4 mb-6">
            <div className="bg-card-dark rounded-xl p-1 flex items-center border border-white/5 shadow-inner">
              <input
                className="bg-transparent border-none text-sm text-slate-200 placeholder:text-slate-500 flex-1 focus:ring-0 px-3"
                placeholder="Ask anything..."
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                className="bg-primary w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/30 btn-press"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
          <nav className="flex items-center justify-around px-4">
            <button onClick={() => navigate('home')} className="flex flex-col items-center gap-1.5 text-slate-500 btn-press">
              <span className="material-symbols-outlined">home</span>
              <span className="text-[10px] font-medium">Home</span>
            </button>
            <button onClick={() => navigate('history')} className="flex flex-col items-center gap-1.5 text-slate-500 btn-press">
              <span className="material-symbols-outlined">history</span>
              <span className="text-[10px] font-medium">History</span>
            </button>
            <button onClick={() => navigate('upload')} className="flex flex-col items-center gap-1.5 text-slate-500 btn-press">
              <span className="material-symbols-outlined">upload_file</span>
              <span className="text-[10px] font-medium">Upload</span>
            </button>
            <button className="flex flex-col items-center gap-1.5 text-primary relative btn-press">
              <div className="absolute -top-1 w-8 h-8 bg-primary/20 blur-md rounded-full"></div>
              <span className="material-symbols-outlined fill-1">auto_awesome</span>
              <span className="text-[10px] font-bold">AI</span>
            </button>
          </nav>
        </div>

        <AnimatePresence>
          {showBottomSheet && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowBottomSheet(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                className="fixed bottom-0 left-0 w-full z-50 bg-card-dark rounded-t-[2rem] p-6 pb-12 border-t border-white/10"
              >
                <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6"></div>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  Suggested Conditions ✦
                </h3>
                <div className="space-y-4">
                  {[
                    { cat: 'Academic', limit: '₹3,000', trigger: 'Upload Receipt' },
                    { cat: 'Food', limit: '₹2,000', trigger: 'Attendance > 80%' },
                    { cat: 'Transport', limit: '₹1,000', trigger: 'Weekly Review' }
                  ].map((cond, i) => (
                    <div key={i} className="bg-white/5 rounded-2xl p-4 flex items-center justify-between border border-white/5">
                      <div>
                        <p className="text-white font-bold">{cond.cat}</p>
                        <p className="text-slate-400 text-xs">Limit: {cond.limit} • {cond.trigger}</p>
                      </div>
                      <button
                        onClick={() => { setShowBottomSheet(false); showToast("Condition applied for next month!"); }}
                        className="bg-primary/20 text-primary font-bold px-4 py-2 rounded-full text-xs btn-press"
                      >
                        Use This
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };
  const Home = () => (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex flex-col min-h-screen"
    >
      <header className="pt-8 px-6 pb-4">
        <div className="flex justify-between items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-slate-500 dark:text-[#94A3B8] text-sm font-medium truncate">Good morning, {user?.name.split(' ')[0] || walletData?.name?.split(' ')[0] || mockData?.student?.name?.split(' ')[0] || 'Student'} 👋</p>
            <h1 className="text-xl font-bold mt-1 truncate">SmartRupee</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <button className="size-10 flex items-center justify-center rounded-full bg-primary/10 text-primary btn-press">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button onClick={() => navigate('login')} className="size-10 flex items-center justify-center rounded-full bg-white/5 text-slate-400 btn-press">
              <span className="material-symbols-outlined">logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 py-4">
        <div className="hero-glow frosted-glass rounded-[20px] p-6 border border-white/10 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 size-48 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <p className="text-[#94A3B8] text-sm font-medium mb-1">Total Balance</p>
            <h2 className="text-white text-[48px] font-bold tabular-nums leading-tight">₹{(walletData?.total_balance ?? mockData?.wallet?.total ?? 0).toLocaleString()}</h2>
            <div className="flex flex-wrap gap-2 mt-6">
              <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full">
                <span className="material-symbols-outlined text-amber-500 text-sm">lock</span>
                <span className="text-amber-500 text-xs font-semibold uppercase tracking-wider">₹{(walletData?.locked_balance ?? mockData?.wallet?.locked ?? 0).toLocaleString()} Locked</span>
              </div>
              <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                <span className="text-emerald-500 text-xs font-semibold uppercase tracking-wider">₹{(walletData?.available_balance ?? mockData?.wallet?.available ?? 0).toLocaleString()} Available</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('request')}
            className="absolute bottom-6 right-6 size-12 bg-primary rounded-full flex items-center justify-center text-white shadow-lg shadow-primary/40 btn-press"
          >
            <span className="material-symbols-outlined">north_east</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex gap-3">
        <button
          onClick={() => navigate('upload')}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-primary text-primary font-semibold text-sm btn-press"
        >
          <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
          Upload Proof
        </button>
        <button
          onClick={() => navigate('ai')}
          className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white font-semibold text-sm shadow-md shadow-primary/20 btn-press"
        >
          <span className="material-symbols-outlined text-[18px]">psychology</span>
          AI Insights
        </button>
      </div>

      <div className="px-6 py-4 flex-grow relative">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Recent Transfers</h3>
          <button onClick={() => navigate('history')} className="text-primary text-sm font-semibold">See All</button>
        </div>
        <div className="space-y-3">
          {mappedTransactions.map(tx => (
            <div
              key={tx.id}
              onClick={() => navigate('detail', tx)}
              className={`bg-surface rounded-[20px] p-4 flex items-center gap-4 border-l-4 shadow-sm card-hover ${tx.status === 'locked' ? 'border-red-500' : tx.status === 'unlocked' ? 'border-emerald-500' : 'border-slate-500'
                }`}
            >
              <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                {tx.senderInitials}
              </div>
              <div className="flex-grow">
                <div className="flex justify-between">
                  <p className="font-bold text-sm">{tx.sender}</p>
                  <p className="font-bold text-sm tabular-nums">₹{tx.amount.toLocaleString()}</p>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-slate-500 text-xs">{tx.condition}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${tx.status === 'locked' ? 'bg-red-500/10 text-red-500' :
                    tx.status === 'unlocked' ? 'bg-emerald-500/10 text-emerald-500' :
                      'bg-slate-500/10 text-slate-400'
                    }`}>
                    {tx.status}
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-slate-500">expand_more</span>
            </div>
          ))}
        </div>
      </div>

      <nav className="mt-auto bg-surface/95 border-t border-white/5 px-4 pb-8 pt-4 frosted-glass sticky bottom-0 z-30">
        <div className="flex justify-between items-center gap-2">
          <button onClick={() => navigate('home')} className="flex flex-col items-center gap-1.5 flex-1 btn-press">
            <span className={`material-symbols-outlined ${currentScreen === 'home' ? 'text-primary' : 'text-slate-500'}`}>account_balance_wallet</span>
            <span className={`text-[10px] font-bold ${currentScreen === 'home' ? 'text-primary' : 'text-slate-500'}`}>Wallet</span>
          </button>
          <button onClick={() => navigate('history')} className="flex flex-col items-center gap-1.5 flex-1 btn-press">
            <span className={`material-symbols-outlined ${currentScreen === 'history' ? 'text-primary' : 'text-slate-500'}`}>history</span>
            <span className={`text-[10px] font-bold ${currentScreen === 'history' ? 'text-primary' : 'text-slate-500'}`}>History</span>
          </button>

          <button
            onClick={() => navigate('scanner')}
            className="flex flex-col items-center gap-1.5 flex-1 -mt-10"
          >
            <div className={`size-16 rounded-full flex items-center justify-center shadow-xl transition-all ${currentScreen === 'scanner' ? 'bg-primary text-white scale-110 shadow-primary/40' : 'bg-slate-800 text-slate-400'}`}>
              <span className="material-symbols-outlined text-3xl">qr_code_scanner</span>
            </div>
            <span className={`text-[10px] font-bold mt-1 ${currentScreen === 'scanner' ? 'text-primary' : 'text-slate-500'}`}>Scan</span>
          </button>

          <button onClick={() => navigate('upload')} className="flex flex-col items-center gap-1.5 flex-1 btn-press">
            <span className={`material-symbols-outlined ${currentScreen === 'upload' ? 'text-primary' : 'text-slate-500'}`}>upload_file</span>
            <span className={`text-[10px] font-bold ${currentScreen === 'upload' ? 'text-primary' : 'text-slate-500'}`}>Upload</span>
          </button>
          <button onClick={() => navigate('ai')} className="flex flex-col items-center gap-1.5 flex-1 btn-press">
            <span className={`material-symbols-outlined ${currentScreen === 'ai' ? 'text-primary' : 'text-slate-500'}`}>auto_awesome</span>
            <span className={`text-[10px] font-bold ${currentScreen === 'ai' ? 'text-primary' : 'text-slate-500'}`}>AI</span>
          </button>
        </div>
      </nav>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-sans selection:bg-primary/30">
      <div className="max-w-md mx-auto min-h-screen relative overflow-hidden bg-white dark:bg-background-dark shadow-2xl">
        <AnimatePresence mode="wait">
          {currentScreen === 'login' && <Login key="login" />}
          {currentScreen === 'signup' && <SignUp key="signup" />}
          {currentScreen === 'onboarding' && <Onboarding key="onboarding" />}
          {currentScreen === 'home' && <Home key="home" />}
          {currentScreen === 'detail' && selectedTransaction && <TransactionDetail key="detail" tx={selectedTransaction} />}
          {currentScreen === 'history' && <History key="history" />}
          {currentScreen === 'upload' && <DocumentUpload key="upload" />}
          {currentScreen === 'ai' && <AIInsights key="ai" />}
          {currentScreen === 'request' && <PaymentRequestFlow key="request" />}
          {currentScreen === 'parent' && <ParentPortal key="parent" />}
          {currentScreen === 'scanner' && <QRScanner key="scanner" />}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isLoading && <LoadingOverlay />}
        </AnimatePresence>
      </div>
    </div>
  );
}