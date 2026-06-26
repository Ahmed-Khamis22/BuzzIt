const express = require('express');
const StoreItem = require('../models/StoreItem');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/items', async (req, res) => {
  try {
    let isAdmin = false;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const User = require('../models/User');
        const user = await User.findById(decoded.userId);
        if (user && user.isAdmin) {
          isAdmin = true;
        }
      } catch (e) {
        // invalid token, just treat as non-admin
      }
    }

    const query = { isAvailable: true };
    if (!isAdmin) {
      query.isAdminOnly = { $ne: true };
    }

    const items = await StoreItem.find(query);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buy', auth, async (req, res) => {
  try {
    const { itemId, currency = 'coins', couponCode } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });
    if (!['coins', 'gems'].includes(currency)) return res.status(400).json({ error: 'Invalid currency' });

    const item = await StoreItem.findById(itemId);
    if (!item || !item.isAvailable) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (currency === 'gems' && item.gemPrice == null) {
      return res.status(400).json({ error: 'This item cannot be bought with gems' });
    }

    if (currency === 'coins' && item.isGemOnly) {
      return res.status(400).json({ error: 'هذا العنصر الأسطوري حصري للجواهر فقط!' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.inventory.some(id => id.equals(item._id))) {
      return res.status(409).json({ error: 'Item already owned' });
    }

    let finalPrice = currency === 'gems' ? item.gemPrice : item.price;
    let appliedCoupon = null;

    if (couponCode) {
      appliedCoupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (!appliedCoupon) {
        return res.status(400).json({ error: 'Invalid coupon code' });
      }
      if (!appliedCoupon.isValid()) {
        return res.status(400).json({ error: 'Coupon expired or max uses reached' });
      }
      
      const discount = finalPrice * (appliedCoupon.discountPercent / 100);
      finalPrice = Math.max(0, Math.ceil(finalPrice - discount));
    }

    if (currency === 'coins' && user.coins < finalPrice) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }
    if (currency === 'gems' && user.gems < finalPrice) {
      return res.status(400).json({ error: 'Insufficient gems' });
    }

    if (currency === 'coins') user.coins -= finalPrice;
    else user.gems -= finalPrice;
    
    user.inventory.push(item._id);
    await user.save();

    if (appliedCoupon) {
      appliedCoupon.uses += 1;
      await appliedCoupon.save();
    }

    const populatedUser = await User.findById(req.userId).populate('inventory');

    res.json({ coins: populatedUser.coins, gems: populatedUser.gems, inventory: populatedUser.inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/equip', auth, async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Check if the user owns this item
    if (!user.inventory.some(id => id.equals(itemId))) {
      return res.status(403).json({ error: 'You do not own this item' });
    }

    const item = await StoreItem.findById(itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    // Update equipped items based on type
    if (!user.equippedItems) {
      user.equippedItems = {};
    }
    
    user.equippedItems[item.type] = item._id;
    await user.save();

    // Re-fetch populated user to return the full state to frontend
    const updatedUser = await User.findById(req.userId)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
