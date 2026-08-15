require('dotenv').config();

// Render's network resolves Gmail's SMTP host to an IPv6 address it then
// can't route to (ENETUNREACH), silently failing every OTP/reset email that
// hits it. Node 17+ can prefer IPv4 results outright — the officially
// documented fix for exactly this class of failure in containerized hosts.
require('dns').setDefaultResultOrder('ipv4first');

// Explicit opt-in only — must be set to 'true' in a LOCAL .env file (never on the deployed server)
// so solo-testing can never accidentally activate in production.
const ALLOW_SOLO_TEST = process.env.ALLOW_SOLO_TEST === 'true';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const cors = require('cors');
const { saveGameResults } = require('./services/gameService');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { clientIpKey } = require('./middleware/rateLimitKey');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const questionsRoutes = require('./routes/questions');
const storeRoutes = require('./routes/store');
const gameRoutes = require('./routes/game');
const feedbackRoutes = require('./routes/feedback');
const purchasesRoutes = require('./routes/purchases');
const adminRoutes = require('./routes/admin');
const adsRoutes = require('./routes/ads');
const Question = require('./models/Question');
const User = require('./models/User');

connectDB();

const app = express();

// Cloudflare -> Render's load balancer -> here. Without this, req.ip is the
// proxy's address for every request, so all the rate limiters below share one
// bucket across the entire user base. A hop count (not `true`) so a client
// can't prepend its own X-Forwarded-For and pick its own key.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 2));

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(mongoSanitize());

// Global API rate limiter (prevents spam and brute force)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000, // per client IP — an active match burns through requests fast
  keyGenerator: clientIpKey,
  message: { error: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد 15 دقيقة.' }
});
// Mounted above the limiter on purpose. Every AdMob callback arrives from
// Google's own addresses, so they'd all share one bucket and start getting 429s
// under load — and a dropped callback is a player who watched an ad for
// nothing. The signature check in the route is what protects it.
app.use('/api/ads', adsRoutes);

app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/admin', adminRoutes);

// ── Force-update gate ────────────────────────────────────────────────────
// Bump MIN_APP_VERSION when a release must not be skipped (security fix, a
// server change that breaks old clients). Anything below it gets a blocking
// screen in the app. Kept in env so it can change without a redeploy.
const MIN_APP_VERSION = process.env.MIN_APP_VERSION || '1.0.0';
const STORE_URL =
  process.env.STORE_URL || 'https://play.google.com/store/apps/details?id=com.buzzit.game';

app.get('/api/app-config', (req, res) => {
  res.json({
    minVersion: MIN_APP_VERSION,
    storeUrl: STORE_URL,
    // Purely informational — the client decides using minVersion only.
    latestVersion: process.env.LATEST_APP_VERSION || MIN_APP_VERSION,
  });
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.status(200).send('BuzzIt Server is running'));

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

  // Cancel any in-flight round timers so they can't fire after the game has
  // already ended and mutate scores that were already saved to the DB.
  if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }
  if (room.drawRoundTimer) { clearTimeout(room.drawRoundTimer); room.drawRoundTimer = null; }

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

  // Send the current question's answer to the new host so they can view it.
  // Not in written mode — the new judge still plays and must stay blind.
  if (room.currentQuestion && room.currentQuestion.answer && room.config?.answerMode !== 'written') {
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

  // Send the current question's answer to the new host so they can view it.
  // Not in written mode — the new judge still plays and must stay blind.
  if (room.currentQuestion && room.currentQuestion.answer && room.config?.answerMode !== 'written') {
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
  if (room.afkTimer) {
    clearTimeout(room.afkTimer);
    room.afkTimer = null;
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

  // AFK Auto-Skip: If drawer doesn't draw within 15 seconds, penalize and skip
  room.afkTimer = setTimeout(() => {
    const currentRoom = rooms[code];
    if (!currentRoom || currentRoom.drawerId !== drawerId) return;
    
    // Penalize drawer for being AFK
    currentRoom.scores[drawerId] = (currentRoom.scores[drawerId] || 0) - 1;
    io.to(code).emit('draw-scores-updated', { scores: currentRoom.scores });
    io.to(code).emit('draw-chat', {
      playerId: drawerId,
      guess: '💤 تم سحب الدور من الرسام لعدم التفاعل (-1 نقطة)',
      isCorrectGuess: false,
    });
    
    startNextDrawRound(code);
  }, 15000);
}

// In verbal buzzer mode the judge doesn't compete, so they're deliberately kept
// out of room.players (scores, buzzer, leaderboard). That also made them vanish
// from the lobby entirely — they couldn't even see themselves. Send them
// alongside the player list so the lobby can show who's refereeing.
function judgeInfo(room) {
  if (!room || !room.host) return null;
  if (room.players[room.host]) return null; // already listed as a competitor
  return {
    id: room.host,
    name: room.hostName,
    userId: room.hostUserId || null,
    equippedItems: room.hostEquippedItems || null,
  };
}

async function buildMatchStage(room) {
  const categories = room.config?.categories || [];
  const matchStage = {};

  if (room.config?.gameMode === 'trivia' && room.config?.difficulty && room.config.difficulty !== 'mixed') {
    matchStage.difficulty = room.config.difficulty;
  }

  let activeCategories = categories && categories.length > 0 ? categories : null;
  if (activeCategories && activeCategories.length > 1 && room.lastCategory) {
    const filtered = activeCategories.filter(c => c !== room.lastCategory);
    if (filtered.length > 0) activeCategories = filtered;
  }

  if (room.config?.gameMode === 'trivia') {
    matchStage.isCustomTrivia = true;
    if (activeCategories) matchStage.category = { $in: activeCategories };
  } else {
    matchStage.isCustomTrivia = { $ne: true };
    if (activeCategories) matchStage.category = { $in: activeCategories };
  }

  // Written mode is graded by the server, so questions that only a human can
  // score ("sing any song containing X") would reject every answer. Keep them
  // for verbal mode, where the judge actually listens and decides.
  if (room.config?.answerMode === 'written') {
    matchStage.judgeEvaluated = { $ne: true };
  }

  if (room.usedQuestions && room.usedQuestions.length > 0) {
    matchStage._id = { $nin: room.usedQuestions };
  }

  return matchStage;
}

async function fetchOneQuestion(room) {
  if (!room.usedQuestions) room.usedQuestions = [];
  let matchStage = await buildMatchStage(room);

  let count = await Question.countDocuments(matchStage);

  if (count === 0 && room.usedQuestions.length > 0) {
    logDebug(`[Question Pool] All questions used. Resetting pool.`);
    room.usedQuestions = [];
    delete matchStage._id;
    count = await Question.countDocuments(matchStage);
  }

  if (count === 0) return null;

  return Question.findOne(matchStage)
    .skip(Math.floor(Math.random() * count))
    .lean();
}

// Pre-fetch next question in background so it's ready instantly
function prefetchNextQuestion(code) {
  const room = rooms[code];
  if (!room || room.prefetching) return;
  room.prefetching = true;
  room.prefetchedQuestion = null;

  // Build a temporary snapshot of usedQuestions to avoid race conditions
  const usedSnapshot = [...(room.usedQuestions || [])]; 
  const tempRoom = { ...room, usedQuestions: usedSnapshot };

  fetchOneQuestion(tempRoom).then(q => {
    if (rooms[code]) {
      rooms[code].prefetchedQuestion = q || null;
      rooms[code].prefetching = false;
    }
  }).catch(() => {
    if (rooms[code]) rooms[code].prefetching = false;
  });
}

async function fetchAndSendNextQuestion(code) {
  const room = rooms[code];
  if (!room) return false;

  if (!room.usedQuestions) room.usedQuestions = [];

  let question = null;

  // Use pre-fetched question if available
  if (room.prefetchedQuestion) {
    question = room.prefetchedQuestion;
    room.prefetchedQuestion = null;
    // Mark it as used if not already
    if (!room.usedQuestions.some(id => id.toString() === question._id.toString())) {
      room.usedQuestions.push(question._id);
    }
  } else {
    // Fallback: fetch now (first question of a game)
    try {
      question = await fetchOneQuestion(room);
      if (question) room.usedQuestions.push(question._id);
    } catch (err) {
      console.error('Failed to get next question:', err);
      io.to(room.host).emit('error', 'حدث خطأ أثناء تحميل السؤال!');
      setTimeout(() => triggerEndGame(code), 2000);
      return false;
    }
  }

  if (!question) {
    io.to(room.host).emit('error', 'لم يتم العثور على أسئلة في التصنيفات المحددة!');
    setTimeout(() => triggerEndGame(code), 2000);
    return false;
  }

  room.currentQuestion = question;
  room.lastCategory = question.category;
  room.answerRevealed = false;
  room.appealWindow = null;
  room.appeal = null;
  room.questionOver = false;
  room.rejected = [];
  if (room.appealTimer) { clearTimeout(room.appealTimer); room.appealTimer = null; }
  if (room.nextQuestionTimer) { clearTimeout(room.nextQuestionTimer); room.nextQuestionTimer = null; }
  if (room.skipVotes) room.skipVotes.clear();
  if (room.appealTimer) { clearTimeout(room.appealTimer); room.appealTimer = null; }
  room.buzzedAnswer = null;
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
  });

  // Written mode and trivia have no judge pacing the round, so the flag —
  // which IS the question — has to be visible right away. Verbal buzzer mode
  // keeps it judge-controlled: they hold it back and reveal it on purpose,
  // which is when the buzzer race actually starts.
  if (question.flagImage && (room.config?.gameMode === 'trivia' || room.config?.answerMode === 'written')) {
    io.to(code).emit('image-revealed', question.flagImage);
  }

  // In written mode the judge plays too, so the answer must NOT be pushed to them
  // up front — the server grades, and the answer only reaches the judge once
  // somebody has answered (which locks the judge out of the question).
  if (room.config?.answerMode !== 'written') {
    io.to(room.host).emit('reveal-answer-updated', { answer: question.answer });
  } else {
    io.to(room.host).emit('reveal-answer-updated', { answer: null });
  }
  io.to(code).emit('buzz-reset');

  if (room.config?.gameMode === 'trivia') {
    room.evaluatingTrivia = false;
    if (timeLimit > 0) {
      room.triviaTimer = setTimeout(() => evaluateTriviaRound(code), (timeLimit * 1000) + 2000);
    }
  }

  // Start pre-fetching the NEXT question immediately in the background
  prefetchNextQuestion(code);

  return true;
}

// How long a rejected player may contest, and how long the room has to vote.
// The window is generous on purpose: the player has to read their answer, read
// the correct one, and decide. It closes on its own when the next question
// starts, so a long window costs nothing.
const APPEAL_WINDOW_MS = 5000;
const APPEAL_VOTE_MS = 15000;
// How long everyone gets to read the answer when nobody can contest it.
const RESULT_HOLD_MS = 3000;

// Closes the current question: locks the buzzer, shows everyone the answer, and
// only then lets anyone who was rejected during it ask for a re-think. Doing the
// appeal here rather than mid-question is what stops a player from torching a
// question for the whole room just by typing nonsense and contesting it.
function endQuestion(code, { winnerName = null } = {}) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.questionOver) return;

  room.questionOver = true;
  if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
  room.buzzer = null;
  if (room.skipVotes) room.skipVotes.clear();

  const correctAnswer = room.currentQuestion?.answer || null;
  io.to(code).emit('question-ended', { correctAnswer, winnerName });

  // Anyone whose near-miss was rejected this round may now contest it. The
  // answer is already public, so a vote gives nobody an advantage.
  const contestable = (room.rejected || []).filter(
    (r) => r.contestable && room.players[r.playerId] && !room.players[r.playerId].disconnected
  );
  if (contestable.length > 0) {
    room.appealWindow = { entries: contestable, expiresAt: Date.now() + APPEAL_WINDOW_MS };
    for (const r of contestable) {
      io.to(r.playerId).emit('appeal-available', { durationMs: APPEAL_WINDOW_MS });
    }
  }

  const hold = contestable.length > 0 ? APPEAL_WINDOW_MS : RESULT_HOLD_MS;
  room.nextQuestionTimer = setTimeout(() => {
    const r = rooms[code];
    if (!r || r.status !== 'PLAYING') return;
    if (r.appeal) return; // a vote is running; resolveAppeal will advance
    fetchAndSendNextQuestion(code);
  }, hold);
}

// Nobody has authority over the question in written mode (the judge competes
// like everyone else), so the room itself votes to move on when a question has
// beaten them all. Without this a hard question deadlocks the game forever.
function checkSkip(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || !room.skipVotes) return;

  const active = Object.entries(room.players).filter(([, p]) => !p.disconnected).length;
  if (active === 0) return;

  // Votes from players who already left don't count towards the majority.
  for (const id of [...room.skipVotes]) {
    if (!room.players[id] || room.players[id].disconnected) room.skipVotes.delete(id);
  }

  const needed = Math.floor(active / 2) + 1;
  io.to(code).emit('skip-vote-update', { votes: room.skipVotes.size, needed });

  if (room.skipVotes.size >= needed) {
    io.to(code).emit('question-skipped', { answer: room.currentQuestion?.answer || null });
    endQuestion(code);
  }
}

// Majority of the other players can overturn the server's rejection. Because
// the answer is already public by this point, nobody gains an edge by voting —
// which is what lets the room's judge stay an ordinary player.
async function resolveAppeal(code) {
  const room = rooms[code];
  if (!room || !room.appeal) return;

  const appeal = room.appeal;
  room.appeal = null;
  if (room.appealTimer) { clearTimeout(room.appealTimer); room.appealTimer = null; }

  const values = Object.values(appeal.votes);
  const yes = values.filter(Boolean).length;
  const no = values.length - yes;
  const accepted = yes > no;

  io.to(code).emit('appeal-result', {
    accepted,
    yes,
    no,
    playerName: appeal.playerName,
    playerAnswer: appeal.playerAnswer,
  });

  if (accepted) {
    // Undo the -1 they took and award the +1 they should have had.
    room.scores[appeal.playerId] = (room.scores[appeal.playerId] || 0) + 2;
    room.wrong[appeal.playerId] = Math.max(0, (room.wrong[appeal.playerId] || 0) - 1);
    room.correct[appeal.playerId] = (room.correct[appeal.playerId] || 0) + 1;

    io.to(code).emit('score-update', {
      id: appeal.playerId,
      name: room.players[appeal.playerId]?.name,
      score: room.scores[appeal.playerId],
      delta: 2,
      scores: room.scores,
      players: Object.fromEntries(Object.entries(room.players).map(([id, p]) => [id, p.name])),
    });
  }

  // The question was already over before the vote started, so just let the
  // room read the outcome and move on.
  room.nextQuestionTimer = setTimeout(() => {
    if (rooms[code] && rooms[code].status === 'PLAYING') fetchAndSendNextQuestion(code);
  }, 3000);
}

// Award (or deduct) points for the current buzz and move the round on.
// Shared by the judge's manual grading and the server's own auto-verdict.
async function applyPoint(code, playerId, points) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING') return;

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
    await triggerEndGame(code);
  } else if (isBuzzedCorrect) {
    if (room.config?.judgeMode === 'rotating') {
      rotateHost(code);
    }
    if (room.config?.answerMode === 'written') {
      endQuestion(code, { winnerName: room.players[playerId]?.name || null });
    } else {
      await fetchAndSendNextQuestion(code);
    }
  } else {
    io.to(code).emit('buzz-reset');
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
      chatMessages: [],
    };

    const isPlayingHost = config?.gameMode === 'trivia' || config?.gameMode === 'draw' || (config?.gameMode === 'buzzer' && config?.answerMode === 'written');
    if (isPlayingHost) {
      rooms[code].players[socket.id] = { name: hostName || 'Unknown Host', userId: hostUserId || null, disconnected: false, equippedItems: hostEquippedItems || null };
      rooms[code].scores[socket.id] = 0;
      rooms[code].correct[socket.id] = 0;
      rooms[code].wrong[socket.id] = 0;
      rooms[code].cards[socket.id] = { yellow: 0, red: 0 };
    }

    socket.join(code);
    socket.emit('room-created', code);
    
    // Immediately sync the host with the exact room state so they appear in their own lobby accurately
    const playersList = Object.entries(rooms[code].players).map(([id, p]) => ({
      id,
      name: p.name,
      userId: p.userId || null,
      score: rooms[code].scores[id] || 0,
      disconnected: p.disconnected,
      equippedItems: p.equippedItems,
      cards: rooms[code].cards?.[id] || { yellow: 0, red: 0 }
    }));
    socket.emit('joined-room', {
      code,
      players: playersList,
      status: rooms[code].status,
      config: rooms[code].config,
      hostId: rooms[code].host,
      judge: judgeInfo(rooms[code])
    });
    
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
      if (reconnectingId !== socket.id) {
        // Move old player data to new socket.id
        room.players[socket.id] = room.players[reconnectingId];
        room.scores[socket.id] = room.scores[reconnectingId] || 0;
        room.correct[socket.id] = room.correct[reconnectingId] || 0;
        room.wrong[socket.id] = room.wrong[reconnectingId] || 0;
        if (!room.cards) room.cards = {};
        room.cards[socket.id] = room.cards[reconnectingId] || { yellow: 0, red: 0 };

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

        delete room.players[reconnectingId];
        delete room.scores[reconnectingId];
        delete room.correct[reconnectingId];
        delete room.wrong[reconnectingId];
        delete room.cards[reconnectingId];
      }

      room.players[socket.id].disconnected = false;
      room.players[socket.id].name = playerName; // Update name just in case
      room.players[socket.id].equippedItems = equippedItems || room.players[socket.id].equippedItems;

      if (room.buzzer === reconnectingId) room.buzzer = socket.id;
      if (room.drawerId === reconnectingId) room.drawerId = socket.id;

      // Written mode remembers rejected/appealable answers by socket id — remap
      // them too, or a mid-question reconnect silently kills that player's appeal.
      if (room.rejected) {
        for (const r of room.rejected) {
          if (r.playerId === reconnectingId) r.playerId = socket.id;
        }
      }
      if (room.appealWindow) {
        for (const r of room.appealWindow.entries) {
          if (r.playerId === reconnectingId) r.playerId = socket.id;
        }
      }
      if (room.appeal?.playerId === reconnectingId) room.appeal.playerId = socket.id;
      
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

      socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config, hostId: room.host, judge: judgeInfo(room) });
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

    socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config, hostId: room.host, judge: judgeInfo(room) });
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
    room.frozenPlayers = new Set();

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
    // Only the judge starts the match — otherwise any player could force it.
    if (room.host !== socket.id) return;

    // Require at least 2 active players to start (Production rule) — skipped only with explicit ALLOW_SOLO_TEST=true
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    if (!ALLOW_SOLO_TEST && activePlayersCount < 2) {
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

    const meetsMinPlayers = ALLOW_SOLO_TEST || activePlayersCount >= 2;
    if (meetsMinPlayers && room.votesToPlayAgain.size > Math.floor(activePlayersCount / 2)) {
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
    // The answer is on everyone's screen now — no late buzzing.
    if (room.questionOver) return;

    // Fixed-judge host is allowed to also play — first time they buzz,
    // register them as a scoring player so their score counts and shows
    // in the leaderboard/results like anyone else's.
    if (room.config?.judgeMode === 'host' && socket.id === room.host && !room.players[socket.id] && room.config?.answerMode === 'written') {
      room.players[socket.id] = { name: room.hostName, userId: room.hostUserId || null, disconnected: false, equippedItems: room.hostEquippedItems || null };
      room.scores[socket.id] = room.scores[socket.id] || 0;
      room.correct[socket.id] = room.correct[socket.id] || 0;
      room.wrong[socket.id] = room.wrong[socket.id] || 0;
      if (!room.cards) room.cards = {};
      room.cards[socket.id] = room.cards[socket.id] || { yellow: 0, red: 0 };
      io.to(code).emit('player-joined', {
        id: socket.id,
        name: room.hostName,
        score: room.scores[socket.id],
        equippedItems: room.hostEquippedItems || null,
        cards: room.cards[socket.id],
        userId: room.hostUserId || null,
      });
    }

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

  // Room Chat Event
  socket.on('send-room-chat', ({ code, text }) => {
    if (!code || !text || typeof text !== 'string' || !text.trim()) return;
    const room = rooms[code];
    if (!room) return;

    const player = room.players[socket.id];
    const isHost = room.host === socket.id;
    if (!player && !isHost) return;

    const senderName = player ? player.name : room.hostName;
    const equippedItems = player ? player.equippedItems : room.hostEquippedItems;

    const msgObj = {
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      senderId: socket.id,
      senderName: senderName || 'لاعب',
      equippedItems,
      text: text.trim().slice(0, 150),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    room.chatMessages.push(msgObj);
    io.to(code).emit('room-chat-received', msgObj);
  });

  // Submit Buzzer Answer Event (Remote/Written Play)
  socket.on('submit-buzzer-answer', ({ code, answer }) => {
    if (!code || !answer) return;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING') return;

    if (room.buzzer !== socket.id) return;

    const trimmedAnswer = answer.trim();
    room.buzzedAnswer = trimmedAnswer;

    // Broadcast to everyone so host sees the written answer
    io.to(code).emit('buzzer-answer-submitted', {
      playerId: socket.id,
      name: room.players[socket.id]?.name || 'لاعب',
      answer: trimmedAnswer
    });

    // Written mode: the server is the sole judge. Nobody — including the room's
    // judge — sees the correct answer early, so everyone competes on equal terms.
    if (room.config?.answerMode === 'written' && room.currentQuestion?.answer) {
      const isCorrect = answersMatch(
        trimmedAnswer,
        room.currentQuestion.answer,
        room.currentQuestion.acceptedAnswers
      );

      const playerName = room.players[socket.id]?.name || 'لاعب';

      // Everyone sees who answered and what they wrote. The correct answer is
      // NOT sent while the question is still live — a wrong answer reopens the
      // buzzer, so shipping the answer would hand it to the next player.
      io.to(code).emit('buzzer-auto-judged', {
        playerId: socket.id,
        playerName,
        playerAnswer: trimmedAnswer,
        isCorrect,
        correctAnswer: isCorrect ? room.currentQuestion.answer : undefined,
      });

      if (!isCorrect) {
        // Remember the attempt. Contesting it happens once the question is over
        // — appealing mid-question would let anyone burn it for the whole room.
        if (!room.rejected) room.rejected = [];
        room.rejected.push({
          playerId: socket.id,
          playerName,
          playerAnswer: trimmedAnswer,
          // Only near-misses are worth a vote; gibberish isn't contestable.
          contestable: isNearMiss(trimmedAnswer, room.currentQuestion.answer, room.currentQuestion.acceptedAnswers),
        });
      }

      applyPoint(code, socket.id, isCorrect ? 1 : -1);
    }
  });

  // Anyone stuck on a question can ask the room to move on.
  socket.on('vote-skip', (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING') return;
    if (room.config?.answerMode !== 'written') return; // verbal mode: the judge decides
    if (room.questionOver || room.appeal) return;
    if (room.buzzer) return; // someone's mid-answer — let them finish first
    if (!room.players[socket.id]) return; // only competitors vote

    if (!room.skipVotes) room.skipVotes = new Set();
    if (room.skipVotes.has(socket.id)) {
      room.skipVotes.delete(socket.id); // tapping again takes the vote back
    } else {
      room.skipVotes.add(socket.id);
    }
    checkSkip(code);
  });

  // Drawer wants to skip the current word (costs 1 point)
  socket.on('skip-draw-word', (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'draw') return;
    if (socket.id !== room.drawerId) return; // Only drawer can skip

    // Deduct 1 point penalty from drawer
    room.scores[socket.id] = (room.scores[socket.id] || 0) - 1;
    io.to(code).emit('draw-scores-updated', { scores: room.scores });
    
    io.to(code).emit('draw-chat', {
      playerId: socket.id,
      guess: '🔄 قام الرسام بتغيير الكلمة (-1 نقطة)!',
      isCorrectGuess: false,
    });
    
    // Start a new draw round immediately
    startNextDrawRound(code);
  });

  // A player whose answer the server rejected asks the room to overrule it.
  socket.on('appeal-answer', (code) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.appeal) return;
    // Only valid in the window after a question has ended.
    if (!room.questionOver) return;

    const w = room.appealWindow;
    if (!w || Date.now() > w.expiresAt) return;

    const entry = w.entries.find((e) => e.playerId === socket.id);
    if (!entry) return; // this player had nothing rejected, or it wasn't close

    // One shot each: remove them so the same player can't re-open a vote.
    w.entries = w.entries.filter((e) => e.playerId !== socket.id);

    // Everyone eligible to vote = every connected player except the appellant.
    const voters = Object.entries(room.players)
      .filter(([id, p]) => !p.disconnected && id !== socket.id)
      .map(([id]) => id);
    if (voters.length === 0) return; // nobody to arbitrate

    if (room.nextQuestionTimer) { clearTimeout(room.nextQuestionTimer); room.nextQuestionTimer = null; }

    room.appeal = {
      playerId: entry.playerId,
      playerName: entry.playerName,
      playerAnswer: entry.playerAnswer,
      correctAnswer: room.currentQuestion?.answer || null,
      votes: {},
      voters,
    };

    io.to(code).emit('appeal-started', {
      playerId: room.appeal.playerId,
      playerName: room.appeal.playerName,
      playerAnswer: room.appeal.playerAnswer,
      correctAnswer: room.appeal.correctAnswer,
      durationMs: APPEAL_VOTE_MS,
      voterCount: voters.length,
    });

    room.appealTimer = setTimeout(() => resolveAppeal(code), APPEAL_VOTE_MS);
  });

  socket.on('appeal-vote', ({ code, agree }) => {
    const room = rooms[code];
    if (!room || !room.appeal) return;
    if (!room.appeal.voters.includes(socket.id)) return;
    if (room.appeal.votes[socket.id] !== undefined) return;

    room.appeal.votes[socket.id] = !!agree;
    io.to(code).emit('appeal-vote-update', {
      voted: Object.keys(room.appeal.votes).length,
      total: room.appeal.voters.length,
    });

    if (Object.keys(room.appeal.votes).length >= room.appeal.voters.length) {
      resolveAppeal(code);
    }
  });

  // الحكم بيدي نقطة
  socket.on('give-point', async ({ code, playerId, points }) => {
    console.log(`Server received give-point: code=${code}, playerId=${playerId}, points=${points}`);
    const room = rooms[code];
    if (!room) {
      console.log(`give-point error: Room ${code} not found`);
      return;
    }
    if (room.host !== socket.id) return;
    if (room.status !== 'PLAYING') {
      console.log(`give-point error: Room status is ${room.status}, not PLAYING`);
      return;
    }
    if (room.evaluatingManual) return;

    // In written mode the server is the sole judge and the host is an ordinary
    // competitor — letting them hand out points would let them award themselves.
    if (room.config?.answerMode === 'written') {
      console.log(`give-point rejected: server is the sole judge in written mode`);
      return;
    }

    room.evaluatingManual = true;

    try {
      await applyPoint(code, playerId, points);
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
    if (room.host !== socket.id) return;
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
    if (!room || room.host !== socket.id || room.status !== 'PLAYING') return;
    // A competing judge must not be able to wipe a rival's score (or reset
    // their own negative one) — reset is a moderation tool, not a play move.
    if (room.config?.answerMode === 'written') return;

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
    if (!room || room.host !== socket.id || room.status !== 'PLAYING') return;

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
    if (!room || room.host !== socket.id || !room.currentQuestion) return;

    // Blocked in written mode: the judge is an ordinary player there, and the
    // server grades on its own, so nobody gets an early look at the answer.
    if (room.config?.answerMode === 'written') return;

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

    // If everyone still able to answer has answered (frozen players can never
    // submit this round, so they shouldn't hold up early evaluation), evaluate immediately
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    const frozenCount = room.frozenPlayers ? room.frozenPlayers.size : 0;
    if (Object.keys(room.triviaAnswers).length >= (activePlayersCount - frozenCount)) {
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

    // Handle freeze lifeline effect — only freeze players who haven't answered yet
    if (type === 'freeze') {
      const freezerName = room.players[socket.id]?.name || 'لاعب';
      const alreadyAnswered = new Set(Object.keys(room.triviaAnswers || {}));
      if (!room.frozenPlayers) room.frozenPlayers = new Set();
      Object.keys(room.players).forEach(playerId => {
        if (playerId !== socket.id && !alreadyAnswered.has(playerId)) {
          room.frozenPlayers.add(playerId);
          io.to(playerId).emit('player-frozen', freezerName);
        }
      });

      // Frozen players can never submit an answer this round — if everyone
      // who's still able to answer already has, evaluate immediately instead
      // of waiting for the full timer to expire.
      const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
      const answerableCount = activePlayersCount - room.frozenPlayers.size;
      if (Object.keys(room.triviaAnswers || {}).length >= answerableCount) {
        evaluateTriviaRound(code);
      }
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
    // Only the active drawer may draw — otherwise anyone can scribble over the round.
    if (!room || room.drawerId !== socket.id) return;
    
    // Drawer is active, clear AFK timer
    if (room.afkTimer) {
      clearTimeout(room.afkTimer);
      room.afkTimer = null;
    }

    if (!room.drawStrokes) room.drawStrokes = [];
    room.drawStrokes.push(stroke);
    socket.to(code).emit('draw-update', stroke);
  });

  // Real-time live stroke broadcast (throttled on client, ~30fps)
  socket.on('draw-stroke-live', (data) => {
    const { code, stroke } = data;
    const room = rooms[code];
    if (!room || room.drawerId !== socket.id) return;
    socket.to(code).emit('draw-update-live', stroke); // stroke is null to clear, or object to show
  });

  socket.on('clear-canvas', (code) => {
    const room = rooms[code];
    // Only the active drawer (or the judge) may wipe the canvas.
    if (!room || (room.drawerId !== socket.id && room.host !== socket.id)) return;
    room.drawStrokes = [];
    socket.to(code).emit('canvas-cleared');
  });

// ── Answer matching ──────────────────────────────────────────────
// The server is the only judge in written mode, so this has to be forgiving
// enough that a typo doesn't rob a player, but strict enough that it never
// accepts a genuinely different word. A silent false accept is worse than a
// false reject: nobody notices it, and there's no appeal against a point you
// were wrongly *given*.

// Letters people mix up when typing fast. Applied ONLY to longer answers —
// on short words a single substitution flips the meaning entirely
// (قلب/كلب, تين/طين, سيف/صيف), so we never touch anything under 6 chars.
function phoneticCanon(str) {
  return str
    .replace(/[ظذ]/g, 'ز')
    .replace(/ص/g, 'س')
    .replace(/ط/g, 'ت')
    .replace(/ض/g, 'د');
}

function stripDefiniteArticle(str) {
  return str.startsWith('ال') && str.length > 3 ? str.slice(2) : str;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

// Was the answer at least in the right neighbourhood? Only these are worth
// putting to a vote — otherwise anyone could type gibberish and force the room
// to arbitrate it.
function isNearMiss(playerAnswer, correctAnswer, accepted = []) {
  const p = stripDefiniteArticle(normalizeArabic(playerAnswer));
  if (!p) return false;

  for (const candidate of [correctAnswer, ...(accepted || [])].filter(Boolean)) {
    const c = stripDefiniteArticle(normalizeArabic(candidate));
    if (!c) continue;
    const len = Math.max(p.length, c.length);
    // Allow roughly a third of the word to be wrong before we call it unrelated.
    const tolerance = Math.max(2, Math.ceil(len * 0.34));
    if (levenshtein(phoneticCanon(p), phoneticCanon(c)) <= tolerance) return true;
  }
  return false;
}

// `accepted` lets a question declare extra valid answers (e.g. "مصر" and
// "جمهورية مصر العربية"). Curated alternatives are always safer than fuzzing.
function answersMatch(playerAnswer, correctAnswer, accepted = []) {
  const player = normalizeArabic(playerAnswer);
  if (!player) return false;

  const candidates = [correctAnswer, ...(accepted || [])].filter(Boolean);

  for (const candidate of candidates) {
    const target = normalizeArabic(candidate);
    if (!target) continue;

    if (player === target) return true;

    const p = stripDefiniteArticle(player);
    const c = stripDefiniteArticle(target);
    if (p === c) return true;

    // Everything below is fuzzy, so it stays off for short answers.
    const len = Math.max(p.length, c.length);
    if (len < 6) continue;

    const pc = phoneticCanon(p);
    const cc = phoneticCanon(c);
    if (pc === cc) return true;

    const tolerance = len >= 9 ? 2 : 1;
    if (levenshtein(pc, cc) <= tolerance) return true;
  }

  return false;
}

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
  // 5. Arabic-Indic (٠-٩) and Persian (۰-۹) digits count as the plain ones,
  //    so "٢٠٦" and "206" are the same answer either way round.
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  str = str.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  // 6. Arabic comma/decimal separators used inside numbers
  str = str.replace(/٫/g, '.').replace(/٬/g, '');
  // 7. Clean up extra spaces
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
    // Only actual competitors score, otherwise a spectator creates a phantom entry
    if (!room.players[playerId]) return;

    // Same forgiving comparison the buzzer mode uses, so a typo doesn't cost the
    // round — and worse, get broadcast to everyone as a near-miss they can copy.
    // Short words still need an exact match, so "بيت"/"بنت" stay distinct.
    if (answersMatch(guess, room.currentDrawWord)) {
      // Correct guess!
      const points = 2; // Fixed 2 points for a correct guess (balanced with standard 10-point win score)

      room.scores[playerId] = (room.scores[playerId] || 0) + points;
      room.correctGuessers.add(playerId);
      room.correct[playerId] = (room.correct[playerId] || 0) + 1;

      // Reward the drawer too! 1 point for every correct guesser
      const drawerReward = 1;
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
      const isPlayer = !!room.players[socket.id];
      const isHost = room.host === socket.id;

      if (isPlayer) {
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

        // One player fewer means a lower majority — a pending skip vote may
        // already have passed, so don't let a departure deadlock the room.
        if (room.status === 'PLAYING' && room.skipVotes && room.skipVotes.size > 0) {
          checkSkip(code);
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
      }

      // Checked independently of isPlayer: in trivia/draw the host is also
      // added to room.players, so both branches must be able to run —
      // otherwise a host-who-is-a-player disconnecting never starts the
      // host-reconnect timer, and the room never gets cleaned up (BUG: ghost rooms).
      if (isHost) {
        // Host disconnected - wait for them to reconnect
        room.hostDisconnected = true;
        io.to(code).emit('host-disconnected');

        // Render's free tier sleeps after 15 idle minutes and takes up to ~50s
        // to wake — a host backgrounding the app (e.g. to check WhatsApp) could
        // hit that cold start on the way back. 20s used to expire the room
        // before reconnection even finished; 75s comfortably outlasts the
        // worst-case wake time plus the socket handshake after it.
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
        }, 75000); // 75 seconds

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

      const previousHostId = room.host;
      const participatingHostId = room.players[previousHostId]
        ? previousHostId
        : Object.keys(room.players).find((id) => (
          room.hostUserId && String(room.players[id].userId) === String(room.hostUserId)
        ));

      // In trivia, draw and written-buzzer modes the host is also a scored
      // player. Socket.IO assigns a new id after reconnecting, so migrate every
      // piece of player state instead of leaving a ghost with the old score and
      // treating the new host as a zero-score player.
      if (participatingHostId && participatingHostId !== socket.id) {
        if (!room.cards) room.cards = {};
        room.players[socket.id] = room.players[participatingHostId];
        room.players[socket.id].disconnected = false;
        room.players[socket.id].name = room.hostName;
        room.players[socket.id].userId = room.hostUserId || room.players[socket.id].userId || null;
        room.players[socket.id].equippedItems = room.hostEquippedItems || room.players[socket.id].equippedItems || null;
        room.scores[socket.id] = room.scores[participatingHostId] || 0;
        room.correct[socket.id] = room.correct[participatingHostId] || 0;
        room.wrong[socket.id] = room.wrong[participatingHostId] || 0;
        room.cards[socket.id] = room.cards?.[participatingHostId] || { yellow: 0, red: 0 };

        for (const stateMap of [room.triviaAnswers, room.usedLifelines, room.lifelines]) {
          if (stateMap?.[participatingHostId]) {
            stateMap[socket.id] = stateMap[participatingHostId];
            delete stateMap[participatingHostId];
          }
        }

        if (room.buzzer === participatingHostId) room.buzzer = socket.id;
        if (room.drawerId === participatingHostId) room.drawerId = socket.id;
        if (room.votesToPlayAgain?.delete(participatingHostId)) room.votesToPlayAgain.add(socket.id);
        if (room.correctGuessers?.delete(participatingHostId)) room.correctGuessers.add(socket.id);
        if (room.drawnPlayers) {
          room.drawnPlayers = room.drawnPlayers.map((id) => id === participatingHostId ? socket.id : id);
        }
        for (const rejected of room.rejected || []) {
          if (rejected.playerId === participatingHostId) rejected.playerId = socket.id;
        }
        for (const entry of room.appealWindow?.entries || []) {
          if (entry.playerId === participatingHostId) entry.playerId = socket.id;
        }
        if (room.appeal?.playerId === participatingHostId) room.appeal.playerId = socket.id;

        delete room.players[participatingHostId];
        delete room.scores[participatingHostId];
        delete room.correct[participatingHostId];
        delete room.wrong[participatingHostId];
        delete room.cards[participatingHostId];
      }

      room.host = socket.id;
      room.hostDisconnected = false;
      socket.join(code);
      
      // Emit full state so host screen doesn't reset to LOBBY
      socket.emit('host-rejoined-state', {
        code,
        status: room.status,
        hostId: room.host,
        config: room.config,
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
        // Written mode: the judge plays like everyone else, so reconnecting
        // must never hand them the answer.
        answer: room.currentQuestion && room.config?.answerMode !== 'written'
          ? room.currentQuestion.answer
          : null,
        buzzer: room.buzzer,
      });

      if (room.players[socket.id]) {
        io.to(code).emit('player-rejoined', {
          id: socket.id,
          name: room.players[socket.id].name,
          userId: room.players[socket.id].userId || null,
          score: room.scores[socket.id] || 0,
          equippedItems: room.players[socket.id].equippedItems,
          cards: room.cards?.[socket.id] || { yellow: 0, red: 0 },
        });
      }

      io.to(code).emit('host-rejoined');
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BuzzIt running on http://localhost:${PORT}`);
});
