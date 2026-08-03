const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Otp = require('../models/Otp');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { emailKey } = require('../middleware/rateLimitKey');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Rate Limiters
// All four key on the email in the body rather than the IP: carrier NAT puts
// large numbers of unrelated users behind one address, and an IP bucket here
// means one person's retries lock everyone else out of signing up.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // per account — enough for a forgetful user, not for brute force
  keyGenerator: emailKey,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول، يرجى المحاولة بعد 15 دقيقة.' }
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  keyGenerator: emailKey,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات التسجيل، يرجى المحاولة لاحقاً.' }
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // resends per email — each one costs us an outbound Gmail send
  keyGenerator: emailKey,
  message: { error: 'تم تجاوز الحد الأقصى لطلب الأكواد، يرجى المحاولة بعد 15 دقيقة.' }
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // wrong-code attempts per email, still far below 10^6 guesses
  keyGenerator: emailKey,
  message: { error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الكود، يرجى المحاولة بعد 15 دقيقة.' }
});

// Validators
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPassword = (password) => {
  // At least 8 chars, 1 letter, 1 number
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
};

router.post('/register', registerLimiter, async (req, res) => {
  try {
    console.log('[BACKEND] Received /register request with body:', req.body);
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأصل وتحتوي على حرف ورقم واحد على الأقل' });
    }

    const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] });
    if (existing && existing.email !== normalizedEmail) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    }
    // An unverified row is a signup that never finished — the address was
    // never proven to belong to anyone, so let them start over instead of
    // hitting "email already taken" on an account they can't get into.
    if (existing && existing.isVerified) {
      return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    }

    let user;
    if (existing) {
      existing.username = username;
      existing.password = password; // pre('save') re-hashes it
      await existing.save();
      user = existing;
    } else {
      user = await User.create({ username, email: normalizedEmail, password, isVerified: false });
    }

    // Generate OTP
    await Otp.deleteMany({ email: normalizedEmail, purpose: 'verify_email' });
    const otpCode = Otp.generateOTP();
    await Otp.create({ email: normalizedEmail, otp: otpCode, purpose: 'verify_email' });

    // Send Email. sendEmail swallows its errors and reports false, so check it
    // — otherwise the account sits here unverified with no code on its way and
    // the user has no way to ask for another one.
    const sent = await sendVerificationEmail(normalizedEmail, otpCode);
    if (!sent) {
      if (!existing) await User.deleteOne({ _id: user._id });
      await Otp.deleteMany({ email: normalizedEmail, purpose: 'verify_email' });
      return res.status(502).json({ error: 'تعذّر إرسال كود التفعيل الآن، يرجى المحاولة بعد قليل.' });
    }

    res.status(201).json({
      message: 'Verification required',
      requiresVerification: true,
      email: normalizedEmail
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      return res.status(401).json({ error: 'هذا الإيميل غير مسجل، يرجى إنشاء حساب جديد أولاً.' });
    }
    
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ 
        error: 'الحساب غير مفعل. يرجى تفعيل البريد الإلكتروني أولاً.',
        requiresVerification: true,
        email: normalizedEmail
      });
    }

    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');

    const token = signToken(user._id);
    res.json({
      token,
      user: populatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-email', verifyLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'البريد الإلكتروني والكود مطلوبان' });

    const normalizedEmail = email.trim().toLowerCase();
    const otpDoc = await Otp.findOne({ email: normalizedEmail, otp, purpose: 'verify_email' });
    
    if (!otpDoc) {
      return res.status(400).json({ error: 'الكود غير صحيح أو منتهي الصلاحية' });
    }

    const user = await User.findOneAndUpdate({ email: normalizedEmail }, { isVerified: true }, { new: true });
    await Otp.deleteOne({ _id: otpDoc._id }); // Delete OTP after successful use

    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover');

    const token = signToken(user._id);
    res.json({ token, user: populatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return res.status(400).json({ error: 'مطلوب بيانات ناقصة' });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // Clear old OTPs
    await Otp.deleteMany({ email: normalizedEmail, purpose });

    const otpCode = Otp.generateOTP();
    await Otp.create({ email: normalizedEmail, otp: otpCode, purpose });

    if (purpose === 'verify_email') {
      await sendVerificationEmail(normalizedEmail, otpCode);
    } else if (purpose === 'reset_password') {
      await sendPasswordResetEmail(normalizedEmail, otpCode);
    }

    res.json({ message: 'تم إرسال الكود بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: 'البريد الإلكتروني غير مسجل' });

    await Otp.deleteMany({ email: normalizedEmail, purpose: 'reset_password' });
    
    const otpCode = Otp.generateOTP();
    await Otp.create({ email: normalizedEmail, otp: otpCode, purpose: 'reset_password' });
    
    await sendPasswordResetEmail(normalizedEmail, otpCode);

    res.json({ message: 'تم إرسال كود استعادة كلمة المرور' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reset-password', verifyLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأصل وتحتوي على حرف ورقم واحد على الأقل' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpDoc = await Otp.findOne({ email: normalizedEmail, otp, purpose: 'reset_password' });
    
    if (!otpDoc) {
      return res.status(400).json({ error: 'الكود غير صحيح أو منتهي الصلاحية' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    user.password = newPassword;
    await user.save(); // This will trigger the pre('save') hash middleware

    await Otp.deleteOne({ _id: otpDoc._id });

    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
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
