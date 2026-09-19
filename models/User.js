const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  googleId: { type: String, unique: true, sparse: true, index: true },
  isGuest: { type: Boolean, default: false },
  profileImage: { type: String, default: '' },
  bio: { type: String, default: '', trim: true },
  // New accounts start with enough coins to use the refreshed catalog.
  coins: { type: Number, default: 1000 },
  gems: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  unlockedAchievements: [{
    id: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
  }],
  isAdmin: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String, default: '' },
  selectedTheme: { type: String, default: 'classic' },
  preferences: {
    showStats: { type: Boolean, default: true },
    showPerformance: { type: Boolean, default: true },
    showBadges: { type: Boolean, default: true },
    onlineStatus: { type: Boolean, default: true },
    allowFriendRequests: { type: Boolean, default: true },
    showLeaderboard: { type: Boolean, default: true }
  },
  inventory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem' }],
  consumables: {
    freeze: { type: Number, default: 0 },
    double: { type: Number, default: 0 },
    fiftyFifty: { type: Number, default: 0 },
    shield: { type: Number, default: 0 },
  },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  equippedItems: {
    avatar: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    theme: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    effect: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    border: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    cover: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
    buzzer: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreItem', default: null },
  },
  totalGames: { type: Number, default: 0 },
  totalWins: { type: Number, default: 0 },
  totalCorrect: { type: Number, default: 0 },
  totalWrong: { type: Number, default: 0 },
  soloStats: {
    dontSayMyWord: {
      currentStreak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
      points: { type: Number, default: 0 },
    },
  },
  lastSpinClaim: { type: Date, default: null },
  extraSpins: { type: Number, default: 0 },
  extraSpinsDate: { type: Date, default: null },
  lastDailyReward: { type: Date, default: null },
  dailyStreak: { type: Number, default: 0 },
  dailyDoubledAt: { type: Date, default: null },
  storeDailyRewardDay: { type: String, default: null },
  lastAdRewardAtByType: { type: Map, of: Date, default: {} },
  adCurrencyRewardDay: { type: String, default: null },
  adCurrencyRewardsClaimed: { type: Number, default: 0 },
  totalAdsWatched: { type: Number, default: 0 },
  dailyTasksDate: { type: Date, default: null },
  dailyTasksBaseline: {
    ads: { type: Number, default: 0 },
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
