const admin = require('firebase-admin');

// Initialize Firebase Admin with your project credentials
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

module.exports = db;
