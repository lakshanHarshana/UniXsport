const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://lakshan11430_db_user:F8Yz7MkTbpdwav1i@lakshan.zqcrrba.mongodb.net/unixsport?retryWrites=true&w=majority',
  JWT_SECRET: process.env.JWT_SECRET || 'unixsport_rajarata_university_secret_key_2026',
  JWT_EXPIRES_IN: '24h',
  MAX_SLOT_CAPACITY: 30, // Maximum students per gym session slot
  UPLOAD_DIR: path.join(__dirname, '../uploads'),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'unixsport-rajarata'
};
