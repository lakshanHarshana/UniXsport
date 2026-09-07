/**
 * UniXsport - Coach Dashboard
 * Complete Gym Coach Module
 * 
 * IMPORTANT: COACH DATA ISOLATION
 * ================================
 * Each coach ONLY sees requests where they are the preferred coach.
 * This ensures:
 * - Coach Mike only sees requests for "Coach Mike"
 * - Coach Sarah only sees requests for "Coach Sarah"
 * - Each coach's dashboard, pending requests, history, and calendar are isolated
 * 
 * This filtering is applied in ALL functions:
 * - Dashboard statistics
 * - Pending requests table
 * - Request history
 * - Schedule calendar
 * - Slot availability checks
 * 
 * NEVER REMOVE THIS FILTERING - it's a core requirement!
 */

function getUniXsportToken() {
    return (window.UniXsportAPI && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken('coach') : '') ||
           sessionStorage.getItem('unixsport_token_coach') ||
           sessionStorage.getItem('unixsport_jwt_token') ||
           sessionStorage.getItem('token') ||
           localStorage.getItem('unixsport_token_coach') ||
           localStorage.getItem('unixsport_jwt_token') ||
           localStorage.getItem('token') ||
           '';
}

// ========== Data Storage (Connected 100% to Local Database) ==========
let studentRequests = [];
let approvedSchedules = [];

let currentCoach = (() => {
    let raw = sessionStorage.getItem('unixsport_user_coach') ||
              localStorage.getItem('unixsport_user_coach') ||
              sessionStorage.getItem('unixsport_user') ||
              localStorage.getItem('unixsport_user');
    let parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch(e) {}
    }
    return {
        id: parsed?.id || parsed?.user_id || parsed?.userId || '',
        user_id: parsed?.user_id || parsed?.userId || parsed?.id || '',
        name: parsed?.name || sessionStorage.getItem('userRealName') || localStorage.getItem('userRealName') || (sessionStorage.getItem('userName') || localStorage.getItem('userName') ? ((sessionStorage.getItem('userName') || localStorage.getItem('userName')).charAt(0).toUpperCase() + (sessionStorage.getItem('userName') || localStorage.getItem('userName')).slice(1)) : 'Coach Mike'),
        email: parsed?.email || sessionStorage.getItem('userEmail') || localStorage.getItem('userEmail') || 'coach@unixsport.edu',
        role: parsed?.role || sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || 'coach'
    };
})();

// ========== Exercise Categories Database ==========
const exerciseProgramCategories = {
    "Upper Body": [
        "Bench Press", "Push-ups", "Shoulder Press", "Pull-ups", "Lat Pulldown",
        "Seated Row", "Bicep Curls", "Tricep Pushdown", "Dumbbell Fly", "Lateral Raises"
    ],
    "Lower Body": [
        "Squats", "Leg Press", "Lunges", "Deadlift", "Romanian Deadlift",
        "Leg Curl", "Leg Extension", "Calf Raises", "Step-ups", "Bulgarian Split Squat"
    ],
    "Core (Abs)": [
        "Plank", "Side Plank", "Sit-ups", "Crunches", "Russian Twist",
        "Hanging Leg Raise", "Mountain Climbers", "Bicycle Crunch", "Reverse Crunch", "Ab Wheel Rollout"
    ],
    "Cardio": [
        "Treadmill Running", "Walking", "Cycling", "Rowing Machine", "Stair Climber",
        "Elliptical Trainer", "Jump Rope", "High Knees", "Burpees", "Jumping Jacks"
    ],
    "Flexibility & Mobility": [
        "Dynamic Stretching", "Static Stretching", "Hip Mobility Drills", "Shoulder Mobility Exercises",
        "Hamstring Stretch", "Quad Stretch", "Foam Rolling", "Yoga Stretches"
    ],
    "Functional Training": [
        "Farmer's Walk", "Medicine Ball Slams", "Kettlebell Swings", "Battle Ropes",
        "Box Step-ups", "Sled Push/Pull", "Tire Flips (if available)", "TRX Exercises"
    ],
    "Strength Training": [
        "Barbell Squat", "Bench Press", "Deadlift", "Overhead Press", "Barbell Row",
        "Weighted Pull-ups", "Weighted Dips"
    ],
    "Power & Explosive Training": [
        "Box Jumps", "Broad Jumps", "Medicine Ball Chest Throw", "Medicine Ball Overhead Throw",
        "Medicine Ball Rotational Throw", "Power Cleans", "Push Press", "Jump Squats", "Sprint Drills"
    ]
};

let selectedExercises = [];
let activeExerciseCategory = "Upper Body";

// ========== Notices Database ==========
let notices = [];

// Filter requests for current coach or open requests
function filterByCurrentCoach(requests) {
    if (!requests || !Array.isArray(requests)) return [];
    if (currentCoach.role === 'admin') return requests;

    const coachName = (currentCoach.name || '').toLowerCase().trim();
    const cleanCoachName = coachName.replace(/^coach\s+/i, '').trim();
    const coachIds = [currentCoach.id, currentCoach.user_id, currentCoach.email].filter(Boolean).map(s => String(s).toLowerCase().trim());

    return requests.filter(r => {
        if (!r) return false;
        const prefCoach = (r.preferredCoach || r.coach || '').toLowerCase().trim();
        const cleanPref = prefCoach.replace(/^coach\s+/i, '').trim();
        const rCoachId = String(r.coachId || '').toLowerCase().trim();
        const rTargetId = String(r.targetCoachId || '').toLowerCase().trim();
        const rCoachName = String(r.coachName || '').toLowerCase().trim();
        const cleanRCoachName = rCoachName.replace(/^coach\s+/i, '').trim();

        // 1. Any coach / open request
        if (prefCoach === 'any coach' || prefCoach === 'any' || !prefCoach) return true;

        // 2. Direct ID match
        if (coachIds.length > 0 && (coachIds.includes(rCoachId) || coachIds.includes(rTargetId))) return true;

        // 3. Name match
        if (coachName) {
            if (rCoachName && (rCoachName === coachName || cleanRCoachName === cleanCoachName)) return true;
            if (prefCoach && (prefCoach === coachName || cleanPref === cleanCoachName || prefCoach.includes(cleanCoachName) || coachName.includes(cleanPref))) return true;
        }

        // 4. Approved/rejected by this coach
        if (r.approvedBy) {
            const approvedByStr = String(r.approvedBy).toLowerCase().trim();
            if (coachIds.includes(approvedByStr) || (coachName && approvedByStr === coachName)) return true;
        }

        return false;
    });
}

// ========== Live Database Sync ==========
async function loadRequestsDatabase() {
    try {
        let allReqs = [];

        // 1. Try UniXsportAPI helper
        if (window.UniXsportAPI && typeof window.UniXsportAPI.getCoachDashboard === 'function') {
            try {
                const res = await window.UniXsportAPI.getCoachDashboard();
                if (res && res.success) {
                    allReqs = res.allRequests || res.pendingRequests || [];
                }
            } catch (apiErr) {}
        }

        // 2. Multi-host fallback with all token keys
        if (!allReqs || allReqs.length === 0) {
            const token = localStorage.getItem('unixsport_jwt_token') ||
                          localStorage.getItem('token') ||
                          localStorage.getItem('authToken') ||
                          (window.UniXsportAPI && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken() : '');

            const endpoints = [
                '/api/coach/dashboard',
                'http://localhost:5000/api/coach/dashboard',
                'http://127.0.0.1:5000/api/coach/dashboard'
            ];

            for (const ep of endpoints) {
                try {
                    const res = await fetch(ep, {
                        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                    });
                    if (res.ok) {
                        const parsed = await res.json();
                        if (parsed && parsed.success) {
                            allReqs = parsed.allRequests || parsed.pendingRequests || [];
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        const mappedReqs = allReqs.map(r => ({
            id: r.id,
            userId: r.userId || r.user_id || 'US002',
            studentId: r.studentRegNo || r.studentId || r.userId || 'STU001',
            studentRegNo: r.studentRegNo || r.studentId || r.userId || 'STU001',
            studentName: r.studentName || 'Student',
            department: r.department || 'Technology',
            age: r.age || '',
            height: r.height || '',
            weight: r.weight || '',
            fitnessLevel: r.fitnessLevel || 'Intermediate',
            trainingGoal: r.trainingGoal || 'General Fitness',
            injuryHistory: r.injuryHistory || 'None',
            date: r.requestedDate || r.preferredDate || r.date,
            requestedDate: r.requestedDate || r.preferredDate || r.date,
            preferredDate: r.requestedDate || r.preferredDate || r.date,
            timeSlot: r.timeSlot || r.preferredTime,
            preferredTime: r.timeSlot || r.preferredTime,
            preferredCoach: r.preferredCoach || r.coachId || 'Coach Mike',
            coachId: r.coachId || r.preferredCoach || 'Coach Mike',
            coachName: r.coachName || '',
            targetCoachId: r.targetCoachId || '',
            notes: r.notes || '',
            reason: r.reason || '',
            status: r.status || 'pending',
            submittedAt: r.createdAt || r.submittedAt || new Date().toISOString(),
            coachNotes: r.coachNotes || r.coachComment || '',
            coachComment: r.coachComment || r.coachNotes || '',
            pdfScheduleUrl: r.pdfScheduleUrl || r.schedulePdf || '',
            schedulePdf: r.pdfScheduleUrl || r.schedulePdf || '',
            assignedExercises: r.assignedExercises || []
        }));

        studentRequests = filterByCurrentCoach(mappedReqs);

        approvedSchedules = studentRequests.filter(r => r.status === 'approved').map(r => ({
            id: r.id,
            requestId: r.id,
            studentId: r.studentId,
            studentName: r.studentName,
            studentRegNo: r.studentRegNo,
            coachId: currentCoach.id || currentCoach.user_id || 'Coach',
            coachName: currentCoach.name,
            date: r.requestedDate,
            timeSlot: r.timeSlot,
            department: r.department,
            schedulePdfUrl: r.pdfScheduleUrl,
            status: 'active'
        }));
    } catch(e) {
        console.error('Failed to load coach requests from database:', e);
    }
}

// ========== Initialization ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Set coach name in UI
    const coachNameEl = document.getElementById('coachName');
    if (coachNameEl) {
        coachNameEl.textContent = currentCoach.name;
    }
    
    await loadRequestsDatabase();
    initNavigation();
    initSidebar();
    initDarkMode();
    initNotifications();
    initDashboard();
    initPendingRequests();
    initHistory();
    initCalendar();
    initModals();
    initExerciseSelector();
    initNotices();
    updatePendingBadge();
    initCoachAutoRefresh();
});

// ========== Automatic Live Data Refresh ==========
let coachRefreshInterval = null;

async function autoRefreshCoachData() {
    const activeModal = document.querySelector('.modal.show');
    const isTyping = document.activeElement && (
        document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'TEXTAREA' || 
        document.activeElement.tagName === 'SELECT'
    );

    // 1. Always refresh notices & requests in background
    await loadRequestsDatabase();
    await fetchCoachNotices();
    updatePendingBadge();

    // 2. Refresh active page views if no modal is open and not actively typing in an input
    if (!activeModal && !isTyping) {
        const activePageEl = document.querySelector('.page.active');
        const activePageId = activePageEl ? activePageEl.id.replace('page-', '') : 'dashboard';

        if (activePageId === 'dashboard') initDashboard();
        else if (activePageId === 'pending-requests') renderPendingRequests();
        else if (activePageId === 'history') renderHistory();
        else if (activePageId === 'schedule-calendar') renderCalendar();
        else if (activePageId === 'notices') renderNoticesList();
    }
}

function initCoachAutoRefresh() {
    if (coachRefreshInterval) clearInterval(coachRefreshInterval);
    coachRefreshInterval = setInterval(() => {
        autoRefreshCoachData();
    }, 10000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            autoRefreshCoachData();
        }
    });

    window.addEventListener('focus', () => {
        autoRefreshCoachData();
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
        
        await loadRequestsDatabase();
        // Refresh data when switching pages
        if (pageId === 'dashboard') initDashboard();
        if (pageId === 'pending-requests') initPendingRequests();
        if (pageId === 'history') initHistory();
        if (pageId === 'schedule-calendar') initCalendar();
        if (pageId === 'notices') renderNoticesList();
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

// ========== Dashboard ==========
function initDashboard() {
    // IMPORTANT: Filter by current coach - each coach only sees their own data
    const coachRequests = filterByCurrentCoach(studentRequests);
    
    const pending = coachRequests.filter(r => r.status === 'pending').length;
    const today = new Date().toISOString().split('T')[0];
    const approvedToday = coachRequests.filter(r => {
        if (r.status !== 'approved') return false;
        const appDate = (r.approvedAt || r.updatedAt || r.createdAt || r.submittedAt || '').split('T')[0].split(' ')[0];
        const reqDate = (r.requestedDate || r.preferredDate || r.date || '').split('T')[0].split(' ')[0];
        return appDate === today || reqDate === today;
    }).length;

    const totalStudents = new Set(coachRequests.map(r => r.studentId || r.studentRegNo || r.userId || r.studentName)).size;

    const todayZero = new Date();
    todayZero.setHours(0, 0, 0, 0);
    const upcomingSessions = coachRequests.filter(r => {
        if (r.status !== 'approved') return false;
        const sDateStr = r.requestedDate || r.preferredDate || r.date;
        if (!sDateStr) return false;
        return new Date(sDateStr) >= todayZero;
    }).length;

    const elPending = document.getElementById('dashboardPending');
    const elApproved = document.getElementById('dashboardApproved');
    const elStudents = document.getElementById('dashboardStudents');
    const elSessions = document.getElementById('dashboardSessions');

    if (elPending) elPending.textContent = pending;
    if (elApproved) elApproved.textContent = approvedToday;
    if (elStudents) elStudents.textContent = totalStudents || 1;
    if (elSessions) elSessions.textContent = upcomingSessions;

    renderRecentActivity();
}

function renderRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;

    // IMPORTANT: Filter by current coach - each coach only sees their own activity
    const coachRequests = filterByCurrentCoach(studentRequests);
    const recent = [...coachRequests]
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
        .slice(0, 5);

    container.innerHTML = recent.map(req => {
        let icon = 'fas fa-clock';
        let iconColor = 'text-orange';
        let action = 'submitted a request';

        if (req.status === 'approved') {
            icon = 'fas fa-check-circle';
            iconColor = 'text-green';
            action = 'request was approved';
        } else if (req.status === 'rejected') {
            icon = 'fas fa-times-circle';
            iconColor = 'text-danger';
            action = 'request was rejected';
        }

        return `
            <div class="activity-item">
                <i class="${icon} ${iconColor}"></i>
                <div class="content">
                    <strong>${req.studentName}</strong>
                    <p>${action}</p>
                </div>
                <div class="time">${formatDateTime(req.submittedAt)}</div>
            </div>
        `;
    }).join('');
}

// ========== Pending Requests ==========
let pendingListenersAttached = false;
function initPendingRequests() {
    renderPendingRequests();
    
    if (!pendingListenersAttached) {
        document.getElementById('requestSearch')?.addEventListener('input', () => {
            renderPendingRequests();
        });

        document.getElementById('filterDate')?.addEventListener('change', () => {
            renderPendingRequests();
        });

        document.getElementById('filterTimeSlot')?.addEventListener('change', () => {
            renderPendingRequests();
        });
        pendingListenersAttached = true;
    }
}

function renderPendingRequests() {
    const tbody = document.getElementById('pendingRequestsBody');
    const emptyState = document.getElementById('noPendingRequests');
    if (!tbody) return;

    const searchTerm = document.getElementById('requestSearch')?.value.toLowerCase() || '';
    const dateFilter = document.getElementById('filterDate')?.value || '';
    const timeFilter = document.getElementById('filterTimeSlot')?.value || '';

    // IMPORTANT: Filter by current coach - each coach only sees their own pending requests
    let filtered = filterByCurrentCoach(studentRequests).filter(r => r.status === 'pending');

    if (searchTerm) {
        filtered = filtered.filter(r => 
            r.studentName.toLowerCase().includes(searchTerm) ||
            r.studentId.toLowerCase().includes(searchTerm)
        );
    }

    if (dateFilter) {
        filtered = filtered.filter(r => r.preferredDate === dateFilter);
    }

    if (timeFilter) {
        filtered = filtered.filter(r => r.preferredTime === timeFilter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(req => {
        const slotInfo = getSlotAvailability(req.preferredDate, req.preferredTime);
        return `
            <tr>
                <td><strong>${req.studentName}</strong></td>
                <td>${req.studentId}</td>
                <td>${req.preferredTime}</td>
                <td>${req.preferredCoach || '-'}</td>
                <td>
                    <span class="slot-availability ${slotInfo.class}">
                        <i class="fas fa-${slotInfo.icon}"></i>
                        ${slotInfo.text}
                    </span>
                </td>
                <td>${formatDateTime(req.submittedAt)}</td>
                <td>
                    <div class="table-actions" style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-outline" onclick="viewRequestDetails('${req.id}')" title="View Full Details">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                        <button class="btn btn-sm btn-success" onclick="openApprovalModal('${req.id}')" title="Approve Request">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="openRejectionModal('${req.id}')" title="Reject Request">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Populate date filter
    const dateFilterEl = document.getElementById('filterDate');
    if (dateFilterEl && dateFilterEl.children.length === 1) {
        const dates = [...new Set(filtered.map(r => r.preferredDate))].sort();
        dates.forEach(date => {
            const option = document.createElement('option');
            option.value = date;
            option.textContent = formatDate(date);
            dateFilterEl.appendChild(option);
        });
    }
}

function getSlotAvailability(date, timeSlot) {
    const matched = studentRequests.filter(s => {
        const sDate = (s.requestedDate || s.preferredDate || s.date || '').split('T')[0].split(' ')[0];
        const sSlot = (s.timeSlot || s.preferredTime || '').trim();
        return sDate === date && sSlot === timeSlot && (s.status === 'approved' || s.status === 'pending');
    });
    const count = matched.length;

    if (count >= 30) {
        return {
            class: 'full',
            icon: 'exclamation-triangle',
            text: `${count}/30 (Full)`
        };
    } else if (count >= 25) {
        return {
            class: 'warning',
            icon: 'exclamation-circle',
            text: `${count}/30 (Almost Full)`
        };
    } else {
        return {
            class: 'available',
            icon: 'check-circle',
            text: `${count}/30 Available`
        };
    }
}

// ========== Request History ==========
function initHistory() {
    renderHistory();

    document.getElementById('applyHistoryFilters')?.addEventListener('click', () => {
        renderHistory();
    });

    document.getElementById('clearHistoryFilters')?.addEventListener('click', () => {
        document.getElementById('historySearch').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('historyDateFrom').value = '';
        document.getElementById('historyDateTo').value = '';
        renderHistory();
    });
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    const emptyState = document.getElementById('noHistory');
    if (!tbody) return;

    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filterStatus')?.value || '';
    const dateFrom = document.getElementById('historyDateFrom')?.value || '';
    const dateTo = document.getElementById('historyDateTo')?.value || '';

    // IMPORTANT: Filter by current coach - each coach only sees their own history
    let filtered = filterByCurrentCoach(studentRequests).filter(r => r.status !== 'pending');

    if (searchTerm) {
        filtered = filtered.filter(r => 
            r.studentName.toLowerCase().includes(searchTerm) ||
            r.studentId.toLowerCase().includes(searchTerm)
        );
    }

    if (statusFilter) {
        filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (dateFrom) {
        filtered = filtered.filter(r => (r.submittedAt || '').split('T')[0].split(' ')[0] >= dateFrom);
    }

    if (dateTo) {
        filtered = filtered.filter(r => (r.submittedAt || '').split('T')[0].split(' ')[0] <= dateTo);
    }

    filtered.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = filtered.map(req => {
        return `
            <tr>
                <td><strong>${req.studentName}</strong></td>
                <td>${req.studentId}</td>
                <td>${formatDate(req.preferredDate)}</td>
                <td>${req.preferredTime}</td>
                <td>${req.preferredCoach || '-'}</td>
                <td>
                    <span class="status-badge ${req.status}">
                        <i class="fas fa-${req.status === 'approved' ? 'check-circle' : 'times-circle'}"></i>
                        ${req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                </td>
                <td>${req.coachComment || '-'}</td>
                <td>
                    ${req.schedulePdf ? `
                        <a href="${req.schedulePdf}" target="_blank" class="pdf-link">
                            <i class="fas fa-file-pdf"></i> View PDF
                        </a>
                    ` : '-'}
                </td>
                <td>${formatDateTime(req.submittedAt)}</td>
                <td>
                    <div class="table-actions" style="display: flex; gap: 6px; justify-content: center;">
                        <button class="btn btn-sm btn-outline" onclick="viewRequestDetails('${req.id}')" title="View Full Details">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========== Calendar ==========
let calendarListenersAttached = false;
function initCalendar() {
    renderCalendar();
    
    if (!calendarListenersAttached) {
        document.getElementById('prevWeek')?.addEventListener('click', () => {
            currentWeekStart.setDate(currentWeekStart.getDate() - 7);
            renderCalendar();
        });

        document.getElementById('nextWeek')?.addEventListener('click', () => {
            currentWeekStart.setDate(currentWeekStart.getDate() + 7);
            renderCalendar();
        });
        calendarListenersAttached = true;
    }
}

let currentWeekStart = new Date();
currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());

function renderCalendar() {
    const calendar = document.getElementById('scheduleCalendar');
    const weekRange = document.getElementById('calendarWeekRange');
    if (!calendar) return;

    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekRange) {
        weekRange.textContent = `${formatDate(currentWeekStart.toISOString().split('T')[0])} - ${formatDate(weekEnd.toISOString().split('T')[0])}`;
    }

    const timeSlots = [
        '06:00-08:00',
        '08:00-10:00',
        '10:00-12:00',
        '12:00-14:00',
        '14:00-16:00',
        '16:00-18:00',
        '18:00-20:00'
    ];

    calendar.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerHTML = `
            <div class="calendar-day-header">
                ${dayName}
                <div class="date">${dayNum}</div>
            </div>
            ${timeSlots.map(slot => {
                const matched = studentRequests.filter(r => {
                    const rDate = (r.requestedDate || r.preferredDate || r.date || '').split('T')[0].split(' ')[0];
                    const rSlot = (r.timeSlot || r.preferredTime || '').trim();
                    return rDate === dateStr && rSlot === slot && r.status !== 'rejected';
                });
                const count = matched.length;
                const isFull = count >= 30;
                const isWarning = count >= 25;
                const hasStudents = count > 0;
                const slotClass = isFull ? 'full' : isWarning ? 'warning' : (hasStudents ? 'occupied' : 'available');

                const studentNames = matched.map(m => `${m.studentName} (${m.status})`).join(', ');
                const titleAttr = hasStudents ? `title="${count} student(s) on ${formatDate(dateStr)}: ${studentNames}"` : '';

                return `
                    <div class="time-slot ${slotClass}" ${titleAttr}>
                        <div class="time-slot-header" style="${hasStudents ? 'font-weight: 700; color: var(--blue);' : ''}">${slot}</div>
                        <div class="time-slot-count" style="${hasStudents ? 'font-weight: 600; color: var(--gray-800);' : ''}">${count}/30 students</div>
                    </div>
                `;
            }).join('')}
        `;
        calendar.appendChild(dayDiv);
    }
}

// ========== Modals ==========
let currentRequestId = null;

function initModals() {
    // Approval Modal
    document.getElementById('closeApprovalModal')?.addEventListener('click', () => {
        closeModal('approvalModal');
    });

    document.getElementById('cancelApproveBtn')?.addEventListener('click', () => {
        closeModal('approvalModal');
    });

    document.getElementById('confirmApproveBtn')?.addEventListener('click', () => {
        approveRequest();
    });

    // Rejection Modal
    document.getElementById('closeRejectionModal')?.addEventListener('click', () => {
        closeModal('rejectionModal');
    });

    document.getElementById('cancelRejectBtn')?.addEventListener('click', () => {
        closeModal('rejectionModal');
    });

    document.getElementById('confirmRejectBtn')?.addEventListener('click', () => {
        rejectRequest();
    });

    // View Details Modal
    document.getElementById('closeViewDetailsModal')?.addEventListener('click', () => {
        closeModal('viewDetailsModal');
    });

    // PDF Upload
    const pdfUploadArea = document.getElementById('pdfUploadArea');
    const schedulePDF = document.getElementById('schedulePDF');

    pdfUploadArea?.addEventListener('click', () => {
        schedulePDF?.click();
    });

    schedulePDF?.addEventListener('change', (e) => {
        handlePDFUpload(e.target.files[0]);
    });

    document.getElementById('removePDF')?.addEventListener('click', () => {
        document.getElementById('schedulePDF').value = '';
        document.getElementById('pdfPreview').style.display = 'none';
        document.getElementById('pdfUploadArea').style.display = 'block';
    });

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
}

function openApprovalModal(requestId) {
    currentRequestId = requestId;
    const request = studentRequests.find(r => String(r.id) === String(requestId));
    if (!request) return;

    // Populate modal with all student form data
    document.getElementById('modalStudentName').textContent = request.studentName;
    document.getElementById('modalStudentId').textContent = request.studentId;
    document.getElementById('modalStudentAge').textContent = request.age ? `${request.age} years` : '-';
    document.getElementById('modalStudentHeight').textContent = request.height ? `${request.height} cm` : '-';
    document.getElementById('modalStudentWeight').textContent = request.weight ? `${request.weight} kg` : '-';
    document.getElementById('modalStudentFitness').textContent = request.fitnessLevel || '-';
    document.getElementById('modalStudentGoal').textContent = request.trainingGoal || '-';
    document.getElementById('modalStudentInjury').textContent = request.injuryHistory || 'None';
    document.getElementById('modalPreferredDate').textContent = formatDate(request.preferredDate);
    document.getElementById('modalPreferredTime').textContent = request.preferredTime;
    document.getElementById('modalPreferredCoach').textContent = request.preferredCoach || '-';
    document.getElementById('modalStudentNotes').textContent = request.notes || 'No additional notes';
    document.getElementById('approvalComment').value = '';
    document.getElementById('schedulePDF').value = '';
    document.getElementById('pdfPreview').style.display = 'none';
    document.getElementById('pdfUploadArea').style.display = 'block';

    // Reset Exercise Selection State
    selectedExercises = [];
    activeExerciseCategory = "Upper Body";
    renderExerciseTabs();
    renderExercises();
    renderSelectedExerciseTags();

    // Check slot availability
    const slotInfo = getSlotAvailability(request.preferredDate, request.preferredTime);
    const availabilityEl = document.getElementById('slotAvailabilityInfo');
    if (availabilityEl) {
        availabilityEl.className = `availability-info ${slotInfo.class}`;
        availabilityEl.innerHTML = `
            <i class="fas fa-${slotInfo.icon}"></i>
            <span>${slotInfo.text} - ${slotInfo.class === 'full' ? 'Cannot approve. Slot is full!' : 'Slot available for approval'}</span>
        `;
    }

    document.getElementById('approvalModal').classList.add('show');
}

function openRejectionModal(requestId) {
    currentRequestId = requestId;
    const request = studentRequests.find(r => String(r.id) === String(requestId));
    if (!request) return;

    // Populate modal with all student form data
    document.getElementById('rejectModalStudentName').textContent = request.studentName;
    document.getElementById('rejectModalStudentId').textContent = request.studentId;
    document.getElementById('rejectModalStudentAge').textContent = request.age ? `${request.age} years` : '-';
    document.getElementById('rejectModalStudentHeight').textContent = request.height ? `${request.height} cm` : '-';
    document.getElementById('rejectModalStudentWeight').textContent = request.weight ? `${request.weight} kg` : '-';
    document.getElementById('rejectModalStudentFitness').textContent = request.fitnessLevel || '-';
    document.getElementById('rejectModalStudentGoal').textContent = request.trainingGoal || '-';
    document.getElementById('rejectModalStudentInjury').textContent = request.injuryHistory || 'None';
    document.getElementById('rejectModalPreferredDate').textContent = formatDate(request.preferredDate);
    document.getElementById('rejectModalPreferredTime').textContent = request.preferredTime;
    document.getElementById('rejectModalPreferredCoach').textContent = request.preferredCoach || '-';
    document.getElementById('rejectModalStudentNotes').textContent = request.notes || 'No additional notes';
    document.getElementById('rejectionComment').value = '';

    document.getElementById('rejectionModal').classList.add('show');
}

async function viewRequestDetails(requestId) {
    const request = studentRequests.find(r => String(r.id) === String(requestId));
    if (!request) return;

    // Populate modal with all student form data
    document.getElementById('viewModalStudentName').textContent = request.studentName;
    document.getElementById('viewModalStudentId').textContent = request.studentId;
    document.getElementById('viewModalStudentAge').textContent = request.age ? `${request.age} years` : '-';
    document.getElementById('viewModalStudentHeight').textContent = request.height ? `${request.height} cm` : '-';
    document.getElementById('viewModalStudentWeight').textContent = request.weight ? `${request.weight} kg` : '-';
    document.getElementById('viewModalStudentFitness').textContent = request.fitnessLevel || '-';
    document.getElementById('viewModalStudentGoal').textContent = request.trainingGoal || '-';
    document.getElementById('viewModalStudentInjury').textContent = request.injuryHistory || 'None';
    document.getElementById('viewModalPreferredDate').textContent = formatDate(request.preferredDate);
    document.getElementById('viewModalPreferredTime').textContent = request.preferredTime;
    document.getElementById('viewModalPreferredCoach').textContent = request.preferredCoach || '-';
    document.getElementById('viewModalStudentNotes').textContent = request.notes || 'No additional notes';

    const commentSection = document.getElementById('viewModalCommentSection');
    const pdfSection = document.getElementById('viewModalPDFSection');
    const exercisesSection = document.getElementById('viewModalExercisesSection');
    
    if (request.coachComment) {
        document.getElementById('viewModalComment').textContent = request.coachComment;
        commentSection.style.display = 'block';
    } else {
        commentSection.style.display = 'none';
    }

    if (request.schedulePdf) {
        document.getElementById('viewModalPDFLink').href = request.schedulePdf;
        pdfSection.style.display = 'block';
    } else {
        pdfSection.style.display = 'none';
    }

    if (request.assignedExercises && request.assignedExercises.length > 0) {
        const exercisesContainer = document.getElementById('viewModalExercises');
        if (exercisesContainer) {
            exercisesContainer.innerHTML = request.assignedExercises.map(ex => {
                const name = typeof ex === 'string' ? ex : ex.name;
                const setsReps = typeof ex === 'object' && ex.setsReps ? ex.setsReps :
                                 (typeof ex === 'object' && ex.sets ? `${ex.sets} sets x ${ex.reps || ''}` : '');
                return `
                    <span class="selected-exercise-badge" style="cursor: default; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas fa-dumbbell text-blue"></i>
                        <span>${name}</span>
                        ${setsReps ? `<strong style="color: var(--orange); margin-left: 4px; font-size: 0.75rem; background: rgba(234,88,12,0.1); padding: 2px 6px; border-radius: 8px;">${setsReps}</strong>` : ''}
                    </span>
                `;
            }).join('');
        }
        if (exercisesSection) exercisesSection.style.display = 'block';
    } else {
        if (exercisesSection) exercisesSection.style.display = 'none';
    }

    const progressSection = document.getElementById('viewModalProgressSection');
    const progressContainer = document.getElementById('viewModalProgress');
    if (progressSection && progressContainer) {
        progressSection.style.display = 'none';
        progressContainer.innerHTML = '';

        if (request.status === 'approved' && (request.studentRegNo || request.studentId)) {
            const studentIdToFetch = request.studentRegNo || request.studentId;
            let progressData = null;

            const endpoints = [
                `/api/coach/student-progress/${studentIdToFetch}`,
                `http://localhost:5000/api/coach/student-progress/${studentIdToFetch}`,
                `http://127.0.0.1:5000/api/coach/student-progress/${studentIdToFetch}`
            ];

            const token = getUniXsportToken();
            for (const ep of endpoints) {
                try {
                    const res = await fetch(ep, {
                        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                    });
                    if (res.ok) {
                        const parsed = await res.json();
                        if (parsed.success && parsed.plan && parsed.plan.exercises && parsed.plan.exercises.length > 0) {
                            progressData = parsed.plan.exercises;
                            break;
                        }
                    }
                } catch (err) {}
            }

            if (progressData && progressData.length > 0) {
                progressSection.style.display = 'block';
                progressContainer.innerHTML = progressData.map(ex => {
                    const color = ex.completed ? 'var(--green-600)' : 'var(--gray-500)';
                    const bg = ex.completed ? 'rgba(22,163,74,0.1)' : 'rgba(100,116,139,0.1)';
                    const border = ex.completed ? '1px solid var(--green-200)' : '1px solid var(--gray-200)';
                    return `
                        <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 500; color: ${color}; background: ${bg}; border: ${border};">
                            <i class="fas fa-check-circle"></i> ${ex.name}
                        </span>
                    `;
                }).join('');
            }
        }
    }

    // Modal action buttons for pending requests
    const actionsEl = document.getElementById('viewModalActions');
    if (actionsEl) {
        if (request.status === 'pending') {
            actionsEl.style.display = 'flex';
            document.getElementById('viewModalApproveBtn').onclick = () => {
                closeModal('viewDetailsModal');
                openApprovalModal(requestId);
            };
            document.getElementById('viewModalRejectBtn').onclick = () => {
                closeModal('viewDetailsModal');
                openRejectionModal(requestId);
            };
        } else {
            actionsEl.style.display = 'none';
        }
    }

    document.getElementById('viewDetailsModal').classList.add('show');
}

function handlePDFUpload(file) {
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('Please upload a PDF file only.', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB.', 'error');
        return;
    }

    document.getElementById('pdfFileName').textContent = file.name;
    document.getElementById('pdfPreview').style.display = 'flex';
    document.getElementById('pdfUploadArea').style.display = 'none';
}

async function approveRequest() {
    const request = studentRequests.find(r => String(r.id) === String(currentRequestId));
    if (!request) return;

    const comment = document.getElementById('approvalComment').value.trim();
    const pdfFile = document.getElementById('schedulePDF').files[0];
    const confirmBtn = document.getElementById('confirmApproveBtn');

    if (!comment) {
        showToast('Please provide a coach comment.', 'error');
        return;
    }

    if (selectedExercises.length === 0) {
        showToast('Please assign at least one exercise to the student.', 'error');
        return;
    }

    // Check slot availability
    const slotInfo = getSlotAvailability(request.preferredDate, request.preferredTime);
    if (slotInfo.class === 'full') {
        showToast('Cannot approve: This time slot is full (30/30 students). Please suggest an alternative slot.', 'error');
        return;
    }

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving...';
    }

    try {
        const formData = new FormData();
        formData.append('requestId', String(request.id));
        formData.append('coachNotes', comment);
        formData.append('comment', comment);
        formData.append('weeklyExercises', JSON.stringify(selectedExercises));
        if (pdfFile) {
            formData.append('schedulePdf', pdfFile);
        }

        const endpoints = [
            '/api/coach/approve-request',
            'http://localhost:5000/api/coach/approve-request',
            'http://127.0.0.1:5000/api/coach/approve-request'
        ];

        for (const ep of endpoints) {
            try {
                const token = getUniXsportToken();
                const res = await fetch(ep, {
                    method: 'POST',
                    headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                    body: formData
                });
                if (res.ok) {
                    break;
                }
            } catch (e) {}
        }

        await loadRequestsDatabase();

        showToast('✓ Request approved successfully in database! Workout program assigned.', 'success');
        closeModal('approvalModal');
        renderPendingRequests();
        renderHistory();
        initDashboard();
        updatePendingBadge();
    } catch (err) {
        console.error('Approve error:', err);
        showToast('Failed to approve request. Please try again.', 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Approve & Issue Schedule';
        }
    }
}

async function rejectRequest() {
    const request = studentRequests.find(r => String(r.id) === String(currentRequestId));
    if (!request) return;

    const comment = document.getElementById('rejectionComment').value.trim();
    const rejectBtn = document.getElementById('confirmRejectBtn');

    if (!comment) {
        showToast('Please provide a rejection reason.', 'error');
        return;
    }

    if (rejectBtn) {
        rejectBtn.disabled = true;
        rejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rejecting...';
    }

    try {
        const payload = {
            requestId: request.id,
            rejectionReason: comment,
            comment: comment
        };

        const endpoints = [
            '/api/coach/reject-request',
            'http://localhost:5000/api/coach/reject-request',
            'http://127.0.0.1:5000/api/coach/reject-request'
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
                if (res.ok) {
                    break;
                }
            } catch (e) {}
        }

        await loadRequestsDatabase();

        showToast('✓ Request rejected and updated in database.', 'info');
        closeModal('rejectionModal');
        renderPendingRequests();
        renderHistory();
        initDashboard();
        updatePendingBadge();
    } catch (err) {
        console.error('Reject error:', err);
        showToast('Failed to reject request. Please try again.', 'error');
    } finally {
        if (rejectBtn) {
            rejectBtn.disabled = false;
            rejectBtn.innerHTML = '<i class="fas fa-times"></i> Reject Request';
        }
    }
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('show');
    currentRequestId = null;
}

function updatePendingBadge() {
    // IMPORTANT: Only count pending requests for current coach
    const pending = filterByCurrentCoach(studentRequests).filter(r => r.status === 'pending').length;
    const badge = document.getElementById('pendingBadge');
    if (badge) {
        badge.textContent = pending;
        badge.style.display = pending > 0 ? 'inline-flex' : 'none';
    }
}

// ========== Utility Functions ==========
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch(e) {
        return dateString;
    }
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '-';
    try {
        const d = new Date(dateTimeString);
        if (!isNaN(d.getTime())) {
            const datePart = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const timePart = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            return `${datePart} ${timePart}`;
        }
        if (dateTimeString.includes(' ')) {
            const [date, time] = dateTimeString.split(' ');
            return `${formatDate(date)} ${(time || '').substring(0, 5)}`;
        }
        return dateTimeString;
    } catch (e) {
        return dateTimeString;
    }
}

// Expose functions globally for onclick handlers & dynamic scripts
window.viewRequestDetails = viewRequestDetails;
window.openApprovalModal = openApprovalModal;
window.openRejectionModal = openRejectionModal;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;
window.closeModal = closeModal;
window.handlePDFUpload = handlePDFUpload;
window.renderPendingRequests = renderPendingRequests;
window.initPendingRequests = initPendingRequests;

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
    };    toast.querySelector('.toast-close').addEventListener('click', closeToast);
    setTimeout(closeToast, 4000);
}

// ========== Exercise Selector Render Functions ==========
function initExerciseSelector() {
    renderExerciseTabs();
    renderExercises();
    renderSelectedExerciseTags();
}

function renderExerciseTabs() {
    const tabsContainer = document.getElementById('exerciseCategoryTabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = Object.keys(exerciseProgramCategories).map(cat => `
        <button type="button" class="exercise-category-tab ${cat === activeExerciseCategory ? 'active' : ''}" data-category="${cat}">
            ${cat}
        </button>
    `).join('');

    tabsContainer.querySelectorAll('.exercise-category-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabsContainer.querySelectorAll('.exercise-category-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeExerciseCategory = tab.dataset.category;
            renderExercises();
        });
    });
}

function getDefaultExerciseParams(name, category) {
    const cat = category || activeExerciseCategory || "Upper Body";
    if (cat === 'Cardio') {
        if (name === 'Jump Rope' || name === 'Burpees' || name === 'Jumping Jacks' || name === 'High Knees') {
            return { sets: 3, reps: '1 min', setsReps: '3 sets x 1 min' };
        }
        return { sets: 1, reps: '20-30 mins', setsReps: '20-30 mins' };
    }
    if (cat === 'Flexibility & Mobility') {
        return { sets: 3, reps: '30s hold', setsReps: '3 sets x 30s hold' };
    }
    if (cat === 'Core (Abs)') {
        if (name === 'Plank' || name === 'Side Plank') {
            return { sets: 3, reps: '45 sec', setsReps: '3 sets x 45 sec' };
        }
        return { sets: 3, reps: '15 reps', setsReps: '3 sets x 15 reps' };
    }
    if (cat === 'Power & Explosive Training') {
        return { sets: 4, reps: '5 reps', setsReps: '4 sets x 5 reps' };
    }
    if (cat === 'Strength Training') {
        return { sets: 4, reps: '6-8 reps', setsReps: '4 sets x 6-8 reps' };
    }
    // Default for Upper / Lower body routines
    return { sets: 3, reps: '8-10 reps', setsReps: '3 sets x 8-10 reps' };
}

function renderExercises() {
    const gridContainer = document.getElementById('exerciseGrid');
    if (!gridContainer) return;

    const exercises = exerciseProgramCategories[activeExerciseCategory] || [];
    gridContainer.innerHTML = exercises.map(ex => {
        const isSelected = selectedExercises.some(item => (typeof item === 'string' ? item : item.name) === ex);
        return `
            <button type="button" class="exercise-tag-btn ${isSelected ? 'selected' : ''}" data-exercise="${ex}">
                <span>${ex}</span>
                <i class="fas fa-check"></i>
            </button>
        `;
    }).join('');

    gridContainer.querySelectorAll('.exercise-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const ex = btn.dataset.exercise;
            const index = selectedExercises.findIndex(item => (typeof item === 'string' ? item : item.name) === ex);
            if (index > -1) {
                selectedExercises.splice(index, 1);
                btn.classList.remove('selected');
            } else {
                const defaultParams = getDefaultExerciseParams(ex, activeExerciseCategory);
                selectedExercises.push({
                    name: ex,
                    category: activeExerciseCategory,
                    ...defaultParams
                });
                btn.classList.add('selected');
            }
            renderSelectedExerciseTags();
        });
    });
}

function renderSelectedExerciseTags() {
    const summaryContainer = document.getElementById('selectedExercisesContainer');
    const tagsContainer = document.getElementById('selectedExercisesTags');
    const badgeCount = document.getElementById('selectedCountBadge');
    if (!summaryContainer || !tagsContainer) return;

    if (selectedExercises.length === 0) {
        summaryContainer.style.display = 'none';
        if (badgeCount) badgeCount.textContent = '0 selected';
        return;
    }

    summaryContainer.style.display = 'block';
    if (badgeCount) badgeCount.textContent = `${selectedExercises.length} selected`;

    tagsContainer.innerHTML = selectedExercises.map((item, idx) => {
        const name = typeof item === 'string' ? item : item.name;
        const cat = typeof item === 'object' && item.category ? item.category : (activeExerciseCategory || 'Exercise');
        const sets = typeof item === 'object' && item.sets !== undefined ? item.sets : 3;
        const reps = typeof item === 'object' && item.reps !== undefined ? item.reps : '8-10 reps';

        return `
            <div class="selected-exercise-row" data-index="${idx}">
                <div class="selected-exercise-info">
                    <span class="selected-exercise-name"><i class="fas fa-dumbbell text-blue" style="margin-right: 6px;"></i>${name}</span>
                    <span class="selected-exercise-cat">${cat}</span>
                </div>
                <div class="selected-exercise-inputs">
                    <div class="exercise-input-group">
                        <label>Sets:</label>
                        <input type="number" min="1" max="20" class="exercise-param-input exercise-sets-input" value="${sets}" data-index="${idx}" title="Number of Sets">
                    </div>
                    <div class="exercise-input-group">
                        <label>Reps:</label>
                        <input type="text" class="exercise-param-input exercise-reps-input" value="${reps}" placeholder="e.g. 8 reps / 45s" data-index="${idx}" title="Target Reps / Time">
                    </div>
                    <button type="button" class="btn-remove-exercise" data-name="${name}" title="Remove exercise" aria-label="Remove">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Bind change listeners to live update selectedExercises
    tagsContainer.querySelectorAll('.exercise-sets-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (selectedExercises[idx]) {
                const s = parseInt(e.target.value, 10) || 1;
                selectedExercises[idx].sets = s;
                selectedExercises[idx].setsReps = `${s} sets x ${selectedExercises[idx].reps || 'reps'}`;
            }
        });
    });

    tagsContainer.querySelectorAll('.exercise-reps-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (selectedExercises[idx]) {
                const r = e.target.value.trim();
                selectedExercises[idx].reps = r;
                selectedExercises[idx].setsReps = `${selectedExercises[idx].sets || 3} sets x ${r}`;
            }
        });
    });

    tagsContainer.querySelectorAll('.btn-remove-exercise').forEach(btn => {
        btn.addEventListener('click', () => {
            const nameToRemove = btn.dataset.name;
            selectedExercises = selectedExercises.filter(item => (typeof item === 'string' ? item : item.name) !== nameToRemove);
            renderSelectedExerciseTags();
            renderExercises();
        });
    });
}// ========== Coach Notices & Broadcast Functions ==========
async function fetchCoachNotices() {
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
                        notices = data.notices;
                        break;
                    }
                }
            } catch(e) {}
        }
    } catch(err) {
        console.warn('Failed to fetch coach notices:', err);
    }
    renderNoticesList();
    renderCoachHeaderNotifications();
}

function dismissCoachNotice(noticeId, event) {
    if (event) event.stopPropagation();
    try {
        let dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_coach') || '[]');
        if (!dismissed.includes(String(noticeId))) {
            dismissed.push(String(noticeId));
            localStorage.setItem('unixsport_dismissed_notices_coach', JSON.stringify(dismissed));
        }
    } catch(e) {}
    renderCoachHeaderNotifications();
}
window.dismissCoachNotice = dismissCoachNotice;

function renderCoachHeaderNotifications() {
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');
    if (!panel) return;

    let dismissed = [];
    try {
        dismissed = JSON.parse(localStorage.getItem('unixsport_dismissed_notices_coach') || '[]');
    } catch(e) {}

    const activeNotices = (notices || []).filter(n => !dismissed.includes(String(n.id)));

    if (!activeNotices || activeNotices.length === 0) {
        panel.innerHTML = `
            <h4>Notifications &amp; Broadcasts</h4>
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

    const lastRead = parseInt(localStorage.getItem('unixsport_notices_last_read_coach') || '0', 10);
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
        <h4>Notifications &amp; Broadcasts (${activeNotices.length})</h4>
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
                            <span style="font-size: 0.75rem; color: var(--gray-400); display: block; overflow-wrap: anywhere; word-break: break-word;">${n.createdBy || 'Staff'} • ${formatDateTime(n.createdAt)}</span>
                        </div>
                    </div>
                    <button type="button" class="btn-close-notice" onclick="dismissCoachNotice('${n.id}', event)" style="background: transparent; border: none; color: var(--gray-400); cursor: pointer; padding: 2px 4px; border-radius: 4px; font-size: 0.85rem; line-height: 1; flex-shrink: 0; transition: color 0.2s;" title="Dismiss" aria-label="Dismiss">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('')}
    `;
}

function initNotifications() {
    const btn = document.getElementById('notificationBtn');
    const panel = document.getElementById('notificationPanel');
    const badge = document.getElementById('notificationBadge');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = !panel?.classList.contains('show');
        panel?.classList.toggle('show');

        if (willOpen) {
            localStorage.setItem('unixsport_notices_last_read_coach', Date.now().toString());
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

    renderCoachHeaderNotifications();
}

function initNotices() {
    document.getElementById('createNoticeBtn')?.addEventListener('click', () => {
        const formCard = document.getElementById('noticeFormCard');
        if (formCard) {
            formCard.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('noticeTitle')?.focus();
        }
    });

    document.getElementById('noticeForm')?.addEventListener('submit', async (e) => {
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
            let res = null;
            if (window.UniXsportAPI && typeof window.UniXsportAPI.createNotice === 'function') {
                res = await window.UniXsportAPI.createNotice({ title, message, visibleTo, priority });
            } else {
                const token = getUniXsportToken();
                const response = await fetch('/api/notices', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ title, message, visibleTo, priority })
                });
                res = await response.json();
            }

            if (res && res.notice) {
                notices.unshift(res.notice);
            }
            showToast('Notice published successfully to database!', 'success');
            e.target.reset();
            localStorage.setItem('unixsport_notices', JSON.stringify(notices));
            await fetchCoachNotices();
            renderNoticesList();
            renderCoachHeaderNotifications();
        } catch (err) {
            showToast(err.message || 'Failed to publish notice', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    // Close Delete Modal listeners
    document.getElementById('closeDeleteModal')?.addEventListener('click', () => {
        document.getElementById('deleteModal')?.classList.remove('show');
    });
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
        document.getElementById('deleteModal')?.classList.remove('show');
    });

    fetchCoachNotices();
}

function renderNoticesList() {
    const container = document.getElementById('noticesList');
    if (!container) return;

    if (!notices || notices.length === 0) {
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
            <div class="notice-card-meta">By ${n.createdBy || 'Staff'}</div>
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

    const modal = document.getElementById('deleteModal');
    const titleEl = document.getElementById('deleteModalTitle');
    const msgEl = document.getElementById('deleteModalMessage');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    if (titleEl) titleEl.textContent = 'Delete Notice';
    if (msgEl) msgEl.textContent = `Are you sure you want to delete notice "${notice.title}"?`;
    
    if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
        confirmBtn.className = 'btn btn-danger';
        
        confirmBtn.onclick = async () => {
            try {
                if (window.UniXsportAPI && typeof window.UniXsportAPI.deleteNotice === 'function') {
                    await window.UniXsportAPI.deleteNotice(id);
                } else {
                    const token = getUniXsportToken();
                    await fetch(`/api/notices/${id}`, {
                        method: 'DELETE',
                        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
                    });
                }
                notices = notices.filter(n => String(n.id) !== String(id));
                localStorage.setItem('unixsport_notices', JSON.stringify(notices));
                showToast('Notice deleted successfully from database!', 'success');
            } catch (err) {
                notices = notices.filter(n => String(n.id) !== String(id));
                localStorage.setItem('unixsport_notices', JSON.stringify(notices));
                showToast('Notice removed.', 'info');
            }
            if (modal) modal.classList.remove('show');
            await fetchCoachNotices();
            renderNoticesList();
            renderCoachHeaderNotifications();
        };
    }

    if (modal) modal.classList.add('show');
}

function formatVisibleTo(visibleTo, notice) {
    if (visibleTo === 'specific_user' || (notice && notice.targetUserId)) {
        const targetName = notice && notice.targetUserName ? notice.targetUserName : (notice && notice.targetUserId ? notice.targetUserId : 'Selected User');
        return `To: ${targetName}`;
    }
    if (!visibleTo || visibleTo === 'all') return 'All Users';
    if (visibleTo === 'students') return 'Students Only';
    if (visibleTo === 'coaches') return 'Coaches Only';
    if (visibleTo === 'storekeepers') return 'Storekeepers (Inventory) Only';
    if (visibleTo === 'admins') return 'Admins Only';
    return visibleTo;
}

function formatDateTime(str) {
    if (!str) return '';
    try {
        const d = new Date(str);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return str;
    }
}

window.deleteNotice = deleteNotice;
window.renderNoticesList = renderNoticesList;
window.renderCoachHeaderNotifications = renderCoachHeaderNotifications;
window.initNotices = initNotices;
window.initNotifications = initNotifications;
