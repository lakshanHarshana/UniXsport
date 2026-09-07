const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { db, saveDatabase } = require('../db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// Multer storage for PDF Schedule Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'schedule-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are allowed for schedule uploads.'));
    }
  }
});

router.use(authenticateToken);
router.use(authorizeRoles('coach', 'admin'));

/**
 * Helper to check if a schedule request is assigned to or handled by the logged-in coach
 */
function matchesCoachRequest(request, coachUser) {
  if (!request) return false;
  if (!coachUser) return false;
  if (coachUser.role === 'admin') return true;

  const coachIdentifiers = [
    coachUser.id,
    coachUser.user_id,
    coachUser.userId,
    coachUser.regNo,
    coachUser.username,
    coachUser.email
  ].filter(Boolean).map(s => String(s).toLowerCase().trim());

  const coachName = (coachUser.name || '').toLowerCase().trim();
  const cleanCoachName = coachName.replace(/^coach\s+/i, '').trim();

  const prefCoach = (request.preferredCoach || request.coach || '').toLowerCase().trim();
  const cleanPref = prefCoach.replace(/^coach\s+/i, '').trim();
  const reqCoachId = String(request.coachId || '').toLowerCase().trim();
  const reqTargetId = String(request.targetCoachId || '').toLowerCase().trim();
  const reqCoachName = String(request.coachName || '').toLowerCase().trim();
  const cleanReqCoachName = reqCoachName.replace(/^coach\s+/i, '').trim();

  // 1. Unassigned / "Any Coach" requests are open to all coaches
  if (prefCoach === 'any coach' || prefCoach === 'any' || !prefCoach) {
    return true;
  }

  // 2. Direct ID match
  if (coachIdentifiers.some(id => id && (id === reqCoachId || id === reqTargetId))) {
    return true;
  }

  // 3. Name match
  if (coachName) {
    if (reqCoachName && (reqCoachName === coachName || cleanReqCoachName === cleanCoachName)) {
      return true;
    }
    if (prefCoach && (prefCoach === coachName || cleanPref === cleanCoachName || prefCoach.includes(cleanCoachName) || coachName.includes(cleanPref))) {
      return true;
    }
  }

  // 4. If request was previously approved or rejected by this coach
  if (request.approvedBy) {
    const approvedByStr = String(request.approvedBy).toLowerCase().trim();
    if (coachIdentifiers.includes(approvedByStr) || (coachName && approvedByStr === coachName)) {
      return true;
    }
  }
  if (request.rejectedBy) {
    const rejectedByStr = String(request.rejectedBy).toLowerCase().trim();
    if (coachIdentifiers.includes(rejectedByStr) || (coachName && rejectedByStr === coachName)) {
      return true;
    }
  }

  return false;
}

/**
 * @route   GET /api/coach/dashboard
 * @desc    Get coach overview statistics and pending schedule requests
 */
router.get('/dashboard', (req, res) => {
  if (!db.gymRequests) db.gymRequests = [];
  const myRequests = db.gymRequests.filter(r => matchesCoachRequest(r, req.user));
  const pendingRequests = myRequests.filter(r => r.status === 'pending');
  const todayStr = new Date().toISOString().split('T')[0];
  const approvedToday = myRequests.filter(
    r => r.status === 'approved' && (
      (r.approvedAt && r.approvedAt.startsWith(todayStr)) ||
      (r.updatedAt && r.updatedAt.startsWith(todayStr)) ||
      (r.createdAt && r.createdAt.startsWith(todayStr)) ||
      r.requestedDate === todayStr ||
      r.date === todayStr
    )
  );
  const totalStudents = (db.users || []).filter(u => u.role === 'student').length;

  const todayZero = new Date();
  todayZero.setHours(0, 0, 0, 0);
  const upcomingSessions = myRequests.filter(
    r => r.status === 'approved' && new Date(r.requestedDate || r.date || r.preferredDate || 0) >= todayZero
  );

  res.json({
    success: true,
    metrics: {
      pendingCount: pendingRequests.length,
      approvedTodayCount: approvedToday.length,
      totalStudentsCount: totalStudents,
      upcomingSessionsCount: upcomingSessions.length,
      maxSlotCapacity: config.MAX_SLOT_CAPACITY || 30
    },
    pendingRequests,
    allRequests: myRequests
  });
});

/**
 * @route   GET /api/coach/requests
 * @desc    Get all gym schedule requests for coach review
 */
router.get('/requests', (req, res) => {
  if (!db.gymRequests) db.gymRequests = [];
  const myRequests = db.gymRequests.filter(r => matchesCoachRequest(r, req.user));
  res.json({
    success: true,
    requests: myRequests
  });
});

/**
 * @route   GET /api/coach/slot-occupancy
 * @desc    Check student count per time slot (Capacity check: Max 30)
 */
router.get('/slot-occupancy', (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  if (!db.gymRequests) db.gymRequests = [];
  const approvedInDate = db.gymRequests.filter(
    r => (r.requestedDate === targetDate || r.date === targetDate) && r.status === 'approved'
  );

  const slotMap = {};
  approvedInDate.forEach(r => {
    slotMap[r.timeSlot] = (slotMap[r.timeSlot] || 0) + 1;
  });

  res.json({
    success: true,
    date: targetDate,
    maxCapacity: config.MAX_SLOT_CAPACITY || 30,
    occupancy: slotMap
  });
});

/**
 * @route   POST /api/coach/approve-request
 * @desc    Approve a gym schedule request (Enforces Max 30/slot capacity + PDF upload + Workout Plan)
 */
router.post('/approve-request', (req, res, next) => {
  upload.single('schedulePdf')(req, res, (err) => {
    if (err) {
      console.warn('Multer upload note:', err.message);
    }
    next();
  });
}, (req, res) => {
  try {
    const { requestId, coachNotes, comment, weeklyExercises } = req.body;

    if (!requestId) {
      return res.status(400).json({ success: false, error: 'Request ID is required.' });
    }

    if (!db.gymRequests) db.gymRequests = [];
    const request = db.gymRequests.find(r => String(r.id) === String(requestId));
    if (!request) {
      return res.status(404).json({ success: false, error: 'Gym schedule request not found.' });
    }

    if (req.user.role !== 'admin' && !matchesCoachRequest(request, req.user)) {
      return res.status(403).json({ success: false, error: 'You are not authorized to approve requests assigned to another coach.' });
    }

    if (request.status !== 'pending') {
        return res.status(400).json({ success: false, error: `Cannot process: request is already ${request.status}.` });
    }

    // Check Slot Capacity Enforcement (MAX 30)
    const existingCount = db.gymRequests.filter(
      r => (r.requestedDate === request.requestedDate || r.date === request.requestedDate) &&
           (r.timeSlot === request.timeSlot || r.preferredTime === request.timeSlot) &&
           r.status === 'approved' &&
           String(r.id) !== String(requestId)
    ).length;

    const maxCap = config.MAX_SLOT_CAPACITY || 30;
    if (existingCount >= maxCap) {
      return res.status(400).json({
        success: false,
        error: `Slot (${request.timeSlot}) is FULL (${existingCount}/${maxCap}). Cannot approve request.`
      });
    }

    const finalNotes = coachNotes || comment || 'Approved by Gym Coach';
    request.status = 'approved';
    request.coachNotes = finalNotes;
    request.coachComment = finalNotes;
    request.approvedBy = req.user ? req.user.name : 'Coach';
    request.coachName = req.user ? req.user.name : (request.coachName || 'Coach');
    request.coachId = req.user ? (req.user.user_id || req.user.id || req.user.regNo) : request.coachId;
    request.approvedAt = new Date().toISOString();

    if (req.file) {
      request.pdfScheduleUrl = `/uploads/${req.file.filename}`;
      request.schedulePdf = `/uploads/${req.file.filename}`;
    }

    // Parse assigned exercises if provided
    let exercisesArr = [];
    if (weeklyExercises) {
      try {
        exercisesArr = typeof weeklyExercises === 'string' ? JSON.parse(weeklyExercises) : weeklyExercises;
      } catch (e) {
        exercisesArr = Array.isArray(weeklyExercises) ? weeklyExercises : [];
      }
    }
    if (exercisesArr.length > 0) {
      request.assignedExercises = exercisesArr;
    }

    // Sync or create workout plan
    if (!db.workoutPlans) db.workoutPlans = [];
    const studentTargetId = request.studentRegNo || request.studentId || request.userId;
    let plan = db.workoutPlans.find(w => String(w.studentId).toLowerCase() === String(studentTargetId).toLowerCase());

    if (plan) {
      if (exercisesArr.length > 0) plan.weeklyExercises = exercisesArr;
      plan.coachNotes = finalNotes;
      plan.coachId = req.user ? req.user.name : 'Coach';
      plan.updatedAt = new Date().toISOString();
    } else if (exercisesArr.length > 0) {
      plan = {
        studentId: studentTargetId,
        studentName: request.studentName,
        coachId: req.user ? req.user.name : 'Coach',
        weeklyExercises: exercisesArr,
        coachNotes: finalNotes,
        updatedAt: new Date().toISOString()
      };
      db.workoutPlans.push(plan);
    }

    const notification = {
        id: 'not_' + Date.now(),
        title: 'Gym Schedule Request Approved',
        message: `Your gym schedule request for ${request.requestedDate || request.preferredDate} has been approved by ${req.user ? req.user.name : 'Coach'}`,
        priority: 'high',
        visibleTo: 'specific_user',
        targetUserId: request.studentRegNo || request.studentId || request.userId,
        targetStudentId: request.studentRegNo || request.studentId || request.userId,
        targetUserName: request.studentName,
        createdBy: req.user ? req.user.name : 'Coach',
        creatorRole: 'coach',
        creatorId: req.user ? (req.user.id || req.user.user_id || req.user.regNo || '') : '',
        createdAt: new Date().toISOString()
    };
    if (!db.notices) db.notices = [];
    db.notices.push(notification);

    saveDatabase();

    res.json({
      success: true,
      message: 'Request approved successfully in database.',
      request
    });
  } catch (err) {
    console.error('Approve Error:', err);
    res.status(500).json({ success: false, error: err.message || 'Approval failed.' });
  }
});

/**
 * @route   POST /api/coach/reject-request
 * @desc    Reject a gym schedule request with reason in database
 */
router.post('/reject-request', (req, res) => {
  const { requestId, rejectionReason, comment } = req.body;
  const reason = (rejectionReason || comment || '').trim();

  if (!requestId) {
    return res.status(400).json({ success: false, error: 'Request ID is required.' });
  }

  if (!reason) {
    return res.status(400).json({ success: false, error: 'Rejection reason comment is required.' });
  }

  if (!db.gymRequests) db.gymRequests = [];
  const request = db.gymRequests.find(r => String(r.id) === String(requestId));
  if (!request) {
    return res.status(404).json({ success: false, error: 'Gym schedule request not found.' });
  }

  if (req.user.role !== 'admin' && !matchesCoachRequest(request, req.user)) {
    return res.status(403).json({ success: false, error: 'You are not authorized to reject requests assigned to another coach.' });
  }

  if (request.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot process: request is already ${request.status}.` });
  }

  request.status = 'rejected';
  request.coachNotes = reason;
  request.coachComment = reason;
  request.rejectedBy = req.user ? req.user.name : 'Coach';
  request.rejectedAt = new Date().toISOString();

  const notification = {
      id: 'not_' + Date.now() + '_rej',
      title: 'Gym Schedule Request Rejected',
      message: `Your gym schedule request for ${request.requestedDate || request.preferredDate} has been rejected. Reason: ${reason}`,
      priority: 'high',
      visibleTo: 'specific_user',
      targetUserId: request.studentRegNo || request.studentId || request.userId,
      targetStudentId: request.studentRegNo || request.studentId || request.userId,
      targetUserName: request.studentName,
      createdBy: req.user ? req.user.name : 'Coach',
      creatorRole: 'coach',
      creatorId: req.user ? (req.user.id || req.user.user_id || req.user.regNo || '') : '',
      createdAt: new Date().toISOString()
  };
  if (!db.notices) db.notices = [];
  db.notices.push(notification);

  saveDatabase();

  res.json({ success: true, message: 'Request rejected and updated in database.', request });
});

/**
 * @route   POST /api/coach/assign-workout
 * @desc    Create/Update workout plan for a student in database
 */
router.post('/assign-workout', (req, res) => {
  const { studentRegNo, weeklyExercises, coachNotes } = req.body;

  if (!studentRegNo) {
    return res.status(400).json({ success: false, error: 'Student Reg No is required.' });
  }

  if (!db.workoutPlans) db.workoutPlans = [];
  let plan = db.workoutPlans.find(w => String(w.studentId).toLowerCase() === String(studentRegNo).toLowerCase());
  if (plan) {
    plan.weeklyExercises = weeklyExercises || plan.weeklyExercises;
    plan.coachNotes = coachNotes || plan.coachNotes;
    plan.updatedAt = new Date().toISOString();
  } else {
    plan = {
      studentId: studentRegNo,
      coachId: req.user ? req.user.name : 'Coach',
      weeklyExercises: weeklyExercises || [],
      coachNotes: coachNotes || '',
      updatedAt: new Date().toISOString()
    };
    db.workoutPlans.push(plan);
  }

  saveDatabase();
  res.json({ success: true, message: 'Workout plan updated successfully in database.', plan });
});

router.get('/student-progress/:studentRegNo(*)', (req, res) => {
    const rawParam = req.params.studentRegNo || req.query.studentRegNo || '';
    if (!rawParam) {
        return res.status(400).json({ success: false, error: 'Student registration number is required.' });
    }
    
    let decoded = '';
    try {
        decoded = decodeURIComponent(rawParam).toLowerCase().trim();
    } catch(e) {
        decoded = rawParam.toLowerCase().trim();
    }
    const cleanId = rawParam.toLowerCase().trim();

    // Find student in db.users to get all aliases
    const matchedUser = (db.users || []).find(u => {
        const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.name, u.email]
            .filter(Boolean)
            .map(s => String(s).toLowerCase().trim());
        return uIds.includes(decoded) || uIds.includes(cleanId);
    });

    const validIds = matchedUser ? [
        matchedUser.id,
        matchedUser.user_id,
        matchedUser.userId,
        matchedUser.regNo,
        matchedUser.username,
        matchedUser.name,
        matchedUser.email
    ].filter(Boolean).map(s => String(s).toLowerCase().trim()) : [decoded, cleanId];

    let plan = (db.workoutPlans || []).find(p => {
        const planId = String(p.studentId || p.studentRegNo || '').toLowerCase().trim();
        const planName = String(p.studentName || '').toLowerCase().trim();
        return validIds.includes(planId) || validIds.includes(planName);
    });

    // Fallback: check db.gymRequests for approved requests with assignedExercises
    if (!plan && db.gymRequests) {
        const approvedReq = db.gymRequests.find(r => {
            const rIds = [r.userId, r.studentId, r.studentRegNo, r.studentName, r.studentEmail]
                .filter(Boolean)
                .map(s => String(s).toLowerCase().trim());
            return r.status === 'approved' && r.assignedExercises && r.assignedExercises.length > 0 &&
                   validIds.some(id => rIds.includes(id));
        });
        if (approvedReq) {
            plan = {
                studentId: approvedReq.studentRegNo || approvedReq.studentId || approvedReq.userId,
                studentName: approvedReq.studentName,
                coachId: approvedReq.approvedBy || approvedReq.preferredCoach || 'Coach',
                weeklyExercises: approvedReq.assignedExercises,
                coachNotes: approvedReq.coachNotes || approvedReq.coachComment || '',
                updatedAt: approvedReq.approvedAt || approvedReq.createdAt
            };
        }
    }
    
    if (!plan) {
        return res.json({ success: true, plan: null, message: 'No workout plan found for this student.' });
    }
    
    const exercises = (plan.weeklyExercises || []).map((ex, idx) => {
        if (typeof ex === 'string') {
            return { name: ex, completed: false, progressDate: null, index: idx };
        }
        return { ...ex, index: idx };
    });
    
    const totalExercises = exercises.length;
    const completedCount = exercises.filter(e => e.completed).length;
    const progressPercent = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;
    
    res.json({
        success: true,
        plan: {
            studentId: plan.studentId,
            studentName: plan.studentName,
            coachId: plan.coachId,
            coachNotes: plan.coachNotes,
            updatedAt: plan.updatedAt,
            exercises,
            totalExercises,
            completedCount,
            progressPercent
        }
    });
});

/**
 * @route   POST /api/coach/create-notice
 * @desc    Publish a coach broadcast notice
 */
router.post('/create-notice', (req, res) => {
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
        createdBy: req.user ? (req.user.name || 'Coach') : 'Coach',
        creatorRole: 'coach',
        creatorId: req.user ? (req.user.id || req.user.user_id || req.user.regNo || '') : '',
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
});

/**
 * @route   DELETE /api/coach/notice/:id
 * @desc    Delete a notice created by this coach
 */
router.delete('/notice/:id', (req, res) => {
    if (!db.notices) db.notices = [];
    const noticeId = req.params.id;
    const index = db.notices.findIndex(n => String(n.id) === String(noticeId));

    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Notice not found.' });
    }

    const notice = db.notices[index];
    const user = req.user || {};
    const isCreator = (notice.creatorId && notice.creatorId === (user.id || user.user_id || user.regNo)) ||
                      (notice.createdBy && notice.createdBy.toLowerCase() === (user.name || '').toLowerCase());

    if (user.role !== 'admin' && !isCreator) {
        return res.status(403).json({ success: false, error: 'You can only delete your own published notices.' });
    }

    const deleted = db.notices.splice(index, 1);
    saveDatabase();

    res.json({
        success: true,
        message: 'Notice deleted successfully.',
        notice: deleted[0]
    });
});

/**
 * @route   GET /api/coach/student-progress/:studentRegNo
 * @desc    Fetch student workout progress and assigned sets/reps for coach
 */
router.get('/student-progress/:studentRegNo', (req, res) => {
    const { studentRegNo } = req.params;
    if (!studentRegNo) {
        return res.status(400).json({ success: false, error: 'Student registration number is required.' });
    }
    
    const plan = (db.workoutPlans || []).find(p => {
        const planId = (p.studentId || p.studentRegNo || '').toLowerCase().trim();
        return planId === studentRegNo.toLowerCase().trim();
    });
    
    if (!plan) {
        return res.json({ success: true, plan: null, message: 'No workout plan found for this student.' });
    }
    
    const exercises = (plan.weeklyExercises || []).map((ex, idx) => {
        if (typeof ex === 'string') {
            return { name: ex, completed: false, progressDate: null, index: idx };
        }
        return { completed: false, progressDate: null, ...ex, index: idx };
    });
    
    const totalExercises = exercises.length;
    const completedCount = exercises.filter(e => e.completed).length;
    const progressPercent = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;
    
    res.json({
        success: true,
        plan: {
            studentId: plan.studentId,
            coachId: plan.coachId,
            coachNotes: plan.coachNotes,
            updatedAt: plan.updatedAt,
            exercises,
            totalExercises,
            completedCount,
            progressPercent
        }
    });
});

module.exports = router;
