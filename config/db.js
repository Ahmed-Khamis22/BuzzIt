const mongoose = require('mongoose');

async function connectDB() {
  const dbName = process.env.MONGODB_DB_NAME;
  try {
    const isDevelopment = process.env.BUZZIT_ENV === 'development';
    if (isDevelopment && !dbName) {
      throw new Error('MONGODB_DB_NAME is required for local development. Refusing to use the production database.');
    }
    await mongoose.connect(process.env.MONGODB_URI, dbName ? { dbName } : undefined);
    console.log(`MongoDB connected${dbName ? ` (${dbName})` : ''}`);
  } catch (err) {
    console.error('MongoDB Atlas connection error:', err.message);
    console.log('Attempting local MongoDB connection fallback (mongodb://127.0.0.1:27017)...');
    try {
      const localUri = `mongodb://127.0.0.1:27017/${dbName || 'buzzit'}`;
      await mongoose.connect(localUri);
      console.log(`Local MongoDB connected (${localUri})`);
    } catch (localErr) {
      console.error('\n======================================================');
      console.error('⚠️ MONGODB CONNECTION FAILED!');
      console.error('سبب الخطأ: عنوان الـ IP الخاص بجهازك تغير وتسبب في منع الاتصال بقاعدة بيانات MongoDB Atlas.');
      console.error('خطوات الحل السريعة:');
      console.error('1. افتح موقع MongoDB Atlas: https://cloud.mongodb.com');
      console.error('2. اختر من القائمة الجانبية "Network Access" تحت قسم Security');
      console.error('3. اضغط على زر "Add IP Address"');
      console.error('4. اضغط على "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0) ثم Confirm');
      console.error('======================================================\n');
      process.exit(1);
    }
  }
}

module.exports = connectDB;
