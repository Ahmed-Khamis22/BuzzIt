require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// Usage: node make_admin.js someone@example.com
// Previously this set isAdmin on EVERY user in the database, which is how six
// accounts ended up with panel access. It takes one address now.
async function run() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node make_admin.js <email>');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { isAdmin: true } },
      { new: true }
    );
    if (!user) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }
    console.log(`${user.username} <${user.email}> is now an admin`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
