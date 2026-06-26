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
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
