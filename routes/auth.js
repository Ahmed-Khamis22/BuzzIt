const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  try {
    console.log('[BACKEND] Received /register request with body:', req.body);
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      console.log('[BACKEND] Registration failed: Missing fields');
      return res.status(400).json({ error: 'username, email and password are required' });
    }

    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      console.log('[BACKEND] Registration failed: User already exists');
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const user = await User.create({ username, email, password });
    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        coins: user.coins,
        selectedTheme: user.selectedTheme,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'هذا الإيميل غير مسجل، يرجى إنشاء حساب جديد أولاً.' });
    }
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.' });
    }

    const token = signToken(user._id);
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        bio: user.bio,
        coins: user.coins,
        selectedTheme: user.selectedTheme,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');
      
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/profile', auth, async (req, res) => {
  try {
    const { username, bio, preferences } = req.body;
    
    // Check if new username is already taken by another user
    if (username) {
      const existingUser = await User.findOne({ username, _id: { $ne: req.userId } });
      if (existingUser) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (preferences !== undefined) {
      if (preferences.showStats !== undefined) updateData['preferences.showStats'] = preferences.showStats;
      if (preferences.showPerformance !== undefined) updateData['preferences.showPerformance'] = preferences.showPerformance;
      if (preferences.showBadges !== undefined) updateData['preferences.showBadges'] = preferences.showBadges;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { $set: updateData },
      { new: true }
    )
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/delete-account', auth, async (req, res) => {
  try {
    console.log(`[BACKEND] Deleting account for user ID: ${req.userId}`);
    const user = await User.findByIdAndDelete(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
