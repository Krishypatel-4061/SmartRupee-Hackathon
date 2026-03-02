// Sidebar injection and active link highlighting
const SIDEBAR_CONTENT = `
<div class="flex flex-col h-full bg-background-dark border-r border-white/10 w-64 fixed left-0 top-0 z-50">
  <div class="p-6">
    <div class="flex items-center gap-2 mb-8">
      <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
        <span class="material-symbols-outlined text-white text-xl">payments</span>
      </div>
      <span class="text-xl font-bold text-white tracking-tight">SmartRupee</span>
    </div>
    
    <nav class="space-y-2">
      <a href="index.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="index">
        <span class="material-symbols-outlined group-hover:text-primary">dashboard</span>
        <span class="font-medium">Dashboard</span>
      </a>
      <a href="send-money.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="send-money">
        <span class="material-symbols-outlined group-hover:text-primary">send</span>
        <span class="font-medium">Send Money</span>
      </a>
      <a href="verification-queue.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="verification-queue">
        <span class="material-symbols-outlined group-hover:text-primary">fact_check</span>
        <span class="font-medium">Verification</span>
      </a>
      <a href="history.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="history">
        <span class="material-symbols-outlined group-hover:text-primary">history</span>
        <span class="font-medium">History</span>
      </a>
      <a href="student.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="student">
        <span class="material-symbols-outlined group-hover:text-primary">person</span>
        <span class="font-medium">Student Profile</span>
      </a>
      <a href="ward-selection.html" class="nav-link flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-all group" data-page="ward-selection">
        <span class="material-symbols-outlined group-hover:text-primary">group</span>
        <span class="font-medium">Manage Wards</span>
      </a>
    </nav>
  </div>
  
  <div class="mt-auto p-6 border-t border-white/10">
    <div class="flex items-center gap-3 p-3 rounded-xl bg-white/5">
      <img id="sidebar-parent-avatar" src="https://picsum.photos/seed/parent/40/40" class="w-10 h-10 rounded-full border border-primary/30" alt="Parent Avatar" />
      <div class="flex-1 min-w-0">
        <p id="sidebar-parent-name" class="text-sm font-semibold text-white truncate">Parent Name</p>
        <p class="text-xs text-gray-400 truncate">Parent Account</p>
      </div>
      <button onclick="window.SmartRupeeData.logout(); window.location.href='verification.html';" class="text-gray-500 hover:text-accent-red transition-colors">
        <span class="material-symbols-outlined text-sm">logout</span>
      </button>
    </div>
  </div>
</div>
`;

document.addEventListener('DOMContentLoaded', () => {
  const data = window.SmartRupeeData;
  const parent = data ? data.getLoggedInParent() : null;
  
  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) {
    sidebarContainer.innerHTML = SIDEBAR_CONTENT;
    
    // Update parent info if available
    if (parent) {
      const nameEl = document.getElementById('sidebar-parent-name');
      if (nameEl) nameEl.textContent = parent.parentName || parent.name || 'Parent';
    }
    
    // Highlight active page
    const currentPath = window.location.pathname;
    const pageName = currentPath.split('/').pop().replace('.html', '') || 'index';
    
    const activeLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
    if (activeLink) {
      activeLink.classList.remove('text-gray-400', 'hover:bg-white/5');
      activeLink.classList.add('bg-primary/10', 'text-primary', 'border', 'border-primary/20');
    }
  }
});
