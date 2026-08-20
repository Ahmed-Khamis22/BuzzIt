const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  bio: { type: String, default: '', trim: true },
  coins: { type: Number, default: 100 },
  gems: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: true },
  selectedTheme: { type: String, default: 'classic' },
  preferences: {
    showStats: { type: Boolean, default: true },
    showPerformance: { type: Boolean, default: true },
    showBadges: { type: Boolean, default: true }
  },
  inventory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem' }],
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  equippedItems: {
    avatar: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    theme: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    effect: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    border: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    cover: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
  },
  totalGames: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalCorrect: { type: Number, default: 0 },
  totalWrong: { type: Number, default: 0 },
  lastSpinClaim: { type: Date, default: null },
  // Wheel spins bought with a rewarded ad. The client used to unlock the spin
  // button on its own, which the server then refused — the ad paid nothing.
  // Reset by extraSpinsDate rather than a cron, same trick as daily tasks.
  extraSpins: { type: Number, default: 0 },
  extraSpinsDate: { type: Date, default: null },
  // Daily login reward
  lastDailyReward: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0 },
  dailyDoubledAt: { type: Date, default: null },
  // Rewarded-ad throttling, tracked per reward type (coins vs coins_20 vs
  // gems) so a cooldown on one doesn't block the others — each button in the
  // store gets its own clock, checked against AD_REWARD_COOLDOWN_MS in
  // routes/users.js. A calendar-day counter let a player claim right before
  // *and* right after midnight, two payouts minutes apart; a rolling cooldown
  // since the last claim closes that gap.
  lastAdRewardAtByType: { type: Map, of: Date, default: {} },
  // Lifetime counter backing the "watch an ad" daily task — totalGames/
  // totalWins/totalCorrect above already back the other daily tasks.
  totalAdsWatched: { type: Number, default: 0 },
  // Daily tasks reset by snapshotting the lifetime counters at the start of
  // each day, so progress = lifetime - baseline. No cron job needed.
  dailyTasksDate: { type: Date, default: null },
  dailyTasksBaseline: {
    ads: { type: Number, default: 0 },
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
  },
  dailyTasksClaimed: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (this.$locals.passwordAlreadyHashed) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.index({ totalWins: -1 });

module.exports = mongoose.model('User', userSchema);
