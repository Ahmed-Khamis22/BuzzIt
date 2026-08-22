const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function createTestUser() {
  try {
    if (process.env.BUZZIT_ENV !== 'development' || !process.env.MONGODB_DB_NAME) {
      throw new Error('Refusing to create test users outside the isolated development database.');
    }
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });

    for (let index = 1; index <= 6; index += 1) {
      const username = `devplayer${index}`;
      const exists = await User.exists({ username });
      if (exists) continue;
      await User.create({
        username,
        email: `${username}@example.com`,
        password: 'DevTest123!',
        isVerified: true,
        coins: 9999,
        gems: 9999,
      });
    }
    console.log(`Development test users are ready in ${process.env.MONGODB_DB_NAME}.`);
  } catch (err) {
    console.error('Error creating test user:', err);
  } finally {
    mongoose.disconnect();
  }
}

createTestUser();
