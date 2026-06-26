require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

async function reset() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const email = 'ahmedelian2016@gmail.com';
    let user = await User.findOne({ email });
    if (!user) {
      console.log('User not found! Creating it...');
      user = new User({
        username: 'AhmedElian',
        email: email,
        password: '1' // Will be hashed by pre-save
      });
      await user.save();
      console.log('User created with password: 1');
    } else {
      user.password = '1';
      await user.save();
      console.log('Password reset to: 1');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
reset();
