import { Transaction, Insight, MockData } from './types';

const API_BASE_URL = 'http://127.0.0.1:8000';

export interface LoginResponse {
    user_id: number;
    name: string;
    role: 'student' | 'parent' | 'organization';
}

export const api = {
    // Auth
    login: async (email: string, password: string): Promise<LoginResponse> => {
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Login failed');
        }
        return res.json();
    },

    // Student Dashboard
    getWallet: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/wallet/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch wallet');
        return res.json();
    },

    getLocks: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/locks/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch smart locks');
        return res.json();
    },

    getAnalytics: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/analytics/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
    },

    getTransactions: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/transactions/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch transactions');
        return res.json();
    },

    // Actions
    attemptSpend: async (studentId: number | string, payload: { lock_id: number, merchant_name: string, merchant_category: string, amount: number }) => {
        const res = await fetch(`${API_BASE_URL}/student/spend/${studentId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return res.json();
    },

    uploadDocument: async (studentId: number | string, payload: { lock_id: number, document_name: string, reviewer_id: number }) => {
        const res = await fetch(`${API_BASE_URL}/student/upload-document/${studentId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to upload document');
        return res.json();
    },

    getVerifications: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/verifications/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch verifications');
        return res.json();
    },

    createPaymentRequest: async (studentId: number | string, payload: { receiver_id: number, amount: number, purpose: string, note?: string, urgency: string, proof_plan: string, proof_deadline?: string }) => {
        const res = await fetch(`${API_BASE_URL}/student/payment-request/${studentId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create payment request');
        return res.json();
    },

    getPaymentRequests: async (studentId: number | string) => {
        const res = await fetch(`${API_BASE_URL}/student/payment-requests/${studentId}`);
        if (!res.ok) throw new Error('Failed to fetch payment requests');
        return res.json();
    },
};
