require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const StoreItem = require('./models/StoreItem');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB...');

    const items = await StoreItem.find({}).lean();
    console.log(`Fetched ${items.length} items from database.`);

    // Format the items exactly as they should be in storeItemsData.js
    const formatted = items.map(item => {
      // Remove mongoose internal fields
      const { __v, ...rest } = item;
      return rest;
    });

    const fileContent = `export const STORE_ITEMS = ${JSON.stringify(formatted, null, 2)};\n`;
    
    const targetPath = path.join(__dirname, '../buzzit/src/services/storeItemsData.js');
    fs.writeFileSync(targetPath, fileContent, 'utf8');
    console.log(`Successfully updated storeItemsData.js at: ${targetPath}`);

    mongoose.disconnect();
  } catch (err) {
    console.error('Error updating fallback IDs:', err);
  }
}

run();
