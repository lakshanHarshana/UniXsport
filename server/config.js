const path = require('path');
const fs = require('fs');

// Support loading .env from project root or server directory
const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, '.env');
if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
} else if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
} else {
  require('dotenv').config();
}

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://lakshan11430_db_user:F8Yz7MkTbpdwav1i@lakshan.zqcrrba.mongodb.net/unixsport?retryWrites=true&w=majority',
  JWT_SECRET: process.env.JWT_SECRET || 'unixsport_rajarata_university_secret_key_2026',
  JWT_EXPIRES_IN: '24h',
  MAX_SLOT_CAPACITY: 30, // Maximum students per gym session slot
  UPLOAD_DIR: path.join(__dirname, '../uploads'),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'unixsport-rajarata',
  RFID_DEVICE_API_KEY: process.env.RFID_DEVICE_API_KEY || 'unixsport_rfid_device_key_2026'
};
