require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function addCoins() {
  await mongoose.connect(process.env.MONGODB_URI);
  const res = await User.updateMany({}, { $set: { coins: 10000 } });
  console.log(`Added 10000 coins to ${res.modifiedCount} users!`);
  mongoose.disconnect();
}

addCoins();
