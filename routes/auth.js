const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Otp = require('../models/Otp');
const GameHistory = require('../models/GameHistory');
const CommunityMessage = require('../models/CommunityMessage');
const Feedback = require('../models/Feedback');
const Purchase = require('../models/Purchase');
const AdVerification = require('../models/AdVerification');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { emailKey } = require('../middleware/rateLimitKey');

const router = express.Router();
const googleClient = new OAuth2Client();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(userId) {
  return User.findById(userId)
    .select('-password')
    .populate('inventory')
    .populate('equippedItems.avatar')
    .populate('equippedItems.theme')
    .populate('equippedItems.effect')
    .populate('equippedItems.border')
    .populate('equippedItems.cover')
    .populate('equippedItems.buzzer');
}

async function verifyGoogleToken(idToken) {
  const audience = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!audience) {
    const error = new Error('تسجيل الدخول بجوجل غير مُجهّز على السيرفر بعد');
    error.status = 503;
    throw error;
  }
  if (!idToken) {
    const error = new Error('بيانات تسجيل الدخول بجوجل ناقصة');
    error.status = 400;
    throw error;
  }

  const ticket = await googleClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email || !payload.email_verified) {
    const error = new Error('تعذر التأكد من حساب جوجل');
    error.status = 401;
    throw error;
  }
  return payload;
}

async function uniqueUsername(preferredName) {
  const cleaned = String(preferredName || 'لاعب')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 15) || 'لاعب';
  if (!(await User.exists({ username: cleaned }))) return cleaned;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomInt(1000, 10000).toString();
    const candidate = `${cleaned.slice(0, 10)}_${suffix}`;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `لاعب_${crypto.randomBytes(4).toString('hex')}`.slice(0, 15);
}

function randomPassword() {
  return `${crypto.randomBytes(24).toString('hex')}A1`;
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

const socialAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: 'محاولات كثيرة، حاول مرة أخرى بعد قليل.' }
});

// Validators
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isGmailAddress = (email) => email.endsWith('@gmail.com');

const isValidPassword = (password) => {
  // At least 8 chars, 1 letter, 1 number
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/.test(password);
};

router.post('/register', registerLimiter, async (req, res) => {
  try {
    // Never log req.body here — it carries the plaintext password, and this
    // line was writing it straight into Render's logs for every signup.
    console.log('[BACKEND] Received /register request for:', req.body?.username, req.body?.email);
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    if (username.trim().length > 15) {
      return res.status(400).json({ error: 'اسم المستخدم يجب ألا يتجاوز 15 حرفاً' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    if (!isValidEmail(normalizedEmail) || !isGmailAddress(normalizedEmail)) {
      return res.status(400).json({ error: 'استخدم حساب Gmail حقيقيًا حتى يصلك كود التأكيد' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأصل وتحتوي على حرف ورقم واحد على الأقل' });
    }

    const [existingByEmail, existingByUsername, pendingUsername] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      User.findOne({ username }),
      Otp.findOne({
        purpose: 'verify_email',
        'registration.username': username,
        email: { $ne: normalizedEmail },
      }),
    ]);

    if ((existingByUsername && existingByUsername.email !== normalizedEmail) || pendingUsername) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    }
    if (existingByEmail && existingByEmail.isVerified) {
      return res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
    }

    // The actual User document is created only after the code is confirmed.
    await Otp.deleteMany({ email: normalizedEmail, purpose: 'verify_email' });
    const otpCode = Otp.generateOTP();
    const passwordHash = await bcrypt.hash(password, 10);
    await Otp.create({
      email: normalizedEmail,
      otp: otpCode,
      purpose: 'verify_email',
      registration: { username, passwordHash },
    });

    // Send Email. sendEmail swallows its errors and reports false, so check it
    // — otherwise the account sits here unverified with no code on its way and
    // the user has no way to ask for another one.
    const sent = await sendVerificationEmail(normalizedEmail, otpCode);
    if (!sent) {
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
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer');

    const token = signToken(user._id);
    res.json({
      token,
      user: populatedUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/google', socialAuthLimiter, async (req, res) => {
  try {
    const googleProfile = await verifyGoogleToken(req.body?.idToken);
    const normalizedEmail = googleProfile.email.trim().toLowerCase();

    let user = await User.findOne({
      $or: [{ googleId: googleProfile.sub }, { email: normalizedEmail }],
    });

    if (user) {
      if (user.googleId && user.googleId !== googleProfile.sub) {
        return res.status(409).json({ error: 'البريد مرتبط بحساب جوجل مختلف' });
      }
      user.googleId = googleProfile.sub;
      user.isGuest = false;
      user.isVerified = true;
      if (!user.profileImage && googleProfile.picture) user.profileImage = googleProfile.picture;
      await user.save();
    } else {
      user = await User.create({
        username: await uniqueUsername(googleProfile.name || normalizedEmail.split('@')[0]),
        email: normalizedEmail,
        password: randomPassword(),
        googleId: googleProfile.sub,
        isGuest: false,
        isVerified: true,
        profileImage: googleProfile.picture || '',
      });
    }

    res.json({ token: signToken(user._id), user: await publicUser(user._id) });
  } catch (err) {
    console.error('[AUTH] Google sign-in failed:', err.message);
    res.status(err.status || 401).json({ error: err.status ? err.message : 'تعذر تسجيل الدخول بجوجل، حاول مرة أخرى' });
  }
});

router.post('/guest', socialAuthLimiter, async (req, res) => {
  try {
    const { username } = req.body || {};
    const guestId = crypto.randomBytes(8).toString('hex');
    let requestedName = `ضيف_${guestId.slice(0, 6)}`;

    if (username && typeof username === 'string') {
      const trimmed = username.trim();
      if (trimmed.length >= 2 && trimmed.length <= 15) {
        requestedName = trimmed;
      }
    }

    const user = await User.create({
      username: await uniqueUsername(requestedName),
      email: `guest-${guestId}@guest.hanaksha.invalid`,
      password: randomPassword(),
      isGuest: true,
      isVerified: true,
    });

    res.status(201).json({ token: signToken(user._id), user: await publicUser(user._id) });
  } catch (err) {
    console.error('[AUTH] Guest sign-in failed:', err.message);
    res.status(500).json({ error: 'تعذر إنشاء حساب ضيف، حاول مرة أخرى' });
  }
});

router.post('/google/link', socialAuthLimiter, auth, async (req, res) => {
  try {
    const googleProfile = await verifyGoogleToken(req.body?.idToken);
    const normalizedEmail = googleProfile.email.trim().toLowerCase();
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });

    const linkedAccount = await User.findOne({
      _id: { $ne: user._id },
      $or: [{ googleId: googleProfile.sub }, { email: normalizedEmail }],
    });
    if (linkedAccount) {
      return res.status(409).json({
        error: 'حساب جوجل ده مرتبط بحساب حنكشة تاني. سجل الدخول به بدلًا من ربطه.',
      });
    }

    user.email = normalizedEmail;
    user.googleId = googleProfile.sub;
    user.isGuest = false;
    user.isVerified = true;
    if (googleProfile.picture) user.profileImage = googleProfile.picture;
    await user.save();

    res.json({ user: await publicUser(user._id) });
  } catch (err) {
    console.error('[AUTH] Google account linking failed:', err.message);
    res.status(err.status || 401).json({ error: err.status ? err.message : 'تعذر ربط حساب جوجل، حاول مرة أخرى' });
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

    let user = await User.findOne({ email: normalizedEmail });
    const pending = otpDoc.registration;

    if (pending?.username && pending?.passwordHash) {
      if (user) {
        // Compatibility for unverified rows made by older server versions.
        user.username = pending.username;
        user.password = pending.passwordHash;
        user.isVerified = true;
      } else {
        user = new User({
          username: pending.username,
          email: normalizedEmail,
          password: pending.passwordHash,
          isVerified: true,
        });
      }
      user.$locals.passwordAlreadyHashed = true;
      await user.save();
    } else if (user) {
      // Legacy verification codes did not carry registration details.
      user.isVerified = true;
      await user.save();
    } else {
      return res.status(410).json({ error: 'انتهت بيانات التسجيل. أنشئ الحساب مرة أخرى.' });
    }

    await Otp.deleteMany({ email: normalizedEmail, purpose: 'verify_email' });

    const populatedUser = await User.findById(user._id)
      .select('-password')
      .populate('inventory')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer');

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
    const pendingRegistration = purpose === 'verify_email'
      ? await Otp.findOne({ email: normalizedEmail, purpose }).sort({ createdAt: -1 })
      : null;

    if (purpose === 'verify_email' && !pendingRegistration && !user) {
      return res.status(404).json({ error: 'انتهت بيانات التسجيل. أنشئ الحساب مرة أخرى.' });
    }
    if (purpose === 'reset_password' && !user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const registration = pendingRegistration?.registration?.username
      ? pendingRegistration.registration
      : user && !user.isVerified
        ? { username: user.username, passwordHash: user.password }
        : undefined;

    await Otp.deleteMany({ email: normalizedEmail, purpose });

    const otpCode = Otp.generateOTP();
    await Otp.create({ email: normalizedEmail, otp: otpCode, purpose, registration });

    let sent = false;
    if (purpose === 'verify_email') {
      sent = await sendVerificationEmail(normalizedEmail, otpCode);
    } else if (purpose === 'reset_password') {
      sent = await sendPasswordResetEmail(normalizedEmail, otpCode);
    }

    if (!sent) {
      await Otp.deleteMany({ email: normalizedEmail, purpose });
      return res.status(502).json({ error: 'تعذّر إرسال الكود الآن، حاول مرة أخرى بعد قليل.' });
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
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer');
      
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
      if (preferences.onlineStatus !== undefined) updateData['preferences.onlineStatus'] = preferences.onlineStatus;
      if (preferences.allowFriendRequests !== undefined) updateData['preferences.allowFriendRequests'] = preferences.allowFriendRequests;
      if (preferences.showLeaderboard !== undefined) updateData['preferences.showLeaderboard'] = preferences.showLeaderboard;
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
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer');

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
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await Promise.all([
      User.updateMany(
        {},
        {
          $pull: {
            friends: req.userId,
            friendRequestsSent: req.userId,
            friendRequestsReceived: req.userId,
          },
        }
      ),
      GameHistory.updateMany(
        { 'players.userId': req.userId },
        {
          $unset: { 'players.$[player].userId': '' },
          $pull: { rewardClaimedBy: req.userId },
        },
        { arrayFilters: [{ 'player.userId': req.userId }] }
      ),
      GameHistory.updateMany({ hostId: req.userId }, { $unset: { hostId: '' } }),
      GameHistory.updateMany({ winnerId: req.userId }, { $unset: { winnerId: '' } }),
      CommunityMessage.deleteMany({ senderId: req.userId }),
      Feedback.deleteMany({ user: req.userId }),
      Purchase.deleteMany({ userId: req.userId }),
      AdVerification.deleteMany({ userId: req.userId }),
      Otp.deleteMany({ email: user.email }),
    ]);
    await User.deleteOne({ _id: req.userId });
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
