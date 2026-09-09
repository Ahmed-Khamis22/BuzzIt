const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const User = require('../models/User');
const StoreItem = require('../models/StoreItem');
const Coupon = require('../models/Coupon');
const Announcement = require('../models/Announcement');
const Feedback = require('../models/Feedback');
const GameHistory = require('../models/GameHistory');
const Question = require('../models/Question');
const Purchase = require('../models/Purchase');
const AppSettings = require('../models/AppSettings');
const { uploadBuffer } = require('../services/cloudinary');
const { aiJudge } = require('../services/aiJudge');

const router = express.Router();

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
    const user = await User.findById(req.userId).select('isAdmin').lean();
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'عفواً، هذه الصلاحية للمدراء فقط (Admin Only)' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 🖼️ POST /api/admin/upload-image
router.post('/upload-image', auth, adminOnly, (req, res) => {
  upload.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'فشل رفع الملف.' });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم إرفاق أي صورة.' });

      if (!process.env.CLOUDINARY_CLOUD_NAME) {
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
    const [totalUsers, verifiedUsers, bannedUsers, totalGamesPlayed, totalFeedbacks, totalBanners] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isBanned: true }),
      GameHistory.countDocuments(),
      Feedback.countDocuments(),
      Announcement.countDocuments({ isActive: true }),
    ]);

    const realtime = req.app.get('realtime');
    const onlineUsers = [...(realtime?.connectedUsers?.entries?.() || [])]
      .filter(([, socketId]) => realtime.io.sockets.sockets.has(socketId)).length;

    res.json({
      totalUsers,
      verifiedUsers,
      bannedUsers,
      totalGamesPlayed,
      totalFeedbacks,
      totalBanners,
      onlineUsers,
      aiProviderStatus: 'ACTIVE',
      serverUptimeSec: Math.floor(process.uptime()),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 👥 GET /api/admin/users/list
router.get('/users/list', auth, adminOnly, async (req, res) => {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const query = search
      ? { $or: [{ username: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] }
      : {};

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('username email coins gems totalWins totalGames isAdmin isVerified isBanned banReason createdAt preferences')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    const realtime = req.app.get('realtime');
    const withPresence = users.map((user) => {
      const socketId = realtime?.connectedUsers?.get(String(user._id));
      const isOnline = Boolean(socketId && realtime?.io?.sockets?.sockets?.has(socketId));
      delete user.preferences;
      return { ...user, isOnline };
    });
    res.json({ users: withPresence, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⛔ POST /api/admin/users/ban - Ban or Unban User
router.post('/users/ban', auth, adminOnly, async (req, res) => {
  try {
    const { userId, isBanned, banReason = '' } = req.body;
    if (!userId) return res.status(400).json({ error: 'مُعرف المستخدم (userId) مطلوب' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'اللاعب غير موجود' });
    if (user.isAdmin) return res.status(403).json({ error: 'لا يمكن حظر حساب الآدمن!' });

    user.isBanned = !!isBanned;
    user.banReason = isBanned ? (banReason || 'مخالفة شروط اللعبة') : '';
    await user.save();

    res.json({
      message: isBanned ? `تم حظر اللاعب ${user.username} بنجاح` : `تم فك حظر اللاعب ${user.username} بنجاح`,
      user: {
        _id: user._id,
        username: user.username,
        isBanned: user.isBanned,
        banReason: user.banReason,
      }
    });
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

// 🛍️ GET /api/admin/store/items - List all store items
router.get('/store/items', auth, adminOnly, async (req, res) => {
  try {
    const items = await StoreItem.find().sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛍️ POST /api/admin/store/item - Add new store item
router.post('/store/item', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, originalPrice, gemPrice, originalGemPrice, onSale, type, imageUrl, isGemOnly, isAdminOnly } = req.body;
    if (!name || price == null || !type || !imageUrl) {
      return res.status(400).json({ error: 'اسم العنصر والسعر والنوع ورابط الصورة مطلوبين' });
    }

    const item = new StoreItem({
      name,
      description: description || '',
      price: Number(price),
      originalPrice: originalPrice != null ? Number(originalPrice) : null,
      gemPrice: gemPrice != null ? Number(gemPrice) : null,
      originalGemPrice: originalGemPrice != null ? Number(originalGemPrice) : null,
      onSale: !!onSale,
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

// 🛍️ PUT /api/admin/store/item/:id - Update store item (Price & Sale Discount)
router.put('/store/item/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, originalPrice, gemPrice, originalGemPrice, onSale, isAvailable, imageUrl } = req.body;
    const item = await StoreItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'عنصر المتجر غير موجود' });

    if (name !== undefined) item.name = name;
    if (description !== undefined) item.description = description;
    if (price !== undefined) item.price = Number(price);
    if (originalPrice !== undefined) item.originalPrice = originalPrice !== null && originalPrice !== '' ? Number(originalPrice) : null;
    if (gemPrice !== undefined) item.gemPrice = gemPrice !== null && gemPrice !== '' ? Number(gemPrice) : null;
    if (originalGemPrice !== undefined) item.originalGemPrice = originalGemPrice !== null && originalGemPrice !== '' ? Number(originalGemPrice) : null;
    if (onSale !== undefined) item.onSale = !!onSale;
    if (isAvailable !== undefined) item.isAvailable = !!isAvailable;
    if (imageUrl !== undefined) item.imageUrl = imageUrl;

    await item.save();
    res.json({ message: 'تم تحديث عنصر المتجر بنجاح!', item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🛍️ DELETE /api/admin/store/item/:id - Delete store item
router.delete('/store/item/:id', auth, adminOnly, async (req, res) => {
  try {
    await StoreItem.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف عنصر المتجر بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🎟️ GET & POST Coupons
router.get('/coupons', auth, adminOnly, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.delete('/coupons/:id', auth, adminOnly, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الكوبون بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   📢 BANNERS & ANNOUNCEMENTS ENDPOINTS
   ======================================================== */

router.get('/announcements', async (req, res) => {
  try {
    const activeBanners = await Announcement.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json(activeBanners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/announcements/all', auth, adminOnly, async (req, res) => {
  try {
    const banners = await Announcement.find()
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', auth, adminOnly, async (req, res) => {
  try {
    const { imageUrl, targetAction, targetUrl } = req.body;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return res.status(400).json({ error: 'رابط صورة البانر مطلوب' });
    }

    const count = await Announcement.countDocuments();

    const banner = new Announcement({
      imageUrl: imageUrl.trim(),
      targetAction: targetAction || 'none',
      targetUrl: targetUrl ? targetUrl.trim() : '',
      order: count,
      isActive: true,
    });

    await banner.save();
    res.status(201).json({ message: 'تم إضافة البانر الإعلاني بنجاح!', banner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/announcements/reorder', auth, adminOnly, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'المصفوفة غير صالحة' });

    const promises = items.map(item =>
      Announcement.findByIdAndUpdate(item.id, { order: item.order })
    );

    await Promise.all(promises);
    res.json({ message: 'تم إعادة ترتيب البانرات بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/announcements/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const banner = await Announcement.findById(req.params.id);
    if (!banner) return res.status(404).json({ error: 'البانر غير موجود' });

    banner.isActive = !banner.isActive;
    await banner.save();
    res.json({ message: 'تم تغيير حالة البانر بنجاح', banner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/announcements/:id', auth, adminOnly, async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف البانر بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   🤖 AI USAGE & QUOTA LIMIT MONITOR ENDPOINT
   ======================================================== */

router.get('/ai-stats', auth, adminOnly, async (req, res) => {
  try {
    const forceProbe = req.query.force === 'true' || req.query.probe === 'true';
    const status = await aiJudge.getStatus({ probe: true, forceProbe });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 💳 Local payment review. Only pending manual transfers can mint gems.
router.get('/purchases', auth, adminOnly, async (req, res) => {
  try {
    const { status = 'pending', limit = 100 } = req.query;
    const query = status === 'all' ? {} : { status };
    const purchases = await Purchase.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 100)))
      .populate('userId', 'username email')
      .lean();
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/purchases/:id/review', auth, adminOnly, async (req, res) => {
  try {
    const { decision, rejectionReason = '' } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'قرار المراجعة غير صالح.' });
    }
    const nextStatus = decision === 'approve' ? 'completed' : 'rejected';
    const purchase = await Purchase.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', platform: 'local' },
      { $set: { status: nextStatus, reviewedAt: new Date(), reviewedBy: req.userId, rejectionReason: decision === 'reject' ? rejectionReason.trim() : '' } },
      { new: true }
    );
    if (!purchase) return res.status(409).json({ error: 'الطلب اتراجع قبل كده أو غير موجود.' });

    if (decision === 'approve') {
      try {
        await User.findByIdAndUpdate(purchase.userId, { $inc: { gems: purchase.gemsGranted } });
      } catch (error) {
        await Purchase.updateOne({ _id: purchase._id, status: 'completed' }, { $set: { status: 'pending' }, $unset: { reviewedAt: 1, reviewedBy: 1 } });
        throw error;
      }
    }
    res.json({ message: decision === 'approve' ? 'تم اعتماد التحويل وإضافة الجواهر.' : 'تم رفض التحويل.', purchase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/app-settings', auth, adminOnly, async (req, res) => {
  try {
    const settings = await AppSettings.findOne({ key: 'global' }).lean();
    res.json(settings || { minVersion: '1.0.0', latestVersion: '1.0.0', storeUrl: 'https://play.google.com/store/apps/details?id=com.buzzit.game', maintenanceEnabled: false, maintenanceMessage: '' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/app-settings', auth, adminOnly, async (req, res) => {
  try {
    const { minVersion, latestVersion, storeUrl, maintenanceEnabled, maintenanceMessage } = req.body;
    const semver = /^\d+\.\d+\.\d+$/;
    if (!semver.test(minVersion || '') || !semver.test(latestVersion || '')) return res.status(400).json({ error: 'رقم النسخة لازم يكون بالشكل 1.0.5' });
    if (!/^https:\/\//i.test(storeUrl || '')) return res.status(400).json({ error: 'رابط المتجر لازم يبدأ بـ https://' });
    const settings = await AppSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: { minVersion, latestVersion, storeUrl, maintenanceEnabled: !!maintenanceEnabled, maintenanceMessage: String(maintenanceMessage || '').trim().slice(0, 240), updatedBy: req.userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ message: 'تم حفظ إعدادات الإصدار والتشغيل.', settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ========================================================
   🚩 REPORTED QUESTIONS & QUESTIONS MANAGEMENT
   ======================================================== */

// GET /api/admin/questions/reported - List questions with user reports
router.get('/questions/reported', auth, adminOnly, async (req, res) => {
  try {
    const questions = await Question.find({ reportCount: { $gt: 0 } })
      .sort({ reportCount: -1, createdAt: -1 })
      .populate('reportedBy', 'username email')
      .lean();
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/questions - List all questions with search, category filter & pagination
router.get('/questions', auth, adminOnly, async (req, res) => {
  try {
    const { category, search = '', page = 1, limit = 30 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { text: new RegExp(search, 'i') },
        { answer: new RegExp(search, 'i') },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [questions, total] = await Promise.all([
      Question.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Question.countDocuments(filter),
    ]);

    res.json({ questions, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/questions - Add a new question from admin panel
router.post('/questions', auth, adminOnly, async (req, res) => {
  try {
    const { text, category, answer, acceptedAnswers = [], difficulty = 'medium', choices = [], flagImage = '' } = req.body;
    if (!text || !category || !answer) {
      return res.status(400).json({ error: 'نص السؤال، القسم، والإجابة الرئيسية مطلوبين.' });
    }
    const question = await Question.create({
      text: text.trim(),
      category: category.trim(),
      answer: answer.trim(),
      acceptedAnswers: Array.isArray(acceptedAnswers) ? acceptedAnswers.map(a => a.trim()).filter(Boolean) : [],
      difficulty,
      choices: Array.isArray(choices) ? choices.map(c => c.trim()).filter(Boolean) : [],
      flagImage: flagImage ? flagImage.trim() : undefined,
    });
    res.status(201).json({ message: 'تم إضافة السؤال بنجاح!', question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/questions/:id - Update question or clear reports
router.put('/questions/:id', auth, adminOnly, async (req, res) => {
  try {
    const { text, category, answer, acceptedAnswers, difficulty, choices, resetReports, flagImage } = req.body;
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'السؤال غير موجود.' });

    if (text !== undefined) question.text = text.trim();
    if (category !== undefined) question.category = category.trim();
    if (answer !== undefined) question.answer = answer.trim();
    if (acceptedAnswers !== undefined) {
      question.acceptedAnswers = Array.isArray(acceptedAnswers) ? acceptedAnswers.map(a => a.trim()).filter(Boolean) : [];
    }
    if (difficulty !== undefined) question.difficulty = difficulty;
    if (choices !== undefined) {
      question.choices = Array.isArray(choices) ? choices.map(c => c.trim()).filter(Boolean) : [];
    }
    if (flagImage !== undefined) {
      question.flagImage = flagImage ? flagImage.trim() : undefined;
    }
    if (resetReports) {
      question.reportCount = 0;
      question.reportedBy = [];
    }

    await question.save();
    res.json({ message: 'تم تحديث السؤال بنجاح!', question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/questions/:id - Delete a question
router.delete('/questions/:id', auth, adminOnly, async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف السؤال بنجاح.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   💬 USER FEEDBACKS & COMPLAINTS
   ======================================================== */

// GET /api/admin/feedbacks - List user feedback & complaints
router.get('/feedbacks', auth, adminOnly, async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .sort({ createdAt: -1 })
      .populate('user', 'username email')
      .lean();
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/feedbacks/:id - Delete user feedback
router.delete('/feedbacks/:id', auth, adminOnly, async (req, res) => {
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الشكوى/الاقتراح بنجاح.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
