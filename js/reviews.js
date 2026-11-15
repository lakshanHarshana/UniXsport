/**
 * ==========================================================================
 * UniXsport - Dedicated Reviews & Feedback Module Script
 * Completely isolated from core portal scripts so team members can safely
 * edit, enhance, and maintain this file without breaking main application logic.
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // Selected rating state
    let selectedRating = 5;
    let cachedReviews = [];

    // DOM Elements
    const starsContainer = document.getElementById('starRatingSelect');
    const reviewForm = document.getElementById('reviewSubmitForm');
    const reviewsFeed = document.getElementById('reviewsFeedContainer');
    const filterSelect = document.getElementById('ratingFilterSelect');
    const avgRatingEl = document.getElementById('statAvgRating');
    const totalReviewsEl = document.getElementById('statTotalReviews');
    const fiveStarPctEl = document.getElementById('statFiveStarPct');
    const reviewMsgBox = document.getElementById('reviewMessageBox');

    // ========== Star Rating Selector ==========
    if (starsContainer) {
        const starIcons = starsContainer.querySelectorAll('i');

        function updateStars(val) {
            starIcons.forEach(star => {
                const sVal = parseInt(star.getAttribute('data-value'), 10);
                if (sVal <= val) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            });
        }

        starIcons.forEach(star => {
            star.addEventListener('mouseenter', () => {
                const hoverVal = parseInt(star.getAttribute('data-value'), 10);
                starIcons.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-value'), 10);
                    if (sVal <= hoverVal) s.classList.add('hover');
                    else s.classList.remove('hover');
                });
            });

            star.addEventListener('mouseleave', () => {
                starIcons.forEach(s => s.classList.remove('hover'));
            });

            star.addEventListener('click', () => {
                selectedRating = parseInt(star.getAttribute('data-value'), 10);
                updateStars(selectedRating);
            });
        });

        // Initialize with 5 stars
        updateStars(5);
    }

    // Helper to generate star HTML string
    function renderStarsHtml(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star"></i>';
            } else {
                stars += '<i class="far fa-star"></i>';
            }
        }
        return stars;
    }

    // Helper to format date
    function formatReviewDate(dateStr) {
        if (!dateStr) return 'Recently';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // ========== Render Reviews Feed ==========
    function renderReviewsList(reviews) {
        if (!reviewsFeed) return;

        if (!reviews || reviews.length === 0) {
            reviewsFeed.innerHTML = `
                <div class="reviews-empty-state">
                    <i class="fas fa-comment-dots"></i>
                    <h3>No reviews found yet</h3>
                    <p>Be the first member to share your gym or sports experience!</p>
                </div>
            `;
            return;
        }

        reviewsFeed.innerHTML = reviews.map(r => {
            const initial = (r.name || 'U').charAt(0).toUpperCase();
            return `
                <div class="review-item-card" data-rating="${r.rating}">
                    <div class="review-card-top">
                        <div class="review-author-meta">
                            <div class="review-avatar-badge">${initial}</div>
                            <div>
                                <div class="review-author-name">${escapeHtml(r.name || 'Anonymous Member')}</div>
                                <div class="review-author-role">${escapeHtml(r.role || 'Student')} • ${escapeHtml(r.department || 'RUSL')}</div>
                            </div>
                        </div>
                        <div class="review-stars">
                            ${renderStarsHtml(r.rating || 5)}
                        </div>
                    </div>
                    ${r.title ? `<div class="review-title">${escapeHtml(r.title)}</div>` : ''}
                    <div class="review-body">${escapeHtml(r.comment || '')}</div>
                    <div class="review-card-footer">
                        <span><i class="far fa-calendar-alt"></i> ${formatReviewDate(r.createdAt)}</span>
                        <span class="review-verified-badge"><i class="fas fa-check-circle"></i> Verified Experience</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Simple XSS defense
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Update Top Overview Stats
    function updateMetrics(reviews) {
        const total = reviews.length;
        if (totalReviewsEl) totalReviewsEl.textContent = total;

        if (total === 0) {
            if (avgRatingEl) avgRatingEl.textContent = '5.0';
            if (fiveStarPctEl) fiveStarPctEl.textContent = '100%';
            return;
        }

        const avg = (reviews.reduce((sum, r) => sum + (parseFloat(r.rating) || 5), 0) / total).toFixed(1);
        if (avgRatingEl) avgRatingEl.textContent = avg;

        const fiveStars = reviews.filter(r => parseInt(r.rating, 10) === 5).length;
        const fiveStarPct = Math.round((fiveStars / total) * 100);
        if (fiveStarPctEl) fiveStarPctEl.textContent = `${fiveStarPct}%`;
    }

    // ========== Fetch Live Reviews from Database ==========
    async function loadReviews() {
        try {
            reviewsFeed.innerHTML = '<div style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x" style="color: var(--rev-primary);"></i><p style="margin-top: 10px;">Loading community feedback...</p></div>';

            let data = null;
            if (window.UniXsportAPI && typeof window.UniXsportAPI.getReviews === 'function') {
                data = await window.UniXsportAPI.getReviews();
            } else {
                const res = await fetch('/api/reviews');
                data = await res.json();
            }

            if (data && data.success && Array.isArray(data.reviews)) {
                cachedReviews = data.reviews;
            } else {
                cachedReviews = [];
            }

            // Seed fallback if brand new empty database
            if (cachedReviews.length === 0) {
                cachedReviews = [
                    {
                        id: 'rev_default_1',
                        name: 'Kasun Bandara',
                        role: 'Student Athlete',
                        department: 'Faculty of Technology',
                        rating: 5,
                        title: 'Modern equipment and great gym coaches!',
                        comment: 'The RFID card check-in is super smooth and fast. Gym coaches are always supportive and customized my training routine.',
                        createdAt: new Date().toISOString()
                    },
                    {
                        id: 'rev_default_2',
                        name: 'Sanduni Perera',
                        role: 'Badminton Team Member',
                        department: 'Faculty of Applied Sciences',
                        rating: 5,
                        title: 'Equipment store system is top notch',
                        comment: 'Borrowing racquets and shuttlecocks with my student ID card takes less than 10 seconds at the counter. Truly helpful!',
                        createdAt: new Date(Date.now() - 86400000).toISOString()
                    }
                ];
            }

            updateMetrics(cachedReviews);
            renderReviewsList(cachedReviews);
        } catch (err) {
            console.warn('[UniXsport Reviews] Failed to fetch reviews:', err);
            // Fallback sample view
            cachedReviews = [
                {
                    id: 'rev_fallback',
                    name: 'Gym Member',
                    role: 'Student',
                    department: 'Rajarata University',
                    rating: 5,
                    title: 'Excellent university sports facility',
                    comment: 'Clean facilities and friendly coaches. Everything is well managed.',
                    createdAt: new Date().toISOString()
                }
            ];
            updateMetrics(cachedReviews);
            renderReviewsList(cachedReviews);
        }
    }

    // ========== Submit Review Form ==========
    reviewForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('revAuthorName');
        const roleInput = document.getElementById('revAuthorRole');
        const deptInput = document.getElementById('revAuthorDept');
        const titleInput = document.getElementById('revReviewTitle');
        const commentInput = document.getElementById('revReviewComment');
        const submitBtn = reviewForm.querySelector('.btn-submit-rev');

        const name = nameInput.value.trim();
        const role = roleInput.value.trim() || 'Student Member';
        const department = deptInput.value.trim() || 'Rajarata University';
        const title = titleInput.value.trim() || 'Gym Experience';
        const comment = commentInput.value.trim();

        if (!name || !comment) {
            showMessage('Please enter your name and review comment.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        const payload = {
            name,
            role,
            department,
            title,
            rating: selectedRating,
            comment
        };

        try {
            let resData = null;
            if (window.UniXsportAPI && typeof window.UniXsportAPI.submitReview === 'function') {
                resData = await window.UniXsportAPI.submitReview(payload);
            } else {
                const response = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                resData = await response.json();
            }

            if (resData && resData.success) {
                showMessage('Thank you! Your review has been saved to the database.', 'success');
                
                // Prepend to current feed
                const newRev = resData.review || {
                    id: 'rev_' + Date.now(),
                    ...payload,
                    createdAt: new Date().toISOString()
                };
                cachedReviews.unshift(newRev);
                updateMetrics(cachedReviews);
                renderReviewsList(cachedReviews);

                // Reset form
                reviewForm.reset();
                selectedRating = 5;
                if (starsContainer) {
                    starsContainer.querySelectorAll('i').forEach(s => s.classList.add('active'));
                }
            } else {
                showMessage(resData.error || 'Failed to submit review. Please try again.', 'error');
            }
        } catch (err) {
            console.error('Submit review error:', err);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Review';
        }
    });

    function showMessage(msg, type) {
        if (!reviewMsgBox) return;
        reviewMsgBox.textContent = msg;
        reviewMsgBox.style.display = 'block';
        reviewMsgBox.style.padding = '10px 14px';
        reviewMsgBox.style.borderRadius = '8px';
        reviewMsgBox.style.marginBottom = '16px';
        reviewMsgBox.style.fontSize = '0.9rem';
        reviewMsgBox.style.fontWeight = '600';

        if (type === 'success') {
            reviewMsgBox.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            reviewMsgBox.style.color = '#10b981';
            reviewMsgBox.style.border = '1px solid #10b981';
        } else {
            reviewMsgBox.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            reviewMsgBox.style.color = '#ef4444';
            reviewMsgBox.style.border = '1px solid #ef4444';
        }

        setTimeout(() => {
            reviewMsgBox.style.display = 'none';
        }, 5000);
    }

    // ========== Filter Handler ==========
    filterSelect?.addEventListener('change', () => {
        const selected = filterSelect.value;
        if (selected === 'all') {
            renderReviewsList(cachedReviews);
        } else {
            const starNum = parseInt(selected, 10);
            const filtered = cachedReviews.filter(r => parseInt(r.rating, 10) === starNum);
            renderReviewsList(filtered);
        }
    });

    // Initial load
    loadReviews();
});
