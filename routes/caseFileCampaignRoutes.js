const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const { calculateLevel } = require('../services/gameService');
const { calculateCaseStars } = require('../services/caseFileLogic');
const { CHAPTERS, findCase, publicCase, publicCampaign } = require('../services/caseFileBank');

const router = express.Router();
const caseFile = (user) => user?.soloStats?.caseFile || {};
const elapsedInvestigationSeconds = (active, now = Date.now()) => {
  const accumulated = Math.max(0, Number(active?.elapsedSeconds) || 0);
  const rawStartedAt = active?.startedAt;
  let startedAt = typeof rawStartedAt === 'number' ? rawStartedAt : Date.parse(rawStartedAt);
  if (!Number.isFinite(startedAt)) return Math.floor(accumulated);
  if (startedAt > 0 && startedAt < 1e12) startedAt *= 1000;
  return Math.floor(accumulated + Math.max(0, (now - startedAt) / 1000));
};
const normalizeElapsedSeconds = (seconds, caseData) => {
  const elapsed = Math.max(0, Number(seconds) || 0);
  const maximum = Math.max(30 * 60, (Number(caseData?.recommendedTime) || 600) * 6);
  return elapsed > maximum ? 0 : Math.floor(elapsed);
};
const readProgress = (user) => ({
  solvedCaseIds: [...(caseFile(user).solvedCaseIds || [])],
  caseRecords: caseFile(user).caseRecords || {},
  activeInvestigation: caseFile(user).activeInvestigation || null,
  failedCaseIds: [...(caseFile(user).failedCaseIds || [])],
  claimedChapterRewards: [...(caseFile(user).claimedChapterRewards || [])],
  detectiveXp: Number(caseFile(user).detectiveXp) || 0,
  currentStreak: Number(caseFile(user).currentStreak) || 0,
  bestStreak: Number(caseFile(user).bestStreak) || 0,
  casesSolved: Number(caseFile(user).casesSolved) || 0,
});

function progressFields(progress) {
  return {
    'soloStats.caseFile.solvedCaseIds': progress.solvedCaseIds,
    'soloStats.caseFile.caseRecords': progress.caseRecords,
    'soloStats.caseFile.activeInvestigation': progress.activeInvestigation,
    'soloStats.caseFile.failedCaseIds': progress.failedCaseIds,
    'soloStats.caseFile.claimedChapterRewards': progress.claimedChapterRewards,
    'soloStats.caseFile.detectiveXp': progress.detectiveXp,
    'soloStats.caseFile.currentStreak': progress.currentStreak,
    'soloStats.caseFile.bestStreak': progress.bestStreak,
    'soloStats.caseFile.casesSolved': progress.casesSolved,
  };
}

function setProgress(user, progress) {
  for (const [path, value] of Object.entries(progressFields(progress))) user.set(path, value);
}

function getUnlocked(progress, caseData) {
  const chapter = CHAPTERS.find((item) => item.id === caseData.chapterId);
  if (!chapter) return false;
  if (chapter.order === 1 || chapter.openForTesting === true) return true;
  const previous = CHAPTERS.find((item) => item.order === chapter.order - 1);
  return Boolean(previous && previous.requiredCaseIds.every((id) => progress.solvedCaseIds.includes(id)));
}

router.get('/case-file/campaign', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('coins gems xp level soloStats.caseFile').lean();
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    const activeCase = ['ACTIVE', 'SOLVED', 'FAILED'].includes(progress.activeInvestigation?.status)
      ? findCase(progress.activeInvestigation.caseId)
      : null;
    if (progress.activeInvestigation?.status === 'ACTIVE') {
      const elapsedSeconds = progress.activeInvestigation.timerVersion !== 2
        ? 0 : elapsedInvestigationSeconds(progress.activeInvestigation);
      progress.activeInvestigation = {
        ...progress.activeInvestigation,
        elapsedSeconds: normalizeElapsedSeconds(elapsedSeconds, activeCase),
      };
    } else if (progress.activeInvestigation?.status === 'SOLVED' && progress.activeInvestigation.resultResponse) {
      const solvedTime = normalizeElapsedSeconds(progress.activeInvestigation.resultResponse.elapsedSeconds, activeCase);
      if (solvedTime === 0 && Number(progress.activeInvestigation.resultResponse.elapsedSeconds) > 0) {
        progress.activeInvestigation.resultResponse = { ...progress.activeInvestigation.resultResponse, elapsedSeconds: 1 };
        const record = progress.caseRecords[progress.activeInvestigation.caseId];
        if (record && Number(record.bestTime) > 0) record.bestTime = 1;
      }
      if (activeCase) {
        progress.activeInvestigation.resultResponse = {
          ...progress.activeInvestigation.resultResponse,
          solutionExplanation: activeCase.solutionExplanation,
          supportingEvidenceIds: activeCase.supportingEvidenceIds,
        };
      }
    }
    return res.json({
      ...publicCampaign(progress), progress,
      activeCase: activeCase ? publicCase(activeCase) : null,
      wallet: { coins: user.coins, gems: user.gems }, xp: user.xp, level: user.level,
    });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_CAMPAIGN_FAILED' });
  }
});

router.post('/case-file/start', auth, async (req, res) => {
  try {
    const caseData = findCase(req.body?.caseId);
    if (!caseData) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    if (!getUnlocked(progress, caseData)) return res.status(403).json({ error: 'CHAPTER_LOCKED' });
    if (req.body?.resume === true && progress.activeInvestigation?.caseId === caseData.id && progress.activeInvestigation.status === 'ACTIVE') {
      const active = progress.activeInvestigation;
      const hasCurrentTimer = active.timerVersion === 2 && active.elapsedSeconds != null;
      const elapsedSeconds = normalizeElapsedSeconds(hasCurrentTimer ? elapsedInvestigationSeconds(active) : 0, caseData);
      const timerOutlier = hasCurrentTimer && elapsedInvestigationSeconds(active) > Math.max(30 * 60, (Number(caseData.recommendedTime) || 600) * 6);
      if (!active.startedAt || !hasCurrentTimer || timerOutlier) {
        active.elapsedSeconds = timerOutlier ? 0 : elapsedSeconds;
        active.timerVersion = 2;
        active.startedAt = Date.now();
        setProgress(user, progress);
        await user.save();
      }
      return res.json({ gameCase: publicCase(caseData), investigation: { ...active, elapsedSeconds: timerOutlier ? 0 : elapsedSeconds }, record: progress.caseRecords[caseData.id] || {} });
    }
    const retryRequired = progress.failedCaseIds.includes(caseData.id)
      || (progress.activeInvestigation?.caseId === caseData.id && progress.activeInvestigation.status === 'FAILED');
    if (retryRequired) progress.failedCaseIds = progress.failedCaseIds.filter((id) => id !== caseData.id);
    const now = Date.now();
    const record = progress.caseRecords[caseData.id] || {};
    progress.activeInvestigation = {
      caseId: caseData.id, startedAt: now, elapsedSeconds: 0, timerVersion: 2, examinedEvidenceIds: [], hintsUsed: 0,
      extraHintsUsed: 0, rewardedHintText: '', hintHistory: [], wrongAccusations: 0,
      status: 'ACTIVE', replay: progress.solvedCaseIds.includes(caseData.id),
    };
    if (retryRequired) {
      const started = await User.findOneAndUpdate(
        { _id: req.userId, caseFileRetryTokens: { $gte: 1 } },
        { $inc: { caseFileRetryTokens: -1 }, $set: progressFields(progress) },
        { new: true },
      );
      if (!started) return res.status(402).json({ error: 'شاهد إعلانًا لإعادة محاولة هذه القضية.', code: 'CASE_FILE_RETRY_AD_REQUIRED' });
    } else { setProgress(user, progress); await user.save(); }
    return res.json({ gameCase: publicCase(caseData), investigation: progress.activeInvestigation, elapsedSeconds: 0, record });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_START_FAILED' });
  }
});

router.post('/case-file/pause', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    const active = progress.activeInvestigation;
    if (!active || active.status !== 'ACTIVE') return res.status(409).json({ error: 'NO_ACTIVE_CASE' });
    const pausedElapsed = active.timerVersion === 2
      ? (req.body?.checkpointOnly === true ? Math.max(0, Number(active.elapsedSeconds) || 0) : elapsedInvestigationSeconds(active))
      : 0;
    active.elapsedSeconds = normalizeElapsedSeconds(pausedElapsed, findCase(active.caseId));
    active.timerVersion = 2;
    active.startedAt = null;
    await User.updateOne({ _id: req.userId }, { $set: progressFields(progress) });
    return res.json({ investigation: active, elapsedSeconds: active.elapsedSeconds });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_PAUSE_FAILED' });
  }
});

router.post('/case-file/examine', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const progress = readProgress(user);
    const active = progress.activeInvestigation;
    const caseData = findCase(active?.caseId);
    const evidenceId = String(req.body?.evidenceId || '');
    if (!caseData || active.status !== 'ACTIVE') return res.status(409).json({ error: 'NO_ACTIVE_CASE' });
    const evidence = caseData.evidence.find((item) => item.id === evidenceId);
    if (!evidence) return res.status(404).json({ error: 'EVIDENCE_NOT_FOUND' });
    if (!active.examinedEvidenceIds.includes(evidenceId)) active.examinedEvidenceIds.push(evidenceId);
    setProgress(user, progress);
    await user.save();
    return res.json({ examinedEvidenceIds: active.examinedEvidenceIds, fact: evidence.fullDescription });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_EXAMINE_FAILED' });
  }
});

router.post('/case-file/dismiss-result', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    if (progress.activeInvestigation?.status === 'SOLVED') progress.activeInvestigation = null;
    setProgress(user, progress);
    await user.save();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_RESULT_DISMISS_FAILED' });
  }
});

router.post('/case-file/hint', auth, async (req, res) => {
  return res.status(402).json({ error: 'شاهد إعلانًا للحصول على تلميح.', code: 'REWARDED_AD_REQUIRED' });
});

router.post('/case-file/hint-rewarded', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    const active = progress.activeInvestigation;
    const caseData = findCase(active?.caseId);
    if (!caseData || active.status !== 'ACTIVE') return res.status(409).json({ error: 'NO_ACTIVE_CASE' });
    const hintsUsed = Number(active.hintsUsed) || 0;
    const extraHintsUsed = Number(active.extraHintsUsed) || 0;
    const usesStandardHint = hintsUsed < (caseData.maxHints || 0);
    if (!usesStandardHint && extraHintsUsed >= (caseData.maxRewardedHints || 0)) return res.status(409).json({ error: 'NO_REWARDED_HINTS_LEFT' });
    const hint = usesStandardHint ? caseData.hints?.[hintsUsed] : caseData.rewardedHints?.[extraHintsUsed];
    if (!hint) return res.status(409).json({ error: 'NO_REWARDED_HINTS_LEFT' });
    const hintUpdate = {
      $inc: {
        caseFileHintTokens: -1,
        'soloStats.caseFile.activeInvestigation.hintsUsed': 1,
        ...(usesStandardHint ? {} : { 'soloStats.caseFile.activeInvestigation.extraHintsUsed': 1 }),
      },
      $set: {
        'soloStats.caseFile.activeInvestigation.rewardedHintText': hint,
        'soloStats.caseFile.activeInvestigation.lastHint': hint,
      },
      $push: { 'soloStats.caseFile.activeInvestigation.hintHistory': hint },
    };
    const hintState = await User.findOneAndUpdate(
      {
        _id: req.userId,
        caseFileHintTokens: { $gte: 1 },
        'soloStats.caseFile.activeInvestigation.status': 'ACTIVE',
        'soloStats.caseFile.activeInvestigation.hintsUsed': hintsUsed,
        'soloStats.caseFile.activeInvestigation.extraHintsUsed': extraHintsUsed,
      },
      hintUpdate,
      { new: true },
    );
    if (!hintState) {
      const latest = await User.findById(req.userId).select('caseFileHintTokens').lean();
      if ((Number(latest?.caseFileHintTokens) || 0) < 1) return res.status(402).json({ error: 'REWARDED_AD_REQUIRED' });
      return res.status(409).json({ error: 'HINT_STATE_CHANGED' });
    }
    return res.json({
      hint,
      hintHistory: hintState.soloStats.caseFile.activeInvestigation.hintHistory || [hint],
      hintsUsed: hintsUsed + 1,
      extraHintsUsed: extraHintsUsed + (usesStandardHint ? 0 : 1),
      idempotent: false,
    });
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_REWARDED_HINT_FAILED' });
  }
});

router.post('/case-file/accuse', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const progress = readProgress(user);
    const active = progress.activeInvestigation;
    const caseData = findCase(active?.caseId);
    if (!caseData) return res.status(409).json({ error: 'NO_ACTIVE_CASE' });
    if (active.status === 'SOLVED' && active.resultResponse) return res.json(active.resultResponse);
    if (active.status !== 'ACTIVE') return res.status(409).json({ error: 'NO_ACTIVE_CASE' });
    const suspectId = String(req.body?.suspectId || '');
    if (!caseData.suspects.some((item) => item.id === suspectId)) return res.status(400).json({ error: 'INVALID_SUSPECT' });
    if (suspectId !== caseData.culpritId) {
      active.wrongAccusations += 1;
      active.status = 'FAILED';
      active.elapsedSeconds = normalizeElapsedSeconds(elapsedInvestigationSeconds(active), caseData);
      active.startedAt = null;
      progress.failedCaseIds = [...new Set([...progress.failedCaseIds, caseData.id])];
      if (!active.replay) progress.currentStreak = 0;
      setProgress(user, progress);
      await user.save();
      return res.json({ correct: false, exhausted: true, wrongAccusations: active.wrongAccusations, remainingAccusations: 0 });
    }

    const elapsedSeconds = Math.max(1, normalizeElapsedSeconds(elapsedInvestigationSeconds(active), caseData));
    const firstCompletion = !progress.solvedCaseIds.includes(caseData.id);
    const stars = calculateCaseStars({
      elapsedSeconds, hintsUsed: active.hintsUsed, wrongAccusations: active.wrongAccusations,
      recommendedTime: caseData.recommendedTime, thresholds: caseData.starThresholds,
    });
    const previousRecord = progress.caseRecords[caseData.id] || {};
    const bestStars = Math.max(Number(previousRecord.bestStars) || 0, Number(previousRecord.stars) || 0, stars);
    const bestTime = previousRecord.bestTime ? Math.min(previousRecord.bestTime, elapsedSeconds) : elapsedSeconds;
    progress.caseRecords[caseData.id] = { solved: true, bestStars, bestTime, lastPlayedAt: new Date().toISOString() };
    if (firstCompletion) progress.solvedCaseIds.push(caseData.id);
    progress.casesSolved = progress.solvedCaseIds.length;
    if (firstCompletion) progress.currentStreak += 1;
    progress.bestStreak = Math.max(progress.bestStreak, progress.currentStreak);
    progress.detectiveXp += firstCompletion ? caseData.rewards.xp : 0;
    active.status = 'SOLVED';

    let coinsEarned = firstCompletion ? caseData.rewards.coins : 0;
    let xpEarned = firstCompletion ? caseData.rewards.xp : 0;
    let chapterReward = null;
    const chapter = CHAPTERS.find((item) => item.id === caseData.chapterId);
    if (firstCompletion && chapter && !progress.claimedChapterRewards.includes(chapter.id)
      && chapter.requiredCaseIds.every((id) => progress.solvedCaseIds.includes(id))) {
      progress.claimedChapterRewards.push(chapter.id);
      chapterReward = chapter.reward;
      coinsEarned += chapter.reward.coins || 0;
      xpEarned += chapter.reward.xp || 0;
      progress.detectiveXp += chapter.reward.xp || 0;
    }
    user.coins = (Number(user.coins) || 0) + coinsEarned;
    user.xp = (Number(user.xp) || 0) + xpEarned;
    user.level = calculateLevel(user.xp);
    const response = {
      correct: true, firstCompletion, stars, bestStars, elapsedSeconds, hintsUsed: active.hintsUsed,
      wrongAccusations: active.wrongAccusations, coinsEarned, xpEarned, chapterReward,
      wallet: { coins: user.coins, gems: user.gems }, xp: user.xp, level: user.level,
      detectiveXp: progress.detectiveXp, streak: progress.currentStreak,
      solutionExplanation: caseData.solutionExplanation, supportingEvidenceIds: caseData.supportingEvidenceIds,
    };
    active.resultResponse = response;
    setProgress(user, progress);
    // caseRecords is a Mixed field; mark its nested mutation so best-star
    // improvements are persisted on both first clears and replays.
    user.markModified('soloStats.caseFile.caseRecords');
    await user.save();
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: 'CASE_FILE_ACCUSATION_FAILED' });
  }
});

module.exports = router;
