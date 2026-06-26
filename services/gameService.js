const GameHistory = require('../models/GameHistory');
const User = require('../models/User');

async function saveGameResults(code, room) {
  const playerEntries = Object.entries(room.players);
  if (playerEntries.length === 0) return;

  const playersData = playerEntries.map(([socketId, p]) => ({
    userId: p.userId || undefined,
    username: p.name,
    score: room.scores[socketId] || 0,
    correctAnswers: (room.correct && room.correct[socketId]) || 0,
    wrongAnswers: (room.wrong && room.wrong[socketId]) || 0,
  }));

  let winner = playersData[0];
  for (const p of playersData) {
    if (p.score > winner.score) winner = p;
  }

  await GameHistory.create({
    roomCode: code,
    hostId: room.hostUserId || undefined,
    players: playersData,
    winnerId: winner.userId || undefined,
    totalRounds: room.totalRounds || 0,
    categories: room.categories || [],
  });

  const coinsEarnedMap = {};

  await Promise.all(
    playersData
      .filter((p) => p.userId)
      .map((p) => {
        const isWinner = winner && winner.userId && String(winner.userId) === String(p.userId);
        const coinsEarned = 0; // Disable room coins
        coinsEarnedMap[p.userId] = coinsEarned;
        
        return User.findByIdAndUpdate(p.userId, {
          $inc: {
            totalGames: 1,
            totalWins: isWinner ? 1 : 0,
            totalCorrect: p.correctAnswers,
            totalWrong: p.wrongAnswers,
            coins: coinsEarned,
          },
        });
      })
  );

  // Reward the host (judge) if logged in
  if (room.hostUserId) {
    const hostCoins = 0; // Disable room coins
    coinsEarnedMap[room.hostUserId] = hostCoins;
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

  return coinsEarnedMap;
}

module.exports = { saveGameResults };
