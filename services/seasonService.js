const Season = require('../models/Season');
const SeasonScore = require('../models/SeasonScore');
const SeasonAward = require('../models/SeasonAward');
const User = require('../models/User');

const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const SEASON_PRIZES = {
  1: { coins: 6000, gems: 20, badgeId: 'season_gold' },
  2: { coins: 3000, gems: 10, badgeId: 'season_silver' },
  3: { coins: 1500, gems: 5, badgeId: 'season_bronze' },
};

function serializeSeason(season, now = new Date()) {
  const remainingMs = Math.max(0, new Date(season.endsAt).getTime() - now.getTime());
  return {
    id: String(season._id),
    number: season.number,
    startsAt: season.startsAt,
    endsAt: season.endsAt,
    remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
  };
}

async function getFinalStandings(season) {
  if (season.number === 1) {
    const users = await User.find({ isBanned: { $ne: true }, 'preferences.showLeaderboard': { $ne: false } })
      .sort({ xp: -1, totalWins: -1, _id: 1 })
      .limit(3)
      .select('_id username xp')
      .lean();
    return users.map((user) => ({ userId: user._id, username: user.username, points: user.xp || 0 }));
  }

  return SeasonScore.aggregate([
    { $match: { seasonId: season._id } },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.isBanned': { $ne: true }, 'user.preferences.showLeaderboard': { $ne: false } } },
    { $sort: { points: -1, userId: 1 } },
    { $limit: 3 },
    { $project: { userId: 1, username: '$user.username', points: 1 } },
  ]);
}

async function ensureSeasonAwards(season) {
  if (!season?.finalizedAt || season.awardsGeneratedAt) return;

  await Promise.all((season.winners || []).map((winner) => SeasonAward.updateOne(
    { seasonId: season._id, userId: winner.userId },
    { $setOnInsert: {
      seasonId: season._id,
      seasonNumber: season.number,
      userId: winner.userId,
      username: winner.username,
      rank: winner.rank,
      points: winner.points,
      coins: winner.coins,
      gems: winner.gems,
      badgeId: winner.badgeId,
    } },
    { upsert: true }
  )));

  await Season.updateOne(
    { _id: season._id, finalizedAt: { $ne: null }, awardsGeneratedAt: null },
    { $set: { awardsGeneratedAt: new Date() } }
  );
}

async function finalizeExpiredSeasons(now) {
  while (true) {
    const expired = await Season.findOne({ status: 'active', endsAt: { $lte: now } }).sort({ number: 1 });
    if (!expired) return;

    let finalized = expired;
    if (!expired.finalizedAt) {
      const standings = await getFinalStandings(expired);
      const winners = standings.map((player, index) => ({
        userId: player.userId,
        username: player.username,
        rank: index + 1,
        points: player.points || 0,
        ...SEASON_PRIZES[index + 1],
      }));
      finalized = await Season.findOneAndUpdate(
        { _id: expired._id, status: 'active', endsAt: { $lte: now }, finalizedAt: null },
        { $set: { status: 'finished', finalizedAt: now, winners } },
        { new: true }
      );
      if (!finalized) {
        finalized = await Season.findById(expired._id);
        if (finalized?.status === 'active' && finalized.finalizedAt) {
          finalized = await Season.findByIdAndUpdate(expired._id, { $set: { status: 'finished' } }, { new: true });
        }
      }
    } else {
      finalized = await Season.findByIdAndUpdate(expired._id, { $set: { status: 'finished' } }, { new: true });
    }
    await ensureSeasonAwards(finalized);
  }
}

async function recoverSeasonAwards() {
  const seasons = await Season.find({ status: 'finished', finalizedAt: { $ne: null }, awardsGeneratedAt: null });
  for (const season of seasons) await ensureSeasonAwards(season);
}

// Rollover is checked at leaderboard reads, reward claims, and XP awards. The
// database records the final podium before the next season can accept points.
async function getActiveSeason(now = new Date()) {
  await finalizeExpiredSeasons(now);
  await recoverSeasonAwards();

  let active = await Season.findOne({ status: 'active', endsAt: { $gt: now } }).sort({ number: -1 });
  if (active) return active;

  const latest = await Season.findOne().sort({ number: -1 });
  const startsAt = latest?.endsAt && latest.endsAt > now ? latest.endsAt : now;
  const next = { number: (latest?.number || 0) + 1, startsAt, endsAt: new Date(startsAt.getTime() + SEASON_DURATION_MS) };

  try {
    active = await Season.create(next);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    active = await Season.findOne({ status: 'active', endsAt: { $gt: now } }).sort({ number: -1 });
    if (!active) throw error;
  }
  return active;
}

async function recordSeasonPoints(userId, points) {
  const amount = Math.max(0, Number(points) || 0);
  if (!userId || amount === 0) return null;
  const season = await getActiveSeason();
  await SeasonScore.findOneAndUpdate(
    { seasonId: season._id, userId },
    { $inc: { points: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return season;
}

module.exports = { getActiveSeason, recordSeasonPoints, serializeSeason, SEASON_DURATION_MS, SEASON_PRIZES };
