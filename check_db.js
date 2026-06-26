require('dotenv').config();
const mongoose = require('mongoose');
const StoreItem = require('./models/StoreItem');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const items = await StoreItem.find({});
  console.log('Total store items:', items.length);
  const types = {};
  items.forEach(item => {
    types[item.type] = (types[item.type] || 0) + 1;
    if (item.type === 'cover') {
      console.log(`- Cover: ${item.name} (${item.imageUrl})`);
    }
  });
  console.log('Items by type:', types);
  mongoose.disconnect();
}

check();
