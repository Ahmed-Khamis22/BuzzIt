require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const users = await User.find({}).select('username email createdAt isAdmin').sort({ createdAt: -1 }).limit(20);
    console.log('Recent 20 users:');
    users.forEach(u => {
      console.log(`- Username: ${u.username}, Email: ${u.email}, Created: ${u.createdAt}, Admin: ${u.isAdmin}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    mongoose.disconnect();
  }
}

check();
