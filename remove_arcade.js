require('dotenv').config();
const mongoose = require('mongoose');
const StoreItem = require('./models/StoreItem');

async function removeArcade() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find all items with "arcade" or "80s"
    const items = await StoreItem.find({ 
      $or: [
        { imageUrl: /80/i }, 
        { imageUrl: /arcade/i }, 
        { name: /80/i }, 
        { name: /اركيد/i }
      ] 
    });
    
    console.log('Found items to delete:', items.map(i => i.name));
    
    for (const item of items) {
      if (item.type === 'cover' || item.type === 'theme') {
         await StoreItem.deleteOne({ _id: item._id });
         console.log('Deleted:', item.name);
      }
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

removeArcade();
