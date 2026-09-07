document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const role = params.get('role') || 'student';

    const requestArea = document.getElementById('requestArea');
    const verifyArea = document.getElementById('verifyArea');
    const setArea = document.getElementById('setArea');

    const requestForm = document.getElementById('requestResetForm');
    const verifyForm = document.getElementById('verifyCodeForm');
    const setForm = document.getElementById('setPasswordForm');

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

    // Helper to trigger card shake animation
    function shakeCard() {
        const card = document.querySelector('.reset-card');
        if (card) {
            card.classList.remove('shake-animation');
            void card.offsetWidth; // Force reflow
            card.classList.add('shake-animation');
            setTimeout(() => card.classList.remove('shake-animation'), 600);
        }
    }

    // ========== 1. Email Submission Flow ==========
    requestForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            showToast('Please enter a valid email address', 'error');
            shakeCard();
            return;
        }

        // Generate a random 6-character code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing characters like O, 0, I, 1
        let generatedCode = '';
        for (let i = 0; i < 6; i++) {
            generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // Store the code in sessionStorage for verification
        sessionStorage.setItem('resetCode', generatedCode);
        sessionStorage.setItem('resetEmail', email);

        // Show simulated email popup notification
        showSimulatedEmail(email, generatedCode);

        // Transition to Verification screen
        requestArea.style.display = 'none';
        verifyArea.style.display = 'block';
        showToast('Verification code sent! Check your simulated inbox.', 'success');
    });

    // ========== 2. Code Verification Flow ==========
    verifyForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const enteredCode = document.getElementById('verificationCode').value.trim().toUpperCase();
        const expectedCode = sessionStorage.getItem('resetCode');

        if (!enteredCode) {
            showToast('Please enter the verification code', 'error');
            shakeCard();
            return;
        }

        if (enteredCode !== expectedCode) {
            showToast('Incorrect verification code. Please check your simulated email inbox popup.', 'error');
            shakeCard();
            return;
        }

        // Transition to Password Set screen
        verifyArea.style.display = 'none';
        setArea.style.display = 'block';
        showToast('Code verified! Enter your new password.', 'success');
    });

    // Handle Resend Code
    const resendBtn = document.getElementById('resendCodeBtn');
    resendBtn?.addEventListener('click', () => {
        const email = sessionStorage.getItem('resetEmail') || 'your-email@example.com';
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let generatedCode = '';
        for (let i = 0; i < 6; i++) {
            generatedCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        sessionStorage.setItem('resetCode', generatedCode);
        showSimulatedEmail(email, generatedCode);
        showToast('A new code has been simulated and sent!', 'success');
    });

    // ========== 3. Password Reset Submission ==========
    setForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = document.getElementById('newPassword').value.trim();
        const p2 = document.getElementById('confirmPassword').value.trim();
        const email = sessionStorage.getItem('resetEmail');

        if (p1.length < 6) {
            showToast('Password must be at least 6 characters long', 'error');
            shakeCard();
            return;
        }
        if (p1 !== p2) {
            showToast('Passwords do not match', 'error');
            shakeCard();
            return;
        }

        const submitBtn = setForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        }

        try {
            if (email) {
                await window.UniXsportAPI.resetPassword(email, p1);
            }
            // Cleanup session keys
            sessionStorage.removeItem('resetCode');
            sessionStorage.removeItem('resetEmail');

            showToast('Password updated successfully! Redirecting to login...', 'success');
            
            setTimeout(() => {
                window.location.href = `login.html?role=${encodeURIComponent(role)}`;
            }, 1200);
        } catch (err) {
            showToast(err.message || 'Failed to update password. Please try again.', 'error');
            shakeCard();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save New Password';
            }
        }
    });

    // ========== Simulated Email Card Generator ==========
    function showSimulatedEmail(email, code) {
        // Clear any previous notification popup
        const oldPopup = document.querySelector('.simulated-email-popup');
        oldPopup?.remove();

        const popup = document.createElement('div');
        popup.className = 'simulated-email-popup';
        popup.innerHTML = `
            <div class="simulated-email-header">
                <span class="simulated-email-title"><i class="fas fa-satellite-dish"></i> RUSL Mail Server</span>
                <button class="simulated-email-close" aria-label="Close Notification">&times;</button>
            </div>
            <div class="simulated-email-body">
                <p><strong>To:</strong> ${email}</p>
                <p><strong>Subject:</strong> UniXsport Verification Key</p>
                <p>A request was received to reset your sports portal password. Use this 6-character code to advance:</p>
                <div class="simulated-email-code-box">${code}</div>
            </div>
        `;

        document.body.appendChild(popup);

        // Slide in
        setTimeout(() => popup.classList.add('show'), 150);

        // Bind close button click
        popup.querySelector('.simulated-email-close').addEventListener('click', () => {
            popup.classList.remove('show');
            setTimeout(() => popup.remove(), 400);
        });
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
