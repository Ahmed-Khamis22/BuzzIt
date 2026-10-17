const mongoose = require('mongoose');

const seasonWinnerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  rank: { type: Number, required: true, min: 1, max: 3 },
  points: { type: Number, default: 0, min: 0 },
  coins: { type: Number, required: true, min: 0 },
  gems: { type: Number, required: true, min: 0 },
  badgeId: { type: String, enum: ['season_gold', 'season_silver', 'season_bronze'], required: true },
}, { _id: false });

const seasonSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true, index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'finished'], default: 'active', index: true },
  winners: { type: [seasonWinnerSchema], default: [] },
  finalizedAt: { type: Date, default: null, index: true },
  awardsGeneratedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Season', seasonSchema);
