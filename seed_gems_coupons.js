const mongoose = require('mongoose');
const User = require('./models/User');
const StoreItem = require('./models/StoreItem');
const Coupon = require('./models/Coupon');

mongoose.connect('mongodb://localhost:27017/buzzit').then(async () => {
  console.log('Connected to DB');

  // Give a user some gems
  const user = await User.findOne();
  if (user) {
    user.gems = 1000;
    await user.save();
    console.log('Gave gems to user:', user.username);
  }

  // Set gemPrice for "theme_cyberpunk" and "cover_moez"
  await StoreItem.updateOne({ name: 'Theme Cyberpunk' }, { gemPrice: 50 });
  await StoreItem.updateOne({ name: 'Cover Moez' }, { gemPrice: 20 });
  console.log('Updated some store items with gem prices');

  // Create a 50% off coupon
  const c = new Coupon({ code: 'BUZZ50', discountPercent: 50, maxUses: 100 });
  await Coupon.deleteMany({ code: 'BUZZ50' }); // clear old
  await c.save();
  console.log('Created coupon BUZZ50 for 50% off');

  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
