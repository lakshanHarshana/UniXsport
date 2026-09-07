document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role') || 'student';
    const loginRoleEl = document.getElementById('loginRole');
    const form = document.getElementById('loginForm');
    const backBtn = document.getElementById('backBtn');

    // Display formatted role name
    loginRoleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    // ========== Dark Mode Initialization ==========
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

    // Show signup link if student
    const signupPrompt = document.getElementById('signupPrompt');
    if (role === 'student' && signupPrompt) {
        signupPrompt.style.display = 'block';
    }

    // Pre-fill username if redirected from signup page
    const registeredUser = params.get('registered');
    if (registeredUser) {
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.value = registeredUser;
        }
        setTimeout(() => {
            showToast('Registration successful! Please sign in.', 'success');
        }, 300);
    }

    backBtn?.addEventListener('click', () => {
        window.location.href = 'home.html';
    });

    const forgotLink = document.getElementById('forgotLink');
    if (forgotLink) {
        forgotLink.href = `reset.html?role=${encodeURIComponent(role)}`;
    }

    // ========== Submit Login Handler ==========
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!username || !password) {
            showToast('Please enter your registration number/username and password', 'error');
            shakeCard();
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Sign In';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
        }

        try {
            const apiRes = await window.UniXsportAPI.login(username, password, role);
            if (apiRes && apiRes.success) {
                const normalizedRole = (apiRes.user.role || role || '').toLowerCase();
                const finalUserName = apiRes.user.regNo || apiRes.user.name;

                // 1. Tab-Isolated Session Storage (Each browser tab has its own independent login)
                if (apiRes.token) {
                    sessionStorage.setItem('token', apiRes.token);
                    sessionStorage.setItem('authToken', apiRes.token);
                    sessionStorage.setItem('unixsport_jwt_token', apiRes.token);
                    sessionStorage.setItem(`unixsport_token_${normalizedRole}`, apiRes.token);
                }
                sessionStorage.setItem('userRole', normalizedRole);
                sessionStorage.setItem('userName', finalUserName);
                sessionStorage.setItem('userRealName', apiRes.user.name || '');
                sessionStorage.setItem('userRegNo', apiRes.user.regNo || '');
                sessionStorage.setItem('userEmail', apiRes.user.email || '');
                sessionStorage.setItem('user_id', apiRes.user.user_id || apiRes.user.userId || '');
                sessionStorage.setItem('userId', apiRes.user.user_id || apiRes.user.userId || '');
                sessionStorage.setItem(`unixsport_user_${normalizedRole}`, JSON.stringify(apiRes.user));

                // 2. Role-Scoped LocalStorage (Persists for that specific role/portal)
                if (apiRes.token) {
                    localStorage.setItem(`unixsport_token_${normalizedRole}`, apiRes.token);
                    localStorage.setItem('token', apiRes.token);
                    localStorage.setItem('authToken', apiRes.token);
                    localStorage.setItem('unixsport_jwt_token', apiRes.token);
                }
                localStorage.setItem(`unixsport_user_${normalizedRole}`, JSON.stringify(apiRes.user));
                localStorage.setItem('userRole', normalizedRole);
                localStorage.setItem('userName', finalUserName);
                localStorage.setItem('userRealName', apiRes.user.name || '');
                localStorage.setItem('userRegNo', apiRes.user.regNo || '');
                localStorage.setItem('userEmail', apiRes.user.email || '');
                localStorage.setItem('userFaculty', apiRes.user.department || apiRes.user.faculty || 'Technology');
                localStorage.setItem('userDepartment', apiRes.user.department || apiRes.user.faculty || 'Technology');
                localStorage.setItem('user_id', apiRes.user.user_id || apiRes.user.userId || '');
                localStorage.setItem('userId', apiRes.user.user_id || apiRes.user.userId || '');

                const userPhoto = apiRes.user.profilePhoto || apiRes.user.profileImage || apiRes.user.avatarUrl || '';
                if (userPhoto) {
                    localStorage.setItem('unixsport_profile_photo_' + finalUserName.replace(/\//g, '_'), userPhoto);
                    if (apiRes.user.regNo) {
                        localStorage.setItem('unixsport_profile_photo_' + apiRes.user.regNo.replace(/\//g, '_'), userPhoto);
                    }
                }

                // If student, sync full profile object to profileKey
                if (normalizedRole === 'student') {
                    const profileKey = 'unixsport_profile_' + finalUserName.replace(/\//g, '_');
                    localStorage.setItem(profileKey, JSON.stringify(apiRes.user));
                    if (apiRes.user.regNo) {
                        localStorage.setItem('unixsport_profile_' + apiRes.user.regNo.replace(/\//g, '_'), JSON.stringify(apiRes.user));
                    }
                }

                showToast('Authentication successful! Redirecting...', 'success');

                const roleToFile = {
                    'student': 'student.html',
                    'coach': 'coach.html',
                    'admin': 'admin.html',
                    'storekeeper': 'storekeeper.html'
                };

                const userRole = (apiRes.user.role || role || 'student').toLowerCase();
                const target = roleToFile[userRole] || 'student.html';
                setTimeout(() => {
                    window.location.href = target;
                }, 800);
                return;
            } else {
                throw new Error(apiRes.error || 'Authentication failed');
            }
        } catch (apiErr) {
            showToast(apiErr.message || 'Invalid username or password. Please try again.', 'error');
            shakeCard();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    });

    function shakeCard() {
        const card = document.querySelector('.login-card');
        if (card) {
            card.classList.remove('shake-animation');
            void card.offsetWidth;
            card.classList.add('shake-animation');
            setTimeout(() => card.classList.remove('shake-animation'), 600);
        }
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
