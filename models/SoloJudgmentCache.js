const mongoose = require('mongoose');

const soloJudgmentCacheSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  normalizedForbidden: { type: String, required: true, maxlength: 100 },
  normalizedAnswer: { type: String, required: true, maxlength: 100 },
  relevant: { type: Boolean, required: true },
  matchesForbidden: { type: Boolean, required: true },
  confidence: { type: Number, min: 0, max: 1, default: 0 },
  reason: { type: String, maxlength: 160, default: '' },
  provider: { type: String, maxlength: 40, default: 'unknown' },
  hits: { type: Number, min: 0, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

soloJudgmentCacheSchema.index(
  { questionId: 1, normalizedForbidden: 1, normalizedAnswer: 1 },
  { unique: true },
);
soloJudgmentCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SoloJudgmentCache', soloJudgmentCacheSchema);
