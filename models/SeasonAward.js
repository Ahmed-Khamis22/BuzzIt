const mongoose = require('mongoose');

const seasonAwardSchema = new mongoose.Schema({
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
  seasonNumber: { type: Number, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true },
  rank: { type: Number, required: true, min: 1, max: 3 },
  points: { type: Number, default: 0, min: 0 },
  coins: { type: Number, required: true, min: 0 },
  gems: { type: Number, required: true, min: 0 },
  badgeId: { type: String, enum: ['season_gold', 'season_silver', 'season_bronze'], required: true },
  claimedAt: { type: Date, default: null, index: true },
}, { timestamps: true });

seasonAwardSchema.index({ seasonId: 1, userId: 1 }, { unique: true });
seasonAwardSchema.index({ userId: 1, claimedAt: 1, seasonNumber: 1 });

module.exports = mongoose.model('SeasonAward', seasonAwardSchema);
