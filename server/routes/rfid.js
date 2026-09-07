const express = require('express');
const router = express.Router();
const { db, saveDatabase } = require('../db');

// List of connected SSE client connections
let sseClients = [];

/**
 * Helper to broadcast SSE event to all connected web clients
 */
function broadcastRfidEvent(eventType, payload) {
  sseClients.forEach(client => {
    client.res.write(`event: ${eventType}\n`);
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

/**
 * Helper to process RFID scan from either POST or GET
 */
function handleRfidScan(req, res) {
  try {
    const rfid_tag = (req.body && req.body.rfid_tag) || (req.query && req.query.rfid_tag);
    const device_id = (req.body && req.body.device_id) || (req.query && req.query.device_id);

    // If accessed via GET with no parameters, return friendly API status
    if (!rfid_tag && req.method === 'GET') {
      return res.json({
        success: true,
        status: 'online',
        endpoint: '/api/rfid/scan',
        supportedMethods: ['GET', 'POST'],
        message: 'UniXsport RFID Scanner Gateway is active and listening.',
        usage: {
          post: {
            url: 'http://localhost:5000/api/rfid/scan',
            body: { rfid_tag: 'F9E8D7C6', device_id: 'GATE_01' }
          },
          get: {
            url: 'http://localhost:5000/api/rfid/scan?rfid_tag=F9E8D7C6&device_id=GATE_01'
          }
        },
        recentScansCount: (db.rfidScans || []).length
      });
    }

    if (!rfid_tag) {
      return res.status(400).json({ authorized: false, message: 'RFID tag missing (provide rfid_tag parameter)' });
    }

    const cleanTag = String(rfid_tag).trim().toUpperCase();
    const deviceId = device_id || 'DEFAULT_GATE';
    const timestamp = new Date().toISOString();

    const normalizeTag = (t) => String(t || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const normalizedInput = normalizeTag(cleanTag);

    // 1. Check User Match
    const matchedUser = db.users.find(u => {
      const uTag = normalizeTag(u.rfidTag || u.rfidCode);
      return uTag && (uTag === normalizedInput || uTag === cleanTag);
    });

    // 2. Check Equipment Match
    const matchedEquipment = !matchedUser ? db.equipment.find(e => {
      const eTag = normalizeTag(e.rfidTag || e.rfidCode);
      return eTag && (eTag === normalizedInput || eTag === cleanTag);
    }) : null;

    const scanType = matchedUser ? 'user' : (matchedEquipment ? 'equipment' : 'unknown');

    // Always update latest scan memory for live UI binding & assignment
    db.latestRfidScan = {
      id: 'scan_' + Date.now(),
      rfidTag: cleanTag,
      type: scanType,
      user: matchedUser ? { id: matchedUser.id, name: matchedUser.name, user_id: matchedUser.user_id || matchedUser.userId, role: matchedUser.role } : null,
      equipment: matchedEquipment ? { id: matchedEquipment.id, name: matchedEquipment.name } : null,
      deviceId,
      timestamp: Date.now(),
      isoTime: timestamp
    };

    // Broadcast generic scan packet to all active web listeners
    broadcastRfidEvent('scan_packet', db.latestRfidScan);

    if (matchedUser) {
      const scanLog = {
        id: 'scan_' + Date.now(),
        rfidTag: cleanTag,
        type: 'user',
        userId: matchedUser.id,
        userName: matchedUser.name,
        userRole: matchedUser.role,
        deviceId,
        status: 'authorized',
        timestamp
      };

      if (!db.rfidScans) db.rfidScans = [];
      db.rfidScans.unshift(scanLog);
      saveDatabase();

      // Push real-time event to web dashboards
      broadcastRfidEvent('user_scan', scanLog);

      return res.json({
        authorized: true,
        type: 'user',
        user: {
          id: matchedUser.id,
          regNo: matchedUser.regNo,
          name: matchedUser.name,
          role: matchedUser.role,
          department: matchedUser.department
        },
        message: `Access Granted. Welcome ${matchedUser.name}`
      });
    }

    if (matchedEquipment) {
      const scanLog = {
        id: 'scan_' + Date.now(),
        rfidTag: cleanTag,
        type: 'equipment',
        equipmentId: matchedEquipment.id,
        equipmentName: matchedEquipment.name,
        deviceId,
        status: 'recognized',
        timestamp
      };

      if (!db.rfidScans) db.rfidScans = [];
      db.rfidScans.unshift(scanLog);
      saveDatabase();

      broadcastRfidEvent('equipment_scan', scanLog);

      return res.json({
        authorized: true,
        type: 'equipment',
        equipment: {
          id: matchedEquipment.id,
          name: matchedEquipment.name,
          category: matchedEquipment.category,
          availableQty: matchedEquipment.availableQty,
          status: matchedEquipment.status
        },
        message: `Equipment Tag Recognized: ${matchedEquipment.name}`
      });
    }

    // 3. Unknown / New RFID Tag (Ready for Assignment or Access Denied)
    const scanLog = {
      id: 'scan_' + Date.now(),
      rfidTag: cleanTag,
      type: 'unknown',
      deviceId,
      status: 'denied',
      timestamp
    };

    if (!db.rfidScans) db.rfidScans = [];
    db.rfidScans.unshift(scanLog);
    saveDatabase();

    broadcastRfidEvent('unauthorized_scan', scanLog);

    return res.status(200).json({
      authorized: false,
      rfidTag: cleanTag,
      message: 'Scan received: Tag recognized by gateway'
    });
  } catch (err) {
    console.error('RFID processing error:', err);
    res.status(500).json({ authorized: false, message: 'Server processing error' });
  }
}

// Mount both POST and GET on /api/rfid/scan
router.post('/scan', handleRfidScan);
router.get('/scan', handleRfidScan);

/**
 * @route   GET /api/rfid/latest-scan
 * @desc    Fetch the latest raw scan received by the server
 */
router.get('/latest-scan', (req, res) => {
  res.json({ success: true, scan: db.latestRfidScan || null });
});

/**
 * @route   GET /api/rfid/events
 * @desc    Server-Sent Events (SSE) stream for web frontend live hardware updates
 */
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  console.log(`[SSE CLIENT CONNECTED] Client ID: ${clientId}`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`[SSE CLIENT DISCONNECTED] Client ID: ${clientId}`);
  });
});

/**
 * @route   GET /api/rfid/logs
 * @desc    Fetch recent scan logs
 */
router.get('/logs', (req, res) => {
  res.json({ success: true, logs: db.rfidScans || [] });
});

module.exports = router;
