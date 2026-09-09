const fs = require('fs');

const predictLogic = `
  // Predict & Trap: Player submits a trap
  socket.on('submit-predict-trap', ({ code, trap }) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;

    if (!room.predictTraps) room.predictTraps = {};
    if (room.predictTraps[socket.id]) return; // already submitted

    room.predictTraps[socket.id] = trap;

    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    // -1 because host might not be playing if judgeMode is not host-plays, but predict is judgeMode: host and host plays.
    // Actually, in create room for predict we used answerMode='verbal' as default but it's a typing game, so everyone is a player.
    if (Object.keys(room.predictTraps).length >= activePlayersCount) {
      evaluatePredictTraps(code);
    }
  });

  socket.on('submit-predict-vote', ({ code, vote }) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;

    if (!room.predictVotes) room.predictVotes = {};
    if (room.predictVotes[socket.id]) return;

    room.predictVotes[socket.id] = vote;

    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    if (Object.keys(room.predictVotes).length >= activePlayersCount) {
      evaluatePredictVotes(code);
    }
  });
`;

const evaluateFunctions = `
async function evaluatePredictTraps(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;

  const choices = [room.currentQuestion.answer];
  for (const [playerId, trap] of Object.entries(room.predictTraps || {})) {
    if (!choices.includes(trap)) {
      choices.push(trap);
    }
  }

  // Shuffle choices
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  room.predictChoices = choices;
  room.predictVotes = {}; // reset votes

  io.to(code).emit('predict-voting-started', { choices });

  // 15 seconds to vote
  if (room.predictTimer) clearTimeout(room.predictTimer);
  room.predictTimer = setTimeout(() => {
    evaluatePredictVotes(code);
  }, 15000);
}

async function evaluatePredictVotes(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;

  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }

  const correctAnswer = room.currentQuestion.answer;
  const playerResults = [];
  
  // Create reverse map for traps: trap_text -> owner_playerId
  const trapOwners = {};
  for (const [playerId, trap] of Object.entries(room.predictTraps || {})) {
    trapOwners[trap] = playerId;
  }

  for (const [playerId, p] of Object.entries(room.players)) {
    if (p.disconnected) continue;

    const vote = room.predictVotes?.[playerId];
    let points = 0;
    let desc = "لم يختر إجابة";

    if (vote) {
      if (vote === correctAnswer) {
        points += 10;
        desc = "اختار الإجابة الصحيحة";
        room.correct[playerId] = (room.correct[playerId] || 0) + 1;
      } else {
        const ownerId = trapOwners[vote];
        if (ownerId && ownerId !== playerId) {
          desc = \`وقع في فخ \${room.players[ownerId]?.name || 'لاعب'}\`;
          // owner gets points
          room.scores[ownerId] = (room.scores[ownerId] || 0) + 5;
          // Note: we'll add owner points later to avoid double text
          
          const ownerResult = playerResults.find(r => r.playerId === ownerId);
          if (ownerResult) {
            ownerResult.points += 5;
            ownerResult.description = \`\${ownerResult.description} + خدع \${p.name}\`;
          } else {
            playerResults.push({ playerId: ownerId, points: 5, description: \`خدع \${p.name}\` });
          }
        } else {
          desc = "إجابة خاطئة";
        }
        room.wrong[playerId] = (room.wrong[playerId] || 0) + 1;
      }
    }

    room.scores[playerId] = (room.scores[playerId] || 0) + points;

    const existingResult = playerResults.find(r => r.playerId === playerId);
    if (existingResult) {
      existingResult.points += points;
      if (points > 0 && !existingResult.description.includes(desc)) {
        existingResult.description = \`\${desc} و \${existingResult.description}\`;
      }
    } else {
      playerResults.push({ playerId, points, description: desc });
    }
  }

  io.to(code).emit('predict-round-results', {
    correctAnswer,
    playerResults
  });

  // check win condition
  let winner = null;
  const winScore = room.config?.winScore || 50;
  for (const [pid, score] of Object.entries(room.scores)) {
    if (score >= winScore) {
      if (!winner || score > room.scores[winner]) {
        winner = pid;
      }
    }
  }

  if (winner) {
    setTimeout(() => triggerEndGame(code), 4000);
  } else {
    setTimeout(() => fetchAndSendNextQuestion(code), 5000);
  }
}
`;

let content = fs.readFileSync('server.js', 'utf8');

// Insert predictLogic right before 'submit-trivia-answer'
content = content.replace(/socket\.on\('submit-trivia-answer'/g, predictLogic + "\n  socket.on('submit-trivia-answer'");

// Insert evaluateFunctions right before 'async function evaluateTriviaRound'
content = content.replace(/async function evaluateTriviaRound/g, evaluateFunctions + "\nasync function evaluateTriviaRound");

fs.writeFileSync('server.js', content);
