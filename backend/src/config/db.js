const mongoose = require('mongoose');
const dns = require('dns');

// On Windows, Node.js c-ares DNS resolver can fail with querySrv ECONNREFUSED on local ISP DNS.
// Setting public DNS ensures MongoDB Atlas SRV records resolve reliably.
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // Ignore if custom DNS cannot be set
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/architecture_workspace';

  try {
    const conn = await mongoose.connect(uri);
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}`);
    console.log(`[MongoDB] Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Connection Error: ${error.message}`);
    console.error(`\n[Troubleshooting Tips]`);
    console.error(`1. Check your connection string in .env (see .env.example)`);
    console.error(`2. Ensure your current IP is whitelisted under Network Access in MongoDB Atlas (or set to 0.0.0.0/0).`);
    console.error(`3. Ensure your database username and password are correct.\n`);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Connection lost. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Connection re-established.');
});

module.exports = connectDB;
