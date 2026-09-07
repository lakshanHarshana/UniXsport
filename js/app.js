/**
 * UniXsport - Student Gym & Sports Management System
 * Main Application JavaScript
 */

function getUniXsportToken() {
    return (window.UniXsportAPI && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken('student') : '') ||
           sessionStorage.getItem('unixsport_token_student') ||
           sessionStorage.getItem('unixsport_jwt_token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('unixsport_token_student') ||
           localStorage.getItem('unixsport_jwt_token') ||
           localStorage.getItem('token') ||
           '';
}

document.addEventListener('DOMContentLoaded', async () => {
    loadProfileFromStorage();
    initNavigation();
    initSidebar();
    initNotifications();
    initDarkMode();
    initEditProfileForm();
    initRequestScheduleForm();
    initRequestEquipmentForm();
    initEquipmentSearch();
    initBorrowSearch();
    initTrainingGoalToggle();
    initProfilePhoto();
    initModal();
    initDeleteScheduleModal();
    initTrainingTabs();
    initDynamicWorkoutPlan();
    await initMySchedule();
    loadEquipmentAvailability();
    loadBorrowHistory();
    updateStudentDashboardStats();
    initStudentAutoRefresh();
});

// ========== Automatic Live Data Refresh ==========
let studentRefreshInterval = null;

async function autoRefreshStudentData() {
    const activeModal = document.querySelector('.modal.show, .modal[style*="display: block"]');
    const isTyping = document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.tagName === 'SELECT'
    );

    // 1. Always refresh broadcast notices & dashboard metrics silently
    await fetchStudentNotices();
    await updateStudentDashboardStats();

    // 2. Refresh active section data if no modal is active
    if (!activeModal) {
        await initMySchedule();
        if (!isTyping) {
            loadEquipmentAvailability();
            loadBorrowHistory();
        }
    }
}

function initStudentAutoRefresh() {
    if (studentRefreshInterval) clearInterval(studentRefreshInterval);
    studentRefreshInterval = setInterval(() => {
        autoRefreshStudentData();
    }, 10000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            autoRefreshStudentData();
        }
    });

    window.addEventListener('focus', () => {
        autoRefreshStudentData();
    });
}

// ========== Workout Tracker Logic ==========
function initWorkoutTracker() {
    const checkboxes = document.querySelectorAll('.exercise-checkbox');
    const progressText = document.getElementById('workoutProgressText');
    const progressBar = document.getElementById('workoutProgressBar');
    const progressPercent = document.getElementById('workoutProgressPercent');

    if (checkboxes.length === 0 || !progressText || !progressBar || !progressPercent) return;

    function updateProgress() {
        const total = checkboxes.length;
        const checkedCount = Array.from(checkboxes).filter(chk => chk.checked).length;
        const percent = (checkedCount / total) * 100;

        progressText.textContent = `${checkedCount} of ${total} exercises completed (${Math.round(percent)}%)`;
        progressPercent.textContent = `${Math.round(percent)}%`;

        // SVG stroke-dashoffset animation
        // Circumference is 251.2 (2 * Math.PI * 40)
        const offset = 251.2 - (percent / 100) * 251.2;
        progressBar.style.strokeDashoffset = offset;
    }

    checkboxes.forEach(chk => {
        chk.addEventListener('change', (e) => {
            updateProgress();
            
            const checkbox = e.target;
            const index = parseInt(checkbox.dataset.exerciseIndex);
            if (isNaN(index)) return;

            const payload = {
                exerciseIndex: index,
                completed: checkbox.checked
            };

            const endpoints = [
                '/api/student/toggle-exercise',
                'http://localhost:5000/api/student/toggle-exercise',
                'http://127.0.0.1:5000/api/student/toggle-exercise'
            ];

            const token = getUniXsportToken();
            (async () => {
                for (const ep of endpoints) {
                    try {
                        const res = await fetch(ep, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                            },
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) break;
                    } catch (err) {}
                }
            })();
        });
    });

    // Initialize progress on page load
    updateProgress();
}

// ========== Navigation ==========
function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    function showPage(pageId) {
        pages.forEach(page => {
            page.classList.toggle('active', page.id === `page-${pageId}`);
        });
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.page === pageId);
        });
        if (typeof window.closeSidebar === 'function') window.closeSidebar();
    }

    // Delegated handler for all links/buttons with data-page
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-page]');
        if (trigger) {
            e.preventDefault();
            showPage(trigger.dataset.page);
            if (trigger.dataset.page === 'edit-profile') loadProfileIntoForm();
            if (trigger.dataset.page === 'borrow-history') loadBorrowHistory();
            if (trigger.dataset.page === 'request-schedule') {
                if (typeof loadProfileFromStorage === 'function') loadProfileFromStorage();
            }
            if (trigger.dataset.page === 'my-training') {
                initMySchedule();
                if (trigger.dataset.tab) switchTrainingTab(trigger.dataset.tab);
            }
            if (trigger.dataset.page === 'notices') {
                fetchStudentNotices();
            }
        }
    });

    window.showPage = showPage;
}

// ========== My Training — Tab Switcher ==========
function initTrainingTabs() {
    const tabBar = document.getElementById('trainingTabs');
    if (!tabBar) return;

    tabBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.training-tab');
        if (btn) switchTrainingTab(btn.dataset.tab);
    });
}

function switchTrainingTab(tabId) {
    const tabs = document.querySelectorAll('.training-tab');
    const panels = document.querySelectorAll('.training-panel');

    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));

    // Re-init workout tracker when switching to workout tab (checkboxes may have just rendered)
    if (tabId === 'workout') {
        initWorkoutTracker();
    }
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

// ========== Student Broadcast Notifications ==========
let studentNoticesList = [];

async function fetchStudentNotices() {
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
                        studentNoticesList = data.notices;
                        break;
                    }
                }
            } catch(e) {}
        }
    } catch(err) {
        console.warn('Failed to load student notices:', err);
    }
    renderStudentNotices();
}

function renderStudentNotices() {
    // 1. Render Header Notification Dropdown
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');
    
    if (panel) {
        let dismissed = [];
        try {
            dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_student') || '[]');
        } catch(e) {}

        const activeNotices = (studentNoticesList || []).filter(n => !dismissed.includes(String(n.id)));

        if (!activeNotices || activeNotices.length === 0) {
            panel.innerHTML = `
                <h4>Notifications</h4>
                <div class="notification-item" style="padding: 12px; color: var(--gray-500); text-align: center;">
                    <i class="fas fa-bell-slash" style="margin-right: 6px;"></i>
                    <span>No new notifications</span>
                </div>
            `;
            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
        } else {
            const lastRead = parseInt(localStorage.getItem('unixsport_notices_last_read_student') || '0', 10);
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
                <h4>Notifications (${activeNotices.length})</h4>
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
                                    <span style="font-size: 0.75rem; color: var(--gray-400); display: block; overflow-wrap: anywhere; word-break: break-word;">${n.createdBy || 'Staff'} • ${formatRequestDate(n.createdAt)}</span>
                                </div>
                            </div>
                            <button type="button" class="btn-close-notice" onclick="dismissDashboardNotice('${n.id}', event)" style="background: transparent; border: none; color: var(--gray-400); cursor: pointer; padding: 2px 4px; border-radius: 4px; font-size: 0.85rem; line-height: 1; flex-shrink: 0; transition: color 0.2s;" title="Dismiss" aria-label="Dismiss">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')}
            `;
        }
    }

function dismissDashboardNotice(noticeId, event) {
    if (event) event.stopPropagation();
    try {
        let dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_student') || '[]');
        if (!dismissed.includes(String(noticeId))) {
            dismissed.push(String(noticeId));
            localStorage.setItem('unixsport_dismissed_notices_student', JSON.stringify(dismissed));
        }
    } catch(e) {}
    renderStudentNotices();
}
window.dismissDashboardNotice = dismissDashboardNotice;

    // 2. Render Dashboard "Recent Notifications" Section
    const dashList = document.getElementById('dashNotificationsList');
    if (dashList) {
        let dismissed = [];
        try {
            dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_student') || '[]');
        } catch(e) {}

        const activeDashboardNotices = (studentNoticesList || []).filter(n => !dismissed.includes(String(n.id)));

        if (!activeDashboardNotices || activeDashboardNotices.length === 0) {
            dashList.innerHTML = `
                <div class="notification-card" style="justify-content: center; text-align: center; color: var(--gray-400); padding: 24px;">
                    <p style="margin: 0; font-size: 0.9rem;">No recent broadcast notices</p>
                </div>
            `;
        } else {
            dashList.innerHTML = activeDashboardNotices.slice(0, 4).map(n => {
                const priorityColor = n.priority === 'urgent' ? 'danger' : n.priority === 'high' ? 'orange' : 'blue';
                return `
                    <div class="notification-card" style="display: flex; gap: 14px; padding: 16px; border-radius: var(--radius); background: var(--card-bg); border-left: 4px solid var(--${priorityColor}); margin-bottom: 10px; box-shadow: var(--shadow-sm); position: relative; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                        <div style="font-size: 1.3rem; color: var(--${priorityColor}); margin-top: 2px; flex-shrink: 0;">
                            <i class="fas fa-${n.priority === 'urgent' ? 'exclamation-circle' : 'bullhorn'}"></i>
                        </div>
                        <div style="flex: 1; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                                    <h4 style="margin: 0; font-size: 0.95rem; font-weight: 600; color: var(--gray-800); overflow-wrap: anywhere; word-break: break-word;">${n.title}</h4>
                                    <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(37,99,235,0.1); color: var(--${priorityColor}); flex-shrink: 0;">${n.priority || 'normal'}</span>
                                </div>
                                <button type="button" class="btn-close-notice" onclick="dismissDashboardNotice('${n.id}', event)" style="background: transparent; border: none; color: var(--gray-400); cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 0.95rem; line-height: 1; flex-shrink: 0; transition: color 0.2s;" title="Dismiss notification" aria-label="Dismiss">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                            <p style="margin: 0 0 6px; font-size: 0.85rem; color: var(--gray-600); line-height: 1.4; overflow-wrap: anywhere; word-break: break-word; white-space: normal;">${n.message}</p>
                            <span style="font-size: 0.75rem; color: var(--gray-400); display: block; overflow-wrap: anywhere; word-break: break-word;">By ${n.createdBy || 'Staff'} • ${formatRequestDate(n.createdAt)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 3. Render Dedicated "Notices & Broadcast Messages" Page
    const fullList = document.getElementById('studentNoticesFullList');
    if (fullList) {
        if (!studentNoticesList || studentNoticesList.length === 0) {
            fullList.innerHTML = `
                <div style="background: var(--card-bg); border-radius: var(--radius); padding: 40px; text-align: center; color: var(--gray-500); box-shadow: var(--shadow-sm);">
                    <i class="fas fa-bullhorn" style="font-size: 2.5rem; color: var(--gray-400); margin-bottom: 12px; display: block;"></i>
                    <h3 style="font-size: 1.1rem; color: var(--gray-700); margin-bottom: 6px;">No Notices Available</h3>
                    <p style="font-size: 0.9rem; margin: 0;">There are currently no active announcements published for you.</p>
                </div>
            `;
        } else {
            fullList.innerHTML = studentNoticesList.map(n => {
                const priorityColor = n.priority === 'urgent' ? 'var(--danger)' :
                                     n.priority === 'high' ? 'var(--orange)' : 'var(--blue)';
                const priorityBg = n.priority === 'urgent' ? 'rgba(239,68,68,0.1)' :
                                   n.priority === 'high' ? 'rgba(249,115,22,0.1)' : 'rgba(37,99,235,0.1)';
                return `
                    <div class="notice-card-full" style="background: var(--card-bg); border-radius: var(--radius); padding: 24px; border-left: 5px solid ${priorityColor}; box-shadow: var(--shadow-sm); margin-bottom: 16px; min-width: 0; overflow-wrap: anywhere; word-break: break-word;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
                            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--gray-800); overflow-wrap: anywhere; word-break: break-word;">${n.title}</h3>
                            <span style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; padding: 4px 10px; border-radius: 6px; background: ${priorityBg}; color: ${priorityColor}; letter-spacing: 0.5px; flex-shrink: 0;">
                                <i class="fas fa-${n.priority === 'urgent' ? 'exclamation-circle' : n.priority === 'high' ? 'exclamation-triangle' : 'info-circle'}" style="margin-right: 4px;"></i>
                                ${n.priority || 'normal'}
                            </span>
                        </div>
                        <p style="margin: 0 0 16px; font-size: 0.95rem; color: var(--gray-700); line-height: 1.6; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word;">${n.message}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--gray-500); border-top: 1px solid var(--gray-100); padding-top: 12px; flex-wrap: wrap; gap: 8px;">
                            <span style="overflow-wrap: anywhere; word-break: break-word;"><i class="fas fa-user-shield" style="margin-right: 5px; color: var(--blue);"></i> Published by: <strong style="color: var(--gray-700);">${n.createdBy || 'Staff'}</strong> (${n.creatorRole || 'Staff'})</span>
                            <span style="flex-shrink: 0;"><i class="fas fa-clock" style="margin-right: 5px;"></i> ${formatRequestDate(n.createdAt)}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
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

        // When opened, mark as read and reset badge to 0 / hide
        if (willOpen) {
            localStorage.setItem('unixsport_notices_last_read_student', Date.now().toString());
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

    fetchStudentNotices();
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

// ========== Logout ==========
function handleStudentLogout(e) {
    if (e) e.preventDefault();
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

document.getElementById('logoutBtn')?.addEventListener('click', handleStudentLogout);
document.getElementById('sidebarLogout')?.addEventListener('click', handleStudentLogout);

// ========== Edit Profile Form ==========
function initEditProfileForm() {
    const form = document.getElementById('editProfileForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEditProfile(form)) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Save Changes';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        const userName = localStorage.getItem('userName') || 'student';
        const profileKey = 'unixsport_profile_' + userName.replace(/\//g, '_');
        
        let existingData = {};
        const saved = localStorage.getItem(profileKey);
        if (saved) {
            try {
                existingData = JSON.parse(saved);
            } catch (err) {}
        }

        const nameVal = form.querySelector('[name="name"]')?.value?.trim() || existingData.name || localStorage.getItem('userRealName') || userName;
        const regNo = form.querySelector('[name="regNo"]')?.value?.trim() || existingData.regNo || localStorage.getItem('userRegNo') || userName.toUpperCase();
        const email = form.querySelector('[name="email"]')?.value?.trim() || existingData.email || localStorage.getItem('userEmail') || `${userName.toLowerCase()}@tec.rjt.ac.lk`;
        const faculty = form.querySelector('[name="faculty"]')?.value?.trim() || existingData.faculty || existingData.department || localStorage.getItem('userFaculty') || 'Technology';
        const userId = form.querySelector('[name="user_id"]')?.value?.trim() || existingData.user_id || existingData.userId || localStorage.getItem('user_id') || 'US002';
        const currentPassword = form.querySelector('[name="currentPassword"]')?.value || '';
        const newPassword = form.querySelector('[name="newPassword"]')?.value || '';

        // Update profile object
        const updatedData = {
            ...existingData,
            user_id: userId,
            userId: userId,
            regNo: regNo,
            studentRegNo: regNo,
            email: email,
            faculty: faculty,
            department: faculty,
            name: nameVal,
            age: form.querySelector('[name="age"]')?.value || '',
            height: form.querySelector('[name="height"]')?.value || '',
            weight: form.querySelector('[name="weight"]')?.value || '',
            fitnessLevel: form.querySelector('[name="fitnessLevel"]')?.value || '',
            injuryHistory: form.querySelector('[name="injuryHistory"]')?.value || '',
            trainingGoal: form.querySelector('[name="trainingGoal"]')?.value === 'other'
                ? form.querySelector('[name="trainingGoalOther"]')?.value
                : (form.querySelector('[name="trainingGoal"]')?.value || ''),
            currentPassword: currentPassword ? currentPassword.trim() : undefined,
            newPassword: newPassword ? newPassword.trim() : undefined
        };

        // 1. Send update to backend database API FIRST
        let updateSuccess = false;
        let serverErrorMsg = '';

        try {
            const endpoints = [
                '/api/student/update-profile',
                'http://localhost:5000/api/student/update-profile',
                'http://127.0.0.1:5000/api/student/update-profile'
            ];

            for (const ep of endpoints) {
                try {
                    const token = getUniXsportToken();
                    const res = await fetch(ep, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify(updatedData)
                    });
                    const parsed = await res.json();
                    if (res.ok && parsed.success) {
                        updateSuccess = true;
                        if (parsed.user) {
                            Object.assign(updatedData, parsed.user);
                        }
                        break;
                    } else if (parsed && parsed.error) {
                        serverErrorMsg = parsed.error;
                        break;
                    }
                } catch (epErr) {}
            }
        } catch (apiErr) {
            console.warn('Backend profile update note:', apiErr);
        }

        if (!updateSuccess && serverErrorMsg) {
            showToast(serverErrorMsg, 'error');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
            return;
        }

        // 2. Persist confirmed data to storage
        localStorage.setItem(profileKey, JSON.stringify(updatedData));
        localStorage.setItem('userRealName', nameVal);
        localStorage.setItem('userName', regNo || nameVal);
        localStorage.setItem('userRegNo', regNo);
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userFaculty', faculty);
        localStorage.setItem('userDepartment', faculty);
        localStorage.setItem('user_id', userId);
        localStorage.setItem('userId', userId);

        // Update active student session user object
        try {
            const currentStudentObj = JSON.parse(sessionStorage.getItem('unixsport_user_student') || localStorage.getItem('unixsport_user_student') || '{}');
            const updatedStudentObj = { ...currentStudentObj, ...updatedData };
            sessionStorage.setItem('unixsport_user_student', JSON.stringify(updatedStudentObj));
            localStorage.setItem('unixsport_user_student', JSON.stringify(updatedStudentObj));
        } catch(e) {}

        // Reset password inputs in form
        const curPwdInput = form.querySelector('[name="currentPassword"]');
        const newPwdInput = form.querySelector('[name="newPassword"]');
        const confPwdInput = form.querySelector('[name="confirmPassword"]');
        if (curPwdInput) curPwdInput.value = '';
        if (newPwdInput) newPwdInput.value = '';
        if (confPwdInput) confPwdInput.value = '';

        // 3. Update profile display and navigate
        updateProfileDisplay(updatedData);
        const sidebarName = document.getElementById('studentName') || document.querySelector('.sidebar-user-name');
        if (sidebarName) sidebarName.textContent = nameVal;
        const studentRegNoEl = document.getElementById('studentRegNo');
        if (studentRegNoEl) studentRegNoEl.textContent = regNo;

        showToast('Profile and security details updated successfully!', 'success');

        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }

        document.querySelector('.nav-link[data-page="profile"]')?.click();
    });
}

function updateProfileDisplay(data) {
    if (!data) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const userName = localStorage.getItem('userName') || 'student';

    const userId = data.user_id || data.userId || localStorage.getItem('user_id') || localStorage.getItem('userId') || '--';
    const nameVal = data.name || localStorage.getItem('userRealName') || userName;
    const regNo = data.regNo || data.studentRegNo || localStorage.getItem('userRegNo') || localStorage.getItem('regNo') || userName.toUpperCase();
    const email = data.email || data.studentEmail || localStorage.getItem('userEmail') || localStorage.getItem('email') || '--';
    const faculty = data.faculty || data.department || localStorage.getItem('userFaculty') || localStorage.getItem('userDepartment') || 'Technology';

    set('profileUserId', userId);
    set('profileName', nameVal);
    set('profileAge', data.age ? data.age : '--');
    set('profileHeight', data.height ? data.height + ' cm' : '--');
    set('profileWeight', data.weight ? data.weight + ' kg' : '--');
    set('profileFitness', data.fitnessLevel || 'Not Set');
    set('profileInjury', data.injuryHistory || 'None');
    set('profileGoal', data.trainingGoal || 'Not Set');
    
    // Reg No, Email, Faculty
    set('profileRegNo', regNo);
    set('profileEmail', email);
    set('profileFaculty', faculty);

    // Auto-fill request schedule form fields if present
    const reqName = document.getElementById('reqScheduleName');
    const reqAge = document.getElementById('reqScheduleAge');
    const reqHeight = document.getElementById('reqScheduleHeight');
    const reqWeight = document.getElementById('reqScheduleWeight');
    if (reqName) reqName.value = nameVal || '';
    if (reqAge) reqAge.value = data.age || '';
    if (reqHeight) reqHeight.value = data.height || '';
    if (reqWeight) reqWeight.value = data.weight || '';
}

async function loadProfileFromStorage() {
    const studentUser = (() => {
        const raw = sessionStorage.getItem('unixsport_user_student') || localStorage.getItem('unixsport_user_student');
        if (raw) {
            try { return JSON.parse(raw); } catch(e) {}
        }
        return null;
    })();

    const userName = sessionStorage.getItem('userName') || studentUser?.regNo || studentUser?.name || localStorage.getItem('userName') || 'student';
    const profileKey = 'unixsport_profile_' + userName.replace(/\//g, '_');
    
    let localData = null;
    const saved = localStorage.getItem(profileKey);
    if (saved) {
        try {
            localData = JSON.parse(saved);
        } catch (e) {}
    }

    // Default fallback from session
    const fallbackProfile = {
        user_id: studentUser?.user_id || studentUser?.userId || sessionStorage.getItem('user_id') || sessionStorage.getItem('userId') || localStorage.getItem('user_id') || localStorage.getItem('userId') || '',
        name: studentUser?.name || sessionStorage.getItem('userRealName') || localStorage.getItem('userRealName') || (userName.charAt(0).toUpperCase() + userName.slice(1)),
        regNo: studentUser?.regNo || sessionStorage.getItem('userRegNo') || localStorage.getItem('userRegNo') || userName.toUpperCase(),
        email: studentUser?.email || sessionStorage.getItem('userEmail') || localStorage.getItem('userEmail') || `${userName}@tec.rjt.ac.lk`,
        faculty: studentUser?.department || sessionStorage.getItem('userFaculty') || localStorage.getItem('userFaculty') || 'Technology',
        department: studentUser?.department || sessionStorage.getItem('userFaculty') || localStorage.getItem('userFaculty') || 'Technology',
        age: '',
        height: '',
        weight: '',
        fitnessLevel: '',
        injuryHistory: '',
        trainingGoal: ''
    };

    const initialData = { ...fallbackProfile, ...(localData || {}) };
    updateProfileDisplay(initialData);

    // Fetch latest profile from database asynchronously
    try {
        let dbUser = null;
        const endpoints = [
            '/api/student/profile',
            'http://localhost:5000/api/student/profile',
            'http://127.0.0.1:5000/api/student/profile'
        ];

        for (const ep of endpoints) {
            try {
                const token = getUniXsportToken();
                const res = await fetch(ep, {
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                });
                if (res.ok) {
                    const parsed = await res.json();
                    if (parsed && parsed.success && parsed.user) {
                        dbUser = parsed.user;
                        break;
                    }
                }
            } catch (e) {}
        }

        if (dbUser) {
            const merged = {
                ...initialData,
                ...dbUser,
                user_id: dbUser.user_id || dbUser.userId || initialData.user_id,
                regNo: dbUser.regNo || initialData.regNo,
                email: dbUser.email || initialData.email,
                faculty: dbUser.faculty || dbUser.department || initialData.faculty,
                department: dbUser.department || dbUser.faculty || initialData.department
            };
            localStorage.setItem(profileKey, JSON.stringify(merged));
            if (merged.user_id) localStorage.setItem('user_id', merged.user_id);
            if (merged.regNo) localStorage.setItem('userRegNo', merged.regNo);
            if (merged.email) localStorage.setItem('userEmail', merged.email);
            if (merged.faculty) localStorage.setItem('userFaculty', merged.faculty);
            updateProfileDisplay(merged);
        }
    } catch (err) {
        // Fallback already rendered
    }
}

function loadProfileIntoForm() {
    const userName = localStorage.getItem('userName') || 'student';
    const profileKey = 'unixsport_profile_' + userName.replace(/\//g, '_');
    const form = document.getElementById('editProfileForm');
    if (!form) return;

    let data = {};
    const saved = localStorage.getItem(profileKey);
    if (saved) {
        try { data = JSON.parse(saved); } catch(e) {}
    } else {
        data = {
            user_id: localStorage.getItem('user_id') || localStorage.getItem('userId') || '',
            name: localStorage.getItem('userRealName') || userName,
            regNo: localStorage.getItem('userRegNo') || userName.toUpperCase(),
            email: localStorage.getItem('userEmail') || '',
            faculty: localStorage.getItem('userFaculty') || localStorage.getItem('userDepartment') || 'Technology',
            age: '',
            height: '',
            weight: '',
            fitnessLevel: '',
            injuryHistory: '',
            trainingGoal: ''
        };
    }

    const set = (name, val) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el && val != null) el.value = val;
    };
    set('user_id', data.user_id || data.userId || localStorage.getItem('user_id') || localStorage.getItem('userId') || '');
    set('name', data.name || localStorage.getItem('userRealName') || userName);
    set('regNo', data.regNo || localStorage.getItem('userRegNo') || userName.toUpperCase());
    set('email', data.email || localStorage.getItem('userEmail') || '');
    set('faculty', data.faculty || data.department || localStorage.getItem('userFaculty') || 'Technology');
    set('age', data.age || '');
    set('height', data.height || '');
    set('weight', data.weight || '');
    set('fitnessLevel', data.fitnessLevel || '');
    set('injuryHistory', data.injuryHistory || '');
    const goalSelect = form.querySelector('[name="trainingGoal"]');
    const goalOther = form.querySelector('[name="trainingGoalOther"]');
    if (data.trainingGoal && !['Build Muscle','Weight Loss','Endurance','General Fitness'].includes(data.trainingGoal)) {
        if (goalSelect) goalSelect.value = 'other';
        if (goalOther) {
            goalOther.value = data.trainingGoal;
            goalOther.style.display = 'block';
        }
    } else {
        set('trainingGoal', data.trainingGoal || '');
    }
}

function validateEditProfile(form) {
    let valid = true;
    clearErrors(form);

    const nameInput = form.querySelector('[name="name"]');
    const regNoInput = form.querySelector('[name="regNo"]');
    const emailInput = form.querySelector('[name="email"]');
    const age = form.querySelector('[name="age"]');
    const height = form.querySelector('[name="height"]');
    const weight = form.querySelector('[name="weight"]');
    const fitnessLevel = form.querySelector('[name="fitnessLevel"]');
    const trainingGoal = form.querySelector('[name="trainingGoal"]');
    const newPassword = form.querySelector('[name="newPassword"]');
    const confirmPassword = form.querySelector('[name="confirmPassword"]');

    if (nameInput && !nameInput.value.trim()) {
        showError(nameInput, 'Full Name is required');
        valid = false;
    }

    if (regNoInput && !regNoInput.value.trim()) {
        showError(regNoInput, 'Registration Number is required');
        valid = false;
    }

    if (emailInput && (!emailInput.value.trim() || !emailInput.value.includes('@'))) {
        showError(emailInput, 'Please enter a valid email address');
        valid = false;
    }

    if (!age.value || age.value < 16 || age.value > 100) {
        showError(age, 'Age must be between 16 and 100');
        valid = false;
    }

    if (!height.value || height.value < 100 || height.value > 250) {
        showError(height, 'Height must be between 100 and 250 cm');
        valid = false;
    }

    if (!weight.value || weight.value < 30 || weight.value > 300) {
        showError(weight, 'Weight must be between 30 and 300 kg');
        valid = false;
    }

    if (!fitnessLevel.value) {
        showError(fitnessLevel, 'Please select fitness level');
        valid = false;
    }

    if (!trainingGoal.value) {
        showError(trainingGoal, 'Please select training goal');
        valid = false;
    }

    const curPassword = form.querySelector('[name="currentPassword"]');
    if (newPassword && (newPassword.value || confirmPassword.value)) {
        if (!curPassword || !curPassword.value) {
            showError(curPassword, 'Please enter your current password to authorize change');
            valid = false;
        }
        if (newPassword.value.length < 6) {
            showError(newPassword, 'New password must be at least 6 characters');
            valid = false;
        }
        if (newPassword.value !== confirmPassword.value) {
            showError(confirmPassword, 'New passwords do not match');
            valid = false;
        }
    }

    return valid;
}

// ========== Request Schedule Form ==========
async function loadCoachesDropdown() {
    const select = document.getElementById('reqScheduleCoachSelect');
    if (!select) return;

    try {
        const endpoints = [
            '/api/student/coaches',
            'http://localhost:5000/api/student/coaches',
            'http://127.0.0.1:5000/api/student/coaches'
        ];

        let coaches = [];
        const token = getUniXsportToken();

        for (const ep of endpoints) {
            try {
                const res = await fetch(ep, {
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success && Array.isArray(data.coaches)) {
                        coaches = data.coaches;
                        break;
                    }
                }
            } catch(err) {}
        }

        select.innerHTML = '<option value="">Select Coach...</option><option value="Any Coach">Any Coach (First Available)</option>';

        if (coaches.length > 0) {
            coaches.forEach(c => {
                const option = document.createElement('option');
                const coachTitle = `Coach ${c.name}`;
                option.value = coachTitle;
                option.textContent = `${coachTitle} (${c.department || 'Sports'})`;
                select.appendChild(option);
            });
        }
    } catch(e) {
        console.warn('Failed to load coaches from database:', e);
    }
}

function initRequestScheduleForm() {
    const form = document.getElementById('requestScheduleForm');
    if (!form) return;

    // Load registered coaches directly from database
    loadCoachesDropdown();

    // Set min date to today for date picker
    const dateInput = form.querySelector('[name="preferredDate"]');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.setAttribute('min', today);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateRequestSchedule(form)) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        const origHtml = submitBtn ? submitBtn.innerHTML : 'Submit Request';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        }

        // Retrieve current student profile details
        const userName = localStorage.getItem('userName') || 'student';
        const profileKey = 'unixsport_profile_' + userName.replace(/\//g, '_');
        let profile = {};
        const savedProfile = localStorage.getItem(profileKey);
        if (savedProfile) {
            try { profile = JSON.parse(savedProfile); } catch(err) {}
        }

        const dateVal = form.querySelector('[name="preferredDate"]').value;
        const timeVal = form.querySelector('[name="timeSlot"]').value;
        const coachVal = form.querySelector('[name="coach"]').value;
        const notesVal = (form.querySelector('[name="notes"]')?.value || '').trim();

        const payload = {
            requestedDate: dateVal,
            preferredDate: dateVal,
            timeSlot: timeVal,
            preferredTime: timeVal,
            coachId: coachVal,
            coach: coachVal,
            preferredCoach: coachVal,
            notes: notesVal,
            age: profile.age || '',
            height: profile.height || '',
            weight: profile.weight || '',
            fitnessLevel: profile.fitnessLevel || 'Intermediate',
            injuryHistory: profile.injuryHistory || 'None',
            trainingGoal: profile.trainingGoal || 'General Fitness'
        };

        try {
            let apiSuccess = false;
            let errorMessage = '';

            const endpoints = [
                '/api/student/schedule-request',
                'http://localhost:5000/api/student/schedule-request',
                'http://127.0.0.1:5000/api/student/schedule-request'
            ];

            for (const ep of endpoints) {
                try {
                    const token = getUniXsportToken();
                    const res = await fetch(ep, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify(payload)
                    });
                    const parsed = await res.json();
                    if (res.ok && parsed.success) {
                        apiSuccess = true;
                        break;
                    } else if (parsed && parsed.error) {
                        errorMessage = parsed.error;
                        break;
                    }
                } catch (e) {}
            }

            if (!apiSuccess && errorMessage) {
                showToast(errorMessage, 'error');
                return;
            }

            showToast('✓ Schedule request submitted successfully to database!', 'success');
            form.reset();
            if (typeof loadProfileFromStorage === 'function') await loadProfileFromStorage();
            await initMySchedule();
            await updateStudentDashboardStats();

            // Switch to My Training (Sessions tab)
            document.querySelector('.nav-link[data-page="my-training"]')?.click();
        } catch (err) {
            console.error('Schedule submit error:', err);
            showToast('Failed to submit schedule request. Please try again.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origHtml;
            }
        }
    });
}

function validateRequestSchedule(form) {
    let valid = true;
    clearErrors(form);

    const date = form.querySelector('[name="preferredDate"]');
    const timeSlot = form.querySelector('[name="timeSlot"]');
    const coach = form.querySelector('[name="coach"]');

    if (!date.value) {
        showError(date, 'Please select a date');
        valid = false;
    } else {
        const selectedDate = new Date(date.value);
        if (selectedDate < new Date().setHours(0, 0, 0, 0)) {
            showError(date, 'Date cannot be in the past');
            valid = false;
        }
    }

    if (!timeSlot.value) {
        showError(timeSlot, 'Please select a time slot');
        valid = false;
    }

    if (!coach.value) {
        showError(coach, 'Please select a coach');
        valid = false;
    }

    return valid;
}

// ========== Request Equipment Form ==========
function initRequestEquipmentForm() {
    const form = document.getElementById('requestEquipmentForm');
    const equipmentSelect = document.getElementById('equipmentSelect');
    const quantityInput = document.getElementById('equipmentQuantity');
    const maxAvailableSpan = document.getElementById('maxAvailable');

    if (!form) return;

    equipmentSelect?.addEventListener('change', () => {
        const selected = equipmentSelect.options[equipmentSelect.selectedIndex];
        const available = selected?.dataset.available || 0;
        maxAvailableSpan.textContent = available;
        quantityInput.max = available;
        quantityInput.placeholder = `Max: ${available}`;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateRequestEquipment(form)) return;

        const eqName = equipmentSelect.value;
        const qty = parseInt(quantityInput.value) || 1;

        try {
            await window.UniXsportAPI.requestEquipment(eqName, qty);
        } catch (e) {
            console.warn('Equipment API sync:', e.message);
        }

        showModal('Your equipment request has been submitted successfully to the sports room.');
        form.reset();
        maxAvailableSpan.textContent = '0';
        updateStudentDashboardStats();
    });
}

function validateRequestEquipment(form) {
    let valid = true;
    clearErrors(form);

    const equipment = form.querySelector('[name="equipment"]');
    const quantity = form.querySelector('[name="quantity"]');
    const quantityError = document.getElementById('quantityError');

    if (!equipment.value) {
        showError(equipment, 'Please select equipment');
        valid = false;
    }

    const maxAvailable = parseInt(equipment.options[equipment.selectedIndex]?.dataset.available || 0);
    const qty = parseInt(quantity?.value) || 0;

    if (!quantity?.value || qty < 1) {
        showError(quantity, 'Please enter quantity');
        valid = false;
    } else if (qty > maxAvailable) {
        if (quantityError) quantityError.textContent = `Quantity cannot exceed available (${maxAvailable})`;
        quantity?.classList.add('error');
        valid = false;
    }

    return valid;
}

// ========== Equipment Search ==========
function initEquipmentSearch() {
    const search = document.getElementById('equipmentSearch');
    const grid = document.getElementById('equipmentGrid');

    search?.addEventListener('input', () => {
        const query = search.value.toLowerCase();
        const cards = grid?.querySelectorAll('.equipment-card') || [];

        cards.forEach(card => {
            const name = card.dataset.name?.toLowerCase() || '';
            card.style.display = name.includes(query) ? '' : 'none';
        });
    });
}

// ========== Borrow History Filter & Search ==========
function initBorrowSearch() {
    const filterForm = document.getElementById('borrowFilterForm');
    const clearBtn = document.getElementById('btnClearBorrowFilters');

    filterForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const equipment = document.getElementById('filterEquipment')?.value || '';
        const dateFrom = document.getElementById('filterDateFrom')?.value || '';
        const dateTo = document.getElementById('filterDateTo')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';

        loadBorrowHistory({ equipment, dateFrom, dateTo, status });
    });

    clearBtn?.addEventListener('click', () => {
        const eq = document.getElementById('filterEquipment');
        const df = document.getElementById('filterDateFrom');
        const dt = document.getElementById('filterDateTo');
        const st = document.getElementById('filterStatus');
        if (eq) eq.value = '';
        if (df) df.value = '';
        if (dt) dt.value = '';
        if (st) st.value = '';

        loadBorrowHistory({});
    });
}

// ========== Training Goal Other Toggle ==========
function initTrainingGoalToggle() {
    const goalSelect = document.querySelector('[name="trainingGoal"]');
    const otherInput = document.querySelector('[name="trainingGoalOther"]');

    goalSelect?.addEventListener('change', () => {
        otherInput.style.display = goalSelect.value === 'other' ? 'block' : 'none';
    });
}

// ========== Profile Photo Upload ==========
function initProfilePhoto() {
    const input = document.getElementById('profilePhotoInput');
    const display = document.getElementById('profilePhotoDisplay');
    const img = document.getElementById('profileImg');
    const shortcutInput = document.getElementById('shortcutPhotoInput');

    const userName = localStorage.getItem('userName') || 'student';
    const photoKey = 'unixsport_profile_photo_' + userName.replace(/\//g, '_');

    // Load saved photo on startup
    const savedPhoto = localStorage.getItem(photoKey);
    if (savedPhoto) {
        if (img) {
            img.src = savedPhoto;
            img.style.display = 'block';
        }
        display?.querySelector('.placeholder-icon')?.style.setProperty('display', 'none');
    }

    const handlePhotoFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target.result;
                // Update DOM
                if (img) {
                    img.src = base64;
                    img.style.display = 'block';
                }
                display?.querySelector('.placeholder-icon')?.style.setProperty('display', 'none');
                
                // Persist to storage
                localStorage.setItem(photoKey, base64);
                showToast('Profile photo updated successfully!', 'success');
            };
            reader.readAsDataURL(file);
        }
    };

    input?.addEventListener('change', (e) => {
        handlePhotoFile(e.target.files[0]);
    });

    shortcutInput?.addEventListener('change', (e) => {
        handlePhotoFile(e.target.files[0]);
    });

    // Wire up the shortcut change photo button
    const shortcutBtn = document.getElementById('photoShortcutBtn');
    shortcutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        shortcutInput?.click();
    });
}

// ========== Modal ==========
function initModal() {
    const modal = document.getElementById('confirmationModal');
    const closeBtn = document.getElementById('modalCloseBtn');

    closeBtn?.addEventListener('click', () => {
        modal?.classList.remove('show');
    });

    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    window.showModal = (message) => {
        const msgEl = document.getElementById('modalMessage');
        if (msgEl) msgEl.textContent = message;
        modal?.classList.add('show');
    };
}

// ========== Form Helpers ==========
function showError(input, message) {
    if (!input) return;
    input.classList.add('error');
    const errorEl = input.parentElement?.querySelector('.error-msg');
    if (errorEl) errorEl.textContent = message;
}

function clearErrors(form) {
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    form.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
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

// ========== Dynamic 7-Day Workout Plan Implementation ==========

const exerciseCategoriesRef = {
    // Upper Body
    "Bench Press": "Upper Body", "Push-ups": "Upper Body", "Shoulder Press": "Upper Body", 
    "Pull-ups": "Upper Body", "Lat Pulldown": "Upper Body", "Seated Row": "Upper Body", 
    "Bicep Curls": "Upper Body", "Tricep Pushdown": "Upper Body", "Dumbbell Fly": "Upper Body", 
    "Lateral Raises": "Upper Body",
    // Lower Body
    "Squats": "Lower Body", "Leg Press": "Lower Body", "Lunges": "Lower Body", 
    "Deadlift": "Lower Body", "Romanian Deadlift": "Lower Body", "Leg Curl": "Lower Body", 
    "Leg Extension": "Lower Body", "Calf Raises": "Lower Body", "Step-ups": "Lower Body", 
    "Bulgarian Split Squat": "Lower Body",
    // Core
    "Plank": "Core (Abs)", "Side Plank": "Core (Abs)", "Sit-ups": "Core (Abs)", 
    "Crunches": "Core (Abs)", "Russian Twist": "Core (Abs)", "Hanging Leg Raise": "Core (Abs)", 
    "Mountain Climbers": "Core (Abs)", "Bicycle Crunch": "Core (Abs)", "Reverse Crunch": "Core (Abs)", 
    "Ab Wheel Rollout": "Core (Abs)",
    // Cardio
    "Treadmill Running": "Cardio", "Walking": "Cardio", "Cycling": "Cardio", 
    "Rowing Machine": "Cardio", "Stair Climber": "Cardio", "Elliptical Trainer": "Cardio", 
    "Jump Rope": "Cardio", "High Knees": "Cardio", "Burpees": "Cardio", 
    "Jumping Jacks": "Cardio",
    // Flexibility
    "Dynamic Stretching": "Flexibility & Mobility", "Static Stretching": "Flexibility & Mobility", 
    "Hip Mobility Drills": "Flexibility & Mobility", "Shoulder Mobility Exercises": "Flexibility & Mobility", 
    "Hamstring Stretch": "Flexibility & Mobility", "Quad Stretch": "Flexibility & Mobility", 
    "Foam Rolling": "Flexibility & Mobility", "Yoga Stretches": "Flexibility & Mobility",
    // Functional
    "Farmer's Walk": "Functional Training", "Medicine Ball Slams": "Functional Training", 
    "Kettlebell Swings": "Functional Training", "Battle Ropes": "Functional Training", 
    "Box Step-ups": "Functional Training", "Sled Push/Pull": "Functional Training", 
    "Tire Flips (if available)": "Functional Training", "TRX Exercises": "Functional Training",
    // Strength
    "Barbell Squat": "Strength Training", "Bench Press": "Strength Training", 
    "Deadlift": "Strength Training", "Overhead Press": "Strength Training", 
    "Barbell Row": "Strength Training", "Weighted Pull-ups": "Strength Training", 
    "Weighted Dips": "Strength Training",
    // Power & Explosive
    "Box Jumps": "Power & Explosive Training", "Broad Jumps": "Power & Explosive Training", 
    "Medicine Ball Chest Throw": "Power & Explosive Training", "Medicine Ball Overhead Throw": "Power & Explosive Training", 
    "Medicine Ball Rotational Throw": "Power & Explosive Training", "Power Cleans": "Power & Explosive Training", 
    "Push Press": "Power & Explosive Training", "Jump Squats": "Power & Explosive Training", 
    "Sprint Drills": "Power & Explosive Training"
};

const dayCategoryMapping = {
    "Monday": ["Upper Body", "Strength Training"],
    "Tuesday": ["Lower Body", "Power & Explosive Training"],
    "Wednesday": ["Cardio", "Functional Training"],
    "Thursday": ["Core (Abs)"],
    "Friday": ["Upper Body", "Strength Training"],
    "Saturday": ["Lower Body", "Power & Explosive Training"],
    "Sunday": ["Flexibility & Mobility"]
};

function getExerciseParameters(name) {
    const category = exerciseCategoriesRef[name] || '';
    if (category === 'Cardio') {
        if (name === 'Jump Rope' || name === 'Burpees' || name === 'Jumping Jacks' || name === 'High Knees') {
            return { setsReps: '3 sets x 1 min', notes: 'Maintain high intensity, 30s rest' };
        }
        return { setsReps: '20 - 30 mins', notes: 'Moderate intensity, steady pace' };
    }
    if (category === 'Flexibility & Mobility') {
        return { setsReps: '3 sets x 30 sec hold', notes: 'Gentle stretch, do not bounce' };
    }
    if (category === 'Core (Abs)') {
        if (name === 'Plank' || name === 'Side Plank') {
            return { setsReps: '3 sets x 45 sec', notes: 'Keep core tight and back flat' };
        }
        return { setsReps: '3 sets x 15 reps', notes: 'Controlled slow movements' };
    }
    if (category === 'Power & Explosive Training') {
        return { setsReps: '4 sets x 5 reps', notes: 'Maximum explosive power, 2 min rest' };
    }
    if (category === 'Strength Training') {
        return { setsReps: '4 sets x 6-8 reps', notes: 'Heavy weights, focus on compound lift' };
    }
    return { setsReps: '3 sets x 10-12 reps', notes: 'Focus on mind-muscle connection' };
}

async function initDynamicWorkoutPlan(targetRequestId) {
    const tableBody = document.getElementById('dynamicWorkoutBody');
    if (!tableBody) return;

    let plan = null;
    const queryParam = targetRequestId ? `?requestId=${encodeURIComponent(targetRequestId)}` : '';
    const endpoints = [
        `/api/student/workout-plan${queryParam}`,
        `http://localhost:5000/api/student/workout-plan${queryParam}`,
        `http://127.0.0.1:5000/api/student/workout-plan${queryParam}`
    ];

    for (const ep of endpoints) {
        try {
            const token = getUniXsportToken();
            const res = await fetch(ep, {
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.plan) {
                    plan = data.plan;
                    break;
                }
            }
        } catch (e) {
            console.warn('API sync:', e.message);
        }
    }

    if (plan && plan.weeklyExercises && plan.weeklyExercises.length > 0) {
        const planBanner = document.querySelector('.workout-summary-card h3');
        const planCoach = document.querySelector('.workout-summary-card p');
        const coachNotes = document.querySelector('.coach-notes p');
        const summaryCard = document.querySelector('.workout-summary-card');

        if (summaryCard) {
            summaryCard.style.background = 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)';
        }

        if (planBanner) {
            if (plan.requestedDate) {
                planBanner.textContent = `Active Plan: ${formatRequestDate(plan.requestedDate)}`;
            } else {
                planBanner.textContent = 'Active Plan: Yes';
            }
        }

        if (planCoach) {
            const timeInfo = plan.timeSlot ? ` (${plan.timeSlot})` : '';
            planCoach.textContent = `Assigned by Coach ${plan.coachId || 'Coach'}${timeInfo}`;
        }

        if (coachNotes) {
            coachNotes.textContent = plan.coachNotes || 'Focus on proper form. Stay hydrated and track your progress!';
        }

        const exercises = plan.weeklyExercises.map(ex => {
            return typeof ex === 'string' ? ex : ex.name;
        });

        renderAssignedPlanTable(exercises, plan.weeklyExercises);
        initWorkoutTracker();
    } else {
        renderNoPlanMessage();
    }
}

async function openApprovedScheduleWorkoutPlan(requestId) {
    if (!requestId) return;

    // 1. Switch active training tab to workout
    switchTrainingTab('workout');

    // 2. Load the workout plan for this specific approved schedule
    await initDynamicWorkoutPlan(requestId);

    // 3. Smoothly scroll to the workout section
    const panel = document.getElementById('panel-workout');
    if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    showToast('Loaded assigned workout plan for this approved schedule!', 'success');
}
window.openApprovedScheduleWorkoutPlan = openApprovedScheduleWorkoutPlan;

function formatRequestDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch(err) {
        return dateStr;
    }
}

function renderAssignedPlanTable(exercises, fullExerciseData) {
    const tableBody = document.getElementById('dynamicWorkoutBody');
    if (!tableBody) return;

    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    let html = '';
    let globalIndex = 0;

    days.forEach(day => {
        const allowedCategories = dayCategoryMapping[day];
        const dayExercises = exercises.filter(ex => {
            const cat = exerciseCategoriesRef[ex];
            return allowedCategories.includes(cat);
        });

        if (dayExercises.length > 0) {
            const focus = allowedCategories.join(" & ");
            const exercisesMarkup = dayExercises.map((ex) => {
                const params = getExerciseParameters(ex);
                const exData = (fullExerciseData || []).find(item => {
                    const itemName = typeof item === 'string' ? item : item.name;
                    return itemName === ex;
                }) || (fullExerciseData && fullExerciseData[globalIndex]);

                const customSetsReps = (exData && typeof exData === 'object') ?
                    (exData.setsReps || (exData.sets ? `${exData.sets} sets x ${exData.reps || ''}` : '')) : '';
                const displaySetsReps = customSetsReps || params.setsReps;

                let checkedAttr = '';
                if (exData && exData.completed) {
                    checkedAttr = 'checked';
                }

                const markup = `
                    <div class="exercise-row-item">
                        <div class="exercise-info">
                            <strong class="exercise-name">${ex}</strong>
                            <div class="exercise-notes">${params.notes}</div>
                        </div>
                        <div class="exercise-meta">
                            <span class="exercise-sets-badge">${displaySetsReps}</span>
                            <label class="exercise-checkbox-label">
                                <input type="checkbox" class="exercise-checkbox" name="exercise-chk" data-exercise-index="${globalIndex}" ${checkedAttr}> Done
                            </label>
                        </div>
                    </div>
                `;
                globalIndex++;
                return markup;
            }).join('');

            html += `
                <tr class="workout-day-row">
                    <td class="workout-day-cell">${day}</td>
                    <td class="workout-focus-cell">
                        <span class="status-badge student workout-focus-badge">${focus}</span>
                    </td>
                    <td class="workout-exercises-cell">
                        <div class="exercises-list-wrapper">
                            ${exercisesMarkup}
                        </div>
                    </td>
                </tr>
            `;
        } else {
            html += `
                <tr>
                    <td style="font-weight: 700; color: var(--gray-400); vertical-align: top; padding-top: 18px;">${day}</td>
                    <td style="vertical-align: top; padding-top: 18px;">
                        <span class="status-badge" style="background: rgba(148,163,184,0.1); color: var(--gray-500); font-size: 0.8rem; padding: 4px 10px;">Rest Day</span>
                    </td>
                    <td style="color: var(--gray-400); font-style: italic; padding: 18px 16px;">
                        <i class="fas fa-mug-hot"></i> Recovery and muscle rebuild. Active rest or light walking recommended.
                    </td>
                </tr>
            `;
        }
    });

    tableBody.innerHTML = html;
}

function renderNoPlanMessage() {
    // Update banner to reflect no active plan
    const planBanner = document.querySelector('.workout-summary-card h3');
    const planCoach = document.querySelector('.workout-summary-card p');
    const coachNotes = document.querySelector('.coach-notes p');
    const summaryCard = document.querySelector('.workout-summary-card');

    if (planBanner) planBanner.textContent = 'No Active Plan';
    if (planCoach) planCoach.textContent = 'Submit a gym schedule request to get a personalized workout plan from your coach.';
    if (coachNotes) coachNotes.textContent = 'Your coach has not yet assigned exercises. Once your request is approved, your personalized 7-day plan will appear here.';
    if (summaryCard) {
        summaryCard.style.background = 'linear-gradient(135deg, #64748b 0%, #475569 100%)';
    }

    const tableBody = document.getElementById('dynamicWorkoutBody');
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr class="workout-empty-row">
            <td colspan="3" class="workout-empty-state-cell">
                <div class="workout-empty-state-box">
                    <div class="empty-icon-circle">
                        <i class="fas fa-dumbbell"></i>
                    </div>
                    <h3>No Workout Plan Assigned Yet</h3>
                    <p>
                        Your coach hasn't assigned a workout plan yet. Submit a gym schedule request and once your coach approves it and selects exercises for you, your personalized 7-day plan will appear here.
                    </p>
                    <a href="#" data-page="request-schedule" class="btn btn-primary">
                        <i class="fas fa-calendar-plus"></i> Request a Schedule
                    </a>
                </div>
            </td>
        </tr>
    `;
}



async function initMySchedule() {
    const container = document.querySelector('.schedule-cards');
    if (!container) return;

    let requests = [];

    try {
        const endpoints = [
            '/api/student/schedules',
            'http://localhost:5000/api/student/schedules',
            'http://127.0.0.1:5000/api/student/schedules'
        ];

        for (const ep of endpoints) {
            try {
                const token = getUniXsportToken();
                const res = await fetch(ep, {
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                });
                if (res.ok) {
                    const parsed = await res.json();
                    if (parsed && parsed.success && Array.isArray(parsed.requests)) {
                        requests = parsed.requests;
                        break;
                    }
                }
            } catch (e) {}
        }
    } catch(e) {
        console.error('Failed to load student schedules from API:', e);
    }

    if (requests.length === 0) {
        container.innerHTML = `
            <div class="empty-state-card" style="text-align: center; width: 100%; padding: 40px 20px; color: var(--gray-500);">
                <i class="fas fa-calendar-plus" style="font-size: 2.2rem; margin-bottom: 12px; display: block; opacity: 0.5; color: var(--blue);"></i>
                <h4 style="font-size: 1.1rem; margin-bottom: 6px; color: var(--gray-700);">No Gym Sessions Scheduled</h4>
                <p style="font-size: 0.9rem; margin: 0 0 16px 0;">You have not submitted any gym schedule booking requests yet.</p>
                <a href="#" data-page="request-schedule" class="btn btn-primary btn-sm">
                    <i class="fas fa-plus"></i> Request a Gym Slot
                </a>
            </div>
        `;
        return;
    }

    studentSchedulesList = requests;

    container.innerHTML = requests.map(r => {
        const st = (r.status || 'pending').toLowerCase();
        const isApproved = st === 'approved';
        let statusClass = 'status-pending';
        let iconClass = 'fa-clock';
        let statusLabel = 'Pending Review';

        if (isApproved) {
            statusClass = 'status-approved';
            iconClass = 'fa-calendar-check';
            statusLabel = 'Approved';
        } else if (st === 'rejected') {
            statusClass = 'status-rejected';
            iconClass = 'fa-times-circle';
            statusLabel = 'Rejected';
        }

        const dateStr = r.requestedDate || r.preferredDate || r.date || '--';
        const timeStr = r.timeSlot || r.preferredTime || '--';
        const coachStr = r.preferredCoach || r.coachId || 'Gym Coach';
        const comment = r.coachNotes || r.coachComment || '';
        const pdfUrl = r.pdfScheduleUrl || r.schedulePdf || '';

        return `
            <div class="schedule-card ${statusClass}" ${isApproved ? `onclick="openApprovedScheduleWorkoutPlan('${r.id}')" style="cursor: pointer; position: relative;" title="Click to view assigned workout plan"` : 'style="position: relative;"'}>
                <button type="button" class="btn-close-schedule-card" onclick="promptDeleteScheduleCard('${r.id}', event)" style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.05); border: none; color: var(--gray-500); cursor: pointer; padding: 4px 8px; border-radius: 6px; font-size: 0.95rem; line-height: 1; transition: all 0.2s; z-index: 2;" title="Delete schedule & workout plan" aria-label="Delete">
                    <i class="fas fa-times"></i>
                </button>
                <div class="schedule-card-header" style="padding-right: 32px;">
                    <span class="status-badge">${statusLabel}</span>
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="schedule-card-body">
                    <p><strong>Date:</strong> ${formatRequestDate(dateStr)}</p>
                    <p><strong>Time Slot:</strong> ${timeStr}</p>
                    <p><strong>Coach:</strong> ${coachStr}</p>
                    ${comment ? `<p style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--gray-200); font-style: italic; color: var(--gray-600);"><strong>Coach Note:</strong> ${comment}</p>` : ''}
                    ${pdfUrl ? `<div style="margin-top: 10px;"><a href="${pdfUrl}" target="_blank" onclick="event.stopPropagation();" class="btn btn-sm btn-outline" style="font-size: 0.8rem; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-file-pdf text-red"></i> Download Schedule PDF</a></div>` : ''}
                    ${isApproved ? `
                        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed rgba(34,197,94,0.3);">
                            <button type="button" class="btn btn-sm btn-success" onclick="openApprovedScheduleWorkoutPlan('${r.id}'); event.stopPropagation();" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; padding: 8px 12px; border-radius: 6px; background: #16a34a; border-color: #16a34a; color: #fff; cursor: pointer;">
                                <i class="fas fa-dumbbell"></i> View Assigned Workout Plan <i class="fas fa-arrow-right" style="font-size: 0.75rem; margin-left: 4px;"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ========== Delete Schedule Modal & Action ==========
let pendingDeleteScheduleId = null;

function promptDeleteScheduleCard(scheduleId, event) {
    if (event) event.stopPropagation();
    pendingDeleteScheduleId = scheduleId;

    const modal = document.getElementById('deleteScheduleModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}
window.promptDeleteScheduleCard = promptDeleteScheduleCard;

function initDeleteScheduleModal() {
    const modal = document.getElementById('deleteScheduleModal');
    const cancelBtn = document.getElementById('btnCancelDeleteSchedule');
    const confirmBtn = document.getElementById('btnConfirmDeleteSchedule');

    function hideDeleteModal() {
        if (modal) modal.style.display = 'none';
        pendingDeleteScheduleId = null;
    }

    cancelBtn?.addEventListener('click', hideDeleteModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) hideDeleteModal();
    });

    confirmBtn?.addEventListener('click', async () => {
        if (!pendingDeleteScheduleId) return;

        const origHtml = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

        try {
            const endpoints = [
                `/api/student/schedule/${pendingDeleteScheduleId}`,
                `http://localhost:5000/api/student/schedule/${pendingDeleteScheduleId}`,
                `http://127.0.0.1:5000/api/student/schedule/${pendingDeleteScheduleId}`
            ];

            const token = getUniXsportToken();
            let deleted = false;

            for (const ep of endpoints) {
                try {
                    const res = await fetch(ep, {
                        method: 'DELETE',
                        headers: {
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.success) {
                            deleted = true;
                            break;
                        }
                    }
                } catch(e) {}
            }

            if (deleted) {
                hideDeleteModal();
                showToast('Gym schedule and workout plan deleted successfully!', 'success');
                await initMySchedule();
                await initDynamicWorkoutPlan();
            } else {
                showToast('Failed to delete schedule. Please try again.', 'error');
            }
        } catch(err) {
            console.error('Delete schedule error:', err);
            showToast('Error connecting to server to delete schedule.', 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = origHtml;
        }
    });
}

// ========== Dynamic Equipment Loader ==========
function loadEquipmentAvailability() {
    const grid = document.getElementById('equipmentGrid');
    const select = document.getElementById('equipmentSelect');

    let equipmentList = [];
    const saved = localStorage.getItem('unixsport_equipment');
    if (saved) {
        try { equipmentList = JSON.parse(saved); } catch(e) {}
    }

    // Populate dropdown options
    if (select) {
        select.innerHTML = '<option value="">Select equipment...</option>' + 
            equipmentList.map(eq => {
                const avail = (eq.available !== undefined) ? eq.available : (eq.availableQty !== undefined ? eq.availableQty : eq.totalQty || 0);
                return `<option value="${eq.name}" data-available="${avail}">${eq.name} - ${avail} available</option>`;
            }).join('');
    }

    // Populate grid
    if (!grid) return;
    if (equipmentList.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: var(--gray-500);">
                <i class="fas fa-boxes-stacked" style="font-size: 2.4rem; margin-bottom: 12px; display: block; opacity: 0.5; color: var(--orange);"></i>
                <h4 style="font-size: 1.1rem; margin-bottom: 6px; color: var(--gray-700);">No Equipment in Inventory</h4>
                <p style="font-size: 0.9rem; margin: 0;">Sports equipment items added by storekeeper/admin will appear here.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = equipmentList.map(eq => {
        const total = eq.totalQty || eq.total || eq.quantity || 0;
        const avail = (eq.available !== undefined) ? eq.available : (eq.availableQty !== undefined ? eq.availableQty : total);
        return `
            <div class="equipment-card" data-name="${eq.name}">
                <div class="equipment-icon"><i class="fas fa-dumbbell"></i></div>
                <h3>${eq.name}</h3>
                <p class="total">Total: ${total}</p>
                <p class="available">Available: ${avail}</p>
            </div>
        `;
    }).join('');
}

// Helper to format any ISO or UTC timestamp into Asia/Colombo YYYY-MM-DD HH:mm
function formatColomboDateTime(isoStr) {
    if (!isoStr || isoStr === '-') return '-';
    try {
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return isoStr;

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Colombo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        const hour = parts.find(p => p.type === 'hour')?.value;
        const minute = parts.find(p => p.type === 'minute')?.value;

        if (year && month && day && hour && minute) {
            return `${year}-${month}-${day} ${hour}:${minute}`;
        }
        return formatter.format(date).replace(',', '').trim();
    } catch(e) {
        return isoStr;
    }
}

// ========== Dynamic Borrow History Loader ==========
async function loadBorrowHistory() {
    const container = document.getElementById('borrowCards');
    if (!container) return;

    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.getStudentBorrowHistory === 'function') {
            const res = await window.UniXsportAPI.getStudentBorrowHistory();
            if (res && res.success) {
                const history = res.history || [];

                if (history.length === 0) {
                    container.innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: var(--gray-500);">
                            <i class="fas fa-history" style="font-size: 2.4rem; margin-bottom: 12px; display: block; opacity: 0.5; color: var(--blue);"></i>
                            <h4 style="font-size: 1.1rem; margin-bottom: 6px; color: var(--gray-700);">No Borrow History</h4>
                            <p style="font-size: 0.9rem; margin: 0;">You have not borrowed any equipment yet.</p>
                        </div>
                    `;
                    return;
                }

                container.innerHTML = history.map(b => {
                    const statusLower = (b.status || '').toLowerCase();
                    const isReturned = statusLower === 'returned';
                    const isPartial = statusLower === 'partially returned';
                    const statusBadge = isReturned ? 'Returned' : (isPartial ? 'Partially Returned' : 'Taken');
                    const badgeClass = isReturned ? 'status-returned' : (isPartial ? 'status-partial' : 'status-not-returned');
                    const icon = isReturned ? 'fa-check-circle' : (isPartial ? 'fa-hourglass-half' : 'fa-clock');

                    const rawDate = b.borrowedAt || b.issuedAt || b.issueDate || b.createdAt || '';
                    const formattedDate = formatColomboDateTime(rawDate);
                    const rawReturnDate = b.returnedAt || b.returnDate || '';
                    const formattedReturnDate = formatColomboDateTime(rawReturnDate);

                    return `
                        <div class="borrow-card ${badgeClass}">
                            <div class="borrow-card-header">
                                <span class="status-badge">${statusBadge}</span>
                                <i class="fas ${icon}"></i>
                            </div>
                            <div class="borrow-card-body">
                                <p><strong>${b.equipmentName || b.equipment || 'Sports Equipment'}</strong></p>
                                <p>Quantity: ${b.quantity || b.qty || 1}${isPartial ? ` (${b.borrowedQty} remaining)` : ''}</p>
                                <p>Date: ${formattedDate}</p>
                                ${b.returnedAt ? `<p>Returned: ${formattedReturnDate}</p>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
                return;
            }
        }
    } catch (err) {
        console.error('Failed to load borrow history from API:', err);
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px 20px; color: var(--danger, #ef4444);">
                <i class="fas fa-exclamation-triangle" style="font-size: 2.4rem; margin-bottom: 12px; display: block;"></i>
                <h4 style="font-size: 1.1rem; margin-bottom: 6px;">Unable to load borrow history.</h4>
                <p style="font-size: 0.9rem; margin: 0;">Please try again.</p>
            </div>
        `;
        return;
    }
}

// ========== Dynamic Student Dashboard Statistics ==========
async function updateStudentDashboardStats() {
    try {
        if (window.UniXsportAPI && typeof window.UniXsportAPI.getStudentDashboard === 'function') {
            const res = await window.UniXsportAPI.getStudentDashboard();
            if (res && res.success && res.data) {
                const d = res.data;
                const elSessions = document.getElementById('dashUpcomingSessions');
                const elPlan = document.getElementById('dashWorkoutPlan');
                const elPendingEq = document.getElementById('dashPendingEquipment');
                const elTotalBorrowed = document.getElementById('dashTotalBorrowed');

                if (elSessions) elSessions.textContent = d.upcomingSessionsCount || 0;
                if (elPlan) elPlan.textContent = d.workoutPlan ? 'Yes' : 'No';
                if (elPendingEq) elPendingEq.textContent = d.pendingRequestsCount || 0;
                if (elTotalBorrowed) elTotalBorrowed.textContent = d.borrowedEquipmentCount || 0;
                return;
            }
        }
    } catch(err) {
        console.error('Failed to load student dashboard stats from API:', err);
    }

    const userName = localStorage.getItem('userName') || 'student';
    let userReg = '';
    try {
        const p = JSON.parse(localStorage.getItem('unixsport_profile_' + userName.replace(/\//g, '_')) || '{}');
        userReg = (p.regNo || '').toUpperCase();
    } catch(e) {}

    let requests = [];
    try {
        requests = JSON.parse(localStorage.getItem('unixsport_student_requests') || '[]');
    } catch(e) {}

    const myRequests = requests.filter(r => {
        if (r.studentUserKey && r.studentUserKey === userName) return true;
        if (userReg && r.studentId && r.studentId.toUpperCase() === userReg) return true;
        return false;
    });

    const upcomingSessions = myRequests.filter(r => r.status === 'approved').length;
    const hasActivePlan = myRequests.some(r => r.status === 'approved' && r.assignedExercises && r.assignedExercises.length > 0);

    let borrowLogs = [];
    try {
        borrowLogs = JSON.parse(localStorage.getItem('unixsport_borrow_history') || '[]');
    } catch(e) {}

    const myBorrow = borrowLogs.filter(b => {
        if (b.studentId && userReg && b.studentId.toUpperCase() === userReg) return true;
        if (b.studentName && b.studentName.toLowerCase() === userName.toLowerCase()) return true;
        return false;
    });

    const totalBorrowed = myBorrow.filter(b => b.status === 'taken' || b.status === 'borrowed').length;

    const elSessions = document.getElementById('dashUpcomingSessions');
    const elPlan = document.getElementById('dashWorkoutPlan');
    const elPendingEq = document.getElementById('dashPendingEquipment');
    const elTotalBorrowed = document.getElementById('dashTotalBorrowed');

    if (elSessions) elSessions.textContent = upcomingSessions;
    if (elPlan) elPlan.textContent = hasActivePlan ? 'Yes' : 'No';
    if (elPendingEq) elPendingEq.textContent = '0';
    if (elTotalBorrowed) elTotalBorrowed.textContent = totalBorrowed;
}

window.loadEquipmentAvailability = loadEquipmentAvailability;
window.loadBorrowHistory = loadBorrowHistory;
window.updateStudentDashboardStats = updateStudentDashboardStats;
