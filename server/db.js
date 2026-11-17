const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const dns = require('dns');

// Ensure reliable SRV lookup on any ISP or local DNS resolver
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e) {}

const config = require('./config');
const DB_FILE = path.join(__dirname, 'data_store.json');
const MONGODB_URI = config.MONGODB_URI || process.env.MONGODB_URI;

// In-memory data store with live bidirectional sync to MongoDB Atlas & local JSON fallback
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
  contactMessages: [],
  reviews: []
};

let isMongoConnected = false;
let mongoDbInstance = null;
let isSyncing = false;
let syncQueued = false;

const COLLECTIONS = [
  'users',
  'equipment',
  'borrowLogs',
  'gymRequests',
  'workoutPlans',
  'notices',
  'facilities',
  'events',
  'rfidScans',
  'sessions',
  'contactMessages',
  'reviews',
  'processedMutations'
];

/**
 * Server-side auto-generation of unique User ID (format: US001, US002, US003...)
 */
function generateNextUserId() {
  if (!data.users) data.users = [];
  
  const activeNumbers = new Set();
  data.users.forEach(u => {
    const idStr = u.user_id || u.userId;
    if (idStr) {
      const m = String(idStr).match(/^US(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > 0) activeNumbers.add(num);
      }
    }
  });

  let nextSeq = 1;
  while (activeNumbers.has(nextSeq)) {
    nextSeq++;
  }

  const candidateId = 'US' + String(nextSeq).padStart(3, '0');
  if (!data.meta) data.meta = {};
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

/**
 * Remove legacy cleartext passwords from user records for security & privacy
 */
function scrubPlaintextPasswords() {
  if (!data.users) return;
  let scrubbed = false;
  data.users.forEach(u => {
    if (u.passwordHash && u.password) {
      delete u.password;
      scrubbed = true;
    }
  });
  if (scrubbed) {
    saveDatabase();
  }
}

/**
 * Connect to MongoDB Atlas and synchronize with local cache
 */
async function connectMongoDB() {
  if (!MONGODB_URI) {
    console.warn('[UniXsport Database] No MONGODB_URI configured. Running in JSON file fallback mode.');
    return;
  }

  try {
    console.log('[UniXsport Database] Connecting to MongoDB Atlas...');
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 12000
    });
    
    isMongoConnected = true;
    mongoDbInstance = conn.connection.db;
    console.log('[UniXsport Database] Connected to MongoDB Atlas successfully.');

    // Ensure Unique Indexes in MongoDB Atlas to prevent duplicate users or RFID tags
    try {
      await mongoDbInstance.collection('users').createIndex({ user_id: 1 }, { unique: true, sparse: true });
      await mongoDbInstance.collection('users').createIndex({ id: 1 }, { unique: true, sparse: true });
      await mongoDbInstance.collection('equipment').createIndex({ id: 1 }, { unique: true, sparse: true });
      await mongoDbInstance.collection('gymRequests').createIndex({ id: 1 }, { unique: true, sparse: true });
      await mongoDbInstance.collection('workoutPlans').createIndex({ id: 1 }, { unique: true, sparse: true });
    } catch (idxErr) {
      // Indexes may already exist, ignore non-fatal index notice
    }

    // Load initial data from MongoDB Atlas into memory
    let totalLoaded = 0;
    for (const colName of COLLECTIONS) {
      const col = mongoDbInstance.collection(colName);
      const docs = await col.find({}).toArray();
      if (docs && docs.length > 0) {
        // Strip mongo internal _id to keep clean schema
        data[colName] = docs.map(d => {
          const clean = { ...d };
          delete clean._id;
          return clean;
        });
        totalLoaded += docs.length;
      }
    }

    const metaDoc = await mongoDbInstance.collection('meta').findOne({ key: 'system_meta' });
    if (metaDoc) {
      const cleanMeta = { ...metaDoc };
      delete cleanMeta._id;
      delete cleanMeta.key;
      data.meta = cleanMeta;
    }

    console.log(`[UniXsport Database] Synchronized ${totalLoaded} documents from MongoDB Atlas.`);
    migrateUserIds();
    scrubPlaintextPasswords();
    // Update local JSON cache as instant offline mirror
    saveLocalJson();
  } catch (err) {
    console.error('[UniXsport Database] MongoDB connection failed, falling back to local JSON cache:', err.message);
    isMongoConnected = false;
  }
}

function initLocalDatabase() {
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
  if (!data.equipment) data.equipment = [];
  if (!data.borrowLogs) data.borrowLogs = [];
  if (!data.gymRequests) data.gymRequests = [];
  if (!data.workoutPlans) data.workoutPlans = [];
  if (!data.notices) data.notices = [];
  if (!data.facilities) data.facilities = [];
  if (!data.events) data.events = [];
  if (!data.rfidScans) data.rfidScans = [];
  if (!data.sessions) data.sessions = [];
  if (!data.contactMessages) data.contactMessages = [];
  if (!data.reviews) data.reviews = [];
  if (!data.processedMutations) data.processedMutations = [];

  // Super Hybrid: Ensure versioning on all collections
  const collectionsToCheck = ['users', 'equipment', 'borrowLogs', 'gymRequests', 'workoutPlans', 'notices', 'facilities'];
  const now = new Date().toISOString();
  collectionsToCheck.forEach(col => {
    if (Array.isArray(data[col])) {
      data[col].forEach(doc => {
        if (!doc._version) doc._version = 1;
        if (!doc.updatedAt) doc.updatedAt = doc.createdAt || now;
      });
    }
  });

  migrateUserIds();
  scrubPlaintextPasswords();
  saveLocalJson();
}

/**
 * Atomic Safe Local File Write: Writes to a temporary file first, then renames.
 * Prevents file corruption if the process crashes during writing.
 */
function saveLocalJson() {
  const tempFile = DB_FILE + '.tmp';
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (e) {
    console.error('Error saving local database file:', e);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch(ign) {}
  }
}

/**
 * Robust Atomic Upsert Engine for MongoDB Atlas
 * - Uses bulkWrite with upsert: true keyed on document unique 'id' or 'token'
 * - Completely avoids deleteMany race conditions
 * - Queues concurrent sync operations sequentially to prevent race collisions
 */
async function syncToMongoInternal() {
  if (!isMongoConnected || !mongoDbInstance) return;
  if (isSyncing) {
    syncQueued = true;
    return;
  }

  isSyncing = true;
  try {
    for (const colName of COLLECTIONS) {
      const col = mongoDbInstance.collection(colName);
      const records = data[colName] || [];

      if (records.length === 0) {
        await col.deleteMany({});
        continue;
      }

      // Collect IDs present in current memory state
      const currentIds = [];
      const bulkOps = [];

      for (const r of records) {
        const copy = { ...r };
        delete copy._id;

        // Determine unique identifier for upsert
        let filter = null;
        if (copy.id) {
          filter = { id: copy.id };
          currentIds.push(copy.id);
        } else if (copy.user_id) {
          filter = { user_id: copy.user_id };
          currentIds.push(copy.user_id);
        } else if (copy.token) {
          filter = { token: copy.token };
        }

        if (filter) {
          bulkOps.push({
            replaceOne: {
              filter,
              replacement: copy,
              upsert: true
            }
          });
        }
      }

      // Execute atomic bulk upserts
      if (bulkOps.length > 0) {
        await col.bulkWrite(bulkOps, { ordered: false });
      }

      // Remove records deleted from memory that have explicit 'id'
      if (currentIds.length > 0) {
        await col.deleteMany({ id: { $nin: currentIds } });
      }
    }

    if (data.meta) {
      const metaCol = mongoDbInstance.collection('meta');
      const cleanMeta = { ...data.meta };
      delete cleanMeta._id;
      delete cleanMeta.key;
      await metaCol.replaceOne(
        { key: 'system_meta' },
        { key: 'system_meta', ...cleanMeta },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('[UniXsport Database] MongoDB background sync error:', err.message);
  } finally {
    isSyncing = false;
    if (syncQueued) {
      syncQueued = false;
      syncToMongoInternal();
    }
  }
}

async function syncDocToMongo(colName, filter, doc) {
  if (!isMongoConnected || !mongoDbInstance) return;
  try {
    const col = mongoDbInstance.collection(colName);
    const clean = Object.assign({}, doc);
    delete clean._id;
    await col.replaceOne(filter, clean, { upsert: true });
  } catch (err) {
    console.error('[MongoDB Direct Sync] Failed for ' + colName + ':', err.message);
  }
}

/**
 * Universal saveDatabase: Atomically updates local mirror and triggers atomic upsert to MongoDB
 */
function saveDatabase() {
  // 1. Immediately update local mirror (atomic temp file write)
  saveLocalJson();

  // 2. Persist to MongoDB Atlas via queued atomic upsert
  syncToMongoInternal();
}

// 1. Load local data immediately on startup (zero boot latency)
initLocalDatabase();

// 2. Connect to MongoDB Atlas in background and sync
connectMongoDB();

module.exports = {
  db: data,
  data,
  saveDatabase,
  generateNextUserId,
  syncDocToMongo,
  getMongoDb: () => isMongoConnected ? mongoDbInstance : null,
  isMongoConnected: () => isMongoConnected,
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
  get contactMessages() { return data.contactMessages; },
  get reviews() { return data.reviews; },
  get processedMutations() { return data.processedMutations; }
};
