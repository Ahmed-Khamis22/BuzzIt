// Daily tasks (watch an ad / play games / win / answer correctly).
// Progress is derived from lifetime counters already on the User doc, so
// incrementing them elsewhere (claim-ad-reward, saveGameResults) never needs
// to know about "today" — only the baseline snapshot taken here does.

const TASKS = [
  { id: 'watch_ad', title: 'شاهد إعلان', statKey: 'ads', target: 1, reward: 5 },
  { id: 'play_games', title: 'العب 3 ألعاب', statKey: 'games', target: 3, reward: 5 },
  { id: 'win_game', title: 'اربح لعبة', statKey: 'wins', target: 1, reward: 5 },
  { id: 'answer_correct', title: 'جاوب صح 10 مرات', statKey: 'correct', target: 10, reward: 5 },
];

// Lifetime fields on User that back each stat key.
const STAT_FIELD = {
  ads: 'totalAdsWatched',
  games: 'totalGames',
  wins: 'totalWins',
  correct: 'totalCorrect',
};

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Mutates `user` in place if the stored baseline is from a previous day.
// Returns true when a reset happened, so the caller knows to save().
function resetDailyTasksIfStale(user) {
  const today = startOfDay(new Date());
  if (user.dailyTasksDate && startOfDay(user.dailyTasksDate).getTime() === today.getTime()) {
    return false;
  }
  user.dailyTasksDate = today;
  user.dailyTasksClaimed = [];
  user.dailyTasksBaseline = {
    ads: user.totalAdsWatched || 0,
    games: user.totalGames || 0,
    wins: user.totalWins || 0,
    correct: user.totalCorrect || 0,
  };
  return true;
}

function getDailyTasksState(user) {
  const baseline = user.dailyTasksBaseline || {};
  const claimed = user.dailyTasksClaimed || [];
  return TASKS.map((task) => {
    const lifetime = user[STAT_FIELD[task.statKey]] || 0;
    const base = baseline[task.statKey] || 0;
    const progress = Math.min(Math.max(lifetime - base, 0), task.target);
    return {
      id: task.id,
      title: task.title,
      target: task.target,
      reward: task.reward,
      progress,
      completed: progress >= task.target,
      claimed: claimed.includes(task.id),
    };
  });
}

module.exports = { TASKS, resetDailyTasksIfStale, getDailyTasksState };
