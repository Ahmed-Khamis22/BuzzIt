const mongoose = require('mongoose');

const seasonScoreSchema = new mongoose.Schema({
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  points: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

seasonScoreSchema.index({ seasonId: 1, userId: 1 }, { unique: true });
seasonScoreSchema.index({ seasonId: 1, points: -1 });

module.exports = mongoose.model('SeasonScore', seasonScoreSchema);
