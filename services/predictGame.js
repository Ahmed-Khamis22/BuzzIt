function normalizePredictText(text) {
  if (!text) return '';
  return text.normalize('NFKC').trim().toLowerCase()
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED\u200B-\u200D\uFEFF]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPredictTotalRounds(config = {}) {
  const selected = Number(config.winScore);
  return Number.isInteger(selected) && selected >= 2 && selected <= 20 && selected % 2 === 0
    ? selected
    : 6;
}

function getEscapingTeam(round = 1) {
  return Number(round) % 2 === 0 ? 'B' : 'A';
}

function getPredictMaxPlayers(config = {}) {
  const selected = Number(config.maxPlayers);
  return [2, 4, 6].includes(selected) ? selected : 4;
}

function activePredictPlayerIds(players = {}) {
  return Object.entries(players)
    .filter(([, player]) => !player.disconnected)
    .map(([id]) => id);
}

function haveAllActivePredictPlayersAnswered(players = {}, answers = {}) {
  const activeIds = activePredictPlayerIds(players);
  return activeIds.length > 0 && activeIds.every((id) => (
    Object.prototype.hasOwnProperty.call(answers, id)
  ));
}

function migratePredictPlayerId(room, previousId, nextId) {
  if (!room || !previousId || !nextId || previousId === nextId) return;
  for (const key of ['predictTeams', 'predictAnswers', 'predictTraps', 'predictVotes']) {
    const state = room[key];
    if (state && Object.prototype.hasOwnProperty.call(state, previousId)) {
      state[nextId] = state[previousId];
      delete state[previousId];
    }
  }
  for (const answer of room.predictResults?.allAnswers || []) {
    if (answer.playerId === previousId) answer.playerId = nextId;
  }
  if (Array.isArray(room.predictRejectedPlayerIds)) {
    room.predictRejectedPlayerIds = room.predictRejectedPlayerIds.map((id) => (
      id === previousId ? nextId : id
    ));
  }
}

function validatePredictTeamSetup(players, predictTeams, config) {
  const ids = activePredictPlayerIds(players);
  const maxPlayers = getPredictMaxPlayers(config);
  if (ids.length !== maxPlayers) {
    return `لازم يكون عدد اللاعبين ${maxPlayers} قبل بدء اللعبة.`;
  }

  const teamA = ids.filter((id) => predictTeams?.[id] === 'A').length;
  const teamB = ids.filter((id) => predictTeams?.[id] === 'B').length;
  if (teamA !== maxPlayers / 2 || teamB !== maxPlayers / 2) {
    return `لازم كل فريق يكون فيه ${maxPlayers / 2} لاعب.`;
  }
  return null;
}

function canAssignPredictTeam(players, predictTeams, playerId, team, config) {
  if (!['A', 'B'].includes(team)) return false;
  const ids = Object.keys(players || {});
  if (!ids.includes(playerId) || players[playerId]?.disconnected) return false;
  const capacity = getPredictMaxPlayers(config) / 2;
  const occupied = ids.filter((id) => id !== playerId && predictTeams?.[id] === team).length;
  return occupied < capacity;
}

function evaluatePredictRound({
  rawAnswers = {},
  predictTeams = {},
  players = {},
  escapingTeam = 'A',
  rejectedPlayerIds = [],
  semanticMatchPairs = [],
}) {
  const allAnswers = Object.entries(rawAnswers).flatMap(([playerId, answer]) => {
    const team = predictTeams[playerId];
    if (!['A', 'B'].includes(team)) return [];
    return [{
      playerId,
      playerName: players[playerId]?.name || '???',
      team,
      answer,
      norm: normalizePredictText(answer),
    }];
  });

  const rejected = new Set(rejectedPlayerIds);
  const semanticMatches = new Map();
  for (const match of semanticMatchPairs) {
    const ids = Array.isArray(match?.playerIds) ? match.playerIds : [];
    if (ids.length !== 2 || ids[0] === ids[1]) continue;
    const key = [...ids].sort().join('\u0000');
    semanticMatches.set(key, match);
  }
  const eliminated = new Set();
  const caught = new Set();
  const clashes = [];

  allAnswers.forEach((entry, index) => {
    if (!rejected.has(entry.playerId)) return;
    entry.invalid = true;
    if (entry.team === escapingTeam) eliminated.add(index);
  });

  for (let first = 0; first < allAnswers.length; first += 1) {
    for (let second = first + 1; second < allAnswers.length; second += 1) {
      const left = allAnswers[first];
      const right = allAnswers[second];
      const semanticMatch = semanticMatches.get([left.playerId, right.playerId].sort().join('\u0000'));
      const exactMatch = Boolean(left.norm && left.norm === right.norm);
      if (left.invalid || right.invalid || (!exactMatch && !semanticMatch)) continue;

      if (left.team !== right.team) {
        clashes.push({ indices: [first, second], type: 'caught', answer: left.answer, semantic: !exactMatch, aiReason: semanticMatch?.reason || null });
        const escaperIndex = left.team === escapingTeam ? first : second;
        const hunterIndex = left.team === escapingTeam ? second : first;
        eliminated.add(escaperIndex);
        caught.add(hunterIndex);
      } else if (left.team === escapingTeam) {
        clashes.push({ indices: [first, second], type: 'duplicate', answer: left.answer, semantic: !exactMatch, aiReason: semanticMatch?.reason || null });
        eliminated.add(first);
        eliminated.add(second);
      }
    }
  }

  const scoreDeltas = {};
  const correctDeltas = {};
  const wrongDeltas = {};

  allAnswers.forEach((entry, index) => {
    entry.eliminated = entry.team === escapingTeam && eliminated.has(index);
    entry.caught = entry.team !== escapingTeam && caught.has(index);
    entry.survived = entry.team === escapingTeam && !entry.invalid && !entry.eliminated;

    const succeeded = entry.survived || entry.caught;
    if (entry.survived) {
      scoreDeltas[entry.playerId] = 1;
    }
    if (succeeded) {
      correctDeltas[entry.playerId] = 1;
    } else {
      wrongDeltas[entry.playerId] = 1;
    }
    delete entry.norm;
  });

  return { allAnswers, clashes, scoreDeltas, correctDeltas, wrongDeltas };
}

module.exports = {
  normalizePredictText,
  getPredictTotalRounds,
  getEscapingTeam,
  getPredictMaxPlayers,
  haveAllActivePredictPlayersAnswered,
  migratePredictPlayerId,
  validatePredictTeamSetup,
  canAssignPredictTeam,
  evaluatePredictRound,
};
