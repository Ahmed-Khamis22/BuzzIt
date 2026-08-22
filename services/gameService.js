const GameHistory = require('../models/GameHistory');
const User = require('../models/User');

const AVAILABLE_ACHIEVEMENTS = [
  { id: 'first_blood', name: 'badgeFirstBlood', condition: (u) => u.totalWins >= 1, reward: 50 },
  { id: 'speedster', name: 'badgeSpeedster', condition: (u) => u.totalWins >= 25, reward: 150 },
  { id: 'survivor', name: 'badgeSurvivor', condition: (u) => u.totalGames >= 100, reward: 200 },
  { id: 'master', name: 'badgeMastermind', condition: (u) => u.totalCorrect >= 250, reward: 300 },
];

async function saveGameResults(code, room) {
  // Development-only solo rooms exist for UI/gameplay testing and must never
  // inflate match, win or answer statistics on the real user account.
  if (room.soloTest) return { coinsEarnedMap: {}, newAchievementsMap: {} };
  const playerEntries = Object.entries(room.players);
  if (playerEntries.length === 0) return { coinsEarnedMap: {}, newAchievementsMap: {} };

  const playersData = playerEntries.map(([socketId, p]) => ({
    socketId,
    userId: p.userId || undefined,
    username: p.name,
    team: room.predictTeams?.[socketId] || undefined,
    score: room.scores[socketId] || 0,
    correctAnswers: (room.correct && room.correct[socketId]) || 0,
    wrongAnswers: (room.wrong && room.wrong[socketId]) || 0,
  }));

  let winner = playersData[0];
  let winningTeam = null;
  if (room.config?.gameMode === 'predict') {
    const teamScores = playersData.reduce((scores, player) => {
      if (player.team) scores[player.team] = (scores[player.team] || 0) + player.score;
      return scores;
    }, { A: 0, B: 0 });
    winningTeam = teamScores.A === teamScores.B ? null : (teamScores.A > teamScores.B ? 'A' : 'B');
    winner = winningTeam ? playersData.find((player) => player.team === winningTeam) : null;
  } else {
    for (const p of playersData) {
      if (p.score > winner.score) winner = p;
    }
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
  const newAchievementsMap = {};

  await Promise.all(
    playersData
      .filter((p) => p.userId)
      .map(async (p) => {
        const isWinner = room.config?.gameMode === 'predict'
          ? Boolean(winningTeam && p.team === winningTeam)
          : Boolean(winner && winner.userId && String(winner.userId) === String(p.userId));
        
        const baseCoinsEarned = 0; // Disable room coins

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
            },
          },
          { new: true } // Return updated document
        );

        if (!updatedUser) return;
        
        let totalCoinsToAward = baseCoinsEarned;
        const newlyUnlocked = [];

        // 2. Check achievements
        const currentUnlockedIds = (updatedUser.unlockedAchievements || []).map(a => a.id);
        
        for (const ach of AVAILABLE_ACHIEVEMENTS) {
          if (!currentUnlockedIds.includes(ach.id) && ach.condition(updatedUser)) {
            newlyUnlocked.push({
              id: ach.id,
              name: ach.name,
              reward: ach.reward,
            });
            totalCoinsToAward += ach.reward;
          }
        }

        // 3. If new achievements, push them and add reward coins
        if (newlyUnlocked.length > 0) {
          const pushRecords = newlyUnlocked.map(a => ({ id: a.id }));
          await User.findByIdAndUpdate(p.userId, {
            $push: { unlockedAchievements: { $each: pushRecords } },
            $inc: { coins: totalCoinsToAward - baseCoinsEarned } // add only the achievement rewards here
          });
          newAchievementsMap[p.userId] = newlyUnlocked;
        }

        coinsEarnedMap[p.userId] = totalCoinsToAward;
      })
  );

  // Reward the host (judge) if logged in
  if (room.hostUserId) {
    const hostCoins = 0; // Disable room coins
    coinsEarnedMap[room.hostUserId] = (coinsEarnedMap[room.hostUserId] || 0) + hostCoins;
    try {
      await User.findByIdAndUpdate(room.hostUserId, {
        $inc: {
          coins: hostCoins,
        },
      });
    } catch (err) {
      console.error('Failed to reward host coins:', err.message);
    }
  }

  return { coinsEarnedMap, newAchievementsMap };
}

module.exports = { saveGameResults };
