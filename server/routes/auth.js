const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db, saveDatabase, generateNextUserId } = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new student account
 */
router.post('/register', async (req, res) => {
  try {
    const { regNo, name, email, password, department, faculty, rfidTag, phone, gender, year, age, height, weight, fitnessLevel } = req.body;

    if (!regNo || !name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Registration No, Name, Email and Password are required.' });
    }

    const trimmedRegNo = regNo.trim().toUpperCase();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const cleanDept = (faculty || department || 'General').trim();
    const cleanFaculty = (faculty || department || 'General').trim();

    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    if (!db.users) db.users = [];

    // Check duplicate Registration No or Username across all accounts
    const existingReg = db.users.find(u => {
      const uReg = (u.regNo || '').toLowerCase().trim();
      const uUser = (u.username || '').toLowerCase().trim();
      const uId = (u.user_id || u.userId || '').toLowerCase().trim();
      const target = trimmedRegNo.toLowerCase();
      return uReg === target || uUser === target || uId === target;
    });
    if (existingReg) {
      return res.status(400).json({ success: false, error: `An account with Registration Number "${trimmedRegNo}" already exists.` });
    }

    // Check duplicate Email across all accounts
    const existingEmail = db.users.find(
      u => u.email && u.email.toLowerCase().trim() === trimmedEmail
    );
    if (existingEmail) {
      return res.status(400).json({ success: false, error: `An account with Email "${trimmedEmail}" already exists.` });
    }

    // Check duplicate RFID Tag if provided
    let cleanRfidTag = '';
    if (rfidTag) {
      const cleanRfid = rfidTag.trim().toUpperCase();
      const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const normalized = normalizeTag(cleanRfid);

      if (normalized) {
        const dupUser = db.users.find(u => {
          const uTag = normalizeTag(u.rfidTag || u.rfidCode);
          return uTag && uTag === normalized;
        });
        if (dupUser) {
          return res.status(400).json({
            success: false,
            error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to user ${dupUser.name} (${dupUser.user_id || dupUser.regNo}).`
          });
        }

        const dupEquip = (db.equipment || []).find(e => {
          const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
          return eTag && eTag === normalized;
        });
        if (dupEquip) {
          return res.status(400).json({
            success: false,
            error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to equipment item '${dupEquip.name}'.`
          });
        }
        cleanRfidTag = cleanRfid;
      }
    }

    const user_id = generateNextUserId();
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      user_id,
      userId: user_id,
      regNo: trimmedRegNo,
      username: trimmedRegNo,
      name: trimmedName,
      email: trimmedEmail,
      phone: (phone || '').trim(),
      gender: (gender || '').trim(),
      year: (year || '').trim(),
      faculty: cleanFaculty,
      department: cleanDept,
      age: age || '',
      height: height || '',
      weight: weight || '',
      fitnessLevel: fitnessLevel || 'Not Set',
      injuryHistory: 'None',
      trainingGoal: 'General Fitness',
      bio: 'Member of Rajarata University Sports & Gym Club.',
      passwordHash,
      password,
      role: 'student',
      rfidTag: cleanRfidTag,
      rfidCode: cleanRfidTag,
      status: 'active',
      avatarUrl: '',
      profileImage: '',
      profilePhoto: '',
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    saveDatabase();

    res.status(201).json({
      success: true,
      message: 'Student registered successfully. You can now log in.',
      user: {
        id: newUser.id,
        user_id: newUser.user_id,
        userId: newUser.user_id,
        regNo: newUser.regNo,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        faculty: newUser.faculty,
        rfidTag: newUser.rfidTag
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ success: false, error: 'Server error during registration: ' + err.message });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Industrial Login authentication endpoint (supports User ID, Email, RegNo, or Username)
 */
router.post('/login', async (req, res) => {
  try {
    const { password, role } = req.body;
    const rawIdentifier = req.body.username || req.body.email || req.body.userId || req.body.user_id || req.body.regNo;

    if (!rawIdentifier || !password) {
      return res.status(400).json({ success: false, error: 'User ID / Email and Password are required.' });
    }

    const target = String(rawIdentifier).toLowerCase().trim();

    // Match user by user_id, regNo, username, email, name, or id
    const user = db.users.find(u => {
      const uUserId = (u.user_id || u.userId || '').toLowerCase().trim();
      const uReg = (u.regNo || '').toLowerCase().trim();
      const uUser = (u.username || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      const uId = (u.id || '').toLowerCase().trim();

      return (uUserId && uUserId === target) ||
             (uReg && uReg === target) ||
             (uUser && uUser === target) ||
             (uEmail && uEmail === target) ||
             (uName && uName === target) ||
             (uId && uId === target);
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid User ID, Email or Username.' });
    }

    // Check account status
    if (user.status && user.status.toLowerCase() !== 'active') {
      return res.status(403).json({ success: false, error: 'Account is deactivated. Please contact administrator.' });
    }

    // Verify password with bcrypt
    const cleanPwd = String(password).trim();
    let isMatch = false;
    if (user.passwordHash) {
      isMatch = await bcrypt.compare(cleanPwd, user.passwordHash);
      if (!isMatch && password !== cleanPwd) {
        isMatch = await bcrypt.compare(password, user.passwordHash);
      }
    } else if (user.password && (cleanPwd === user.password || password === user.password)) {
      isMatch = true;
      user.passwordHash = await bcrypt.hash(cleanPwd, 10);
      saveDatabase();
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Please check your password.' });
    }

    // Generate JWT payload & token
    const tokenPayload = {
      id: user.id,
      user_id: user.user_id || user.userId || 'US001',
      userId: user.user_id || user.userId || 'US001',
      regNo: user.regNo,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || 'General',
      rfidTag: user.rfidTag
    };

    const token = jwt.sign(tokenPayload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });

    // Track active session
    if (!db.sessions) db.sessions = [];
    db.sessions.push({
      userId: user.id,
      token,
      loggedInAt: new Date().toISOString(),
      revoked: false
    });
    saveDatabase();

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        user_id: user.user_id || user.userId,
        userId: user.user_id || user.userId,
        regNo: user.regNo,
        name: user.name,
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
        trainingGoal: user.trainingGoal || 'General Fitness',
        bio: user.bio || 'Member of Rajarata University Sports & Gym Club.',
        profilePhoto: user.profilePhoto || user.profileImage || user.avatarUrl || '',
        profileImage: user.profileImage || user.profilePhoto || user.avatarUrl || '',
        avatarUrl: user.avatarUrl || user.profilePhoto || user.profileImage || '',
        status: user.status || 'active'
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ success: false, error: 'Server error during authentication.' });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Industrial Logout endpoint (Revokes JWT token session)
 */
router.post('/logout', authenticateToken, (req, res) => {
  try {
    const token = req.token;
    if (db.sessions) {
      const session = db.sessions.find(s => s.token === token);
      if (session) {
        session.revoked = true;
        session.loggedOutAt = new Date().toISOString();
        saveDatabase();
      }
    }

    res.json({ success: true, message: 'Logged out successfully. Token invalidated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Logout failed.' });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Fetch current authenticated user profile
 */
router.get('/me', authenticateToken, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User profile not found.' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      user_id: user.user_id || user.userId,
      userId: user.user_id || user.userId,
      regNo: user.regNo,
      name: user.name,
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
      trainingGoal: user.trainingGoal || 'General Fitness',
      bio: user.bio || 'Member of Rajarata University Sports & Gym Club.',
      profilePhoto: user.profilePhoto || user.profileImage || user.avatarUrl || '',
      profileImage: user.profileImage || user.profilePhoto || user.avatarUrl || '',
      avatarUrl: user.avatarUrl || user.profilePhoto || user.profileImage || '',
      status: user.status || 'active'
    }
  });
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password for authenticated user (verifies current password, hashes new password with bcrypt, saves to database)
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current Password and New Password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
    }

    const reqId = String(req.user?.id || req.user?.user_id || req.user?.userId || '').toLowerCase();
    const reqEmail = String(req.user?.email || '').toLowerCase();
    const reqUsername = String(req.user?.username || req.user?.regNo || '').toLowerCase();

    const user = db.users.find(u => {
      const uId = String(u.id || '').toLowerCase();
      const uUid = String(u.user_id || u.userId || '').toLowerCase();
      const uEmail = String(u.email || '').toLowerCase();
      const uReg = String(u.regNo || u.username || '').toLowerCase();
      return (reqId && (uId === reqId || uUid === reqId)) ||
             (reqEmail && uEmail === reqEmail) ||
             (reqUsername && uReg === reqUsername);
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User account not found.' });
    }

    // Verify current password
    let isMatch = false;
    if (user.passwordHash) {
      isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    } else if (user.password && currentPassword === user.password) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password. Please check and try again.' });
    }

    // Hash new password and update in database
    const newHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = newHash;
    user.password = newPassword;
    saveDatabase();

    res.json({
      success: true,
      message: 'Password changed successfully! Your new password is now active.'
    });
  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ success: false, error: 'Failed to update password.' });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Password recovery / reset endpoint
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email and new password are required.' });
    }

    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with this email address.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.password = newPassword;
    saveDatabase();

    res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset password.' });
  }
});

module.exports = router;
