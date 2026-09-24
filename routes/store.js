const express = require('express');
const mongoose = require('mongoose');
const StoreItem = require('../models/StoreItem');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

const router = express.Router();

const STORE_DAILY_REWARD = 20;
const CAIRO_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function cairoDayKey(value = new Date()) {
  return CAIRO_DAY_FORMATTER.format(new Date(value));
}

const HELP_CARDS = [
  { _id: 'card_freeze_01', name: 'تجميد اللاعبين', description: 'يمنع منافسيك اللي لسه ما جاوبوش من الإجابة في السؤال الحالي.', price: 125, type: 'card', imageUrl: 'card_freeze', consumableKey: 'freeze', isAvailable: true },
  { _id: 'card_double_01', name: 'دبّلها', description: 'يضاعف نقاط إجابتك الصح.', price: 150, type: 'card', imageUrl: 'card_double', consumableKey: 'double', isAvailable: true },
  { _id: 'card_fifty_01', name: 'شيل إجابتين', description: 'يشيل اختيارين غلط من السؤال.', price: 100, type: 'card', imageUrl: 'card_fifty', consumableKey: 'fiftyFifty', isAvailable: true },
  { _id: 'card_shield_01', name: 'الدرع', description: 'يحمي نقاطك من تأثير المنافسين.', price: 175, type: 'card', imageUrl: 'card_shield', consumableKey: 'shield', isAvailable: true },
];

const PLAYER_AVATARS = [
  { name: 'زيزو', description: 'دايمًا جاهز للتحدي.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_blue', isAvailable: true },
  { name: 'لوزة', description: 'خفيفة وداخلة التحدي بثقة.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_purple', isAvailable: true },
  { name: 'أبو العُرّيف', description: 'حاسبها قبل ما السؤال يخلص.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_glasses', isAvailable: true },
  { name: 'سُكّرة', description: 'هادية، بس إجاباتها سريعة.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_yellow', isAvailable: true },
  { name: 'بعبع', description: 'كيوت، بنفسجي، وبيحب الأرقام.', price: 2000, type: 'avatar', imageUrl: 'avatar_game_numbers', isAvailable: true },
  { name: 'روبو', description: 'روبوت حنكشة الرسمي للكلمات.', price: 2000, type: 'avatar', imageUrl: 'avatar_game_robot', isAvailable: true },
  { name: 'ريشة', description: 'بتحوّل أي فكرة لرسمة.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_artist', isAvailable: true },
  { name: 'فِكري', description: 'بيخطط للحركة اللي بعدها.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_strategist', isAvailable: true },
  { name: 'فهلوية', description: 'الإجابة عندها قبل السؤال.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_quizmaster', isAvailable: true },
  { name: 'كابتن حنكشة', description: 'صاحب المايك ومولّع القعدة.', price: 1200, type: 'avatar', imageUrl: 'avatar_game_host', isAvailable: true },
];
const PLAYER_AVATAR_KEYS = new Set(PLAYER_AVATARS.map((avatar) => avatar.imageUrl));

const PLAYER_BORDERS = [
  { name: 'الملكي', description: 'بنفسجي وذهبي بطابع ملكي.', price: 3000, type: 'border', imageUrl: 'border_lotus_royal', isAvailable: true },
  { name: 'نيون سماوي', description: 'إضاءة سماوية بطابع أركيد.', price: 4000, type: 'border', imageUrl: 'border_arcade_sport', isAvailable: true },
  { name: 'نجوم حنكشة', description: 'نجوم متحركة حوالين صورتك.', price: 99999, gemPrice: 35, isGemOnly: true, type: 'border', imageUrl: 'border_hankasha_star', isAvailable: true },
  { name: 'بوابة النيون', description: 'إطار متحرك بإضاءة كونية.', price: 99999, gemPrice: 50, isGemOnly: true, type: 'border', imageUrl: 'border_cosmic_arcade', isAvailable: true },
];
const GAME_BUZZERS = [
  { name: 'جرس الطلب', description: 'جرس جديد تستخدمه في تحدي الجرس.', price: 3000, type: 'buzzer', imageUrl: 'bell_restaurant_v1', isAvailable: true },
  { name: 'جرس أركيد نيون', description: 'زر ألعاب نيون بصوت إلكتروني سريع.', price: 3500, type: 'buzzer', imageUrl: 'bell_arcade_neon_v1', isAvailable: true },
  { name: 'الجرس النحاسي', description: 'جرس مكتب كلاسيكي برنّة نحاسية.', price: 2500, type: 'buzzer', imageUrl: 'bell_brass_v1', isAvailable: true },
  { name: 'جرس الصاروخ', description: 'زر انطلاق بصوت صاروخي مميز.', price: 4000, type: 'buzzer', imageUrl: 'bell_rocket_v1', isAvailable: true },
  { name: 'جرس المجرة', description: 'جرس كوني برنّة فضائية لامعة.', price: 4500, type: 'buzzer', imageUrl: 'bell_cosmic_v1', isAvailable: true },
];
const LEGACY_SQUARE_BORDER_KEYS = [
  'border_fire',
  'border_neon',
  'border_diamond',
  'border_matrix',
  'border_gold_rush',
  'border_ocean',
  'border_magic',
  'border_cosmic',
  'border_ice',
  'border_toxic',
  'border_dragon',
  'border_horizon',
];
const LEGACY_STORE_COPY = [
  { imageUrl: 'theme_world_cup', name: 'مصر 2026', description: 'أجواء كورة وتشجيع المنتخب.' },
  { imageUrl: 'theme_pharaoh', name: 'فرعوني', description: 'دهبي وأسود بطابع مصري قديم.' },
  { imageUrl: 'theme_ramadan', name: 'رمضان', description: 'فوانيس وليالي القاهرة.' },
  { imageUrl: 'theme_ultras', name: 'المدرّج', description: 'نار وحماس جمهور الكورة.' },
  { imageUrl: 'theme_alexandria', name: 'إسكندرية', description: 'بحر وهواء ودرجات أزرق.' },
  { imageUrl: 'theme_sinai', name: 'سينا', description: 'جبال وسماء مليانة نجوم.' },
  { imageUrl: 'theme_cairo_night', name: 'القاهرة بالليل', description: 'أنوار القاهرة بعد المغرب.' },
  { imageUrl: 'theme_nile_egypt', name: 'النيل', description: 'ألوان النيل وأجواء مصر.' },
];

router.get('/items', async (req, res) => {
  try {
    await StoreItem.deleteMany({
      type: 'border',
      imageUrl: { $in: LEGACY_SQUARE_BORDER_KEYS },
    });
    await StoreItem.bulkWrite([...PLAYER_AVATARS, ...PLAYER_BORDERS, ...GAME_BUZZERS].map((item) => ({
      updateOne: {
        filter: { imageUrl: item.imageUrl },
        update: { $set: item },
        upsert: true,
      },
    })));
    await StoreItem.bulkWrite(LEGACY_STORE_COPY.map(({ imageUrl, ...copy }) => ({
      updateOne: {
        filter: { imageUrl },
        update: { $set: copy },
      },
    })));
    let isAdmin = false;
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('isAdmin').lean();
        if (user && user.isAdmin) {
          isAdmin = true;
        }
      } catch (e) {
        // invalid token, just treat as non-admin
      }
    }

    const query = { isAvailable: true };
    // Admin-only legacy cosmetics are never part of the public catalog. They
    // may remain referenced by old accounts until the compensation migration.
    query.isAdminOnly = { $ne: true };

    const items = await StoreItem.find(query).lean();
    const helpCardKeys = new Set(HELP_CARDS.map((card) => card.consumableKey));
    const helpCardImages = new Set(HELP_CARDS.map((card) => card.imageUrl));
    const visibleItems = items.filter((item) =>
      (item.type !== 'card' || (!helpCardKeys.has(item.consumableKey) && !helpCardImages.has(item.imageUrl))) &&
      (item.type !== 'avatar' || item.isAdminOnly || PLAYER_AVATAR_KEYS.has(item.imageUrl))
    );
    res.json([...HELP_CARDS, ...visibleItems]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/buy', auth, async (req, res) => {
  try {
    const { itemId, currency = 'coins', couponCode } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });
    if (!['coins', 'gems'].includes(currency)) return res.status(400).json({ error: 'Invalid currency' });

    const helpCard = HELP_CARDS.find((card) => card._id === itemId);
    let item = helpCard || null;
    if (!item && mongoose.isValidObjectId(itemId)) {
      item = await StoreItem.findById(itemId);
    } else if (!item) {
      const fallbackBuzzerAssets = {
        buzzer_restaurant_01: 'bell_restaurant_v1',
        buzzer_arcade_neon_01: 'bell_arcade_neon_v1',
        buzzer_brass_01: 'bell_brass_v1',
        buzzer_rocket_01: 'bell_rocket_v1',
        buzzer_cosmic_01: 'bell_cosmic_v1',
      };
      const imageUrl = fallbackBuzzerAssets[itemId];
      const fallbackBuzzer = GAME_BUZZERS.find((buzzer) => buzzer.imageUrl === imageUrl);
      if (fallbackBuzzer) {
        item = await StoreItem.findOneAndUpdate(
          { imageUrl, type: 'buzzer' },
          { $setOnInsert: fallbackBuzzer },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }
    }
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

    if (!helpCard && user.inventory.some(id => id.equals(item._id))) {
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
    
    if (helpCard) {
      if (!user.consumables) user.consumables = {};
      user.consumables[helpCard.consumableKey] = (user.consumables[helpCard.consumableKey] || 0) + 1;
    } else {
      user.inventory.push(item._id);
    }
    await user.save();

    if (appliedCoupon) {
      appliedCoupon.uses += 1;
      await appliedCoupon.save();
    }

    const populatedUser = await User.findById(req.userId).populate('inventory');

    res.json({ coins: populatedUser.coins, gems: populatedUser.gems, inventory: populatedUser.inventory, consumables: populatedUser.consumables });
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

    // Update equipped items based on type (toggle off if already equipped)
    if (!user.equippedItems) {
      user.equippedItems = {};
    }
    
    if (user.equippedItems[item.type] && user.equippedItems[item.type].equals(item._id)) {
      user.equippedItems[item.type] = null;
    } else {
      user.equippedItems[item.type] = item._id;
    }
    await user.save();

    // Re-fetch populated user to return the full state to frontend
    const updatedUser = await User.findById(req.userId)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer');

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/daily-reward', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('storeDailyRewardDay').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      reward: STORE_DAILY_REWARD,
      claimedToday: user.storeDailyRewardDay === cairoDayKey(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/daily-reward', auth, async (req, res) => {
  try {
    const today = cairoDayKey();
    const user = await User.findOneAndUpdate(
      { _id: req.userId, storeDailyRewardDay: { $ne: today } },
      { $inc: { coins: STORE_DAILY_REWARD }, $set: { storeDailyRewardDay: today } },
      { new: true }
    ).select('coins storeDailyRewardDay');

    if (!user) {
      const exists = await User.exists({ _id: req.userId });
      if (!exists) return res.status(404).json({ error: 'User not found' });
      return res.status(409).json({ error: 'استلمت هدية المتجر اليوم بالفعل. ارجع بكرة!' });
    }

    res.json({ reward: STORE_DAILY_REWARD, coins: user.coins, claimedToday: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/daily-items/refresh', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const refreshCost = 10;
    if ((user.gems || 0) < refreshCost) {
      return res.status(400).json({ error: 'لا توجد جواهر كافية لتحديث العناصر.' });
    }
    user.gems -= refreshCost;
    await user.save();
    res.json({
      gems: user.gems,
      refreshSeed: `${Date.now()}-${user._id}`,
      nextRefreshAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
