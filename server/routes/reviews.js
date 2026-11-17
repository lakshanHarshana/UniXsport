const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db, saveDatabase } = require('../db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Simple in-memory rate limiter for review submissions
const submissionIpTracker = new Map();

/**
 * @route   GET /api/reviews
 * @desc    Fetch all approved student/coach/member reviews
 * @access  Public
 */
router.get('/', (req, res) => {
  try {
    const allReviews = db.reviews || [];
    
    // Only display reviews that are verified or approved
    const approvedReviews = allReviews.filter(r => r.verified === true || r.status === 'approved');
    
    // Sort newest first
    const sorted = [...approvedReviews].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Calculate rating statistics
    const total = sorted.length;
    const avgRating = total > 0 
      ? (sorted.reduce((sum, r) => sum + (parseFloat(r.rating) || 5), 0) / total).toFixed(1)
      : '5.0';

    res.json({
      success: true,
      count: total,
      averageRating: avgRating,
      reviews: sorted
    });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve reviews.' });
  }
});

/**
 * @route   POST /api/reviews
 * @desc    Submit a new review (Authenticated or Moderated Public)
 * @access  Public / Authenticated
 */
router.post('/', (req, res) => {
  try {
    // Rate Limiting: Max 1 submission per IP every 30 seconds
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const lastSub = submissionIpTracker.get(clientIp);
    const now = Date.now();
    if (lastSub && (now - lastSub) < 30000) {
      return res.status(429).json({
        success: false,
        error: 'Please wait a moment before submitting another review.'
      });
    }
    submissionIpTracker.set(clientIp, now);

    const { name, role, department, rating, comment, title } = req.body;

    // Check optional authenticated user context
    let authenticatedUser = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        authenticatedUser = jwt.verify(token, config.JWT_SECRET);
      } catch (e) {}
    }

    const cleanName = authenticatedUser ? authenticatedUser.name : (name || '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'Your name is required.' });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Review comment cannot be empty.' });
    }

    const numericRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const cleanRole = authenticatedUser 
      ? (authenticatedUser.role === 'coach' ? 'Gym Coach' : (authenticatedUser.role === 'admin' ? 'University Admin' : 'Student Member'))
      : (role || 'Student Member').trim();
    const cleanDept = (department || authenticatedUser?.department || 'Faculty of Technology').trim();
    const cleanComment = comment.trim();
    const cleanTitle = (title || 'Gym Experience Feedback').trim();

    if (!db.reviews) db.reviews = [];

    // Authenticated users get verified immediately; anonymous reviews undergo moderation
    const isVerified = !!authenticatedUser;

    const newReview = {
      id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: cleanName,
      role: cleanRole,
      department: cleanDept,
      rating: numericRating,
      title: cleanTitle,
      comment: cleanComment,
      verified: isVerified,
      status: isVerified ? 'approved' : 'pending_moderation',
      submittedBy: authenticatedUser ? (authenticatedUser.user_id || authenticatedUser.userId || authenticatedUser.regNo) : 'guest',
      createdAt: new Date().toISOString()
    };

    db.reviews.unshift(newReview);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: isVerified 
        ? 'Thank you! Your verified review has been published.' 
        : 'Thank you! Your review has been submitted and will appear once approved by the admin team.',
      review: newReview
    });
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ success: false, error: 'Failed to submit review.' });
  }
});

/**
 * @route   GET /api/reviews/admin/all
 * @desc    Get all reviews including pending moderation
 * @access  Admin
 */
router.get('/admin/all', authenticateToken, authorizeRoles('admin'), (req, res) => {
  res.json({
    success: true,
    reviews: db.reviews || []
  });
});

/**
 * @route   PATCH /api/reviews/admin/:id/approve
 * @desc    Approve a pending review
 * @access  Admin
 */
router.patch('/admin/:id/approve', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const rev = (db.reviews || []).find(r => String(r.id) === String(req.params.id));
  if (!rev) return res.status(404).json({ success: false, error: 'Review not found.' });
  rev.verified = true;
  rev.status = 'approved';
  rev.approvedAt = new Date().toISOString();
  saveDatabase();
  res.json({ success: true, message: 'Review approved and published.', review: rev });
});

/**
 * @route   DELETE /api/reviews/admin/:id
 * @desc    Delete/reject a review
 * @access  Admin
 */
router.delete('/admin/:id', authenticateToken, authorizeRoles('admin'), (req, res) => {
  const idx = (db.reviews || []).findIndex(r => String(r.id) === String(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, error: 'Review not found.' });
  db.reviews.splice(idx, 1);
  saveDatabase();
  res.json({ success: true, message: 'Review removed successfully.' });
});

module.exports = router;
