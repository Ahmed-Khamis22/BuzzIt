const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const Question = require('../models/Question');
const auth = require('../middleware/auth');
const { aiJudge } = require('../services/aiJudge');
const { getPersistentJudgment, savePersistentJudgment } = require('../services/soloJudgmentCache');
const {
  buildDifficultyCurve,
  evaluateContextualAnswer,
  evaluateKnownAnswer,
  normalizeArabic,
  uniqueAlternatives,
} = require('../services/soloGameLogic');

const router = express.Router();
const AI_CACHE_TTL_MS = 60 * 60 * 1000;
const AI_CACHE_MAX = 1000;
const CHALLENGE_TTL_MS = 90 * 60 * 1000;
const judgmentCache = new Map();
const activeChallenges = new Map();
const lastForbiddenByUserAndQuestion = new Map();

const judgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'TOO_MANY_JUDGMENTS', retryable: true },
});

function answerPool(question) {
  const byNormalizedValue = new Map();
  for (const rawAnswer of [question?.answer, ...(question?.acceptedAnswers || [])]) {
    const normalized = normalizeArabic(rawAnswer);
    if (normalized && !byNormalizedValue.has(normalized)) {
      byNormalizedValue.set(normalized, String(rawAnswer).trim());
    }
  }
  return [...byNormalizedValue.entries()].map(([normalized, raw]) => ({ normalized, raw }));
}

function pruneExpiredChallenges() {
  const now = Date.now();
  for (const [challengeId, challenge] of activeChallenges.entries()) {
    if (challenge.expiresAt <= now) activeChallenges.delete(challengeId);
  }
}

function clearUserChallenges(userId) {
  for (const [challengeId, challenge] of activeChallenges.entries()) {
    if (challenge.userId === String(userId)) activeChallenges.delete(challengeId);
  }
}

function chooseForbidden(question, userId) {
  const choices = answerPool(question);
  if (choices.length === 0) return { normalized: normalizeArabic(question.answer), raw: question.answer };
  const historyKey = `${userId}:${question._id}`;
  const previous = lastForbiddenByUserAndQuestion.get(historyKey);
  const available = choices.length > 1 ? choices.filter((choice) => choice.normalized !== previous) : choices;
  const selected = available[Math.floor(Math.random() * available.length)] || choices[0];
  lastForbiddenByUserAndQuestion.set(historyKey, selected.normalized);
  if (lastForbiddenByUserAndQuestion.size > 5000) {
    const oldestKey = lastForbiddenByUserAndQuestion.keys().next().value;
    if (oldestKey) lastForbiddenByUserAndQuestion.delete(oldestKey);
  }
  return selected;
}

function createChallenge(question, userId, index, total) {
  const forbidden = chooseForbidden(question, userId);
  const alternatives = answerPool(question)
    .filter((choice) => choice.normalized !== forbidden.normalized)
    .map((choice) => choice.raw);
  const challengeId = crypto.randomBytes(18).toString('hex');
  const progress = total <= 1 ? 1 : index / (total - 1);
  activeChallenges.set(challengeId, {
    userId: String(userId),
    questionId: String(question._id),
    text: question.text,
    answer: forbidden.raw,
    acceptedAnswers: alternatives,
    judgeMode: question.judgeMode || 'hybrid',
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return {
    challengeId,
    text: question.text,
    difficulty: progress < 0.34 ? 'easy' : progress < 0.74 ? 'medium' : 'hard',
  };
}

function getCachedJudgment(key) {
  const cached = judgmentCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    judgmentCache.delete(key);
    return null;
  }
  return cached.value;
}

function cacheJudgment(key, value) {
  if (judgmentCache.size >= AI_CACHE_MAX) {
    const oldestKey = judgmentCache.keys().next().value;
    if (oldestKey) judgmentCache.delete(oldestKey);
  }
  judgmentCache.set(key, { value, expiresAt: Date.now() + AI_CACHE_TTL_MS });
}

async function loadQuestionPool() {
  return Question.find({ category: 'dont-say-my-word' })
    .select('_id text answer acceptedAnswers judgeMode')
    .lean();
}

router.get('/dont-say-my-word', auth, async (req, res) => {
  try {
    pruneExpiredChallenges();
    clearUserChallenges(req.userId);
    const pool = await loadQuestionPool();
    const questions = buildDifficultyCurve(pool, 10);
    res.json(questions.map((question, index) => createChallenge(question, req.userId, index, questions.length)));
  } catch (error) {
    res.status(500).json({ error: 'SOLO_GAME_LOAD_FAILED' });
  }
});

router.post('/dont-say-my-word/replacement', auth, async (req, res) => {
  try {
    pruneExpiredChallenges();
    const excludedChallengeIds = Array.isArray(req.body?.excludeChallengeIds)
      ? req.body.excludeChallengeIds.slice(0, 30).map(String)
      : [];
    const excludedQuestionIds = new Set(
      excludedChallengeIds
        .map((challengeId) => activeChallenges.get(challengeId))
        .filter((challenge) => challenge?.userId === String(req.userId))
        .map((challenge) => challenge.questionId),
    );
    const round = Math.max(1, Math.min(10, Number(req.body?.round) || 1));
    const pool = (await loadQuestionPool()).filter((question) => !excludedQuestionIds.has(String(question._id)));
    const fallbackPool = pool.length ? pool : await loadQuestionPool();
    const curve = buildDifficultyCurve(fallbackPool, Math.min(10, fallbackPool.length));
    const targetIndex = Math.min(curve.length - 1, Math.round(((round - 1) / 9) * (curve.length - 1)));
    const question = curve[targetIndex];
    if (!question) return res.status(404).json({ error: 'NO_REPLACEMENT_QUESTION' });
    return res.json(createChallenge(question, req.userId, round - 1, 10));
  } catch (error) {
    return res.status(500).json({ error: 'SOLO_REPLACEMENT_FAILED' });
  }
});

router.post('/dont-say-my-word/judge', auth, judgeLimiter, async (req, res) => {
  const challengeId = String(req.body?.challengeId || '');
  const answer = String(req.body?.answer || '').trim().slice(0, 40);
  if (!/^[a-f0-9]{36}$/.test(challengeId) || !answer) {
    return res.status(400).json({ error: 'INVALID_SOLO_ANSWER' });
  }

  pruneExpiredChallenges();
  const question = activeChallenges.get(challengeId);
  if (!question || question.userId !== String(req.userId)) {
    return res.status(404).json({ error: 'SOLO_CHALLENGE_NOT_FOUND' });
  }

  try {
    const local = evaluateContextualAnswer(question, answer);
    const localDecisionIsSafe = question.judgeMode !== 'open'
      || local.method === 'normalized_exact';
    if (localDecisionIsSafe && local.outcome === 'forbidden') {
      return res.json({
        valid: false,
        outcome: 'forbidden',
        forbiddenWord: question.answer,
        source: local.method,
        confidence: local.confidence,
      });
    }
    if (localDecisionIsSafe && local.outcome === 'valid') {
      return res.json({
        valid: true,
        outcome: 'valid',
        forbiddenWord: question.answer,
        source: local.method,
        confidence: local.confidence,
      });
    }

    const cacheKey = `${question.questionId}:${normalizeArabic(question.answer)}:${normalizeArabic(answer)}`;
    try {
      let judgment = getCachedJudgment(cacheKey);
      let judgmentSource = judgment ? 'memory_cache' : null;
      if (!judgment) {
        judgment = await getPersistentJudgment({
          questionId: question.questionId,
          forbiddenWord: question.answer,
          answer,
        });
        if (judgment) {
          judgmentSource = 'persistent_cache';
          cacheJudgment(cacheKey, judgment);
        }
      }
      if (!judgment) {
        judgment = await aiJudge.judgeDontSayMyWordAnswer({
          question: question.text,
          forbiddenWord: question.answer,
          acceptedAnswers: uniqueAlternatives(question),
          answer,
        });
        judgmentSource = `ai:${judgment.provider}`;
        cacheJudgment(cacheKey, judgment);
        void savePersistentJudgment({
          questionId: question.questionId,
          forbiddenWord: question.answer,
          answer,
        }, judgment);
      }

      if (judgment.matchesForbidden) {
        return res.json({
          valid: false,
          outcome: 'forbidden',
          forbiddenWord: question.answer,
          reason: judgment.reason,
          source: judgmentSource,
          confidence: judgment.confidence,
        });
      }
      if (!judgment.relevant) {
        return res.json({
          valid: false,
          outcome: 'invalid',
          forbiddenWord: question.answer,
          reason: judgment.reason,
          source: judgmentSource,
          confidence: judgment.confidence,
        });
      }
      return res.json({
        valid: true,
        outcome: 'valid',
        forbiddenWord: question.answer,
        source: judgmentSource,
        confidence: judgment.confidence,
      });
    } catch (aiError) {
      const fallback = evaluateKnownAnswer(question, answer);
      if (fallback.outcome === 'forbidden') {
        return res.json({
          valid: false,
          outcome: 'forbidden',
          forbiddenWord: question.answer,
          source: 'database_fallback',
          fallback: true,
        });
      }
      if (fallback.outcome === 'valid') {
        return res.json({
          valid: true,
          outcome: 'valid',
          forbiddenWord: question.answer,
          source: 'database_fallback',
          fallback: true,
        });
      }
      return res.json({
        valid: true,
        outcome: 'valid',
        reason: 'تم قبول الإجابة احتياطيًا لأن خدمات التحكيم الذكي غير متاحة مؤقتًا.',
        source: 'degraded_fail_open',
        fallback: true,
      });
    }
  } catch (error) {
    return res.status(500).json({ error: 'SOLO_JUDGMENT_FAILED', retryable: true });
  }
});

module.exports = router;
