const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data_store.json');

// In-memory data store with JSON persistence
let data = {
  meta: {
    lastUserIdSeq: 0
  },
  users: [],
  equipment: [],
  borrowLogs: [],
  gymRequests: [],
  workoutPlans: [],
  notices: [],
  facilities: [],
  events: [],
  rfidScans: [],
  sessions: [],
  contactMessages: []
};

/**
 * Server-side auto-generation of unique User ID (format: US001, US002, US003...)
 * Scans existing users and metadata sequence counter to ensure uniqueness and prevent reuse.
 */
function generateNextUserId() {
  if (!data.meta) data.meta = {};
  let maxSeq = data.meta.lastUserIdSeq || 0;

  (data.users || []).forEach(u => {
    const idStr = u.user_id || u.userId;
    if (idStr) {
      const m = String(idStr).match(/^US(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  });

  let nextSeq = maxSeq + 1;
  let candidateId = 'US' + String(nextSeq).padStart(3, '0');

  // Guard against any theoretical collision
  while ((data.users || []).some(u => (u.user_id === candidateId || u.userId === candidateId))) {
    nextSeq++;
    candidateId = 'US' + String(nextSeq).padStart(3, '0');
  }

  data.meta.lastUserIdSeq = nextSeq;
  saveDatabase();
  return candidateId;
}

/**
 * Safe database migration: backfill unique User IDs (US001, US002...) for all existing users
 */
function migrateUserIds() {
  if (!data.users) data.users = [];
  if (!data.meta) data.meta = {};

  let migrated = false;
  let maxSeq = data.meta.lastUserIdSeq || 0;

  // First determine max existing sequence
  data.users.forEach(u => {
    const idStr = u.user_id || u.userId;
    if (idStr) {
      const m = String(idStr).match(/^US(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
  });

  // Assign sequential IDs to users lacking one
  data.users.forEach(u => {
    if (!u.user_id && !u.userId) {
      maxSeq++;
      const assignedId = 'US' + String(maxSeq).padStart(3, '0');
      u.user_id = assignedId;
      u.userId = assignedId;
      migrated = true;
    } else {
      if (!u.user_id && u.userId) { u.user_id = u.userId; migrated = true; }
      if (!u.userId && u.user_id) { u.userId = u.user_id; migrated = true; }
    }
  });

  data.meta.lastUserIdSeq = maxSeq;
  if (migrated) {
    saveDatabase();
  }
}

function initDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8').replace(/^\uFEFF/, '');
      data = JSON.parse(raw);
    } catch (e) {
      console.error('Error reading database file, re-initializing seed data:', e);
    }
  }

  if (!data.meta) data.meta = { lastUserIdSeq: 0 };
  if (!data.users) data.users = [];

  // Auto-seed ONLY the single default admin account if users collection is empty
  const hasAdmin = data.users.some(
    u => (u.regNo && u.regNo.toLowerCase() === 'admin') || (u.username && u.username.toLowerCase() === 'admin')
  );

  if (!hasAdmin && data.users.length === 0) {
    const adminPasswordHash = bcrypt.hashSync('password', 10);
    data.users.push({
      id: 'usr_admin',
      user_id: 'US001',
      userId: 'US001',
      regNo: 'admin',
      username: 'admin',
      name: 'System Administrator',
      email: 'admin@unixsport.edu',
      passwordHash: adminPasswordHash,
      role: 'admin',
      rfidTag: 'F9E8D7C6',
      department: 'Sports Directorate',
      status: 'active',
      avatarUrl: '',
      createdAt: new Date().toISOString()
    });
    data.meta.lastUserIdSeq = 1;
    saveDatabase();
  }

  // Backfill User IDs for all existing users
  migrateUserIds();

  // 2. DEFAULT FACILITIES
  if (!data.facilities || data.facilities.length === 0) {
    data.facilities = [
      {
        id: 'fac_01',
        name: 'Main Gym',
        description: 'Fully equipped with cardio machines, weights, and functional training areas',
        hours: '6 AM - 10 PM',
        location: 'Building A, Floor 1',
        status: 'available',
        type: 'gym',
        iconClass: 'fa-dumbbell'
      },
      {
        id: 'fac_02',
        name: 'Yoga & Stretching Studio',
        description: 'Dedicated space for yoga, meditation, and flexibility training',
        hours: '7 AM - 8 PM',
        location: 'Building A, Floor 2',
        status: 'available',
        type: 'yoga',
        iconClass: 'fa-person-hiking'
      },
      {
        id: 'fac_03',
        name: 'Swimming Pool',
        description: 'Olympic-size pool with separate lap lanes and training areas',
        hours: '8 AM - 9 PM',
        location: 'Building B',
        status: 'available',
        type: 'swimming',
        iconClass: 'fa-water'
      },
      {
        id: 'fac_04',
        name: 'Basketball Court',
        description: 'Professional basketball courts with modern lighting and seating',
        hours: '7 AM - 10 PM',
        location: 'Building C',
        status: 'available',
        type: 'basketball',
        iconClass: 'fa-basketball'
      },
      {
        id: 'fac_05',
        name: 'Personal Training Zone',
        description: 'Private training rooms with equipment for personalized coaching',
        hours: '6 AM - 9 PM',
        location: 'Building A, Floor 3',
        status: 'available',
        type: 'training',
        iconClass: 'fa-heart-pulse'
      },
      {
        id: 'fac_06',
        name: 'Lounge & Cafeteria',
        description: 'Comfortable relaxation area with healthy refreshment options',
        hours: '6 AM - 10 PM',
        location: 'Building A, Ground Floor',
        status: 'available',
        type: 'lounge',
        iconClass: 'fa-couch'
      }
    ];
  }

  // 3. DEFAULT EVENTS
  if (!data.events || data.events.length === 0) {
    data.events = [
      {
        id: 'evt_01',
        title: 'Inter-Faculty Sports Meet 2026',
        description: 'Showcase your athletic talents in this exciting multi-sport tournament featuring track, volleyball, and badminton.',
        date: '2026-09-15',
        day: '15',
        month: 'SEP',
        location: 'Sports Complex',
        participants: '200+ participants',
        category: 'sports'
      },
      {
        id: 'evt_02',
        title: 'Fitness & Conditioning Workshop',
        description: 'Learn professional fitness techniques from certified trainers. Sessions cover strength training, nutrition, and injury prevention.',
        date: '2026-09-20',
        day: '20',
        month: 'SEP',
        location: 'Main Gym',
        participants: '50 spots available',
        category: 'training'
      },
      {
        id: 'evt_03',
        title: 'Annual Campus Marathon',
        description: 'Join the 5K and 10K runs around the campus. A fun event to improve endurance and build community spirit.',
        date: '2026-09-25',
        day: '25',
        month: 'SEP',
        location: 'Campus Grounds',
        participants: 'All welcome',
        category: 'marathon'
      },
      {
        id: 'evt_04',
        title: 'Wellness & Health Fair',
        description: 'Free health check-ups, nutrition counseling, and wellness seminars. Meet our team of certified fitness professionals.',
        date: '2026-09-28',
        day: '28',
        month: 'SEP',
        location: 'Main Hall',
        participants: 'Free entry',
        category: 'wellness'
      }
    ];
  }

  // 4. NOTICES (No dummy seed, clean array)
  if (!data.notices) data.notices = [];

  if (!data.equipment) data.equipment = [];
  if (!data.borrowLogs) data.borrowLogs = [];
  if (!data.gymRequests) data.gymRequests = [];
  if (!data.workoutPlans) data.workoutPlans = [];
  if (!data.rfidScans) data.rfidScans = [];
  if (!data.sessions) data.sessions = [];
  if (!data.contactMessages) data.contactMessages = [];

  saveDatabase();
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving database file:', e);
  }
}

// Initialize on module load
initDatabase();

module.exports = {
  db: data,
  data,
  saveDatabase,
  generateNextUserId,
  get users() { return data.users; },
  get equipment() { return data.equipment; },
  get borrowLogs() { return data.borrowLogs; },
  get gymRequests() { return data.gymRequests; },
  get workoutPlans() { return data.workoutPlans; },
  get notices() { return data.notices; },
  get facilities() { return data.facilities; },
  get events() { return data.events; },
  get rfidScans() { return data.rfidScans; },
  get sessions() { return data.sessions; },
  get contactMessages() { return data.contactMessages; }
};
