const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { db, saveDatabase, generateNextUserId } = require('../db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { isNoticeVisibleToUser } = require('./notices');

router.use(authenticateToken);
router.use(authorizeRoles('admin'));

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get complete system-wide live database overview statistics
 */
router.get('/dashboard', (req, res) => {
  const allUsers = db.users || [];
  const allEquip = db.equipment || [];
  const allFacilities = db.facilities || [];
  const allEvents = db.events || [];
  const allNotices = db.notices || [];
  const visibleNotices = allNotices.filter(n => isNoticeVisibleToUser(n, req.user || { role: 'admin' }));
  const allRequests = db.gymRequests || [];
  const allBorrowLogs = db.borrowLogs || [];
  const allMessages = db.contactMessages || [];

  const students = allUsers.filter(u => u.role && u.role.toLowerCase() === 'student');
  const coaches = allUsers.filter(u => u.role && u.role.toLowerCase() === 'coach');
  const storekeepers = allUsers.filter(u => u.role && u.role.toLowerCase() === 'storekeeper');
  const admins = allUsers.filter(u => u.role && u.role.toLowerCase() === 'admin');

  const totalEquipCount = allEquip.reduce((sum, e) => sum + (e.totalQty || e.availableQty || e.available || 0), 0);
  const availableEqp = allEquip.reduce((sum, e) => sum + (e.availableQty || e.available || 0), 0);
  const borrowedEqp = allEquip.reduce((sum, e) => sum + (e.borrowedQty || e.borrowed || 0), 0);
  const damagedEqp = allEquip.reduce((sum, e) => sum + (e.damagedQty || e.damaged || 0), 0);

  const availableFacilitiesCount = allFacilities.filter(f => f.status === 'available').length;
  const pendingRequestsCount = allRequests.filter(r => r.status === 'pending').length;
  const approvedRequestsCount = allRequests.filter(r => r.status === 'approved').length;
  const activeBorrowingsCount = allBorrowLogs.filter(b => b.status === 'borrowed').length;

  res.json({
    success: true,
    stats: {
      totalUsers: allUsers.length,
      totalStudents: students.length,
      totalCoaches: coaches.length,
      totalStorekeepers: storekeepers.length,
      totalAdmins: admins.length,
      totalEquipmentTypes: allEquip.length,
      totalEquipment: totalEquipCount > 0 ? totalEquipCount : allEquip.length,
      availableEquipment: availableEqp,
      borrowedEquipment: borrowedEqp,
      damagedEquipment: damagedEqp,
      totalFacilities: allFacilities.length,
      availableFacilities: availableFacilitiesCount,
      totalEvents: allEvents.length,
      totalNotices: allNotices.length,
      pendingGymRequests: pendingRequestsCount,
      approvedGymRequests: approvedRequestsCount,
      totalBorrowLogs: allBorrowLogs.length,
      activeBorrowings: activeBorrowingsCount,
      contactMessagesCount: allMessages.length,
      equipmentBreakdown: {
        available: availableEqp,
        borrowed: borrowedEqp,
        damaged: damagedEqp
      }
    },
    currentAdmin: (() => {
      const reqId = String(req.user?.id || req.user?.user_id || req.user?.userId || '').toLowerCase();
      const adminUser = allUsers.find(u => {
        const uId = String(u.id || '').toLowerCase();
        const uUid = String(u.user_id || u.userId || '').toLowerCase();
        return (reqId && (uId === reqId || uUid === reqId)) || (u.role === 'admin');
      });
      if (!adminUser) return null;
      return {
        id: adminUser.id,
        user_id: adminUser.user_id || adminUser.userId || 'US001',
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        department: adminUser.department || 'Administration',
        profileImage: adminUser.profileImage || adminUser.profilePhoto || adminUser.avatarUrl || '',
        profilePhoto: adminUser.profilePhoto || adminUser.profileImage || adminUser.avatarUrl || '',
        memberSince: adminUser.createdAt ? new Date(adminUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'RUSL Staff'
      };
    })(),
    users: allUsers.map(u => ({
      id: u.id,
      user_id: u.user_id || u.userId || '',
      userId: u.user_id || u.userId || '',
      regNo: u.regNo || u.username || '',
      username: u.username || u.regNo || '',
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department || 'General',
      rfidTag: u.rfidTag || '',
      profileImage: u.profileImage || u.profilePhoto || u.avatarUrl || '',
      profilePhoto: u.profilePhoto || u.profileImage || u.avatarUrl || '',
      status: u.status || 'active',
      createdAt: u.createdAt
    })),
    equipment: allEquip,
    facilities: allFacilities,
    events: allEvents,
    notices: allNotices,
    gymRequests: allRequests,
    borrowLogs: allBorrowLogs,
    contactMessages: allMessages
  });
});

/**
 * @route   POST /api/admin/create-user
 * @desc    Admin endpoint to create student, coach, storekeeper, or admin user
 */
router.post('/create-user', async (req, res) => {
  try {
    const { regNo, name, email, password, role, rfidTag, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, error: 'Name, Email, Password, and Role are required.' });
    }

    const normalizedRole = role.toLowerCase().trim();
    const validRoles = ['student', 'coach', 'storekeeper', 'admin'];
    if (!validRoles.includes(normalizedRole)) {
      return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    const finalRegNo = (regNo || '').trim().toUpperCase() || (
      normalizedRole === 'student' ? 'STU' + Date.now().toString().slice(-4) :
      normalizedRole === 'coach' ? 'COACH' + Date.now().toString().slice(-4) :
      normalizedRole === 'storekeeper' ? 'STORE' + Date.now().toString().slice(-4) :
      'ADMIN' + Date.now().toString().slice(-4)
    );

    const existing = db.users.find(u => 
      ((u.regNo || '').toLowerCase() === finalRegNo.toLowerCase()) || 
      ((u.email || '').toLowerCase() === email.toLowerCase().trim()) ||
      ((u.username || '').toLowerCase() === finalRegNo.toLowerCase())
    );
    if (existing) {
      return res.status(400).json({ success: false, error: 'User with this Registration No/Username or Email already exists.' });
    }

    const user_id = generateNextUserId();
    const passwordHash = await bcrypt.hash(password, 10);
    const cleanRfid = (rfidTag || '').trim().toUpperCase();
    const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const normalizedInput = normalizeTag(cleanRfid);

    if (normalizedInput) {
      // 1. Check duplicate user
      const duplicateUser = db.users.find(u => {
        const uTag = normalizeTag(u.rfidTag || u.rfidCode);
        return uTag && uTag === normalizedInput;
      });
      if (duplicateUser) {
        return res.status(400).json({
          success: false,
          error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to user ${duplicateUser.name} (${duplicateUser.user_id || duplicateUser.regNo}).`
        });
      }

      // 2. Check duplicate equipment
      const duplicateEquipment = (db.equipment || []).find(e => {
        const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
        return eTag && eTag === normalizedInput;
      });
      if (duplicateEquipment) {
        return res.status(400).json({
          success: false,
          error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to equipment item '${duplicateEquipment.name}' (${duplicateEquipment.id}).`
        });
      }
    }

    const newUser = {
      id: 'usr_' + Date.now(),
      user_id,
      userId: user_id,
      regNo: finalRegNo,
      username: finalRegNo,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: normalizedRole,
      rfidTag: cleanRfid,
      rfidCode: cleanRfid,
      department: department || (normalizedRole === 'admin' ? 'Administration' : (normalizedRole === 'storekeeper' ? 'Sports Store' : (normalizedRole === 'coach' ? 'Sports Coaching' : 'General'))),
      status: 'active',
      avatarUrl: '',
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    saveDatabase();

    res.status(201).json({ success: true, message: 'User created successfully.', user: newUser });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ success: false, error: 'Failed to create user.' });
  }
});

/**
 * @route   PATCH /api/admin/user/:id
 * @desc    Update user details
 */
router.patch('/user/:id', async (req, res) => {
  try {
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const { name, email, role, rfidTag, department, password, status } = req.body;
    if (name) user.name = name.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (role) {
      const validRoles = ['student', 'coach', 'storekeeper', 'admin'];
      const r = role.toLowerCase().trim();
      if (validRoles.includes(r)) user.role = r;
    }
    if (rfidTag !== undefined) {
      const cleanRfid = (rfidTag || '').trim().toUpperCase();
      const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const normalizedInput = normalizeTag(cleanRfid);

      if (normalizedInput) {
        // 1. Check duplicate user
        const duplicateUser = db.users.find(u => {
          if (String(u.id) === String(user.id)) return false;
          const uTag = normalizeTag(u.rfidTag || u.rfidCode);
          return uTag && uTag === normalizedInput;
        });

        if (duplicateUser) {
          return res.status(400).json({
            success: false,
            error: `RFID Card Already In Use: Tag ${cleanRfid} is already assigned to user ${duplicateUser.name} (${duplicateUser.user_id || duplicateUser.regNo}).`
          });
        }

        // 2. Check duplicate equipment
        const duplicateEquipment = (db.equipment || []).find(e => {
          const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
          return eTag && eTag === normalizedInput;
        });

        if (duplicateEquipment) {
          return res.status(400).json({
            success: false,
            error: `RFID Card Already In Use: Tag ${cleanRfid} is already assigned to equipment item '${duplicateEquipment.name}' (${duplicateEquipment.id}).`
          });
        }
      }

      user.rfidTag = cleanRfid;
      user.rfidCode = cleanRfid;
    }
    if (department) user.department = department;
    if (status) user.status = status;
    if (password && password.length >= 6) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    saveDatabase();
    res.json({ success: true, message: 'User updated successfully.', user });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ success: false, error: 'Failed to update user.' });
  }
});

/**
 * @route   DELETE /api/admin/user/:id
 * @desc    Delete user account
 */
router.delete('/user/:id', (req, res) => {
  const index = db.users.findIndex(u => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  const deleted = db.users.splice(index, 1);
  saveDatabase();

  res.json({ success: true, message: 'User deleted successfully.', user: deleted[0] });
});

/**
 * @route   POST /api/admin/create-notice
 * @desc    Publish a system-wide notice/broadcast
 */
router.post('/create-notice', (req, res) => {
  const { title, message, visibleTo, priority } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, error: 'Title and Message are required.' });
  }

  const newNotice = {
    id: 'not_' + Date.now(),
    title: title.trim(),
    message: message.trim(),
    visibleTo: (visibleTo || 'all').toLowerCase().trim(),
    priority: (priority || 'normal').toLowerCase().trim(),
    createdBy: req.user.name || 'Administrator',
    creatorRole: 'admin',
    creatorId: req.user.id || req.user.user_id || req.user.regNo || '',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!db.notices) db.notices = [];
  db.notices.unshift(newNotice);
  saveDatabase();

  res.status(201).json({ success: true, message: 'Notice published.', notice: newNotice });
});

/**
 * @route   DELETE /api/admin/notice/:id
 * @desc    Delete notice
 */
router.delete('/notice/:id', (req, res) => {
  if (!db.notices) return res.status(404).json({ success: false, error: 'Notice not found.' });

  const index = db.notices.findIndex(n => n.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Notice not found.' });
  }

  db.notices.splice(index, 1);
  saveDatabase();

  res.json({ success: true, message: 'Notice deleted successfully.' });
});

/**
 * @route   POST /api/admin/facility
 * @desc    Add new sports facility to database
 */
router.post('/facility', (req, res) => {
  const { name, description, hours, location, status, type, iconClass } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Facility name is required.' });
  }

  const newFac = {
    id: 'fac_' + Date.now(),
    name,
    description: description || '',
    hours: hours || '6 AM - 10 PM',
    location: location || 'Sports Complex',
    status: status || 'available',
    type: type || 'gym',
    iconClass: iconClass || 'fa-dumbbell'
  };

  if (!db.facilities) db.facilities = [];
  db.facilities.push(newFac);
  saveDatabase();

  res.status(201).json({ success: true, message: 'Facility created successfully.', facility: newFac });
});

/**
 * @route   PATCH /api/admin/facility/:id
 * @desc    Update facility availability status or details
 */
router.patch('/facility/:id', (req, res) => {
  if (!db.facilities) return res.status(404).json({ success: false, error: 'Facility not found.' });

  const fac = db.facilities.find(f => f.id === req.params.id || f.name.toLowerCase() === req.params.id.toLowerCase());
  if (!fac) {
    return res.status(404).json({ success: false, error: 'Facility not found.' });
  }

  const { name, description, hours, location, status, type, iconClass } = req.body;
  if (name !== undefined) fac.name = name;
  if (description !== undefined) fac.description = description;
  if (hours !== undefined) fac.hours = hours;
  if (location !== undefined) fac.location = location;
  if (status !== undefined) fac.status = status;
  if (type !== undefined) fac.type = type;
  if (iconClass !== undefined) fac.iconClass = iconClass;

  saveDatabase();

  res.json({ success: true, message: 'Facility updated successfully.', facility: fac });
});

/**
 * @route   POST /api/admin/equipment
 * @desc    Add new equipment to database
 */
router.post('/equipment', (req, res) => {
  const { name, category, totalQty, sportsRoom, location, description, rfidTag } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, error: 'Equipment name is required.' });
  }

  const cleanRfid = (rfidTag || '').trim().toUpperCase();
  const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const normalizedInput = normalizeTag(cleanRfid);

  if (normalizedInput) {
    // 1. Check duplicate equipment
    const dupEq = (db.equipment || []).find(e => {
      const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
      return eTag && eTag === normalizedInput;
    });
    if (dupEq) {
      return res.status(400).json({
        success: false,
        error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to equipment item '${dupEq.name}' (${dupEq.id}).`
      });
    }

    // 2. Check duplicate user
    const dupUser = (db.users || []).find(u => {
      const uTag = normalizeTag(u.rfidTag || u.rfidCode);
      return uTag && uTag === normalizedInput;
    });
    if (dupUser) {
      return res.status(400).json({
        success: false,
        error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to user ${dupUser.name} (${dupUser.user_id || dupUser.regNo}).`
      });
    }
  }

  const qty = parseInt(totalQty) || 1;
  const newEquip = {
    id: 'eqp_' + Date.now(),
    name,
    category: category || 'Sports Equipment',
    totalQty: qty,
    availableQty: qty,
    borrowedQty: 0,
    damagedQty: 0,
    status: 'available',
    sportsRoom: sportsRoom || location || 'Main Gym Hall',
    location: location || sportsRoom || 'Building A',
    description: description || '',
    rfidTag: cleanRfid,
    rfidCode: cleanRfid
  };

  if (!db.equipment) db.equipment = [];
  db.equipment.push(newEquip);
  saveDatabase();

  res.status(201).json({ success: true, message: 'Equipment added successfully.', equipment: newEquip });
});

/**
 * @route   PATCH /api/admin/equipment/:id
 * @desc    Update equipment details or status
 */
router.patch('/equipment/:id', (req, res) => {
  if (!db.equipment) return res.status(404).json({ success: false, error: 'Equipment not found.' });

  const eq = db.equipment.find(e => String(e.id) === String(req.params.id) || e.name.toLowerCase() === req.params.id.toLowerCase());
  if (!eq) {
    return res.status(404).json({ success: false, error: 'Equipment not found.' });
  }

  const { name, category, totalQty, availableQty, borrowedQty, damagedQty, status, sportsRoom, location, rfidTag } = req.body;

  if (rfidTag !== undefined) {
    const cleanRfid = (rfidTag || '').trim().toUpperCase();
    const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const normalizedInput = normalizeTag(cleanRfid);

    if (normalizedInput) {
      // 1. Check duplicate equipment
      const dupEq = (db.equipment || []).find(e => {
        if (String(e.id) === String(eq.id)) return false;
        const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
        return eTag && eTag === normalizedInput;
      });
      if (dupEq) {
        return res.status(400).json({
          success: false,
          error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to equipment item '${dupEq.name}' (${dupEq.id}).`
        });
      }

      // 2. Check duplicate user
      const dupUser = (db.users || []).find(u => {
        const uTag = normalizeTag(u.rfidTag || u.rfidCode);
        return uTag && uTag === normalizedInput;
      });
      if (dupUser) {
        return res.status(400).json({
          success: false,
          error: `RFID Tag Already In Use: Tag ${cleanRfid} is already assigned to user ${dupUser.name} (${dupUser.user_id || dupUser.regNo}).`
        });
      }
    }

    eq.rfidTag = cleanRfid;
    eq.rfidCode = cleanRfid;
    eq.rfid = cleanRfid;
  }

  if (name !== undefined) eq.name = name;
  if (category !== undefined) eq.category = category;
  if (totalQty !== undefined) eq.totalQty = parseInt(totalQty) || eq.totalQty;
  if (availableQty !== undefined) eq.availableQty = parseInt(availableQty) || eq.availableQty;
  if (borrowedQty !== undefined) eq.borrowedQty = parseInt(borrowedQty) || eq.borrowedQty;
  if (damagedQty !== undefined) eq.damagedQty = parseInt(damagedQty) || eq.damagedQty;
  if (status !== undefined) eq.status = status;
  if (sportsRoom !== undefined) eq.sportsRoom = sportsRoom;
  if (location !== undefined) eq.location = location;

  saveDatabase();

  res.json({ success: true, message: 'Equipment updated successfully.', equipment: eq });
});

/**
 * @route   DELETE /api/admin/equipment/:id
 * @desc    Delete equipment from database
 */
router.delete('/equipment/:id', (req, res) => {
  if (!db.equipment) return res.status(404).json({ success: false, error: 'Equipment not found.' });

  const targetId = String(req.params.id || '').toLowerCase().trim();
  const index = db.equipment.findIndex(e => String(e.id).toLowerCase().trim() === targetId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Equipment not found.' });
  }

  const deleted = db.equipment.splice(index, 1);
  saveDatabase();

  res.json({ success: true, message: 'Equipment deleted successfully.', equipment: deleted[0] });
});

/**
 * @route   GET /api/admin/events
 * @desc    Get all sports events for admin management
 */
router.get('/events', (req, res) => {
  const events = db.events || [];
  res.json({
    success: true,
    events,
    totalCount: events.length
  });
});

/**
 * @route   POST /api/admin/event
 * @desc    Create and publish new sports event
 */
router.post('/event', (req, res) => {
  const { title, description, date, day, month, location, participants, category } = req.body;
  if (!title || !date) {
    return res.status(400).json({ success: false, error: 'Event title and date are required.' });
  }

  const d = new Date(date);
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const newEvt = {
    id: 'evt_' + Date.now(),
    title: String(title).trim(),
    description: description ? String(description).trim() : '',
    date,
    day: day || String(d.getDate()).padStart(2, '0'),
    month: month || monthNames[d.getMonth()] || 'SEP',
    location: location ? String(location).trim() : 'Main Sports Complex',
    participants: participants ? String(participants).trim() : 'Open to All Students',
    category: category || 'sports',
    createdBy: req.user?.name || 'Administrator',
    createdAt: new Date().toISOString(),
    status: 'upcoming'
  };

  if (!db.events) db.events = [];
  db.events.unshift(newEvt); // Add to top

  // Also publish a system broadcast notification
  if (!db.notices) db.notices = [];
  db.notices.unshift({
    id: 'not_evt_' + Date.now(),
    title: `🎉 New Event: ${newEvt.title}`,
    message: `A new sports event has been scheduled for ${newEvt.date} at ${newEvt.location}. ${newEvt.description || ''}`,
    priority: 'high',
    visibleTo: 'all',
    createdBy: req.user?.name || 'Sports Department',
    createdAt: new Date().toISOString()
  });

  saveDatabase();

  res.status(201).json({ success: true, message: 'Event published successfully.', event: newEvt });
});

/**
 * @route   PATCH /api/admin/event/:id
 * @desc    Update existing sports event
 */
router.patch('/event/:id', (req, res) => {
  if (!db.events) db.events = [];
  const event = db.events.find(e => e.id === req.params.id);
  if (!event) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  const { title, description, date, day, month, location, participants, category, status } = req.body;

  if (title !== undefined) event.title = String(title).trim();
  if (description !== undefined) event.description = String(description).trim();
  if (location !== undefined) event.location = String(location).trim();
  if (participants !== undefined) event.participants = String(participants).trim();
  if (category !== undefined) event.category = category;
  if (status !== undefined) event.status = status;

  if (date) {
    event.date = date;
    const d = new Date(date);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    event.day = day || String(d.getDate()).padStart(2, '0');
    event.month = month || monthNames[d.getMonth()] || 'SEP';
  }

  event.updatedAt = new Date().toISOString();
  saveDatabase();

  res.json({ success: true, message: 'Event updated successfully.', event });
});

/**
 * @route   DELETE /api/admin/event/:id
 * @desc    Delete event from database
 */
router.delete('/event/:id', (req, res) => {
  if (!db.events) return res.status(404).json({ success: false, error: 'Event not found.' });

  const index = db.events.findIndex(e => e.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Event not found.' });
  }

  const deleted = db.events.splice(index, 1);
  saveDatabase();

  res.json({ success: true, message: 'Event deleted successfully.', event: deleted[0] });
});

/**
 * @route   POST /api/admin/profile-photo
 * @desc    Upload and update admin profile photo in database (automatically deletes old photo file)
 */
router.post('/profile-photo', (req, res) => {
  try {
    const { image, profileImage, profilePhoto } = req.body;
    const rawImage = image || profileImage || profilePhoto;

    if (!rawImage || typeof rawImage !== 'string' || !rawImage.trim()) {
      return res.status(400).json({ success: false, error: 'Image data is required.' });
    }

    const allUsers = db.users || [];
    const reqId = String(req.user?.id || req.user?.user_id || req.user?.userId || '').toLowerCase();
    const adminUser = allUsers.find(u => {
      const uId = String(u.id || '').toLowerCase();
      const uUid = String(u.user_id || u.userId || '').toLowerCase();
      return (reqId && (uId === reqId || uUid === reqId)) || (u.role === 'admin');
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user account not found.' });
    }

    const avatarsDir = path.join(config.UPLOAD_DIR, 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    // Automatically delete old profile image file from storage if it exists
    const oldImage = adminUser.profileImage || adminUser.profilePhoto || adminUser.avatarUrl || '';
    if (oldImage && oldImage.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(oldImage);
      const oldFilePath = path.join(avatarsDir, oldFilename);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(`[Storage] Automatically deleted old profile photo: ${oldFilename}`);
        }
      } catch (err) {
        console.warn(`[Storage] Could not delete old photo file ${oldFilename}:`, err.message);
      }
    }

    let savedImageUrl = '';
    const base64Match = rawImage.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);

    if (base64Match) {
      const rawExt = base64Match[1].toLowerCase();
      const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'svg+xml' ? 'svg' : rawExt);
      const buffer = Buffer.from(base64Match[2], 'base64');
      const filename = `admin_${adminUser.user_id || adminUser.id || 'admin'}_${Date.now()}.${ext}`;
      const filePath = path.join(avatarsDir, filename);

      fs.writeFileSync(filePath, buffer);
      savedImageUrl = `/uploads/avatars/${filename}`;
    } else if (rawImage.startsWith('http://') || rawImage.startsWith('https://') || rawImage.startsWith('/uploads/')) {
      savedImageUrl = rawImage;
    } else {
      savedImageUrl = rawImage;
    }

    // Update database record
    adminUser.profileImage = savedImageUrl;
    adminUser.profilePhoto = savedImageUrl;
    adminUser.avatarUrl = savedImageUrl;
    adminUser.updatedAt = new Date().toISOString();

    saveDatabase();

    res.json({
      success: true,
      message: 'Profile photo updated and saved to database successfully.',
      profileImage: savedImageUrl,
      user: {
        id: adminUser.id,
        user_id: adminUser.user_id || adminUser.userId || '',
        name: adminUser.name,
        email: adminUser.email,
        profileImage: savedImageUrl
      }
    });
  } catch (err) {
    console.error('Error updating admin profile photo:', err);
    res.status(500).json({ success: false, error: 'Failed to save profile photo in database.' });
  }
});

/**
 * @route   DELETE /api/admin/profile-photo
 * @desc    Remove admin profile photo from database and delete storage file
 */
router.delete('/profile-photo', (req, res) => {
  try {
    const allUsers = db.users || [];
    const reqId = String(req.user?.id || req.user?.user_id || req.user?.userId || '').toLowerCase();
    const adminUser = allUsers.find(u => {
      const uId = String(u.id || '').toLowerCase();
      const uUid = String(u.user_id || u.userId || '').toLowerCase();
      return (reqId && (uId === reqId || uUid === reqId)) || (u.role === 'admin');
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user account not found.' });
    }

    const avatarsDir = path.join(config.UPLOAD_DIR, 'avatars');
    const oldImage = adminUser.profileImage || adminUser.profilePhoto || adminUser.avatarUrl || '';
    if (oldImage && oldImage.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(oldImage);
      const oldFilePath = path.join(avatarsDir, oldFilename);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(`[Storage] Deleted profile photo: ${oldFilename}`);
        }
      } catch (err) {
        console.warn(`[Storage] Could not delete photo file ${oldFilename}:`, err.message);
      }
    }

    adminUser.profileImage = '';
    adminUser.profilePhoto = '';
    adminUser.avatarUrl = '';
    adminUser.updatedAt = new Date().toISOString();

    saveDatabase();

    res.json({
      success: true,
      message: 'Profile photo removed from database.',
      profileImage: ''
    });
  } catch (err) {
    console.error('Error deleting admin profile photo:', err);
    res.status(500).json({ success: false, error: 'Failed to delete profile photo.' });
  }
});

/**
 * @route   PUT /api/admin/profile
 * @desc    Update admin personal details (name, email) in database
 */
router.put('/profile', (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    const allUsers = db.users || [];
    const reqId = String(req.user?.id || req.user?.user_id || req.user?.userId || '').toLowerCase();
    const adminUser = allUsers.find(u => {
      const uId = String(u.id || '').toLowerCase();
      const uUid = String(u.user_id || u.userId || '').toLowerCase();
      return (reqId && (uId === reqId || uUid === reqId)) || (u.role === 'admin');
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Admin user account not found.' });
    }

    adminUser.name = name.trim();
    adminUser.email = email.trim().toLowerCase();
    adminUser.updatedAt = new Date().toISOString();

    saveDatabase();

    res.json({
      success: true,
      message: 'Profile details updated in database.',
      user: {
        id: adminUser.id,
        user_id: adminUser.user_id || adminUser.userId || '',
        name: adminUser.name,
        email: adminUser.email,
        profileImage: adminUser.profileImage || adminUser.profilePhoto || ''
      }
    });
  } catch (err) {
    console.error('Error updating admin profile:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

module.exports = router;
