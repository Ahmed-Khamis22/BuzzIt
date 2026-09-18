const GameHistory = require('../models/GameHistory');
const User = require('../models/User');
const { recordSeasonPoints } = require('./seasonService');

const AVAILABLE_ACHIEVEMENTS = [
  { id: 'first_game', name: 'أول خطوة', condition: (u) => u.totalGames >= 1, reward: 200 },
  { id: 'five_wins', name: 'نجم الفوز', condition: (u) => u.totalWins >= 5, reward: 400 },
  { id: 'social_star', name: 'روح الفريق', condition: (u) => (u.friends?.length || 0) >= 10, reward: 500 },
  { id: 'smart_mind', name: 'عقل لامع', condition: (u) => u.totalCorrect >= 50, reward: 500 },
  { id: 'veteran', name: 'المحترف', condition: (u) => u.totalGames >= 50, reward: 1000 },
];

function calculateLevel(xp = 0) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

async function syncProgression(user) {
  if (!user) return { newlyUnlocked: [], achievementCoins: 0 };

  const newLevel = calculateLevel(user.xp);
  if (user.level !== newLevel) {
    user.level = newLevel;
    await user.save();
  }

  const currentUnlockedIds = new Set(
    (user.unlockedAchievements || []).map((achievement) => achievement.id)
  );
  const eligibleAchievements = AVAILABLE_ACHIEVEMENTS.filter(
    (achievement) => !currentUnlockedIds.has(achievement.id) && achievement.condition(user)
  );
  const newlyUnlocked = [];

  // Keep the unlock and its reward in one atomic update. The filter makes the
  // reward idempotent if two result-saving calls happen at nearly the same time.
  for (const achievement of eligibleAchievements) {
    const unlockedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        'unlockedAchievements.id': { $ne: achievement.id },
      },
      {
        $addToSet: { unlockedAchievements: { id: achievement.id } },
        $inc: { coins: achievement.reward },
      },
      { new: true }
    );

    if (unlockedUser) {
      newlyUnlocked.push({
        id: achievement.id,
        name: achievement.name,
        reward: achievement.reward,
      });
    }
  }

  const achievementCoins = newlyUnlocked.reduce(
    (sum, achievement) => sum + achievement.reward,
    0
  );

  return { newlyUnlocked, achievementCoins };
}

async function awardSoloProgress(userId, {
  xp,
  won = false,
  correct = 0,
  wrong = 0,
  countGame = true,
}) {
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        totalGames: countGame ? 1 : 0,
        totalWins: won ? 1 : 0,
        totalCorrect: correct,
        totalWrong: wrong,
        xp,
      },
    },
    { new: true }
  );
  if (!updatedUser) return null;
  await recordSeasonPoints(userId, xp);
  const progression = await syncProgression(updatedUser);
  return {
    xpEarned: xp,
    xp: updatedUser.xp,
    level: calculateLevel(updatedUser.xp),
    ...progression,
  };
}

async function saveGameResults(code, room) {
  // Development-only solo rooms exist for UI/gameplay testing and must never
  // inflate match, win or answer statistics on the real user account.
  if (room.soloTest) return { coinsEarnedMap: {}, xpEarnedMap: {}, newAchievementsMap: {} };
  const playerEntries = Object.entries(room.players);
  if (playerEntries.length === 0) return { coinsEarnedMap: {}, xpEarnedMap: {}, newAchievementsMap: {} };

  const playersData = playerEntries.map(([socketId, p]) => ({
    socketId,
    userId: p.userId || undefined,
    username: p.name,
    team: room.predictTeams?.[socketId] || undefined,
    score: room.scores[socketId] || 0,
    correctAnswers: (room.correct && room.correct[socketId]) || 0,
    wrongAnswers: (room.wrong && room.wrong[socketId]) || 0,
  }));

  let winner = null;
  let winningTeam = null;
  if (room.config?.gameMode === 'predict') {
    const teamScores = playersData.reduce((scores, player) => {
      if (player.team) scores[player.team] = (scores[player.team] || 0) + player.score;
      return scores;
    }, { A: 0, B: 0 });
    winningTeam = teamScores.A === teamScores.B ? null : (teamScores.A > teamScores.B ? 'A' : 'B');
    winner = winningTeam ? playersData.find((player) => player.team === winningTeam) : null;
  } else {
    const highestScore = Math.max(...playersData.map((player) => player.score));
    const leaders = playersData.filter((player) => player.score === highestScore);
    // A tied match has no single winner. Do not award a win or winner XP based
    // on insertion order when a host ends a game or a draw round ends level.
    winner = leaders.length === 1 ? leaders[0] : null;
  }

  const storedPlayers = playersData.map(({ socketId, team, ...player }) => player);

  await GameHistory.create({
    roomCode: code,
    hostId: room.hostUserId || undefined,
    players: storedPlayers,
    winnerId: winner?.userId || undefined,
    totalRounds: room.totalRounds || 0,
    categories: room.categories || [],
  });

  const coinsEarnedMap = {};
  const xpEarnedMap = {};
  const newAchievementsMap = {};

  await Promise.all(
    playersData
      .filter((p) => p.userId)
      .map(async (p) => {
        const isWinner = room.config?.gameMode === 'predict'
          ? Boolean(winningTeam && p.team === winningTeam)
          : Boolean(winner && winner.userId && String(winner.userId) === String(p.userId));
        
        // Keep matches rewarding without making repeat farming replace ads or
        // paid gems. Participation is small, winning is meaningful, and skill
        // adds only a capped bonus.
        const participationCoins = 30;
        const winnerBonus = isWinner ? 50 : 0;
        const correctAnswerBonus = Math.min((p.correctAnswers || 0) * 5, 25);
        const baseCoinsEarned = participationCoins + winnerBonus + correctAnswerBonus;

        const xpEarned = (isWinner ? 50 : 10) + (p.correctAnswers * 5);

        // 1. First, increment stats
        const updatedUser = await User.findByIdAndUpdate(
          p.userId,
          {
            $inc: {
              totalGames: 1,
              totalWins: isWinner ? 1 : 0,
              totalCorrect: p.correctAnswers,
              totalWrong: p.wrongAnswers,
              coins: baseCoinsEarned,
              xp: xpEarned,
            },
          },
          { new: true } // Return updated document
        );

        if (!updatedUser) return;
        await recordSeasonPoints(p.userId, xpEarned);
        
        const { newlyUnlocked, achievementCoins } = await syncProgression(updatedUser);
        const totalCoinsToAward = baseCoinsEarned + achievementCoins;
        if (newlyUnlocked.length > 0) newAchievementsMap[p.userId] = newlyUnlocked;

        coinsEarnedMap[p.userId] = totalCoinsToAward;
        xpEarnedMap[p.userId] = xpEarned;
      })
  );

  // A fixed verbal judge is not part of room.players. They still spent the
  // whole match hosting, so count the match and award participation XP once.
  const hostAlreadyCounted = playersData.some(
    (player) => player.userId && String(player.userId) === String(room.hostUserId)
  );
  if (room.hostUserId && !hostAlreadyCounted) {
    const hostUser = await User.findByIdAndUpdate(
      room.hostUserId,
      { $inc: { totalGames: 1, xp: 10, coins: 30 } },
      { new: true }
    );
    if (hostUser) {
      await recordSeasonPoints(room.hostUserId, 10);
      const { newlyUnlocked, achievementCoins } = await syncProgression(hostUser);
      coinsEarnedMap[room.hostUserId] = 30 + achievementCoins;
      xpEarnedMap[room.hostUserId] = 10;
      if (newlyUnlocked.length > 0) newAchievementsMap[room.hostUserId] = newlyUnlocked;
    }
  }

  return { coinsEarnedMap, xpEarnedMap, newAchievementsMap };
}

module.exports = { saveGameResults, calculateLevel, awardSoloProgress };
