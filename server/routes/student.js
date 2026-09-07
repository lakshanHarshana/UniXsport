const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, saveDatabase } = require('../db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All routes require authenticated Student or Admin
router.use(authenticateToken);

/**
 * Helper to get all lowercase unique identifiers for the authenticated user
 */
function getStudentIdentifiers(user) {
  if (!user) return [];
  return [
    user.user_id,
    user.userId,
    user.regNo,
    user.username,
    user.id,
    user.email
  ].filter(Boolean).map(s => String(s).toLowerCase().trim());
}

/**
 * Helper to check if a log belongs to the authenticated student
 */
function matchesStudentLog(log, studentIdentifiers) {
  if (!log || !studentIdentifiers || studentIdentifiers.length === 0) return false;
  const logIds = [
    log.user_id,
    log.userId,
    log.studentId,
    log.studentRegNo,
    log.studentEmail
  ].filter(Boolean).map(s => String(s).toLowerCase().trim());

  return studentIdentifiers.some(id => logIds.includes(id));
}

/**
 * @route   GET /api/student/dashboard
 * @desc    Fetch overview metrics & dashboard info for student
 */
router.get('/dashboard', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);

  const upcomingSessions = (db.gymRequests || []).filter(
    r => myIds.includes(String(r.studentId || '').toLowerCase()) && r.status === 'approved'
  );

  const pendingRequests = (db.gymRequests || []).filter(
    r => myIds.includes(String(r.studentId || '').toLowerCase()) && r.status === 'pending'
  );

  const borrowedEquipment = (db.borrowLogs || []).filter(
    b => matchesStudentLog(b, myIds) && (b.status === 'borrowed' || b.status === 'taken')
  );

  const workoutPlan = (db.workoutPlans || []).find(
    w => myIds.includes(String(w.studentId || '').toLowerCase())
  ) || null;

  const { isNoticeVisibleToUser } = require('./notices');
  const notices = (db.notices || []).filter(n => isNoticeVisibleToUser(n, req.user));

  res.json({
    success: true,
    data: {
      student: req.user,
      upcomingSessionsCount: upcomingSessions.length,
      upcomingSessions,
      pendingRequestsCount: pendingRequests.length,
      pendingRequests,
      borrowedEquipmentCount: borrowedEquipment.length,
      borrowedEquipment,
      workoutPlan,
      notices
    }
  });
});

/**
 * @route   GET /api/student/coaches
 * @desc    Get all active coaches from database for schedule booking dropdown
 */
router.get('/coaches', (req, res) => {
  const coaches = (db.users || [])
    .filter(u => u.role === 'coach' && u.status !== 'inactive' && u.status !== 'deactivated')
    .map(u => ({
      id: u.id,
      user_id: u.user_id || u.userId,
      regNo: u.regNo,
      name: u.name,
      email: u.email,
      department: u.department || 'Sports Directorate'
    }));

  res.json({
    success: true,
    coaches
  });
});

/**
 * @route   GET /api/student/borrow-history
 * @desc    Fetch authenticated student's real equipment borrowing & return history
 */
router.get('/borrow-history', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  const { equipment, dateFrom, dateTo, status } = req.query;

  function getColomboDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d).trim();
    } catch(e) {
      return '';
    }
  }

  let myHistory = (db.borrowLogs || []).filter(b => matchesStudentLog(b, myIds));

  // 1. Equipment Filter
  if (equipment && equipment.trim() !== '' && equipment !== 'all') {
    const eqQuery = equipment.trim().toLowerCase();
    myHistory = myHistory.filter(b => 
      (b.equipmentId && String(b.equipmentId).toLowerCase() === eqQuery) ||
      (b.equipmentName && b.equipmentName.toLowerCase().includes(eqQuery)) ||
      (b.equipment && b.equipment.toLowerCase().includes(eqQuery))
    );
  }

  // 2. Date From Filter (Asia/Colombo)
  if (dateFrom && dateFrom.trim() !== '') {
    const fromStr = dateFrom.trim();
    myHistory = myHistory.filter(b => {
      const rawDate = b.issuedAt || b.borrowedAt || b.issueDate || b.createdAt;
      const colomboDate = getColomboDate(rawDate);
      return colomboDate ? colomboDate >= fromStr : true;
    });
  }

  // 3. Date To Filter (Asia/Colombo)
  if (dateTo && dateTo.trim() !== '') {
    const toStr = dateTo.trim();
    myHistory = myHistory.filter(b => {
      const rawDate = b.issuedAt || b.borrowedAt || b.issueDate || b.createdAt;
      const colomboDate = getColomboDate(rawDate);
      return colomboDate ? colomboDate <= toStr : true;
    });
  }

  let mappedHistory = myHistory.map(b => {
    const totalQty = b.qty !== undefined ? b.qty : (b.quantity !== undefined ? b.quantity : 1);
    const returnedQty = b.returnedQty || 0;
    const remainingQty = Math.max(0, totalQty - returnedQty);

    let finalStatus = b.status || 'borrowed';
    const statusLower = finalStatus.toLowerCase();
    if (statusLower === 'returned' || remainingQty === 0) {
      finalStatus = 'Returned';
    } else if (statusLower === 'partially returned' || (returnedQty > 0 && remainingQty > 0)) {
      finalStatus = 'Partially Returned';
    } else {
      finalStatus = 'Borrowed';
    }

    return {
      id: b.id,
      user_id: b.user_id || req.user.user_id || 'US002',
      equipmentId: b.equipmentId,
      equipmentName: b.equipmentName || b.equipment || 'Equipment Item',
      quantity: totalQty,
      borrowedQty: remainingQty,
      returnedQty: returnedQty,
      borrowedAt: b.issuedAt || b.borrowedAt || b.issueDate || b.createdAt || new Date().toISOString(),
      dueDate: b.expectedReturnAt || b.dueDate || null,
      returnedAt: b.returnedAt || b.returnDate || null,
      status: finalStatus,
      issuedBy: b.issuedBy || 'Storekeeper',
      notes: b.notes || ''
    };
  });

  // 4. Status Filter
  if (status && status.trim() !== '' && status !== 'all') {
    const stLower = status.trim().toLowerCase();
    mappedHistory = mappedHistory.filter(item => {
      const itemStatus = (item.status || '').toLowerCase();
      if (stLower === 'taken' || stLower === 'borrowed') {
        return itemStatus === 'borrowed' || itemStatus === 'taken';
      }
      if (stLower === 'returned') {
        return itemStatus === 'returned';
      }
      if (stLower === 'pending' || stLower === 'partially returned') {
        return itemStatus === 'pending' || itemStatus === 'partially returned';
      }
      return itemStatus === stLower;
    });
  }

  res.json({
    success: true,
    history: mappedHistory
  });
});

/**
 * @route   POST /api/student/schedule-request
 * @desc    Submit a gym schedule booking request
 */
router.post('/schedule-request', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  const studentUser = (db.users || []).find(u => {
    const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    return myIds.some(id => uIds.includes(id));
  }) || req.user;

  const {
    requestedDate,
    preferredDate,
    timeSlot,
    coachId,
    coach,
    preferredCoach,
    notes,
    age,
    height,
    weight,
    fitnessLevel,
    injuryHistory,
    trainingGoal
  } = req.body;

  const targetDate = (requestedDate || preferredDate || '').trim();
  const targetTime = (timeSlot || '').trim();
  const targetCoach = (preferredCoach || coach || coachId || 'Coach Mike').trim();

  if (!targetDate || !targetTime) {
    return res.status(400).json({ success: false, error: 'Preferred Date and Time Slot are required.' });
  }

  // Prevent duplicate active pending requests for the same date & timeslot
  if (!db.gymRequests) db.gymRequests = [];
  const existingPending = db.gymRequests.find(r => {
    const isMyRequest = matchesStudentLog(r, myIds);
    return isMyRequest && r.status === 'pending' && (r.requestedDate === targetDate || r.date === targetDate) && r.timeSlot === targetTime;
  });

  if (existingPending) {
    return res.status(400).json({
      success: false,
      error: 'You already have an active pending schedule request for this date and time slot.'
    });
  }

  const newRequest = {
    id: 'req_' + Date.now(),
    userId: studentUser.user_id || studentUser.userId || req.user.user_id || 'US002',
    studentId: studentUser.regNo || req.user.regNo || studentUser.user_id || 'STU001',
    studentRegNo: studentUser.regNo || req.user.regNo || studentUser.user_id || 'STU001',
    studentName: studentUser.name || req.user.name || 'Student',
    studentEmail: studentUser.email || req.user.email || '',
    department: studentUser.department || studentUser.faculty || req.user.department || 'Technology',
    age: studentUser.age || (age !== undefined ? age : ''),
    height: studentUser.height || (height !== undefined ? height : ''),
    weight: studentUser.weight || (weight !== undefined ? weight : ''),
    fitnessLevel: studentUser.fitnessLevel || fitnessLevel || 'Intermediate',
    injuryHistory: studentUser.injuryHistory || injuryHistory || 'None',
    trainingGoal: studentUser.trainingGoal || trainingGoal || 'General Fitness',
    coachId: targetCoach,
    preferredCoach: targetCoach,
    requestedDate: targetDate,
    date: targetDate,
    preferredDate: targetDate,
    timeSlot: targetTime,
    preferredTime: targetTime,
    notes: (notes || '').trim(),
    status: 'pending',
    coachNotes: '',
    coachComment: '',
    pdfScheduleUrl: '',
    assignedExercises: [],
    createdAt: new Date().toISOString()
  };

  db.gymRequests.unshift(newRequest);

  const notification = {
      id: 'not_' + Date.now(),
      title: 'New Gym Schedule Request',
      message: `${newRequest.studentName} submitted a gym schedule request for ${newRequest.requestedDate} (${newRequest.timeSlot})`,
      priority: 'normal',
      visibleTo: 'coaches',
      createdBy: 'System',
      createdAt: new Date().toISOString()
  };
  if (!db.notices) db.notices = [];
  db.notices.push(notification);

  saveDatabase();

  res.status(201).json({
    success: true,
    message: 'Gym schedule request submitted successfully.',
    request: newRequest
  });
});

/**
 * @route   GET /api/student/schedules
 * @desc    Get authenticated student's schedule request history
 */
router.get('/schedules', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  if (!db.gymRequests) db.gymRequests = [];

  const myRequests = db.gymRequests.filter(r => matchesStudentLog(r, myIds));
  res.json({ success: true, requests: myRequests });
});

/**
 * @route   GET /api/student/workout-plan
 * @desc    Get assigned workout plan (supports optional requestId query parameter)
 */
router.get('/workout-plan', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  if (!db.workoutPlans) db.workoutPlans = [];

  const targetReqId = req.query.requestId || req.query.scheduleId;
  let plan = null;

  // 1. If specific schedule ID requested, load that approved schedule's plan
  if (targetReqId && db.gymRequests) {
    const specificReq = db.gymRequests.find(r => r.id === targetReqId && matchesStudentLog(r, myIds));
    if (specificReq && (specificReq.assignedExercises || specificReq.status === 'approved')) {
      plan = {
        requestId: specificReq.id,
        requestedDate: specificReq.requestedDate || specificReq.preferredDate,
        timeSlot: specificReq.timeSlot || specificReq.preferredTime,
        studentId: specificReq.studentRegNo || specificReq.studentId || specificReq.userId,
        studentName: specificReq.studentName,
        coachId: specificReq.approvedBy || specificReq.preferredCoach || specificReq.coachId || 'Coach',
        weeklyExercises: specificReq.assignedExercises || [],
        coachNotes: specificReq.coachNotes || specificReq.coachComment || '',
        pdfScheduleUrl: specificReq.pdfScheduleUrl || specificReq.schedulePdf || '',
        updatedAt: specificReq.approvedAt || specificReq.createdAt
      };
    }
  }

  // 2. Otherwise load default student workout plan
  if (!plan) {
    plan = db.workoutPlans.find(w => {
      const wId = String(w.studentId || '').toLowerCase().trim();
      const wName = String(w.studentName || '').toLowerCase().trim();
      return myIds.includes(wId) || myIds.includes(wName);
    });
  }

  // 3. Fallback: Check latest approved request with assignedExercises
  if (!plan && db.gymRequests) {
    const approvedReq = db.gymRequests.find(r => {
      return matchesStudentLog(r, myIds) && r.status === 'approved' && r.assignedExercises && r.assignedExercises.length > 0;
    });
    if (approvedReq) {
      plan = {
        requestId: approvedReq.id,
        requestedDate: approvedReq.requestedDate || approvedReq.preferredDate,
        timeSlot: approvedReq.timeSlot || approvedReq.preferredTime,
        studentId: approvedReq.studentRegNo || approvedReq.studentId || approvedReq.userId,
        studentName: approvedReq.studentName,
        coachId: approvedReq.approvedBy || approvedReq.preferredCoach || approvedReq.coachId || 'Coach',
        weeklyExercises: approvedReq.assignedExercises,
        coachNotes: approvedReq.coachNotes || approvedReq.coachComment || '',
        pdfScheduleUrl: approvedReq.pdfScheduleUrl || approvedReq.schedulePdf || '',
        updatedAt: approvedReq.approvedAt || approvedReq.createdAt
      };
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  if (plan) {
    plan = { ...plan };
    plan.weeklyExercises = (plan.weeklyExercises || []).map(ex => {
      if (typeof ex === 'string') {
        return { name: ex, completed: false, progressDate: null };
      }
      return {
        completed: false,
        progressDate: null,
        ...ex
      };
    });
  }

  res.json({ success: true, plan: plan || null, today: todayStr });
});

/**
 * @route   DELETE /api/student/schedule/:id
 * @desc    Delete a gym schedule request and clean associated workout plan
 */
router.delete('/schedule/:id', (req, res) => {
  const { id } = req.params;
  const myIds = getStudentIdentifiers(req.user);

  if (!db.gymRequests) db.gymRequests = [];
  const reqIndex = db.gymRequests.findIndex(r => r.id === id && matchesStudentLog(r, myIds));

  if (reqIndex === -1) {
    return res.status(404).json({ success: false, error: 'Schedule request not found or unauthorized.' });
  }

  const removedReq = db.gymRequests.splice(reqIndex, 1)[0];

  // If there are no other approved requests for this student, remove standalone workout plan
  if (db.workoutPlans) {
    const remainingApproved = db.gymRequests.filter(r => matchesStudentLog(r, myIds) && r.status === 'approved');
    if (remainingApproved.length === 0) {
      db.workoutPlans = db.workoutPlans.filter(w => {
        const wId = String(w.studentId || '').toLowerCase().trim();
        const wName = String(w.studentName || '').toLowerCase().trim();
        return !myIds.includes(wId) && !myIds.includes(wName);
      });
    }
  }

  saveDatabase();

  res.json({
    success: true,
    message: 'Gym schedule and workout plan deleted successfully.',
    deletedId: id
  });
});

/**
 * @route   POST /api/student/equipment-request
 * @desc    Submit an equipment borrow request
 */
router.post('/equipment-request', (req, res) => {
  const { equipmentId, qty } = req.body;

  const item = db.equipment.find(e => e.id === equipmentId);
  if (!item) {
    return res.status(404).json({ success: false, error: 'Equipment not found.' });
  }

  const quantity = parseInt(qty) || 1;
  if (quantity > item.availableQty) {
    return res.status(400).json({ success: false, error: `Requested quantity exceeds available stock (${item.availableQty}).` });
  }

  const newLog = {
    id: 'brw_' + Date.now(),
    studentId: req.user.regNo,
    studentName: req.user.name,
    equipmentId: item.id,
    equipmentName: item.name,
    qty: quantity,
    issuedBy: 'Pending Storekeeper Approval',
    issuedAt: new Date().toISOString(),
    expectedReturnAt: new Date(Date.now() + 86400000).toISOString(),
    returnedAt: null,
    status: 'borrowed',
    notes: 'Requested via online portal'
  };

  // Adjust available stock
  item.availableQty -= quantity;
  item.borrowedQty = (item.borrowedQty || 0) + quantity;
  if (item.availableQty === 0) item.status = 'borrowed';

  db.borrowLogs.unshift(newLog);
  saveDatabase();

  res.json({ success: true, message: 'Equipment requested successfully.', log: newLog });
});

/**
 * @route   GET /api/student/profile
 * @desc    Fetch full student profile from database
 */
router.get('/profile', (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  const user = (db.users || []).find(u => {
    const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    return myIds.some(id => uIds.includes(id));
  });

  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found in database.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      user_id: user.user_id || user.userId || 'US002',
      userId: user.user_id || user.userId || 'US002',
      name: user.name,
      regNo: user.regNo,
      email: user.email,
      phone: user.phone || '',
      gender: user.gender || '',
      year: user.year || '',
      role: user.role,
      department: user.department || user.faculty || 'Technology',
      faculty: user.faculty || user.department || 'Technology',
      rfidTag: user.rfidTag || '',
      age: user.age || '',
      height: user.height || '',
      weight: user.weight || '',
      fitnessLevel: user.fitnessLevel || 'Not Set',
      injuryHistory: user.injuryHistory || 'None',
      trainingGoal: user.trainingGoal || 'Not Set',
      bio: user.bio || 'Member of Rajarata University Sports & Gym Club.',
      avatarUrl: user.avatarUrl || user.profilePhoto || user.profileImage || '',
      profilePhoto: user.profilePhoto || user.profileImage || user.avatarUrl || '',
      profileImage: user.profileImage || user.profilePhoto || user.avatarUrl || ''
    }
  });
});

/**
 * @route   POST /api/student/update-profile
 * @desc    Update student physical and personal profile details in DB
 */
router.post('/update-profile', async (req, res) => {
  const myIds = getStudentIdentifiers(req.user);
  let user = (db.users || []).find(u => {
    const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    return myIds.some(id => uIds.includes(id));
  });

  // Fallback: match by regNo or user_id in body if not found via token
  if (!user && req.body) {
    const targetReg = (req.body.regNo || req.body.studentRegNo || '').toLowerCase().trim();
    const targetUserId = (req.body.user_id || req.body.userId || '').toLowerCase().trim();
    user = (db.users || []).find(u => {
      const uReg = (u.regNo || '').toLowerCase().trim();
      const uId = (u.user_id || u.userId || '').toLowerCase().trim();
      return (targetReg && uReg === targetReg) || (targetUserId && uId === targetUserId);
    });
  }

  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found.' });
  }

  const {
    name,
    age,
    height,
    weight,
    fitnessLevel,
    injuryHistory,
    trainingGoal,
    phone,
    gender,
    year,
    department,
    faculty,
    bio,
    avatarUrl,
    profilePhoto,
    profileImage,
    email,
    regNo,
    currentPassword,
    newPassword
  } = req.body;

  // Check unique email if changed
  if (email && String(email).trim().toLowerCase() !== String(user.email || '').toLowerCase()) {
    const dupEmail = (db.users || []).find(u => String(u.id) !== String(user.id) && String(u.email || '').toLowerCase() === String(email).trim().toLowerCase());
    if (dupEmail) {
      return res.status(400).json({ success: false, error: 'Email address is already in use by another account.' });
    }
    user.email = String(email).trim().toLowerCase();
  }

  // Check unique regNo if changed
  if (regNo && String(regNo).trim().toLowerCase() !== String(user.regNo || '').toLowerCase()) {
    const dupReg = (db.users || []).find(u => String(u.id) !== String(user.id) && String(u.regNo || u.username || '').toLowerCase() === String(regNo).trim().toLowerCase());
    if (dupReg) {
      return res.status(400).json({ success: false, error: 'Registration Number is already in use by another account.' });
    }
    user.regNo = String(regNo).trim();
    user.username = String(regNo).trim();
  }

  if (name !== undefined && String(name).trim()) user.name = String(name).trim();
  if (age !== undefined) user.age = age;
  if (height !== undefined) user.height = height;
  if (weight !== undefined) user.weight = weight;
  if (fitnessLevel !== undefined) user.fitnessLevel = fitnessLevel;
  if (injuryHistory !== undefined) user.injuryHistory = injuryHistory;
  if (trainingGoal !== undefined) user.trainingGoal = trainingGoal;
  if (phone !== undefined) user.phone = phone;
  if (gender !== undefined) user.gender = gender;
  if (year !== undefined) user.year = year;
  if (faculty !== undefined) { user.faculty = faculty; user.department = faculty; }
  if (department !== undefined) { user.department = department; if (!user.faculty) user.faculty = department; }
  if (bio !== undefined) user.bio = bio;
  
  const photoVal = profilePhoto || profileImage || avatarUrl;
  if (photoVal !== undefined) {
    user.avatarUrl = photoVal;
    user.profilePhoto = photoVal;
    user.profileImage = photoVal;
  }

  // Handle password update if supplied
  if (newPassword && String(newPassword).trim().length >= 6) {
    const cleanNewPwd = String(newPassword).trim();
    if (!currentPassword || !String(currentPassword).trim()) {
      return res.status(400).json({ success: false, error: 'Current password is required to change your password.' });
    }
    const cleanCurPwd = String(currentPassword).trim();
    const bcrypt = require('bcryptjs');
    let isMatch = false;
    if (user.passwordHash) {
      isMatch = await bcrypt.compare(cleanCurPwd, user.passwordHash);
    } else if (user.password && cleanCurPwd === user.password) {
      isMatch = true;
    }
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password does not match. Please verify and try again.' });
    }
    user.passwordHash = await bcrypt.hash(cleanNewPwd, 10);
    user.password = cleanNewPwd;
  }

  user.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({
    success: true,
    message: 'Profile updated successfully in database.',
    user: {
      id: user.id,
      user_id: user.user_id || user.userId,
      userId: user.user_id || user.userId,
      name: user.name,
      regNo: user.regNo,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      year: user.year,
      department: user.department || user.faculty,
      faculty: user.faculty || user.department,
      age: user.age,
      height: user.height,
      weight: user.weight,
      fitnessLevel: user.fitnessLevel,
      injuryHistory: user.injuryHistory,
      trainingGoal: user.trainingGoal,
      bio: user.bio,
      avatarUrl: user.avatarUrl || user.profilePhoto || '',
      profilePhoto: user.profilePhoto || user.avatarUrl || '',
      profileImage: user.profileImage || user.avatarUrl || ''
    }
  });
});

/**
 * @route   POST /api/student/upload-photo
 * @desc    Upload student profile image to server storage & sync to database
 */
router.post('/upload-photo', (req, res) => {
  try {
    const myIds = getStudentIdentifiers(req.user);
    const user = (db.users || []).find(u => {
      const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
      return myIds.some(id => uIds.includes(id));
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Student user account not found.' });
    }

    const { image, base64Image, profilePhoto, avatarUrl } = req.body;
    const rawImage = image || base64Image || profilePhoto || avatarUrl;

    if (!rawImage || typeof rawImage !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid image data (base64 or URL) is required.' });
    }

    const avatarsDir = path.join(config.UPLOAD_DIR || path.join(__dirname, '../uploads'), 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Automatically delete old profile image file from storage if it exists
    const oldImage = user.profileImage || user.profilePhoto || user.avatarUrl || '';
    if (oldImage && oldImage.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(oldImage);
      const oldFilePath = path.join(avatarsDir, oldFilename);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {
        console.warn(`[Storage] Could not delete old photo file:`, err.message);
      }
    }

    let savedImageUrl = rawImage; // Store base64 data URL directly for universal cross-device / cross-domain compatibility

    if (rawImage.startsWith('data:image/')) {
      const base64Match = rawImage.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (base64Match) {
        try {
          const rawExt = base64Match[1].toLowerCase();
          const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'svg+xml' ? 'svg' : rawExt);
          const buffer = Buffer.from(base64Match[2], 'base64');
          const filename = `student_${user.user_id || user.regNo || user.id || 'student'}_${Date.now()}.${ext}`;
          const filePath = path.join(avatarsDir, filename);
          fs.writeFileSync(filePath, buffer);
        } catch (fileErr) {
          console.warn('[Storage] File write warning:', fileErr.message);
        }
      }
    }

    // Update database record with the full image data
    user.profileImage = savedImageUrl;
    user.profilePhoto = savedImageUrl;
    user.avatarUrl = savedImageUrl;
    user.updatedAt = new Date().toISOString();

    saveDatabase();

    res.json({
      success: true,
      message: 'Profile photo updated and saved to database successfully.',
      profileImage: savedImageUrl,
      profilePhoto: savedImageUrl,
      avatarUrl: savedImageUrl,
      user: {
        id: user.id,
        user_id: user.user_id || user.userId || '',
        name: user.name,
        email: user.email,
        profileImage: savedImageUrl,
        profilePhoto: savedImageUrl,
        avatarUrl: savedImageUrl
      }
    });
  } catch (err) {
    console.error('Photo Upload Error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload photo: ' + err.message });
  }
});

/**
 * @route   DELETE /api/student/delete-photo
 * @desc    Remove student profile photo from database and delete storage file
 */
router.delete('/delete-photo', (req, res) => {
  try {
    const myIds = getStudentIdentifiers(req.user);
    const user = (db.users || []).find(u => {
      const uIds = [u.id, u.user_id, u.userId, u.regNo, u.username, u.email].filter(Boolean).map(s => String(s).toLowerCase().trim());
      return myIds.some(id => uIds.includes(id));
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Student user account not found.' });
    }

    const avatarsDir = path.join(config.UPLOAD_DIR || path.join(__dirname, '../uploads'), 'avatars');
    const oldImage = user.profileImage || user.profilePhoto || user.avatarUrl || '';
    if (oldImage && oldImage.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(oldImage);
      const oldFilePath = path.join(avatarsDir, oldFilename);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {}
    }

    user.profileImage = '';
    user.profilePhoto = '';
    user.avatarUrl = '';
    user.updatedAt = new Date().toISOString();

    saveDatabase();

    res.json({
      success: true,
      message: 'Profile photo removed from database.',
      user: {
        id: user.id,
        user_id: user.user_id || user.userId || '',
        name: user.name,
        profileImage: '',
        profilePhoto: '',
        avatarUrl: ''
      }
    });
  } catch (err) {
    console.error('Error deleting student photo:', err);
    res.status(500).json({ success: false, error: 'Failed to remove photo.' });
  }
});

/**
 * @route   POST /api/student/toggle-exercise
 * @desc    Toggle exercise completion state in student workout plan
 */
router.post('/toggle-exercise', (req, res) => {
  const { exerciseIndex, completed, progressDate } = req.body;
  const myIds = getStudentIdentifiers(req.user);
  
  let plan = db.workoutPlans.find(w => {
    const wId = String(w.studentId || '').toLowerCase().trim();
    const wName = String(w.studentName || '').toLowerCase().trim();
    return myIds.includes(wId) || myIds.includes(wName);
  });

  if (!plan && db.gymRequests) {
    const approvedReq = db.gymRequests.find(r => {
      return matchesStudentLog(r, myIds) && r.status === 'approved' && r.assignedExercises && r.assignedExercises.length > 0;
    });
    if (approvedReq) {
      plan = {
        studentId: approvedReq.studentRegNo || approvedReq.studentId || approvedReq.userId,
        studentName: approvedReq.studentName,
        coachId: approvedReq.approvedBy || approvedReq.preferredCoach || 'Coach',
        weeklyExercises: [...approvedReq.assignedExercises],
        coachNotes: approvedReq.coachNotes || approvedReq.coachComment || '',
        updatedAt: new Date().toISOString()
      };
      db.workoutPlans.push(plan);
    }
  }

  if (!plan || !plan.weeklyExercises || !plan.weeklyExercises[exerciseIndex]) {
    return res.status(404).json({ success: false, error: 'Exercise plan or item not found.' });
  }

  let exercise = plan.weeklyExercises[exerciseIndex];
  if (typeof exercise === 'string') {
    exercise = { name: exercise, completed: false, progressDate: null };
    plan.weeklyExercises[exerciseIndex] = exercise;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  exercise.completed = Boolean(completed);
  exercise.progressDate = progressDate || todayStr;

  plan.updatedAt = new Date().toISOString();

  saveDatabase();

  res.json({ success: true, message: 'Exercise progress updated in DB.', plan });
});

module.exports = router;
