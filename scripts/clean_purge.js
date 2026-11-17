const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e) {}

const config = require('../server/config');
const DB_FILE = path.join(__dirname, '../server/data_store.json');
const MONGODB_URI = config.MONGODB_URI || process.env.MONGODB_URI;

async function purgeDemoData() {
  console.log('========================================================');
  console.log('  UniXsport - Clean Database Purge (Demo Data Removal)   ');
  console.log('========================================================\n');

  // 1. Read existing admin user
  let localData = {};
  if (fs.existsSync(DB_FILE)) {
    try {
      localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      console.error('Error reading local file:', e.message);
    }
  }

  const adminUser = (localData.users || []).find(u => u.role === 'admin') || {
    id: 'usr_admin',
    user_id: 'US001',
    userId: 'US001',
    regNo: 'admin',
    username: 'admin',
    name: 'System Administrator',
    email: 'admin@unixsport.edu',
    passwordHash: '$2a$10$Awcm.4XjvxMlp2.CJ1ldEufhFdF9OzS1.1ZgVEbCrjNp3a5mFppHS',
    role: 'admin',
    rfidTag: 'ADMIN_RFID_99',
    department: 'Sports Directorate',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _version: 1
  };

  // Keep existing facilities and genuine notices/reviews
  const facilities = localData.facilities || [];
  const events = localData.events || [];
  const cleanNotices = (localData.notices || []).filter(n => 
    !n.message?.includes('Kasun Bandara') && 
    !n.title?.includes('Kasun Bandara') &&
    n.visibleTo !== 'US006'
  );
  const reviews = (localData.reviews || []).filter(r => r.verified === true);

  // Construct clean database state
  const cleanData = {
    meta: {
      lastUserIdSeq: 1 // Next registered user will receive US002
    },
    users: [adminUser],
    equipment: [],
    borrowLogs: [],
    gymRequests: [],
    workoutPlans: [],
    notices: cleanNotices,
    facilities: facilities,
    events: events,
    rfidScans: [],
    sessions: [],
    contactMessages: [],
    reviews: reviews,
    processedMutations: []
  };

  // 2. Connect to MongoDB Atlas
  console.log('[1/3] Connecting to MongoDB Atlas...');
  const conn = await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000
  });
  const mongoDb = conn.connection.db;
  console.log('✓ Connected to MongoDB Atlas successfully.');

  // 3. Purge and sync MongoDB Atlas cloud collections
  console.log('[2/3] Purging test data from MongoDB Atlas cloud collections...');

  // Users: replace with only System Admin
  await mongoDb.collection('users').deleteMany({});
  const cleanAdmin = { ...adminUser };
  delete cleanAdmin._id;
  await mongoDb.collection('users').insertOne(cleanAdmin);
  console.log('  - users: Reset to 1 Administrator account (System Administrator - US001)');

  // Clear demo collections
  await mongoDb.collection('equipment').deleteMany({});
  console.log('  - equipment: Cleared (0 items, ready for fresh inventory)');

  await mongoDb.collection('borrowLogs').deleteMany({});
  console.log('  - borrowLogs: Cleared (0 active loans)');

  await mongoDb.collection('gymRequests').deleteMany({});
  console.log('  - gymRequests: Cleared (0 schedule bookings)');

  await mongoDb.collection('workoutPlans').deleteMany({});
  console.log('  - workoutPlans: Cleared (0 workout plans)');

  await mongoDb.collection('rfidScans').deleteMany({});
  console.log('  - rfidScans: Cleared (0 scan logs)');

  await mongoDb.collection('sessions').deleteMany({});
  console.log('  - sessions: Cleared (0 active sessions)');

  await mongoDb.collection('contactMessages').deleteMany({});
  console.log('  - contactMessages: Cleared');

  await mongoDb.collection('processedMutations').deleteMany({});
  console.log('  - processedMutations: Cleared');

  // Notices
  await mongoDb.collection('notices').deleteMany({});
  if (cleanNotices.length > 0) {
    const noticesToInsert = cleanNotices.map(n => {
      const c = { ...n };
      delete c._id;
      return c;
    });
    await mongoDb.collection('notices').insertMany(noticesToInsert);
  }
  console.log(`  - notices: Retained ${cleanNotices.length} system announcements`);

  // Meta
  await mongoDb.collection('meta').replaceOne(
    { key: 'system_meta' },
    { key: 'system_meta', lastUserIdSeq: 1 },
    { upsert: true }
  );
  console.log('  - meta: Sequence reset (next User ID will be US002)');

  // 4. Update local file mirror
  console.log('[3/3] Updating local mirror (server/data_store.json)...');
  fs.writeFileSync(DB_FILE, JSON.stringify(cleanData, null, 2), 'utf8');
  console.log('✓ server/data_store.json written and synchronized.');

  // Verify
  const userCount = await mongoDb.collection('users').countDocuments();
  const eqCount = await mongoDb.collection('equipment').countDocuments();
  const reqCount = await mongoDb.collection('gymRequests').countDocuments();

  console.log('\n========================================================');
  console.log('  PURGE COMPLETE & VERIFIED:');
  console.log(`  - Cloud Users in MongoDB:      ${userCount} (Admin only)`);
  console.log(`  - Cloud Equipment in MongoDB:  ${eqCount}`);
  console.log(`  - Cloud Gym Requests:          ${reqCount}`);
  console.log(`  - Local Users in data_store:   ${cleanData.users.length}`);
  console.log('========================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

purgeDemoData().catch(err => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
