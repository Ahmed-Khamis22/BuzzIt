require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Make everyone admin for now so he can test it, or just update all
    await User.updateMany({}, { $set: { isAdmin: true } });
    console.log('All users set to admin');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
