const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePredictText,
  getPredictTotalRounds,
  getEscapingTeam,
  haveAllActivePredictPlayersAnswered,
  migratePredictPlayerId,
  validatePredictTeamSetup,
  canAssignPredictTeam,
  evaluatePredictRound,
} = require('../services/predictGame');

const players = {
  a1: { name: 'أحمد' },
  a2: { name: 'منى' },
  b1: { name: 'يوسف' },
  b2: { name: 'سلمى' },
};
const teams = { a1: 'A', a2: 'A', b1: 'B', b2: 'B' };

test('uses the even round count selected by the host', () => {
  assert.equal(getPredictTotalRounds({ winScore: 4 }), 4);
  assert.equal(getPredictTotalRounds({ winScore: 8 }), 8);
  assert.equal(getPredictTotalRounds({ winScore: 5 }), 6);
});

test('alternates the escaping team every round', () => {
  assert.equal(getEscapingTeam(1), 'A');
  assert.equal(getEscapingTeam(2), 'B');
  assert.equal(getEscapingTeam(5), 'A');
  assert.equal(getEscapingTeam(6), 'B');
});

test('accepts only a complete balanced 2/4/6-player setup', () => {
  assert.equal(
    validatePredictTeamSetup(
      { a1: players.a1, b1: players.b1 },
      { a1: 'A', b1: 'B' },
      { maxPlayers: 2 },
    ),
    null,
  );
  assert.equal(validatePredictTeamSetup(players, teams, { maxPlayers: 4 }), null);
  assert.equal(
    validatePredictTeamSetup(
      { ...players, a3: { name: 'عمر' }, b3: { name: 'نور' } },
      { ...teams, a3: 'A', b3: 'B' },
      { maxPlayers: 6 },
    ),
    null,
  );
  assert.match(validatePredictTeamSetup(players, { ...teams, b2: 'A' }, { maxPlayers: 4 }), /كل فريق/);
  assert.match(validatePredictTeamSetup(players, teams, { maxPlayers: 6 }), /عدد اللاعبين 6/);
});

test('prevents invalid or over-capacity team assignment', () => {
  assert.equal(canAssignPredictTeam(players, teams, 'b1', 'A', { maxPlayers: 4 }), false);
  assert.equal(canAssignPredictTeam(players, teams, 'b1', 'B', { maxPlayers: 4 }), true);
  assert.equal(canAssignPredictTeam(players, teams, 'b1', 'X', { maxPlayers: 4 }), false);
  assert.equal(
    canAssignPredictTeam(
      { ...players, a2: { ...players.a2, disconnected: true } },
      teams,
      'b1',
      'A',
      { maxPlayers: 4 },
    ),
    false,
  );
});

test('only active players can block the answer phase', () => {
  const withDisconnectedPlayer = {
    a1: players.a1,
    a2: { ...players.a2, disconnected: true },
    b1: players.b1,
  };

  assert.equal(haveAllActivePredictPlayersAnswered(withDisconnectedPlayer, { a1: 'قمر', b1: 'بحر' }), true);
  assert.equal(haveAllActivePredictPlayersAnswered(withDisconnectedPlayer, { a1: 'قمر' }), false);
  assert.equal(haveAllActivePredictPlayersAnswered({}, { a1: 'إجابة قديمة' }), false);
});

test('migrates a reconnected player through live and revealed predict state', () => {
  const room = {
    predictTeams: { old: 'A' },
    predictAnswers: { old: 'قمر' },
    predictTraps: { old: 'قديم' },
    predictVotes: { old: false },
    predictRejectedPlayerIds: ['old'],
    predictResults: { allAnswers: [{ playerId: 'old', answer: 'قمر' }] },
  };

  migratePredictPlayerId(room, 'old', 'new');
  assert.equal(room.predictTeams.new, 'A');
  assert.equal(room.predictAnswers.new, 'قمر');
  assert.equal(room.predictVotes.new, false);
  assert.equal(room.predictResults.allAnswers[0].playerId, 'new');
  assert.deepEqual(room.predictRejectedPlayerIds, ['new']);
  assert.equal(room.predictTeams.old, undefined);
});

test('normalizes common Arabic spelling variants before matching', () => {
  assert.equal(normalizePredictText('  إسكندرية '), normalizePredictText('اسكندريه'));
  assert.equal(normalizePredictText('قَــمَـر!'), normalizePredictText('قمر'));
  assert.equal(normalizePredictText('محمد\u200B   علي'), normalizePredictText('محمد علي'));
});

test('a unique escaping answer survives and scores one point', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'قمر', b1: 'شمس' }, predictTeams: teams, players, escapingTeam: 'A',
  });
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'a1').survived, true);
  assert.equal(result.scoreDeltas.a1, 1);
});

test('duplicate answers eliminate escaping teammates', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'قمر', a2: 'قمر', b1: 'شمس', b2: 'بحر' }, predictTeams: teams, players, escapingTeam: 'A',
  });
  assert.equal(result.clashes[0].type, 'duplicate');
  assert.equal(result.wrongDeltas.a1, 1);
  assert.equal(result.wrongDeltas.a2, 1);
});

test('duplicate hunter guesses do not make hunters fall', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'قمر', a2: 'بحر', b1: 'شمس', b2: 'شمس' }, predictTeams: teams, players, escapingTeam: 'A',
  });
  assert.equal(result.clashes.length, 0);
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'b1').eliminated, false);
  assert.equal(result.wrongDeltas.b1, 1);
  assert.equal(result.wrongDeltas.b2, 1);
});

test('a cross-team match catches only the escaper and credits the hunter state', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'قمر', b1: 'قمر' }, predictTeams: teams, players, escapingTeam: 'A',
  });
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'a1').eliminated, true);
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'b1').caught, true);
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'b1').eliminated, false);
  assert.equal(result.correctDeltas.b1, 1);
  assert.equal(result.scoreDeltas.b1, undefined);
});

test('an AI semantic match catches answers with the same meaning', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'القاهرة', b1: 'عاصمة مصر' },
    predictTeams: teams,
    players,
    escapingTeam: 'A',
    semanticMatchPairs: [{ playerIds: ['a1', 'b1'], confidence: 0.94, reason: 'نفس المقصود' }],
  });
  assert.equal(result.clashes[0].semantic, true);
  assert.equal(result.clashes[0].aiReason, 'نفس المقصود');
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'a1').eliminated, true);
  assert.equal(result.allAnswers.find((entry) => entry.playerId === 'b1').caught, true);
});

test('a rejected hunter answer is an unsuccessful attempt', () => {
  const result = evaluatePredictRound({
    rawAnswers: { b1: 'قمر' }, predictTeams: teams, players, escapingTeam: 'A', rejectedPlayerIds: ['b1'],
  });
  assert.equal(result.allAnswers[0].invalid, true);
  assert.equal(result.wrongDeltas.b1, 1);
});

test('a rejected escaping answer cannot score', () => {
  const result = evaluatePredictRound({
    rawAnswers: { a1: 'قمر' }, predictTeams: teams, players, escapingTeam: 'A', rejectedPlayerIds: ['a1'],
  });
  assert.equal(result.allAnswers[0].invalid, true);
  assert.equal(result.scoreDeltas.a1, undefined);
  assert.equal(result.wrongDeltas.a1, 1);
});
