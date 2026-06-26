require('dotenv').config();
const mongoose = require('mongoose');
const StoreItem = require('./models/StoreItem');

const adminItems = [
  {
    name: 'الزعيم (Admin)',
    description: 'أفاتار حصري لمديري اللعبة فقط.',
    price: 0,
    gemPrice: 0,
    isGemOnly: false,
    type: 'avatar',
    imageUrl: 'avatar_admin',
    isAvailable: true,
    isAdminOnly: true
  },
  {
    name: 'إطار الإدارة (Admin)',
    description: 'إطار مخصص لإدارة اللعبة.',
    price: 0,
    gemPrice: 0,
    isGemOnly: false,
    type: 'border',
    imageUrl: 'border_admin',
    isAvailable: true,
    isAdminOnly: true
  },
  {
    name: 'غلاف الزعيم (Admin)',
    description: 'غلاف بروفايل حصري لمديري اللعبة مكتوب عليه ADMIN.',
    price: 0,
    gemPrice: 0,
    isGemOnly: false,
    type: 'cover',
    imageUrl: 'cover_admin',
    isAvailable: true,
    isAdminOnly: true
  }
];

async function seedAdminItems() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Insert or update
    for (const item of adminItems) {
      const existing = await StoreItem.findOne({ name: item.name });
      if (!existing) {
        await StoreItem.create(item);
        console.log(`Added ${item.name}`);
      } else {
        await StoreItem.updateOne({ name: item.name }, { $set: item });
        console.log(`${item.name} already exists. Updated data.`);
      }
    }
    
    console.log('Admin items seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin items:', error);
    process.exit(1);
  }
}

seedAdminItems();
