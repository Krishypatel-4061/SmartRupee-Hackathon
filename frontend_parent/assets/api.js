const API_BASE_URL = 'http://127.0.0.1:8000/parent';

export const apiFetch = async (endpoint, options = {}) => {
    const parent = JSON.parse(localStorage.getItem('loggedInParent'));
    const headers = {
        'Content-Type': 'application/json',
        ...(parent ? { 'X-User-ID': String(parent.id) } : {}),
        ...options.headers
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'API request failed');
    }

    return response.json();
};

export const getSelectedWard = () => JSON.parse(localStorage.getItem('selectedWard'));
export const getLoggedInParent = () => JSON.parse(localStorage.getItem('loggedInParent'));
