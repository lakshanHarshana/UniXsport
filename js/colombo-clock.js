/**
 * UniXsport - Real-Time Time Synchronizer (Asia/Colombo 24h Time Only)
 * 
 * Format:
 * 15:44
 */

(function() {
    function getColomboTime() {
        const now = new Date();

        // 24-hour time HH:mm in Asia/Colombo
        const timeFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Colombo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        return timeFormatter.format(now);
    }

    function updateClockDisplay() {
        const timeStr = getColomboTime();

        const timeElements = document.querySelectorAll('.colombo-time, #colomboTime');
        timeElements.forEach(el => { el.textContent = timeStr; });
    }

    function injectClockWidget() {
        if (document.getElementById('colomboClockWidget')) {
            updateClockDisplay();
            return;
        }

        const navbarRight = document.querySelector('.top-navbar .navbar-right');
        if (!navbarRight) return;

        const widget = document.createElement('div');
        widget.id = 'colomboClockWidget';
        widget.className = 'colombo-clock-widget';
        widget.setAttribute('title', 'Asia/Colombo Time');

        widget.innerHTML = `
            <i class="fas fa-clock clock-icon"></i>
            <span class="colombo-time" id="colomboTime">--:--</span>
        `;

        // Prepend inside navbar-right before the dark mode toggle
        navbarRight.insertBefore(widget, navbarRight.firstChild);
        updateClockDisplay();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectClockWidget();
            updateClockDisplay();
        });
    } else {
        injectClockWidget();
        updateClockDisplay();
    }

    // Update every second
    setInterval(updateClockDisplay, 1000);

    window.getColomboTime = getColomboTime;
    window.updateColomboClock = updateClockDisplay;
})();
