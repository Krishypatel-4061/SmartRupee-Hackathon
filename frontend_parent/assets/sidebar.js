document.addEventListener("DOMContentLoaded", () => {
    const sidebarContainer = document.getElementById("sidebar-container");
    if (!sidebarContainer) return;

    const currentPath = window.location.pathname.split("/").pop() || "index.html";

    const navItems = [
        { name: "Dashboard", icon: "dashboard", href: "index.html" },
        { name: "Send Money", icon: "send", href: "send-money.html" },
        { name: "Verification Queue", icon: "fact_check", href: "verification-queue.html" },
        { name: "Transaction History", icon: "history", href: "history.html" },
        { name: "Student Profile", icon: "person", href: "student.html" },
        { name: "Manage Wards", icon: "family_restroom", href: "ward-selection.html" },
    ];

    const generateNavLinks = () => {
        return navItems.map(item => {
            const isActive = currentPath === item.href;
            return `
                <a href="${item.href}" class="flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${isActive ? 'bg-primary/20 text-primary border border-primary/20 shadow-[0_0_15px_rgba(124,59,237,0.1)]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}">
                    <span class="material-symbols-outlined ${isActive ? 'text-primary' : ''}">${item.icon}</span>
                    <span class="font-bold text-sm tracking-wide">${item.name}</span>
                </a>
            `;
        }).join("");
    };

    sidebarContainer.innerHTML = `
        <aside class="w-72 fixed left-0 top-0 h-screen bg-[#0A071E] border-r border-white/5 flex flex-col z-[50]">
            <!-- Header -->
            <div class="px-8 py-8 border-b border-white/5">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent-blue flex items-center justify-center shadow-[0_0_20px_rgba(124,59,237,0.3)]">
                        <span class="material-symbols-outlined text-white">wallet</span>
                    </div>
                    <div>
                        <h1 class="text-xl font-black text-white tracking-tight">Smart<span class="text-primary">Rupee</span></h1>
                        <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Parent Portal</p>
                    </div>
                </div>
            </div>
            
            <!-- Navigation -->
            <nav class="flex-1 px-4 py-8 space-y-2 overflow-y-auto">
                <p class="px-6 text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">Main Menu</p>
                ${generateNavLinks()}
            </nav>
            
            <!-- Footer Actions -->
            <div class="p-4 border-t border-white/5">
                <button id="logout-btn" class="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-accent-red hover:bg-accent-red/10 transition-all font-bold text-sm tracking-wide">
                    <span class="material-symbols-outlined">logout</span>
                    Sign Out
                </button>
            </div>
        </aside>
    `;

    document.getElementById("logout-btn").addEventListener("click", () => {
        localStorage.removeItem("loggedInParent");
        localStorage.removeItem("selectedWard");
        window.location.href = "verification.html";
    });
});
