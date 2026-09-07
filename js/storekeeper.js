/**
 * UniXsport - Storekeeper Dashboard
 * Main Application JavaScript
 */

function getUniXsportToken() {
    return (window.UniXsportAPI && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken('storekeeper') : '') ||
           sessionStorage.getItem('unixsport_token_storekeeper') ||
           sessionStorage.getItem('unixsport_jwt_token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('unixsport_token_storekeeper') ||
           localStorage.getItem('unixsport_jwt_token') ||
           localStorage.getItem('token') ||
           '';
}

function getStorekeeperApiBase() {
    return (typeof window !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');
}

// ========== Data Storage (Connected 100% to Local Database) ==========
let equipmentStock = [];
let borrowHistory = [];
let students = [];
let notifications = [];

// ========== Live Database Sync ==========
async function loadStorekeeperDatabase() {
    try {
        let res = null;

        // 1. Try UniXsportAPI
        if (window.UniXsportAPI && typeof window.UniXsportAPI.getStorekeeperDashboard === 'function') {
            try {
                res = await window.UniXsportAPI.getStorekeeperDashboard();
            } catch (e) {
                console.warn('UniXsportAPI dashboard fetch notice:', e.message);
            }
        }

        // 2. Try relative /api/storekeeper/dashboard
        if (!res || !res.success) {
            try {
                const raw = await fetch('/api/storekeeper/dashboard');
                if (raw.ok) {
                    const parsed = await raw.json();
                    if (parsed && parsed.success) res = parsed;
                }
            } catch (e) {}
        }

        // 3. Try absolute http://localhost:5000/api/storekeeper/dashboard
        if (!res || !res.success) {
            try {
                const raw = await fetch('http://localhost:5000/api/storekeeper/dashboard');
                if (raw.ok) {
                    const parsed = await raw.json();
                    if (parsed && parsed.success) res = parsed;
                }
            } catch (e) {}
        }

        if (res && res.success) {
            equipmentStock = (res.equipment || []).map(e => ({
                id: e.id,
                name: e.name,
                category: e.category || 'Sports Equipment',
                total: e.totalQty !== undefined ? e.totalQty : (e.total !== undefined ? e.total : 1),
                totalQty: e.totalQty !== undefined ? e.totalQty : (e.total !== undefined ? e.total : 1),
                available: e.availableQty !== undefined ? e.availableQty : (e.available !== undefined ? e.available : 1),
                availableQty: e.availableQty !== undefined ? e.availableQty : (e.available !== undefined ? e.available : 1),
                borrowed: e.borrowedQty !== undefined ? e.borrowedQty : (e.borrowed !== undefined ? e.borrowed : 0),
                damaged: e.damagedQty !== undefined ? e.damagedQty : (e.damaged !== undefined ? e.damaged : 0),
                status: e.status || 'available',
                sportsRoom: e.room || e.sportsRoom || e.location || 'Main Gym Hall',
                room: e.room || e.sportsRoom || e.location || 'Main Gym Hall',
                rfidTag: e.rfidTag || e.rfidCode || e.rfid || ''
            }));
            borrowHistory = res.borrowLogs || [];
            if (Array.isArray(res.students)) {
                students = res.students;
            }

            // Immediately populate all dependent UI elements
            populateTerminalEquipmentOptions();
            renderStockTable();
            updateDashboardStats();
            if (typeof renderBorrowHistory === 'function') renderBorrowHistory();
            return res;
        }
    } catch(err) {
        console.error('Failed to load storekeeper dashboard from database:', err);
    }
    return null;
}
window.loadStorekeeperDatabase = loadStorekeeperDatabase;

document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSidebar();
    initDarkMode();
    initNotifications();
    initRFIDScan();
    initStockManagement();
    initRfidAssignmentPage();
    initBorrowHistory();
    initNotificationsPage();
    initMonthlyReportPage();
    initStepper();

    // Immediately load live database and update stats
    await loadStorekeeperDatabase();
    updateDashboardStats();
    initStorekeeperAutoRefresh();
});

// ========== Automatic Live Data Refresh ==========
let storekeeperRefreshInterval = null;

async function autoRefreshStorekeeperData() {
    const activeModal = document.querySelector('.modal.show, .modal[style*="display: block"]');
    const isTyping = document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.tagName === 'SELECT'
    );

    if (!activeModal && !isTyping) {
        await loadStorekeeperDatabase();
        if (typeof fetchStorekeeperNotices === 'function') {
            await fetchStorekeeperNotices();
        }
    }
}

function initStorekeeperAutoRefresh() {
    if (storekeeperRefreshInterval) clearInterval(storekeeperRefreshInterval);
    storekeeperRefreshInterval = setInterval(() => {
        autoRefreshStorekeeperData();
    }, 10000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            autoRefreshStorekeeperData();
        }
    });

    window.addEventListener('focus', () => {
        autoRefreshStorekeeperData();
    });
}

// ========== Quantity Stepper Logic ==========
function initStepper() {
    const decBtn = document.getElementById('stepperDec');
    const incBtn = document.getElementById('stepperInc');
    const input = document.getElementById('quantityInput');

    decBtn?.addEventListener('click', () => {
        let val = parseInt(input.value) || 1;
        val = Math.max(1, val - 1);
        input.value = val;
    });

    incBtn?.addEventListener('click', () => {
        let val = parseInt(input.value) || 1;
        const max = parseInt(input.max) || 9999;
        val = Math.min(max, val + 1);
        input.value = val;
    });
}

// ========== Navigation ==========
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    async function showPage(pageId) {
        pages.forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageId);
        });
        if (typeof window.closeSidebar === 'function') window.closeSidebar();
        
        await loadStorekeeperDatabase();
        // Refresh data when switching pages
        if (pageId === 'dashboard') initDashboard();
        if (pageId === 'stock-management') renderStockTable();
        if (pageId === 'borrow-history') renderBorrowHistory();
        if (pageId === 'notifications' || pageId === 'notices') initNotificationsPage();
        if (pageId === 'monthly-report') initMonthlyReportPage();
        if (pageId === 'rfid-assignment') {
            fetchRfidRegistryData();
            setTimeout(() => {
                document.getElementById('assignStudentSearchInput')?.focus();
            }, 100);
        }
        if (pageId === 'rfid-scan') {
            // Reset to scan section and focus input
            setTimeout(() => {
                const studentRFIDInput = document.getElementById('studentRFIDInput');
                const scanSection = document.getElementById('studentScanSection');
                const activitySection = document.getElementById('studentActivitySection');
                if (studentRFIDInput && scanSection && activitySection) {
                    if (activitySection.style.display === 'block') {
                        resetStudentSession();
                    } else {
                        studentRFIDInput.focus();
                    }
                }
            }, 100);
        }
    }

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-page]');
        if (trigger) {
            e.preventDefault();
            showPage(trigger.dataset.page);
        }
    });

    window.showPage = showPage;
}

// ========== Sidebar (Mobile) ==========
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

// ========== Storekeeper Broadcast Notifications ==========
let storekeeperBroadcastNotices = [];

async function fetchStorekeeperNotices() {
    try {
        const endpoints = [
            '/api/notices',
            'http://localhost:5000/api/notices',
            'http://127.0.0.1:5000/api/notices'
        ];
        const token = getUniXsportToken();
        for (const ep of endpoints) {
            try {
                const res = await fetch(ep, {
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.notices)) {
                        storekeeperBroadcastNotices = data.notices;
                        break;
                    }
                }
            } catch(e) {}
        }
    } catch(err) {
        console.warn('Storekeeper notices load notice:', err);
    }
    renderStorekeeperHeaderNotifications();
}

function dismissStorekeeperNotice(noticeId, event) {
    if (event) event.stopPropagation();
    try {
        let dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_sk') || '[]');
        if (!dismissed.includes(String(noticeId))) {
            dismissed.push(String(noticeId));
            localStorage.setItem('unixsport_dismissed_notices_sk', JSON.stringify(dismissed));
        }
    } catch(e) {}
    renderStorekeeperHeaderNotifications();
}
window.dismissStorekeeperNotice = dismissStorekeeperNotice;

function renderStorekeeperHeaderNotifications() {
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');
    if (!panel) return;

    let dismissed = [];
    try {
        dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_sk') || '[]');
    } catch(e) {}

    const activeNotices = (storekeeperBroadcastNotices || []).filter(n => !dismissed.includes(String(n.id)));

    if (!activeNotices || activeNotices.length === 0) {
        panel.innerHTML = `
            <h4>Broadcast Notices</h4>
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

    const lastRead = parseInt(localStorage.getItem('unixsport_notices_last_read_sk') || '0', 10);
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
        <h4>Broadcast Notices (${activeNotices.length})</h4>
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
                            <span style="font-size: 0.75rem; color: var(--gray-400); display: block; overflow-wrap: anywhere; word-break: break-word;">${n.createdBy || 'Staff'} • ${n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</span>
                        </div>
                    </div>
                    <button type="button" class="btn-close-notice" onclick="dismissStorekeeperNotice('${n.id}', event)" style="background: transparent; border: none; color: var(--gray-400); cursor: pointer; padding: 2px 4px; border-radius: 4px; font-size: 0.85rem; line-height: 1; flex-shrink: 0; transition: color 0.2s;" title="Dismiss" aria-label="Dismiss">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('')}
    `;
}

// ========== Notifications Dropdown ==========
function initNotifications() {
    const btn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !panel?.classList.contains('show');
        panel?.classList.toggle('show');

        if (willOpen) {
            localStorage.setItem('unixsport_notices_last_read_sk', Date.now().toString());
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

    fetchStorekeeperNotices();
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

// ========== Logout ==========
function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.logout === 'function') {
            window.UniXsportAPI.logout();
        } else {
            localStorage.removeItem('userRole');
            localStorage.removeItem('userName');
            localStorage.removeItem('userProfile');
            window.location.replace('home.html');
        }
    }
}

document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
document.getElementById('sidebarLogout')?.addEventListener('click', (e) => {
    e.preventDefault();
    handleLogout();
});

// ========== Dashboard Stats ==========
function updateDashboardStats() {
    const statTotalItems = document.getElementById('statTotalItems');
    const statBorrowedItems = document.getElementById('statBorrowedItems');
    const statLowStock = document.getElementById('statLowStock');
    const statDamagedItems = document.getElementById('statDamagedItems');

    const totalCategories = equipmentStock.length;

    // Borrowed items: check active logs in borrowHistory plus any marked as borrowed in inventory
    const activeBorrowedLogsCount = borrowHistory.filter(b => b.status === 'taken' || b.status === 'borrowed').length;
    const totalBorrowedFromStock = equipmentStock.reduce((sum, e) => sum + (e.borrowedQty || e.borrowed || 0), 0);
    const totalBorrowed = Math.max(activeBorrowedLogsCount, totalBorrowedFromStock);

    // Low stock count (status is low-stock/out-of-stock OR available <= 3)
    const lowStockCount = equipmentStock.filter(e => {
        const st = (e.status || '').toLowerCase();
        const avail = e.available !== undefined ? e.available : (e.availableQty !== undefined ? e.availableQty : 0);
        return st === 'low-stock' || st === 'out-of-stock' || avail <= 3;
    }).length;

    // Damaged / Under Repair count (status is maintenance/damaged OR damagedQty > 0)
    const damagedCount = equipmentStock.reduce((sum, e) => {
        const st = (e.status || '').toLowerCase();
        const hasDamagedQty = (e.damagedQty || e.damaged || 0);
        if (st === 'maintenance' || st === 'damaged') {
            return sum + (hasDamagedQty > 0 ? hasDamagedQty : 1);
        }
        return sum + hasDamagedQty;
    }, 0);

    if (statTotalItems) statTotalItems.textContent = totalCategories;
    if (statBorrowedItems) statBorrowedItems.textContent = totalBorrowed;
    if (statLowStock) statLowStock.textContent = lowStockCount;
    if (statDamagedItems) statDamagedItems.textContent = damagedCount;
}
window.updateDashboardStats = updateDashboardStats;

function initDashboard() {
    updateDashboardStats();
}
window.initDashboard = initDashboard;

/// ========== Smart RFID Counter Terminal Logic ==========
let activeTerminalStudent = null;

let terminalCart = [];

function initRFIDScan() {
    initSmartTerminal();
}

function initSmartTerminal() {
    const studentSearchInput = document.getElementById('terminalStudentSearch');
    const btnLookupStudent = document.getElementById('btnLookupStudent');
    const btnClearStudent = document.getElementById('btnClearStudent');
    const equipmentSelect = document.getElementById('terminalEquipmentSelect');
    const qtyInput = document.getElementById('terminalQtyInput');
    const btnQtyMinus = document.getElementById('btnQtyMinus');
    const btnQtyPlus = document.getElementById('btnQtyPlus');
    const btnAddItemToCart = document.getElementById('btnAddItemToCart');
    const btnResetCart = document.getElementById('btnResetCart');
    const btnCompleteIssue = document.getElementById('btnCompleteIssue');

    function setHardwareStatus(isOnline, detailMessage) {
        const statusText = document.getElementById('rfidStatusText');
        const card = document.getElementById('esp32HardwareCard');
        const title = document.getElementById('hardwareStatusTitle');
        const desc = document.getElementById('hardwareStatusDesc');
        const iconBox = document.getElementById('hardwareIconBox');
        const icon = document.getElementById('hardwareIcon');

        if (isOnline) {
            if (statusText) statusText.textContent = '🟢 RFID Scanner is Online';
            if (title) {
                title.textContent = '🟢 RFID Scanner is Online';
                title.style.color = '#16a34a';
            }
            if (desc) {
                desc.textContent = detailMessage || 'ESP32 Hardware scanner active via USB port. Ready to receive card swipes.';
            }
            if (iconBox) {
                iconBox.style.background = 'rgba(22, 163, 74, 0.15)';
                iconBox.style.color = '#16a34a';
            }
            if (icon) {
                icon.className = 'fas fa-wifi text-green';
            }
            if (card) {
                card.style.borderColor = 'rgba(22, 163, 74, 0.5)';
                card.style.boxShadow = '0 0 15px rgba(22, 163, 74, 0.2)';
            }
        } else {
            if (statusText) statusText.textContent = '🔴 RFID Scanner is Offline';
            if (title) {
                title.textContent = '🔴 RFID Scanner is Offline';
                title.style.color = '#ef4444';
            }
            if (desc) {
                desc.textContent = detailMessage || 'ESP32 USB cable disconnected. Plug in USB cable to activate scanner.';
            }
            if (iconBox) {
                iconBox.style.background = 'rgba(239, 68, 68, 0.12)';
                iconBox.style.color = '#ef4444';
            }
            if (icon) {
                icon.className = 'fas fa-plug-circle-xmark';
            }
            if (card) {
                card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                card.style.boxShadow = 'none';
            }
        }
    }

    // Listen for automatic USB hardware insertion / removal
    if ('serial' in navigator) {
        navigator.serial.addEventListener('disconnect', () => {
            setHardwareStatus(false, 'ESP32 USB Cable Plugged Off');
            showToast('🔴 RFID Scanner is Offline (Hardware Disconnected)', 'error');
        });

        navigator.serial.addEventListener('connect', () => {
            showToast('🔌 ESP32 USB Cable Plugged In — Click Connect USB Scanner to activate.', 'info');
        });
    }

    // Connect USB Scanner click handlers (Both header button & card button)
    const handleUsbConnect = async () => {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.connectUsbRfid === 'function') {
            const connected = await window.UniXsportAPI.connectUsbRfid(
                (scannedUid) => {
                    showToast(`USB RFID Card Swiped: ${scannedUid}`, 'success');
                    quickLoadStudent(scannedUid);
                },
                () => {
                    setHardwareStatus(false, 'ESP32 USB Cable Plugged Off');
                    showToast('🔴 RFID Scanner is Offline (Hardware Disconnected)', 'error');
                }
            );

            if (connected) {
                setHardwareStatus(true, 'ESP32 USB Serial Port Active');
                showToast('🟢 RFID Scanner is Online! Ready for card swipes.', 'success');
            }
        } else {
            showToast('Web Serial API is not supported in this browser. Please use Chrome or Edge.', 'error');
        }
    };

    document.getElementById('btnConnectUsbRfid')?.addEventListener('click', handleUsbConnect);
    document.getElementById('btnConnectHardwareUsb')?.addEventListener('click', handleUsbConnect);

    // Initial State on load
    setHardwareStatus(false, 'ESP32 USB cable disconnected. Plug in USB cable to activate scanner.');

    // Simulate Card Tap (Works with real database patrons!)
    document.getElementById('btnSimulateScan')?.addEventListener('click', async () => {
        let availableStudents = [];
        try {
            const reg = await window.UniXsportAPI.fetchRfidRegistry();
            if (reg && reg.students && reg.students.length > 0) {
                availableStudents = reg.students;
            }
        } catch (e) {}

        if (availableStudents.length === 0) {
            showToast('No registered students found in database to scan.', 'info');
            return;
        }

        const randomStudent = availableStudents[Math.floor(Math.random() * availableStudents.length)];
        const tagToUse = randomStudent.rfidTag || `TAG_${randomStudent.regNo}`;

        try {
            await fetch('/api/rfid/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rfid_tag: tagToUse, device_id: 'TERMINAL_01' })
            });
        } catch (e) {}

        appendRfidFeed(`⚡ Card Scanned: ${randomStudent.name} (${randomStudent.regNo}) [Tag: ${tagToUse}]`, 'success');
        showToast(`RFID Card Detected: ${randomStudent.name} (${randomStudent.regNo})`, 'success');
        quickLoadStudent(randomStudent.regNo);
    });

    // Populate equipment select dropdown
    populateTerminalEquipmentOptions();

    // Steppers
    btnQtyMinus?.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        qtyInput.value = Math.max(1, val - 1);
    });

    btnQtyPlus?.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        qtyInput.value = Math.min(50, val + 1);
    });

    // Lookup Student (Search / RFID Scan)
    btnLookupStudent?.addEventListener('click', () => {
        const query = studentSearchInput.value.trim();
        if (query) lookupTerminalStudent(query);
    });

    studentSearchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = studentSearchInput.value.trim();
            if (query) lookupTerminalStudent(query);
        }
    });

    btnClearStudent?.addEventListener('click', () => {
        studentSearchInput.value = '';
        studentSearchInput.focus();
    });

    // Add Item to Cart
    btnAddItemToCart?.addEventListener('click', () => {
        const eqId = equipmentSelect.value;
        const qty = parseInt(qtyInput.value) || 1;

        if (!eqId) {
            showToast('Please select an equipment item first.', 'error');
            return;
        }

        const eq = equipmentStock.find(e => e.id === eqId || e.name === eqId);
        if (!eq) {
            showToast('Selected equipment not found in stock.', 'error');
            return;
        }

        if (qty > eq.available) {
            showToast(`Only ${eq.available} items available in stock.`, 'error');
            return;
        }

        const existingCartItem = terminalCart.find(c => c.id === eq.id);
        if (existingCartItem) {
            existingCartItem.qty += qty;
        } else {
            terminalCart.push({
                id: eq.id,
                name: eq.name,
                qty,
                available: eq.available
            });
        }

        renderTerminalCart();
        showToast(`Added ${qty}x ${eq.name} to checkout cart.`, 'success');
    });

    // Reset Cart
    btnResetCart?.addEventListener('click', () => {
        terminalCart = [];
        renderTerminalCart();
    });

    // Complete Checkout & Issue
    btnCompleteIssue?.addEventListener('click', async () => {
        if (terminalCart.length === 0) {
            showToast('Your checkout cart is empty. Please add equipment items.', 'error');
            return;
        }

        if (!activeTerminalStudent) {
            showToast('Please select or scan a valid student card first.', 'error');
            return;
        }

        const submitBtn = document.getElementById('btnCompleteIssue');
        if (submitBtn) submitBtn.disabled = true;

        try {
            for (const item of terminalCart) {
                if (window.UniXsportAPI && typeof window.UniXsportAPI.issueEquipment === 'function') {
                    await window.UniXsportAPI.issueEquipment(
                        activeTerminalStudent.user_id || activeTerminalStudent.regNo,
                        item.id,
                        item.qty
                    );
                }
            }

            showToast(`Successfully issued equipment to ${activeTerminalStudent.name}!`, 'success');
            terminalCart = [];
            renderTerminalCart();
            await loadStorekeeperDatabase();
            if (activeTerminalStudent) {
                await lookupTerminalStudent(activeTerminalStudent.user_id || activeTerminalStudent.regNo, false);
            }
            renderStockTable();
            initDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to complete checkout.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });





    // Render Initial State
    renderTerminalStudentProfile(activeTerminalStudent);

    // Live Hardware Background Feed & Polling for Take & Return page
    let terminalBackgroundLastScanId = null;
    let terminalLastScanTime = Date.now();

    // 1. Continuous SSE Listener
    if (window.UniXsportAPI && typeof window.UniXsportAPI.subscribeRfidEvents === 'function') {
        window.UniXsportAPI.subscribeRfidEvents(
            (userScan) => {
                appendRfidFeed(`🟢 Card Swiped: ${userScan.userName} (${userScan.userRole})`, 'success');
                const tag = userScan.rfidTag || userScan.user_id || userScan.regNo || userScan.userName;
                terminalLastScanTime = Date.now();
                quickLoadStudent(tag, true);
            },
            (eqScan) => {
                appendRfidFeed(`📦 Equipment Tag Scanned: ${eqScan.equipmentName}`, 'info');
            },
            (errorScan) => {
                appendRfidFeed(`🔴 Unregistered Card Swiped: Tag ${errorScan.rfidTag}`, 'danger');
                showToast(`Unregistered Card Swiped: Tag ${errorScan.rfidTag}`, 'error');
            }
        );
    }

    // 2. Continuous Gateway Polling (Ensures ESP32 card tap is detected instantly on page)
    setInterval(async () => {
        // Only trigger background detection if no modal is actively in progress
        const animModal = document.getElementById('rfidScanAnimationModal');
        const issueModal = document.getElementById('quickIssueEquipmentModal');
        const choiceModal = document.getElementById('studentActionChoiceModal');

        const isAnyModalOpen = (animModal && animModal.style.display === 'flex') ||
                               (issueModal && issueModal.style.display === 'flex') ||
                               (choiceModal && choiceModal.style.display === 'flex');

        if (isAnyModalOpen) return;

        // Check if currently on Take & Return Equipment page
        const rfidScanPage = document.getElementById('page-rfid-scan');
        if (!rfidScanPage || !rfidScanPage.classList.contains('active')) return;

        try {
            const res = await fetch('/api/rfid/latest-scan').then(r => r.json());
            if (res && res.success && res.scan && res.scan.rfidTag) {
                const scan = res.scan;
                if (scan.timestamp > terminalLastScanTime && scan.id !== terminalBackgroundLastScanId) {
                    terminalBackgroundLastScanId = scan.id;
                    terminalLastScanTime = scan.timestamp;
                    // Only process student cards (ignore equipment tags scanned at other stations)
                    if (scan.type !== 'equipment') {
                        lookupTerminalStudent(scan.rfidTag, true);
                    }
                }
            }
        } catch(e) {}
    }, 450);
}

function openStudentActionChoiceModal(student) {
    const modal = document.getElementById('studentActionChoiceModal');
    if (!modal || !student) return;

    const nameEl = document.getElementById('actionChoiceStudentName');
    const idEl = document.getElementById('actionChoiceStudentId');
    const regEl = document.getElementById('actionChoiceStudentReg');
    const btnBorrow = document.getElementById('btnChooseBorrow');
    const btnReturn = document.getElementById('btnChooseReturn');
    const btnClose = document.getElementById('btnCloseActionChoiceModal');
    const btnCancel = document.getElementById('btnCancelActionChoice');

    if (nameEl) nameEl.textContent = student.name || 'Student';
    if (idEl) idEl.textContent = student.user_id || student.userId || 'US002';
    if (regEl) regEl.textContent = student.regNo || '--';

    const closeModal = () => {
        modal.style.display = 'none';
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;

    // If user chooses BORROW: Open Quick Issue modal
    if (btnBorrow) {
        btnBorrow.onclick = () => {
            closeModal();
            openQuickIssueModal(student);
        };
    }

    // If user chooses RETURN: Scroll & focus on Return table (do NOT open issue modal)
    if (btnReturn) {
        btnReturn.onclick = () => {
            closeModal();
            showToast(`Viewing borrowed equipment for ${student.name}.`, 'info');
            const returnPanel = document.getElementById('returnEquipmentPanel');
            if (returnPanel) {
                returnPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                returnPanel.style.transition = 'box-shadow 0.3s ease';
                returnPanel.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.4)';
                setTimeout(() => {
                    returnPanel.style.boxShadow = '';
                }, 1500);
            }
        };
    }

    modal.style.display = 'flex';
}
window.openStudentActionChoiceModal = openStudentActionChoiceModal;

function openQuickIssueModal(student) {
    const modal = document.getElementById('quickIssueEquipmentModal');
    if (!modal || !student) return;

    const nameEl = document.getElementById('quickIssueStudentName');
    const idEl = document.getElementById('quickIssueStudentId');
    const regEl = document.getElementById('quickIssueStudentReg');
    const eqSelect = document.getElementById('quickIssueEquipmentSelect');
    const qtyInput = document.getElementById('quickIssueQtyInput');
    const availCount = document.getElementById('quickIssueAvailableCount');
    const btnMinus = document.getElementById('btnQuickQtyMinus');
    const btnPlus = document.getElementById('btnQuickQtyPlus');
    const btnClose = document.getElementById('btnCloseQuickIssueModal');
    const btnCancel = document.getElementById('btnCancelQuickIssue');
    const btnConfirm = document.getElementById('btnConfirmQuickIssue');

    if (nameEl) nameEl.textContent = student.name || 'Student';
    if (idEl) idEl.textContent = student.user_id || student.userId || 'US002';
    if (regEl) regEl.textContent = student.regNo || '--';

    // Populate available equipment items
    if (eqSelect) {
        eqSelect.innerHTML = '<option value="">-- Choose Equipment Item --</option>';
        const availableItems = (equipmentStock || []).filter(e => {
            const avail = e.availableQty !== undefined ? e.availableQty : (e.available !== undefined ? e.available : 0);
            return avail > 0;
        });

        if (availableItems.length === 0) {
            eqSelect.innerHTML += '<option value="" disabled>No equipment currently available in stock</option>';
        } else {
            availableItems.forEach(item => {
                const avail = item.availableQty !== undefined ? item.availableQty : item.available;
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = `${item.name} (${item.category || 'General'}) — ${avail} Available`;
                opt.dataset.available = avail;
                opt.dataset.name = item.name;
                eqSelect.appendChild(opt);
            });
        }
    }

    if (qtyInput) {
        qtyInput.value = '1';
        qtyInput.min = '1';
        qtyInput.max = '50';
    }
    if (availCount) availCount.textContent = 'Available: --';

    function updateAvail() {
        const selectedOpt = eqSelect?.selectedOptions?.[0];
        if (selectedOpt && selectedOpt.value) {
            const avail = parseInt(selectedOpt.dataset.available) || 0;
            if (availCount) availCount.textContent = `Available: ${avail}`;
            if (qtyInput) {
                qtyInput.max = String(Math.max(1, avail));
                if (parseInt(qtyInput.value) > avail) {
                    qtyInput.value = String(Math.max(1, avail));
                }
            }
        } else {
            if (availCount) availCount.textContent = 'Available: --';
        }
    }

    if (eqSelect) eqSelect.onchange = updateAvail;

    if (btnMinus) {
        btnMinus.onclick = () => {
            let val = parseInt(qtyInput.value) || 1;
            qtyInput.value = String(Math.max(1, val - 1));
        };
    }

    if (btnPlus) {
        btnPlus.onclick = () => {
            let val = parseInt(qtyInput.value) || 1;
            const selectedOpt = eqSelect?.selectedOptions?.[0];
            const maxVal = selectedOpt && selectedOpt.value ? (parseInt(selectedOpt.dataset.available) || 50) : 50;
            qtyInput.value = String(Math.min(maxVal, val + 1));
        };
    }

    const closeModal = () => {
        modal.style.display = 'none';
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (btnCancel) btnCancel.onclick = closeModal;

    // Bottom-Left Scan Equipment Button
    const btnScanEquipment = document.getElementById('btnScanQuickIssueEquipment');
    if (btnScanEquipment) {
        btnScanEquipment.onclick = () => {
            modal.style.display = 'none';

            const scanModal = document.getElementById('rfidScanAnimationModal');
            if (!scanModal) return;

            const scanTitle = document.getElementById('scanModalTitle');
            const scanSubtext = document.getElementById('scanModalSubtext');
            const pulse = document.getElementById('modalPulseRing');
            const spin = document.getElementById('modalSpinRing');
            const iconBg = document.getElementById('modalIconBg');
            const icon = document.getElementById('scanModalIcon');
            const uidRow = document.getElementById('modalRfidUidRow');
            const uidText = document.getElementById('modalRfidUidText');
            const nameText = document.getElementById('modalStudentNameText');
            const idText = document.getElementById('modalStudentIdText');
            const badgeText = document.getElementById('modalScannerStatusText');
            const scanClose = document.getElementById('btnCloseScanModal');
            const scanAnother = document.getElementById('btnScanAnotherRfid');
            const scanDone = document.getElementById('btnDoneRfidAssignment');

            if (scanTitle) scanTitle.textContent = 'Scan Equipment RFID Tag';
            if (scanSubtext) scanSubtext.innerHTML = 'Place the equipment RFID tag on the ESP32 scanner.';
            if (pulse) pulse.style.display = 'block';
            if (spin) spin.style.display = 'block';
            if (iconBg) {
                iconBg.style.background = 'rgba(249, 115, 22, 0.12)';
                iconBg.style.color = '#f97316';
            }
            if (icon) icon.className = 'fas fa-boxes-stacked';
            if (uidRow) uidRow.style.display = 'none';
            if (uidText) uidText.textContent = '--';
            if (nameText) nameText.textContent = 'Equipment Identification';
            if (idText) idText.textContent = 'Awaiting Tag Tap...';
            if (badgeText) badgeText.textContent = '🟢 ESP32 Hardware Reader is active and waiting...';

            if (scanClose) scanClose.style.display = 'inline-block';
            if (scanAnother) scanAnother.style.display = 'none';
            if (scanDone) scanDone.style.display = 'none';

            scanModal.style.display = 'flex';

            let eqSse = null;
            let eqPoll = null;
            let isEqProcessing = false;
            const eqSessionStartTime = Date.now() - 500;

            function cleanupEq() {
                if (eqSse) { eqSse.close(); eqSse = null; }
                if (eqPoll) { clearInterval(eqPoll); eqPoll = null; }
                isEqProcessing = false;
            }

            scanClose?.addEventListener('click', () => {
                cleanupEq();
                scanModal.style.display = 'none';
                modal.style.display = 'flex';
            }, { once: true });

            async function handleEquipmentTag(scannedUid) {
                if (isEqProcessing) return;
                const cleanTag = String(scannedUid || '').trim().toUpperCase();
                if (!cleanTag) return;

                isEqProcessing = true;
                cleanupEq();

                if (uidRow) uidRow.style.display = 'block';
                if (uidText) uidText.textContent = cleanTag;
                if (scanSubtext) scanSubtext.textContent = 'Finding equipment in database...';

                let matchedEq = (equipmentStock || []).find(e => {
                    const eTag = String(e.rfidTag || e.rfidCode || e.rfid || '').trim().replace(/\s+/g, '').toUpperCase();
                    const searchTag = cleanTag.replace(/\s+/g, '');
                    return eTag && (eTag === searchTag || eTag === cleanTag);
                });

                if (!matchedEq) {
                    try {
                        const res = await fetch('/api/storekeeper/search-equipment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: cleanTag })
                        }).then(r => r.json());
                        if (res && res.success && res.equipment) {
                            matchedEq = res.equipment;
                        }
                    } catch(e) {}
                }

                if (matchedEq) {
                    if (scanTitle) scanTitle.textContent = 'Equipment Recognized!';
                    if (scanSubtext) scanSubtext.innerHTML = `Identified: <strong>${matchedEq.name}</strong> (${matchedEq.id}).`;
                    if (pulse) pulse.style.display = 'none';
                    if (spin) spin.style.display = 'none';
                    if (iconBg) {
                        iconBg.style.background = 'rgba(34, 197, 94, 0.15)';
                        iconBg.style.color = '#16a34a';
                    }
                    if (icon) icon.className = 'fas fa-check-circle';

                    showToast(`✓ Equipment Identified: ${matchedEq.name}`, 'success');

                    if (eqSelect) {
                        eqSelect.value = matchedEq.id;
                        updateAvail();
                    }

                    setTimeout(() => {
                        scanModal.style.display = 'none';
                        modal.style.display = 'flex';
                    }, 800);
                } else {
                    if (scanTitle) scanTitle.textContent = 'Unassigned RFID Tag';
                    if (scanSubtext) scanSubtext.innerHTML = `<span style="color: #dc2626;">No equipment registered with tag: ${cleanTag}</span>`;
                    if (pulse) pulse.style.display = 'none';
                    if (spin) spin.style.display = 'none';
                    if (iconBg) {
                        iconBg.style.background = 'rgba(239, 68, 68, 0.15)';
                        iconBg.style.color = '#dc2626';
                    }
                    if (icon) icon.className = 'fas fa-exclamation-triangle';
                    showToast(`Unassigned Equipment Tag: ${cleanTag}`, 'error');
                }
            }

            try {
                if (window.EventSource) {
                    eqSse = new EventSource(`${getStorekeeperApiBase()}/api/rfid/events`);
                    const onMsg = (e) => {
                        try {
                            const data = JSON.parse(e.data);
                            if (data && data.rfidTag) handleEquipmentTag(data.rfidTag);
                        } catch(err) {}
                    };
                    eqSse.addEventListener('scan_packet', onMsg);
                    eqSse.addEventListener('equipment_scan', onMsg);
                    eqSse.addEventListener('unauthorized_scan', onMsg);
                }
            } catch(e) {}

            let lastPolled = null;
            eqPoll = setInterval(async () => {
                if (isEqProcessing) return;
                try {
                    const res = await fetch(`${getStorekeeperApiBase()}/api/rfid/latest-scan`).then(r => r.json());
                    if (res && res.success && res.scan && res.scan.rfidTag) {
                        const scan = res.scan;
                        if (scan.timestamp >= eqSessionStartTime && scan.id !== lastPolled) {
                            lastPolled = scan.id;
                            handleEquipmentTag(scan.rfidTag);
                        }
                    }
                } catch(e) {}
            }, 400);
        };
    }

    if (btnConfirm) {
        btnConfirm.onclick = async () => {
            const selectedOpt = eqSelect?.selectedOptions?.[0];
            const eqId = eqSelect.value;
            const qty = parseInt(qtyInput.value) || 1;

            if (!eqId) {
                showToast('Please choose an equipment item from the list.', 'error');
                return;
            }

            const avail = parseInt(selectedOpt?.dataset?.available) || 0;
            if (qty > avail) {
                showToast(`Only ${avail} items available in stock.`, 'error');
                return;
            }

            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Issuing...';

            try {
                const studentLookup = student.user_id || student.userId || student.regNo || student.id;
                const issueRes = await fetch('/api/storekeeper/issue-gear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: studentLookup,
                        equipmentId: eqId,
                        qty
                    })
                }).then(r => r.json());

                if (issueRes && issueRes.success) {
                    showToast(`✓ Successfully issued ${qty}x ${selectedOpt.dataset.name || 'Equipment'} to ${student.name}!`, 'success');
                    closeModal();

                    // Advance scan timestamp so equipment scans from inside the modal don't re-trigger student scan
                    terminalLastScanTime = Date.now();

                    // Reset quick issue input fields for subsequent transactions
                    if (eqSelect) eqSelect.value = '';
                    if (qtyInput) qtyInput.value = '1';
                    if (availCount) availCount.textContent = 'Available: --';

                    // Reload and refresh all views safely
                    await loadStorekeeperDatabase();
                    if (activeTerminalStudent) {
                        await lookupTerminalStudent(studentLookup, false);
                    }
                    renderStockTable();
                    renderBorrowHistory();
                    initDashboard();
                } else {
                    showToast(issueRes?.error || 'Failed to issue equipment.', 'error');
                }
            } catch(err) {
                console.error('Quick issue error:', err);
                showToast(err.message || 'Server error while issuing equipment.', 'error');
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = '<i class="fas fa-check"></i> OK / Issue Equipment';
            }
        };
    }

    modal.style.display = 'flex';
}
window.openQuickIssueModal = openQuickIssueModal;

async function quickLoadStudent(regNo, triggerActionPopup = true) {
    await lookupTerminalStudent(regNo, triggerActionPopup);
}
window.quickLoadStudent = quickLoadStudent;

async function lookupTerminalStudent(query, triggerActionPopup = false) {
    const clean = String(query || '').trim();
    if (!clean) {
        if (triggerActionPopup) showToast('Please enter or scan a Student RFID tag or ID.', 'error');
        return;
    }

    try {
        let student = null;
        if (window.UniXsportAPI && typeof window.UniXsportAPI.identifyStudent === 'function') {
            const res = await window.UniXsportAPI.identifyStudent(clean);
            if (res && res.success && res.student) {
                student = res.student;
            }
        }

        if (!student) {
            const searchRes = await fetch('/api/storekeeper/search-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: clean })
            }).then(r => r.json()).catch(() => null);

            if (searchRes && searchRes.success && searchRes.student) {
                student = searchRes.student;
            }
        }

        if (student) {
            activeTerminalStudent = student;
            renderTerminalStudentProfile(activeTerminalStudent);
            renderActiveStudentReturns(activeTerminalStudent);

            if (triggerActionPopup) {
                showToast(`Student Identified: ${activeTerminalStudent.name} (${activeTerminalStudent.user_id || activeTerminalStudent.regNo})`, 'success');
                // Directly popup the Borrow vs Return Action Choice dialog!
                setTimeout(() => {
                    openStudentActionChoiceModal(activeTerminalStudent);
                }, 200);
            }
            return;
        } else {
            activeTerminalStudent = null;
            renderTerminalStudentProfile(null, 'Student not found in database.');
            renderActiveStudentReturns(null);
            if (triggerActionPopup) {
                showToast('Student Not Found. This RFID card is not registered to a student.', 'error');
            }
        }
    } catch (err) {
        activeTerminalStudent = null;
        renderTerminalStudentProfile(null, err.message);
        renderActiveStudentReturns(null);
        if (triggerActionPopup) {
            showToast(err.message || 'Student not found in database.', 'error');
        }
        return;
    }
}

function renderTerminalStudentProfile(student, errorMessage) {
    const nameEl = document.getElementById('activeStudentName');
    const userIdEl = document.getElementById('activeStudentUserId');
    const regEl = document.getElementById('activeStudentReg');
    const emailEl = document.getElementById('activeStudentEmail');
    const rfidEl = document.getElementById('activeStudentRfid');
    const deptEl = document.getElementById('activeStudentDept');
    const statusEl = document.getElementById('activeStudentStatus');

    if (!student) {
        if (nameEl) nameEl.textContent = 'No Student Selected';
        if (userIdEl) userIdEl.textContent = '--';
        if (regEl) regEl.textContent = '--';
        if (emailEl) emailEl.textContent = '--';
        if (rfidEl) rfidEl.textContent = '--';
        if (deptEl) deptEl.textContent = '--';
        if (statusEl) {
            statusEl.textContent = errorMessage || 'Please Search / Swipe Card';
            statusEl.className = errorMessage ? 'badge badge-danger' : 'badge badge-status';
            statusEl.style.background = errorMessage ? 'rgba(239, 68, 68, 0.15)' : '';
            statusEl.style.color = errorMessage ? '#ef4444' : '';
        }
        return;
    }

    if (nameEl) nameEl.textContent = student.name || 'Student';
    if (userIdEl) userIdEl.textContent = student.user_id || student.userId || '--';
    if (regEl) regEl.textContent = student.regNo || '--';
    if (emailEl) emailEl.textContent = student.email || '--';
    if (rfidEl) rfidEl.textContent = student.rfidTag || student.rfidCode || student.rfid || 'Unassigned';
    if (deptEl) deptEl.textContent = student.department || 'General';
    if (statusEl) {
        const isActive = String(student.status || '').toLowerCase() === 'active';
        statusEl.textContent = isActive ? 'Active' : (student.status || 'Inactive');
        statusEl.className = isActive ? 'badge badge-success' : 'badge badge-danger';
        statusEl.style.background = isActive ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = isActive ? '#16a34a' : '#ef4444';
    }
}

// ========== Return Equipment Gear Logic ==========
function renderActiveStudentReturns(student) {
    const tbody = document.getElementById('returnTableBody');
    const countBadge = document.getElementById('returnActiveCountBadge');
    if (!tbody) return;

    if (!student || !student.activeBorrows || student.activeBorrows.length === 0) {
        if (countBadge) countBadge.textContent = '0 items';
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 24px; color: var(--gray-500);">
                    <i class="fas fa-box-open" style="font-size: 1.8rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                    <strong style="font-size: 0.95rem; color: var(--gray-700);">${student ? 'No Equipment to Return' : 'Please scan/search a student to view borrowed equipment.'}</strong>
                    <div style="font-size: 0.85rem; margin-top: 4px;">${student ? 'This student currently has no borrowed equipment.' : ''}</div>
                </td>
            </tr>
        `;
        return;
    }

    const borrows = student.activeBorrows;
    if (countBadge) countBadge.textContent = `${borrows.length} ${borrows.length === 1 ? 'item' : 'items'}`;

    tbody.innerHTML = borrows.map(item => `
        <tr>
            <td style="padding: 10px 12px;">
                <strong style="color: var(--gray-900);">${item.equipmentName}</strong>
                <div style="font-size: 0.78rem; color: var(--gray-500); margin-top: 2px;">
                    Issued: ${item.issuedAt ? item.issuedAt.slice(0, 10) : '-'} • <span style="color: #06b6d4; font-weight: 600;">${item.status}</span>
                </div>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; font-weight: 700; font-size: 0.9rem; padding: 4px 10px; border-radius: 12px;">
                    ${item.borrowedQty}
                </span>
            </td>
            <td style="padding: 10px 12px; text-align: center;">
                <div style="display: inline-flex; align-items: center; border: 1px solid var(--gray-300); border-radius: var(--radius); overflow: hidden; background: var(--bg-card);">
                    <button type="button" class="stepper-btn" onclick="stepReturnQty('${item.id}', -1)" style="width: 28px; height: 32px; background: var(--gray-100); border: none; font-weight: 700; cursor: pointer;">-</button>
                    <input type="number" id="returnQtyInput_${item.id}" value="${item.borrowedQty}" min="1" max="${item.borrowedQty}" style="width: 44px; text-align: center; border: none; font-weight: 700; font-size: 0.9rem;">
                    <button type="button" class="stepper-btn" onclick="stepReturnQty('${item.id}', 1)" style="width: 28px; height: 32px; background: var(--gray-100); border: none; font-weight: 700; cursor: pointer;">+</button>
                </div>
            </td>
            <td style="padding: 10px 12px; text-align: right;">
                <button type="button" class="btn btn-sm btn-success" id="btnReturn_${item.id}" onclick="processReturnEquipment('${item.id}')" style="padding: 6px 14px; font-weight: 600; background: #16a34a; border-color: #16a34a;">
                    <i class="fas fa-undo"></i> Return
                </button>
            </td>
        </tr>
    `).join('');
}

function stepReturnQty(logId, change) {
    const input = document.getElementById(`returnQtyInput_${logId}`);
    if (!input) return;

    let val = parseInt(input.value) || 1;
    const min = parseInt(input.min) || 1;
    const max = parseInt(input.max) || 999;

    val = Math.max(min, Math.min(max, val + change));
    input.value = val;
}
window.stepReturnQty = stepReturnQty;

async function processReturnEquipment(logId) {
    if (!activeTerminalStudent) {
        showToast('Please identify a student first.', 'error');
        return;
    }

    const item = (activeTerminalStudent.activeBorrows || []).find(b => String(b.id) === String(logId));
    if (!item) {
        showToast('Invalid Return: This equipment is not currently borrowed by this student.', 'error');
        return;
    }

    const input = document.getElementById(`returnQtyInput_${logId}`);
    const returnQty = parseInt(input ? input.value : item.borrowedQty);

    if (isNaN(returnQty) || returnQty <= 0) {
        showToast('Invalid Quantity: Return quantity must be greater than zero.', 'error');
        return;
    }

    if (returnQty > item.borrowedQty) {
        showToast(`Invalid Quantity: Return quantity cannot exceed the borrowed quantity (${item.borrowedQty}).`, 'error');
        return;
    }

    const btn = document.getElementById(`btnReturn_${logId}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }

    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.returnEquipment === 'function') {
            await window.UniXsportAPI.returnEquipment(
                logId,
                returnQty,
                activeTerminalStudent.user_id || activeTerminalStudent.regNo,
                item.equipmentId
            );
        }

        showToast(`Successfully returned ${returnQty}x ${item.equipmentName}!`, 'success');
        await loadStorekeeperDatabase();
        if (activeTerminalStudent) {
            await lookupTerminalStudent(activeTerminalStudent.user_id || activeTerminalStudent.regNo, false);
        }
        renderStockTable();
        initDashboard();
    } catch (err) {
        showToast(err.message || 'Return Failed: Unable to complete the equipment return. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-undo"></i> Return';
        }
    }
}
window.processReturnEquipment = processReturnEquipment;

function populateTerminalEquipmentOptions() {
    const select = document.getElementById('terminalEquipmentSelect');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Choose Equipment Item --</option>' +
        equipmentStock.map(eq => {
            const avail = eq.available !== undefined ? eq.available : (eq.availableQty !== undefined ? eq.availableQty : 0);
            const idLabel = eq.id ? `[${eq.id}] ` : '';
            return `<option value="${eq.id}">${idLabel}${eq.name} (${avail} available)</option>`;
        }).join('');

    if (currentVal && equipmentStock.some(e => String(e.id) === String(currentVal))) {
        select.value = currentVal;
    }
}
window.populateTerminalEquipmentOptions = populateTerminalEquipmentOptions;

function renderTerminalCart() {
    const tbody = document.getElementById('cartTableBody');
    if (!tbody) return;

    if (terminalCart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 12px; color: var(--gray-500);">Cart is empty</td></tr>';
        return;
    }

    tbody.innerHTML = terminalCart.map((item, idx) => `
        <tr>
            <td style="padding: 8px 12px;"><strong>${item.name}</strong></td>
            <td style="padding: 8px 12px;">${item.qty}</td>
            <td style="padding: 8px 12px;">${item.available}</td>
            <td style="padding: 8px 12px;">
                <button type="button" class="btn btn-sm btn-outline" style="color: var(--danger); border-color: var(--danger); padding: 2px 6px;" onclick="removeFromTerminalCart(${idx})">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function removeFromTerminalCart(index) {
    terminalCart.splice(index, 1);
    renderTerminalCart();
}
window.removeFromTerminalCart = removeFromTerminalCart;

function appendRfidFeed(message, type = 'info') {
    const feed = document.getElementById('rfidHardwareFeed');
    if (!feed) return;

    const placeholder = feed.querySelector('.placeholder-item');
    if (placeholder) placeholder.remove();

    const time = new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'rfid-feed-item';
    item.style.padding = '8px 12px';
    item.style.background = 'var(--gray-50)';
    item.style.borderRadius = 'var(--radius)';
    item.style.fontSize = '0.85rem';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';

    item.innerHTML = `<span>${message}</span><span style="font-size:0.75rem; color:var(--gray-500);">${time}</span>`;
    feed.prepend(item);
}

function initBluetoothDiagnosticsUI() {
    if (!window.UniXsportBluetooth) return;
    const diag = window.UniXsportBluetooth.checkBrowserSupport();

    const elWebBt = document.getElementById('diagWebBt');
    const elSerial = document.getElementById('diagWebSerial');
    const elConsole = document.getElementById('btPacketConsole');

    if (elWebBt) {
        elWebBt.textContent = diag.webBluetoothSupported ? 'Supported (BLE)' : 'Not Supported';
        elWebBt.style.color = diag.webBluetoothSupported ? 'var(--success)' : 'var(--danger)';
    }

    if (elSerial) {
        elSerial.textContent = diag.webSerialSupported ? 'Supported (SPP)' : 'Not Supported';
        elSerial.style.color = diag.webSerialSupported ? 'var(--success)' : 'var(--danger)';
    }

    if (elConsole) {
        elConsole.innerHTML = `[Diag] Browser capabilities verified.<br>[Diag] Web Bluetooth: ${diag.webBluetoothSupported ? 'READY' : 'N/A'}, Web Serial: ${diag.webSerialSupported ? 'READY' : 'N/A'}<br>[Ready] Awaiting connection request...`;
    }
}

async function connectBluetoothSystem() {
    if (!window.UniXsportBluetooth) return;
    const elConsole = document.getElementById('btPacketConsole');
    const elState = document.getElementById('diagConnState');
    const elProtocol = document.getElementById('diagProtocol');
    const statusText = document.getElementById('rfidStatusText');

    if (elConsole) {
        elConsole.innerHTML += `<br>[System] Requesting Bluetooth device pairing...`;
        elConsole.scrollTop = elConsole.scrollHeight;
    }

    const success = await window.UniXsportBluetooth.connect(
        (scannedUid) => {
            showToast(`Bluetooth RFID Swiped: ${scannedUid}`, 'success');
            appendRfidFeed(`📡 Bluetooth Card Swiped: ${scannedUid}`, 'success');
            quickLoadStudent(scannedUid);

            if (elConsole) {
                elConsole.innerHTML += `<br><span style="color: #60a5fa;">[PACKET RECEIVED] SCANNED UID: ${scannedUid}</span>`;
                elConsole.scrollTop = elConsole.scrollHeight;
            }
        },
        (state, message, type) => {
            if (elState) {
                elState.textContent = state.toUpperCase();
                elState.style.color = state === 'connected' ? 'var(--success)' : 'var(--danger)';
            }
            if (elProtocol && type) {
                elProtocol.textContent = type;
            }
            if (statusText) {
                statusText.textContent = state === 'connected' ? `Bluetooth Connected (${type || 'Wireless'})` : 'RFID Scanner Ready';
            }

            if (elConsole) {
                elConsole.innerHTML += `<br>[Status Update: ${state}] ${message}`;
                elConsole.scrollTop = elConsole.scrollHeight;
            }
        }
    );

    if (success) {
        showToast('Wireless Bluetooth RFID Reader connected systematically!', 'success');
    }
}

function populateStudentAssignmentList() {
    if (!studentAssignmentList) return;
    studentAssignmentList.innerHTML = '';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = `${student.name} (${student.id})`;
        studentAssignmentList.appendChild(option);
    });
}

function refreshAssignmentLabels() {
    if (!selectedStudentLabel || !scannedRFIDLabel) return;
    selectedStudentLabel.textContent = selectedStudentForAssignment
        ? `${selectedStudentForAssignment.name} (${selectedStudentForAssignment.id})${selectedStudentForAssignment.rfid ? ' — Current RFID: ' + selectedStudentForAssignment.rfid : ''}`
        : 'None';
    scannedRFIDLabel.textContent = scannedRFIDValue || 'None';
}

function selectStudentForAssignment() {
    const searchValue = studentAssignmentInput?.value.trim();
    if (!searchValue) {
        alert('Type a student name or ID to search.');
        return;
    }

    const normalized = searchValue.toLowerCase();
    const student = students.find(s =>
        s.id.toLowerCase() === normalized ||
        s.name.toLowerCase() === normalized ||
        `${s.name.toLowerCase()} (${s.id.toLowerCase()})` === normalized ||
        s.name.toLowerCase().includes(normalized) ||
        s.id.toLowerCase().includes(normalized)
    );

    if (!student) {
        alert('Student not found. Please enter a valid student name or ID.');
        return;
    }

    selectedStudentForAssignment = student;
    refreshAssignmentLabels();
    showToast(`Selected ${student.name} for RFID assignment.`, 'success');
}

function startRFIDAssignmentScan() {
    scannedRFIDValue = '';
    refreshAssignmentLabels();
    if (scannedRFIDLabel) scannedRFIDLabel.textContent = 'Scanning...';
    if (assignRFIDInput) {
        assignRFIDInput.value = '';
        assignRFIDInput.focus();
    }
}

function clearAssignedRFIDScan() {
    scannedRFIDValue = '';
    if (assignRFIDInput) assignRFIDInput.value = '';
    if (scannedRFIDLabel) scannedRFIDLabel.textContent = 'None';
}

function captureScannedRFID(value) {
    const rfid = value.trim().toUpperCase();
    if (!rfid) return;

    scannedRFIDValue = rfid;
    if (scannedRFIDLabel) scannedRFIDLabel.textContent = rfid;
    if (assignRFIDInput) assignRFIDInput.blur();
    showToast(`Scanned card ID captured: ${rfid}`, 'info');
}

function saveStudentRFIDAssignment() {
    if (!selectedStudentForAssignment) {
        alert('Select a student before saving the RFID.');
        return;
    }
    if (!scannedRFIDValue) {
        alert('Scan the RFID card first before saving.');
        return;
    }

    const otherOwner = students.find(s => s.rfid === scannedRFIDValue && s.id !== selectedStudentForAssignment.id);
    if (otherOwner) {
        alert(`This RFID card is already assigned to ${otherOwner.name}. Please re-scan a different card.`);
        return;
    }

    selectedStudentForAssignment.rfid = scannedRFIDValue;
    refreshAssignmentLabels();
    showToast(`RFID ${scannedRFIDValue} saved for ${selectedStudentForAssignment.name}.`, 'success');
}

function closeStudentScanPopup() {
    if (studentScanTimer) {
        clearInterval(studentScanTimer);
        studentScanTimer = null;
    }
    if (studentScanModal) {
        studentScanModal.classList.remove('show');
    }
    if (studentScanInput) {
        studentScanInput.value = '';
        studentScanInput.blur();
    }
}

function startStudentScanPopup() {
    if (!studentScanModal || !studentScanInput || !studentScanCountdownEl) return;

    studentScanRemaining = 20;
    studentScanCountdownEl.textContent = `${studentScanRemaining}`;
    studentScanModal.classList.add('show');
    studentScanInput.value = '';
    setTimeout(() => studentScanInput.focus(), 100);
    if (studentScanTimer) {
        clearInterval(studentScanTimer);
    }

    studentScanTimer = setInterval(() => {
        studentScanRemaining -= 1;
        studentScanCountdownEl.textContent = `${studentScanRemaining}`;

        if (studentScanRemaining <= 0) {
            closeStudentScanPopup();
            showToast('Student RFID scan timed out. Please try again.', 'error');
        }
    }, 1000);
}

function showQuantityModal(equipment, action, existingItem = null) {
    const modal = document.getElementById('quantityModal');
    const modalEquipmentName = document.getElementById('modalEquipmentName');
    const modalMessage = document.getElementById('modalMessage');
    const modalAvailable = document.getElementById('modalAvailable');
    const quantityInput = document.getElementById('quantityInput');

    modalEquipmentName.textContent = equipment.name;
    modalMessage.textContent = `How many ${equipment.name} is the student ${action === 'take' ? 'taking' : 'returning'}?`;
    modalAvailable.textContent = action === 'take' ? equipment.available : 'N/A';
    quantityInput.value = existingItem ? existingItem.quantity : 1;
    quantityInput.max = action === 'take' ? equipment.available : 9999;

    modal.dataset.equipmentId = equipment.id;
    modal.dataset.equipmentName = equipment.name;
    modal.dataset.action = action;
    modal.dataset.existingIndex = existingItem ? currentSession.items.indexOf(existingItem) : -1;

    modal.classList.add('show');
    quantityInput.focus();
    quantityInput.select();
}

function confirmQuantity() {
    const modal = document.getElementById('quantityModal');
    const quantityInput = document.getElementById('quantityInput');
    const quantity = parseInt(quantityInput.value) || 0;
    const equipmentId = parseInt(modal.dataset.equipmentId);
    const equipmentName = modal.dataset.equipmentName;
    const action = modal.dataset.action;
    const existingIndex = parseInt(modal.dataset.existingIndex);

    if (quantity < 1) {
        alert('Quantity must be at least 1');
        return;
    }

    const equipment = equipmentStock.find(eq => eq.id === equipmentId);
    if (action === 'take' && quantity > equipment.available) {
        alert(`Warning: Only ${equipment.available} items available!`);
        return;
    }

    if (existingIndex >= 0) {
        // Update existing item
        currentSession.items[existingIndex].quantity += quantity;
    } else {
        // Add new item
        currentSession.items.push({
            equipmentId,
            equipmentName,
            quantity,
            action
        });
    }

    closeModal('quantityModal');
    renderSessionSummary();
    document.getElementById('equipmentRFIDInput').value = '';
    document.getElementById('equipmentSelect').value = '';
}

function renderSessionSummary() {
    const sessionSummary = document.getElementById('sessionSummary');
    const sessionItems = document.getElementById('sessionItems');

    if (currentSession.items.length === 0) {
        sessionSummary.style.display = 'none';
        return;
    }

    sessionSummary.style.display = 'block';
    sessionItems.innerHTML = currentSession.items.map((item, index) => `
        <div class="session-item">
            <div>
                <span class="session-item-name">${item.equipmentName}</span>
                <span style="font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-left: 8px;">
                    (${item.action === 'take' ? 'Taking' : 'Returning'})
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="session-item-qty">Qty: ${item.quantity}</span>
                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="removeSessionItem(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function removeSessionItem(index) {
    currentSession.items.splice(index, 1);
    renderSessionSummary();
}

function submitSession() {
    if (currentSession.items.length === 0) {
        alert('No items in session');
        return;
    }

    if (!currentSession.studentId) {
        alert('No student selected');
        return;
    }

    // Process each item
    currentSession.items.forEach(item => {
        const equipment = equipmentStock.find(eq => eq.id === item.equipmentId);
        
        if (item.action === 'take') {
            // Update stock
            equipment.available -= item.quantity;
            
            // Add to borrow history
            borrowHistory.push({
                id: borrowHistory.length + 1,
                studentId: currentSession.studentId,
                studentName: currentSession.studentName,
                equipmentId: item.equipmentId,
                equipmentName: item.equipmentName,
                quantity: item.quantity,
                issueDate: new Date().toISOString().split('T')[0],
                returnDate: null,
                status: 'taken'
            });
        } else {
            // Return equipment
            equipment.available += item.quantity;
            
            // Update borrow history - find matching taken items
            const takenItems = borrowHistory.filter(b => 
                b.studentId === currentSession.studentId &&
                b.equipmentId === item.equipmentId &&
                b.status === 'taken'
            );
            
            if (takenItems.length > 0) {
                // Return oldest first
                const itemToReturn = takenItems[0];
                itemToReturn.returnDate = new Date().toISOString().split('T')[0];
                itemToReturn.status = 'returned';
            }
        }
    });

    showToast('Session submitted successfully!', 'success');
    clearSession();
    resetStudentSession();
}

function clearSession() {
    currentSession.items = [];
    renderSessionSummary();
}

function resetStudentSession() {
    const scanSection = document.getElementById('studentScanSection');
    const activitySection = document.getElementById('studentActivitySection');
    const studentRFIDInput = document.getElementById('studentRFIDInput');
    const scanStatusEl = document.getElementById('scanStatus');
    
    document.getElementById('radarScanner')?.classList.remove('scanning');
    if (scanSection) scanSection.style.display = 'block';
    if (activitySection) activitySection.style.display = 'none';
    if (studentRFIDInput) {
        studentRFIDInput.value = '';
        // Focus input for next scan
        setTimeout(() => studentRFIDInput.focus(), 100);
    }
    if (scanStatusEl) scanStatusEl.style.display = 'none';
    
    document.getElementById('equipmentScanArea').style.display = 'none';
    currentSession.studentId = null;
    currentSession.studentName = null;
    currentSession.items = [];
    inputStartTime = null;
    lastScanValue = '';
    renderSessionSummary();
}

function loadEquipmentSelect() {
    populateTerminalEquipmentOptions();
    renderStockTable();
}
window.loadEquipmentSelect = loadEquipmentSelect;

// ========== Stock Management ==========
function openAddEquipmentModal() {
    const modal = document.getElementById('addEquipmentModal');
    if (modal) {
        modal.classList.add('show');
        setTimeout(() => {
            document.getElementById('newEquipmentName')?.focus();
        }, 100);
    }
}
// ========== Generic Storekeeper API Post Helper (Multi-Host Fallback) ==========
async function postStorekeeperAPI(endpoint, body) {
    const baseUrl = getStorekeeperApiBase();
    const urls = [
        `${baseUrl}${endpoint}`,
        endpoint,
        `http://localhost:5000${endpoint}`,
        `http://127.0.0.1:5000${endpoint}`
    ];
    for (const url of urls) {
        try {
            const token = getUniXsportToken();
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.success) return data;
            }
        } catch (e) {}
    }
    return null;
}
window.postStorekeeperAPI = postStorekeeperAPI;

let isAddingEquipmentInProgress = false;

async function confirmAddEquipment() {
    if (isAddingEquipmentInProgress) return;

    const name     = document.getElementById('newEquipmentName')?.value.trim();
    const category = document.getElementById('newEquipmentCategory')?.value.trim();
    const quantity = parseInt(document.getElementById('newEquipmentQuantity')?.value) || 0;
    const rfid     = document.getElementById('newEquipmentRFID')?.value.trim();

    if (!name || !category || quantity < 1) {
        showToast('Please fill in Equipment Name, Category and Quantity.', 'error');
        return;
    }

    isAddingEquipmentInProgress = true;
    const confirmBtn = document.getElementById('confirmAddEquipmentBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Saving...'; }

    try {
        const data = await postStorekeeperAPI('/api/storekeeper/add-equipment', {
            name,
            category,
            totalQty: quantity,
            room: 'Main Gym Hall',
            rfidTag: rfid || ''
        });

        if (!data || !data.success) {
            showToast((data && data.error) || 'Failed to add equipment.', 'error');
            return;
        }

        const item = data.item;
        // Avoid duplicate push if already present in equipmentStock
        const exists = equipmentStock.some(e => String(e.id).toLowerCase() === String(item.id).toLowerCase());
        if (!exists) {
            equipmentStock.push({
                id:        item.id,
                name:      item.name,
                category:  item.category,
                total:     item.totalQty,
                totalQty:  item.totalQty,
                available: item.availableQty,
                availableQty: item.availableQty,
                borrowed:  item.borrowedQty || 0,
                damaged:   item.damagedQty  || 0,
                status:    item.status,
                sportsRoom: item.room || 'Main Gym Hall',
                room:      item.room || 'Main Gym Hall',
                rfidTag:   item.rfidTag || ''
            });
        }

        closeModal('addEquipmentModal');
        // Clear form
        document.getElementById('newEquipmentName').value     = '';
        document.getElementById('newEquipmentCategory').value = '';
        document.getElementById('newEquipmentQuantity').value = '1';
        document.getElementById('newEquipmentRFID').value     = '';

        renderStockTable();
        loadEquipmentSelect();
        updateDashboardStats();
        showToast(`✓ Equipment "${item.name}" added successfully (${item.id})`, 'success');

    } catch (err) {
        showToast('Network error. Could not add equipment.', 'error');
    } finally {
        isAddingEquipmentInProgress = false;
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-plus"></i> Add Equipment'; }
    }
}
window.confirmAddEquipment = confirmAddEquipment;

function recalculateEditEquipmentAvailable() {
    const totalInput = document.getElementById('editEquipmentTotalQty');
    const damagedInput = document.getElementById('editEquipmentDamagedQty');
    const availInput = document.getElementById('editEquipmentAvailableQty');

    if (!totalInput || !damagedInput || !availInput) return;

    let total = parseInt(totalInput.value);
    if (isNaN(total) || total < 0) total = 0;

    let damaged = parseInt(damagedInput.value);
    if (isNaN(damaged) || damaged < 0) {
        damaged = 0;
        damagedInput.value = 0;
    }

    // Damaged quantity cannot exceed total quantity
    if (damaged > total) {
        damaged = total;
        damagedInput.value = total;
    }

    // Available Quantity = Total Quantity - Damaged Quantity
    const available = Math.max(0, total - damaged);
    availInput.value = available;
    availInput.style.color = available === 0 ? '#ef4444' : available <= 2 ? '#f59e0b' : '#16a34a';
}

function initStockManagement() {
    renderStockTable();
    
    const searchInput = document.getElementById('stockSearch');
    searchInput?.addEventListener('input', () => {
        renderStockTable();
    });

    document.getElementById('addEquipmentBtn')?.addEventListener('click', () => {
        openAddEquipmentModal();
    });

    document.getElementById('confirmAddEquipmentBtn')?.addEventListener('click', () => {
        confirmAddEquipment();
    });

    document.getElementById('cancelAddEquipmentBtn')?.addEventListener('click', () => {
        closeModal('addEquipmentModal');
    });

    // Real-time calculation listeners for Edit Modal
    const editTotalEl = document.getElementById('editEquipmentTotalQty');
    const editDamagedEl = document.getElementById('editEquipmentDamagedQty');
    if (editTotalEl) {
        editTotalEl.addEventListener('input', recalculateEditEquipmentAvailable);
        editTotalEl.addEventListener('change', recalculateEditEquipmentAvailable);
    }
    if (editDamagedEl) {
        editDamagedEl.addEventListener('input', recalculateEditEquipmentAvailable);
        editDamagedEl.addEventListener('change', recalculateEditEquipmentAvailable);
    }
}

function renderStockTable() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    if (!Array.isArray(equipmentStock) || equipmentStock.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--gray-500);">
                    <i class="fas fa-boxes-stacked" style="font-size: 1.8rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                    No equipment categories found in inventory.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = equipmentStock.map(eq => {
        const total = eq.total !== undefined ? eq.total : (eq.totalQty || 0);
        const damaged = eq.damaged !== undefined ? eq.damaged : (eq.damagedQty || 0);
        const available = eq.available !== undefined ? eq.available : (eq.availableQty !== undefined ? eq.availableQty : Math.max(0, total - damaged));
        const isLowStock = available <= 2 && available > 0;
        const isOutOfStock = available === 0;
        const statusVal = (eq.status || '').toLowerCase();

        let statusBadge = `
            <span class="stock-status in-stock">
                <i class="fas fa-check-circle"></i> In Stock
            </span>
        `;
        if (statusVal === 'maintenance' || statusVal === 'damaged' || (damaged > 0 && available === 0)) {
            statusBadge = `
                <span class="stock-status" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);">
                    <i class="fas fa-triangle-exclamation"></i> Damaged
                </span>
            `;
        } else if (statusVal === 'out-of-stock' || isOutOfStock) {
            statusBadge = `
                <span class="stock-status low-stock" style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);">
                    <i class="fas fa-times-circle"></i> Out of Stock
                </span>
            `;
        } else if (statusVal === 'low-stock' || isLowStock) {
            statusBadge = `
                <span class="stock-status low-stock">
                    <i class="fas fa-exclamation-triangle"></i> Low Stock
                </span>
            `;
        }

        const safeId = String(eq.id).replace(/'/g, "\\'");

        return `
            <tr>
                <td>
                    <div style="font-weight: 700; color: var(--gray-900); font-size: 0.95rem;">${eq.name}</div>
                    <div style="font-size: 0.8rem; color: var(--gray-500); display: flex; gap: 8px; align-items: center; margin-top: 2px;">
                        <span class="badge" style="background: rgba(59, 130, 246, 0.1); color: var(--blue); font-weight: 600; padding: 2px 6px;">${eq.id}</span>
                        <span>${eq.category || 'General Sports'}</span>
                        ${eq.sportsRoom ? `<span>• ${eq.sportsRoom}</span>` : ''}
                    </div>
                </td>
                <td style="font-weight: 600; font-size: 0.95rem;">${total}</td>
                <td style="font-weight: 600; font-size: 0.95rem; color: ${damaged > 0 ? '#ef4444' : 'var(--gray-600)'};">${damaged}</td>
                <td style="font-weight: 700; font-size: 0.95rem; color: ${isOutOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : '#16a34a'};">${available}</td>
                <td>${statusBadge}</td>
                <td>
                    <button type="button" class="btn btn-outline btn-sm" onclick="openEditEquipmentModal('${safeId}')" style="padding: 6px 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas fa-edit text-blue"></i> Edit
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openEditEquipmentModal(id) {
    const item = equipmentStock.find(e => String(e.id) === String(id));
    if (!item) {
        showToast('Equipment not found.', 'error');
        return;
    }

    const idInput        = document.getElementById('editEquipmentId');
    const idDisplay      = document.getElementById('editEquipmentIdDisplay');
    const nameInput      = document.getElementById('editEquipmentName');
    const catInput       = document.getElementById('editEquipmentCategory');
    const totalInput     = document.getElementById('editEquipmentTotalQty');
    const damagedInput   = document.getElementById('editEquipmentDamagedQty');
    const availInput     = document.getElementById('editEquipmentAvailableQty');
    const roomInput      = document.getElementById('editEquipmentRoom');
    const statusInput    = document.getElementById('editEquipmentStatus');
    const rfidInput      = document.getElementById('editEquipmentRFID');

    const total = item.total !== undefined ? item.total : (item.totalQty || 0);
    const damaged = item.damaged !== undefined ? item.damaged : (item.damagedQty || 0);
    const available = Math.max(0, total - damaged);

    if (idInput)      idInput.value      = item.id;
    if (idDisplay)    idDisplay.value    = `${item.id} - ${item.name}`;
    if (nameInput)    nameInput.value    = item.name || '';
    if (catInput)     catInput.value     = item.category || '';
    if (totalInput)   totalInput.value   = total;
    if (damagedInput) damagedInput.value = damaged;
    if (availInput) {
        availInput.value = available;
        availInput.style.color = available === 0 ? '#ef4444' : available <= 2 ? '#f59e0b' : '#16a34a';
    }
    if (roomInput)    roomInput.value    = item.sportsRoom || item.room || '';
    if (statusInput)  statusInput.value  = item.status || 'available';
    if (rfidInput)    rfidInput.value    = item.rfidTag || item.rfidCode || item.rfid || '';

    const modal = document.getElementById('editEquipmentModal');
    if (modal) {
        modal.classList.add('show');
        setTimeout(() => nameInput?.focus(), 100);
    }
}
window.openEditEquipmentModal = openEditEquipmentModal;

async function confirmUpdateEquipment() {
    const id         = document.getElementById('editEquipmentId')?.value;
    const name       = document.getElementById('editEquipmentName')?.value.trim();
    const category   = document.getElementById('editEquipmentCategory')?.value.trim();
    const totalQty   = parseInt(document.getElementById('editEquipmentTotalQty')?.value);
    let damagedQty   = parseInt(document.getElementById('editEquipmentDamagedQty')?.value);
    const status     = document.getElementById('editEquipmentStatus')?.value;
    const rfidTag    = document.getElementById('editEquipmentRFID')?.value.trim();

    if (!id) {
        showToast('Invalid Equipment ID.', 'error');
        return;
    }
    if (!name || isNaN(totalQty) || totalQty < 0) {
        showToast('Please fill in Equipment Name and a valid Total Quantity.', 'error');
        return;
    }

    if (isNaN(damagedQty) || damagedQty < 0) damagedQty = 0;
    if (damagedQty > totalQty) damagedQty = totalQty;

    // Available Quantity is strictly auto-calculated: Total - Damaged
    const availQty = Math.max(0, totalQty - damagedQty);

    const saveBtn = document.getElementById('confirmEditEquipmentBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
        const data = await postStorekeeperAPI('/api/storekeeper/update-equipment', {
            id,
            name,
            category: category || 'General Sports',
            totalQty,
            damagedQty,
            availableQty: availQty,
            room: 'Main Gym Hall',
            status: status || 'available',
            rfidTag: rfidTag || ''
        });

        if (!data || !data.success) {
            showToast((data && data.error) || 'Failed to update equipment.', 'error');
            return;
        }

        const updated = data.item;
        // Update local equipmentStock
        const idx = equipmentStock.findIndex(e => String(e.id) === String(id));
        if (idx !== -1) {
            equipmentStock[idx] = {
                id: updated.id,
                name: updated.name,
                category: updated.category,
                total: updated.totalQty !== undefined ? updated.totalQty : updated.total,
                damaged: updated.damagedQty !== undefined ? updated.damagedQty : (updated.damaged || 0),
                available: updated.availableQty !== undefined ? updated.availableQty : updated.available,
                borrowed: updated.borrowedQty || 0,
                status: updated.status,
                sportsRoom: updated.room || 'Main Gym Hall',
                rfidTag: updated.rfidTag || ''
            };
        }

        closeModal('editEquipmentModal');
        renderStockTable();
        loadEquipmentSelect();
        updateDashboardStats();
        showToast(`✓ Equipment "${updated.name}" (${updated.id}) updated successfully!`, 'success');

    } catch (err) {
        showToast('Network error while saving equipment.', 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
    }
}
window.confirmUpdateEquipment = confirmUpdateEquipment;

// ========== Borrow History ==========
function initBorrowHistory() {
    renderBorrowHistory();
}

function renderBorrowHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    const list = borrowHistory || [];
    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 28px; color: var(--gray-500);">
                    <i class="fas fa-history" style="font-size: 1.8rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                    No borrow history records found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map(b => `
        <tr>
            <td><strong>${b.studentName || b.student || 'Student'}</strong><br><small style="color: var(--gray-500);">${b.studentId || b.user_id || b.studentRegNo || '-'}</small></td>
            <td>${b.equipmentName || b.equipment || 'Equipment Item'}</td>
            <td>${b.quantity || b.qty || 1}</td>
            <td>${formatDate(b.issueDate || b.issuedAt || b.borrowedAt || b.createdAt)}</td>
            <td>${(b.returnDate || b.returnedAt) ? formatDate(b.returnDate || b.returnedAt) : '-'}</td>
            <td>
                <span class="status-badge ${b.status}">
                    <i class="fas fa-${b.status === 'taken' || b.status === 'borrowed' ? 'clock' : b.status === 'returned' ? 'check-circle' : 'hourglass-half'}"></i>
                    ${b.status ? (b.status.charAt(0).toUpperCase() + b.status.slice(1)) : 'Borrowed'}
                </span>
            </td>
        </tr>
    `).join('');
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ========== Notifications Page ==========
function initNotificationsPage() {
    const tabs = document.querySelectorAll('.tab-btn');
    const notificationsList = document.getElementById('notificationsList');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderNotifications(tab.dataset.tab);
        });
    });

    renderNotifications('all');
}

function renderNotifications(filter) {
    const notificationsList = document.getElementById('notificationsList');
    if (!notificationsList) return;

    // 1. Low Stock & Out of Stock Table from Database
    if (filter === 'low-stock') {
        const lowStockItems = (equipmentStock || []).filter(item => {
            const avail = parseInt(item.available !== undefined ? item.available : (item.availableQty !== undefined ? item.availableQty : 0), 10);
            return avail <= 5 || item.status === 'low_stock' || item.status === 'out_of_stock' || avail === 0;
        });

        if (lowStockItems.length === 0) {
            notificationsList.innerHTML = `
                <div style="text-align: center; color: var(--gray-500); padding: 40px; background: var(--card-bg); border-radius: var(--radius); box-shadow: var(--shadow-sm);">
                    <i class="fas fa-check-circle" style="font-size: 2.5rem; color: #16a34a; margin-bottom: 12px; display: block;"></i>
                    <h3 style="font-size: 1.1rem; color: var(--gray-800); margin-bottom: 4px;">Stock Levels Healthy</h3>
                    <p style="font-size: 0.9rem; color: var(--gray-500); margin: 0;">There are currently no low-stock or out-of-stock equipment items in the database.</p>
                </div>
            `;
            return;
        }

        notificationsList.innerHTML = `
            <div class="card" style="padding: 0; overflow: hidden; border: 1px solid var(--gray-200); border-radius: var(--radius); box-shadow: var(--shadow-sm); background: var(--card-bg);">
                <div style="padding: 16px 20px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--gray-800);">
                            <i class="fas fa-exclamation-triangle" style="color: var(--orange); margin-right: 8px;"></i>
                            Low Stock & Out of Stock Inventory Alert (${lowStockItems.length})
                        </h4>
                        <p style="margin: 2px 0 0; font-size: 0.82rem; color: var(--gray-500);">Live equipment alerts fetched directly from the database</p>
                    </div>
                    <span class="badge" style="background: rgba(239,68,68,0.1); color: var(--danger); font-weight: 700; padding: 4px 10px; border-radius: 6px;">
                        ${lowStockItems.filter(e => parseInt(e.available, 10) === 0).length} Out of Stock • ${lowStockItems.filter(e => parseInt(e.available, 10) > 0).length} Low Stock
                    </span>
                </div>
                <div class="table-responsive" style="overflow-x: auto;">
                    <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: var(--gray-100); border-bottom: 2px solid var(--gray-200);">
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Equipment Name</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Category</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Sports Room</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Total Stock</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Available</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700);">Status</th>
                                <th style="padding: 12px 16px; font-size: 0.85rem; font-weight: 600; color: var(--gray-700); text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lowStockItems.map(item => {
                                const avail = parseInt(item.available !== undefined ? item.available : 0, 10);
                                const isOut = avail === 0;
                                const statusBadge = isOut ?
                                    `<span class="badge" style="background: #fee2e2; color: #b91c1c; font-weight: 700; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-times-circle"></i> Out of Stock</span>` :
                                    `<span class="badge" style="background: #ffedd5; color: #c2410c; font-weight: 700; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-exclamation-triangle"></i> Low Stock (${avail} left)</span>`;

                                return `
                                    <tr style="border-bottom: 1px solid var(--gray-100);">
                                        <td style="padding: 14px 16px;">
                                            <strong style="color: var(--gray-800); font-size: 0.92rem;">${item.name}</strong>
                                            <br><small style="color: var(--gray-400);">ID: ${item.id} ${item.rfidTag ? `• RFID: ${item.rfidTag}` : ''}</small>
                                        </td>
                                        <td style="padding: 14px 16px; color: var(--gray-600); font-size: 0.88rem;">${item.category || 'General'}</td>
                                        <td style="padding: 14px 16px; color: var(--gray-600); font-size: 0.88rem;">${item.sportsRoom || item.room || 'Main Gym Hall'}</td>
                                        <td style="padding: 14px 16px; font-weight: 600; color: var(--gray-700); font-size: 0.9rem;">${item.total || item.totalQty || 0}</td>
                                        <td style="padding: 14px 16px; font-weight: 700; color: ${isOut ? 'var(--danger)' : 'var(--orange)'}; font-size: 0.95rem;">${avail}</td>
                                        <td style="padding: 14px 16px;">${statusBadge}</td>
                                        <td style="padding: 14px 16px; text-align: right;">
                                            <button type="button" class="btn btn-sm btn-outline" onclick="openEditEquipmentModal('${item.id}')" style="padding: 4px 10px; font-size: 0.82rem;">
                                                <i class="fas fa-edit"></i> Restock
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        return;
    }

    // 2. Pending Borrow Requests from Database
    if (filter === 'requests') {
        const pendingLogs = (borrowHistory || []).filter(b => b.status === 'pending');
        if (pendingLogs.length === 0) {
            notificationsList.innerHTML = `
                <div style="text-align: center; color: var(--gray-500); padding: 32px; background: var(--card-bg); border-radius: var(--radius);">
                    <i class="fas fa-check-double" style="font-size: 2rem; color: #16a34a; margin-bottom: 8px; display: block;"></i>
                    <p style="margin: 0;">No pending equipment borrow requests at this time.</p>
                </div>
            `;
            return;
        }
        notificationsList.innerHTML = pendingLogs.map(b => `
            <div class="notification-item-full" style="border-left: 4px solid var(--blue); margin-bottom: 12px; background: var(--card-bg); border-radius: var(--radius); padding: 16px;">
                <i class="fas fa-hand-holding text-blue" style="font-size: 1.2rem; margin-top: 2px;"></i>
                <div class="content" style="flex: 1;">
                    <strong style="font-size: 0.95rem; color: var(--gray-800); display: block;">${b.studentName || 'Student'} requested ${b.quantity || 1}x ${b.equipmentName || 'Item'}</strong>
                    <p style="margin: 2px 0 4px; font-size: 0.85rem; color: var(--gray-600);">Registration: ${b.studentId || b.studentRegNo || '-'}</p>
                    <small style="color: var(--gray-400);">Requested on: ${formatDate(b.issueDate || b.createdAt)}</small>
                </div>
            </div>
        `).join('');
        return;
    }

    // 3. Activity Logs from Database
    if (filter === 'activity') {
        const recentLogs = (borrowHistory || []).slice(0, 10);
        if (recentLogs.length === 0) {
            notificationsList.innerHTML = `
                <div style="text-align: center; color: var(--gray-500); padding: 32px; background: var(--card-bg); border-radius: var(--radius);">
                    <i class="fas fa-history" style="font-size: 2rem; color: var(--gray-400); margin-bottom: 8px; display: block;"></i>
                    <p style="margin: 0;">No recent inventory activity recorded.</p>
                </div>
            `;
            return;
        }
        notificationsList.innerHTML = recentLogs.map(b => `
            <div class="notification-item-full" style="border-left: 4px solid ${b.status === 'returned' ? '#16a34a' : 'var(--blue)'}; margin-bottom: 10px; background: var(--card-bg); border-radius: var(--radius); padding: 14px 16px;">
                <i class="fas fa-${b.status === 'returned' ? 'check-circle' : 'clock'}" style="color: ${b.status === 'returned' ? '#16a34a' : 'var(--blue)'}; font-size: 1.1rem; margin-top: 2px;"></i>
                <div class="content" style="flex: 1;">
                    <strong style="font-size: 0.92rem; color: var(--gray-800);">${b.studentName || 'Student'} ${b.status === 'returned' ? 'returned' : 'borrowed'} ${b.quantity || 1}x ${b.equipmentName || 'Item'}</strong>
                    <p style="margin: 2px 0 0; font-size: 0.82rem; color: var(--gray-500);">${formatDate(b.issueDate || b.createdAt)} • Status: <span style="text-transform: capitalize; font-weight: 600;">${b.status || 'Active'}</span></p>
                </div>
            </div>
        `).join('');
        return;
    }

    // 4. "All" tab - Broadcast notices + Low Stock Alerts summary
    let broadcastHtml = '';
    if (storekeeperBroadcastNotices && storekeeperBroadcastNotices.length > 0) {
        broadcastHtml = storekeeperBroadcastNotices.map(n => {
            const priorityColor = n.priority === 'urgent' ? 'text-danger' : n.priority === 'high' ? 'text-orange' : 'text-blue';
            const icon = n.priority === 'urgent' ? 'fas fa-exclamation-circle' : n.priority === 'high' ? 'fas fa-exclamation-triangle' : 'fas fa-bullhorn';
            return `
                <div class="notification-item-full" style="border-left: 4px solid ${n.priority === 'urgent' ? 'var(--danger)' : n.priority === 'high' ? 'var(--orange)' : 'var(--blue)'}; margin-bottom: 12px; background: var(--card-bg); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm);">
                    <i class="${icon} ${priorityColor}" style="font-size: 1.2rem; margin-top: 2px;"></i>
                    <div class="content" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <strong style="font-size: 1rem; color: var(--gray-800);">${n.title}</strong>
                            <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: ${n.priority === 'urgent' ? 'var(--danger)' : n.priority === 'high' ? 'var(--orange)' : 'var(--blue)'};">${n.priority || 'normal'}</span>
                        </div>
                        <p style="margin: 0 0 6px; font-size: 0.9rem; color: var(--gray-600); line-height: 1.4;">${n.message}</p>
                        <small style="color: var(--gray-400);">By ${n.createdBy || 'Staff'} (${n.creatorRole || 'Staff'}) • ${n.createdAt ? new Date(n.createdAt).toLocaleDateString() : ''}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Low stock alert banner in "All" view if any exists
    const lowStockCount = (equipmentStock || []).filter(e => {
        const avail = parseInt(e.available !== undefined ? e.available : (e.availableQty !== undefined ? e.availableQty : 0), 10);
        return avail <= 5 || e.status === 'low_stock' || e.status === 'out_of_stock' || avail === 0;
    }).length;

    let lowStockBanner = '';
    if (lowStockCount > 0) {
        lowStockBanner = `
            <div style="background: #fff7ed; border-left: 4px solid var(--orange); border-radius: var(--radius); padding: 14px 18px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-exclamation-triangle" style="color: var(--orange); font-size: 1.2rem;"></i>
                    <span style="font-size: 0.92rem; color: #9a3412; font-weight: 600;">
                        ${lowStockCount} equipment item(s) are currently low on stock or out of stock in the database.
                    </span>
                </div>
                <button type="button" class="btn btn-sm btn-primary" onclick="document.querySelector('[data-tab=\\'low-stock\\']')?.click()" style="padding: 4px 12px; font-size: 0.82rem;">
                    View Low Stock Table
                </button>
            </div>
        `;
    }

    if (!broadcastHtml && !lowStockBanner) {
        notificationsList.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 32px; background: var(--card-bg); border-radius: var(--radius);"><i class="fas fa-bell-slash" style="font-size: 2rem; margin-bottom: 8px; display: block;"></i><p>No notices or inventory alerts available</p></div>';
        return;
    }

    notificationsList.innerHTML = lowStockBanner + broadcastHtml;
}

// ========== Modal Helpers ==========
function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
}
window.closeModal = closeModal;

document.getElementById('closeQuantityModal')?.addEventListener('click', () => {
    closeModal('quantityModal');
});

document.getElementById('confirmQuantityBtn')?.addEventListener('click', () => {
    confirmQuantity();
});

document.getElementById('cancelQuantityBtn')?.addEventListener('click', () => {
    closeModal('quantityModal');
});

document.getElementById('closeManualStudentModal')?.addEventListener('click', () => {
    closeModal('manualStudentModal');
});

document.getElementById('confirmManualStudentBtn')?.addEventListener('click', () => {
    const studentId = document.getElementById('manualStudentId')?.value.trim().toUpperCase();
    if (!studentId) {
        alert('Please enter Student ID');
        return;
    }
    processStudentScan(studentId);
    if (students.some(s => s.id === studentId || s.rfid === studentId)) {
        closeModal('manualStudentModal');
        document.getElementById('manualStudentId').value = '';
    }
});

document.getElementById('cancelManualStudentBtn')?.addEventListener('click', () => {
    closeModal('manualStudentModal');
});

document.getElementById('closeAddEquipmentModal')?.addEventListener('click', () => {
    closeModal('addEquipmentModal');
});

// Close modals on outside click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
});

// Quantity input enter key
document.getElementById('quantityInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmQuantity();
    }
});

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

// ========== Student Search – Global Functions (must be top-level for onclick) ==========
let _currentVerifiedStudent = null;

function resetStudentInfoView(statusText) {
    _currentVerifiedStudent = null;
    statusText = statusText || 'Waiting for Search';

    const nameEl  = document.getElementById('verifiedStudentName');
    const idEl    = document.getElementById('verifiedStudentId');
    const regEl   = document.getElementById('verifiedStudentRegNo');
    const emailEl = document.getElementById('verifiedStudentEmail');
    const deptEl  = document.getElementById('verifiedStudentDept');
    const statusEl = document.getElementById('verifiedStudentStatus');
    const rfidIdEl = document.getElementById('verifiedStudentRfidId');
    const box      = document.getElementById('verifiedStudentBox');
    const badge    = document.getElementById('verifiedStudentStatusBadge');
    const scanBtn  = document.getElementById('btnScanStudentRfid');

    if (nameEl)   nameEl.textContent  = '--';
    if (idEl)     idEl.textContent    = '--';
    if (regEl)    regEl.textContent   = '--';
    if (emailEl)  emailEl.textContent = '--';
    if (deptEl)   deptEl.textContent  = '--';
    if (statusEl) statusEl.textContent = '--';
    if (rfidIdEl) rfidIdEl.textContent = '-';

    if (box) { box.classList.remove('verified'); box.removeAttribute('style'); }
    if (badge) { badge.classList.remove('verified-active'); badge.removeAttribute('style'); badge.textContent = statusText; }
    if (scanBtn) scanBtn.disabled = true;
}

async function performStudentSearch(isManualSearch) {
    isManualSearch = (isManualSearch !== false);

    const searchInput = document.getElementById('assignStudentSearchInput');
    const query = (searchInput ? searchInput.value : '').trim();

    const box      = document.getElementById('verifiedStudentBox');
    const badge    = document.getElementById('verifiedStudentStatusBadge');
    const errBox   = document.getElementById('studentNotFoundErrorBox');
    const errTitle = document.getElementById('notFoundErrorTitle');
    const errText  = document.getElementById('notFoundErrorText');
    const scanBtn  = document.getElementById('btnScanStudentRfid');
    const nameEl   = document.getElementById('verifiedStudentName');
    const idEl     = document.getElementById('verifiedStudentId');
    const regEl    = document.getElementById('verifiedStudentRegNo');
    const emailEl  = document.getElementById('verifiedStudentEmail');
    const deptEl   = document.getElementById('verifiedStudentDept');
    const statusEl = document.getElementById('verifiedStudentStatus');
    const rfidIdEl = document.getElementById('verifiedStudentRfidId');

    if (!query) {
        resetStudentInfoView('Waiting for Search');
        if (errBox) errBox.style.display = 'none';
        if (isManualSearch) {
            if (errBox) {
                errBox.style.display = 'block';
                if (errTitle) errTitle.textContent = 'Empty User ID';
                if (errText)  errText.textContent  = 'Please enter a valid User ID.';
            }
            showToast('Please enter a valid User ID.', 'error');
        }
        return null;
    }

    try {
        let foundStudent = null;

        // Always hit the REST endpoint directly – most reliable path
        try {
            const fetchRes = await fetch('/api/storekeeper/search-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: query })
            });
            const jsonData = await fetchRes.json();
            if (jsonData && jsonData.success && jsonData.student) {
                foundStudent = jsonData.student;
            } else if (jsonData && jsonData.error) {
                throw new Error(jsonData.error);
            }
        } catch (fetchErr) {
            const msg = fetchErr.message || '';
            if (msg.includes('not belong to a student') || msg.includes('Invalid User')) {
                throw fetchErr;
            }
            // Network error – fall through to local array
        }

        // Local students array fallback (loaded from dashboard sync)
        if (!foundStudent && Array.isArray(students) && students.length > 0) {
            const clean = query.toUpperCase();
            foundStudent = students.find(s =>
                (s.user_id && s.user_id.toUpperCase() === clean) ||
                (s.id      && s.id.toUpperCase()      === clean) ||
                (s.regNo   && s.regNo.toUpperCase()   === clean) ||
                (s.name    && s.name.toUpperCase()    === clean)
            );
        }

        if (!foundStudent) {
            resetStudentInfoView('Student Not Found');
            if (errBox) {
                errBox.style.display = 'block';
                if (errTitle) errTitle.textContent = 'Student Not Found';
                if (errText)  errText.textContent  = 'No student found with that User ID.';
            }
            if (isManualSearch) showToast('Student Not Found. Please enter a valid User ID.', 'error');
            return null;
        }

        // ---- SUCCESS: fill Section 2 ----
        _currentVerifiedStudent = foundStudent;
        if (errBox) errBox.style.display = 'none';

        const studentUid  = foundStudent.user_id  || foundStudent.id  || query;
        const studentRfid = foundStudent.rfidTag   || foundStudent.rfidCode || foundStudent.rfid || '-';

        if (nameEl)   nameEl.textContent   = foundStudent.name       || '--';
        if (idEl)     idEl.textContent     = studentUid;
        if (regEl)    regEl.textContent    = foundStudent.regNo      || foundStudent.user_id || '--';
        if (emailEl)  emailEl.textContent  = foundStudent.email      || '--';
        if (deptEl)   deptEl.textContent   = foundStudent.department || '--';
        if (statusEl) statusEl.textContent = foundStudent.status     || 'Active';
        if (rfidIdEl) rfidIdEl.textContent = studentRfid;
        if (scanBtn)  scanBtn.disabled     = false;

        if (box)   { box.classList.add('verified'); }
        if (badge) { badge.classList.add('verified-active'); badge.textContent = '✓ Verified Student'; }

        if (isManualSearch) showToast(`✓ Verified: ${foundStudent.name} (${studentUid})`, 'success');
        return foundStudent;

    } catch (err) {
        resetStudentInfoView('Not Found');
        if (errBox) {
            errBox.style.display = 'block';
            const msg = err.message || '';
            if (msg.toLowerCase().includes('not belong to a student') || msg.toLowerCase().includes('invalid user')) {
                if (errTitle) errTitle.textContent = 'Invalid User';
                if (errText)  errText.textContent  = 'This User ID does not belong to a student.';
            } else {
                if (errTitle) errTitle.textContent = 'Student Not Found';
                if (errText)  errText.textContent  = 'Please enter a valid User ID.';
            }
        }
        if (isManualSearch) showToast(err.message || 'Student Not Found. Please enter a valid User ID.', 'error');
        return null;
    }
}

// ========== Equipment Search – Global Functions (must be top-level for onclick) ==========
let _currentVerifiedEquipment = null;

function resetEquipmentInfoView(statusText) {
    _currentVerifiedEquipment = null;
    statusText = statusText || 'Waiting for Search';

    const idEl       = document.getElementById('verifiedEquipmentId');
    const nameEl     = document.getElementById('verifiedEquipmentName');
    const catEl      = document.getElementById('verifiedEquipmentCategory');
    const roomEl     = document.getElementById('verifiedEquipmentRoom');
    const qtyEl      = document.getElementById('verifiedEquipmentTotalQty');
    const statusEl   = document.getElementById('verifiedEquipmentStatus');
    const rfidIdEl   = document.getElementById('verifiedEquipmentRfidId');
    const box        = document.getElementById('verifiedEquipmentBox');
    const badge      = document.getElementById('verifiedEquipmentStatusBadge');
    const scanBtn    = document.getElementById('btnScanEquipmentRfid');

    if (idEl)     idEl.textContent     = '--';
    if (nameEl)   nameEl.textContent   = '--';
    if (catEl)    catEl.textContent    = '--';
    if (roomEl)   roomEl.textContent   = '--';
    if (qtyEl)    qtyEl.textContent    = '--';
    if (statusEl) statusEl.textContent = '--';
    if (rfidIdEl) rfidIdEl.textContent = '-';

    if (box)   { box.classList.remove('verified'); box.removeAttribute('style'); }
    if (badge) { badge.classList.remove('verified-active'); badge.removeAttribute('style'); badge.textContent = statusText; }
    if (scanBtn) scanBtn.disabled = true;
}

async function performEquipmentSearch(isManualSearch) {
    isManualSearch = (isManualSearch !== false);

    const searchInput = document.getElementById('assignEquipmentSearchInput');
    const query = (searchInput ? searchInput.value : '').trim();

    const box      = document.getElementById('verifiedEquipmentBox');
    const badge    = document.getElementById('verifiedEquipmentStatusBadge');
    const errBox   = document.getElementById('equipmentNotFoundErrorBox');
    const errTitle = document.getElementById('equipNotFoundErrorTitle');
    const errText  = document.getElementById('equipNotFoundErrorText');
    const scanBtn  = document.getElementById('btnScanEquipmentRfid');
    const idEl     = document.getElementById('verifiedEquipmentId');
    const nameEl   = document.getElementById('verifiedEquipmentName');
    const catEl    = document.getElementById('verifiedEquipmentCategory');
    const roomEl   = document.getElementById('verifiedEquipmentRoom');
    const qtyEl    = document.getElementById('verifiedEquipmentTotalQty');
    const statusEl = document.getElementById('verifiedEquipmentStatus');
    const rfidIdEl = document.getElementById('verifiedEquipmentRfidId');

    if (!query) {
        resetEquipmentInfoView('Waiting for Search');
        if (errBox) errBox.style.display = 'none';
        if (isManualSearch) {
            if (errBox) {
                errBox.style.display = 'block';
                if (errTitle) errTitle.textContent = 'Empty Search';
                if (errText)  errText.textContent  = 'Please enter an Equipment ID or name.';
            }
            showToast('Please enter an Equipment ID or name.', 'error');
        }
        return null;
    }

    try {
        let foundEquipment = null;

        // Hit REST endpoint
        try {
            const fetchRes = await fetch('/api/storekeeper/search-equipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query })
            });
            const jsonData = await fetchRes.json();
            if (jsonData && jsonData.success && jsonData.equipment) {
                foundEquipment = jsonData.equipment;
            } else if (jsonData && jsonData.error) {
                throw new Error(jsonData.error);
            }
        } catch (fetchErr) {
            // fall through to local array
        }

        // Local equipmentStock array fallback
        if (!foundEquipment && Array.isArray(equipmentStock) && equipmentStock.length > 0) {
            const clean = query.toLowerCase();
            foundEquipment = equipmentStock.find(e =>
                (e.id   && String(e.id).toLowerCase() === clean) ||
                (e.name && e.name.toLowerCase().includes(clean)) ||
                (e.category && e.category.toLowerCase().includes(clean))
            );
        }

        if (!foundEquipment) {
            resetEquipmentInfoView('Equipment Not Found');
            if (errBox) {
                errBox.style.display = 'block';
                if (errTitle) errTitle.textContent = 'Equipment Not Found';
                if (errText)  errText.textContent  = 'No equipment found with that ID or name.';
            }
            if (isManualSearch) showToast('Equipment Not Found. Please enter a valid ID or name.', 'error');
            return null;
        }

        // ---- SUCCESS: fill Section 2 ----
        _currentVerifiedEquipment = foundEquipment;
        if (errBox) errBox.style.display = 'none';

        const eqStatus  = (foundEquipment.status || 'available');
        const eqRfid    = foundEquipment.rfidTag || foundEquipment.rfidCode || foundEquipment.rfid || '-';
        const statusCap = eqStatus.charAt(0).toUpperCase() + eqStatus.slice(1);

        if (idEl)     idEl.textContent     = foundEquipment.id       || '--';
        if (nameEl)   nameEl.textContent   = foundEquipment.name     || '--';
        if (catEl)    catEl.textContent    = foundEquipment.category || '--';
        if (roomEl)   roomEl.textContent   = foundEquipment.room     || '--';
        if (qtyEl)    qtyEl.textContent    = foundEquipment.totalQty !== undefined ? foundEquipment.totalQty : '--';
        if (statusEl) statusEl.textContent = statusCap;
        if (rfidIdEl) rfidIdEl.textContent = eqRfid;
        if (scanBtn)  scanBtn.disabled     = false;

        if (box)   { box.classList.add('verified'); }
        if (badge) { badge.classList.add('verified-active'); badge.textContent = '✓ Verified Equipment'; }

        if (isManualSearch) showToast(`✓ Found: ${foundEquipment.name}`, 'success');
        return foundEquipment;

    } catch (err) {
        resetEquipmentInfoView('Not Found');
        if (errBox) {
            errBox.style.display = 'block';
            if (errTitle) errTitle.textContent = 'Equipment Not Found';
            if (errText)  errText.textContent  = 'Please enter a valid Equipment ID or name.';
        }
        if (isManualSearch) showToast(err.message || 'Equipment Not Found.', 'error');
        return null;
    }
}

// ========== Assignment Tab Switcher ==========
function switchAssignTab(tab) {
    const studentPanel   = document.getElementById('assignStudentPanel');
    const equipmentPanel = document.getElementById('assignEquipmentPanel');
    const tabStudent     = document.getElementById('tabBtnStudent');
    const tabEquipment   = document.getElementById('tabBtnEquipment');

    if (tab === 'student') {
        if (studentPanel)   studentPanel.style.display   = '';
        if (equipmentPanel) equipmentPanel.style.display = 'none';
        if (tabStudent) { tabStudent.style.background = 'var(--blue)'; tabStudent.style.color = '#fff'; }
        if (tabEquipment) { tabEquipment.style.background = 'transparent'; tabEquipment.style.color = 'var(--blue)'; }
    } else {
        if (studentPanel)   studentPanel.style.display   = 'none';
        if (equipmentPanel) equipmentPanel.style.display = '';
        if (tabEquipment) { tabEquipment.style.background = 'var(--blue)'; tabEquipment.style.color = '#fff'; }
        if (tabStudent) { tabStudent.style.background = 'transparent'; tabStudent.style.color = 'var(--blue)'; }
    }
}

// ========== RFID Tag Assignment & Binding Page Logic ==========
async function initRfidAssignmentPage() {
    // Fetch live registry from Database API safely
    try {
        if (typeof fetchRfidRegistryData === 'function') {
            await fetchRfidRegistryData();
        }
    } catch (e) {
        console.warn('Live RFID registry sync:', e.message);
    }

    // Filters
    document.getElementById('searchAssignStudents')?.addEventListener('input', renderStudentRfidRegistry);

    let isScannerConnected = false;

    function updateScannerStatusBadge(connected, deviceName) {
        deviceName = deviceName || 'UniXsport_RFID_Scanner';
        isScannerConnected = connected;
        const badge = document.getElementById('rfidAssignmentScannerStatusBadge');
        const text = document.getElementById('rfidAssignmentScannerStatusText');
        const modalBadgeText = document.getElementById('modalScannerStatusText');

        if (connected) {
            if (badge) { badge.style.background = 'rgba(34, 197, 94, 0.1)'; badge.style.borderColor = 'rgba(34, 197, 94, 0.25)'; badge.style.color = '#16a34a'; }
            if (text) text.textContent = `🟢 Scanner Connected (${deviceName})`;
            if (modalBadgeText) modalBadgeText.textContent = `🟢 ${deviceName} connected & waiting...`;
        } else {
            if (badge) { badge.style.background = 'rgba(239, 68, 68, 0.1)'; badge.style.borderColor = 'rgba(239, 68, 68, 0.25)'; badge.style.color = '#ef4444'; }
            if (text) text.textContent = '🔴 Scanner Disconnected';
            if (modalBadgeText) modalBadgeText.textContent = '🔴 Scanner Disconnected';
        }
    }

    // Handle Manual Connect Button Click
    document.getElementById('btnConnectRfidScanner')?.addEventListener('click', async () => {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.connectUsbRfid === 'function') {
            const connected = await window.UniXsportAPI.connectUsbRfid(
                (uid) => console.log('RFID Packet Stream:', uid),
                () => updateScannerStatusBadge(false)
            );
            if (connected) {
                updateScannerStatusBadge(true, 'UniXsport_RFID_Scanner');
                showToast('🟢 RFID Scanner Connected successfully!', 'success');
            } else {
                updateScannerStatusBadge(false);
            }
        }
    });

    // Wire search input listeners
    document.getElementById('btnSearchAssignStudent')?.addEventListener('click', () => performStudentSearch(true));
    document.getElementById('assignStudentSearchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); performStudentSearch(true); }
    });
    document.getElementById('assignStudentSearchInput')?.addEventListener('input', () => {
        const errBox = document.getElementById('studentNotFoundErrorBox');
        if (errBox) errBox.style.display = 'none';
        resetStudentInfoView('Waiting for Search');
    });

    // Wire equipment search input listeners
    document.getElementById('btnSearchAssignEquipment')?.addEventListener('click', () => performEquipmentSearch(true));
    document.getElementById('assignEquipmentSearchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); performEquipmentSearch(true); }
    });
    document.getElementById('assignEquipmentSearchInput')?.addEventListener('input', () => {
        const errBox = document.getElementById('equipmentNotFoundErrorBox');
        if (errBox) errBox.style.display = 'none';
        resetEquipmentInfoView('Waiting for Search');
    });

    // Modal Action Buttons
    const modal = document.getElementById('rfidScanAnimationModal');
    const btnCloseModal = document.getElementById('btnCloseScanModal');
    const btnScanAnother = document.getElementById('btnScanAnotherRfid');
    const btnDone = document.getElementById('btnDoneRfidAssignment');

    let activeRfidEventSource = null;
    let activeRfidPollingTimer = null;
    let isAssigningInProgress = false;

    function stopActiveRfidListeners() {
        if (activeRfidEventSource) {
            activeRfidEventSource.close();
            activeRfidEventSource = null;
        }
        if (activeRfidPollingTimer) {
            clearInterval(activeRfidPollingTimer);
            activeRfidPollingTimer = null;
        }
        isAssigningInProgress = false;
    }

    function resetModalState(type, name, id) {
        const title = document.getElementById('scanModalTitle');
        const subtext = document.getElementById('scanModalSubtext');
        const pulse = document.getElementById('modalPulseRing');
        const spin = document.getElementById('modalSpinRing');
        const iconBg = document.getElementById('modalIconBg');
        const icon = document.getElementById('scanModalIcon');
        const uidRow = document.getElementById('modalRfidUidRow');
        const uidText = document.getElementById('modalRfidUidText');
        const nameText = document.getElementById('modalStudentNameText');
        const idText = document.getElementById('modalStudentIdText');
        const badgeText = document.getElementById('modalScannerStatusText');

        if (title) title.textContent = type === 'student' ? 'Scan Student RFID Card' : 'Scan Equipment RFID Tag';
        if (subtext) subtext.innerHTML = `Place the physical RFID card/tag on the ESP32 scanner for <strong>${name}</strong> (${id}).`;
        if (pulse) pulse.style.display = 'block';
        if (spin) spin.style.display = 'block';
        if (iconBg) {
            iconBg.style.background = 'rgba(37, 99, 235, 0.12)';
            iconBg.style.color = 'var(--blue)';
        }
        if (icon) icon.className = 'fas fa-qrcode';
        if (uidRow) uidRow.style.display = 'none';
        if (uidText) uidText.textContent = '--';
        if (nameText) nameText.textContent = name;
        if (idText) idText.textContent = id;
        if (badgeText) badgeText.textContent = '🟢 ESP32 Hardware Reader is active and waiting...';

        if (btnCloseModal) btnCloseModal.style.display = 'inline-block';
        if (btnScanAnother) btnScanAnother.style.display = 'none';
        if (btnDone) btnDone.style.display = 'none';
    }

    function startHardwareRfidAssignment(type) {
        let targetEntity = (type === 'student') ? _currentVerifiedStudent : _currentVerifiedEquipment;
        let targetName = '';
        let targetId = '';

        if (type === 'student') {
            if (!targetEntity) {
                showToast('Please search and verify a student in Section 1 first.', 'error');
                return;
            }
            targetName = targetEntity.name || 'Student';
            targetId = targetEntity.user_id || targetEntity.regNo || targetEntity.id || 'US002';
        } else {
            if (!targetEntity) {
                showToast('Please search and verify an equipment item in Section 1 first.', 'error');
                return;
            }
            targetName = targetEntity.name || 'Equipment';
            targetId = targetEntity.id || 'EQP001';
        }

        resetModalState(type, targetName, targetId);
        if (modal) modal.style.display = 'flex';

        stopActiveRfidListeners();
        isAssigningInProgress = false;

        const scanSessionStartTime = Date.now() - 500;

        async function handleIncomingTag(rawTag) {
            if (isAssigningInProgress) return;
            const cleanTag = String(rawTag || '').trim().replace(/\s+/g, ' ').toUpperCase();
            if (!cleanTag) return;

            isAssigningInProgress = true;
            stopActiveRfidListeners();

            const title = document.getElementById('scanModalTitle');
            const subtext = document.getElementById('scanModalSubtext');
            const uidRow = document.getElementById('modalRfidUidRow');
            const uidText = document.getElementById('modalRfidUidText');
            const pulse = document.getElementById('modalPulseRing');
            const spin = document.getElementById('modalSpinRing');
            const iconBg = document.getElementById('modalIconBg');
            const icon = document.getElementById('scanModalIcon');

            if (uidRow) uidRow.style.display = 'block';
            if (uidText) uidText.textContent = cleanTag;
            if (subtext) subtext.textContent = 'Saving RFID tag assignment to database...';

            try {
                let res = null;
                if (type === 'student') {
                    const fetchRes = await fetch('/api/storekeeper/assign-student-rfid', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: targetId, rfidTag: cleanTag })
                    });
                    res = await fetchRes.json();
                } else {
                    const fetchRes = await fetch('/api/storekeeper/assign-equipment-rfid', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ equipmentId: targetId, rfidTag: cleanTag })
                    });
                    res = await fetchRes.json();
                }

                if (res && res.success) {
                    // Success View
                    if (title) title.textContent = 'RFID Tag Assigned Successfully!';
                    if (subtext) subtext.innerHTML = `Tag <strong>${cleanTag}</strong> bound to <strong>${targetName}</strong>.`;
                    if (pulse) pulse.style.display = 'none';
                    if (spin) spin.style.display = 'none';
                    if (iconBg) {
                        iconBg.style.background = 'rgba(34, 197, 94, 0.15)';
                        iconBg.style.color = '#16a34a';
                    }
                    if (icon) icon.className = 'fas fa-check-circle';

                    if (btnCloseModal) btnCloseModal.style.display = 'none';
                    if (btnScanAnother) btnScanAnother.style.display = 'none';
                    if (btnDone) btnDone.style.display = 'inline-block';

                    // Update UI Card
                    if (type === 'student') {
                        const rfidBadge = document.getElementById('verifiedStudentRfidId');
                        if (rfidBadge) rfidBadge.textContent = cleanTag;
                        if (_currentVerifiedStudent) {
                            _currentVerifiedStudent.rfidTag = cleanTag;
                            _currentVerifiedStudent.rfidCode = cleanTag;
                        }
                        const lastScanned = document.getElementById('scannedStudentCardStatus');
                        const lastUid = document.getElementById('lastScannedStudentCardUid');
                        if (lastScanned) lastScanned.style.display = 'block';
                        if (lastUid) lastUid.textContent = cleanTag;
                    } else {
                        const rfidBadge = document.getElementById('verifiedEquipmentRfidId');
                        if (rfidBadge) rfidBadge.textContent = cleanTag;
                        if (_currentVerifiedEquipment) {
                            _currentVerifiedEquipment.rfidTag = cleanTag;
                            _currentVerifiedEquipment.rfidCode = cleanTag;
                        }
                        const lastScanned = document.getElementById('scannedEquipmentCardStatus');
                        const lastUid = document.getElementById('lastScannedEquipmentCardUid');
                        if (lastScanned) lastScanned.style.display = 'block';
                        if (lastUid) lastUid.textContent = cleanTag;
                    }

                    showToast(`✓ RFID Tag ${cleanTag} assigned to ${targetName} successfully!`, 'success');

                    // Refresh registries
                    fetchRfidRegistryData();

                    // Automatically close the popup animation after 1.5 seconds!
                    setTimeout(() => {
                        if (modal) modal.style.display = 'none';
                        stopActiveRfidListeners();
                    }, 1500);

                } else {
                    const errMsg = res?.error || 'Assignment Failed: Unable to save the RFID assignment. Please try again.';
                    if (title) title.textContent = 'RFID Already Assigned';
                    if (subtext) subtext.innerHTML = `<span style="color: #dc2626;">${errMsg}</span>`;
                    if (pulse) pulse.style.display = 'none';
                    if (spin) spin.style.display = 'none';
                    if (iconBg) {
                        iconBg.style.background = 'rgba(239, 68, 68, 0.15)';
                        iconBg.style.color = '#dc2626';
                    }
                    if (icon) icon.className = 'fas fa-exclamation-triangle';

                    if (btnCloseModal) btnCloseModal.style.display = 'inline-block';
                    if (btnScanAnother) {
                        btnScanAnother.style.display = 'inline-block';
                        btnScanAnother.onclick = () => startHardwareRfidAssignment(type);
                    }
                    if (btnDone) btnDone.style.display = 'none';

                    showToast(errMsg, 'error');
                }
            } catch (err) {
                console.error('Assignment error:', err);
                showToast(err.message || 'Server error during RFID assignment', 'error');
                isAssigningInProgress = false;
            }
        }

        // 1. Listen via SSE from /api/rfid/events
        try {
            if (window.EventSource) {
                activeRfidEventSource = new EventSource(`${getStorekeeperApiBase()}/api/rfid/events`);
                const handleSseMessage = (e) => {
                    try {
                        const data = JSON.parse(e.data);
                        if (data && data.rfidTag) handleIncomingTag(data.rfidTag);
                    } catch(err) {}
                };
                activeRfidEventSource.addEventListener('scan_packet', handleSseMessage);
                activeRfidEventSource.addEventListener('user_scan', handleSseMessage);
                activeRfidEventSource.addEventListener('equipment_scan', handleSseMessage);
                activeRfidEventSource.addEventListener('unauthorized_scan', handleSseMessage);
            }
        } catch(e) {}

        // 2. Short-polling fallback (checks /api/rfid/latest-scan every 400ms)
        let lastPolledScanId = null;
        activeRfidPollingTimer = setInterval(async () => {
            if (isAssigningInProgress) return;
            try {
                const res = await fetch(`${getStorekeeperApiBase()}/api/rfid/latest-scan`).then(r => r.json());
                if (res && res.success && res.scan && res.scan.rfidTag) {
                    const scan = res.scan;
                    if (scan.timestamp >= scanSessionStartTime && scan.id !== lastPolledScanId) {
                        lastPolledScanId = scan.id;
                        handleIncomingTag(scan.rfidTag);
                    }
                }
            } catch(e) {}
        }, 400);
    }

    btnCloseModal?.addEventListener('click', () => {
        stopActiveRfidListeners();
        if (modal) modal.style.display = 'none';
    });

    btnDone?.addEventListener('click', () => {
        stopActiveRfidListeners();
        if (modal) modal.style.display = 'none';
        fetchRfidRegistryData();
    });

    // Wire Section 3 Buttons
    document.getElementById('btnScanStudentRfid')?.addEventListener('click', async () => {
        if (!_currentVerifiedStudent) {
            const s = await performStudentSearch(true);
            if (!s) return;
        }
        startHardwareRfidAssignment('student');
    });

    document.getElementById('btnScanEquipmentRfid')?.addEventListener('click', async () => {
        if (!_currentVerifiedEquipment) {
            const eq = await performEquipmentSearch(true);
            if (!eq) return;
        }
        startHardwareRfidAssignment('equipment');
    });
}

async function fetchRfidRegistryData() {
    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.fetchRfidRegistry === 'function') {
            const res = await window.UniXsportAPI.fetchRfidRegistry();
            if (res && res.success) {
                if (res.students) {
                    students = res.students.map(u => ({
                        id: u.user_id || u.regNo || u.id,
                        user_id: u.user_id || u.userId || 'US002',
                        regNo: u.regNo || u.user_id || u.id,
                        name: u.name,
                        department: u.department || 'Technology',
                        rfid: u.rfidTag || u.rfidCode || u.rfid || '',
                        status: u.status || 'Active'
                    }));
                }
            }
        }
    } catch (e) {
        console.warn('API fetchRfidRegistry fallback to local state:', e);
    }

    populateStudentAssignDropdown();
    renderStudentRfidRegistry();
}

function populateStudentAssignDropdown() {
    const datalist = document.getElementById('studentSearchDatalist');
    if (!datalist) return;
    datalist.innerHTML = students.map(s => `<option value="${s.user_id || s.id}">${s.name} (${s.user_id || s.id})</option>`).join('');
}

function renderStudentRfidRegistry() {
    const tbody = document.getElementById('studentRfidRegistryTbody');
    if (!tbody) return;

    const query = document.getElementById('searchAssignStudents')?.value.toLowerCase() || '';
    const filtered = students.filter(s =>
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.user_id && s.user_id.toLowerCase().includes(query)) ||
        (s.id && s.id.toLowerCase().includes(query)) ||
        (s.rfid && s.rfid.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 24px; color: var(--gray-500);">
                    No student records found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(s => `
        <tr>
            <td style="padding: 8px 12px; font-family: monospace; font-weight: 700; color: var(--blue);">${s.user_id || s.id}</td>
            <td style="padding: 8px 12px;"><strong>${s.name}</strong></td>
            <td style="padding: 8px 12px;">
                <span class="badge ${s.rfid ? 'badge-dept' : 'badge-status'}" style="${s.rfid ? 'background: rgba(37, 99, 235, 0.1); color: var(--blue); font-family: monospace; font-weight: 600;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'}">
                    ${s.rfid ? s.rfid : '-'}
                </span>
            </td>
            <td style="padding: 8px 12px;">
                <span class="badge badge-success" style="background: rgba(34, 197, 94, 0.1); color: #16a34a; font-weight: 600;">
                    ${s.status || 'Active'}
                </span>
            </td>
            <td style="padding: 8px 12px;">
                <button type="button" class="btn btn-sm btn-outline" onclick="editStudentRfid('${s.user_id || s.id}')">
                    <i class="fas fa-edit"></i> Edit
                </button>
            </td>
        </tr>
    `).join('');
}

function editStudentRfid(studentId) {
    const student = students.find(s => s.user_id === studentId || s.id === studentId);
    if (student) {
        const input = document.getElementById('assignStudentSearchInput');
        if (input) {
            input.value = student.user_id || student.id;
            input.focus();
        }
        performStudentSearch();
    }
}
window.editStudentRfid = editStudentRfid;
window.editStudentRfid = editStudentRfid;

function editEquipmentRfid(eqId) {
    const select = document.getElementById('assignEquipmentSelect');
    if (select) select.value = eqId;

    const eq = equipmentStock.find(e => String(e.id) === String(eqId));
    if (eq) {
        const input = document.getElementById('assignEquipmentRfidInput');
        if (input) {
            input.value = eq.rfid || '';
            input.focus();
        }
    }
}
window.editEquipmentRfid = editEquipmentRfid;

// ==========================================
// Monthly Report Generation Logic
// ==========================================
let currentMonthlyReportData = null;

function initMonthlyReportPage() {
    const monthInput = document.getElementById('reportMonthInput');
    if (monthInput && !monthInput.value) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        monthInput.value = `${y}-${m}`;
    }

    const genBtn = document.getElementById('btnGenerateReport');
    if (genBtn && !genBtn.dataset.listenerAttached) {
        genBtn.dataset.listenerAttached = 'true';
        genBtn.addEventListener('click', () => {
            generateMonthlyReport();
        });
    }

    const downloadBtn = document.getElementById('btnDownloadReportPdf');
    if (downloadBtn && !downloadBtn.dataset.listenerAttached) {
        downloadBtn.dataset.listenerAttached = 'true';
        downloadBtn.addEventListener('click', () => {
            downloadMonthlyReportPdf();
        });
    }
}
window.initMonthlyReportPage = initMonthlyReportPage;

async function generateMonthlyReport() {
    const monthInput = document.getElementById('reportMonthInput');
    const monthVal = (monthInput ? monthInput.value : '').trim();

    if (!monthVal) {
        showToast('Please select a report month.', 'error');
        return;
    }

    const genBtn = document.getElementById('btnGenerateReport');
    const downloadBtn = document.getElementById('btnDownloadReportPdf');
    const loadingContainer = document.getElementById('reportLoadingContainer');
    const previewContainer = document.getElementById('reportPreviewContainer');

    if (genBtn) {
        genBtn.disabled = true;
        genBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (previewContainer) previewContainer.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';

    try {
        let resData = null;

        // Try multi-host endpoint
        const endpoints = [
            `/api/storekeeper/monthly-report-data?month=${encodeURIComponent(monthVal)}`,
            `http://localhost:5000/api/storekeeper/monthly-report-data?month=${encodeURIComponent(monthVal)}`,
            `http://127.0.0.1:5000/api/storekeeper/monthly-report-data?month=${encodeURIComponent(monthVal)}`
        ];

        for (const url of endpoints) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const parsed = await response.json();
                    if (parsed && parsed.success && parsed.reportData) {
                        resData = parsed.reportData;
                        break;
                    }
                }
            } catch (e) {}
        }

        if (!resData) {
            showToast('Unable to generate the report. Please try again.', 'error');
            return;
        }

        currentMonthlyReportData = resData;
        renderMonthlyReportPreview(resData);

        if (previewContainer) previewContainer.style.display = 'block';
        if (downloadBtn) downloadBtn.style.display = 'inline-flex';

        showToast(`✓ Monthly report generated successfully for ${resData.monthName}.`, 'success');
    } catch (err) {
        console.error('Report generation error:', err);
        showToast('Failed to compile monthly report.', 'error');
    } finally {
        if (loadingContainer) loadingContainer.style.display = 'none';
        if (genBtn) {
            genBtn.disabled = false;
            genBtn.innerHTML = '<i class="fas fa-chart-line"></i> Generate Report';
        }
    }
}
window.generateMonthlyReport = generateMonthlyReport;

function renderMonthlyReportPreview(report) {
    if (!report) return;

    // Header & Info
    const titleEl = document.getElementById('previewReportTitle');
    const genAtEl = document.getElementById('previewGeneratedAt');
    const skNameEl = document.getElementById('previewStorekeeperName');
    const skIdEl = document.getElementById('previewStorekeeperId');
    const skEmailEl = document.getElementById('previewStorekeeperEmail');

    if (titleEl) titleEl.textContent = `Monthly Equipment Report: ${report.monthName}`;
    if (genAtEl) genAtEl.textContent = `Generated on: ${report.generatedAt} • UniXsport Storekeeper Module`;

    const sk = report.storekeeper || {};
    if (skNameEl) skNameEl.textContent = sk.name || 'Storekeeper';
    if (skIdEl) skIdEl.textContent = `ID: ${sk.id || 'US004'} (${(sk.role || 'storekeeper').toUpperCase()})`;
    if (skEmailEl) skEmailEl.textContent = sk.email || 'store@unixsport.edu';

    // Summary Metric Cards
    const sum = report.summary || {};
    const totalIssuedEl = document.getElementById('previewTotalIssued');
    const totalReturnedEl = document.getElementById('previewTotalReturned');
    const borrowTxEl = document.getElementById('previewBorrowTx');
    const returnTxEl = document.getElementById('previewReturnTx');

    if (totalIssuedEl) totalIssuedEl.textContent = sum.totalIssuedQty || 0;
    if (totalReturnedEl) totalReturnedEl.textContent = sum.totalReturnedQty || 0;
    if (borrowTxEl) borrowTxEl.textContent = sum.totalBorrowTx || 0;
    if (returnTxEl) returnTxEl.textContent = sum.totalReturnTx || 0;

    // Table 1: Equipment Availability
    const availTbody = document.getElementById('previewAvailabilityTbody');
    if (availTbody) {
        const items = report.equipmentAvailability || [];
        if (items.length === 0) {
            availTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 18px; color: var(--gray-500);">No equipment items found in database.</td></tr>`;
        } else {
            availTbody.innerHTML = items.map(eq => {
                const total = eq.totalQty !== undefined ? eq.totalQty : (eq.total || 0);
                const avail = eq.availableQty !== undefined ? eq.availableQty : (eq.available || 0);
                const status = (eq.status || 'available').toLowerCase();
                let statusBadge = '<span class="badge" style="background: rgba(22,163,74,0.1); color: #16a34a; font-weight: 700;">In Stock</span>';
                if (status === 'maintenance' || status === 'damaged') {
                    statusBadge = '<span class="badge" style="background: rgba(245,158,11,0.1); color: #f59e0b; font-weight: 700;">Maintenance</span>';
                } else if (status === 'out-of-stock' || avail === 0) {
                    statusBadge = '<span class="badge" style="background: rgba(239,68,68,0.1); color: #ef4444; font-weight: 700;">Out of Stock</span>';
                } else if (status === 'low-stock' || avail <= 3) {
                    statusBadge = '<span class="badge" style="background: rgba(245,158,11,0.1); color: #f59e0b; font-weight: 700;">Low Stock</span>';
                }

                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 10px 12px; font-weight: 700; color: var(--blue);">${eq.id}</td>
                        <td style="padding: 10px 12px;">${eq.category || 'General'}</td>
                        <td style="padding: 10px 12px; font-weight: 600;">${eq.name}</td>
                        <td style="padding: 10px 12px; color: var(--gray-600);">${eq.room || 'Main Gym Hall'}</td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 700;">${total}</td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: ${avail > 0 ? '#16a34a' : '#ef4444'};">${avail}</td>
                        <td style="padding: 10px 12px; text-align: center;">${statusBadge}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Table 2: Borrow / Return Activity
    const borrowTbody = document.getElementById('previewBorrowActivityTbody');
    if (borrowTbody) {
        const logs = report.borrowActivity || [];
        if (logs.length === 0) {
            borrowTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: var(--gray-500); font-style: italic;">No borrowing or return transactions were recorded during this month.</td></tr>`;
        } else {
            borrowTbody.innerHTML = logs.map(b => {
                const dateStr = b.issuedAt ? new Date(b.issuedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : (b.date || '--');
                const qty = b.qty || b.quantity || 1;
                const retQty = b.returnedQty !== undefined ? b.returnedQty : (b.status === 'returned' ? qty : 0);
                const status = (b.status || 'borrowed').toLowerCase();
                const isReturned = status === 'returned';

                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 10px 12px; font-size: 0.85rem; color: var(--gray-600);">${dateStr}</td>
                        <td style="padding: 10px 12px; font-weight: 700; color: var(--blue);">${b.user_id || b.studentId || '--'}</td>
                        <td style="padding: 10px 12px; font-weight: 600;">${b.studentName || '--'}</td>
                        <td style="padding: 10px 12px;">${b.equipmentName || b.equipment || '--'}</td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 700;">${qty}</td>
                        <td style="padding: 10px 12px; text-align: center; font-weight: 700; color: ${retQty > 0 ? '#16a34a' : 'inherit'};">${retQty}</td>
                        <td style="padding: 10px 12px; color: var(--gray-600); font-size: 0.85rem;">${b.issuedBy || 'Storekeeper'}</td>
                        <td style="padding: 10px 12px; text-align: center;">
                            <span class="badge" style="background: ${isReturned ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.1)'}; color: ${isReturned ? '#16a34a' : '#f59e0b'}; font-weight: 700;">
                                ${isReturned ? 'Returned' : 'Active'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Table 3: RFID Assignments
    const rfidTbody = document.getElementById('previewRfidTbody');
    if (rfidTbody) {
        const assignments = report.rfidAssignments || [];
        if (assignments.length === 0) {
            rfidTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--gray-500); font-style: italic;">No RFID tag assignments were recorded during this month.</td></tr>`;
        } else {
            rfidTbody.innerHTML = assignments.map(a => {
                const dateStr = a.date ? new Date(a.date).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '--';
                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 10px 12px; font-size: 0.85rem; color: var(--gray-600);">${dateStr}</td>
                        <td style="padding: 10px 12px; font-weight: 700; color: var(--blue);">${a.id || '--'}</td>
                        <td style="padding: 10px 12px; font-weight: 600;">${a.name || '--'}</td>
                        <td style="padding: 10px 12px; font-family: monospace; font-weight: 700; color: var(--gray-900);">${a.rfidTag || '--'}</td>
                        <td style="padding: 10px 12px; text-align: center;">
                            <span class="badge" style="background: rgba(37,99,235,0.1); color: #2563eb; font-weight: 700;">${a.type || 'Student'}</span>
                        </td>
                        <td style="padding: 10px 12px; text-align: center;">
                            <span class="badge" style="background: rgba(22,163,74,0.1); color: #16a34a; font-weight: 700;">Bound</span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }
}
window.renderMonthlyReportPreview = renderMonthlyReportPreview;

async function downloadMonthlyReportPdf() {
    const monthInput = document.getElementById('reportMonthInput');
    const monthVal = (monthInput ? monthInput.value : '').trim();

    if (!monthVal) {
        showToast('Please select a month first.', 'error');
        return;
    }

    const downloadBtn = document.getElementById('btnDownloadReportPdf');
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing PDF...';
    }

    try {
        const endpoints = [
            `/api/storekeeper/monthly-report-pdf?month=${encodeURIComponent(monthVal)}`,
            `http://localhost:5000/api/storekeeper/monthly-report-pdf?month=${encodeURIComponent(monthVal)}`,
            `http://127.0.0.1:5000/api/storekeeper/monthly-report-pdf?month=${encodeURIComponent(monthVal)}`
        ];

        let blob = null;
        for (const url of endpoints) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    blob = await response.blob();
                    break;
                }
            } catch (e) {}
        }

        if (!blob) {
            showToast('Unable to download PDF report. Please try again.', 'error');
            return;
        }

        const safeMonth = currentMonthlyReportData && currentMonthlyReportData.monthName
            ? currentMonthlyReportData.monthName.replace(/\s+/g, '_')
            : monthVal;
        const filename = `UniXsport_Monthly_Report_${safeMonth}.pdf`;

        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);

        showToast(`✓ Downloaded ${filename}`, 'success');
    } catch (err) {
        console.error('PDF download error:', err);
        showToast('Failed to download PDF report.', 'error');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Download PDF';
        }
    }
}
window.downloadMonthlyReportPdf = downloadMonthlyReportPdf;

