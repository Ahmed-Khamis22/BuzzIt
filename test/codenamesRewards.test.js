const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function service() {
  const increments = {}, history = [];
  const User = {
    async findByIdAndUpdate(id, update) {
      increments[id] = update.$inc;
      return { _id: id, xp: update.$inc.xp, level: 1,
        totalGames: 1, totalWins: update.$inc.totalWins, totalCorrect: update.$inc.totalCorrect,
        unlockedAchievements: ['first_game', 'five_wins', 'social_star', 'smart_mind', 'veteran'].map(id => ({ id })),
        async save() {} };
    },
  };
  const context = { module: { exports: {} }, require(name) {
    if (name === '../models/User') return User;
    if (name === '../models/GameHistory') return { async create(data) { history.push(data); } };
    if (name === './seasonService') return { async recordSeasonPoints() {} };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/gameService.js'), 'utf8'), context);
  return { ...context.module.exports, increments, history };
}
function room(gameMode = 'codenames') {
  return { config: { gameMode }, hostUserId: 'a', players: { a: { name: 'a', userId: 'a' }, b: { name: 'b', userId: 'b' }, c: { name: 'c', userId: 'c' }, d: { name: 'd', userId: 'd' } },
    scores: { a: 0, b: 2, c: 1, d: 3 }, correct: {}, wrong: {}, codenames: { teams: { a: 'red', b: 'blue', c: 'red', d: 'blue' }, winner: 'red' } };
}
test('Codenames awards both winning teammates including captain, not highest individual score', async () => {
  const s = service(); await s.saveGameResults('TEST', room());
  assert.equal(s.increments.a.totalWins, 1); assert.equal(s.increments.c.totalWins, 1);
  assert.equal(s.increments.b.totalWins, 0); assert.equal(s.increments.d.totalWins, 0);
  assert.equal(s.increments.a.coins, 80); assert.equal(s.increments.b.coins, 30);
  assert.equal(s.history.length, 1);
});
test('abandoned match has no winner; existing single-player scoring remains unchanged', async () => {
  const s = service(); const r = room(); r.codenames.winner = null;
  await s.saveGameResults('TEST', r); assert(Object.values(s.increments).every(v => v.totalWins === 0));
  const previous = service(); await previous.saveGameResults('TEST', room('trivia'));
  assert.equal(previous.increments.d.totalWins, 1); assert.equal(previous.increments.a.totalWins, 0);
});
