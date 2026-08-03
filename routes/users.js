const express = require('express');
const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const auth = require('../middleware/auth');
const { TASKS: DAILY_TASKS, resetDailyTasksIfStale, getDailyTasksState } = require('../services/dailyTasks');
const { consumeAdView } = require('../services/adRewards');

const router = express.Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Extra spins expire overnight. Reading them through this rather than off the
// document means a stale count from yesterday is never spendable, with no
// cleanup job to run.
function availableExtraSpins(user) {
  if (!user.extraSpinsDate) return 0;
  const stored = new Date(user.extraSpinsDate);
  stored.setHours(0, 0, 0, 0);
  return stored.getTime() === startOfToday().getTime() ? user.extraSpins || 0 : 0;
}

router.get('/leaderboard', async (req, res) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    if (type === 'friends') {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'مطلوب تسجيل الدخول لعرض ترتيب الأصدقاء.' });
      }
      const jwt = require('jsonwebtoken');
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const callerId = decoded.userId;

      const callerUser = await User.findById(callerId);
      if (!callerUser) {
        return res.status(404).json({ error: 'المستخدم غير موجود.' });
      }

      const friendIds = [callerUser._id, ...(callerUser.friends || [])];
      const friendUsers = await User.find({ _id: { $in: friendIds } })
        .sort({ totalWins: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('username totalWins totalGames totalCorrect totalWrong equippedItems')
        .populate('equippedItems.avatar')
        .populate('equippedItems.border');

      return res.json(friendUsers);
    }

    const topUsers = await User.find()
      .sort({ totalWins: -1 })
      .skip(skip)
      .limit(limitNum)
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

// ── Daily login reward ──
// Flat 5 coins a day, doubling to 10 on every 7th day of the streak, then the
// cycle repeats (days 7, 14, 21 … are the payout days).
const DAILY_BASE = 5;
const DAILY_BONUS = 10;
const DAILY_BONUS_EVERY = 7;   // days 7, 14, 21 … pay double
// One week at a time. Thirty cells told the player "twenty days to go", which
// reads as a chore; a week ending in the big prize reads as almost there.
const DAILY_CYCLE = 7;

function dailyAmountFor(day) {
  return day % DAILY_BONUS_EVERY === 0 ? DAILY_BONUS : DAILY_BASE;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dailyStateFor(user) {
  const today = startOfDay(new Date());
  const last = user.lastDailyReward ? startOfDay(user.lastDailyReward) : null;
  const claimedToday = !!last && last.getTime() === today.getTime();

  // A streak survives only if the previous claim was yesterday.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const continues = !!last && last.getTime() === yesterday.getTime();

  const streak = claimedToday ? user.dailyStreak : (continues ? user.dailyStreak + 1 : 1);
  const amount = dailyAmountFor(streak);

  const doubled = !!user.dailyDoubledAt && startOfDay(user.dailyDoubledAt).getTime() === today.getTime();

  // The calendar the app draws. Built here so the UI can never show an
  // amount the server wouldn't actually pay out.
  const cycleStart = streak - ((streak - 1) % DAILY_CYCLE);
  const days = [];
  for (let i = 0; i < DAILY_CYCLE; i++) {
    const day = cycleStart + i;
    days.push({
      day,
      amount: dailyAmountFor(day),
      bonus: day % DAILY_BONUS_EVERY === 0,
      state: day < streak || (day === streak && claimedToday)
        ? 'claimed'
        : day === streak
          ? 'today'
          : 'upcoming',
    });
  }

  return { claimedToday, streak, amount, doubled, days, week: Math.ceil(streak / DAILY_CYCLE) };
}

// What the Home screen shows before the player taps anything.
router.get('/daily-reward', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const s = dailyStateFor(user);
    res.json({ claimedToday: s.claimedToday, streak: s.streak, amount: s.amount, doubled: s.doubled, days: s.days, week: s.week });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/daily-reward', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const s = dailyStateFor(user);
    if (s.claimedToday) {
      return res.status(409).json({ error: 'استلمت مكافأة اليوم بالفعل. تعال بكرة!' });
    }

    user.coins += s.amount;
    user.dailyStreak = s.streak;
    user.lastDailyReward = new Date();
    await user.save();

    res.json({ reward: s.amount, streak: s.streak, coins: user.coins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Doubling is a rewarded-ad perk: the server checks the claim happened today and
// hasn't already been doubled, so the client can't ask for it twice.
router.post('/daily-reward/double', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const s = dailyStateFor(user);
    if (!s.claimedToday) return res.status(400).json({ error: 'استلم مكافأة اليوم الأول.' });
    if (s.doubled) return res.status(409).json({ error: 'ضاعفت مكافأة اليوم بالفعل.' });

    user.coins += s.amount;
    user.dailyDoubledAt = new Date();
    await user.save();

    res.json({ reward: s.amount, coins: user.coins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Daily tasks ──
// What the Home screen shows before the player taps anything.
router.get('/daily-tasks', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (resetDailyTasksIfStale(user)) await user.save();
    res.json({ tasks: getDailyTasksState(user), bonusClaimed: (user.dailyTasksClaimed || []).includes('daily_bonus') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Called right after the "watch an ad" task's own rewarded ad finishes — bumps
// progress only, the coin payout still happens through /daily-tasks/claim.
router.post('/daily-tasks/watch-ad', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    resetDailyTasksIfStale(user);

    // The task needs one ad. Anything past that is a client bug or someone
    // poking the endpoint — either way there's nothing left to award, so stop
    // inflating the lifetime counter that daily progress is derived from.
    const adsTask = getDailyTasksState(user).find((t) => t.id === 'watch_ad');
    if (adsTask?.completed) {
      return res.json({ tasks: getDailyTasksState(user) });
    }

    const view = await consumeAdView(req.userId, 'daily-task-ad');
    if (!view.ok) return res.status(402).json({ error: view.error });

    user.totalAdsWatched = (user.totalAdsWatched || 0) + 1;
    await user.save();

    res.json({ tasks: getDailyTasksState(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/daily-tasks/claim', auth, async (req, res) => {
  try {
    const { taskId } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    resetDailyTasksIfStale(user);

    // Manual Bonus Claim Logic
    if (taskId === 'daily_bonus') {
      const claimedTasks = user.dailyTasksClaimed || [];
      const regularTasksCount = claimedTasks.filter(id => id !== 'daily_bonus').length;
      
      if (regularTasksCount < DAILY_TASKS.length) return res.status(400).json({ error: 'يجب إكمال جميع المهام أولاً.' });
      if (claimedTasks.includes('daily_bonus')) return res.status(409).json({ error: 'تم استلام المكافأة الكبرى بالفعل.' });
      
      user.coins += 20;
      user.dailyTasksClaimed.push('daily_bonus');
      await user.save();
      
      return res.json({ reward: 20, coins: user.coins, tasks: getDailyTasksState(user), bonusClaimed: true });
    }

    const task = DAILY_TASKS.find((t) => t.id === taskId);
    if (!task) return res.status(400).json({ error: 'مهمة غير صالحة.' });

    const state = getDailyTasksState(user).find((t) => t.id === taskId);
    if (!state.completed) return res.status(400).json({ error: 'لسه ما خلصتش المهمة دي.' });
    if (state.claimed) return res.status(409).json({ error: 'استلمت مكافأة المهمة دي بالفعل.' });

    user.coins += task.reward;
    user.dailyTasksClaimed = [...(user.dailyTasksClaimed || []), taskId];
    await user.save();

    res.json({ reward: task.reward, coins: user.coins, tasks: getDailyTasksState(user), bonusClaimed: user.dailyTasksClaimed.includes('daily_bonus') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fixed payouts for rewarded ads. The client sends a reward *type*, never an
// amount — otherwise anyone can ask for any number of coins without an ad.
const AD_REWARDS = {
  coins: { field: 'coins', amount: 50 },
  coins_20: { field: 'coins', amount: 20 },
  gems: { field: 'gems', amount: 2 },
};

// A flat daily count let someone claim right before midnight and again right
// after — two payouts minutes apart. A cooldown since the *last* claim closes
// that gap and doubles as the throttle: 6h means at most 4 a day, spread out,
// not all of them the moment the day resets.
const AD_REWARD_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function formatWait(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} دقيقة`;
  return `${Math.ceil(minutes / 60)} ساعة`;
}

router.post('/claim-ad-reward', auth, async (req, res) => {
  try {
    const { rewardType } = req.body;
    const reward = AD_REWARDS[rewardType];
    if (!reward) return res.status(400).json({ error: 'نوع المكافأة غير صالح.' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Checked before spending the ad view — a player who's still on cooldown
    // shouldn't lose the verified view; it stays unspent for their next claim.
    if (user.lastAdRewardAt) {
      const remaining = AD_REWARD_COOLDOWN_MS - (Date.now() - new Date(user.lastAdRewardAt).getTime());
      if (remaining > 0) {
        return res.status(429).json({ error: `لازم تستنى ${formatWait(remaining)} قبل مكافأة الإعلان الجاية.` });
      }
    }

    // Spend a Google-verified ad view. Before this existed, anyone holding
    // their own token could POST here on a loop and collect the reward
    // without ever loading an ad.
    const view = await consumeAdView(req.userId, `claim-ad-reward:${rewardType}`);
    if (!view.ok) return res.status(402).json({ error: view.error });

    user[reward.field] += reward.amount;
    user.lastAdRewardAt = new Date();
    user.totalAdsWatched = (user.totalAdsWatched || 0) + 1;
    await user.save();

    res.json({
      reward: reward.amount,
      field: reward.field,
      coins: user.coins,
      gems: user.gems,
      nextRewardAt: new Date(user.lastAdRewardAt.getTime() + AD_REWARD_COOLDOWN_MS),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End-of-game reward chest, unlocked by watching a rewarded ad.
// The server decides the amount from the recorded match result — the client
// never sends a number — and each player can only claim once per game.
router.post('/claim-game-reward', auth, async (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode || typeof roomCode !== 'string') {
      return res.status(400).json({ error: 'roomCode is required' });
    }

    // Only a match that just finished can be claimed
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const game = await GameHistory.findOne({
      roomCode: roomCode.toUpperCase(),
      playedAt: { $gte: since },
    }).sort({ playedAt: -1 });

    if (!game) return res.status(404).json({ error: 'لم نجد نتيجة لهذه اللعبة.' });

    if ((game.rewardClaimedBy || []).some((id) => String(id) === String(req.userId))) {
      return res.status(409).json({ error: 'استلمت مكافأة هذه اللعبة بالفعل.' });
    }

    const me = game.players.find((p) => p.userId && String(p.userId) === String(req.userId));
    if (!me) return res.status(403).json({ error: 'لم تشارك في هذه اللعبة.' });

    // Anti-farm: a real match, not two accounts opening and closing rooms
    const registeredPlayers = game.players.filter((p) => p.userId).length;
    const totalAnswers = game.players.reduce(
      (sum, p) => sum + (p.correctAnswers || 0) + (p.wrongAnswers || 0),
      0
    );
    if (registeredPlayers < 2 || totalAnswers < 3) {
      return res.status(400).json({ error: 'اللعبة قصيرة جداً للحصول على مكافأة.' });
    }

    const isWinner = game.winnerId && String(game.winnerId) === String(req.userId);
    const reward =
      15 +
      (isWinner ? 25 : 0) +
      Math.min((me.correctAnswers || 0) * 2, 20);

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $inc: { coins: reward } },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    game.rewardClaimedBy.push(req.userId);
    await game.save();

    res.json({ reward, coins: user.coins, isWinner: !!isWinner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /coins and PUT /gems used to live here. They let any authenticated client
// set its own balance, "guarded" by an x-app-secret that was hardcoded in the
// app bundle and sent on every request — so anyone who read the APK or watched
// traffic could mint unlimited currency.
//
// Balances now only move through endpoints that own the amount themselves:
//   gems  → POST /api/purchases/google/verify (verified against Google Play)
//   coins → daily-reward, daily-tasks, claim-ad-reward, claim-game-reward,
//           spin-wheel, exchange-gems-for-coins
// Do not reintroduce a client-supplied amount here.

// The only valid gem→coin packs. Kept server-side on purpose: the client used
// to send both the price AND the payout, which let anyone mint unlimited coins.
const COIN_PACKS = {
  coins_100: { gemCost: 10, coinAmount: 100 },
  coins_500: { gemCost: 45, coinAmount: 500 },
  coins_1000: { gemCost: 80, coinAmount: 1000 },
  coins_2500: { gemCost: 180, coinAmount: 2500 },
};

router.post('/exchange-gems-for-coins', auth, async (req, res) => {
  try {
    const { packId, gemCost: legacyGemCost } = req.body;

    // Resolve the pack from our own table — never from client-supplied amounts.
    let pack = packId ? COIN_PACKS[packId] : null;
    if (!pack && typeof legacyGemCost === 'number') {
      // Older clients only send the price; match it against a known pack.
      pack = Object.values(COIN_PACKS).find((p) => p.gemCost === legacyGemCost) || null;
    }
    if (!pack) {
      return res.status(400).json({ error: 'الباقة غير صالحة.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });

    if (user.gems < pack.gemCost) {
      return res.status(400).json({ error: 'لا يوجد لديك جواهر كافية.' });
    }

    const gemCost = pack.gemCost;
    const coinAmount = pack.coinAmount;

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

// Bought with a rewarded ad. The app used to just flip a local flag and let the
// player spin, which /spin-wheel then rejected — a full ad watched for nothing.
const EXTRA_SPINS_DAILY_CAP = 3;

router.post('/grant-extra-spin', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const current = availableExtraSpins(user);
    if (current >= EXTRA_SPINS_DAILY_CAP) {
      return res.status(429).json({ error: 'وصلت للحد الأقصى من اللفات الإضافية اليوم. عد غداً.' });
    }

    const view = await consumeAdView(req.userId, 'extra-spin');
    if (!view.ok) return res.status(402).json({ error: view.error });

    user.extraSpins = current + 1;
    user.extraSpinsDate = startOfToday();
    await user.save();

    res.json({ extraSpins: user.extraSpins });
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

    // Once-a-day limit. Without it the wheel is unlimited free coins, and the
    // "watch an ad for an extra spin" offer is worthless.
    // Set ALLOW_UNLIMITED_SPIN=true in .env to bypass while testing.
    let spendingExtraSpin = false;
    if (process.env.ALLOW_UNLIMITED_SPIN !== 'true' && user.lastSpinClaim) {
      const lastClaim = new Date(user.lastSpinClaim);
      lastClaim.setHours(0, 0, 0, 0);

      if (lastClaim.getTime() === today.getTime()) {
        // Already had the free spin — an ad-bought one is the only way through.
        if (availableExtraSpins(user) > 0) {
          spendingExtraSpin = true;
        } else {
          return res.status(400).json({ error: 'لقد قمت بلف عجلة الحظ اليوم بالفعل! عد غداً.' });
        }
      }
    }

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
    if (spendingExtraSpin) {
      // Don't move lastSpinClaim — the free spin is already used up for today
      // and overwriting it would hand out a second free one tomorrow morning.
      user.extraSpins = availableExtraSpins(user) - 1;
      user.extraSpinsDate = startOfToday();
    } else {
      user.lastSpinClaim = new Date();
    }
    await user.save();

    res.json({
      success: true,
      reward: selectedReward,
      coins: user.coins,
      lastSpinClaim: user.lastSpinClaim,
      extraSpins: availableExtraSpins(user),
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
