const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
content = content.replace(/\r\n/g, '\n');

const target = `  room.buzzedAnswer = null;
  room.buzzer = null;
  room.triviaAnswers = {};
  room.lifelines = {};
  room.frozenPlayers = new Set();
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }

  const timeLimit = room.config?.timeLimit || 15;
  const endTime = room.config?.gameMode === 'trivia' ? Date.now() + (timeLimit * 1000) + 2000 : undefined;

  io.to(code).emit('question-updated', {
    id: question._id,
    text: question.text,
    category: question.category,
    flagImage: question.flagImage,
    choices: room.config?.gameMode === 'trivia' ? question.choices : undefined,
    endTime
  });`;

const replace = `  room.buzzedAnswer = null;
  room.buzzer = null;
  room.triviaAnswers = {};
  room.predictTraps = {};
  room.predictVotes = {};
  room.lifelines = {};
  room.frozenPlayers = new Set();
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }
  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }

  const timeLimit = room.config?.timeLimit || 30;
  const isTimedPhase = room.config?.gameMode === 'trivia' || room.config?.gameMode === 'predict';
  const endTime = isTimedPhase ? Date.now() + (timeLimit * 1000) + 2000 : undefined;

  io.to(code).emit('question-updated', {
    id: question._id,
    text: question.text,
    category: question.category,
    flagImage: question.flagImage,
    choices: room.config?.gameMode === 'trivia' ? question.choices : undefined,
    endTime
  });

  if (room.config?.gameMode === 'predict') {
    room.predictTimer = setTimeout(() => {
      evaluatePredictTraps(code);
    }, (timeLimit * 1000) + 2000);
  }`;

if (content.includes(target)) {
  content = content.replace(target, replace);
  fs.writeFileSync('server.js', content);
  console.log('Timer replaced successfully.');
} else {
  console.log('Timer target not found.');
}
