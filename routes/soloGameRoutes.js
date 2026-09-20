const crypto = require('crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');

const Question = require('../models/Question');
const User = require('../models/User');
const { recordSeasonPoints } = require('../services/seasonService');
const auth = require('../middleware/auth');
const { aiJudge } = require('../services/aiJudge');
const { getPersistentJudgment, savePersistentJudgment } = require('../services/soloJudgmentCache');
const { awardSoloProgress, calculateLevel } = require('../services/gameService');
const { consumeAdView } = require('../services/adRewards');
const {
  buildDifficultyCurve,
  evaluateContextualAnswer,
  evaluateKnownAnswer,
  normalizeArabic,
  uniqueAlternatives,
} = require('../services/soloGameLogic');
const {
  SESSION_TTL_MS,
  answerKnownQuestion,
  categoryForSecret,
  createInitialAiMove,
  createSession,
  finishSession,
  nextFallbackMove,
  publicSession,
  resolveInterpretedAnswer,
} = require('../services/tenByTenLogic');

const router = express.Router();
const AI_CACHE_TTL_MS = 60 * 60 * 1000;
const AI_CACHE_MAX = 1000;
const CHALLENGE_TTL_MS = 90 * 60 * 1000;
const judgmentCache = new Map();
const activeChallenges = new Map();
const lastForbiddenByUserAndQuestion = new Map();
const tenByTenSessions = new Map();
const recentTenByTenSecretsByUser = new Map();
const RECENT_SECRET_HISTORY_MAX = 199;
const RECENT_SECRET_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// A player should never lose AI in the middle of a long 10×10 match. Limit
// completed starts per day instead of individual AI requests; the global AI
// budget remains the protection against a whole-server spike.
const TEN_BY_TEN_DAILY_GAME_LIMIT = Math.max(1, Number(process.env.TEN_BY_TEN_DAILY_GAME_LIMIT) || 3);
const TEN_BY_TEN_MAX_ACTIONS = Math.max(80, Number(process.env.TEN_BY_TEN_MAX_ACTIONS) || 120);
const tenByTenDailyGames = new Map();
const tenByTenExtraGames = new Map();
const DONT_SAY_MY_WORD_DAILY_GAME_LIMIT = Math.max(1, Number(process.env.DONT_SAY_MY_WORD_DAILY_GAME_LIMIT) || 3);
const dontSayMyWordDailyGames = new Map();

// The database bank is the primary source. This embedded bank keeps the solo
// game playable while a fresh deployment is still syncing Mongo questions.
const FALLBACK_SOLO_QUESTIONS = [
  { _id: 'solo-fallback-colors', text: 'اذكر اسم لون', answer: 'أحمر', acceptedAnswers: ['أزرق', 'أخضر', 'أصفر', 'أسود', 'أبيض', 'برتقالي', 'بنفسجي', 'وردي', 'بني', 'رمادي'] },
  { _id: 'solo-fallback-fruit', text: 'اذكر اسم فاكهة', answer: 'تفاح', acceptedAnswers: ['موز', 'برتقال', 'عنب', 'مانجو', 'فراولة', 'بطيخ', 'خوخ', 'رمان', 'تين', 'كمثرى', 'جوافة'] },
  { _id: 'solo-fallback-countries', text: 'اذكر دولة عربية', answer: 'مصر', acceptedAnswers: ['السعودية', 'الإمارات', 'المغرب', 'تونس', 'الجزائر', 'سوريا', 'فلسطين', 'العراق', 'لبنان', 'الأردن', 'الكويت', 'قطر'] },
  { _id: 'solo-fallback-jobs', text: 'اذكر مهنة أو وظيفة', answer: 'طبيب', acceptedAnswers: ['مهندس', 'مدرس', 'محامي', 'محاسب', 'طيار', 'نجار', 'سباك', 'شرطي', 'صحفي', 'ممرض'] },
  { _id: 'solo-fallback-transport', text: 'اذكر وسيلة مواصلات', answer: 'سيارة', acceptedAnswers: ['طائرة', 'قطار', 'مترو', 'أتوبيس', 'سفينة', 'دراجة', 'موتوسيكل', 'تاكسي', 'ترام'] },
  { _id: 'solo-fallback-animals', text: 'اذكر حيوانًا مفترسًا', answer: 'أسد', acceptedAnswers: ['نمر', 'فهد', 'ذئب', 'دب', 'تمساح', 'ضبع', 'قرش', 'ثعلب'] },
  { _id: 'solo-fallback-sports', text: 'اذكر رياضة تُلعب بالكرة', answer: 'كرة القدم', acceptedAnswers: ['كرة السلة', 'كرة الطائرة', 'كرة اليد', 'التنس', 'تنس الطاولة'] },
];

const judgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => String(req.userId),
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

function pruneTenByTenSessions() {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  for (const [sessionId, session] of tenByTenSessions.entries()) {
    if (session.expiresAt <= now) tenByTenSessions.delete(sessionId);
  }
  for (const [userId, history] of recentTenByTenSecretsByUser.entries()) {
    if (history.updatedAt + RECENT_SECRET_HISTORY_TTL_MS <= now) recentTenByTenSecretsByUser.delete(userId);
  }
  for (const key of tenByTenDailyGames.keys()) {
    if (!key.endsWith(`:${today}`)) tenByTenDailyGames.delete(key);
  }
  for (const key of tenByTenExtraGames.keys()) {
    if (!key.endsWith(`:${today}`)) tenByTenExtraGames.delete(key);
  }
  for (const key of dontSayMyWordDailyGames.keys()) {
    if (!key.endsWith(`:${today}`)) dontSayMyWordDailyGames.delete(key);
  }
}

function tenByTenDailyKey(userId) {
  return `${String(userId)}:${new Date().toISOString().slice(0, 10)}`;
}

function getTenByTenAllowance(userId) {
  const key = tenByTenDailyKey(userId);
  const playedGamesToday = tenByTenDailyGames.get(key) || 0;
  const extraGameClaimed = Boolean(tenByTenExtraGames.get(key));
  const totalGamesToday = TEN_BY_TEN_DAILY_GAME_LIMIT + (extraGameClaimed ? 1 : 0);
  return {
    dailyGames: TEN_BY_TEN_DAILY_GAME_LIMIT,
    playedGamesToday,
    remainingGames: Math.max(0, totalGamesToday - playedGamesToday),
    extraGameClaimed,
    canWatchAdForExtraGame: playedGamesToday >= TEN_BY_TEN_DAILY_GAME_LIMIT && !extraGameClaimed,
  };
}

function reserveTenByTenGame(userId) {
  const key = tenByTenDailyKey(userId);
  const used = tenByTenDailyGames.get(key) || 0;
  const extraGameClaimed = Boolean(tenByTenExtraGames.get(key));
  if (used >= TEN_BY_TEN_DAILY_GAME_LIMIT + (extraGameClaimed ? 1 : 0)) return false;
  tenByTenDailyGames.set(key, used + 1);
  return true;
}

function dontSayMyWordDailyKey(userId) {
  return `${String(userId)}:${new Date().toISOString().slice(0, 10)}`;
}

function getDontSayMyWordAllowance(userId) {
  const playedGamesToday = dontSayMyWordDailyGames.get(dontSayMyWordDailyKey(userId)) || 0;
  return {
    dailyGames: DONT_SAY_MY_WORD_DAILY_GAME_LIMIT,
    playedGamesToday,
    remainingGames: Math.max(0, DONT_SAY_MY_WORD_DAILY_GAME_LIMIT - playedGamesToday),
  };
}

function reserveDontSayMyWordGame(userId) {
  const key = dontSayMyWordDailyKey(userId);
  const used = dontSayMyWordDailyGames.get(key) || 0;
  if (used >= DONT_SAY_MY_WORD_DAILY_GAME_LIMIT) return false;
  dontSayMyWordDailyGames.set(key, used + 1);
  return true;
}

function getTenByTenSession(req) {
  pruneTenByTenSessions();
  const sessionId = String(req.body?.sessionId || '');
  const session = tenByTenSessions.get(sessionId);
  if (!session || session.userId !== String(req.userId)) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
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

function createChallenge(question, userId, streakIndex = 0) {
  const forbidden = chooseForbidden(question, userId);
  const alternatives = answerPool(question)
    .filter((choice) => choice.normalized !== forbidden.normalized)
    .map((choice) => choice.raw);
  const challengeId = crypto.randomBytes(18).toString('hex');
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
    difficulty: streakIndex < 20 ? 'easy' : streakIndex < 75 ? 'medium' : 'hard',
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

async function recordDontSayProgress(userId, challenge) {
  if (challenge.progressClaimed && challenge.progressSnapshot) {
    return challenge.progressSnapshot;
  }

  challenge.progressClaimed = true;
  try {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    const stats = user.soloStats?.dontSayMyWord || {};
    const currentStreak = (stats.currentStreak || 0) + 1;
    const bestStreak = Math.max(stats.bestStreak || 0, currentStreak);
    const earnedPoints = 10 + Math.min(40, Math.floor(currentStreak / 10) * 2);
    const totalPoints = (stats.points || 0) + earnedPoints;

    user.set('soloStats.dontSayMyWord.currentStreak', currentStreak);
    user.set('soloStats.dontSayMyWord.bestStreak', bestStreak);
    user.set('soloStats.dontSayMyWord.points', totalPoints);
    user.xp = (user.xp || 0) + 2;
    user.level = calculateLevel(user.xp);
    await user.save();
    await recordSeasonPoints(userId, 2);

    challenge.progressSnapshot = {
      currentStreak,
      bestStreak,
      points: totalPoints,
      earnedPoints,
      xpEarned: 2,
      xp: user.xp,
      level: user.level,
    };
    return challenge.progressSnapshot;
  } catch (error) {
    challenge.progressClaimed = false;
    throw error;
  }
}

async function sendDontSayJudgment(res, challenge, payload) {
  challenge.judged = true;
  challenge.valid = Boolean(payload.valid);
  challenge.outcome = payload.outcome;
  if (payload.valid) {
    payload.streakStats = await recordDontSayProgress(challenge.userId, challenge);
  }
  return res.json(payload);
}

async function loadQuestionPool() {
  const questions = await Question.find({ category: 'dont-say-my-word' })
    .select('_id text answer acceptedAnswers judgeMode')
    .lean();
  return questions.length ? questions : FALLBACK_SOLO_QUESTIONS;
}

router.get('/dont-say-my-word', auth, async (req, res) => {
  try {
    pruneExpiredChallenges();
    const requestedStreak = Math.max(0, Number(req.query?.streak) || 0);
    const newRun = String(req.query?.newRun || '') === '1';
    if (newRun && !reserveDontSayMyWordGame(req.userId)) {
      return res.status(429).json({
        error: 'DONT_SAY_MY_WORD_DAILY_LIMIT',
        message: `خلصت ${DONT_SAY_MY_WORD_DAILY_GAME_LIMIT} ألعاب «ما تقولش كلمتي» المتاحة النهارده. ارجع بكرة.`,
      });
    }
    if (newRun) clearUserChallenges(req.userId);
    const pool = await loadQuestionPool();
    if (!pool.length) return res.status(404).json({ error: 'NO_SOLO_QUESTIONS' });
    const orderedPool = buildDifficultyCurve(pool, pool.length);
    const batchSize = Math.min(40, Math.max(10, Number(req.query?.limit) || 25));
    const questions = Array.from({ length: batchSize }, (_, offset) => orderedPool[(requestedStreak + offset) % orderedPool.length]);
    // A new streak is one played solo game. Its result is intentionally not a
    // normal win: the player can keep an open-ended streak instead.
    const gameProgress = newRun
      ? await awardSoloProgress(req.userId, { xp: 0, won: false })
      : null;
    if (newRun) {
      await User.updateOne({ _id: req.userId }, { $set: { 'soloStats.dontSayMyWord.currentStreak': 0 } });
    }
    const user = await User.findById(req.userId).select('soloStats.dontSayMyWord').lean();
    const stored = user?.soloStats?.dontSayMyWord || {};
    res.json({
      questions: questions.map((question, index) => createChallenge(question, req.userId, requestedStreak + index)),
      stats: {
        currentStreak: newRun ? 0 : (stored.currentStreak || 0),
        bestStreak: stored.bestStreak || 0,
        points: stored.points || 0,
      },
      totalQuestionBank: pool.length,
      ...(gameProgress ? { gameProgress } : {}),
    });
  } catch (error) {
    res.status(500).json({ error: 'SOLO_GAME_LOAD_FAILED' });
  }
});

router.get('/dont-say-my-word/leaderboard', auth, async (req, res) => {
  try {
    const players = await User.find({ 'soloStats.dontSayMyWord.bestStreak': { $gt: 0 } })
      .select('username soloStats.dontSayMyWord.bestStreak equippedItems.avatar equippedItems.border')
      .sort({ 'soloStats.dontSayMyWord.bestStreak': -1, _id: 1 })
      .limit(50)
      .populate({ path: 'equippedItems.avatar', select: 'name imageUrl price type' })
      .populate({ path: 'equippedItems.border', select: 'name imageUrl price type' })
      .lean();

    return res.json(players.map((player, index) => ({
      rank: index + 1,
      userId: player._id,
      username: player.username,
      bestStreak: player.soloStats?.dontSayMyWord?.bestStreak || 0,
      equippedItems: player.equippedItems || {},
    })));
  } catch (error) {
    return res.status(500).json({ error: 'STREAK_LEADERBOARD_FAILED' });
  }
});

router.post('/dont-say-my-word/progress', auth, async (req, res) => {
  pruneExpiredChallenges();
  const challengeId = String(req.body?.challengeId || '');
  const challenge = activeChallenges.get(challengeId);
  if (!challenge || challenge.userId !== String(req.userId) || !challenge.judged || !challenge.valid) {
    return res.status(400).json({ error: 'INVALID_STREAK_PROGRESS' });
  }
  if (challenge.progressClaimed) return res.status(409).json({ error: 'STREAK_PROGRESS_ALREADY_CLAIMED' });
  try {
    return res.json(await recordDontSayProgress(req.userId, challenge));
  } catch (error) {
    return res.status(500).json({ error: 'STREAK_PROGRESS_FAILED' });
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
    const round = Math.max(1, Number(req.body?.round) || 1);
    const pool = (await loadQuestionPool()).filter((question) => !excludedQuestionIds.has(String(question._id)));
    const fallbackPool = pool.length ? pool : await loadQuestionPool();
    const curve = buildDifficultyCurve(fallbackPool, fallbackPool.length);
    const question = curve[(round - 1) % curve.length];
    if (!question) return res.status(404).json({ error: 'NO_REPLACEMENT_QUESTION' });
    return res.json(createChallenge(question, req.userId, round - 1));
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
      return sendDontSayJudgment(res, question, {
        valid: false,
        outcome: 'forbidden',
        forbiddenWord: question.answer,
        source: local.method,
        confidence: local.confidence,
      });
    }
    if (localDecisionIsSafe && local.outcome === 'valid') {
      return sendDontSayJudgment(res, question, {
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
          userId: req.userId,
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
        return sendDontSayJudgment(res, question, {
          valid: false,
          outcome: 'forbidden',
          forbiddenWord: question.answer,
          reason: judgment.reason,
          source: judgmentSource,
          confidence: judgment.confidence,
        });
      }
      if (!judgment.relevant) {
        return sendDontSayJudgment(res, question, {
          valid: false,
          outcome: 'invalid',
          forbiddenWord: question.answer,
          reason: judgment.reason,
          source: judgmentSource,
          confidence: judgment.confidence,
        });
      }
      return sendDontSayJudgment(res, question, {
        valid: true,
        outcome: 'valid',
        forbiddenWord: question.answer,
        source: judgmentSource,
        confidence: judgment.confidence,
      });
    } catch (aiError) {
      const fallback = evaluateKnownAnswer(question, answer);
      if (fallback.outcome === 'forbidden') {
        return sendDontSayJudgment(res, question, {
          valid: false,
          outcome: 'forbidden',
          forbiddenWord: question.answer,
          source: 'database_fallback',
          fallback: true,
        });
      }
      if (fallback.outcome === 'valid') {
        return sendDontSayJudgment(res, question, {
          valid: true,
          outcome: 'valid',
          forbiddenWord: question.answer,
          source: 'database_fallback',
          fallback: true,
        });
      }
      return sendDontSayJudgment(res, question, {
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

router.post('/dont-say-my-word/complete', auth, async (req, res) => {
  pruneExpiredChallenges();
  const challengeIds = [...new Set(
    (Array.isArray(req.body?.challengeIds) ? req.body.challengeIds : []).map(String)
  )];
  if (challengeIds.length !== 10) {
    return res.status(400).json({ error: 'SOLO_GAME_NOT_COMPLETE' });
  }

  const challenges = challengeIds.map((id) => activeChallenges.get(id));
  const validRun = challenges.every(
    (challenge) => challenge
      && challenge.userId === String(req.userId)
      && challenge.judged
      && challenge.valid
      && !challenge.xpClaimed
  );
  if (!validRun) return res.status(400).json({ error: 'SOLO_GAME_NOT_COMPLETE' });

  // Claim in memory before awaiting the database update, so repeated taps or
  // retried requests cannot award the same run twice.
  challenges.forEach((challenge) => { challenge.xpClaimed = true; });
  try {
    const progress = await awardSoloProgress(req.userId, {
      xp: 50,
      won: false,
      correct: 10,
      countGame: false,
    });
    if (!progress) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    return res.json(progress);
  } catch (error) {
    challenges.forEach((challenge) => { challenge.xpClaimed = false; });
    return res.status(500).json({ error: 'SOLO_PROGRESS_FAILED' });
  }
});

router.get('/ten-by-ten/allowance', auth, (req, res) => {
  pruneTenByTenSessions();
  return res.json(getTenByTenAllowance(req.userId));
});

router.get('/dont-say-my-word/allowance', auth, (req, res) => {
  pruneTenByTenSessions();
  return res.json(getDontSayMyWordAllowance(req.userId));
});

router.post('/ten-by-ten/extra-game', auth, async (req, res) => {
  pruneTenByTenSessions();
  const allowance = getTenByTenAllowance(req.userId);
  if (allowance.extraGameClaimed) {
    return res.status(409).json({ error: 'TEN_BY_TEN_EXTRA_ALREADY_CLAIMED', message: 'استخدمت إعلانك الإضافي لليوم بالفعل.' });
  }
  if (allowance.playedGamesToday < TEN_BY_TEN_DAILY_GAME_LIMIT) {
    return res.status(400).json({ error: 'TEN_BY_TEN_FREE_GAMES_REMAIN', message: 'ما زالت لديك ألعاب مجانية متاحة اليوم.' });
  }

  const view = await consumeAdView(req.userId, 'ten-by-ten-extra-game');
  if (!view.ok) return res.status(402).json({ error: 'AD_NOT_VERIFIED', message: view.error });

  tenByTenExtraGames.set(tenByTenDailyKey(req.userId), true);
  return res.json({ ...getTenByTenAllowance(req.userId), verified: view.verified });
});

router.post('/ten-by-ten/start', auth, judgeLimiter, async (req, res) => {
  pruneTenByTenSessions();
  if (!reserveTenByTenGame(req.userId)) {
    return res.status(429).json({
      error: 'TEN_BY_TEN_DAILY_LIMIT',
      message: `خلصت ${TEN_BY_TEN_DAILY_GAME_LIMIT} تحديات 10×10 المتاحة النهارده. ارجع بكرة.`,
    });
  }
  for (const [sessionId, session] of tenByTenSessions.entries()) {
    if (session.userId === String(req.userId)) tenByTenSessions.delete(sessionId);
  }
  const userKey = String(req.userId);
  const recentHistory = recentTenByTenSecretsByUser.get(userKey)?.secrets || [];
  const session = createSession({
    userId: req.userId,
    category: String(req.body?.category || 'mixed'),
    difficulty: String(req.body?.difficulty || 'medium'),
    excludedSecrets: recentHistory,
    maxActions: TEN_BY_TEN_MAX_ACTIONS,
  });
  recentTenByTenSecretsByUser.set(userKey, {
    secrets: [...recentHistory.filter((word) => word !== session.aiSecret), session.aiSecret].slice(-RECENT_SECRET_HISTORY_MAX),
    updatedAt: Date.now(),
  });
  tenByTenSessions.set(session.id, session);
  try {
    const gameProgress = await awardSoloProgress(req.userId, { xp: 0, won: false });
    return res.json(publicSession(session, { gameProgress }));
  } catch (error) {
    tenByTenSessions.delete(session.id);
    return res.status(500).json({ error: 'SOLO_GAME_START_FAILED' });
  }
});

router.post('/ten-by-ten/abandon', auth, (req, res) => {
  const session = getTenByTenSession(req);
  if (!session) return res.status(204).end();
  session.status = 'finished';
  session.phase = 'result';
  session.winner = 'ai';
  tenByTenSessions.delete(session.id);
  return res.status(204).end();
});

router.post('/ten-by-ten/surrender', auth, (req, res) => {
  const session = getTenByTenSession(req);
  if (!session) return res.status(404).json({ error: 'TEN_BY_TEN_SESSION_NOT_FOUND' });
  if (session.status !== 'playing') return res.json(publicSession(session));
  if ((session.playerActions + session.aiActions) >= session.maxActions) {
    finishSession(session);
    return res.json(publicSession(session, { actionLimitReached: true }));
  }

  session.status = 'finished';
  session.phase = 'result';
  session.winner = 'ai';
  session.surrendered = true;

  return res.json(publicSession(session, { surrendered: true }));
});

router.post('/ten-by-ten/turn', auth, judgeLimiter, async (req, res) => {
  const session = getTenByTenSession(req);
  if (!session) return res.status(404).json({ error: 'TEN_BY_TEN_SESSION_NOT_FOUND' });
  if (session.status !== 'playing') return res.json(publicSession(session));
  if (session.turnInFlight) return res.status(409).json({ error: 'TEN_BY_TEN_TURN_IN_PROGRESS', retryable: true });
  session.turnInFlight = true;
  const releaseTurn = () => { session.turnInFlight = false; };
  setTimeout(releaseTurn, 70000);

  let playerAnswer = null;
  let playerAnswerText = null;
  let degraded = false;
  let provider = null;
  let isCorrectGuess = false;
  let soloProgress = null;

  if (session.phase === 'player') {
    const rawAction = req.body?.playerAction;
    if (!rawAction) { releaseTurn(); return res.status(400).json({ error: 'TEN_BY_TEN_PLAYER_ACTION_REQUIRED' }); }
    const type = 'question';
    const text = String(rawAction.text || '').trim().slice(0, 160);
    if (!text) { releaseTurn(); return res.status(400).json({ error: 'TEN_BY_TEN_PLAYER_ACTION_REQUIRED' }); }
    session.playerActions += 1;
    
    try {
      const localAnswer = answerKnownQuestion({ secretWord: session.aiSecret, question: text });
      const aiAnswer = localAnswer ? null : await aiJudge.answerTenByTenQuestion({
          secretWord: session.aiSecret,
          secretCategory: categoryForSecret(session.aiSecret) || session.category,
          question: text,
          history: session.playerHistory,
        });
      const answer = localAnswer || {
        ...resolveInterpretedAnswer({ secretWord: session.aiSecret, judgment: aiAnswer }),
        provider: aiAnswer.provider,
      };
      playerAnswer = answer.answer;
      if (aiAnswer?.reply) {
        const normalizedReply = normalizeArabic(aiAnswer.reply);
        const normalizedSecret = normalizeArabic(session.aiSecret);
        if (!normalizedReply.includes(normalizedSecret)) playerAnswerText = aiAnswer.reply;
      }
      provider = answer.provider || answer.source;
      if (answer.correctGuess) {
        session.playerSolvedAt = session.playerActions;
        isCorrectGuess = true;
      }
    } catch (error) {
      degraded = true;
      playerAnswer = 'unknown';
    }
    session.playerHistory.push({ type, text, answer: playerAnswer });

    if (session.playerSolvedAt) {
      session.phase = 'ai';
      try {
        const generated = await aiJudge.generateTenByTenMove({
          category: session.category,
          difficulty: session.difficulty,
          aiHistory: session.aiHistory,
          attempt: session.aiActions + 1,
          strategy: session.aiQuestionStrategy,
        });
        session.pendingAiMove = generated.move;
        provider = generated.provider;
      } catch (error) {
        degraded = true;
        session.pendingAiMove = nextFallbackMove(session);
      }
      session.aiActions += 1;
    }
  } else if (session.phase === 'ai') {
    const pending = session.pendingAiMove;
    const aiResponse = String(req.body?.aiResponse || '');
    const allowed = ['yes', 'no', 'unknown'];
    if (!pending || !allowed.includes(aiResponse)) {
      releaseTurn();
      return res.status(400).json({ error: 'TEN_BY_TEN_AI_RESPONSE_REQUIRED', expected: pending?.type || 'question' });
    }
    session.aiHistory.push({ ...pending, answer: aiResponse });
    session.pendingAiMove = null;
    if (pending.isGuess && aiResponse === 'yes') session.aiSolvedAt = session.aiActions;

    if (session.aiSolvedAt) {
      finishSession(session);
    } else {
      try {
        const generated = await aiJudge.generateTenByTenMove({
          category: session.category,
          difficulty: session.difficulty,
          aiHistory: session.aiHistory,
          attempt: session.aiActions + 1,
          strategy: session.aiQuestionStrategy,
        });
        session.pendingAiMove = generated.move;
        provider = generated.provider;
      } catch (error) {
        degraded = true;
        session.pendingAiMove = nextFallbackMove(session);
      }
      session.aiActions += 1;
    }
  }

  if (session.status === 'finished' && !session.xpAwarded) {
    session.xpAwarded = true;
    const won = session.winner === 'player';
    const tied = session.winner === 'tie';
    const efficiencyBonus = won ? Math.max(0, 10 - (session.playerSolvedAt || 10)) * 2 : 0;
    try {
      soloProgress = await awardSoloProgress(req.userId, {
        xp: won ? 45 + efficiencyBonus : (tied ? 20 : 15),
        won,
        correct: won ? 1 : 0,
        wrong: won ? 0 : 1,
        countGame: false,
      });
    } catch (error) {
      session.xpAwarded = false;
      console.error('Failed to save ten-by-ten XP:', error.message);
    }
  }

  releaseTurn();
  return res.json(publicSession(session, {
    playerAnswer,
    playerAnswerText,
    playerCorrectGuess: isCorrectGuess,
    degraded,
    provider,
    ...(soloProgress ? {
      xpEarned: soloProgress.xpEarned,
      xp: soloProgress.xp,
      level: soloProgress.level,
    } : {}),
  }));
});

module.exports = router;
