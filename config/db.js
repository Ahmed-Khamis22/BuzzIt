const mongoose = require('mongoose');

async function connectDB() {
  try {
    const isDevelopment = process.env.BUZZIT_ENV === 'development';
    const dbName = process.env.MONGODB_DB_NAME;
    if (isDevelopment && !dbName) {
      throw new Error('MONGODB_DB_NAME is required for local development. Refusing to use the production database.');
    }
    await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : undefined);
    console.log(`MongoDB connected${dbName ? ` (${dbName})` : ''}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
