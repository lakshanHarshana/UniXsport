/**
 * UniXsport - Home Page
 * Main Application JavaScript - Fully Connected to Database API
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initContactForm();
    loadStatisticsData();
    loadFacilitiesData();
    loadAnnouncementsData();
    loadEventsData();
    initLiveBeacon();
    initDarkMode();
    initPortalDropdown();
});

// ========== Live Beacon ==========
async function initLiveBeacon() {
    const liveCapacity = document.getElementById('liveGymCapacity');
    const liveLatency = document.getElementById('liveLatency');
    const liveBookings = document.getElementById('liveBookingsCount');

    if (!liveCapacity || !liveLatency || !liveBookings) return;

    async function updateBeacon() {
        const start = performance.now();
        try {
            const stats = await window.UniXsportAPI.getDashboardMetrics();
            const latency = Math.round(performance.now() - start);

            if (stats && stats.success) {
                liveCapacity.textContent = `${stats.todayBookings || 0} / ${stats.maxCapacity || 30} active`;
                liveLatency.textContent = `${Math.max(4, latency)} ms`;
                liveBookings.textContent = `${stats.activeBookings || 0} slots`;
            }
        } catch (e) {
            liveCapacity.textContent = `0 / 30 active`;
            liveLatency.textContent = `12 ms`;
            liveBookings.textContent = `0 slots`;
        }
    }

    updateBeacon();
    setInterval(updateBeacon, 10000);
}

// ========== Navigation ==========
function initNavigation() {
    const pages = document.querySelectorAll('.page');

    function showPage(pageId) {
        if (!pageId) pageId = 'dashboard';
        pages.forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });
        window.scrollTo(0, 0);
    }

    // Delegated handler for all links with data-page
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-page]');
        if (trigger) {
            e.preventDefault();
            const pageId = trigger.dataset.page;
            showPage(pageId);
            if (history.pushState) {
                history.pushState(null, null, `#${pageId}`);
            }
        }
    });

    // Hash navigation on initial load
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(`page-${hash}`)) {
        showPage(hash);
    }

    window.addEventListener('popstate', () => {
        const h = window.location.hash.replace('#', '');
        showPage(h || 'dashboard');
    });

    window.showPage = showPage;
}

// ========== Contact Form ==========
function initContactForm() {
    const form = document.getElementById('contactForm');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const subject = document.getElementById('contactSubject').value.trim();
        const message = document.getElementById('contactMessage').value.trim();

        // Validate inputs
        if (!name || !email || !subject || !message) {
            showToast('Please fill in all fields', 'error');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerHTML : 'Send Message';
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitBtn.disabled = true;
        }

        try {
            const res = await window.UniXsportAPI.submitContactMessage({ name, email, subject, message });
            showToast(res.message || 'Your message has been sent successfully!', 'success');
            form.reset();
        } catch (err) {
            showToast(err.message || 'Failed to send message. Please try again.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    });
}

// ========== Role Navigation ==========
function navigateToRole(role) {
    const roleToFile = {
        'student': 'student.html',
        'coach': 'coach.html',
        'admin': 'admin.html',
        'storekeeper': 'storekeeper.html'
    };

    if (roleToFile[role]) {
        localStorage.setItem('userRole', role);
        window.location.href = roleToFile[role];
    } else {
        showToast('Invalid role selected', 'error');
    }
}

// ========== Require Login ==========
function requireLogin(role) {
    const urlRole = encodeURIComponent(role);
    window.location.href = `login.html?role=${urlRole}`;
}

// ========== Load Statistics Data from Real Database ==========
async function loadStatisticsData() {
    const activeUsersEl = document.getElementById('activeUsers');
    const equipmentCountEl = document.getElementById('equipmentCount');
    const activeClassesEl = document.getElementById('activeClasses');
    const facilitiesCountEl = document.getElementById('facilitiesCount');

    // Display loading state
    if (activeUsersEl) activeUsersEl.textContent = '...';
    if (equipmentCountEl) equipmentCountEl.textContent = '...';
    if (activeClassesEl) activeClassesEl.textContent = '...';
    if (facilitiesCountEl) facilitiesCountEl.textContent = '...';

    const baseUrl = (typeof window !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');

    const endpoints = [
        baseUrl + '/api/dashboard/metrics',
        '/api/dashboard/metrics',
        baseUrl + '/api/public/stats',
        '/api/public/stats'
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(ep).then(r => r.json());
            if (res && res.success) {
                const users = res.activeUsers !== undefined ? res.activeUsers : (res.activeStudents !== undefined ? res.activeStudents : 0);
                const equip = res.totalEquipment !== undefined ? res.totalEquipment : 0;
                const classes = res.activeClasses !== undefined ? res.activeClasses : (res.activeBookings !== undefined ? res.activeBookings : 0);
                const facilities = res.facilitiesCount !== undefined ? res.facilitiesCount : (res.facilities?.total !== undefined ? res.facilities.total : (res.facilities?.available !== undefined ? res.facilities.available : 0));

                animateCounter(activeUsersEl, users);
                animateCounter(equipmentCountEl, equip);
                animateCounter(activeClassesEl, classes);
                animateCounter(facilitiesCountEl, facilities);
                return;
            }
        } catch (e) {
            // try next endpoint
        }
    }

    // Try API helper as fallback
    try {
        const res = await window.UniXsportAPI.getDashboardMetrics();
        if (res && res.success) {
            const users = res.activeUsers !== undefined ? res.activeUsers : (res.activeStudents !== undefined ? res.activeStudents : 0);
            const equip = res.totalEquipment !== undefined ? res.totalEquipment : 0;
            const classes = res.activeClasses !== undefined ? res.activeClasses : (res.activeBookings !== undefined ? res.activeBookings : 0);
            const facilities = res.facilitiesCount !== undefined ? res.facilitiesCount : (res.facilities?.total !== undefined ? res.facilities.total : (res.facilities?.available !== undefined ? res.facilities.available : 0));

            animateCounter(activeUsersEl, users);
            animateCounter(equipmentCountEl, equip);
            animateCounter(activeClassesEl, classes);
            animateCounter(facilitiesCountEl, facilities);
            return;
        }
    } catch (e) {
        console.warn('Dashboard metrics endpoint offline:', e.message);
    }

    // Error / Fallback state
    if (activeUsersEl) activeUsersEl.textContent = '0';
    if (equipmentCountEl) equipmentCountEl.textContent = '0';
    if (activeClassesEl) activeClassesEl.textContent = '0';
    if (facilitiesCountEl) facilitiesCountEl.textContent = '0';
}

// ========== Load Facilities from Database ==========
async function loadFacilitiesData() {
    const container = document.getElementById('facilitiesGrid');
    if (!container) return;

    try {
        const res = await window.UniXsportAPI.getFacilities();
        if (res && res.success && Array.isArray(res.facilities) && res.facilities.length > 0) {
            container.innerHTML = res.facilities.map(f => {
                const isAvailable = f.status === 'available';
                const statusBadge = isAvailable
                    ? `<span style="padding: 4px 10px; font-size: 0.75rem; border-radius: 12px; background: rgba(34,197,94,0.15); color: #16a34a; font-weight: 700;"><i class="fas fa-circle" style="font-size: 0.55rem; margin-right: 4px;"></i> Available</span>`
                    : `<span style="padding: 4px 10px; font-size: 0.75rem; border-radius: 12px; background: rgba(239,68,68,0.15); color: #dc2626; font-weight: 700;"><i class="fas fa-circle" style="font-size: 0.55rem; margin-right: 4px;"></i> Maintenance</span>`;

                return `
                    <div class="facility-card">
                        <div class="facility-header ${f.type || 'gym'}">
                            <i class="fas ${f.iconClass || 'fa-dumbbell'}"></i>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; margin-bottom: 6px;">
                            <h3 style="margin: 0; font-size: 1.15rem;">${f.name}</h3>
                            ${statusBadge}
                        </div>
                        <p>${f.description || ''}</p>
                        <div class="facility-details">
                            <span><i class="fas fa-clock"></i> ${f.hours || '6 AM - 10 PM'}</span>
                            <span><i class="fas fa-map-marker-alt"></i> ${f.location || 'Main Sports Complex'}</span>
                        </div>
                    </div>
                `;
            }).join('');
            return;
        }
    } catch (e) {
        console.warn('Failed to load facilities:', e.message);
    }

    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--gray-500);">
            <i class="fas fa-building" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.5;"></i>
            <p>No sports facilities currently listed in database.</p>
        </div>
    `;
}

// ========== Load Announcements from Database ==========
async function loadAnnouncementsData() {
    const container = document.getElementById('announcementsList');
    if (!container) return;

    try {
        const res = await window.UniXsportAPI.getAnnouncements();
        if (res && res.success && Array.isArray(res.notices) && res.notices.length > 0) {
            container.innerHTML = res.notices.map(n => {
                const priorityClass = n.priority || 'normal';
                const badgeText = priorityClass.toUpperCase();

                return `
                    <div class="announcement-card">
                        <div class="announcement-badge ${priorityClass}">${badgeText}</div>
                        <h3>${n.title}</h3>
                        <p>${n.message}</p>
                        <span class="announcement-date">
                            <i class="fas fa-calendar-alt"></i> ${n.createdAt || 'Recent'} • By ${n.createdBy || 'Sports Directorate'}
                        </span>
                    </div>
                `;
            }).join('');
            return;
        }
    } catch (e) {
        console.warn('Failed to load announcements:', e.message);
    }

    container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--gray-500);">
            <i class="fas fa-bullhorn" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.5;"></i>
            <p>No announcements currently posted.</p>
        </div>
    `;
}

// ========== Load Events from Database ==========
async function loadEventsData() {
    const homeContainer = document.getElementById('homeEventsGrid');
    const pageContainer = document.getElementById('eventsGrid');
    if (!homeContainer && !pageContainer) return;

    function createEventCardsHtml(eventsList) {
        return eventsList.map(ev => {
            return `
                <div class="event-card">
                    <div class="event-header ${ev.category || 'sports'}">
                        <span class="event-date">
                            <span class="day">${ev.day || '15'}</span>
                            <span class="month">${ev.month || 'SEP'}</span>
                        </span>
                    </div>
                    <h3>${ev.title}</h3>
                    <p>${ev.description || ''}</p>
                    <div class="event-details">
                        <span><i class="fas fa-map-marker-alt"></i> ${ev.location || 'Sports Complex'}</span>
                        <span><i class="fas fa-users"></i> ${ev.participants || 'Open to All'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderEvents(events) {
        if (!Array.isArray(events) || events.length === 0) {
            const emptyHtml = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--gray-500);">
                    <i class="fas fa-calendar-times" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>No upcoming events scheduled at this time.</p>
                </div>
            `;
            if (homeContainer) homeContainer.innerHTML = emptyHtml;
            if (pageContainer) pageContainer.innerHTML = emptyHtml;
            return;
        }

        // Home page shows strictly latest 4 events
        if (homeContainer) {
            const latestFour = events.slice(0, 4);
            homeContainer.innerHTML = createEventCardsHtml(latestFour);
        }

        // Full Events page shows all events
        if (pageContainer) {
            pageContainer.innerHTML = createEventCardsHtml(events);
        }
    }

    const baseUrl = (typeof window !== 'undefined' && window.API_BASE_URL) ? window.API_BASE_URL : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');

    const endpoints = [
        baseUrl + '/api/public/events',
        '/api/public/events'
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(ep).then(r => r.json());
            if (res && res.success && Array.isArray(res.events) && res.events.length > 0) {
                renderEvents(res.events);
                return;
            }
        } catch (e) {}
    }

    try {
        const res = await window.UniXsportAPI.getEvents();
        if (res && res.success && Array.isArray(res.events) && res.events.length > 0) {
            renderEvents(res.events);
            return;
        }
    } catch (e) {
        console.warn('Failed to load events:', e.message);
    }

    renderEvents([]);
}

// Animate counter from 0 to target number
function animateCounter(element, target) {
    if (!element) return;
    if (typeof target !== 'number' || isNaN(target)) {
        element.textContent = target || '0';
        return;
    }
    
    let current = 0;
    const duration = 1500;
    const increment = Math.max(1, target / (duration / 16));
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

// ========== Smooth Scroll ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
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

// ========== Dark Mode ==========
function initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const html = document.documentElement;
    
    // Load saved preference
    const isDarkMode = localStorage.getItem('darkMode') !== 'disabled';
    if (isDarkMode) {
        html.setAttribute('data-theme', 'dark');
        if (darkModeToggle) darkModeToggle.classList.add('active');
    } else {
        html.removeAttribute('data-theme');
        if (darkModeToggle) darkModeToggle.classList.remove('active');
    }
    
    // Toggle handler
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

// ========== Portal Dropdown ==========
function initPortalDropdown() {
    const dropdown = document.getElementById('portalDropdown');
    const toggleBtn = document.getElementById('portalDropdownBtn');
    
    if (!dropdown || !toggleBtn) return;
    
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });
    
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });
}
