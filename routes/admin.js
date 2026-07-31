const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const StoreItem = require('../models/StoreItem');
const Coupon = require('../models/Coupon');
const Announcement = require('../models/Announcement');
const { uploadBuffer } = require('../services/cloudinary');

const router = express.Router();

// Memory storage, not disk — Render's filesystem doesn't survive a redeploy,
// and we're streaming straight to Cloudinary anyway so a temp file is pointless.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('الملف لازم يكون صورة.'));
    }
    cb(null, true);
  },
});

// Middleware to verify Admin status
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'عفواً، هذه الصلاحية للمدراء فقط (Admin Only)' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🖼️ POST /api/admin/upload-image — for the store item / announcement image
// fields. Returns { url } to paste straight into imageUrl.
router.post('/upload-image', auth, adminOnly, (req, res) => {
  // multer invoked manually (not as a normal middleware arg) so its errors —
  // file too large, wrong mimetype — come back as JSON instead of falling
  // through to Express's default HTML error page.
  upload.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'فشل رفع الملف.' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });

      if (!process.env.CLOUDINARY_CLOUD_NAME) {
        console.error('[admin/upload-image] Cloudinary env vars missing');
        return res.status(503).json({ error: 'خدمة رفع الصور غير مُعدة على السيرفر بعد.' });
      }

      const result = await uploadBuffer(req.file.buffer, 'buzzit/admin');
      res.json({ url: result.secure_url });
    } catch (err) {
      res.status(500).json({ error: err.message || 'فشل رفع الصورة.' });
    }
  });
});

// 📊 GET /api/admin/stats
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalItems = await StoreItem.countDocuments();
    const totalCoupons = await Coupon.countDocuments();
    const activeAnnouncement = await Announcement.findOne({ isActive: true }).sort({ createdAt: -1 });

    res.json({
      totalUsers,
      totalItems,
      totalCoupons,
      activeAnnouncement,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛍️ POST /api/admin/store/item - Add new store item
router.post('/store/item', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, gemPrice, type, imageUrl, isGemOnly, isAdminOnly } = req.body;
    if (!name || !price || !type || !imageUrl) {
      return res.status(400).json({ error: 'اسم العنصر والسعر والنوع ورابط الصورة مطلوبين' });
    }

    const item = new StoreItem({
      name,
      description: description || '',
      price: Number(price),
      gemPrice: gemPrice != null ? Number(gemPrice) : null,
      type,
      imageUrl,
      isGemOnly: !!isGemOnly,
      isAdminOnly: !!isAdminOnly,
      isAvailable: true,
    });

    await item.save();
    res.status(201).json({ message: 'تمت إضافة العنصر للمتجر بنجاح!', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛍️ DELETE /api/admin/store/item/:id - Delete store item
router.delete('/store/item/:id', auth, adminOnly, async (req, res) => {
  try {
    const item = await StoreItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود' });
    res.json({ message: 'تم حذف العنصر من المتجر بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🎟️ GET /api/admin/coupons
router.get('/coupons', auth, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🎟️ POST /api/admin/coupons - Create coupon
router.post('/coupons', auth, adminOnly, async (req, res) => {
  try {
    const { code, discountPercent, maxUses } = req.body;
    if (!code || !discountPercent) {
      return res.status(400).json({ error: 'كود الخصم ونسبة الخصم مطلوبين' });
    }

    const coupon = new Coupon({
      code: code.toUpperCase(),
      discountPercent: Number(discountPercent),
      maxUses: maxUses ? Number(maxUses) : 100,
    });

    await coupon.save();
    res.status(201).json({ message: 'تم إنشاء الكوبون بنجاح!', coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🎟️ DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', auth, adminOnly, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الكوبون بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👥 POST /api/admin/users/grant - Grant Coins/Gems to Player
router.post('/users/grant', auth, adminOnly, async (req, res) => {
  try {
    const { username, coins = 0, gems = 0 } = req.body;
    if (!username) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });

    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(404).json({ error: 'اللاعب غير موجود' });

    user.coins += Number(coins);
    user.gems += Number(gems);
    await user.save();

    res.json({ message: `تم منح ${coins} كوينز و ${gems} جواهر للاعب ${user.username}`, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📢 GET & POST Announcements
router.get('/announcements', async (req, res) => {
  try {
    const active = await Announcement.findOne({ isActive: true }).sort({ createdAt: -1 });
    res.json(active || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', auth, adminOnly, async (req, res) => {
  try {
    const { title, message, imageUrl, type } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'العنوان والرسالة مطلوبين' });
    }

    // Deactivate previous announcements
    await Announcement.updateMany({}, { isActive: false });

    const announcement = new Announcement({
      title,
      message,
      imageUrl: imageUrl || '',
      type: type || 'info',
      isActive: true,
    });

    await announcement.save();
    res.status(201).json({ message: 'تم نشر التنويه للجميع بنجاح!', announcement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
