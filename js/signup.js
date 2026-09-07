document.addEventListener('DOMContentLoaded', () => {
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

    // ========== Form Validation & Submission ==========
    const form = document.getElementById('signupForm');
    const signupCard = document.querySelector('.signup-card');

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fullName = document.getElementById('fullName').value.trim();
        const regNo = document.getElementById('regNo').value.trim().toUpperCase();
        const faculty = document.getElementById('faculty').value;
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Check required fields
        if (!fullName) {
            showToast('Please enter your full name.', 'error');
            shakeCard();
            return;
        }

        if (!regNo || regNo.length < 3) {
            showToast('Please enter a valid Registration Number.', 'error');
            shakeCard();
            return;
        }

        if (!faculty) {
            showToast('Please select your faculty.', 'error');
            shakeCard();
            return;
        }

        // Validate Email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showToast('Please enter a valid email address.', 'error');
            shakeCard();
            return;
        }

        // Check password length
        if (!password || password.length < 6) {
            showToast('Password must be at least 6 characters long.', 'error');
            shakeCard();
            return;
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            showToast('Passwords do not match. Please verify.', 'error');
            shakeCard();
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'Create Profile';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';
        }

        try {
            const apiRes = await window.UniXsportAPI.register({
                name: fullName,
                regNo: regNo,
                department: faculty,
                email: email,
                password: password
            });

            if (apiRes && apiRes.success) {
                showToast('Registration successful! Redirecting to sign in page...', 'success');
                setTimeout(() => {
                    window.location.href = `login.html?role=student&registered=${encodeURIComponent(regNo)}`;
                }, 1200);
            } else {
                throw new Error(apiRes.error || 'Registration failed');
            }
        } catch (err) {
            showToast(err.message || 'Registration failed. Please check your details.', 'error');
            shakeCard();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    });

    function shakeCard() {
        if (signupCard) {
            signupCard.classList.remove('shake-animation');
            void signupCard.offsetWidth; // Force layout reflow
            signupCard.classList.add('shake-animation');
            setTimeout(() => signupCard.classList.remove('shake-animation'), 600);
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
        <button class="toast-close" aria-label="Close toast">&times;</button>
    `;

    container.appendChild(toast);

    // Trigger animate entrance
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    const closeToast = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    };

    toast.querySelector('.toast-close').addEventListener('click', closeToast);
    setTimeout(closeToast, 4000);
}
