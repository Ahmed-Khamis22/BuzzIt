const Season = require('../models/Season');
const SeasonScore = require('../models/SeasonScore');

const SEASON_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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

// Rollover is deliberately checked at every leaderboard read and XP award.
// This works across Render restarts and multiple instances without relying on
// an in-memory timer, while the unique season number makes the create race safe.
async function getActiveSeason(now = new Date()) {
  let active = await Season.findOne({ status: 'active', endsAt: { $gt: now } }).sort({ number: -1 });
  if (active) return active;

  await Season.updateMany({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'finished' } });
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

module.exports = { getActiveSeason, recordSeasonPoints, serializeSeason, SEASON_DURATION_MS };
