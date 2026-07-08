require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const cors = require('cors');
const { saveGameResults } = require('./services/gameService');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const questionsRoutes = require('./routes/questions');
const storeRoutes = require('./routes/store');
const gameRoutes = require('./routes/game');
const feedbackRoutes = require('./routes/feedback');
const Question = require('./models/Question');
const User = require('./models/User');

connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/feedback', feedbackRoutes);

const server = http.createServer(app);
const io = new Server(server);

const rooms = {};
const connectedUsers = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getPublicRooms() {
  const publicRooms = [];
  for (const code in rooms) {
    const room = rooms[code];
    if ((room.status === 'LOBBY' || room.status === 'PLAYING') && !room.config?.isPrivate) {
      publicRooms.push({
        code,
        hostName: room.hostName,
        playerCount: Object.keys(room.players).length,
        config: room.config || {},
      });
    }
  }
  return publicRooms;
}

async function triggerEndGame(code, payload = {}) {
  const room = rooms[code];
  if (!room || room.status === 'RESULTS') return;

  room.status = 'RESULTS';
  if (payload.totalRounds) room.totalRounds = payload.totalRounds;
  if (payload.categories) room.categories = payload.categories;

  // Temporarily add host's stats back to player lists for correct DB storage/rewards
  const hostId = room.host;
  let hostAddedBack = false;
  if (room.config?.judgeMode === 'rotating' && hostId && room.rotatedHostData?.[hostId]) {
    const stats = room.rotatedHostData[hostId];
    room.players[hostId] = {
      name: room.hostName,
      userId: room.hostUserId,
      disconnected: false,
      equippedItems: room.hostEquippedItems || null
    };
    room.scores[hostId] = stats.score;
    room.correct[hostId] = stats.correct;
    room.wrong[hostId] = stats.wrong;
    if (!room.cards) room.cards = {};
    room.cards[hostId] = stats.cards;
    hostAddedBack = true;
  }

  let coinsEarnedMap = {};
  try {
    coinsEarnedMap = await saveGameResults(code, room) || {};
  } catch (err) {
    console.error('Failed to save game results:', err.message);
  }

  const playersInfo = Object.fromEntries(
    Object.entries(room.players).map(([id, p]) => [
      id, 
      { 
        name: p.name, 
        userId: p.userId || null, 
        equippedItems: p.equippedItems,
        cards: room.cards?.[id] || { yellow: 0, red: 0 },
        coinsEarned: coinsEarnedMap[p.userId] || 0
      }
    ])
  );

  io.to(code).emit('game-ended', {
    roomCode: code,
    hostUserId: room.hostUserId || null,
    scores: room.scores,
    players: playersInfo,
    correct: room.correct,
    wrong: room.wrong,
  });

  // Remove host again so they do not start in the players list if they restart the game
  if (hostAddedBack && hostId) {
    delete room.players[hostId];
    delete room.scores[hostId];
    delete room.correct[hostId];
    delete room.wrong[hostId];
    if (room.cards) delete room.cards[hostId];
  }

  // BUG 8: Results Screen Hang
  room.inactivityTimeout = setTimeout(() => {
    if (rooms[code] && rooms[code].status === 'RESULTS') {
      io.to(code).emit('room-closed', 'تم إغلاق الغرفة بسبب عدم النشاط.');
      const clients = io.sockets.adapter.rooms.get(code);
      if (clients) {
        for (const clientId of clients) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) clientSocket.leave(code);
        }
      }
      delete rooms[code];
      io.emit('public-rooms-update', getPublicRooms());
    }
  }, 120000); // 2 minutes
}

const fs = require('fs');
const path = require('path');
const drawWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/drawWords.json'), 'utf8'));

function logDebug(msg) {
  try { fs.appendFileSync('debug.log', msg + '\n'); } catch(e) {}
}

function migrateHost(code) {
  logDebug(`[Host Migration] Attempting migration for room code: ${code}`);
  const room = rooms[code];
  if (!room) {
    logDebug(`[Host Migration] Room not found.`);
    return false;
  }

  logDebug(`[Host Migration] Current host socket ID: ${room.host}`);
  const activePlayers = Object.entries(room.players).filter(([id, p]) => !p.disconnected);
  logDebug(`[Host Migration] Active players count: ${activePlayers.length}`);
  
  if (activePlayers.length === 0) {
    logDebug(`[Host Migration] No active players to migrate to. Room will be closed.`);
    return false;
  }

  const [newHostId, newHostPlayer] = activePlayers[0];
  logDebug(`[Host Migration] Promoting player ${newHostPlayer.name} (Socket ID: ${newHostId}) to Host.`);

  // Promote this player to host
  room.host = newHostId;
  room.hostName = newHostPlayer.name;
  room.hostUserId = newHostPlayer.userId || null;
  room.hostDisconnected = false;

  // Remove this player from the players list of the room
  delete room.players[newHostId];
  delete room.scores[newHostId];
  delete room.correct[newHostId];
  delete room.wrong[newHostId];
  if (room.cards) delete room.cards[newHostId];

  // Send promotion event to the new host
  io.to(newHostId).emit('promoted-to-host', { status: room.status, reason: 'migration' });

  // Send the current question's answer to the new host so they can view it
  if (room.currentQuestion && room.currentQuestion.answer) {
    io.to(newHostId).emit('reveal-answer-updated', {
      answer: room.currentQuestion.answer
    });
  }

  // Send update to the room
  io.to(code).emit('host-changed', { hostName: newHostPlayer.name });
  io.to(code).emit('player-removed', { id: newHostId });

  // Reset buzz state on migration
  room.buzzer = null;
  if (room.buzzTimeout) {
    clearTimeout(room.buzzTimeout);
    room.buzzTimeout = null;
  }
  io.to(code).emit('buzz-reset');

  // Update public rooms list since playerCount changed
  io.emit('public-rooms-update', getPublicRooms());
  
  logDebug(`[Host Migration] Migration successful. New host: ${newHostPlayer.name}`);
  return true;
}

function rotateHost(code) {
  logDebug(`[Host Rotation] Attempting host rotation for room code: ${code}`);
  const room = rooms[code];
  if (!room) {
    logDebug(`[Host Rotation] Room not found.`);
    return;
  }

  const oldHostId = room.host;
  const activePlayers = Object.entries(room.players).filter(([id, p]) => !p.disconnected);
  logDebug(`[Host Rotation] Current host socket ID: ${oldHostId}, active players: ${activePlayers.length}`);

  if (activePlayers.length === 0) {
    logDebug(`[Host Rotation] No active players to rotate host to.`);
    return;
  }

  const [newHostId, newHostPlayer] = activePlayers[0];
  logDebug(`[Host Rotation] Promoting player ${newHostPlayer.name} (Socket ID: ${newHostId}) to Host.`);

  if (!room.rotatedHostData) {
    room.rotatedHostData = {};
  }

  // Retrieve or initialize old host's stats
  const oldHostStats = room.rotatedHostData[oldHostId] || {
    score: 0,
    correct: 0,
    wrong: 0,
    cards: { yellow: 0, red: 0 }
  };

  // Add old host back to the players list (preserving accumulated score/cards)
  room.players[oldHostId] = {
    name: room.hostName,
    userId: room.hostUserId,
    disconnected: !!room.hostDisconnected,
    equippedItems: room.hostEquippedItems || null
  };
  room.scores[oldHostId] = oldHostStats.score;
  room.correct[oldHostId] = oldHostStats.correct;
  room.wrong[oldHostId] = oldHostStats.wrong;
  if (!room.cards) room.cards = {};
  room.cards[oldHostId] = oldHostStats.cards;

  // Store new host's stats before removing them
  room.rotatedHostData[newHostId] = {
    score: room.scores[newHostId] || 0,
    correct: room.correct[newHostId] || 0,
    wrong: room.wrong[newHostId] || 0,
    cards: room.cards?.[newHostId] || { yellow: 0, red: 0 }
  };

  // Update room host info
  room.host = newHostId;
  room.hostName = newHostPlayer.name;
  room.hostUserId = newHostPlayer.userId || null;
  room.hostEquippedItems = newHostPlayer.equippedItems || null;

  // Remove new host from players structures
  delete room.players[newHostId];
  delete room.scores[newHostId];
  delete room.correct[newHostId];
  delete room.wrong[newHostId];
  if (room.cards) delete room.cards[newHostId];

  // Send demote event to old host and promote event to new host
  io.to(oldHostId).emit('demoted-to-player', { status: room.status });
  io.to(newHostId).emit('promoted-to-host', { status: room.status, reason: 'rotation' });

  // Send the current question's answer to the new host so they can view it
  if (room.currentQuestion && room.currentQuestion.answer) {
    io.to(newHostId).emit('reveal-answer-updated', {
      answer: room.currentQuestion.answer
    });
  }

  // Update all players in the room about changes
  io.to(code).emit('host-changed', { hostName: room.hostName });
  io.to(code).emit('player-removed', { id: newHostId });
  io.to(code).emit('player-joined', {
    id: oldHostId,
    name: room.players[oldHostId].name,
    userId: room.players[oldHostId].userId,
    score: oldHostStats.score,
    equippedItems: room.players[oldHostId].equippedItems,
    cards: oldHostStats.cards
  });

  // Reset buzz state on rotation
  room.buzzer = null;
  if (room.buzzTimeout) {
    clearTimeout(room.buzzTimeout);
    room.buzzTimeout = null;
  }
  // Clear buzzer state if the new host was the active buzzer
  if (room.buzzer === newHostId) {
    room.buzzer = null;
  }
  io.to(code).emit('buzz-reset');

  // Update public rooms list since player counts changed
  io.emit('public-rooms-update', getPublicRooms());

  logDebug(`[Host Rotation] Host rotation successful. New host: ${room.hostName}`);
}

async function evaluateTriviaRound(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || !room.currentQuestion) return;
  if (room.evaluatingTrivia) return; // prevent double execution
  room.evaluatingTrivia = true;

  if (room.triviaTimer) {
    clearTimeout(room.triviaTimer);
    room.triviaTimer = null;
  }

  const correctAnswer = room.currentQuestion.answer;
  const answers = room.triviaAnswers || {};
  const activePlayers = Object.entries(room.players).filter(([id, p]) => !p.disconnected);

  const results = {};
  const playerChoices = {};

  activePlayers.forEach(([id]) => {
    const data = answers[id];
    if (data) {
      playerChoices[id] = data.answer;
    }
    const isCorrect = data && data.answer === correctAnswer;

    if (isCorrect) {
      let pts = 1;
      if (data.usedDouble) pts = 2; // double lifeline gives 2 pts
      results[id] = { delta: pts, isCorrect: true };
      room.scores[id] = (room.scores[id] || 0) + pts;
      room.correct[id] = (room.correct[id] || 0) + 1;
    } else {
      let pts = 0;
      // Deduct 1 point if they answered incorrectly or timed out, and penalty is enabled
      if (room.config?.penaltyEnabled) {
        pts = -1;
        room.scores[id] = (room.scores[id] || 0) - 1;
      }
      results[id] = { delta: pts, isCorrect: false };
      room.wrong[id] = (room.wrong[id] || 0) + 1;
    }
  });

  // Broadcast results
  io.to(code).emit('trivia-round-results', {
    correctAnswer,
    results,
    scores: room.scores,
    playerChoices,
  });

  room.answerRevealed = true;
  room.evaluatingTrivia = false;
  
  // Overtime/Sudden Death: Check win condition
  const winScore = room.config?.winScore !== undefined ? room.config.winScore : 10;
  let hasWinner = false;
  
  if (winScore > 0) {
    let highestScore = -1;
    let highestScorers = [];
    
    for (const [id, score] of Object.entries(room.scores)) {
      if (score > highestScore) {
        highestScore = score;
        highestScorers = [id];
      } else if (score === highestScore) {
        highestScorers.push(id);
      }
    }

    // Only end the game if the highest score reached winScore AND there is NO tie for first place.
    if (highestScore >= winScore && highestScorers.length === 1) {
      hasWinner = true;
    }
  }

  if (hasWinner) {
    setTimeout(async () => {
      await triggerEndGame(code);
    }, 3000);
  } else {
    // Next question automatically after 4 seconds
    setTimeout(async () => {
      await fetchAndSendNextQuestion(code);
    }, 4000);
  }
}

function endDrawRound(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING') return;

  // Clear the round timer
  if (room.drawRoundTimer) {
    clearTimeout(room.drawRoundTimer);
    room.drawRoundTimer = null;
  }

  // Drawer points were already added as people guessed (half of guesser points)
  const drawerPoints = room.drawerRoundPoints || 0;

  // Emit round-end to everyone: word revealed + updated scores
  io.to(code).emit('draw-round-end', {
    word: room.currentDrawWord,
    scores: room.scores,
    drawerId: room.drawerId,
    drawerPoints,
    correctGuessers: [...(room.correctGuessers || [])],
  });

  // Check win condition
  const winScore = room.config.winScore;
  let gameOver = false;
  if (winScore > 0) {
    for (const score of Object.values(room.scores)) {
      if (score >= winScore) { gameOver = true; break; }
    }
  }

  if (gameOver) {
    setTimeout(() => triggerEndGame(code), 4000);
  } else {
    setTimeout(() => startNextDrawRound(code), 4000);
  }
}

async function startNextDrawRound(code) {
  const room = rooms[code];
  if (!room) return;

  // Clear any existing round timer
  if (room.drawRoundTimer) {
    clearTimeout(room.drawRoundTimer);
    room.drawRoundTimer = null;
  }

  let drawerId;
  if (room.config && room.config.judgeMode === 'host') {
    drawerId = room.host;
  } else {
    const activePlayers = Object.entries(room.players).filter(([, p]) => !p.disconnected);
    const playerIds = activePlayers.map(([id]) => id);
    let availableDrawers = playerIds.filter(p => !room.drawnPlayers.includes(p));

    if (availableDrawers.length === 0) {
      if (room.config.winScore === 0) {
        return triggerEndGame(code);
      }
      room.drawnPlayers = [];
      availableDrawers = playerIds;
    }

    if (availableDrawers.length === 0) {
      triggerEndGame(code);
      return;
    }

    drawerId = availableDrawers[Math.floor(Math.random() * availableDrawers.length)];
    room.drawnPlayers.push(drawerId);
  }
  room.drawerId = drawerId;
  room.correctGuessers = new Set(); // reset for new round
  room.drawerRoundPoints = 0;
  room.drawStrokes = [];

  let wordsList = (drawWords && drawWords.length > 0) ? drawWords : ['تفاحة', 'شجرة', 'سيارة', 'بيت', 'شمس'];
  if (room.config && room.config.difficulty && room.config.difficulty !== 'mixed') {
    const diff = room.config.difficulty;
    let filtered = [];
    if (diff === 'easy') {
      filtered = wordsList.filter(w => w.length <= 4);
    } else if (diff === 'medium') {
      filtered = wordsList.filter(w => w.length === 5 || w.length === 6);
    } else if (diff === 'hard') {
      filtered = wordsList.filter(w => w.length >= 7);
    }
    if (filtered.length > 0) {
      wordsList = filtered;
    }
  }
  const word = wordsList[Math.floor(Math.random() * wordsList.length)];
  room.currentDrawWord = word;

  const maskedWord = word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
  room.roundStartTime = Date.now();
  const timeLimit = room.config.timeLimit || 60;

  io.to(code).emit('draw-round-start', {
    drawerId,
    wordLength: word.length,
    maskedWord,
    timeLimit
  });

  io.to(drawerId).emit('draw-word', { word });

  // Auto-end round after timeLimit if not everyone guessed
  room.drawRoundTimer = setTimeout(() => {
    const currentRoom = rooms[code];
    if (!currentRoom || currentRoom.drawerId !== drawerId) return;
    endDrawRound(code);
  }, timeLimit * 1000);
}

async function fetchAndSendNextQuestion(code) {
  const room = rooms[code];
  if (!room) return false;

  if (!room.usedQuestions) {
    room.usedQuestions = [];
  }

  const categories = room.config?.categories || [];
  const matchStage = {};

  // Filter by difficulty if provided and not mixed
  if (room.config?.gameMode === 'trivia' && room.config?.difficulty && room.config.difficulty !== 'mixed') {
    matchStage.difficulty = room.config.difficulty;
  }

  // Prevent consecutive categories if multiple are selected
  let activeCategories = categories && categories.length > 0 ? categories : null;
  if (activeCategories && activeCategories.length > 1 && room.lastCategory) {
    const filtered = activeCategories.filter(c => c !== room.lastCategory);
    if (filtered.length > 0) {
      activeCategories = filtered;
    }
  }

  if (room.config?.gameMode === 'trivia') {
    matchStage.isCustomTrivia = true; // ONLY use custom trivia questions
    if (activeCategories) {
      matchStage.category = { $in: activeCategories };
    }
  } else {
    matchStage.isCustomTrivia = { $ne: true }; // Buzzer MUST NOT use trivia questions
    if (activeCategories) {
      matchStage.category = { $in: activeCategories };
    }
  }

  if (room.usedQuestions.length > 0) {
    matchStage._id = { $nin: room.usedQuestions };
  }

  try {
    let samples = await Question.aggregate([
      { $match: matchStage },
      { $sample: { size: 1 } }
    ]);

    // If all questions are used, reset the pool and query again
    if ((!samples || samples.length === 0) && room.usedQuestions.length > 0) {
      logDebug(`[Question Pool] All questions used. Resetting question pool for room: ${code}`);
      room.usedQuestions = [];
      delete matchStage._id;
      samples = await Question.aggregate([
        { $match: matchStage },
        { $sample: { size: 1 } }
      ]);
    }

    if (samples && samples.length > 0) {
      const question = samples[0];
      room.currentQuestion = question;
      room.lastCategory = question.category; // Track category to prevent consecutive repetitions
      room.answerRevealed = false;
      room.buzzer = null;

      // Track as used
      room.usedQuestions.push(question._id);

      room.triviaAnswers = {}; // Reset answers for the new round
      room.lifelines = {}; // Reset lifelines for the new round
      if (room.triviaTimer) {
        clearTimeout(room.triviaTimer);
        room.triviaTimer = null;
      }

      const timeLimit = room.config?.timeLimit || 15;
      const endTime = room.config?.gameMode === 'trivia' ? Date.now() + (timeLimit * 1000) + 2000 : undefined;

      // Emit to everyone without answer
      io.to(code).emit('question-updated', {
        text: question.text,
        category: question.category,
        flagImage: question.flagImage,
        choices: room.config?.gameMode === 'trivia' ? question.choices : undefined,
        endTime
      });

      // If trivia mode and question has a flag image, reveal it immediately to all players
      if (room.config?.gameMode === 'trivia' && question.flagImage) {
        io.to(code).emit('image-revealed', question.flagImage);
      }

      // Emit answer to host only (if they are a judge)
      io.to(room.host).emit('reveal-answer-updated', {
        answer: question.answer
      });

      // Reset buzzer
      io.to(code).emit('buzz-reset');

      // If Trivia mode, start timer based on config
      if (room.config?.gameMode === 'trivia') {
        room.evaluatingTrivia = false; // reset for new round
        if (timeLimit > 0) {
          room.triviaTimer = setTimeout(() => {
            evaluateTriviaRound(code);
          }, (timeLimit * 1000) + 2000);
        }
      }

      return true;
    } else {
      io.to(room.host).emit('error', 'لم يتم العثور على أسئلة في التصنيفات المحددة!');
      setTimeout(() => triggerEndGame(code), 2000);
      return false;
    }
  } catch (err) {
    console.error('Failed to get next question:', err);
    io.to(room.host).emit('error', 'حدث خطأ أثناء تحميل السؤال!');
    setTimeout(() => triggerEndGame(code), 2000);
    return false;
  }
}

io.on('connection', (socket) => {

  // مزامنة الوقت
  socket.on('sync-time', (clientTime) => {
    socket.emit('sync-time-response', { clientTime, serverTime: Date.now() });
  });

  // تسجيل المستخدم للإشعارات (دعوات الأصدقاء)
  socket.on('register-user', (userId) => {
    if (userId) {
      connectedUsers.set(userId, socket.id);
      socket.userId = userId;
    }
  });

  // إرسال دعوة غرفة
  socket.on('send-room-invite', ({ targetUserId, roomCode, hostName }) => {
    const targetSocketId = connectedUsers.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive-room-invite', { roomCode, hostName });
    }
  });

  // حكم بيعمل روم
  socket.on('create-room', (payload) => {
    const { hostName, hostUserId, hostEquippedItems, config } = payload || {};
    const code = generateRoomCode();
    rooms[code] = {
      host: socket.id,
      hostName: hostName || 'Unknown Host',
      hostUserId: hostUserId || null,
      hostEquippedItems: hostEquippedItems || null,
      status: 'LOBBY', // LOBBY, PLAYING, RESULTS
      config: config || {},
      players: {},
      scores: {},
      correct: {},
      wrong: {},
      cards: {},
      buzzer: null,
      votesToPlayAgain: new Set(),
      rotatedHostData: {},
      triviaAnswers: {},
      triviaTimer: null,
      lifelines: {},
    };

    if (config?.gameMode === 'trivia' || config?.gameMode === 'draw') {
      rooms[code].players[socket.id] = { name: hostName || 'Unknown Host', userId: hostUserId || null, disconnected: false, equippedItems: hostEquippedItems || null };
      rooms[code].scores[socket.id] = 0;
      rooms[code].correct[socket.id] = 0;
      rooms[code].wrong[socket.id] = 0;
      rooms[code].cards[socket.id] = { yellow: 0, red: 0 };
    }

    socket.join(code);
    socket.emit('room-created', code);
    io.emit('public-rooms-update', getPublicRooms());
  });

  // جلب الرومات العامة
  socket.on('get-public-rooms', () => {
    socket.emit('public-rooms-update', getPublicRooms());
  });

  // لاعب بيدخل روم
  socket.on('join-room', ({ code, playerName, userId, equippedItems }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', 'الروم مش موجود!');
    
    // Check for reconnecting player
    let reconnectingId = null;
    for (const [id, p] of Object.entries(room.players)) {
      if ((userId && p.userId === userId) || (!userId && p.name === playerName)) {
        reconnectingId = id;
        break;
      }
    }

    if (!reconnectingId) {
      const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
      if (activePlayersCount >= 8) {
        return socket.emit('error', 'الروم ممتلئة! الحد الأقصى 8 لاعبين.');
      }
    }

    if (reconnectingId) {
      // Move old player data to new socket.id
      room.players[socket.id] = room.players[reconnectingId];
      room.players[socket.id].disconnected = false;
      room.players[socket.id].name = playerName; // Update name just in case
      room.players[socket.id].equippedItems = equippedItems || room.players[socket.id].equippedItems;

      room.scores[socket.id] = room.scores[reconnectingId] || 0;
      room.correct[socket.id] = room.correct[reconnectingId] || 0;
      room.wrong[socket.id] = room.wrong[reconnectingId] || 0;
      if (!room.cards) room.cards = {};
      room.cards[socket.id] = room.cards[reconnectingId] || { yellow: 0, red: 0 };

      delete room.players[reconnectingId];
      delete room.scores[reconnectingId];
      delete room.correct[reconnectingId];
      delete room.wrong[reconnectingId];
      delete room.cards[reconnectingId];

      if (room.triviaAnswers?.[reconnectingId]) {
        room.triviaAnswers[socket.id] = room.triviaAnswers[reconnectingId];
        delete room.triviaAnswers[reconnectingId];
      }

      if (room.usedLifelines?.[reconnectingId]) {
        room.usedLifelines[socket.id] = room.usedLifelines[reconnectingId];
        delete room.usedLifelines[reconnectingId];
      }

      if (room.lifelines?.[reconnectingId]) {
        room.lifelines[socket.id] = room.lifelines[reconnectingId];
        delete room.lifelines[reconnectingId];
      }

      if (room.buzzer === reconnectingId) room.buzzer = socket.id;
      if (room.drawerId === reconnectingId) room.drawerId = socket.id;
      
      // We don't need to re-wire the timeout because if it fires, it checks `currentRoom.buzzer === socket.id`.
      // Actually, if buzzer changes to socket.id, the timeout closure still uses the OLD `socket.id`.
      // The easiest way is to let the host manually handle it if someone reconnects mid-buzz,
      // because a buzzer timeout is max 15 seconds. Reconnecting takes longer anyway.

      socket.join(code);
      const playersList = Object.entries(room.players).map(([id, p]) => ({
        id,
        name: p.name,
        userId: p.userId || null,
        score: room.scores[id] || 0,
        disconnected: p.disconnected,
        equippedItems: p.equippedItems,
        cards: room.cards?.[id] || { yellow: 0, red: 0 }
      }));

      socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config });
      io.to(code).emit('player-rejoined', {
        id: socket.id,
        name: playerName,
        userId: userId || null,
        score: room.scores[socket.id],
        equippedItems: room.players[socket.id].equippedItems,
        cards: room.cards?.[socket.id] || { yellow: 0, red: 0 }
      });
      
      // Resend current question state if playing
      if (room.status === 'PLAYING' && room.currentQuestion) {
        socket.emit('question-updated', {
          text: room.currentQuestion.text,
          category: room.currentQuestion.category,
          flagImage: room.currentQuestion.flagImage
        });
        if (room.buzzer) {
          const buzzedPlayer = room.players[room.buzzer];
          socket.emit('buzzed', {
            id: room.buzzer,
            name: buzzedPlayer ? buzzedPlayer.name : 'Unknown',
            equippedItems: buzzedPlayer ? buzzedPlayer.equippedItems : null,
            timeLimit: room.config?.timeLimit || 0
          });
        }
      }

      // Resend current draw game state if playing draw mode
      if (room.status === 'PLAYING' && room.config?.gameMode === 'draw') {
        const timeElapsed = (Date.now() - (room.roundStartTime || Date.now())) / 1000;
        const timeLimit = room.config.timeLimit || 60;
        const timeLeft = Math.max(0, Math.ceil(timeLimit - timeElapsed));
        const maskedWord = room.currentDrawWord ? room.currentDrawWord.split('').map(c => c === ' ' ? ' ' : '_').join(' ') : '';
        socket.emit('draw-round-start', {
          drawerId: room.drawerId,
          wordLength: room.currentDrawWord ? room.currentDrawWord.length : 0,
          maskedWord,
          timeLimit,
          timeLeft
        });
        if (socket.id === room.drawerId) {
          socket.emit('draw-word', { word: room.currentDrawWord });
        }
        socket.emit('draw-sync-canvas', room.drawStrokes || []);
      }
      return;
    }

    if (room.status === 'RESULTS') return socket.emit('error', 'اللعبة انتهت!');

    room.players[socket.id] = { name: playerName, userId: userId || null, disconnected: false, equippedItems };
    room.scores[socket.id] = 0;
    room.correct[socket.id] = 0;
    room.wrong[socket.id] = 0;
    if (!room.cards) room.cards = {};
    room.cards[socket.id] = { yellow: 0, red: 0 };
    socket.join(code);

    const playersList = Object.entries(room.players).map(([id, p]) => ({
      id,
      name: p.name,
      userId: p.userId || null,
      score: room.scores[id] || 0,
      disconnected: p.disconnected,
      equippedItems: p.equippedItems,
      cards: room.cards?.[id] || { yellow: 0, red: 0 }
    }));

    socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config });
    io.to(code).emit('player-joined', { id: socket.id, name: playerName, userId: userId || null, score: 0, equippedItems, cards: { yellow: 0, red: 0 } });
    io.emit('public-rooms-update', getPublicRooms());

    // Send current question state if joining mid-game
    if (room.status === 'PLAYING' && room.currentQuestion) {
      socket.emit('question-updated', {
        text: room.currentQuestion.text,
        category: room.currentQuestion.category,
        flagImage: room.currentQuestion.flagImage
      });
      if (room.buzzer) {
        const buzzedPlayer = room.players[room.buzzer];
        socket.emit('buzzed', {
          id: room.buzzer,
          name: buzzedPlayer ? buzzedPlayer.name : 'Unknown',
          equippedItems: buzzedPlayer ? buzzedPlayer.equippedItems : null,
          timeLimit: room.config?.timeLimit || 0
        });
      }
    }

    // Send current draw game state if playing draw mode mid-game
    if (room.status === 'PLAYING' && room.config?.gameMode === 'draw') {
      const timeElapsed = (Date.now() - (room.roundStartTime || Date.now())) / 1000;
      const timeLimit = room.config.timeLimit || 60;
      const timeLeft = Math.max(0, Math.ceil(timeLimit - timeElapsed));
      const maskedWord = room.currentDrawWord ? room.currentDrawWord.split('').map(c => c === ' ' ? ' ' : '_').join(' ') : '';
      socket.emit('draw-round-start', {
        drawerId: room.drawerId,
        wordLength: room.currentDrawWord ? room.currentDrawWord.length : 0,
        maskedWord,
        timeLimit,
        timeLeft
      });
      if (socket.id === room.drawerId) {
        socket.emit('draw-word', { word: room.currentDrawWord });
      }
      socket.emit('draw-sync-canvas', room.drawStrokes || []);
    }
  });

  async function handleStartGame(code, hostSocket) {
    const room = rooms[code];
    if (!room) return;
    room.status = 'PLAYING';
    if (room.inactivityTimeout) {
      clearTimeout(room.inactivityTimeout);
      room.inactivityTimeout = null;
    }
    
    // Reset scores if playing again
    for (let playerId in room.players) {
      room.scores[playerId] = 0;
      room.correct[playerId] = 0;
      room.wrong[playerId] = 0;
    }
    room.cards = {};
    for (let playerId in room.players) {
      room.cards[playerId] = { yellow: 0, red: 0 };
    }
    room.votesToPlayAgain.clear();
    room.rotatedHostData = {};
    room.usedQuestions = [];
    room.usedLifelines = {};
    room.lifelines = {};

    if (room.config.gameMode === 'draw') {
      room.drawnPlayers = [];
      io.to(code).emit('game-started', {
        players: Object.entries(room.players).map(([id, p]) => ({
          id,
          name: p.name,
          score: 0,
          disconnected: p.disconnected,
          equippedItems: p.equippedItems
        }))
      });
      startNextDrawRound(code);
      io.emit('public-rooms-update', getPublicRooms());
      return;
    }

    io.to(code).emit('game-started', {
      players: Object.entries(room.players).map(([id, p]) => ({
        id,
        name: p.name,
        score: 0,
        disconnected: p.disconnected,
        equippedItems: p.equippedItems,
        cards: { yellow: 0, red: 0 }
      }))
    });

    await fetchAndSendNextQuestion(code);
    io.emit('public-rooms-update', getPublicRooms());
  }

  // الحكم بيبدأ اللعبة
  socket.on('start-game', async (code) => {
    const room = rooms[code];
    if (!room || room.status === 'PLAYING' || room.starting) return;
    
    // Require at least 2 active players to start (Production rule)
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    if (activePlayersCount < 2) {
      socket.emit('error', 'لا يمكن بدء اللعبة بأقل من لاعبين!');
      return;
    }
    
    room.starting = true;
    try {
      await handleStartGame(code, socket);
    } finally {
      if (rooms[code]) rooms[code].starting = false;
    }
  });

  // تصويت اللاعبين للعب مرة أخرى
  socket.on('vote-play-again', async (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'RESULTS') return;
    
    room.votesToPlayAgain.add(socket.id);
    
    // Calculate active players (excluding disconnected)
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    // Host is not considered in players list usually, wait, is host in players? No. So host vote? 
    // Usually host can just press start-game. If players vote, they just need majority of players.
    
    io.to(code).emit('vote-count-updated', room.votesToPlayAgain.size, activePlayersCount);
    
    if (room.votesToPlayAgain.size > Math.floor(activePlayersCount / 2)) {
      await handleStartGame(code, null);
    }
  });

  // الحكم بينهي اللعبة
  socket.on('end-game', async (payload) => {
    const code = typeof payload === 'string' ? payload : payload.code;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    await triggerEndGame(code, typeof payload === 'object' ? payload : {});
  });

  // لاعب دوس الباز
  socket.on('buzz', (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.buzzer) return;

    room.buzzer = socket.id;
    
    // Check if timeLimit is set
    const timeLimit = room.config?.timeLimit || 0;
    
    if (timeLimit > 0) {
      if (room.buzzTimeout) clearTimeout(room.buzzTimeout);
      
      room.buzzTimeout = setTimeout(() => {
        const currentRoom = rooms[code];
        if (currentRoom && currentRoom.buzzer === socket.id) {
          // Time out penalty
          console.log(`Player ${socket.id} timed out. Applying -1 penalty.`);
          currentRoom.scores[socket.id] = (currentRoom.scores[socket.id] || 0) - 1;
          currentRoom.wrong[socket.id] = (currentRoom.wrong[socket.id] || 0) + 1;
          currentRoom.buzzer = null;
          
          io.to(code).emit('score-update', {
            id: socket.id,
            name: currentRoom.players[socket.id]?.name,
            score: currentRoom.scores[socket.id],
            delta: -1,
            scores: currentRoom.scores,
            players: Object.fromEntries(Object.entries(currentRoom.players).map(([id, p]) => [id, p.name])),
          });
          
          io.to(code).emit('buzz-reset');
        }
      }, timeLimit * 1000);
    }
    
    io.to(code).emit('buzzed', { 
      id: socket.id, 
      name: room.players[socket.id]?.name, 
      equippedItems: room.players[socket.id]?.equippedItems,
      timeLimit 
    });
  });

  // الحكم بيدي نقطة
  socket.on('give-point', async ({ code, playerId, points }) => {
    console.log(`Server received give-point: code=${code}, playerId=${playerId}, points=${points}`);
    const room = rooms[code];
    if (!room) {
      console.log(`give-point error: Room ${code} not found`);
      return;
    }
    if (room.status !== 'PLAYING') {
      console.log(`give-point error: Room status is ${room.status}, not PLAYING`);
      return;
    }
    if (room.evaluatingManual) return;
    room.evaluatingManual = true;

    try {
      if (room.buzzTimeout) {
        clearTimeout(room.buzzTimeout);
        room.buzzTimeout = null;
      }

    const isBuzzedCorrect = (points > 0 && room.buzzer === playerId);

    room.scores[playerId] = (room.scores[playerId] || 0) + points;
    if (points > 0) {
      room.correct[playerId] = (room.correct[playerId] || 0) + 1;
    } else if (points < 0) {
      room.wrong[playerId] = (room.wrong[playerId] || 0) + 1;
    }
    room.buzzer = null;

    console.log(`Player ${playerId} new score: ${room.scores[playerId]}`);

    io.to(code).emit('score-update', {
      id: playerId,
      name: room.players[playerId]?.name,
      score: room.scores[playerId],
      delta: points,
      scores: room.scores,
      players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.name])),
    });

    const winScore = room.config?.winScore !== undefined ? room.config.winScore : 10;
    
    let highestScore = -1;
    let highestScorers = [];
    for (const [id, score] of Object.entries(room.scores)) {
      if (score > highestScore) {
        highestScore = score;
        highestScorers = [id];
      } else if (score === highestScore) {
        highestScorers.push(id);
      }
    }

    if (winScore > 0 && highestScore >= winScore && highestScorers.length === 1) {
      console.log(`Player ${highestScorers[0]} reached ${winScore} points and broke ties! Ending game automatically...`);
      await triggerEndGame(code);
    } else if (isBuzzedCorrect) {
      if (room.config?.judgeMode === 'rotating') {
        rotateHost(code);
      }
      // تحميل السؤال التالي تلقائياً لأن الإجابة صحيحة
      await fetchAndSendNextQuestion(code);
    } else {
      // If wrong answer, we just unlock the buzzer for others
      io.to(code).emit('buzz-reset');
    }
    } finally {
      setTimeout(() => {
        if (rooms[code]) rooms[code].evaluatingManual = false;
      }, 500);
    }
  });

  // الحكم بيدي كارت
  socket.on('give-card', ({ code, playerId, cardType }) => {
    console.log(`Server received give-card: code=${code}, playerId=${playerId}, cardType=${cardType}`);
    const room = rooms[code];
    if (!room) {
      console.log(`give-card error: Room ${code} not found`);
      return;
    }
    if (room.status !== 'PLAYING') {
      console.log(`give-card error: Room status is ${room.status}, not PLAYING`);
      return;
    }

    if (room.buzzTimeout) {
      clearTimeout(room.buzzTimeout);
      room.buzzTimeout = null;
    }

    const penalty = cardType === 'yellow' ? -1 : (cardType === 'red' ? -3 : 0);
    room.scores[playerId] = (room.scores[playerId] || 0) + penalty;
    room.wrong[playerId] = (room.wrong[playerId] || 0) + 1;
    if (!room.cards) room.cards = {};
    if (!room.cards[playerId]) room.cards[playerId] = { yellow: 0, red: 0 };
    if (cardType === 'yellow' || cardType === 'red') {
      room.cards[playerId][cardType] += 1;
    }

    console.log(`Player ${playerId} card penalty: ${penalty}, new score: ${room.scores[playerId]}`);

    io.to(code).emit('score-update', {
      id: playerId,
      name: room.players[playerId]?.name,
      score: room.scores[playerId],
      delta: penalty,
      cardType: cardType,
      cards: room.cards[playerId],
      scores: room.scores,
      players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.name])),
    });
    
    // Unlock buzzer if it was locked
    if (room.buzzer) {
      room.buzzer = null;
      io.to(code).emit('buzz-reset');
    }
  });

  // تصفير النقاط للصفر
  socket.on('reset-score', ({ code, playerId }) => {
    console.log(`Server received reset-score: code=${code}, playerId=${playerId}`);
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING') return;

    room.scores[playerId] = 0;

    io.to(code).emit('score-update', {
      id: playerId,
      name: room.players[playerId]?.name,
      score: 0,
      scores: room.scores,
      players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.name])),
    });
  });

  // reset الباز
  socket.on('reset-buzz', (code) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;

    if (room.buzzTimeout) {
      clearTimeout(room.buzzTimeout);
      room.buzzTimeout = null;
    }
    room.buzzer = null;
    io.to(code).emit('buzz-reset');
  });

  // جلب السؤال التالي للحكم واللاعبين
  socket.on('next-question', async (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING') return;

    if (room.buzzTimeout) {
      clearTimeout(room.buzzTimeout);
      room.buzzTimeout = null;
    }
    room.buzzer = null;

    if (room.config?.judgeMode === 'rotating') {
      rotateHost(code);
    }

    await fetchAndSendNextQuestion(code);
  });

  // إظهار الإجابة للحكم فقط
  socket.on('reveal-answer', (code) => {
    const room = rooms[code];
    if (!room || !room.currentQuestion) return;

    room.answerRevealed = true;
    socket.emit('reveal-answer-updated', {
      answer: room.currentQuestion.answer
    });
  });

  // الحكم بيعرض الصورة للاعبين
  socket.on('reveal-image', (code) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id || !room.currentQuestion || !room.currentQuestion.flagImage) return;
    io.to(code).emit('image-revealed', room.currentQuestion.flagImage);
  });

  // إجابة لاعب في وضع التريفيا
  socket.on('submit-trivia-answer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'trivia') return;

    if (!room.triviaAnswers) room.triviaAnswers = {};
    if (room.triviaAnswers[socket.id]) return; // Player already answered this round

    // Record the answer and time
    room.triviaAnswers[socket.id] = {
      answer,
      time: Date.now(),
      usedDouble: room.lifelines && room.lifelines[socket.id] === 'double',
    };

    // If all active players have answered, evaluate immediately
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    if (Object.keys(room.triviaAnswers).length >= activePlayersCount) {
      evaluateTriviaRound(code);
    }
  });

  // استخدام كارت مساعدة (Lifeline)
  socket.on('use-lifeline', ({ code, type }) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'trivia') return;
    if (room.config?.lifelinesEnabled === false) return; // Lifelines disabled by host
    if (room.triviaAnswers && room.triviaAnswers[socket.id]) return; // Cannot use lifeline after answering

    if (!room.lifelines) room.lifelines = {};
    if (room.lifelines[socket.id]) return; // Already used a lifeline this round? Wait, lifelines are one per game?
    // Actually the user said "ضيف كروت مساعدة لكل لاعب يستخدمها مره". 
    // So we should track used lifelines per player per GAME, not just this round.
    if (!room.usedLifelines) room.usedLifelines = {};
    if (!room.usedLifelines[socket.id]) room.usedLifelines[socket.id] = {};
    
    if (room.usedLifelines[socket.id][type]) return; // Already used this lifeline type in this game

    room.usedLifelines[socket.id][type] = true;
    
    // For this round
    room.lifelines[socket.id] = type;

    // Handle freeze lifeline effect
    if (type === 'freeze') {
      const freezerName = room.players[socket.id]?.name || 'لاعب';
      socket.broadcast.to(code).emit('player-frozen', freezerName);
    }
    
    // Handle 50:50 lifeline effect
    if (type === 'fiftyFifty') {
      const q = room.currentQuestion;
      if (q && q.choices) {
        const wrongChoices = q.choices.filter(c => c !== q.answer);
        const numToRemove = wrongChoices.length > 1 ? Math.min(2, wrongChoices.length - 1) : 0;
        const toRemove = wrongChoices.sort(() => 0.5 - Math.random()).slice(0, numToRemove);
        socket.emit('fifty-fifty-result', toRemove);
      }
    }

    // Send confirmation back
    socket.emit('lifeline-used', { type });
  });

  // الحكم بيطرد لاعب
  socket.on('kick-player', ({ code, playerId }) => {
    console.log(`Server received kick-player: code=${code}, playerId=${playerId}, socket.id=${socket.id}`);
    const room = rooms[code];
    if (!room) {
      console.log(`kick-player error: Room ${code} not found`);
      return;
    }
    if (room.host !== socket.id) {
      console.log(`kick-player error: socket.id=${socket.id} is not the host (${room.host})`);
      return;
    }
    if (playerId === socket.id) {
      console.log(`kick-player error: Host cannot kick themselves`);
      return;
    }

    if (room.players[playerId]) {
      const name = room.players[playerId].name;
      const p = room.players[playerId];
      console.log(`Kicking player ${name} (${playerId}) from room ${code}`);
      io.to(playerId).emit('kicked', 'لقد تم طردك من الغرفة من قبل الحكم.');

      // If game is active, record it as a game played immediately
      if (room.status === 'PLAYING' && p.userId) {
        User.findByIdAndUpdate(p.userId, {
          $inc: {
            totalGames: 1,
            totalCorrect: room.correct[playerId] || 0,
            totalWrong: room.wrong[playerId] || 0,
          }
        }).catch(err => console.error('Failed to update stats for kicked player:', err.message));
      }

      delete room.players[playerId];
      delete room.scores[playerId];
      delete room.correct[playerId];
      delete room.wrong[playerId];
      if (room.cards) delete room.cards[playerId];

      if (room.buzzer === playerId) {
        room.buzzer = null;
        if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
        io.to(code).emit('buzz-reset');
      }
      
      if (room.votesToPlayAgain?.has(playerId)) {
        room.votesToPlayAgain.delete(playerId);
        const activeCount = Object.values(room.players).filter(pl => !pl.disconnected).length;
        io.to(code).emit('vote-count-updated', room.votesToPlayAgain.size, activeCount);
      }

      const playerSocket = io.sockets.sockets.get(playerId);
      if (playerSocket) {
        playerSocket.leave(code);
      }

      io.to(code).emit('player-removed', { id: playerId });
      io.emit('public-rooms-update', getPublicRooms());
    } else {
      console.log(`kick-player error: player ${playerId} not found in room ${code}`);
    }
  });

  // خروج لاعب أو حكم بمزاجه
  socket.on('leave-room', (code) => {
    const room = rooms[code];
    if (!room) return;

    if (room.host === socket.id) {
      // Host explicitly left! Try to migrate host.
      const migrated = migrateHost(code);
      
      if (!migrated) {
        io.to(code).emit('room-closed', 'تم إنهاء الغرفة بواسطة الحكم وعدم وجود لاعبين.');
        const clients = io.sockets.adapter.rooms.get(code);
        if (clients) {
          for (const clientId of clients) {
            const clientSocket = io.sockets.sockets.get(clientId);
            if (clientSocket) clientSocket.leave(code);
          }
        }
        if (room.buzzTimeout) clearTimeout(room.buzzTimeout);
        if (room.hostTimeout) clearTimeout(room.hostTimeout);
        if (room.inactivityTimeout) clearTimeout(room.inactivityTimeout);
        delete rooms[code];
      }
      socket.leave(code);
      io.emit('public-rooms-update', getPublicRooms());
    } else if (room.players[socket.id]) {
      // Player explicitly left
      const name = room.players[socket.id].name;
      const p = room.players[socket.id];

      // If game is active, record it as a game played (but not a win) immediately
      if (room.status === 'PLAYING' && p.userId) {
        User.findByIdAndUpdate(p.userId, {
          $inc: {
            totalGames: 1,
            totalCorrect: room.correct[socket.id] || 0,
            totalWrong: room.wrong[socket.id] || 0,
          }
        }).catch(err => console.error('Failed to update stats for leaving player:', err.message));
      }

      delete room.players[socket.id];
      delete room.scores[socket.id];
      delete room.correct[socket.id];
      delete room.wrong[socket.id];
      if (room.cards) delete room.cards[socket.id];
      
      if (room.buzzer === socket.id) {
        room.buzzer = null;
        if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
        io.to(code).emit('buzz-reset');
      }
      
      if (room.votesToPlayAgain?.has(socket.id)) {
        room.votesToPlayAgain.delete(socket.id);
        const activeCount = Object.values(room.players).filter(pl => !pl.disconnected).length;
        io.to(code).emit('vote-count-updated', room.votesToPlayAgain.size, activeCount);
      }

      socket.leave(code);
      io.to(code).emit('player-removed', { id: socket.id, name });
      io.emit('public-rooms-update', getPublicRooms());
    }
  });

  // === DRAW & GUESS EVENTS ===
  socket.on('draw-stroke', (data) => {
    const { code, stroke } = data;
    const room = rooms[code];
    if (room) {
      if (!room.drawStrokes) room.drawStrokes = [];
      room.drawStrokes.push(stroke);
    }
    socket.to(code).emit('draw-update', stroke);
  });

  // Real-time live stroke broadcast (throttled on client, ~30fps)
  socket.on('draw-stroke-live', (data) => {
    const { code, stroke } = data;
    socket.to(code).emit('draw-update-live', stroke); // stroke is null to clear, or object to show
  });

  socket.on('clear-canvas', (code) => {
    const room = rooms[code];
    if (room) {
      room.drawStrokes = [];
    }
    socket.to(code).emit('canvas-cleared');
  });

function normalizeArabic(text) {
  if (!text) return '';
  let str = text.trim().toLowerCase();
  // 1. Remove diacritics
  str = str.replace(/[\u064B-\u0652]/g, '');
  // 2. Normalize Alifs
  str = str.replace(/[أإآ]/g, 'ا');
  // 3. Normalize Teh Marbuta to Heh
  str = str.replace(/ة/g, 'ه');
  // 4. Normalize Alif Maksura to Yeh
  str = str.replace(/ى/g, 'ي');
  // 5. Clean up extra spaces
  str = str.replace(/\s+/g, ' ');
  return str;
}

  socket.on('draw-guess', (data) => {
    const { code, guess } = data;
    const playerId = socket.id;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config.gameMode !== 'draw') return;
    if (!room.correctGuessers) room.correctGuessers = new Set();

    // Drawer can't guess, already-correct players can't spam
    if (socket.id === room.drawerId) return;
    if (room.correctGuessers.has(playerId)) return;

    if (normalizeArabic(guess) === normalizeArabic(room.currentDrawWord)) {
      // Correct guess!
      const timeLimit = room.config.timeLimit || 60;
      const timeElapsed = (Date.now() - (room.roundStartTime || Date.now())) / 1000;
      const points = Math.max(2, Math.floor(100 * (1 - (timeElapsed / timeLimit))));

      room.scores[playerId] = (room.scores[playerId] || 0) + points;
      room.correctGuessers.add(playerId);
      room.correct[playerId] = (room.correct[playerId] || 0) + 1;

      // Reward the drawer too! Half of what the guesser got (because a fast guess means a good drawing)
      const drawerReward = Math.floor(points / 2);
      if (room.drawerId) {
        room.scores[room.drawerId] = (room.scores[room.drawerId] || 0) + drawerReward;
        room.drawerRoundPoints = (room.drawerRoundPoints || 0) + drawerReward;
      }

      // Tell everyone someone guessed correctly (WITHOUT revealing the word)
      io.to(code).emit('draw-chat', {
        playerId,
        guess: '✅ خمّن الكلمة!',
        isCorrectGuess: true,
        points,
        drawerReward,
      });

      // Tell this guesser their reward privately
      io.to(playerId).emit('draw-guess-correct', {
        points,
        word: room.currentDrawWord,
        scores: room.scores,
      });

      // Update scores for everyone
      io.to(code).emit('draw-scores-updated', { scores: room.scores });

      // Check if ALL active non-drawer players guessed correctly → end round early
      const activeGuessers = Object.entries(room.players)
        .filter(([id, p]) => !p.disconnected && id !== room.drawerId);
      const allGuessed = activeGuessers.length > 0 &&
        activeGuessers.every(([id]) => room.correctGuessers.has(id));

      if (allGuessed) {
        endDrawRound(code);
      }
    } else {
      // Wrong guess → broadcast as normal chat
      room.wrong[playerId] = (room.wrong[playerId] || 0) + 1;
      io.to(code).emit('draw-chat', { playerId, guess });
    }
  });

  // لاعب اتفصل
  socket.on('disconnect', () => {
    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }

    let publicRoomsChanged = false;
    for (const code in rooms) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        // Player disconnected - don't delete, mark as disconnected
        room.players[socket.id].disconnected = true;
        const name = room.players[socket.id].name;
        io.to(room.host).emit('player-left', { id: socket.id, name });
        if (room.status === 'LOBBY') publicRoomsChanged = true;

        if (room.buzzer === socket.id) {
          room.buzzer = null;
          if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
          io.to(code).emit('buzz-reset');
        }

        // If this player was the drawer, end the round immediately
        if (room.config?.gameMode === 'draw' && room.status === 'PLAYING' && room.drawerId === socket.id) {
          io.to(code).emit('draw-chat', {
            playerId: null,
            guess: `🚪 الراسم غادر اللعبة! الكلمة كانت: ${room.currentDrawWord}`,
            isSystem: true,
          });
          endDrawRound(code);
        }
        
        if (room.votesToPlayAgain?.has(socket.id)) {
          room.votesToPlayAgain.delete(socket.id);
          const activeCount = Object.values(room.players).filter(pl => !pl.disconnected).length;
          io.to(code).emit('vote-count-updated', room.votesToPlayAgain.size, activeCount);
        }
      } else if (room.host === socket.id) {
        // Host disconnected - wait for them to reconnect
        room.hostDisconnected = true;
        io.to(code).emit('host-disconnected');
        
        // Give the host 2 minutes to return
        room.hostTimeout = setTimeout(() => {
          if (rooms[code] && rooms[code].hostDisconnected) {
            const migrated = migrateHost(code);
            if (!migrated) {
              io.to(code).emit('room-closed', 'تم إغلاق الغرفة لعدم عودة الحكم وعدم وجود لاعبين.');
              const clients = io.sockets.adapter.rooms.get(code);
              if (clients) {
                for (const clientId of clients) {
                  const clientSocket = io.sockets.sockets.get(clientId);
                  if (clientSocket) clientSocket.leave(code);
                }
              }
              if (rooms[code].buzzTimeout) clearTimeout(rooms[code].buzzTimeout);
              if (rooms[code].inactivityTimeout) clearTimeout(rooms[code].inactivityTimeout);
              delete rooms[code];
            }
            io.emit('public-rooms-update', getPublicRooms());
          }
        }, 120000); // 2 minutes
        
        publicRoomsChanged = true;
      }
    }
    if (publicRoomsChanged) {
      io.emit('public-rooms-update', getPublicRooms());
    }
  });

  // Re-join as host
  socket.on('rejoin-host', (code) => {
    const room = rooms[code];
    if (room) {
      if (room.hostTimeout) clearTimeout(room.hostTimeout);
      room.host = socket.id;
      room.hostDisconnected = false;
      socket.join(code);
      
      // Emit full state so host screen doesn't reset to LOBBY
      socket.emit('host-rejoined-state', {
        code,
        status: room.status,
        players: Object.entries(room.players).map(([id, p]) => ({
          id,
          name: p.name,
          userId: p.userId || null,
          score: room.scores[id] || 0,
          disconnected: p.disconnected,
          equippedItems: p.equippedItems,
          cards: room.cards?.[id] || { yellow: 0, red: 0 }
        })),
        currentQuestion: room.currentQuestion ? {
          text: room.currentQuestion.text,
          category: room.currentQuestion.category,
          flagImage: room.currentQuestion.flagImage
        } : null,
        answer: room.currentQuestion ? room.currentQuestion.answer : null,
        buzzer: room.buzzer,
      });

      io.to(code).emit('host-rejoined');
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BuzzIt running on http://localhost:${PORT}`);
});
