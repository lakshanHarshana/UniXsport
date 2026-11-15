/**
 * UniXsport - MongoDB Migration Script
 * Seamlessly migrates all collections and documents from server/data_store.json into MongoDB Atlas.
 */
const dns = require('dns');
// Set public DNS servers to guarantee SRV resolution on all networks
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e) {}

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const MONGODB_URI = config.MONGODB_URI || process.env.MONGODB_URI;

async function migrate() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected successfully to MongoDB Atlas.');

  const dataFile = path.join(__dirname, 'data_store.json');
  if (!fs.existsSync(dataFile)) {
    console.log('No data_store.json found to migrate.');
    process.exit(0);
  }

  const raw = fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, '');
  const jsonData = JSON.parse(raw);

  const collections = [
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
    'contactMessages'
  ];

  const db = mongoose.connection.db;

  for (const colName of collections) {
    const records = jsonData[colName] || [];
    if (records.length > 0) {
      const col = db.collection(colName);
      // Clean existing records in collection to ensure exact fresh sync
      await col.deleteMany({});
      
      // Clean records (remove any MongoDB _id conflict if present)
      const cleanRecords = records.map(r => {
        const copy = { ...r };
        if (copy._id) delete copy._id;
        return copy;
      });

      await col.insertMany(cleanRecords);
      console.log(`Migrated ${colName}: ${cleanRecords.length} documents.`);
    } else {
      console.log(`Collection ${colName}: 0 records.`);
    }
  }

  // Also save meta document
  if (jsonData.meta) {
    const metaCol = db.collection('meta');
    await metaCol.deleteMany({});
    await metaCol.insertOne({ key: 'system_meta', ...jsonData.meta });
    console.log('Migrated system metadata.');
  }

  console.log('=== Migration Complete: All data successfully transferred to MongoDB Atlas ===');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
