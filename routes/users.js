const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/leaderboard', async (req, res) => {
  try {
    const topUsers = await User.find()
      .sort({ totalWins: -1 })
      .limit(10)
      .select('username totalWins totalGames totalCorrect totalWrong equippedItems')
      .populate('equippedItems.avatar')
      .populate('equippedItems.border');
    res.json(topUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/theme', auth, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!theme) return res.status(400).json({ error: 'theme is required' });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { selectedTheme: theme },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/coins', auth, async (req, res) => {
  try {
    const secret = req.headers['x-app-secret'];
    if (secret !== process.env.APP_SECRET) {
      return res.status(403).json({ error: 'Unauthorized request' });
    }

    const { amount } = req.body;
    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount must be a number' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.coins + amount < 0) {
      return res.status(400).json({ error: 'Insufficient coins' });
    }

    user.coins += amount;
    await user.save();

    res.json({ coins: user.coins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/gems', auth, async (req, res) => {
  try {
    const secret = req.headers['x-app-secret'];
    if (secret !== process.env.APP_SECRET) {
      return res.status(403).json({ error: 'Unauthorized request' });
    }

    const { amount } = req.body;
    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount must be a number' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.gems + amount < 0) {
      return res.status(400).json({ error: 'Insufficient gems' });
    }

    user.gems += amount;
    await user.save();

    res.json({ gems: user.gems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/exchange-gems-for-coins', auth, async (req, res) => {
  try {
    const { gemCost, coinAmount } = req.body;
    if (!gemCost || !coinAmount || gemCost <= 0 || coinAmount <= 0) {
      return res.status(400).json({ error: 'البيانات غير صالحة.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });

    if (user.gems < gemCost) {
      return res.status(400).json({ error: 'لا يوجد لديك جواهر كافية.' });
    }

    user.gems -= gemCost;
    user.coins += coinAmount;
    await user.save();

    res.json({
      success: true,
      coins: user.coins,
      gems: user.gems,
      message: `تم تحويل ${gemCost} جوهرة إلى ${coinAmount} كوينز بنجاح!`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/spin-wheel', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // TEMPORARILY DISABLED FOR TESTING
    /*
    if (user.lastSpinClaim) {
      const lastClaim = new Date(user.lastSpinClaim);
      lastClaim.setHours(0, 0, 0, 0);

      if (lastClaim.getTime() === today.getTime()) {
        return res.status(400).json({ error: 'لقد قمت بلف عجلة الحظ اليوم بالفعل! عد غداً.' });
      }
    }
    */

    const rewards = [
      { value: 5, weight: 35 },
      { value: 10, weight: 25 },
      { value: 15, weight: 12 },
      { value: 20, weight: 7 },
      { value: 25, weight: 4 },
      { value: 30, weight: 2 },
      { value: 35, weight: 5 },
      { value: 40, weight: 4 },
      { value: 45, weight: 2.5 },
      { value: 50, weight: 1.5 },
      { value: 55, weight: 1.0 },
      { value: 60, weight: 0.5 },
      { value: 65, weight: 0.2 },
      { value: 70, weight: 0.1 },
      { value: 75, weight: 0.1 },
      { value: 80, weight: 0.05 },
      { value: 85, weight: 0.03 },
      { value: 90, weight: 0.02 },
      { value: 95, weight: 0 },
      { value: 100, weight: 0 }
    ];

    const totalWeight = rewards.reduce((sum, r) => sum + r.weight, 0);
    let random = Math.random() * totalWeight;
    let selectedReward = rewards[0].value;

    for (const r of rewards) {
      if (random < r.weight) {
        selectedReward = r.value;
        break;
      }
      random -= r.weight;
    }

    user.coins += selectedReward;
    user.lastSpinClaim = new Date();
    await user.save();

    res.json({
      success: true,
      reward: selectedReward,
      coins: user.coins,
      lastSpinClaim: user.lastSpinClaim
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET Another User Profile & Relationship Status ──
router.get('/profile/:id', auth, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id)
      .select('username bio totalWins totalGames totalCorrect totalWrong equippedItems createdAt')
      .populate('equippedItems.avatar')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');

    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const currentUser = await User.findById(req.userId);
    let relationship = 'none';

    if (currentUser.friends.includes(targetUser._id)) {
      relationship = 'friends';
    } else if (currentUser.friendRequestsSent.includes(targetUser._id)) {
      relationship = 'sent';
    } else if (currentUser.friendRequestsReceived.includes(targetUser._id)) {
      relationship = 'received';
    }

    res.json({
      profile: targetUser,
      relationship
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET My Friends & Received/Sent Requests ──
router.get('/me/friends', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate({
        path: 'friends',
        select: 'username bio equippedItems totalWins totalGames totalCorrect',
        populate: [
          { path: 'equippedItems.avatar', select: 'name imageUrl price type' },
          { path: 'equippedItems.border', select: 'name imageUrl price type' }
        ]
      })
      .populate({
        path: 'friendRequestsReceived',
        select: 'username bio equippedItems totalWins totalGames totalCorrect',
        populate: [
          { path: 'equippedItems.avatar', select: 'name imageUrl price type' },
          { path: 'equippedItems.border', select: 'name imageUrl price type' }
        ]
      })
      .populate({
        path: 'friendRequestsSent',
        select: 'username bio equippedItems totalWins totalGames totalCorrect',
        populate: [
          { path: 'equippedItems.avatar', select: 'name imageUrl price type' },
          { path: 'equippedItems.border', select: 'name imageUrl price type' }
        ]
      });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      friends: user.friends || [],
      friendRequestsReceived: user.friendRequestsReceived || [],
      friendRequestsSent: user.friendRequestsSent || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET Search Users by Username ──
router.get('/search', auth, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim() === '') {
      return res.json([]);
    }

    const currentUserId = req.userId;

    const users = await User.find({
      username: { $regex: query.trim(), $options: 'i' },
      _id: { $ne: currentUserId }
    })
    .select('username bio equippedItems totalWins totalGames')
    .populate([
      { path: 'equippedItems.avatar', select: 'name imageUrl price type' },
      { path: 'equippedItems.border', select: 'name imageUrl price type' }
    ])
    .limit(15);

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const results = users.map(user => {
      let relationship = 'none';
      if (currentUser.friends.includes(user._id)) {
        relationship = 'friends';
      } else if (currentUser.friendRequestsSent.includes(user._id)) {
        relationship = 'sent';
      } else if (currentUser.friendRequestsReceived.includes(user._id)) {
        relationship = 'received';
      }
      return {
        ...user.toObject(),
        relationship
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Send Friend Request ──
router.post('/friend-request/:targetUserId', auth, async (req, res) => {
  try {
    const callerId = req.userId;
    const targetId = req.params.targetUserId;

    if (callerId === targetId) {
      return res.status(400).json({ error: 'لا يمكنك إرسال طلب صداقة لنفسك.' });
    }

    const caller = await User.findById(callerId);
    const target = await User.findById(targetId);

    if (!caller || !target) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    if (caller.friends.includes(targetId)) {
      return res.status(400).json({ error: 'أنتما أصدقاء بالفعل.' });
    }
    if (caller.friendRequestsSent.includes(targetId)) {
      return res.status(400).json({ error: 'تم إرسال طلب الصداقة بالفعل.' });
    }

    caller.friendRequestsSent.push(targetId);
    target.friendRequestsReceived.push(callerId);

    await caller.save();
    await target.save();

    res.json({ success: true, message: 'تم إرسال طلب الصداقة بنجاح!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Accept Friend Request ──
router.post('/friend-accept/:targetUserId', auth, async (req, res) => {
  try {
    const callerId = req.userId;
    const targetId = req.params.targetUserId;

    const caller = await User.findById(callerId);
    const target = await User.findById(targetId);

    if (!caller || !target) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    if (!caller.friendRequestsReceived.includes(targetId)) {
      return res.status(400).json({ error: 'لا يوجد طلب صداقة وارد من هذا المستخدم.' });
    }

    caller.friendRequestsReceived = caller.friendRequestsReceived.filter(id => id.toString() !== targetId);
    target.friendRequestsSent = target.friendRequestsSent.filter(id => id.toString() !== callerId);

    if (!caller.friends.includes(targetId)) caller.friends.push(targetId);
    if (!target.friends.includes(callerId)) target.friends.push(callerId);

    await caller.save();
    await target.save();

    res.json({ success: true, message: 'تم قبول طلب الصداقة بنجاح!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Decline/Cancel Friend Request ──
router.post('/friend-decline/:targetUserId', auth, async (req, res) => {
  try {
    const callerId = req.userId;
    const targetId = req.params.targetUserId;

    const caller = await User.findById(callerId);
    const target = await User.findById(targetId);

    if (!caller || !target) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    caller.friendRequestsReceived = caller.friendRequestsReceived.filter(id => id.toString() !== targetId);
    caller.friendRequestsSent = caller.friendRequestsSent.filter(id => id.toString() !== targetId);
    target.friendRequestsReceived = target.friendRequestsReceived.filter(id => id.toString() !== callerId);
    target.friendRequestsSent = target.friendRequestsSent.filter(id => id.toString() !== callerId);

    await caller.save();
    await target.save();

    res.json({ success: true, message: 'تم إلغاء/رفض طلب الصداقة بنجاح.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Remove Friend ──
router.post('/friend-remove/:targetUserId', auth, async (req, res) => {
  try {
    const callerId = req.userId;
    const targetId = req.params.targetUserId;

    const caller = await User.findById(callerId);
    const target = await User.findById(targetId);

    if (!caller || !target) {
      return res.status(404).json({ error: 'المستخدم غير موجود.' });
    }

    caller.friends = caller.friends.filter(id => id.toString() !== targetId);
    target.friends = target.friends.filter(id => id.toString() !== callerId);

    await caller.save();
    await target.save();

    res.json({ success: true, message: 'تمت إزالة الصديق بنجاح.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
