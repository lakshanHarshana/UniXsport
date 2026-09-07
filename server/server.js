const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure upload directory exists
if (!fs.existsSync(config.UPLOAD_DIR)) {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

const app = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve static frontend assets & uploaded files
app.use(express.static(path.join(__dirname, '../')));
app.use('/uploads', express.static(config.UPLOAD_DIR));

// Default root redirects to home.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../home.html'));
});

// Import Route Modules
const authRoutes = require('./routes/auth');
const rfidRoutes = require('./routes/rfid');
const studentRoutes = require('./routes/student');
const coachRoutes = require('./routes/coach');
const storekeeperRoutes = require('./routes/storekeeper');
const adminRoutes = require('./routes/admin');
const noticesRoutes = require('./routes/notices');

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rfid', rfidRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/storekeeper', storekeeperRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notices', noticesRoutes);

const { db, saveDatabase } = require('./db');

// Helper to calculate live dashboard metrics from database
function calculateMetrics() {
  const allUsers = db.users || [];
  const activeUsers = allUsers.filter(u => u.status !== 'inactive' && u.status !== 'deactivated').length;
  const activeStudents = allUsers.filter(u => u.role === 'student' && (u.status === 'active' || !u.status)).length;
  const activeCoaches = allUsers.filter(u => u.role === 'coach' && (u.status === 'active' || !u.status)).length;

  const allEquipment = db.equipment || [];
  const totalEquipment = allEquipment.reduce((sum, e) => sum + (parseInt(e.totalQty) || parseInt(e.total) || parseInt(e.availableQty) || 1), 0);
  const totalEquipmentTypes = allEquipment.length;
  const availableEquipment = allEquipment.reduce((sum, e) => sum + (parseInt(e.availableQty) || parseInt(e.available) || 0), 0);

  const allRequests = db.gymRequests || [];
  const activeBookings = allRequests.filter(r => r.status === 'approved').length;
  const pendingRequests = allRequests.filter(r => r.status === 'pending').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBookings = allRequests.filter(r => r.status === 'approved' && (r.requestedDate === todayStr || r.preferredDate === todayStr)).length;

  const allFacilities = db.facilities || [];
  const availableFacilities = allFacilities.filter(f => f.status === 'available' || !f.status || f.status === 'open').length;
  const totalFacilities = allFacilities.length;

  return {
    success: true,
    activeUsers: activeUsers || allUsers.length,
    activeStudents,
    activeCoaches,
    totalEquipment: totalEquipment || totalEquipmentTypes,
    totalEquipmentTypes,
    availableEquipment,
    activeClasses: activeBookings,
    activeBookings,
    pendingRequests,
    facilitiesCount: totalFacilities || availableFacilities,
    facilities: {
      available: availableFacilities,
      total: totalFacilities
    },
    todayBookings,
    maxCapacity: config.MAX_SLOT_CAPACITY || 30
  };
}

// Public live statistics endpoint (loads real numbers from DB)
app.get('/api/public/stats', (req, res) => {
  res.json(calculateMetrics());
});

// Dashboard metrics alias endpoint
app.get('/api/dashboard/metrics', (req, res) => {
  res.json(calculateMetrics());
});

// Public facilities endpoint (returns all facilities from DB)
app.get('/api/public/facilities', (req, res) => {
  const facilities = db.facilities || [];
  const availableCount = facilities.filter(f => f.status === 'available').length;
  res.json({
    success: true,
    facilities,
    availableCount,
    totalCount: facilities.length
  });
});

// Public events endpoint (returns all events from DB)
app.get('/api/public/events', (req, res) => {
  res.json({
    success: true,
    events: db.events || []
  });
});

// Public announcements endpoint (returns public notices from DB)
app.get('/api/public/announcements', (req, res) => {
  const notices = (db.notices || []).filter(n => (!n.visibleTo || n.visibleTo === 'all' || n.visibleTo === 'everyone') && !n.targetUserId && n.status !== 'archived');
  res.json({
    success: true,
    notices
  });
});

// Public contact form submission endpoint (saves to DB)
app.post('/api/public/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Name, Email, and Message are required.' });
  }

  if (!db.contactMessages) db.contactMessages = [];
  const newMsg = {
    id: 'msg_' + Date.now(),
    name,
    email,
    subject: subject || 'General Inquiry',
    message,
    submittedAt: new Date().toISOString()
  };
  db.contactMessages.push(newMsg);
  saveDatabase();

  res.status(201).json({ success: true, message: 'Your message has been received by the athletic department.' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'UniXsport API Server',
    university: 'Rajarata University of Sri Lanka',
    timestamp: new Date().toISOString()
  });
});

// Start HTTP Server
const PORT = process.env.PORT || config.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`   UniXsport Backend Running on Port ${PORT}`);
  console.log(`====================================================`);
});

// Export for serverless deployments
module.exports = app;
