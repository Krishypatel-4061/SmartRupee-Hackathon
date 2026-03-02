// Store chart instance to prevent duplicates
let chartInstance = null;

// Custom Toast Notification
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    const colorClass = type === 'success' ? 'border-brand-success text-brand-success bg-brand-success/10' : 'border-brand-primary text-brand-primary bg-brand-primary/10';
    const shadowClass = type === 'success' ? 'shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'shadow-[0_0_20px_rgba(124,58,237,0.3)]';

    toast.className = `px-6 py-4 rounded-xl border backdrop-blur-md font-bold text-sm ${colorClass} ${shadowClass} shadow-lg transition-all duration-300 transform translate-y-10 opacity-0`;
    toast.innerHTML = `<div class="flex items-center gap-2">
        ${type === 'success' ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : ''}
        ${message}
    </div>`;

    container.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 10);

    // Animate out and remove
    setTimeout(() => {
        toast.classList.add('opacity-0', 'scale-95');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// SPA View Switching
function switchView(viewId, btnElement) {
    // Update Header Title
    // Skip setting the text to SVG content, just use textContent
    const textContent = btnElement.textContent.trim();
    document.getElementById('view-title').innerText = textContent;

    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    // Show target view
    document.getElementById(viewId).classList.add('active');

    // Update active state on sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    btnElement.classList.add('active');

    // Render/Re-render chart if navigating to reports
    if (viewId === 'view-reports') {
        setTimeout(renderChart, 50);
    }
}

// Fetch Students on load
async function fetchStudents() {
    try {
        const response = await fetch("http://127.0.0.1:8000/org/students");
        if (response.ok) {
            const students = await response.json();
            const tbody = document.querySelector('#view-scholar-dashboard tbody');
            tbody.innerHTML = ''; // Clear static data

            students.forEach(student => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white/5 transition-colors';

                // Determine display style for balance based on if it has condition limit
                const allowed_cat = student.allowed_category || 'Any';
                const hasCondition = allowed_cat.toLowerCase() !== 'any';

                const lockedBal = student.locked_balance !== undefined ? student.locked_balance : 0;

                tr.innerHTML = `
                    <td class="px-6 py-5 text-brand-textMuted font-tabular">STU-${student.id}</td>
                    <td class="px-6 py-5 text-white">${student.name}</td>
                    <td class="px-6 py-5 text-white font-tabular font-bold">₹ ${student.total_balance.toFixed(2)}</td>
                    <td class="px-6 py-5 font-tabular font-bold ${hasCondition ? 'text-shimmer' : 'text-white'}">₹ ${lockedBal.toFixed(2)} <span class="text-xs text-brand-textMuted font-normal">(${allowed_cat})</span></td>
                    <td class="px-6 py-5"><span class="badge badge-success">Active</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error("Failed to fetch students", error);
    }
}

// Fetch Verifications on load
async function fetchVerifications() {
    try {
        const response = await fetch("http://127.0.0.1:8000/org/verifications");
        if (response.ok) {
            const verifications = await response.json();
            const tbody = document.querySelector('#view-verification-queue tbody');
            tbody.innerHTML = '';

            verifications.forEach(ver => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white/5 transition-colors';
                tr.id = `queue-row-${ver.id}`;

                const dateObj = ver.date ? new Date(ver.date) : new Date();
                const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                tr.innerHTML = `
                    <td class="px-6 py-5 text-white">${ver.student_name}</td>
                    <td class="px-6 py-5 text-brand-textMuted font-tabular">${dateStr}</td>
                    <td class="px-6 py-5 flex justify-center gap-2">
                        <button onclick="resolveQueue(${ver.id}, 'Approve')"
                            class="bg-brand-success/20 hover:bg-brand-success/40 text-brand-success border border-brand-success/30 px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-[0_0_10px_rgba(16,185,129,0.2)]">Approve</button>
                        <button onclick="resolveQueue(${ver.id}, 'Reject')"
                            class="bg-brand-danger/20 hover:bg-brand-danger/40 text-brand-danger border border-brand-danger/30 px-4 py-1.5 rounded-full text-xs font-bold transition-all">Reject</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error("Failed to fetch verifications", error);
    }
}

// Fetch Analytics
async function fetchAnalytics() {
    try {
        const response = await fetch("http://127.0.0.1:8000/org/analytics");
        if (response.ok) {
            const data = await response.json();

            // Update UI elements
            document.getElementById('stat-total-volume').innerText = data.total;
            document.getElementById('stat-prevented-loss').innerText = data.blocked;
            document.getElementById('stat-analysis-text').innerText =
                `${data.compliance_rate}% of transactions were compliant. ${data.blocked} transactions were automatically blocked at unauthorized merchant categories.`;

            // Re-render chart with new real data
            renderChart(data.success, data.blocked);
        }
    } catch (error) {
        console.error("Failed to fetch analytics", error);
    }
}


// Ensure it runs on load
window.onload = () => {
    fetchStudents();
    fetchVerifications();
    if (document.getElementById('view-reports').classList.contains('active')) {
        fetchAnalytics();
    }
};

// Handle Bulk Disburse Form Submission
async function handleDisburse(e) {
    e.preventDefault();

    const amount = document.getElementById('amount').value;
    const conditionSelect = document.getElementById('conditionTemplate');
    const conditionValue = conditionSelect.value;

    let rule_type = 'Category_Lock';
    let allowed_category = 'Any';
    let is_geofenced = false;

    // Map frontend option values to backend schema fields
    if (conditionValue === "standard") {
        rule_type = "Category_Lock";
        allowed_category = "Education";
        is_geofenced = false;
    } else if (conditionValue === "books") {
        rule_type = "Category_Lock";
        allowed_category = "Books";
        is_geofenced = false;
    } else if (conditionValue === "emergency") {
        rule_type = "Category_Lock";
        allowed_category = "Any";
        is_geofenced = true;
    }

    try {
        const response = await fetch("http://127.0.0.1:8000/org/bulk-disburse", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                rule_type: rule_type,
                allowed_category: allowed_category,
                is_geofenced: is_geofenced
            })
        });

        if (response.ok) {
            const data = await response.json();
            alert(data.message);
            fetchStudents(); // refresh table
            e.target.reset();
        } else {
            const error = await response.json();
            alert("Error processing request: " + JSON.stringify(error));
        }
    } catch (error) {
        alert("Network Error: Could not connect to API.");
    }
}

// Handle Queue Approve/Reject
async function resolveQueue(verificationId, action) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/org/verify/${verificationId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });

        if (response.ok) {
            const data = await response.json();
            showToast(data.message, action === 'Approve' ? 'success' : 'primary');

            const row = document.getElementById(`queue-row-${verificationId}`);
            if (row) {
                row.style.transition = 'all 0.4s ease';
                row.style.opacity = '0';
                row.style.transform = 'translateY(10px) scale(0.98)';
                setTimeout(() => row.remove(), 400);
            }

            // Re-fetch the students to show their updated balances if approved
            if (action === 'Approve') {
                fetchStudents();
            }
        } else {
            const errorData = await response.json();
            showToast(`Error: ${errorData.detail || 'Could not verify'}`, 'danger');
        }
    } catch (error) {
        showToast("Network Error: Could not connect to API.", "danger");
    }
}

// Render Chart.js
function renderChart(successCount = 85, blockedCount = 15) {
    const ctx = document.getElementById('complianceChart');

    if (chartInstance) {
        chartInstance.destroy();
    }

    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Correctly Spent', 'Blocked Automatically'],
            datasets: [{
                data: [successCount, blockedCount],
                backgroundColor: [
                    '#10B981', // Emerald Success
                    '#13102B'  // Surface color for blocked
                ],
                borderWidth: 2,
                borderColor: [
                    '#10B981',
                    '#EF4444' // Red border for danger piece
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: "'Inter', sans-serif",
                            weight: 'bold',
                            size: 12
                        },
                        color: '#FFFFFF',
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: '#13102B',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleFont: { family: "'Inter', sans-serif", weight: 'bold' },
                    bodyFont: { family: "'Inter', sans-serif", weight: 'bold' },
                    padding: 12,
                    cornerRadius: 8,
                    boxPadding: 6
                }
            }
        }
    });
}
