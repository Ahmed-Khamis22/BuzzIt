const SoloJudgmentCache = require('../models/SoloJudgmentCache');
const { normalizeArabic } = require('./soloGameLogic');

const HIGH_CONFIDENCE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const LOW_CONFIDENCE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheIdentity({ questionId, forbiddenWord, answer }) {
  return {
    questionId,
    normalizedForbidden: normalizeArabic(forbiddenWord),
    normalizedAnswer: normalizeArabic(answer),
  };
}

async function getPersistentJudgment(input) {
  try {
    const identity = cacheIdentity(input);
    const cached = await SoloJudgmentCache.findOneAndUpdate(
      { ...identity, expiresAt: { $gt: new Date() } },
      { $inc: { hits: 1 }, $set: { updatedAt: new Date() } },
      { new: true },
    ).lean();
    if (!cached) return null;
    return {
      relevant: cached.relevant,
      matchesForbidden: cached.matchesForbidden,
      confidence: cached.confidence,
      reason: cached.reason,
      provider: cached.provider,
    };
  } catch (error) {
    return null;
  }
}

async function savePersistentJudgment(input, judgment) {
  try {
    const identity = cacheIdentity(input);
    if (!identity.normalizedForbidden || !identity.normalizedAnswer) return;
    const confidence = Math.max(0, Math.min(1, Number(judgment?.confidence) || 0));
    const ttl = confidence >= 0.85 ? HIGH_CONFIDENCE_TTL_MS : LOW_CONFIDENCE_TTL_MS;
    const now = new Date();
    await SoloJudgmentCache.findOneAndUpdate(
      identity,
      {
        $set: {
          relevant: judgment.relevant !== false,
          matchesForbidden: judgment.matchesForbidden === true,
          confidence,
          reason: String(judgment.reason || '').slice(0, 160),
          provider: String(judgment.provider || 'unknown').slice(0, 40),
          updatedAt: now,
          expiresAt: new Date(now.getTime() + ttl),
        },
        $setOnInsert: { createdAt: now, hits: 0 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Cache failures must never interrupt a live game.
  }
}

module.exports = {
  cacheIdentity,
  getPersistentJudgment,
  savePersistentJudgment,
};
