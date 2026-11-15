const express = require('express');
const router = express.Router();
const { db, saveDatabase } = require('../db');

/**
 * @route   GET /api/reviews
 * @desc    Fetch all approved student/coach/member reviews
 * @access  Public
 */
router.get('/', (req, res) => {
  try {
    const allReviews = db.reviews || [];
    
    // Sort newest first
    const sorted = [...allReviews].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

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
 * @desc    Submit a new review (Public - validated)
 * @access  Public
 */
router.post('/', (req, res) => {
  try {
    const { name, role, department, rating, comment, title } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Your name is required.' });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Review comment cannot be empty.' });
    }

    const numericRating = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
    const cleanName = name.trim();
    const cleanRole = (role || 'Student Member').trim();
    const cleanDept = (department || 'Faculty of Technology').trim();
    const cleanComment = comment.trim();
    const cleanTitle = (title || 'Gym Experience Feedback').trim();

    if (!db.reviews) db.reviews = [];

    const newReview = {
      id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: cleanName,
      role: cleanRole,
      department: cleanDept,
      rating: numericRating,
      title: cleanTitle,
      comment: cleanComment,
      verified: true,
      createdAt: new Date().toISOString()
    };

    db.reviews.unshift(newReview);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: 'Thank you! Your review has been published successfully.',
      review: newReview
    });
  } catch (err) {
    console.error('Error saving review:', err);
    res.status(500).json({ success: false, error: 'Failed to submit review.' });
  }
});

module.exports = router;
