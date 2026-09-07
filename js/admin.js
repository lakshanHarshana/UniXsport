/**
 * UniXsport - Admin Dashboard
 * Complete Admin Module (Connected to Live Database API)
 */

// ========== Data Storage (Connected to Database) ==========
let users = [];
let equipment = [];
let notices = [];
let facilities = [];
let events = [];
let sportsRooms = [
    { id: 1, name: 'Main Gym Hall', location: 'Building A, Floor 1' },
    { id: 2, name: 'Sports Room B', location: 'Building B, Floor 2' },
    { id: 3, name: 'Outdoor Court', location: 'Campus Grounds' }
];

function getUniXsportToken() {
    return (window.UniXsportAPI && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken('admin') : '') ||
           sessionStorage.getItem('unixsport_token_admin') ||
           sessionStorage.getItem('unixsport_jwt_token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('unixsport_token_admin') ||
           localStorage.getItem('unixsport_jwt_token') ||
           localStorage.getItem('token') ||
           '';
}

function getAdminApiBase() {
    return (typeof window !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');
}

let currentAdmin = (() => {
    let raw = sessionStorage.getItem('unixsport_user_admin') || localStorage.getItem('unixsport_user_admin');
    let parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch(e) {}
    }
    return {
        id: parsed?.id || 1,
        name: parsed?.name || sessionStorage.getItem('userRealName') || localStorage.getItem('userRealName') || (sessionStorage.getItem('userName') || localStorage.getItem('userName') ? ((sessionStorage.getItem('userName') || localStorage.getItem('userName')).charAt(0).toUpperCase() + (sessionStorage.getItem('userName') || localStorage.getItem('userName')).slice(1)) : 'Admin User'),
        email: parsed?.email || sessionStorage.getItem('userEmail') || localStorage.getItem('userEmail') || 'admin@unixsport.edu',
        memberSince: 'RUSL Staff'
    };
})();

let nextUserId = 100;
let nextEquipmentId = 100;
let nextNoticeId = 100;

// ========== Live Database Sync Function ==========
async function loadAdminData() {
    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.getAdminDashboard === 'function') {
            const res = await window.UniXsportAPI.getAdminDashboard();
            if (res && res.success) {
                // Map database users
                users = (res.users || []).map(u => ({
                    id: u.id,
                    user_id: u.user_id || u.userId || '',
                    userId: u.user_id || u.userId || '',
                    regNo: u.regNo || u.username || '',
                    name: u.name || '',
                    email: u.email || '',
                    role: (u.role || '').toLowerCase(),
                    rfidCode: u.rfidTag || '',
                    profileImage: u.profileImage || u.profilePhoto || '',
                    profilePhoto: u.profilePhoto || u.profileImage || '',
                    department: u.department || 'General',
                    status: u.status || 'active',
                    createdAt: u.createdAt
                }));

                if (res.currentAdmin) {
                    currentAdmin = {
                        id: res.currentAdmin.id || currentAdmin.id,
                        user_id: res.currentAdmin.user_id || 'US001',
                        userId: res.currentAdmin.user_id || 'US001',
                        name: res.currentAdmin.name || currentAdmin.name,
                        email: res.currentAdmin.email || currentAdmin.email,
                        role: res.currentAdmin.role || 'admin',
                        profileImage: res.currentAdmin.profileImage || '',
                        profilePhoto: res.currentAdmin.profilePhoto || res.currentAdmin.profileImage || '',
                        memberSince: res.currentAdmin.memberSince || currentAdmin.memberSince
                    };
                    renderAdminProfilePhoto(currentAdmin.profileImage);
                }

                // Map database equipment
                equipment = (res.equipment || []).map(e => ({
                    id: e.id,
                    name: e.name,
                    category: e.category || 'Sports Equipment',
                    sportsRoom: e.sportsRoom || e.location || 'Main Gym Hall',
                    roomName: e.sportsRoom || e.location || 'Main Gym Hall',
                    quantity: e.totalQty || e.availableQty || e.available || 1,
                    total: e.totalQty || e.availableQty || e.available || 1,
                    available: e.availableQty !== undefined ? e.availableQty : (e.available !== undefined ? e.available : 0),
                    borrowed: e.borrowedQty !== undefined ? e.borrowedQty : (e.borrowed !== undefined ? e.borrowed : 0),
                    damaged: e.damagedQty !== undefined ? e.damagedQty : (e.damaged !== undefined ? e.damaged : 0),
                    status: e.status || 'available'
                }));

                notices = res.notices || [];
                facilities = res.facilities || [];
                events = res.events || [];
                renderAdminHeaderNotifications();

                // Update UI Metrics from stats
                if (res.stats) {
                    const stats = res.stats;
                    const elStudents = document.getElementById('totalStudents');
                    if (elStudents) elStudents.textContent = stats.totalStudents;

                    const elCoaches = document.getElementById('totalCoaches');
                    if (elCoaches) elCoaches.textContent = stats.totalCoaches;

                    const elEquip = document.getElementById('totalEquipment');
                    if (elEquip) elEquip.textContent = stats.totalEquipment !== undefined ? stats.totalEquipment : stats.totalEquipmentTypes;

                    const elEvents = document.getElementById('totalEvents');
                    if (elEvents) elEvents.textContent = stats.totalEvents !== undefined ? stats.totalEvents : events.length;

                    const elAvail = document.getElementById('equipAvailable');
                    if (elAvail) elAvail.textContent = stats.equipmentBreakdown?.available !== undefined ? stats.equipmentBreakdown.available : stats.availableEquipment;

                    const elBorrow = document.getElementById('equipBorrowed');
                    if (elBorrow) elBorrow.textContent = stats.equipmentBreakdown?.borrowed !== undefined ? stats.equipmentBreakdown.borrowed : stats.borrowedEquipment;

                    const elDamaged = document.getElementById('equipDamaged');
                    if (elDamaged) elDamaged.textContent = stats.equipmentBreakdown?.damaged !== undefined ? stats.equipmentBreakdown.damaged : stats.damagedEquipment;
                }
            }
        }
    } catch(err) {
        console.error('Failed to load admin data from API:', err);
    }
}

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('adminName').textContent = currentAdmin.name;
    initNavigation();
    initSidebar();
    initDarkMode();
    initNotifications();

    // Fetch live database records first, then render UI
    await loadAdminData();
    renderAdminHeaderNotifications();
    initDashboard();
    initUserManagement();
    initEquipmentManagement();
    initNotices();
    initEventsManagement();
    initProfile();
    initRfidScanner();
    initAdminAutoRefresh();
});

// ========== Automatic Live Data Refresh ==========
let adminRefreshInterval = null;

async function autoRefreshAdminData() {
    const activeModal = document.querySelector('.modal.show, .modal[style*="display: block"]');
    const isTyping = document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.tagName === 'SELECT'
    );

    // 1. Always load fresh admin data and update header notification badge & dropdown
    await loadAdminData();
    renderAdminHeaderNotifications();

    // 2. Refresh active page views if no modal is open and not actively typing
    if (!activeModal && !isTyping) {
        const activePageEl = document.querySelector('.page.active');
        const activePageId = activePageEl ? activePageEl.id.replace('page-', '') : 'dashboard';

        if (activePageId === 'dashboard') initDashboard();
        else if (activePageId === 'user-management') renderUsers();
        else if (activePageId === 'equipment') renderEquipment();
        else if (activePageId === 'notices') renderNoticesList();
        else if (activePageId === 'events') renderEvents();
    }
}

function initAdminAutoRefresh() {
    if (adminRefreshInterval) clearInterval(adminRefreshInterval);
    adminRefreshInterval = setInterval(() => {
        autoRefreshAdminData();
    }, 10000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            autoRefreshAdminData();
        }
    });

    window.addEventListener('focus', () => {
        autoRefreshAdminData();
    });
}

// ========== Navigation ==========
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    async function showPage(pageId) {
        if (!pageId) pageId = 'dashboard';
        pageId = pageId.replace(/^page-/, '').replace(/^#/, '');

        const targetPage = document.getElementById(`page-${pageId}`);
        if (!targetPage) return;

        pages.forEach(p => p.classList.toggle('active', p.id === `page-${pageId}`));
        navLinks.forEach(l => {
            const lPage = (l.dataset.page || l.getAttribute('href') || '').replace(/^page-/, '').replace(/^#/, '');
            l.classList.toggle('active', lPage === pageId);
        });

        if (typeof window.closeSidebar === 'function') window.closeSidebar();

        if (window.location.hash !== `#${pageId}`) {
            history.pushState(null, '', `#${pageId}`);
        }

        await loadAdminData();
        if (pageId === 'dashboard') initDashboard();
        if (pageId === 'user-management') renderUsers();
        if (pageId === 'equipment') renderEquipment();
        if (pageId === 'notices') renderNoticesList();
        if (pageId === 'profile') initProfile();
    }

    window.showPage = showPage;

    // Delegated click handler for sidebar links, quick links, and cards
    document.addEventListener('click', e => {
        const trigger = e.target.closest('[data-page], .sidebar-nav a, .quick-links-grid a');
        if (trigger) {
            if (trigger.id === 'sidebarLogout' || trigger.classList.contains('logout-link')) return;
            e.preventDefault();
            const pageId = trigger.dataset.page || trigger.getAttribute('href');
            if (pageId && pageId !== '#') {
                showPage(pageId);
            }
        }
    });

    // Hash change handler for back/forward browser navigation
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            showPage(hash);
        } else {
            showPage('dashboard');
        }
    });

    // Auto redirect to Dashboard on page load / refresh
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    showPage('dashboard');
}

// ========== Sidebar ==========
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');

    function openSidebar() {
        sidebar?.classList.add('open');
        overlay?.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeSidebar() {
        sidebar?.classList.remove('open');
        overlay?.classList.remove('show');
        document.body.style.overflow = '';
    }

    toggle?.addEventListener('click', openSidebar);
    overlay?.addEventListener('click', closeSidebar);
    window.closeSidebar = closeSidebar;
}

// ========== Dark Mode ==========
function initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const html = document.documentElement;
    
    const isDarkMode = localStorage.getItem('darkMode') !== 'disabled';
    if (isDarkMode) {
        html.setAttribute('data-theme', 'dark');
        if (darkModeToggle) darkModeToggle.classList.add('active');
    } else {
        html.removeAttribute('data-theme');
        if (darkModeToggle) darkModeToggle.classList.remove('active');
    }
    
    darkModeToggle?.addEventListener('click', () => {
        const isCurrentlyDark = html.getAttribute('data-theme') === 'dark';
        if (isCurrentlyDark) {
            html.removeAttribute('data-theme');
            localStorage.setItem('darkMode', 'disabled');
            darkModeToggle.classList.remove('active');
        } else {
            html.setAttribute('data-theme', 'dark');
            localStorage.setItem('darkMode', 'enabled');
            darkModeToggle.classList.add('active');
        }
    });
}

function dismissAdminNotice(noticeId, event) {
    if (event) event.stopPropagation();
    try {
        let dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_admin') || '[]');
        if (!dismissed.includes(String(noticeId))) {
            dismissed.push(String(noticeId));
            localStorage.setItem('unixsport_dismissed_notices_admin', JSON.stringify(dismissed));
        }
    } catch(e) {}
    renderAdminHeaderNotifications();
}
window.dismissAdminNotice = dismissAdminNotice;

function renderAdminHeaderNotifications() {
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');
    if (!panel) return;

    let dismissed = [];
    try {
        dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_admin') || '[]');
    } catch(e) {}

    const activeNotices = (notices || []).filter(n => !dismissed.includes(String(n.id)));

    if (!activeNotices || activeNotices.length === 0) {
        panel.innerHTML = `
            <h4>Notifications & Broadcasts</h4>
            <div class="notification-item" style="padding: 12px; color: var(--gray-500); text-align: center;">
                <i class="fas fa-bell-slash" style="margin-right: 6px;"></i>
                <span>No new broadcast notices</span>
            </div>
        `;
        if (badge) {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
        return;
    }

    const lastRead = parseInt(localStorage.getItem('unixsport_notices_last_read_admin') || '0', 10);
    const unreadCount = activeNotices.filter(n => new Date(n.createdAt || 0).getTime() > lastRead).length;

    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = String(unreadCount);
            badge.style.display = 'inline-block';
        } else {
            badge.textContent = '0';
            badge.style.display = 'none';
        }
    }

    panel.innerHTML = `
        <h4>Notifications & Broadcasts (${activeNotices.length})</h4>
        ${activeNotices.slice(0, 5).map(n => {
            const icon = n.priority === 'urgent' ? 'exclamation-circle text-danger' :
                         n.priority === 'high' ? 'exclamation-triangle text-orange' : 'bell text-blue';
            return `
                <div class="notification-item" style="padding: 10px 14px; border-bottom: 1px solid var(--gray-100); display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                    <div style="display: flex; align-items: flex-start; gap: 8px; flex: 1; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                        <i class="fas fa-${icon}" style="margin-top: 3px; flex-shrink: 0;"></i>
                        <div style="flex: 1; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                            <strong style="font-size: 0.88rem; color: var(--gray-800); display: block; overflow-wrap: anywhere; word-break: break-word;">${n.title}</strong>
                            <p style="font-size: 0.8rem; color: var(--gray-600); margin: 2px 0 4px; line-height: 1.3; overflow-wrap: anywhere; word-break: break-word; white-space: normal;">${n.message}</p>
                            <span style="font-size: 0.75rem; color: var(--gray-400); display: block; overflow-wrap: anywhere; word-break: break-word;">${n.createdBy || 'Administrator'} • ${formatDateTime(n.createdAt)}</span>
                        </div>
                    </div>
                    <button type="button" class="btn-close-notice" onclick="dismissAdminNotice('${n.id}', event)" style="background: transparent; border: none; color: var(--gray-400); cursor: pointer; padding: 2px 4px; border-radius: 4px; font-size: 0.85rem; line-height: 1; flex-shrink: 0; transition: color 0.2s;" title="Dismiss" aria-label="Dismiss">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('')}
    `;
}

// ========== Notifications ==========
function initNotifications() {
    const btn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !panel?.classList.contains('show');
        panel?.classList.toggle('show');

        if (willOpen) {
            localStorage.setItem('unixsport_notices_last_read_admin', Date.now().toString());
            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
        }
    });

    document.addEventListener('click', () => {
        panel?.classList.remove('show');
    });

    panel?.addEventListener('click', (e) => e.stopPropagation());

    renderAdminHeaderNotifications();
}

function showLogoutModal() {
    const modal = document.getElementById('deleteModal');
    if (!modal) {
        performLogout();
        return;
    }
    document.getElementById('deleteModalTitle').textContent = 'Confirm Logout';
    document.getElementById('deleteModalMessage').textContent = 'Are you sure you want to log out?';
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
        confirmBtn.className = 'btn btn-danger';
        confirmBtn.onclick = performLogout;
    }
    modal.classList.add('show');
}

async function performLogout() {
    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.logout === 'function') {
            await window.UniXsportAPI.logout();
        }
    } catch (e) {
        console.warn('Logout API call error:', e);
    } finally {
        localStorage.removeItem('unixsport_jwt_token');
        localStorage.removeItem('unixsport_user_profile');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userProfile');
        sessionStorage.clear();
        window.location.replace('login.html?role=admin');
    }
}

document.getElementById('logoutBtn')?.addEventListener('click', showLogoutModal);

document.getElementById('sidebarLogout')?.addEventListener('click', e => {
    e.preventDefault();
    showLogoutModal();
});

// ========== Dashboard ==========
function initDashboard() {
    const students = users.filter(u => (u.role || '').toLowerCase() === 'student').length;
    const coaches = users.filter(u => (u.role || '').toLowerCase() === 'coach').length;
    const available = equipment.reduce((s, e) => s + (e.available || 0), 0);
    const borrowed = equipment.reduce((s, e) => s + (e.borrowed || 0), 0);
    const damaged = equipment.reduce((s, e) => s + (e.damaged || 0), 0);
    const totalEquip = equipment.reduce((s, e) => s + (e.quantity || e.total || 0), 0) || equipment.length;

    const elStudents = document.getElementById('totalStudents');
    if (elStudents) elStudents.textContent = students;

    const elCoaches = document.getElementById('totalCoaches');
    if (elCoaches) elCoaches.textContent = coaches;

    const elEquip = document.getElementById('totalEquipment');
    if (elEquip) elEquip.textContent = totalEquip;

    const elAvail = document.getElementById('equipAvailable');
    if (elAvail) elAvail.textContent = available;

    const elBorrow = document.getElementById('equipBorrowed');
    if (elBorrow) elBorrow.textContent = borrowed;

    const elDamaged = document.getElementById('equipDamaged');
    if (elDamaged) elDamaged.textContent = damaged;

    const recentNotices = notices.slice(0, 3);
    const container = document.getElementById('recentNotices');
    if (container) {
        if (recentNotices.length === 0) {
            container.innerHTML = '<p style="color: var(--gray-500); padding: 16px; text-align: center;">No notices published yet.</p>';
        } else {
            container.innerHTML = recentNotices.map(n => `
                <div class="notice-item ${n.priority || 'normal'}">
                    <h4>${n.title}</h4>
                    <p>${n.message ? (n.message.substring(0, 80) + (n.message.length > 80 ? '...' : '')) : ''}</p>
                    <div class="meta">${n.createdBy || 'Administrator'} • ${formatDateTime(n.createdAt)} • ${formatVisibleTo(n.visibleTo)}</div>
                </div>
            `).join('');
        }
    }

    renderDashboardCharts();
}

// ========== User Management ==========
let currentUserTab = 'students';

function initUserManagement() {
    renderUsers();
    document.getElementById('userSearch')?.addEventListener('input', renderUsers);
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentUserTab = btn.dataset.tab;
            renderUsers();
        });
    });
}

function renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    const emptyState = document.getElementById('noUsers');
    const search = document.getElementById('userSearch')?.value.toLowerCase() || '';

    let filtered = users;
    if (currentUserTab === 'students') {
        filtered = users.filter(u => (u.role || '').toLowerCase() === 'student');
    } else if (currentUserTab === 'coaches') {
        filtered = users.filter(u => (u.role || '').toLowerCase() === 'coach');
    } else if (currentUserTab === 'storekeepers') {
        filtered = users.filter(u => (u.role || '').toLowerCase() === 'storekeeper');
    } else if (currentUserTab === 'admins') {
        filtered = users.filter(u => (u.role || '').toLowerCase() === 'admin');
    }

    if (search) {
        filtered = filtered.filter(u =>
            (u.name || '').toLowerCase().includes(search) ||
            (u.email || '').toLowerCase().includes(search) ||
            (u.regNo || '').toLowerCase().includes(search)
        );
    }

    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    tbody.innerHTML = filtered.map(u => `
        <tr>
            <td><strong class="user-id-badge" style="color: var(--blue); font-family: monospace; font-size: 0.95rem; font-weight: 700;">${u.user_id || u.userId || '-'}</strong></td>
            <td><strong>${u.name || '-'}</strong><br><small style="color: var(--gray-400);">${u.regNo || ''}</small></td>
            <td>${u.email || '-'}</td>
            <td><span class="status-badge ${u.role}">${u.role.toUpperCase()}</span></td>
            <td>${u.rfidCode || '-'}</td>
            <td><span class="status-badge available">${u.status || 'active'}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-sm btn-outline" onclick="editUser('${u.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="confirmDeleteUser('${u.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ========== Equipment Management ==========
function initEquipmentManagement() {
    const roomSelect = document.getElementById('equipmentRoom');
    sportsRooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        roomSelect?.appendChild(opt);
    });

    const equipmentRoomFilter = document.getElementById('equipmentRoomFilter');
    sportsRooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        equipmentRoomFilter?.appendChild(opt);
    });

    renderEquipment();
    document.getElementById('equipmentSearch')?.addEventListener('input', renderEquipment);
    document.getElementById('equipmentStatusFilter')?.addEventListener('change', renderEquipment);
    document.getElementById('equipmentRoomFilter')?.addEventListener('change', renderEquipment);
}

function renderEquipment() {
    const tbody = document.getElementById('equipmentTableBody');
    const emptyState = document.getElementById('noEquipment');
    const search = document.getElementById('equipmentSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('equipmentStatusFilter')?.value || '';
    const roomFilter = document.getElementById('equipmentRoomFilter')?.value || '';

    let filtered = equipment;
    if (search) filtered = filtered.filter(e => e.name.toLowerCase().includes(search));
    if (statusFilter) filtered = filtered.filter(e => e.status === statusFilter);
    if (roomFilter) filtered = filtered.filter(e => e.roomId == roomFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    tbody.innerHTML = filtered.map(e => `
        <tr>
            <td><strong>${e.name}</strong></td>
            <td>${e.quantity}</td>
            <td>${e.available}</td>
            <td><span class="status-badge ${e.status}">${e.status}</span></td>
            <td>${e.roomName}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-sm btn-outline" onclick="editEquipment('${e.id}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="confirmDeleteEquipment('${e.id}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// ========== Notices ==========
function initNotices() {
    document.getElementById('noticeForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const title = document.getElementById('noticeTitle').value.trim();
        const message = document.getElementById('noticeMessage').value.trim();
        const visibleTo = document.getElementById('noticeVisibleTo').value;
        const priority = document.getElementById('noticePriority').value;

        if (!title || !message) {
            showToast('Please fill in title and message.', 'error');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await window.UniXsportAPI.createNotice({ title, message, visibleTo, priority });
            if (res && res.notice) {
                notices.unshift(res.notice);
            }
            showToast('Notice published successfully to database!', 'success');
            e.target.reset();
            localStorage.setItem('unixsport_notices', JSON.stringify(notices));
            initDashboard();
            renderNoticesList();
        } catch (err) {
            showToast(err.message || 'Failed to publish notice', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    renderNoticesList();
}

function renderNoticesList() {
    const container = document.getElementById('noticesList');
    if (!container) return;
    if (notices.length === 0) {
        container.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 30px 0;">No notices published yet.</p>';
        return;
    }

    container.innerHTML = notices.map(n => `
        <div class="notice-card ${n.priority || 'normal'}">
            <div class="notice-card-header">
                <h4>${n.title}</h4>
                <span class="notice-card-meta">${formatVisibleTo(n.visibleTo, n)} • ${formatDateTime(n.createdAt)}</span>
            </div>
            <p>${n.message}</p>
            <div class="notice-card-meta">By ${n.createdBy || 'Administrator'}</div>
            <div class="notice-card-actions">
                <button class="btn btn-sm btn-outline" onclick="deleteNotice('${n.id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `).join('');
}

function deleteNotice(id) {
    const notice = notices.find(n => String(n.id) === String(id));
    if (!notice) return;

    document.getElementById('deleteModalTitle').textContent = 'Delete Notice';
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete notice "${notice.title}"?`;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    confirmBtn.className = 'btn btn-danger';
    
    document.getElementById('deleteModal').classList.add('show');

    confirmBtn.onclick = async () => {
        try {
            await window.UniXsportAPI.deleteNotice(id);
            notices = notices.filter(n => String(n.id) !== String(id));
            localStorage.setItem('unixsport_notices', JSON.stringify(notices));
            showToast('Notice deleted successfully from database!', 'success');
        } catch (err) {
            notices = notices.filter(n => String(n.id) !== String(id));
            localStorage.setItem('unixsport_notices', JSON.stringify(notices));
            showToast('Notice removed.', 'info');
        }
        document.getElementById('deleteModal').classList.remove('show');
        initDashboard();
    };
}

// ========== Events Management ==========
function initEventsManagement() {
    // Add Event Button (Open Modal)
    document.getElementById('addEventBtn')?.addEventListener('click', () => {
        const form = document.getElementById('eventForm');
        if (form) form.reset();
        document.getElementById('eventId').value = '';
        document.getElementById('eventModalTitle').textContent = 'Publish Sports Event';
        document.getElementById('saveEventBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Publish Event';
        
        // Set default minimum date to today
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('eventDate');
        if (dateInput) {
            dateInput.min = today;
            dateInput.value = today;
        }

        document.getElementById('eventModal').classList.add('show');
    });

    // Close Event Modal Controls
    document.getElementById('closeEventModal')?.addEventListener('click', () => {
        document.getElementById('eventModal').classList.remove('show');
    });
    document.getElementById('cancelEventBtn')?.addEventListener('click', () => {
        document.getElementById('eventModal').classList.remove('show');
    });

    // Event Search & Filter
    document.getElementById('eventSearch')?.addEventListener('input', renderEvents);
    document.getElementById('eventCategoryFilter')?.addEventListener('change', renderEvents);

    // Event Form Submit Handler
    document.getElementById('eventForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const eventId = document.getElementById('eventId').value;
        const title = document.getElementById('eventTitle').value.trim();
        const date = document.getElementById('eventDate').value;
        const category = document.getElementById('eventCategory').value;
        const location = document.getElementById('eventLocation').value.trim();
        const participants = document.getElementById('eventParticipants').value.trim();
        const description = document.getElementById('eventDescription').value.trim();

        if (!title || !date) {
            showToast('Event title and date are required.', 'error');
            return;
        }

        const submitBtn = document.getElementById('saveEventBtn');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Publish Event';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        const payload = {
            title,
            date,
            category,
            location: location || 'Main Sports Complex',
            participants: participants || 'Open to All Students',
            description: description || ''
        };

        try {
            if (eventId) {
                // Update Existing Event
                const res = await window.UniXsportAPI.updateEventAdmin(eventId, payload);
                if (res && res.success && res.event) {
                    const idx = events.findIndex(ev => ev.id === eventId);
                    if (idx !== -1) events[idx] = res.event;
                }
                showToast('Event updated successfully in database!', 'success');
            } else {
                // Create New Event
                const res = await window.UniXsportAPI.createEventAdmin(payload);
                if (res && res.success && res.event) {
                    events.unshift(res.event);
                }
                showToast('Event published successfully to university calendar!', 'success');
            }

            document.getElementById('eventModal').classList.remove('show');
            renderEvents();
            initDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to save event. Please check server connection.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    });

    renderEvents();
}

function renderEvents() {
    const tbody = document.getElementById('eventsTableBody');
    const emptyState = document.getElementById('noEvents');
    if (!tbody) return;

    const search = (document.getElementById('eventSearch')?.value || '').toLowerCase().trim();
    const categoryFilter = document.getElementById('eventCategoryFilter')?.value || '';

    let filtered = events;
    if (search) {
        filtered = filtered.filter(ev => 
            (ev.title || '').toLowerCase().includes(search) ||
            (ev.location || '').toLowerCase().includes(search) ||
            (ev.description || '').toLowerCase().includes(search)
        );
    }
    if (categoryFilter) {
        filtered = filtered.filter(ev => (ev.category || '').toLowerCase() === categoryFilter.toLowerCase());
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    const categoryLabels = {
        'sports': { text: 'Tournament', class: 'status-badge available' },
        'training': { text: 'Workshop', class: 'status-badge borrowed' },
        'marathon': { text: 'Marathon', class: 'status-badge damaged' },
        'wellness': { text: 'Wellness', class: 'status-badge available' }
    };

    tbody.innerHTML = filtered.map(ev => {
        const catInfo = categoryLabels[ev.category] || { text: ev.category || 'Sports', class: 'status-badge' };
        const dateBadge = `<span style="font-weight: 700; color: var(--blue);">${ev.day || ''} ${ev.month || ''}</span> <span style="font-size: 0.8rem; color: var(--gray-500);">(${ev.date || ''})</span>`;

        return `
            <tr>
                <td>${dateBadge}</td>
                <td>
                    <div style="font-weight: 600; color: var(--gray-900);">${ev.title}</div>
                    ${ev.description ? `<div style="font-size: 0.82rem; color: var(--gray-500); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ev.description}</div>` : ''}
                </td>
                <td><span class="${catInfo.class}">${catInfo.text}</span></td>
                <td><i class="fas fa-map-marker-alt" style="color: var(--blue); margin-right: 4px;"></i> ${ev.location || 'Sports Complex'}</td>
                <td><i class="fas fa-users" style="color: var(--gray-500); margin-right: 4px;"></i> ${ev.participants || 'Open to All'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-outline" onclick="editEvent('${ev.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="confirmDeleteEvent('${ev.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Also update Dashboard overview counter
    const elEvents = document.getElementById('totalEvents');
    if (elEvents) elEvents.textContent = events.length;
}

function editEvent(id) {
    const event = events.find(ev => ev.id === id);
    if (!event) return;

    document.getElementById('eventId').value = event.id;
    document.getElementById('eventTitle').value = event.title || '';
    document.getElementById('eventDate').value = event.date || '';
    document.getElementById('eventCategory').value = event.category || 'sports';
    document.getElementById('eventLocation').value = event.location || '';
    document.getElementById('eventParticipants').value = event.participants || '';
    document.getElementById('eventDescription').value = event.description || '';

    document.getElementById('eventModalTitle').textContent = 'Edit Sports Event';
    document.getElementById('saveEventBtn').innerHTML = '<i class="fas fa-save"></i> Save Changes';

    document.getElementById('eventModal').classList.add('show');
}

function confirmDeleteEvent(id) {
    const event = events.find(ev => ev.id === id);
    if (!event) return;

    document.getElementById('deleteModalTitle').textContent = 'Delete Sports Event';
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete event "${event.title}" from the university calendar?`;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Event';
    confirmBtn.className = 'btn btn-danger';
    
    document.getElementById('deleteModal').classList.add('show');

    confirmBtn.onclick = async () => {
        try {
            await window.UniXsportAPI.deleteEventAdmin(id);
            events = events.filter(ev => ev.id !== id);
            showToast('Event removed successfully from database!', 'success');
        } catch (err) {
            events = events.filter(ev => ev.id !== id);
            showToast('Event removed.', 'info');
        }
        document.getElementById('deleteModal').classList.remove('show');
        renderEvents();
        initDashboard();
    };
}

// ========== Profile ==========
function renderAdminProfilePhoto(photoUrl) {
    const img = document.getElementById('profileImg');
    const placeholder = document.querySelector('#profilePhotoDisplay .placeholder-icon');
    const removeBtn = document.getElementById('removePhotoBtn');

    if (photoUrl && photoUrl.trim()) {
        if (img) {
            img.src = photoUrl;
            img.style.display = 'block';
        }
        if (placeholder) placeholder.style.setProperty('display', 'none');
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        if (img) {
            img.src = '';
            img.style.display = 'none';
        }
        if (placeholder) placeholder.style.removeProperty('display');
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function initProfile() {
    const elUserId = document.getElementById('profileUserId');
    if (elUserId) elUserId.textContent = currentAdmin.user_id || currentAdmin.userId || localStorage.getItem('user_id') || 'US001';
    document.getElementById('profileName').textContent = currentAdmin.name;
    document.getElementById('profileEmail').textContent = currentAdmin.email;
    document.getElementById('profileMemberSince').textContent = currentAdmin.memberSince;

    renderAdminProfilePhoto(currentAdmin.profileImage || currentAdmin.profilePhoto || localStorage.getItem('userAvatar') || '');

    document.getElementById('profilePhotoInput')?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async ev => {
                const dataUrl = ev.target.result;
                renderAdminProfilePhoto(dataUrl);

                try {
                    showToast('Uploading profile image to database...', 'info');
                    let res = null;
                    if (window.UniXsportAPI && typeof window.UniXsportAPI.uploadAdminProfilePhoto === 'function') {
                        res = await window.UniXsportAPI.uploadAdminProfilePhoto(dataUrl);
                    } else {
                        const token = localStorage.getItem('unixsport_jwt_token') || localStorage.getItem('token');
                        const response = await fetch('/api/admin/profile-photo', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                            },
                            body: JSON.stringify({ image: dataUrl })
                        });
                        res = await response.json();
                    }

                    if (res && res.success) {
                        currentAdmin.profileImage = res.profileImage || dataUrl;
                        currentAdmin.profilePhoto = currentAdmin.profileImage;
                        localStorage.setItem('userAvatar', currentAdmin.profileImage);
                        renderAdminProfilePhoto(currentAdmin.profileImage);
                        showToast('Profile photo updated and saved to database successfully!', 'success');
                    } else {
                        throw new Error(res?.error || 'Failed to save profile photo');
                    }
                } catch (err) {
                    console.error('Failed to upload profile photo:', err);
                    showToast(err.message || 'Failed to save photo in database', 'error');
                }
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('uploadPhotoBtn')?.addEventListener('click', () => {
        document.getElementById('profilePhotoInput')?.click();
    });

    document.getElementById('removePhotoBtn')?.addEventListener('click', async () => {
        try {
            if (window.UniXsportAPI && typeof window.UniXsportAPI.deleteAdminProfilePhoto === 'function') {
                await window.UniXsportAPI.deleteAdminProfilePhoto();
            } else {
                const token = localStorage.getItem('unixsport_jwt_token') || localStorage.getItem('token');
                await fetch('/api/admin/profile-photo', {
                    method: 'DELETE',
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                });
            }
            currentAdmin.profileImage = '';
            currentAdmin.profilePhoto = '';
            localStorage.removeItem('userAvatar');
            renderAdminProfilePhoto('');
            showToast('Profile photo removed from database.', 'success');
        } catch (err) {
            console.error('Failed to delete photo:', err);
            showToast(err.message || 'Failed to remove photo', 'error');
        }
    });
}

// ========== Modals ==========
document.getElementById('addUserBtn')?.addEventListener('click', () => {
    document.getElementById('userModalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    const idGroup = document.getElementById('userIdDisplayGroup');
    if (idGroup) idGroup.style.display = 'none';
    document.getElementById('userPasswordGroup').style.display = 'block';
    document.getElementById('userPassword').required = true;
    document.getElementById('userModal').classList.add('show');
});

document.getElementById('closeUserModal')?.addEventListener('click', () => {
    document.getElementById('userModal').classList.remove('show');
});

document.getElementById('cancelUserBtn')?.addEventListener('click', () => {
    document.getElementById('userModal').classList.remove('show');
});

document.getElementById('userForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const password = document.getElementById('userPassword').value;
    const role = document.getElementById('userRole').value;
    const rfid = document.getElementById('userRfid').value.trim();

    if (!name || !email) {
        showToast('Name and email are required.', 'error');
        return;
    }

    if (rfid) {
        const cleanTag = rfid.trim().toUpperCase();
        const normalize = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const normalized = normalize(cleanTag);

        const dupUser = users.find(u => {
            if (String(u.id) === String(id)) return false;
            const uTag = normalize(u.rfidTag || u.rfidCode || '');
            return uTag && uTag === normalized;
        });
        if (dupUser) {
            showToast(`RFID Code '${cleanTag}' is already assigned to user: ${dupUser.name}.`, 'error');
            return;
        }

        const dupEquip = (equipment || []).find(e => {
            const eTag = normalize(e.rfidTag || e.rfidCode || e.rfid || '');
            return eTag && eTag === normalized;
        });
        if (dupEquip) {
            showToast(`RFID Code '${cleanTag}' is already assigned to equipment item: '${dupEquip.name}'.`, 'error');
            return;
        }
    }

    if (!id && !password) {
        showToast('Password is required for new users.', 'error');
        return;
    }

    if (!id && password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (id) {
            await window.UniXsportAPI.updateUserAdmin(id, {
                name,
                email,
                role,
                rfidTag: rfid || '',
                password: password || undefined
            });
            showToast('User updated successfully in database!', 'success');
        } else {
            const prefix = role === 'student' ? 'STU' : (role === 'coach' ? 'COACH' : (role === 'storekeeper' ? 'STORE' : 'ADMIN'));
            const regNo = rfid || (prefix + Date.now().toString().slice(-4));
            await window.UniXsportAPI.createUser({
                regNo,
                name,
                email,
                password: password || 'password123',
                role,
                rfidTag: rfid || '',
                department: role === 'admin' ? 'Administration' : (role === 'storekeeper' ? 'Sports Store' : (role === 'coach' ? 'Sports Coaching' : 'General'))
            });
            showToast('User created successfully in database!', 'success');
        }

        await loadAdminData();
        document.getElementById('userModal').classList.remove('show');
        renderUsers();
        initDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to save user in database', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});

function editUser(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;

    document.getElementById('userModalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    const idGroup = document.getElementById('userIdDisplayGroup');
    const idInput = document.getElementById('userDisplayId');
    if (idGroup) idGroup.style.display = 'block';
    if (idInput) idInput.value = user.user_id || user.userId || '';
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userRole').value = user.role;
    document.getElementById('userRfid').value = user.rfidCode || user.rfidTag || '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPasswordGroup').style.display = 'block';
    document.getElementById('userPassword').required = false;
    document.getElementById('userPassword').placeholder = 'Leave blank to keep current';
    document.getElementById('userModal').classList.add('show');
}

function confirmDeleteUser(id) {
    const user = users.find(u => String(u.id) === String(id));
    if (!user) return;

    document.getElementById('deleteModalTitle').textContent = 'Delete User';
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete ${user.name}? This action cannot be undone.`;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    confirmBtn.className = 'btn btn-danger';
    
    document.getElementById('deleteModal').classList.add('show');

    confirmBtn.onclick = async () => {
        try {
            await window.UniXsportAPI.deleteUser(id);
            showToast('User deleted from database!', 'success');
        } catch (e) {
            showToast('User removed.', 'info');
        }
        await loadAdminData();
        document.getElementById('deleteModal').classList.remove('show');
        renderUsers();
        initDashboard();
    };
}

// Equipment Modals
document.getElementById('addEquipmentBtn')?.addEventListener('click', () => {
    document.getElementById('equipmentModalTitle').textContent = 'Add Equipment';
    document.getElementById('equipmentForm').reset();
    document.getElementById('equipmentId').value = '';
    const roomSelect = document.getElementById('equipmentRoom');
    roomSelect.innerHTML = '<option value="">Select room...</option>';
    sportsRooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        roomSelect.appendChild(opt);
    });
    document.getElementById('equipmentModal').classList.add('show');
});

document.getElementById('closeEquipmentModal')?.addEventListener('click', () => {
    document.getElementById('equipmentModal').classList.remove('show');
});

document.getElementById('cancelEquipmentBtn')?.addEventListener('click', () => {
    document.getElementById('equipmentModal').classList.remove('show');
});

document.getElementById('equipmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('equipmentId').value;
    const name = document.getElementById('equipmentName').value.trim();
    const quantity = parseInt(document.getElementById('equipmentQuantity').value) || 0;
    const status = document.getElementById('equipmentStatus').value;
    const roomId = parseInt(document.getElementById('equipmentRoom').value);
    const room = sportsRooms.find(r => r.id === roomId);

    if (!name || quantity < 1 || !roomId) {
        showToast('Please fill all required fields.', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        if (id) {
            await window.UniXsportAPI.updateEquipmentAdmin(id, {
                name,
                totalQty: quantity,
                availableQty: status === 'available' ? quantity : 0,
                borrowedQty: status === 'borrowed' ? quantity : 0,
                damagedQty: status === 'damaged' ? quantity : 0,
                status,
                sportsRoom: room?.name || 'Main Gym Hall',
                description: document.getElementById('equipmentDescription')?.value || ''
            });
            showToast('Equipment updated successfully in database!', 'success');
        } else {
            await window.UniXsportAPI.addEquipmentAdmin({
                name,
                category: 'Sports Equipment',
                totalQty: quantity,
                sportsRoom: room?.name || 'Main Gym Hall',
                location: room?.name || 'Building A',
                description: document.getElementById('equipmentDescription')?.value || ''
            });
            showToast('Equipment added to database!', 'success');
        }

        await loadAdminData();
        document.getElementById('equipmentModal').classList.remove('show');
        renderEquipment();
        initDashboard();
    } catch (err) {
        showToast(err.message || 'Failed to save equipment', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});

function editEquipment(id) {
    const eq = equipment.find(e => String(e.id) === String(id));
    if (!eq) return;

    document.getElementById('equipmentModalTitle').textContent = 'Edit Equipment';
    document.getElementById('equipmentId').value = eq.id;
    document.getElementById('equipmentName').value = eq.name;
    document.getElementById('equipmentQuantity').value = eq.quantity || eq.total || 1;
    document.getElementById('equipmentStatus').value = eq.status || 'available';
    document.getElementById('equipmentRoom').innerHTML = '';
    sportsRooms.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        opt.selected = r.name === eq.sportsRoom || r.id === eq.roomId;
        document.getElementById('equipmentRoom').appendChild(opt);
    });
    document.getElementById('equipmentDescription').value = eq.description || '';
    document.getElementById('equipmentModal').classList.add('show');
}

function confirmDeleteEquipment(id) {
    const eq = equipment.find(e => String(e.id) === String(id));
    if (!eq) return;

    document.getElementById('deleteModalTitle').textContent = 'Delete Equipment';
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete ${eq.name}?`;
    
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
    confirmBtn.className = 'btn btn-danger';
    
    document.getElementById('deleteModal').classList.add('show');

    confirmBtn.onclick = async () => {
        try {
            await window.UniXsportAPI.deleteEquipmentAdmin(id);
            showToast('Equipment deleted from database!', 'success');
        } catch(e) {
            showToast(e.message || 'Equipment removed.', 'info');
        }
        await loadAdminData();
        document.getElementById('deleteModal').classList.remove('show');
        renderEquipment();
        initDashboard();
    };
}

// Profile Modals
document.getElementById('editProfileBtn')?.addEventListener('click', () => {
    document.getElementById('editProfileName').value = currentAdmin.name;
    document.getElementById('editProfileEmail').value = currentAdmin.email;
    document.getElementById('editProfileModal').classList.add('show');
});

document.getElementById('closeEditProfileModal')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').classList.remove('show');
});

document.getElementById('cancelEditProfileBtn')?.addEventListener('click', () => {
    document.getElementById('editProfileModal').classList.remove('show');
});

document.getElementById('editProfileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const newName = document.getElementById('editProfileName').value.trim();
    const newEmail = document.getElementById('editProfileEmail').value.trim();

    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.updateAdminProfile === 'function') {
            await window.UniXsportAPI.updateAdminProfile({ name: newName, email: newEmail });
        }
        currentAdmin.name = newName;
        currentAdmin.email = newEmail;
        document.getElementById('profileName').textContent = currentAdmin.name;
        document.getElementById('profileEmail').textContent = currentAdmin.email;
        document.getElementById('adminName').textContent = currentAdmin.name;
        localStorage.setItem('userName', newName);
        localStorage.setItem('userEmail', newEmail);
        document.getElementById('editProfileModal').classList.remove('show');
        showToast('Profile updated successfully in database!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to update profile in database', 'error');
    }
});

document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordModal').classList.add('show');
});

document.getElementById('closeChangePasswordModal')?.addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('show');
});

document.getElementById('cancelChangePasswordBtn')?.addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('show');
});

document.getElementById('changePasswordForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const currentPwd = document.getElementById('currentPassword').value;
    const newPwd = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('confirmPassword').value;

    if (!currentPwd) {
        showToast('Please enter your current password.', 'error');
        return;
    }

    if (newPwd.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast('New passwords do not match.', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    }

    try {
        let res = null;
        if (window.UniXsportAPI && typeof window.UniXsportAPI.changePassword === 'function') {
            res = await window.UniXsportAPI.changePassword(currentPwd, newPwd);
        } else {
            const token = window.UniXsportAPI ? window.UniXsportAPI.getToken('admin') : (localStorage.getItem('token') || sessionStorage.getItem('token'));
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
            });
            res = await response.json();
            if (!response.ok || !res.success) {
                throw new Error(res?.error || 'Failed to update password.');
            }
        }

        document.getElementById('changePasswordModal').classList.remove('show');
        document.getElementById('changePasswordForm').reset();
        showToast(res?.message || 'Password changed successfully in database!', 'success');
    } catch (err) {
        showToast(err.message || 'Failed to change password. Please verify your current password.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Change Password';
        }
    }
});

// Delete Modal
document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
    document.getElementById('deleteModal').classList.remove('show');
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('show');
    });
});

// ========== Utilities ==========
function formatDateTime(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatVisibleTo(val, notice) {
    if (val === 'specific_user' || (notice && notice.targetUserId)) {
        const targetName = notice && notice.targetUserName ? notice.targetUserName : (notice && notice.targetUserId ? notice.targetUserId : 'Selected User');
        return `To: ${targetName}`;
    }
    const map = {
        'all': 'All Users',
        'students': 'Students Only',
        'coaches': 'Coaches Only',
        'admins': 'Admin Only',
        'admin': 'Admin Only',
        'storekeepers': 'Storekeepers (Inventory) Only'
    };
    return map[val] || val;
}

window.editUser = editUser;
window.confirmDeleteUser = confirmDeleteUser;
window.editEquipment = editEquipment;
window.confirmDeleteEquipment = confirmDeleteEquipment;
window.deleteNotice = deleteNotice;
window.showToast = showToast;
window.renderDashboardCharts = renderDashboardCharts;

// ========== Technological Charts Section ==========
function renderDashboardCharts() {
    const totalStudents = users.filter(u => u.role === 'student').length;
    const totalCoaches = users.filter(u => u.role === 'coach').length;
    
    // Sum of actual equipment quantities across all categories
    const available = equipment.reduce((s, e) => s + e.available, 0);
    const borrowed = equipment.reduce((s, e) => s + e.borrowed, 0);
    const damaged = equipment.reduce((s, e) => s + e.damaged, 0);
    const totalItems = available + borrowed + damaged;

    // 1. Donut Chart rendering
    const donutTotalCountEl = document.getElementById('donutTotalCount');
    if (donutTotalCountEl) donutTotalCountEl.textContent = totalItems;

    const circumference = 188.4;
    const donutAvailable = document.getElementById('donutAvailable');
    const donutBorrowed = document.getElementById('donutBorrowed');
    const donutDamaged = document.getElementById('donutDamaged');

    if (totalItems > 0) {
        const pctAvailable = available / totalItems;
        const pctBorrowed = borrowed / totalItems;
        const pctDamaged = damaged / totalItems;

        const dashAvailable = pctAvailable * circumference;
        const dashBorrowed = pctBorrowed * circumference;
        const dashDamaged = pctDamaged * circumference;

        if (donutAvailable) {
            donutAvailable.style.strokeDasharray = `${dashAvailable} ${circumference}`;
            donutAvailable.style.strokeDashoffset = 0;
        }
        if (donutBorrowed) {
            donutBorrowed.style.strokeDasharray = `${dashBorrowed} ${circumference}`;
            donutBorrowed.style.strokeDashoffset = -dashAvailable;
        }
        if (donutDamaged) {
            donutDamaged.style.strokeDasharray = `${dashDamaged} ${circumference}`;
            donutDamaged.style.strokeDashoffset = -(dashAvailable + dashBorrowed);
        }
    } else {
        if (donutAvailable) donutAvailable.style.strokeDasharray = `0 ${circumference}`;
        if (donutBorrowed) donutBorrowed.style.strokeDasharray = `0 ${circumference}`;
        if (donutDamaged) donutDamaged.style.strokeDasharray = `0 ${circumference}`;
    }

    // 2. User Engagement Ratio Progress Bars
    const totalUsers = totalStudents + totalCoaches;
    const pctStudents = totalUsers > 0 ? (totalStudents / totalUsers) * 100 : 0;
    const pctCoaches = totalUsers > 0 ? (totalCoaches / totalUsers) * 100 : 0;

    const barStudentCountEl = document.getElementById('barStudentCount');
    const barCoachCountEl = document.getElementById('barCoachCount');
    const barStudentFillEl = document.getElementById('barStudentFill');
    const barCoachFillEl = document.getElementById('barCoachFill');

    if (barStudentCountEl) barStudentCountEl.textContent = `${totalStudents} (${pctStudents.toFixed(0)}%)`;
    if (barCoachCountEl) barCoachCountEl.textContent = `${totalCoaches} (${pctCoaches.toFixed(0)}%)`;

    // Trigger width transition with a slight delay for drawing animation
    setTimeout(() => {
        if (barStudentFillEl) barStudentFillEl.style.width = `${pctStudents}%`;
        if (barCoachFillEl) barCoachFillEl.style.width = `${pctCoaches}%`;
    }, 100);
}

// ========== Toast Notification System ==========
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-circle';

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${iconClass}"></i></div>
        <div class="toast-message">${message}</div>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    const closeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    };

    toast.querySelector('.toast-close').addEventListener('click', closeToast);
    setTimeout(closeToast, 4000);
}

// ========== RFID Scanner Logic ==========
let rfidScanTimer = null;
let rfidScanCountdown = 25;
let rfidScanAutoSimTimeout = null;
let adminRfidSse = null;
let adminRfidPoll = null;

function initRfidScanner() {
    const scanBtn = document.getElementById('scanRfidBtn');
    const simulateBtn = document.getElementById('simulateRfidTapBtn');
    const cancelBtn = document.getElementById('cancelRfidScanBtn');
    const closeBtn = document.getElementById('closeRfidScanModal');
    const modal = document.getElementById('rfidScanModal');
    const rfidInput = document.getElementById('userRfid');
    const timerEl = document.getElementById('rfidTimer');
    const statusEl = document.getElementById('rfidScanStatus');
    const radar = document.getElementById('adminRadarScanner');
    const currentInfoBox = document.getElementById('adminCurrentRfidInfo');
    const currentTagEl = document.getElementById('adminCurrentRfidTag');

    if (!scanBtn || !modal) return;

    let isScanning = false;
    let sessionStartTime = 0;
    let lastPolledScanId = null;

    const stopScan = () => {
        isScanning = false;
        if (rfidScanTimer) clearInterval(rfidScanTimer);
        if (rfidScanAutoSimTimeout) clearTimeout(rfidScanAutoSimTimeout);
        if (adminRfidPoll) clearInterval(adminRfidPoll);
        if (adminRfidSse) {
            try { adminRfidSse.close(); } catch(e) {}
            adminRfidSse = null;
        }
        radar?.classList.remove('scanning');
        modal.classList.remove('show');
    };

    function handleCardDetection(scannedTag) {
        if (!isScanning) return;
        const cleanTag = String(scannedTag || '').trim().replace(/\s+/g, ' ').toUpperCase();
        if (!cleanTag) return;

        const currentUserId = document.getElementById('userId')?.value || '';
        const normalize = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const normalizedInput = normalize(cleanTag);

        // 1. Check if assigned to another user
        const duplicateUser = users.find(u => {
            if (String(u.id) === String(currentUserId)) return false;
            const uTag = normalize(u.rfidTag || u.rfidCode || '');
            return uTag && uTag === normalizedInput;
        });

        if (duplicateUser) {
            statusEl.className = 'scan-status-message error';
            statusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Tag <strong>${cleanTag}</strong> is already assigned to user ${duplicateUser.name} (${duplicateUser.user_id || duplicateUser.regNo || 'User'})! Please tap a different card.`;
            showToast(`Tag ${cleanTag} already assigned to user ${duplicateUser.name}`, 'error');
            return;
        }

        // 2. Check if assigned to an equipment item
        const duplicateEquipment = (equipment || []).find(e => {
            const eTag = normalize(e.rfidTag || e.rfidCode || e.rfid || '');
            return eTag && eTag === normalizedInput;
        });

        if (duplicateEquipment) {
            statusEl.className = 'scan-status-message error';
            statusEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Tag <strong>${cleanTag}</strong> is already assigned to equipment item <strong>${duplicateEquipment.name}</strong> (${duplicateEquipment.id || 'Equipment'})! Please tap a different card.`;
            showToast(`Tag ${cleanTag} already assigned to equipment item '${duplicateEquipment.name}'`, 'error');
            return;
        }

        // Accept and populate new / updated RFID tag
        isScanning = false;
        if (rfidScanTimer) clearInterval(rfidScanTimer);
        if (rfidScanAutoSimTimeout) clearTimeout(rfidScanAutoSimTimeout);
        if (adminRfidPoll) clearInterval(adminRfidPoll);
        if (adminRfidSse) {
            try { adminRfidSse.close(); } catch(e) {}
            adminRfidSse = null;
        }
        radar?.classList.remove('scanning');

        const existingVal = rfidInput.value ? rfidInput.value.trim().toUpperCase() : '';
        const wasReplaced = existingVal && existingVal !== cleanTag;

        statusEl.className = 'scan-status-message success';
        statusEl.innerHTML = wasReplaced
            ? `<i class="fas fa-check-circle"></i> RFID Tag Replaced! New Code: <strong>${cleanTag}</strong>`
            : `<i class="fas fa-check-circle"></i> Scan Successful! Code: <strong>${cleanTag}</strong>`;

        rfidInput.value = cleanTag;
        showToast(wasReplaced ? `RFID tag updated to: ${cleanTag}` : `RFID Tag Captured: ${cleanTag}`, 'success');

        // Auto close scanner modal after 1.2 seconds so admin is back in user edit form
        setTimeout(() => {
            modal.classList.remove('show');
        }, 1200);
    }

    scanBtn.addEventListener('click', () => {
        isScanning = true;
        sessionStartTime = Date.now();
        lastPolledScanId = null;

        // Show current RFID info if editing an existing user with an assigned card
        const currentRfid = (rfidInput?.value || '').trim();
        if (currentInfoBox && currentTagEl) {
            if (currentRfid) {
                currentTagEl.textContent = currentRfid;
                currentInfoBox.style.display = 'block';
            } else {
                currentInfoBox.style.display = 'none';
            }
        }

        // Open modal
        modal.classList.add('show');
        statusEl.className = 'scan-status-message info';
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanner active. Place/tap RFID card on ESP32 reader...';
        rfidScanCountdown = 25;
        timerEl.textContent = rfidScanCountdown;
        
        // Start radar animation
        radar?.classList.add('scanning');

        // Start countdown timer
        if (rfidScanTimer) clearInterval(rfidScanTimer);
        rfidScanTimer = setInterval(() => {
            rfidScanCountdown--;
            timerEl.textContent = rfidScanCountdown;
            
            if (rfidScanCountdown <= 0) {
                stopScan();
                statusEl.className = 'scan-status-message error';
                statusEl.textContent = 'Scan timeout! No card detected.';
            }
        }, 1000);

        // 1. Live SSE Hardware Stream Listener
        try {
            if (window.EventSource) {
                adminRfidSse = new EventSource(`${getAdminApiBase()}/api/rfid/events`);
                const onScan = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data && data.rfidTag) {
                            handleCardDetection(data.rfidTag);
                        }
                    } catch (err) {}
                };
                adminRfidSse.addEventListener('scan_packet', onScan);
                adminRfidSse.addEventListener('user_scan', onScan);
                adminRfidSse.addEventListener('equipment_scan', onScan);
                adminRfidSse.addEventListener('unauthorized_scan', onScan);
            }
        } catch (e) {}

        // 2. Continuous Hardware Gateway Polling (Ensures Instant Tap Detection)
        if (adminRfidPoll) clearInterval(adminRfidPoll);
        adminRfidPoll = setInterval(async () => {
            if (!isScanning) return;
            try {
                const res = await fetch(`${getAdminApiBase()}/api/rfid/latest-scan`).then(r => r.json());
                if (res && res.success && res.scan && res.scan.rfidTag) {
                    const scan = res.scan;
                    if (scan.timestamp >= sessionStartTime && scan.id !== lastPolledScanId) {
                        lastPolledScanId = scan.id;
                        handleCardDetection(scan.rfidTag);
                    }
                }
            } catch (err) {}
        }, 350);
    });

    simulateBtn?.addEventListener('click', () => {
        // Generate random RFID code for demo/simulation
        const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
        handleCardDetection(randomHex);
    });

    cancelBtn?.addEventListener('click', stopScan);
    closeBtn?.addEventListener('click', stopScan);
    modal.addEventListener('click', e => {
        if (e.target === modal) stopScan();
    });
}
