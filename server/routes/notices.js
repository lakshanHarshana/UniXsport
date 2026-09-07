const express = require('express');
const router = express.Router();
const { db, saveDatabase } = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * Helper to get all identifiers for a user (including resolving from database)
 */
function getUserIdentifiers(user) {
  if (!user) return [];
  const ids = new Set();
  [user.id, user.user_id, user.userId, user.regNo, user.username, user.email, user.rfidTag, user.rfidCode].forEach(val => {
    if (val) ids.add(String(val).toLowerCase().trim());
  });

  // Resolve matching record in database to link user_id, regNo, id, email together
  if (db && Array.isArray(db.users)) {
    const dbUser = db.users.find(u => {
      const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
      return uIds.some(uid => ids.has(uid));
    });
    if (dbUser) {
      [dbUser.id, dbUser.user_id, dbUser.userId, dbUser.regNo, dbUser.username, dbUser.email].forEach(val => {
        if (val) ids.add(String(val).toLowerCase().trim());
      });
    }
  }

  return Array.from(ids);
}

/**
 * Helper to match user role against notice visibleTo
 */
function isNoticeVisibleToUser(notice, user) {
  if (!notice || notice.status === 'archived') return false;
  if (!user) return false;

  const role = (user.role || '').toLowerCase().trim();
  const visibleTo = (notice.visibleTo || 'all').toLowerCase().trim();
  const targetUserId = String(notice.targetUserId || notice.targetStudentId || notice.targetUser || '').toLowerCase().trim();
  const userIdentifiers = getUserIdentifiers(user);

  // Notice creator check
  const noticeCreatorName = (notice.createdBy || '').toLowerCase().trim();
  const noticeCreatorId = String(notice.creatorId || '').toLowerCase().trim();
  const userName = (user.name || '').toLowerCase().trim();
  const userUsername = (user.username || '').toLowerCase().trim();

  // 1. Creator can always see their own published notice
  const isCreator = (noticeCreatorId && userIdentifiers.includes(noticeCreatorId)) ||
                    (noticeCreatorName && (noticeCreatorName === userName || (userUsername && noticeCreatorName === userUsername)));
  if (isCreator) return true;

  // 2. Specific individual user targeting (ONLY the targeted person sees this)
  if (targetUserId) {
    return userIdentifiers.includes(targetUserId);
  }

  // 3. Direct user id in visibleTo
  if (userIdentifiers.includes(visibleTo)) {
    return true;
  }

  // 4. Role-based Broadcast Audience Filtering
  if (visibleTo === 'all' || visibleTo === 'everyone') {
    return true;
  }
  if ((visibleTo === 'students' || visibleTo === 'student') && role === 'student') {
    return true;
  }
  if ((visibleTo === 'coaches' || visibleTo === 'coach') && role === 'coach') {
    return true;
  }
  if ((visibleTo === 'admins' || visibleTo === 'admin') && role === 'admin') {
    return true;
  }
  if ((visibleTo === 'storekeepers' || visibleTo === 'storekeeper' || visibleTo === 'inventory') && role === 'storekeeper') {
    return true;
  }

  return false;
}

/**
 * @route   GET /api/notices
 * @desc    Fetch notices visible to the authenticated user based on role and audience
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    if (!db.notices) db.notices = [];

    const user = req.user || {};
    const filtered = db.notices
      .filter(n => isNoticeVisibleToUser(n, user))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({
      success: true,
      count: filtered.length,
      notices: filtered
    });
  } catch (err) {
    console.error('Error fetching notices:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve notices.' });
  }
});

/**
 * @route   POST /api/notices
 * @desc    Create a new notice / broadcast message (Admin & Coach only)
 */
router.post('/', authenticateToken, (req, res) => {
  try {
    const user = req.user || {};
    const role = (user.role || '').toLowerCase().trim();

    if (role !== 'admin' && role !== 'coach') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Only administrators and coaches can publish broadcast notices.'
      });
    }

    const { title, message, visibleTo, targetUserId, priority } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Notice title is required.' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Notice message is required.' });
    }

    let targetAudience = (visibleTo || 'all').toLowerCase().trim();
    let specificTarget = (targetUserId || '').trim();

    const validAudiences = ['all', 'students', 'coaches', 'admins', 'admin', 'storekeepers', 'inventory', 'specific_user'];
    if (!validAudiences.includes(targetAudience) && !specificTarget) {
      targetAudience = 'all';
    }

    if (targetAudience === 'specific_user' || specificTarget) {
      targetAudience = 'specific_user';
    }

    const validPriorities = ['normal', 'high', 'urgent'];
    const selectedPriority = validPriorities.includes((priority || '').toLowerCase()) ? priority.toLowerCase() : 'normal';

    let targetUserInfo = null;
    if (specificTarget) {
      targetUserInfo = (db.users || []).find(u => {
        const uId = String(u.id || '').toLowerCase();
        const uUid = String(u.user_id || u.userId || '').toLowerCase();
        const uReg = String(u.regNo || '').toLowerCase();
        const sTarget = specificTarget.toLowerCase();
        return uId === sTarget || uUid === sTarget || uReg === sTarget;
      });
    }

    const newNotice = {
      id: 'not_' + Date.now(),
      title: title.trim(),
      message: message.trim(),
      visibleTo: targetAudience,
      targetUserId: targetUserInfo ? (targetUserInfo.regNo || targetUserInfo.user_id || targetUserInfo.id) : (specificTarget || null),
      targetUserName: targetUserInfo ? targetUserInfo.name : null,
      priority: selectedPriority,
      createdBy: user.name || user.username || (role === 'coach' ? 'Coach' : 'Administrator'),
      creatorRole: role,
      creatorId: user.id || user.user_id || user.regNo || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!db.notices) db.notices = [];
    db.notices.unshift(newNotice);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: 'Notice published successfully.',
      notice: newNotice
    });
  } catch (err) {
    console.error('Error creating notice:', err);
    res.status(500).json({ success: false, error: 'Failed to publish notice.' });
  }
});

/**
 * @route   PUT /api/notices/:id
 * @desc    Update a notice (Admin can update all; Coach can update own)
 */
router.put('/:id', authenticateToken, (req, res) => {
  try {
    if (!db.notices) db.notices = [];
    const noticeId = req.params.id;
    const notice = db.notices.find(n => String(n.id) === String(noticeId));

    if (!notice) {
      return res.status(404).json({ success: false, error: 'Notice not found.' });
    }

    const user = req.user || {};
    const role = (user.role || '').toLowerCase().trim();
    const isCreator = (notice.creatorId && notice.creatorId === (user.id || user.user_id || user.regNo)) ||
                      (notice.createdBy && notice.createdBy.toLowerCase() === (user.name || '').toLowerCase());

    if (role !== 'admin' && !isCreator) {
      return res.status(403).json({ success: false, error: 'You are not authorized to edit this notice.' });
    }

    const { title, message, visibleTo, priority, status } = req.body;
    if (title && title.trim()) notice.title = title.trim();
    if (message && message.trim()) notice.message = message.trim();
    if (visibleTo) notice.visibleTo = visibleTo.toLowerCase().trim();
    if (priority) notice.priority = priority.toLowerCase().trim();
    if (status) notice.status = status.toLowerCase().trim();

    notice.updatedAt = new Date().toISOString();
    saveDatabase();

    res.json({
      success: true,
      message: 'Notice updated successfully.',
      notice
    });
  } catch (err) {
    console.error('Error updating notice:', err);
    res.status(500).json({ success: false, error: 'Failed to update notice.' });
  }
});

/**
 * @route   DELETE /api/notices/:id
 * @desc    Delete a notice (Admin can delete all; Coach can delete own)
 */
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    if (!db.notices) db.notices = [];
    const noticeId = req.params.id;
    const index = db.notices.findIndex(n => String(n.id) === String(noticeId));

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Notice not found.' });
    }

    const notice = db.notices[index];
    const user = req.user || {};
    const role = (user.role || '').toLowerCase().trim();
    const isCreator = (notice.creatorId && notice.creatorId === (user.id || user.user_id || user.regNo)) ||
                      (notice.createdBy && notice.createdBy.toLowerCase() === (user.name || '').toLowerCase());

    if (role !== 'admin' && !isCreator) {
      return res.status(403).json({ success: false, error: 'You are not authorized to delete this notice.' });
    }

    const deleted = db.notices.splice(index, 1);
    saveDatabase();

    res.json({
      success: true,
      message: 'Notice deleted successfully.',
      notice: deleted[0]
    });
  } catch (err) {
    console.error('Error deleting notice:', err);
    res.status(500).json({ success: false, error: 'Failed to delete notice.' });
  }
});

router.isNoticeVisibleToUser = isNoticeVisibleToUser;
module.exports = router;
