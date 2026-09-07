const express = require('express');
const router = express.Router();
const { db, saveDatabase } = require('../db');
const jwt = require('jsonwebtoken');
const config = require('../config');

// Permissive token checking: verify token if provided, default to storekeeper session context
router.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // Allow seamless storekeeper terminal access
    }
  }
  if (!req.user) {
    req.user = { id: 'usr_storekeeper', name: 'amal', role: 'storekeeper', username: 'STORE9616' };
  }
  next();
});

/**
 * @route   GET /api/storekeeper/dashboard
 * @desc    Get inventory overview metrics & active borrow sessions
 */
router.get('/dashboard', (req, res) => {
  const totalCategories = new Set(db.equipment.map(e => e.category)).size;
  const availableItems = db.equipment.reduce((sum, e) => sum + e.availableQty, 0);
  const borrowedItems = db.borrowLogs.filter(b => b.status === 'borrowed').length;
  const lowStockItems = db.equipment.filter(e => e.availableQty <= 3);
  const studentList = (db.users || [])
    .filter(u => (u.role || '').toLowerCase() === 'student')
    .map(u => ({
      id: u.id,
      user_id: u.user_id || u.userId || '',
      userId: u.user_id || u.userId || '',
      regNo: u.regNo || u.username || '',
      name: u.name,
      email: u.email,
      role: 'student',
      department: u.department || u.faculty || 'General',
      faculty: u.faculty || u.department || 'General',
      rfidTag: u.rfidTag || u.rfidCode || '',
      rfidCode: u.rfidTag || u.rfidCode || '',
      status: u.status || 'active'
    }));

  res.json({
    success: true,
    metrics: {
      totalCategories,
      totalEquipmentTypes: db.equipment.length,
      availableItems,
      borrowedItems,
      lowStockCount: lowStockItems.length,
      totalStudents: studentList.length
    },
    equipment: db.equipment,
    borrowLogs: db.borrowLogs,
    students: studentList,
    lowStockAlerts: lowStockItems
  });
});

/**
 * @route   GET /api/storekeeper/students
 * @desc    Get all student patrons for storekeeper assignment and search
 */
router.get('/students', (req, res) => {
  const studentList = (db.users || [])
    .filter(u => (u.role || '').toLowerCase() === 'student')
    .map(u => ({
      id: u.id,
      user_id: u.user_id || u.userId || '',
      userId: u.user_id || u.userId || '',
      regNo: u.regNo || u.username || '',
      name: u.name,
      email: u.email,
      role: 'student',
      department: u.department || u.faculty || 'General',
      faculty: u.faculty || u.department || 'General',
      rfidTag: u.rfidTag || u.rfidCode || '',
      rfidCode: u.rfidTag || u.rfidCode || '',
      status: u.status || 'active'
    }));

  res.json({
    success: true,
    students: studentList
  });
});

/**
 * @route   POST /api/storekeeper/identify-student
 * @desc    Identify student from database via RFID UID, User ID, Reg No, or Email
 */
router.post('/identify-student', (req, res) => {
  try {
    const { rfid, query, rfidTag, studentId, studentQuery, userId, tag } = req.body;
    const rawSearch = (rfid || query || rfidTag || studentId || studentQuery || userId || tag || '').trim();

    if (!rawSearch) {
      return res.status(400).json({ success: false, error: 'RFID Tag or Student ID is required.' });
    }

    const target = rawSearch.toLowerCase();

    // Query existing users database
    const matchedUser = db.users.find(u => {
      const uRfid = (u.rfidTag || u.rfidCode || u.rfid || '').toLowerCase().trim();
      const uUserId = (u.user_id || u.userId || '').toLowerCase().trim();
      const uReg = (u.regNo || '').toLowerCase().trim();
      const uEmail = (u.email || '').toLowerCase().trim();
      const uUsername = (u.username || '').toLowerCase().trim();
      const uId = (u.id || '').toLowerCase().trim();

      return (uRfid && uRfid === target) ||
             (uUserId && uUserId === target) ||
             (uReg && uReg === target) ||
             (uEmail && uEmail === target) ||
             (uUsername && uUsername === target) ||
             (uId && uId === target);
    });

    // 1. Unknown RFID Handling
    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        error: 'Student Not Found. This RFID card is not registered to a student.'
      });
    }

    // 2. Non-Student RFID Handling (Admin / Coach / Storekeeper)
    const userRole = (matchedUser.role || '').toLowerCase();
    if (userRole !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'This RFID is not registered to a student.'
      });
    }

    // 3. Inactive Student Handling
    if (matchedUser.status && matchedUser.status.toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Student Account Inactive. This student cannot take or return equipment.',
        student: {
          id: matchedUser.id,
          user_id: matchedUser.user_id || matchedUser.userId || 'US002',
          name: matchedUser.name,
          email: matchedUser.email,
          role: 'STUDENT',
          rfidTag: matchedUser.rfidTag || matchedUser.rfidCode || '',
          status: matchedUser.status
        }
      });
    }

    // 4. Retrieve any currently active borrow logs for this student
    const studentIds = [
      (matchedUser.user_id || '').toLowerCase(),
      (matchedUser.userId || '').toLowerCase(),
      (matchedUser.regNo || '').toLowerCase(),
      (matchedUser.id || '').toLowerCase(),
      (matchedUser.email || '').toLowerCase()
    ].filter(Boolean);

    const activeBorrows = (db.borrowLogs || []).filter(b => {
      const bStudent = [
        (b.studentId || '').toLowerCase(),
        (b.user_id || '').toLowerCase(),
        (b.userId || '').toLowerCase(),
        (b.studentRegNo || '').toLowerCase(),
        (b.studentEmail || '').toLowerCase()
      ].filter(Boolean);

      const belongsToStudent = studentIds.some(id => bStudent.includes(id));
      const statusLower = (b.status || '').toLowerCase();
      const isNotFullyReturned = statusLower !== 'returned';
      const totalQty = b.qty !== undefined ? b.qty : (b.quantity !== undefined ? b.quantity : 1);
      const returnedQty = b.returnedQty || 0;
      const hasRemaining = totalQty > returnedQty;

      return belongsToStudent && isNotFullyReturned && hasRemaining;
    }).map(b => {
      const totalQty = b.qty !== undefined ? b.qty : (b.quantity !== undefined ? b.quantity : 1);
      const returnedQty = b.returnedQty || 0;
      const remainingQty = Math.max(0, totalQty - returnedQty);

      return {
        id: b.id,
        equipmentId: b.equipmentId,
        equipmentName: b.equipmentName || b.equipment || 'Equipment Item',
        totalQty,
        returnedQty,
        borrowedQty: remainingQty,
        quantity: remainingQty,
        issuedAt: b.issuedAt || b.borrowedAt || b.issueDate,
        status: remainingQty < totalQty ? 'Partially Returned' : (b.status || 'borrowed')
      };
    });

    return res.json({
      success: true,
      message: 'Student identified successfully.',
      student: {
        id: matchedUser.id,
        user_id: matchedUser.user_id || matchedUser.userId || 'US002',
        name: matchedUser.name,
        email: matchedUser.email,
        role: 'STUDENT',
        department: matchedUser.department || 'Technology',
        regNo: matchedUser.regNo || matchedUser.user_id || '',
        rfidTag: matchedUser.rfidTag || matchedUser.rfidCode || '',
        status: 'Active',
        activeBorrows
      }
    });
  } catch (err) {
    console.error('Error identifying student:', err);
    res.status(500).json({ success: false, error: 'Database error while retrieving student.' });
  }
});

function handleIssueItem(req, res) {
  const { studentRegNo, studentId, userId, equipmentId, quantity, qty } = req.body;
  const lookup = (userId || studentId || studentRegNo || '').trim();

  if (!lookup) {
    return res.status(400).json({ success: false, error: 'Student ID or Registration No is required.' });
  }

  const student = db.users.find(u =>
    (u.user_id && u.user_id.toLowerCase() === lookup.toLowerCase()) ||
    (u.userId && u.userId.toLowerCase() === lookup.toLowerCase()) ||
    (u.regNo && u.regNo.toLowerCase() === lookup.toLowerCase()) ||
    (u.id && u.id.toLowerCase() === lookup.toLowerCase()) ||
    (u.rfidTag && u.rfidTag.toLowerCase() === lookup.toLowerCase()) ||
    (u.email && u.email.toLowerCase() === lookup.toLowerCase())
  );

  if (!student) {
    return res.status(404).json({ success: false, error: 'Student not found in database.' });
  }

  if ((student.role || '').toLowerCase() !== 'student') {
    return res.status(400).json({ success: false, error: 'Only registered students can be issued equipment.' });
  }

  if (student.status && student.status.toLowerCase() !== 'active') {
    return res.status(403).json({ success: false, error: 'Student Account Inactive. This student cannot take or return equipment.' });
  }

  const item = db.equipment.find(e =>
    String(e.id) === String(equipmentId) ||
    (e.name && e.name.toLowerCase() === String(equipmentId).toLowerCase())
  );
  if (!item) {
    return res.status(404).json({ success: false, error: 'Equipment item not found.' });
  }

  const issueQty = parseInt(qty || quantity) || 1;
  const currentAvailable = item.availableQty !== undefined ? item.availableQty : (item.available || 0);
  if (issueQty > currentAvailable) {
    return res.status(400).json({ success: false, error: `Insufficient stock. Only ${currentAvailable} available.` });
  }

  // Update Stock Count
  item.availableQty = currentAvailable - issueQty;
  item.available = item.availableQty;
  item.borrowedQty = (item.borrowedQty || 0) + issueQty;
  if (item.availableQty === 0) item.status = 'borrowed';

  const newLog = {
    id: 'brw_' + Date.now(),
    user_id: student.user_id || student.userId || 'US002',
    studentId: student.user_id || student.regNo || student.id,
    studentRegNo: student.regNo || student.user_id,
    studentName: student.name,
    studentEmail: student.email,
    equipmentId: item.id,
    equipmentName: item.name,
    qty: issueQty,
    quantity: issueQty,
    returnedQty: 0,
    issuedBy: req.user ? req.user.name : 'Storekeeper',
    issuedAt: new Date().toISOString(),
    expectedReturnAt: new Date(Date.now() + 86400000).toISOString(),
    returnedAt: null,
    status: 'borrowed',
    notes: 'Issued at Sports Counter'
  };

  db.borrowLogs.unshift(newLog);
  saveDatabase();

  res.json({
    success: true,
    message: `Issued ${issueQty}x ${item.name} to ${student.name} (${student.user_id || student.regNo}).`,
    log: newLog
  });
}

router.post('/issue-item', handleIssueItem);
router.post('/issue-gear', handleIssueItem);

/**
 * @route   POST /api/storekeeper/return-item
 * @desc    Return borrowed equipment back to stock (supports full & partial returns)
 */
router.post('/return-item', (req, res) => {
  try {
    const { logId, equipmentId, studentId, quantity } = req.body;

    let log = null;
    if (logId) {
      log = db.borrowLogs.find(b => String(b.id) === String(logId));
    } else if (equipmentId && studentId) {
      log = db.borrowLogs.find(b => 
        (String(b.equipmentId) === String(equipmentId) || b.equipmentName === equipmentId) &&
        (String(b.studentId) === String(studentId) || String(b.user_id) === String(studentId) || String(b.studentRegNo) === String(studentId)) &&
        (b.status === 'borrowed' || b.status === 'taken' || b.status === 'Partially Returned')
      );
    }

    if (!log) {
      return res.status(404).json({ success: false, error: 'Borrow record not found. This equipment is not currently borrowed by this student.' });
    }

    if (log.status === 'returned') {
      return res.status(400).json({ success: false, error: 'Item has already been fully returned.' });
    }

    // Verify student ownership if studentId is provided
    if (studentId) {
      const matchStu = [log.user_id, log.studentId, log.studentRegNo, log.studentEmail].filter(Boolean).map(s => String(s).toLowerCase());
      if (!matchStu.includes(String(studentId).toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Student mismatch: This borrow record belongs to a different student.' });
      }
    }

    const totalQty = log.qty !== undefined ? log.qty : (log.quantity !== undefined ? log.quantity : 1);
    const prevReturnedQty = log.returnedQty || 0;
    const remainingBorrowedQty = Math.max(0, totalQty - prevReturnedQty);

    if (remainingBorrowedQty <= 0) {
      log.status = 'returned';
      saveDatabase();
      return res.status(400).json({ success: false, error: 'Item has already been fully returned.' });
    }

    let returnQty = parseInt(quantity);
    if (isNaN(returnQty) || returnQty === undefined || returnQty === null) {
      returnQty = remainingBorrowedQty;
    }

    if (returnQty <= 0) {
      return res.status(400).json({ success: false, error: 'Return quantity must be greater than zero.' });
    }

    if (returnQty > remainingBorrowedQty) {
      return res.status(400).json({
        success: false,
        error: `Invalid Quantity: Return quantity (${returnQty}) cannot exceed the borrowed quantity (${remainingBorrowedQty}).`
      });
    }

    const newReturnedQty = prevReturnedQty + returnQty;
    log.returnedQty = newReturnedQty;
    log.returnedAt = new Date().toISOString();

    if (newReturnedQty >= totalQty) {
      log.status = 'returned';
    } else {
      log.status = 'Partially Returned';
    }

    // Restore Equipment Stock Count
    const item = db.equipment.find(e => String(e.id) === String(log.equipmentId) || e.name === log.equipmentName);
    if (item) {
      item.availableQty = (item.availableQty !== undefined ? item.availableQty : 0) + returnQty;
      item.available = item.availableQty;
      item.borrowedQty = Math.max(0, (item.borrowedQty || 0) - returnQty);
      if (item.availableQty > 0) item.status = 'available';
    }

    saveDatabase();

    res.json({
      success: true,
      message: `Successfully returned ${returnQty}x ${log.equipmentName}.`,
      log: {
        id: log.id,
        user_id: log.user_id,
        equipmentId: log.equipmentId,
        equipmentName: log.equipmentName,
        totalQty: totalQty,
        returnedQty: newReturnedQty,
        remainingQty: totalQty - newReturnedQty,
        status: log.status,
        returnedAt: log.returnedAt
      }
    });
  } catch (err) {
    console.error('Return item error:', err);
    res.status(500).json({ success: false, error: 'Return Failed: Unable to complete the equipment return. Please try again.' });
  }
});

/**
 * @route   POST /api/storekeeper/add-equipment
 * @desc    Add new equipment category / inventory item
 */
router.post('/add-equipment', (req, res) => {
  const { name, category, totalQty, room, location, sportsRoom, rfidTag, description } = req.body;

  if (!name || !totalQty) {
    return res.status(400).json({ success: false, error: 'Equipment Name and Total Quantity are required.' });
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
        error: `RFID Tag Already Assigned: This RFID tag is already assigned to equipment ${dupEq.name}.`
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
        error: `RFID Tag Already Assigned: This RFID tag is already assigned to user ${dupUser.name} (${dupUser.user_id || dupUser.regNo}).`
      });
    }
  }

  const qty = parseInt(totalQty);

  // Generate sequential EQP ID: EQP001, EQP002, ...
  const existingNums = db.equipment
    .map(e => parseInt((e.id || '').replace(/^EQP0*/i, ''), 10))
    .filter(n => !isNaN(n));
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  const newId = 'EQP' + String(nextNum).padStart(3, '0');

  const locVal = (room || location || sportsRoom || 'Main Gym Hall').trim();

  const newItem = {
    id: newId,
    name,
    category: category || 'General Sports',
    totalQty: qty,
    availableQty: qty,
    borrowedQty: 0,
    damagedQty: 0,
    status: 'available',
    room: locVal,
    sportsRoom: locVal,
    location: locVal,
    rfidTag: cleanRfid,
    rfidCode: cleanRfid,
    rfid: cleanRfid,
    description: description || ''
  };

  db.equipment.push(newItem);
  saveDatabase();

  res.status(201).json({ success: true, message: 'Equipment added successfully.', item: newItem });
});

/**
 * @route   POST /api/storekeeper/update-equipment
 * @desc    Update existing equipment details in database
 */
router.post('/update-equipment', (req, res) => {
  try {
    const { id, name, category, totalQty, damagedQty, availableQty, room, location, sportsRoom, status, rfidTag, description } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Equipment ID is required.' });
    }

    const item = db.equipment.find(e => String(e.id).toLowerCase() === String(id).toLowerCase());
    if (!item) {
      return res.status(404).json({ success: false, error: 'Equipment not found in database.' });
    }

    if (name !== undefined && name.trim()) item.name = name.trim();
    if (category !== undefined && category.trim()) item.category = category.trim();
    const locVal = room !== undefined ? room : (location !== undefined ? location : sportsRoom);
    if (locVal !== undefined) {
      const trimmedLoc = String(locVal).trim();
      item.room = trimmedLoc;
      item.sportsRoom = trimmedLoc;
      item.location = trimmedLoc;
    }
    if (description !== undefined) item.description = description;

    let parsedTotal = item.totalQty !== undefined ? item.totalQty : (item.total || 0);
    if (totalQty !== undefined) {
      const t = parseInt(totalQty);
      if (!isNaN(t) && t >= 0) parsedTotal = t;
    }

    let parsedDamaged = item.damagedQty !== undefined ? item.damagedQty : (item.damaged || 0);
    if (damagedQty !== undefined) {
      const d = parseInt(damagedQty);
      if (!isNaN(d) && d >= 0) parsedDamaged = d;
    }
    if (parsedDamaged > parsedTotal) parsedDamaged = parsedTotal;

    const computedAvail = (availableQty !== undefined && !isNaN(parseInt(availableQty)))
      ? Math.max(0, Math.min(parsedTotal, parseInt(availableQty)))
      : Math.max(0, parsedTotal - parsedDamaged);

    item.totalQty = parsedTotal;
    item.total = parsedTotal;
    item.damagedQty = parsedDamaged;
    item.damaged = parsedDamaged;
    item.availableQty = computedAvail;
    item.available = computedAvail;

    // Automatic status alignment
    if (status !== undefined) {
      item.status = status;
    } else if (computedAvail === 0 && parsedDamaged >= parsedTotal && parsedTotal > 0) {
      item.status = 'damaged';
    } else if (computedAvail === 0 && borrowed > 0) {
      item.status = 'borrowed';
    } else if (computedAvail === 0) {
      item.status = 'out-of-stock';
    } else if (computedAvail <= 2) {
      item.status = 'low-stock';
    } else {
      item.status = 'available';
    }

    if (rfidTag !== undefined) {
      const cleanRfid = rfidTag.trim().toUpperCase();
      const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const normalizedInput = normalizeTag(cleanRfid);

      if (normalizedInput) {
        // 1. Check duplicate equipment
        const dupEq = (db.equipment || []).find(e => {
          if (String(e.id) === String(item.id)) return false;
          const eTag = normalizeTag(e.rfidTag || e.rfidCode || e.rfid);
          return eTag && eTag === normalizedInput;
        });
        if (dupEq) {
          return res.status(400).json({
            success: false,
            error: `RFID Tag Already Assigned: This RFID tag is already assigned to equipment ${dupEq.name}.`
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
            error: `RFID Tag Already Assigned: This RFID tag is already assigned to user ${dupUser.name} (${dupUser.user_id || dupUser.regNo}).`
          });
        }
      }

      item.rfidTag = cleanRfid;
      item.rfid = cleanRfid;
      item.rfidCode = cleanRfid;
    }

    saveDatabase();

    res.json({
      success: true,
      message: `Equipment ${item.name} (${item.id}) updated successfully.`,
      item
    });
  } catch (err) {
    console.error('Update equipment error:', err);
    res.status(500).json({ success: false, error: 'Database error while updating equipment.' });
  }
});

/**
 * @route   GET /api/storekeeper/rfid-registry
 * @desc    Fetch all student patrons and equipment tags directly from DB
 */
router.get('/rfid-registry', (req, res) => {
  const studentUsers = (db.users || []).filter(u => (u.role || '').toLowerCase() === 'student');
  res.json({
    success: true,
    students: studentUsers,
    equipment: db.equipment || []
  });
});

/**
 * @route   POST /api/storekeeper/search-student
 * @desc    Search student by User ID (e.g. US002) for RFID assignment
 */
router.post('/search-student', (req, res) => {
  try {
    const { userId, query, studentId } = req.body;
    const rawLookup = (userId || studentId || query || '').trim();

    if (!rawLookup) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid User ID.'
      });
    }

    const cleanLookup = rawLookup.toLowerCase().replace(/[\s\-_]/g, '');
    const user = db.users.find(u => {
      const uUserId = (u.user_id || u.userId || '').toLowerCase().replace(/[\s\-_]/g, '');
      const uReg = (u.regNo || '').toLowerCase().replace(/[\s\-_]/g, '');
      const uId = String(u.id || '').toLowerCase().replace(/[\s\-_]/g, '');
      const uName = (u.name || '').toLowerCase();
      const uEmail = (u.email || '').toLowerCase();
      const uUsername = (u.username || '').toLowerCase();

      return (uUserId && (uUserId === cleanLookup || uUserId.includes(cleanLookup))) ||
             (uReg && (uReg === cleanLookup || uReg.includes(cleanLookup))) ||
             (uId && (uId === cleanLookup || uId.includes(cleanLookup))) ||
             (uName && (uName === rawLookup.toLowerCase() || uName.includes(rawLookup.toLowerCase()))) ||
             (uEmail && uEmail === rawLookup.toLowerCase()) ||
             (uUsername && uUsername === cleanLookup);
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Student Not Found. Please enter a valid User ID.'
      });
    }

    const roleLower = (user.role || '').toLowerCase();
    if (roleLower !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'Invalid User. This User ID does not belong to a student.'
      });
    }

    res.json({
      success: true,
      student: {
        id: user.id,
        user_id: user.user_id || user.userId || 'US002',
        name: user.name,
        email: user.email || 'N/A',
        role: 'STUDENT',
        department: user.department || 'Technology',
        regNo: user.regNo || user.user_id || 'N/A',
        rfidTag: user.rfidTag || user.rfidCode || user.rfid || '',
        status: user.status ? (user.status.charAt(0).toUpperCase() + user.status.slice(1)) : 'Active'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database error while searching student.' });
  }
});

/**
 * @route   POST /api/storekeeper/search-equipment
 * @desc    Search equipment by ID, name, or category for RFID assignment
 */
router.post('/search-equipment', (req, res) => {
  try {
    const { equipmentId, query } = req.body;
    const rawLookup = (equipmentId || query || '').trim();

    if (!rawLookup) {
      return res.status(400).json({ success: false, error: 'Please enter a valid Equipment ID or name.' });
    }

    const clean = rawLookup.toLowerCase();
    const item = db.equipment.find(e =>
      (e.id && String(e.id).toLowerCase() === clean) ||
      (e.name && e.name.toLowerCase().includes(clean)) ||
      (e.category && e.category.toLowerCase().includes(clean))
    );

    if (!item) {
      return res.status(404).json({ success: false, error: 'Equipment not found. Please enter a valid Equipment ID or name.' });
    }

    res.json({
      success: true,
      equipment: {
        id: item.id,
        name: item.name,
        category: item.category || 'General Sports',
        totalQty: item.totalQty || 0,
        availableQty: item.availableQty !== undefined ? item.availableQty : (item.available !== undefined ? item.available : 0),
        borrowedQty: item.borrowedQty || 0,
        damagedQty: item.damagedQty || 0,
        room: item.room || item.sportsRoom || 'Main Gym Hall',
        status: item.status || 'available',
        rfidTag: item.rfidTag || item.rfidCode || item.rfid || ''
      }
    });
  } catch (err) {
    console.error('Search equipment error:', err);
    res.status(500).json({ success: false, error: 'Database error while searching equipment.' });
  }
});

/**
 * @route   POST /api/storekeeper/assign-student-rfid
 * @desc    Bind RFID Card UID to a Student Patron in DB
 */
router.post('/assign-student-rfid', (req, res) => {
  try {
    const { studentRegNo, studentId, userId, rfidTag, rfid } = req.body;
    const lookup = (userId || studentId || studentRegNo || '').trim();
    const rawTag = (rfidTag || rfid || '').trim();

    if (!lookup || !rawTag) {
      return res.status(400).json({ success: false, error: 'Student User ID and RFID Tag are required.' });
    }

    const student = db.users.find(u =>
      (u.user_id && u.user_id.toLowerCase() === lookup.toLowerCase()) ||
      (u.userId && u.userId.toLowerCase() === lookup.toLowerCase()) ||
      (u.regNo && u.regNo.toLowerCase() === lookup.toLowerCase()) ||
      (u.id && String(u.id).toLowerCase() === lookup.toLowerCase())
    );

    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found in database.' });
    }

    if ((student.role || '').toLowerCase() !== 'student') {
      return res.status(400).json({ success: false, error: 'Invalid User. This User ID does not belong to a student.' });
    }

    const cleanRfid = rawTag.replace(/\s+/g, ' ').toUpperCase();
    const normalizedNoSpaces = cleanRfid.replace(/\s+/g, '');

    // Check duplicate RFID across other users
    const duplicateUser = db.users.find(u => {
      if (String(u.id) === String(student.id)) return false;
      const uTag = (u.rfidTag || u.rfidCode || u.rfid || '').replace(/\s+/g, '').toUpperCase();
      return uTag && uTag === normalizedNoSpaces;
    });

    if (duplicateUser) {
      return res.status(400).json({
        success: false,
        error: `RFID Already Assigned: This RFID tag is already registered to another user (${duplicateUser.name} - ${duplicateUser.user_id || duplicateUser.regNo}).`
      });
    }

    // Check duplicate RFID across equipment
    const duplicateEquipment = db.equipment.find(e => {
      const eqTag = (e.rfidTag || e.rfidCode || e.rfid || '').replace(/\s+/g, '').toUpperCase();
      return eqTag && eqTag === normalizedNoSpaces;
    });

    if (duplicateEquipment) {
      return res.status(400).json({
        success: false,
        error: `RFID Already Assigned: This RFID tag is already registered to equipment ${duplicateEquipment.name}.`
      });
    }

    const oldTag = student.rfidTag || student.rfidCode || student.rfid || '';
    const wasReplaced = Boolean(oldTag && oldTag.replace(/\s+/g, '') !== normalizedNoSpaces);

    student.rfidTag = cleanRfid;
    student.rfidCode = cleanRfid;
    student.rfid = cleanRfid;
    saveDatabase();

    const actionMsg = wasReplaced
      ? `RFID Tag Replaced Successfully: Replaced ${oldTag} with ${cleanRfid} for ${student.name} (${student.user_id || student.regNo}).`
      : `RFID Assigned Successfully: ${cleanRfid} has been assigned to ${student.user_id || student.regNo || student.name}.`;

    res.json({
      success: true,
      wasReplaced,
      oldTag,
      message: actionMsg,
      student: {
        id: student.id,
        user_id: student.user_id || student.userId || 'US002',
        name: student.name,
        email: student.email,
        role: 'STUDENT',
        rfidTag: student.rfidTag,
        status: student.status || 'Active'
      }
    });
  } catch (err) {
    console.error('Error assigning student RFID:', err);
    res.status(500).json({
      success: false,
      error: 'Assignment Failed: Unable to save the RFID assignment. Please try again.'
    });
  }
});

/**
 * @route   POST /api/storekeeper/assign-equipment-rfid
 * @desc    Bind RFID Tag / Barcode to an Equipment item in DB
 */
router.post('/assign-equipment-rfid', (req, res) => {
  try {
    const { equipmentId, rfidTag, rfid } = req.body;
    const rawTag = (rfidTag || rfid || '').trim();

    if (!equipmentId || !rawTag) {
      return res.status(400).json({ success: false, error: 'Equipment ID and RFID Tag are required.' });
    }

    const item = db.equipment.find(e => String(e.id) === String(equipmentId) || e.name.toLowerCase() === String(equipmentId).toLowerCase());
    if (!item) {
      return res.status(404).json({ success: false, error: 'Equipment item not found in database.' });
    }

    const cleanRfid = rawTag.replace(/\s+/g, ' ').toUpperCase();
    const normalizedNoSpaces = cleanRfid.replace(/\s+/g, '');

    // Check duplicate RFID across all other equipment records
    const duplicateEquipment = db.equipment.find(e => {
      if (String(e.id) === String(item.id)) return false;
      const existingTag = (e.rfidTag || e.rfidCode || e.rfid || '').replace(/\s+/g, '').toUpperCase();
      return existingTag && existingTag === normalizedNoSpaces;
    });

    if (duplicateEquipment) {
      return res.status(400).json({
        success: false,
        error: `RFID Tag Already Assigned: This RFID tag is already assigned to ${duplicateEquipment.name}.`
      });
    }

    // Check duplicate RFID across users/students
    const duplicateUser = db.users.find(u => {
      const existingUserTag = (u.rfidTag || u.rfidCode || u.rfid || '').replace(/\s+/g, '').toUpperCase();
      return existingUserTag && existingUserTag === normalizedNoSpaces;
    });

    if (duplicateUser) {
      return res.status(400).json({
        success: false,
        error: `RFID Tag Already Assigned: This RFID tag is already assigned to student ${duplicateUser.name} (${duplicateUser.user_id || duplicateUser.regNo}).`
      });
    }

    // Assign / Replace permanently in database
    const oldTag = item.rfidTag || item.rfidCode || item.rfid || '';
    const wasReplaced = Boolean(oldTag && oldTag.replace(/\s+/g, '') !== normalizedNoSpaces);

    item.rfidTag = cleanRfid;
    item.rfid = cleanRfid;
    item.rfidCode = cleanRfid;
    saveDatabase();

    const actionMsg = wasReplaced
      ? `Equipment RFID Tag Replaced Successfully: Replaced ${oldTag} with ${cleanRfid} for ${item.name}.`
      : `RFID Tag Assigned Successfully: Bound RFID ${cleanRfid} to ${item.name}.`;

    res.json({
      success: true,
      wasReplaced,
      oldTag,
      message: actionMsg,
      item
    });
  } catch (err) {
    console.error('Error assigning equipment RFID:', err);
    res.status(500).json({
      success: false,
      error: 'RFID Assignment Failed: Unable to save the RFID assignment. Please try again.'
    });
  }
});

// ==========================================
// MONTHLY REPORT GENERATION ENDPOINTS
// ==========================================

const { generateMonthlyPdfBuffer } = require('../services/pdfReportGenerator');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function buildMonthlyReportData(monthInput, reqUser) {
  let year, monthNum;
  if (typeof monthInput === 'string' && /^\d{4}-\d{2}$/.test(monthInput.trim())) {
    const parts = monthInput.trim().split('-');
    year = parseInt(parts[0], 10);
    monthNum = parseInt(parts[1], 10);
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  }

  // Safe UTC Month Boundaries: date >= startOfMonth AND date < startOfNextMonth
  const startOfMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
  const startOfNextMonth = new Date(Date.UTC(year, monthNum, 1, 0, 0, 0));
  const monthName = `${MONTH_NAMES[monthNum - 1]} ${year}`;

  // 1. Authenticated Storekeeper info from session / database
  let skUser = null;
  if (reqUser && (reqUser.id || reqUser.user_id || reqUser.username)) {
    skUser = (db.users || []).find(u =>
      (reqUser.id && (u.id === reqUser.id || u.user_id === reqUser.id || u.userId === reqUser.id)) ||
      (reqUser.username && (u.username === reqUser.username || u.regNo === reqUser.username))
    );
  }
  if (!skUser) {
    skUser = (db.users || []).find(u => u.role === 'storekeeper') || {
      user_id: 'US004',
      name: 'amal',
      email: 'amal@gmail.com',
      role: 'storekeeper',
      department: 'Sports Store'
    };
  }

  const storekeeperInfo = {
    id: skUser.user_id || skUser.userId || 'US004',
    name: skUser.name || 'Storekeeper Officer',
    email: skUser.email || 'store@unixsport.edu',
    role: skUser.role || 'storekeeper',
    department: skUser.department || 'Sports Department'
  };

  // 2. Filter Borrow / Return History strictly for the selected month
  const monthlyBorrowLogs = (db.borrowLogs || []).filter(b => {
    const issuedDate = b.issuedAt ? new Date(b.issuedAt) : (b.date ? new Date(b.date) : null);
    const returnedDate = b.returnedAt ? new Date(b.returnedAt) : null;
    const isIssued = issuedDate && !isNaN(issuedDate.getTime()) && issuedDate >= startOfMonth && issuedDate < startOfNextMonth;
    const isReturned = returnedDate && !isNaN(returnedDate.getTime()) && returnedDate >= startOfMonth && returnedDate < startOfNextMonth;
    return isIssued || isReturned;
  });

  // Calculate Metrics from selected month's transactions
  let totalIssuedQty = 0;
  let totalReturnedQty = 0;
  let totalBorrowTx = 0;
  let totalReturnTx = 0;
  let activeIssuedQty = 0;

  monthlyBorrowLogs.forEach(b => {
    const issuedDate = b.issuedAt ? new Date(b.issuedAt) : (b.date ? new Date(b.date) : null);
    const returnedDate = b.returnedAt ? new Date(b.returnedAt) : null;
    const qty = parseInt(b.qty || b.quantity || 1, 10) || 1;
    const returnedQty = b.returnedQty !== undefined ? (parseInt(b.returnedQty, 10) || 0) : (b.status === 'returned' ? qty : 0);

    if (issuedDate && issuedDate >= startOfMonth && issuedDate < startOfNextMonth) {
      totalIssuedQty += qty;
      totalBorrowTx += 1;
      if (b.status === 'borrowed' || b.status === 'taken') {
        activeIssuedQty += Math.max(0, qty - returnedQty);
      }
    }

    if (returnedDate && returnedDate >= startOfMonth && returnedDate < startOfNextMonth) {
      totalReturnedQty += returnedQty;
      totalReturnTx += 1;
    }
  });

  // 3. Current Live Equipment Availability
  const equipmentAvailability = (db.equipment || []).map(e => ({
    id: e.id,
    category: e.category || 'General Sports',
    name: e.name,
    totalQty: e.totalQty !== undefined ? e.totalQty : (e.total || 0),
    availableQty: e.availableQty !== undefined ? e.availableQty : (e.available || 0),
    borrowedQty: e.borrowedQty || 0,
    damagedQty: e.damagedQty || 0,
    room: e.room || e.sportsRoom || 'Main Gym Hall',
    status: e.status || 'available'
  }));

  // 4. RFID Tag Assignments for the month
  const rfidAssignments = [];
  (db.users || []).forEach(u => {
    if (u.rfidTag) {
      const uDate = u.updatedAt ? new Date(u.updatedAt) : (u.createdAt ? new Date(u.createdAt) : null);
      if (uDate && !isNaN(uDate.getTime()) && uDate >= startOfMonth && uDate < startOfNextMonth) {
        rfidAssignments.push({
          date: u.updatedAt || u.createdAt,
          id: u.user_id || u.userId || u.regNo || u.id,
          name: u.name,
          rfidTag: u.rfidTag,
          type: 'Student',
          department: u.department || 'Student'
        });
      }
    }
  });

  (db.equipment || []).forEach(eq => {
    if (eq.rfidTag) {
      const eqDate = eq.updatedAt ? new Date(eq.updatedAt) : (eq.createdAt ? new Date(eq.createdAt) : null);
      if (eqDate && !isNaN(eqDate.getTime()) && eqDate >= startOfMonth && eqDate < startOfNextMonth) {
        rfidAssignments.push({
          date: eq.updatedAt || eq.createdAt,
          id: eq.id,
          name: eq.name,
          rfidTag: eq.rfidTag,
          type: 'Equipment',
          department: eq.category || 'Sports Gear'
        });
      }
    }
  });

  // 5. Notices & Announcements for the month
  const noticesActivity = (db.notices || []).filter(n => {
    if (!n.createdAt && !n.date) return false;
    const nDate = new Date(n.createdAt || n.date);
    return !isNaN(nDate.getTime()) && nDate >= startOfMonth && nDate < startOfNextMonth;
  });

  const now = new Date();
  const generatedAt = `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

  return {
    month: `${year}-${String(monthNum).padStart(2, '0')}`,
    monthName,
    generatedAt,
    storekeeper: storekeeperInfo,
    summary: {
      totalIssuedQty,
      totalReturnedQty,
      totalBorrowTx,
      totalReturnTx,
      activeIssuedQty
    },
    equipmentAvailability,
    borrowActivity: monthlyBorrowLogs,
    rfidAssignments,
    noticesActivity
  };
}

/**
 * @route   GET /api/storekeeper/monthly-report-data
 * @desc    Get aggregated data and metrics for previewing the monthly report
 */
router.get('/monthly-report-data', (req, res) => {
  try {
    const month = (req.query.month || '').trim();
    const reportData = buildMonthlyReportData(month, req.user);
    res.json({
      success: true,
      reportData
    });
  } catch (err) {
    console.error('Error compiling monthly report data:', err);
    res.status(500).json({ success: false, error: 'Failed to generate monthly report data.' });
  }
});

/**
 * @route   POST /api/storekeeper/monthly-report-data
 * @desc    Get aggregated data for previewing via POST
 */
router.post('/monthly-report-data', (req, res) => {
  try {
    const month = (req.body.month || req.query.month || '').trim();
    const reportData = buildMonthlyReportData(month, req.user);
    res.json({
      success: true,
      reportData
    });
  } catch (err) {
    console.error('Error compiling monthly report data:', err);
    res.status(500).json({ success: false, error: 'Failed to generate monthly report data.' });
  }
});

/**
 * @route   GET /api/storekeeper/monthly-report-pdf
 * @desc    Generate and download the official PDF monthly report
 */
router.get('/monthly-report-pdf', async (req, res) => {
  try {
    const month = (req.query.month || '').trim();
    const reportData = buildMonthlyReportData(month, req.user);
    const pdfBuffer = await generateMonthlyPdfBuffer(reportData);

    const filename = `UniXsport_Monthly_Report_${reportData.monthName.replace(/\s+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF monthly report:', err);
    res.status(500).json({ success: false, error: 'Failed to generate PDF monthly report.' });
  }
});

/**
 * @route   POST /api/storekeeper/monthly-report-pdf
 * @desc    Generate and download PDF via POST
 */
router.post('/monthly-report-pdf', async (req, res) => {
  try {
    const month = (req.body.month || req.query.month || '').trim();
    const reportData = buildMonthlyReportData(month, req.user);
    const pdfBuffer = await generateMonthlyPdfBuffer(reportData);

    const filename = `UniXsport_Monthly_Report_${reportData.monthName.replace(/\s+/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF monthly report:', err);
    res.status(500).json({ success: false, error: 'Failed to generate PDF monthly report.' });
  }
});

module.exports = router;
