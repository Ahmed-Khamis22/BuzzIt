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
const {
  getPredictTotalRounds,
  getEscapingTeam,
  getPredictMaxPlayers,
  haveAllActivePredictPlayersAnswered,
  migratePredictPlayerId,
  validatePredictTeamSetup,
  canAssignPredictTeam,
  evaluatePredictRound,
} = require('./services/predictGame');
const { aiJudge } = require('./services/aiJudge');
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
const soloGameRoutes = require('./routes/soloGameRoutes');
const Question = require('./models/Question');
const User = require('./models/User');
const CommunityMessage = require('./models/CommunityMessage');
const AppSettings = require('./models/AppSettings');
const jwt = require('jsonwebtoken');
const syncFlagQuestions = require('./services/flagQuestionSync');
const syncQuestionCorrections = require('./services/questionCorrectionSync');
const syncSoloGameQuestions = require('./services/soloQuestionSync');

connectDB()
  .then(() => Promise.all([syncFlagQuestions(), syncQuestionCorrections(), syncSoloGameQuestions()]))
  .catch((error) => console.error('Question sync failed:', error.message));

const app = express();

// Cloudflare -> Render's load balancer -> here. Without this, req.ip is the
// proxy's address for every request, so all the rate limiters below share one
// bucket across the entire user base. A hop count (not `true`) so a client
// can't prepend its own X-Forwarded-For and pick its own key.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 2));

app.use(helmet({ contentSecurityPolicy: false }));
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

app.use('/admin', express.static(require('path').join(__dirname, 'public')));
app.get('/privacy-policy', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'privacy-policy.html'));
});
app.get('/admin*', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

app.use('/api/solo-game', soloGameRoutes);
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

app.get('/api/app-config', async (req, res) => {
  try {
    const settings = await AppSettings.findOne({ key: 'global' }).lean();
    res.json({
      minVersion: settings?.minVersion || MIN_APP_VERSION,
      storeUrl: settings?.storeUrl || STORE_URL,
      latestVersion: settings?.latestVersion || process.env.LATEST_APP_VERSION || MIN_APP_VERSION,
      maintenanceEnabled: settings?.maintenanceEnabled || false,
      maintenanceMessage: settings?.maintenanceMessage || '',
    });
  } catch {
    res.json({ minVersion: MIN_APP_VERSION, storeUrl: STORE_URL, latestVersion: process.env.LATEST_APP_VERSION || MIN_APP_VERSION, maintenanceEnabled: false });
  }
});

app.get('/api/ai/status', async (req, res) => {
  try {
    const status = await aiJudge.getStatus({ probe: true });
    res.json({ judging: status });
  } catch {
    res.json({ judging: { available: false, reason: 'PROVIDERS_UNAVAILABLE', providers: [] } });
  }
});

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.status(200).send('BuzzIt Server is running'));

const server = http.createServer(app);
const io = new Server(server);

const rooms = {};
const codenames = require('./services/codenamesGame').createCodenamesService({
  io, rooms, migrateHost, saveResults: saveGameResults,
  publicUpdate: () => io.emit('public-rooms-update', getPublicRooms()),
});
const connectedUsers = new Map();
const PREDICT_AI_TAKEOVER_GRACE_MS = 10_000;
// A small beta guard keeps an unexpected public spike from slowing every
// active match on a single free Render instance. Set to a higher number in
// Render once the service has been upgraded and load-tested.
const MAX_ACTIVE_MULTIPLAYER_PLAYERS = Math.max(1, Number(process.env.MAX_ACTIVE_MULTIPLAYER_PLAYERS) || 50);

function activeMultiplayerParticipantIds() {
  const participants = new Set();
  for (const room of Object.values(rooms)) {
    if (!room || !['LOBBY', 'PLAYING'].includes(room.status)) continue;
    if (room.host && !room.hostDisconnected) participants.add(room.host);
    for (const [playerId, player] of Object.entries(room.players || {})) {
      if (!player.disconnected) participants.add(playerId);
    }
  }
  return participants;
}

function hasMultiplayerCapacityFor(socketId) {
  const activeParticipants = activeMultiplayerParticipantIds();
  return activeParticipants.has(socketId) || activeParticipants.size < MAX_ACTIVE_MULTIPLAYER_PLAYERS;
}

function multiplayerCapacityMessage() {
  return `السيرفر التجريبي مشغول حاليًا (${MAX_ACTIVE_MULTIPLAYER_PLAYERS} لاعب). جرّب بعد دقائق.`;
}

// REST routes (friend requests) and Socket.IO share the same live-user
// registry. Requests are still persisted in MongoDB; this is only the
// immediate in-app notification path for users who are currently online.
app.set('realtime', { io, connectedUsers });

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.authUserId = String(decoded.userId);
    socket.userId = socket.authUserId;
  } catch {
    socket.authUserId = null;
  }
  next();
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function getPublicRooms() {
  const publicRooms = [];
  for (const code in rooms) {
    const room = rooms[code];
    if ((room.status === 'LOBBY' || room.status === 'PLAYING') && !room.config?.isPrivate) {
      const maxPlayers = room.config?.gameMode === 'predict'
        ? getPredictMaxPlayers(room.config)
        : room.config?.gameMode === 'codenames'
          ? ([4, 6, 8].includes(Number(room.config?.maxPlayers)) ? Number(room.config.maxPlayers) : 8)
          : 8;
      const playerCount = ['predict', 'codenames'].includes(room.config?.gameMode)
        ? Object.keys(room.players).length
        : Object.values(room.players).filter((player) => !player.disconnected).length;
      const supportsMidGameJoin = ['buzzer', 'trivia', 'draw'].includes(room.config?.gameMode || 'buzzer');
      publicRooms.push({
        code,
        hostName: room.hostName,
        playerCount,
        maxPlayers,
        isFull: playerCount >= maxPlayers,
        joinable: playerCount < maxPlayers && (room.status === 'LOBBY' || supportsMidGameJoin),
        status: room.status,
        config: room.config || {},
      });
    }
  }
  return publicRooms;
}

const ROOM_TIMER_KEYS = [
  'buzzTimeout', 'triviaTimer', 'drawRoundTimer', 'drawDrawerDisconnectTimer', 'predictTimer', 'afkTimer',
  'appealTimer', 'nextQuestionTimer', 'hostTimeout', 'inactivityTimeout',
  'codenamesTimer', 'codenamesPauseTimer', 'codenamesCleanupTimer',
];

function clearRoomTimers(room) {
  if (!room) return;
  for (const key of ROOM_TIMER_KEYS) {
    if (room[key]) clearTimeout(room[key]);
    room[key] = null;
  }
  for (const timer of Object.values(room.predictAiTakeoverTimers || {})) clearTimeout(timer);
  room.predictAiTakeoverTimers = {};
  room.questionPrefetchGeneration = (room.questionPrefetchGeneration || 0) + 1;
  room.prefetching = false;
  room.prefetchPromise = null;
  room.prefetchedQuestion = null;
}

async function triggerEndGame(code, payload = {}) {
  const room = rooms[code];
  if (!room || room.status === 'RESULTS') return;

  // Cancel any in-flight round timers so they can't fire after the game has
  // already ended and mutate scores that were already saved to the DB.
  clearRoomTimers(room);

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
  let xpEarnedMap = {};
  let newAchievementsMap = {};
  try {
    const results = await saveGameResults(code, room);
    if (results) {
      coinsEarnedMap = results.coinsEarnedMap || {};
      xpEarnedMap = results.xpEarnedMap || {};
      newAchievementsMap = results.newAchievementsMap || {};
    }
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
        coinsEarned: coinsEarnedMap[p.userId] || 0,
        xpEarned: xpEarnedMap[p.userId] || 0,
        team: room.predictTeams?.[id] || null
      }
    ])
  );

  room.gameSummary = {
    roomCode: code,
    hostUserId: room.hostUserId || null,
    scores: { ...room.scores },
    players: playersInfo,
    correct: { ...room.correct },
    wrong: { ...room.wrong },
    rewards: { coinsEarned: coinsEarnedMap, xpEarned: xpEarnedMap },
    newAchievements: newAchievementsMap,
  };
  io.to(code).emit('game-ended', room.gameSummary);

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
      clearRoomTimers(rooms[code]);
      delete rooms[code];
      io.emit('public-rooms-update', getPublicRooms());
    }
  }, 120000); // 2 minutes
}

const fs = require('fs');
const path = require('path');
const drawWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/drawWords.json'), 'utf8'));
const localQuestionBank = (() => {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/questions.json'), 'utf8'));
    return Array.isArray(file)
      ? file
        .filter((q) => q && q.text && q.answer && q.category && q.isCustomTrivia !== true)
        .map((q, index) => ({ ...q, _id: q._id || `local-question-${index}` }))
      : [];
  } catch {
    return [];
  }
})();

function logDebug(msg) {
  if (process.env.DEBUG_GAME_LOGS !== 'true') return;
  fs.appendFile('debug.log', msg + '\n', () => {});
}

function scheduleBuzzTimeout(code, playerId, durationMs) {
  const room = rooms[code];
  if (!room) return;
  if (room.buzzTimeout) clearTimeout(room.buzzTimeout);
  const remainingMs = Math.max(0, durationMs);
  room.buzzEndTime = Date.now() + remainingMs;
  room.buzzTimeout = setTimeout(() => {
    const currentRoom = rooms[code];
    if (!currentRoom || currentRoom.buzzer !== playerId) return;
    currentRoom.scores[playerId] = (currentRoom.scores[playerId] || 0) - 1;
    currentRoom.wrong[playerId] = (currentRoom.wrong[playerId] || 0) + 1;
    currentRoom.buzzer = null;
    currentRoom.buzzTimeout = null;
    currentRoom.buzzEndTime = null;

    io.to(code).emit('score-update', {
      id: playerId,
      name: currentRoom.players[playerId]?.name,
      score: currentRoom.scores[playerId],
      delta: -1,
      scores: currentRoom.scores,
      players: Object.fromEntries(Object.entries(currentRoom.players).map(([id, player]) => [id, player.name])),
    });
    io.to(code).emit('buzz-reset');
  }, remainingMs);
}

// Rebind a live buzz to a new Socket.IO id after reconnecting. The timeout
// callback closes over the player id, so reconnects must cancel and recreate
// it; otherwise the old callback silently ignores the new buzzer id.
function rebindBuzzTimeout(code, oldPlayerId, newPlayerId) {
  const room = rooms[code];
  if (!room || room.buzzer !== oldPlayerId || !room.buzzEndTime) return false;
  const remainingMs = Math.max(0, room.buzzEndTime - Date.now());
  room.buzzer = newPlayerId;
  scheduleBuzzTimeout(code, newPlayerId, remainingMs);
  return true;
}

function migrateHost(code) {
  logDebug(`[Host Migration] Attempting migration for room code: ${code}`);
  const room = rooms[code];
  if (!room) {
    logDebug(`[Host Migration] Room not found.`);
    return false;
  }

  logDebug(`[Host Migration] Current host socket ID: ${room.host}`);
  const activePlayers = Object.entries(room.players).filter(([id, p]) => (
    id !== room.host && !p.disconnected && !p.aiControlled
  ));
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

  // Predict's host is also a normal participant. Promoting them must not erase
  // their team, submitted answer, score or place in the player dock.
  const hostKeepsPlaying = ['predict', 'codenames'].includes(room.config?.gameMode);
  if (!hostKeepsPlaying) {
    delete room.players[newHostId];
    delete room.scores[newHostId];
    delete room.correct[newHostId];
    delete room.wrong[newHostId];
    if (room.cards) delete room.cards[newHostId];
  }

  // Send promotion event to the new host
  io.to(newHostId).emit('promoted-to-host', { status: room.status, reason: 'migration', hostId: newHostId });

  // Send the current question's answer to the new host so they can view it.
  // Not in written mode — the new judge still plays and must stay blind.
  if (room.currentQuestion && room.currentQuestion.answer && room.config?.answerMode !== 'written') {
    io.to(newHostId).emit('reveal-answer-updated', {
      answer: room.currentQuestion.answer
    });
  }

  // Send update to the room
  io.to(code).emit('host-changed', {
    hostName: newHostPlayer.name,
    hostId: newHostId,
    judge: judgeInfo(room),
  });
  if (!hostKeepsPlaying) io.to(code).emit('player-removed', { id: newHostId });

  // Reset buzz state on migration
  room.buzzer = null;
  if (room.buzzTimeout) {
    clearTimeout(room.buzzTimeout);
    room.buzzTimeout = null;
  }
  io.to(code).emit('buzz-reset');

  // Update public rooms list since playerCount changed
  io.emit('public-rooms-update', getPublicRooms());

  if (room.config?.gameMode === 'predict') emitPredictState(code);
  if (room.config?.gameMode === 'codenames') codenames.sync(code);
  
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
  io.to(newHostId).emit('promoted-to-host', { status: room.status, reason: 'rotation', hostId: newHostId });

  // Send the current question's answer to the new host so they can view it.
  // Not in written mode — the new judge still plays and must stay blind.
  if (room.currentQuestion && room.currentQuestion.answer && room.config?.answerMode !== 'written') {
    io.to(newHostId).emit('reveal-answer-updated', {
      answer: room.currentQuestion.answer
    });
  }

  // Update all players in the room about changes
  io.to(code).emit('host-changed', {
    hostName: room.hostName,
    hostId: newHostId,
    judge: judgeInfo(room),
  });
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


function cancelPredictAiTakeover(room, playerId) {
  const timer = room?.predictAiTakeoverTimers?.[playerId];
  if (timer) clearTimeout(timer);
  if (room?.predictAiTakeoverTimers) delete room.predictAiTakeoverTimers[playerId];
  if (room?.predictBotPendingAnswers) delete room.predictBotPendingAnswers[playerId];
  if (room?.predictBotGenerations) delete room.predictBotGenerations[playerId];
}

function fallbackPredictBotAnswer(room, playerId, role) {
  const candidates = [
    room.currentQuestion?.answer,
    ...(room.currentQuestion?.acceptedAnswers || []),
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (candidates.length === 0) return 'مش عارف';
  if (role === 'hunt') return candidates[0].slice(0, 40);
  const offset = ((room.predictRound || 1) + String(playerId).length) % candidates.length;
  return candidates[offset].slice(0, 40);
}

function commitPredictBotAnswer(code, playerId, round, answer) {
  const room = rooms[code];
  if (!room || room.predictRound !== round || room.predictPhase !== 'write') return false;
  if (!room.players[playerId]?.aiControlled || room.predictAnswers?.[playerId]) return false;
  const value = String(answer || '').trim().slice(0, 40);
  if (!value) return false;
  room.predictAnswers = room.predictAnswers || {};
  room.predictAnswers[playerId] = value;
  emitPredictState(code);
  maybeBeginPredictJudging(code);
  return true;
}

async function preparePredictBotAnswer(code, playerId) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;
  if (!['countdown', 'write'].includes(room.predictPhase) || !room.players[playerId]?.aiControlled) return;
  if (room.predictAnswers?.[playerId] || room.predictBotGenerations?.[playerId]) return;

  const round = room.predictRound;
  const role = room.predictTeams?.[playerId] === getEscapingTeam(round) ? 'escape' : 'hunt';
  const generation = `${round}:${Date.now()}:${Math.random()}`;
  room.predictBotGenerations = room.predictBotGenerations || {};
  room.predictBotGenerations[playerId] = generation;

  let answer;
  try {
    answer = (await aiJudge.generatePredictBotAnswer({
      question: room.currentQuestion?.text,
      role,
    })).answer;
  } catch (error) {
    answer = fallbackPredictBotAnswer(room, playerId, role);
    console.error('Predict bot answer fallback:', error.message, error.causes || []);
  }

  const activeRoom = rooms[code];
  if (!activeRoom || activeRoom.predictBotGenerations?.[playerId] !== generation) return;
  delete activeRoom.predictBotGenerations[playerId];
  if (!activeRoom.players[playerId]?.aiControlled || activeRoom.predictRound !== round) return;
  if (activeRoom.predictPhase === 'countdown') {
    activeRoom.predictBotPendingAnswers = activeRoom.predictBotPendingAnswers || {};
    activeRoom.predictBotPendingAnswers[playerId] = answer;
    return;
  }
  commitPredictBotAnswer(code, playerId, round, answer);
}

function activatePredictAiReplacement(code, playerId) {
  const room = rooms[code];
  const player = room?.players?.[playerId];
  if (!room || !player || !player.disconnected || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;
  if (room.predictAiTakeoverTimers) delete room.predictAiTakeoverTimers[playerId];
  player.disconnected = false;
  player.aiControlled = true;
  io.to(code).emit('predict-ai-takeover', { playerId, name: player.name });
  emitPredictState(code);
  preparePredictBotAnswer(code, playerId);

  if (room.host === playerId && room.hostDisconnected) migrateHost(code);
}

function movePredictSeatToAi(code, playerId) {
  const room = rooms[code];
  const player = room?.players?.[playerId];
  if (!room || !player || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return null;

  const aiPlayerId = 'AI_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  room.players[aiPlayerId] = { ...player, disconnected: true, aiControlled: false };
  room.scores[aiPlayerId] = room.scores[playerId] || 0;
  room.correct[aiPlayerId] = room.correct[playerId] || 0;
  room.wrong[aiPlayerId] = room.wrong[playerId] || 0;
  room.cards = room.cards || {};
  room.cards[aiPlayerId] = room.cards[playerId] || { yellow: 0, red: 0 };
  migratePredictPlayerId(room, playerId, aiPlayerId);

  if (room.host === playerId) {
    room.host = aiPlayerId;
    room.hostDisconnected = true;
  }

  delete room.players[playerId];
  delete room.scores[playerId];
  delete room.correct[playerId];
  delete room.wrong[playerId];
  delete room.cards[playerId];

  io.to(code).emit('player-removed', { id: playerId, name: player.name });
  io.to(code).emit('predict-player-id-migrated', { previousId: playerId, nextId: aiPlayerId });
  io.to(code).emit('player-joined', {
    id: aiPlayerId,
    name: player.name,
    userId: player.userId || null,
    score: room.scores[aiPlayerId],
    equippedItems: player.equippedItems || null,
    cards: room.cards[aiPlayerId],
    team: room.predictTeams?.[aiPlayerId] || null,
    aiControlled: true,
  });

  activatePredictAiReplacement(code, aiPlayerId);
  return aiPlayerId;
}

function schedulePredictAiReplacement(code, playerId) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return false;
  room.predictAiTakeoverTimers = room.predictAiTakeoverTimers || {};
  if (room.predictAiTakeoverTimers[playerId]) clearTimeout(room.predictAiTakeoverTimers[playerId]);
  room.predictAiTakeoverTimers[playerId] = setTimeout(
    () => activatePredictAiReplacement(code, playerId),
    PREDICT_AI_TAKEOVER_GRACE_MS,
  );
  return true;
}

function predictStateFor(room, playerId) {
  const team = room.predictTeams?.[playerId] || null;
  const writerTeam = getEscapingTeam(room.predictRound || 1);
  
  return {
    phase: room.predictPhase || 'write',
    round: room.predictRound || 1,
    totalRounds: predictTotalRounds(room),
    myTeam: team,
    writerTeam: writerTeam,
    hostId: room.host,
    judgeMode: room.config?.judgeMode === 'ai' ? 'ai' : 'host',
    aiFallbackReason: room.predictAiFallbackReason || null,
    submitted: Boolean(room.predictAnswers?.[playerId]),
    submittedPlayerIds: Object.keys(room.predictAnswers || {}),
    myAnswer: room.predictAnswers?.[playerId] || null,
    endTime: room.predictEndTime || null,
    timeLimit: room.config?.timeLimit || 30,
    teamScores: predictTeamScores(room),
    teams: Object.entries(room.players).reduce((teams, [id, player]) => {
      const playerTeam = room.predictTeams?.[id];
      if (playerTeam && teams[playerTeam]) teams[playerTeam].push({
        id,
        name: player.name,
        equippedItems: player.equippedItems || null,
        aiControlled: Boolean(player.aiControlled),
        disconnected: Boolean(player.disconnected),
      });
      return teams;
    }, { A: [], B: [] }),
    results: room.predictPhase === 'results' ? room.predictResults : null,
    answersToJudge: room.predictPhase === 'judging'
      ? Object.entries(room.predictAnswers || {}).map(([id, ans]) => ({ id, answer: ans, playerName: room.players[id]?.name || '???' }))
      : null,
    rejectedPlayerIds: room.predictPhase === 'judging' ? room.predictRejectedPlayerIds || [] : [],
  };
}

function emitPredictState(code, targetId = null) {
  const room = rooms[code];
  if (!room) return;
  const ids = targetId ? [targetId] : Object.keys(room.players).filter(id => !room.players[id].disconnected);
  for (const id of ids) io.to(id).emit('predict-state', predictStateFor(room, id));
}

function predictTotalRounds(room) {
  return getPredictTotalRounds(room.config);
}

function predictTeamScores(room) {
  const scores = { A: 0, B: 0 };
  for (const [id, score] of Object.entries(room.scores || {})) {
    const team = room.predictTeams?.[id];
    if (team) scores[team] += score;
  }
  return scores;
}

function beginPredictRound(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return;
  room.predictRound = (room.predictRound || 0) + 1;
  room.predictPhase = 'countdown';
  room.predictAnswers = {}; // everyone writes an answer
  room.predictResults = null;
  room.predictRejectedPlayerIds = [];
  room.predictAiFallbackReason = null;
  room.predictBotPendingAnswers = {};
  room.predictBotGenerations = {};
  room.predictEndTime = Date.now() + 1000;
  if (room.predictTimer) clearTimeout(room.predictTimer);
  emitPredictState(code);
  for (const [playerId, player] of Object.entries(room.players)) {
    if (player.aiControlled) preparePredictBotAnswer(code, playerId);
  }

  const preparedRound = room.predictRound;
  room.predictTimer = setTimeout(() => {
    const activeRoom = rooms[code];
    if (!activeRoom || activeRoom.predictPhase !== 'countdown' || activeRoom.predictRound !== preparedRound) return;
    activeRoom.predictPhase = 'write';
    activeRoom.predictEndTime = Date.now() + ((activeRoom.config?.timeLimit || 30) * 1000);
    activeRoom.predictTimer = setTimeout(() => beginPredictJudging(code), activeRoom.predictEndTime - Date.now());
    emitPredictState(code);
    for (const [playerId, player] of Object.entries(activeRoom.players)) {
      if (!player.aiControlled) continue;
      const pendingAnswer = activeRoom.predictBotPendingAnswers?.[playerId];
      if (pendingAnswer) {
        delete activeRoom.predictBotPendingAnswers[playerId];
        commitPredictBotAnswer(code, playerId, preparedRound, pendingAnswer);
      } else {
        preparePredictBotAnswer(code, playerId);
      }
    }
  }, 1000);
}

function beginPredictJudging(code) {
  const room = rooms[code];
  if (!room || room.predictPhase !== 'write') return;
  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }

  room.predictRejectedPlayerIds = [];
  room.predictEndTime = null;
  if (room.config?.judgeMode === 'ai') {
    room.predictPhase = 'ai-judging';
    emitPredictState(code);
    runPredictAiJudging(code, room.predictRound);
    return;
  }
  room.predictPhase = 'judging';
  emitPredictState(code);
}

async function runPredictAiJudging(code, round) {
  const room = rooms[code];
  if (!room || room.predictPhase !== 'ai-judging' || room.predictRound !== round) return;
  if (Object.keys(room.predictAnswers || {}).length === 0) {
    evaluatePredictAnswers(code, [], { judgedBy: 'ai', provider: 'none' });
    return;
  }
  try {
    const judgment = await aiJudge.judgePredictRound({
      question: room.currentQuestion?.text,
      answers: Object.entries(room.predictAnswers || {}).map(([playerId, answer]) => ({ playerId, answer })),
    });
    const activeRoom = rooms[code];
    if (!activeRoom || activeRoom.predictPhase !== 'ai-judging' || activeRoom.predictRound !== round) return;
    evaluatePredictAnswers(code, judgment.rejectedPlayerIds, {
      judgedBy: 'ai',
      provider: judgment.provider,
      reasonsByPlayerId: judgment.reasonsByPlayerId,
      semanticMatchPairs: judgment.semanticMatchPairs,
    });
  } catch (error) {
    const activeRoom = rooms[code];
    if (!activeRoom || activeRoom.predictPhase !== 'ai-judging' || activeRoom.predictRound !== round) return;
    activeRoom.config.judgeMode = 'host';
    activeRoom.predictPhase = 'judging';
    activeRoom.predictAiFallbackReason = 'AI_UNAVAILABLE';
    io.to(code).emit('predict-ai-fallback', { reason: 'AI_UNAVAILABLE' });
    emitPredictState(code);
    console.error('Predict AI judging fallback:', error.message, error.causes || []);
  }
}

function maybeBeginPredictJudging(code) {
  const room = rooms[code];
  if (!room || room.config?.gameMode !== 'predict' || room.predictPhase !== 'write') return;
  if (haveAllActivePredictPlayersAnswered(room.players, room.predictAnswers)) {
    beginPredictJudging(code);
  }
}

function clearPredictPlayerState(room, playerId) {
  if (room.config?.gameMode !== 'predict') return;
  if (room.predictTeams) delete room.predictTeams[playerId];
  if (room.predictAnswers) delete room.predictAnswers[playerId];
  if (room.predictTraps) delete room.predictTraps[playerId];
  if (room.predictVotes) delete room.predictVotes[playerId];
  room.predictRejectedPlayerIds = (room.predictRejectedPlayerIds || []).filter((id) => id !== playerId);
}

function evaluatePredictAnswers(code, rejectedPlayerIds = [], judgment = {}) {
  const room = rooms[code];
  if (!room || !['judging', 'ai-judging', 'write'].includes(room.predictPhase)) return;
  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }

  const escapingTeam = getEscapingTeam(room.predictRound || 1);
  
  const result = evaluatePredictRound({
    rawAnswers: room.predictAnswers,
    predictTeams: room.predictTeams,
    players: room.players,
    escapingTeam,
    rejectedPlayerIds,
    semanticMatchPairs: judgment.semanticMatchPairs || [],
  });

  for (const answer of result.allAnswers) {
    answer.judgedBy = judgment.judgedBy || 'host';
    answer.judgmentReason = judgment.reasonsByPlayerId?.[answer.playerId] || null;
  }

  for (const [playerId, delta] of Object.entries(result.scoreDeltas)) {
    room.scores[playerId] = (room.scores[playerId] || 0) + delta;
  }
  for (const [playerId, delta] of Object.entries(result.correctDeltas)) {
    room.correct[playerId] = (room.correct[playerId] || 0) + delta;
  }
  for (const [playerId, delta] of Object.entries(result.wrongDeltas)) {
    room.wrong[playerId] = (room.wrong[playerId] || 0) + delta;
  }
  
  room.predictPhase = 'results';
  room.predictEndTime = null;
  room.predictResults = {
    allAnswers: result.allAnswers,
    clashes: result.clashes,
    judgedBy: judgment.judgedBy || 'host',
    provider: judgment.provider || null,
  };
  emitPredictState(code);
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
      if (room.config?.penaltyEnabled && !data?.usedShield) {
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
    room.nextQuestionTimer = setTimeout(async () => {
      if (rooms[code] !== room) return;
      await triggerEndGame(code);
    }, 3000);
  } else {
    // Next question automatically after 4 seconds
    room.nextQuestionTimer = setTimeout(async () => {
      if (rooms[code] !== room || room.status !== 'PLAYING') return;
      await fetchAndSendNextQuestion(code);
    }, 4000);
  }
}

function endDrawRound(code) {
  const room = rooms[code];
  if (!room || room.status !== 'PLAYING') return;
  if (room.drawRoundEnded) return;
  room.drawRoundEnded = true;

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
    room.nextQuestionTimer = setTimeout(() => {
      if (rooms[code] === room) triggerEndGame(code);
    }, 4000);
  } else {
    room.nextQuestionTimer = setTimeout(() => {
      if (rooms[code] === room && room.status === 'PLAYING') startNextDrawRound(code);
    }, 4000);
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
  if (room.drawDrawerDisconnectTimer) {
    clearTimeout(room.drawDrawerDisconnectTimer);
    room.drawDrawerDisconnectTimer = null;
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
  room.drawRoundNumber = (room.drawRoundNumber || 0) + 1;
  room.correctGuessers = new Set(); // reset for new round
  room.drawRoundEnded = false;
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
    roundNumber: room.drawRoundNumber,
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

  // Do not auto-skip an idle drawer before the configured round duration.
  // The normal drawRoundTimer above is the single source of truth for ending
  // the turn, so the drawing UI remains visible for the full selected time.
  room.afkTimer = null;
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

// Store cosmetics are server-authoritative. Never trust the equippedItems object
// supplied by a client, because it can be forged to use items the account does
// not own. A missing/invalid account simply joins with the default cosmetics.
async function getVerifiedRoomProfile(userId) {
  if (!userId) return null;
  try {
    const account = await User.findById(userId)
      .select('equippedItems xp level')
      .populate('equippedItems.avatar')
      .populate('equippedItems.theme')
      .populate('equippedItems.effect')
      .populate('equippedItems.border')
      .populate('equippedItems.cover')
      .populate('equippedItems.buzzer')
      .lean();
    if (!account) return null;
    return {
      equippedItems: account.equippedItems || null,
      xp: Math.max(0, Number(account.xp) || 0),
      level: Math.max(1, Number(account.level) || 1),
    };
  } catch (error) {
    console.warn('[rooms] failed to verify equipped items:', error?.message);
    return null;
  }
}

async function buildMatchStage(room) {
  const categories = room.config?.categories || [];
  const matchStage = {
    // User suggestions stay out of live games until an admin approves them.
    // Missing status keeps older curated questions playable.
    $or: [{ status: 'approved' }, { status: { $exists: false } }],
  };

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
  } else if (room.config?.gameMode === 'predict') {
    matchStage.category = 'predict-questions';
    // Predict starts broad, then narrows after the early rounds without ever
    // going below the six valid answers required by a six-player room.
    const upcomingRound = (room.predictRound || 0) + 1;
    matchStage.difficulty = upcomingRound <= 2 ? 'easy' : upcomingRound <= 4 ? 'medium' : 'hard';
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
    matchStage = await buildMatchStage(room);
    count = await Question.countDocuments(matchStage);
  }

  if (count === 0) {
    if (room.config?.gameMode === 'predict') {
      return createPredictFallbackQuestion();
    }

    // If specific filters produced 0, try general trivia pool
    const fallbackStage = { isTriviaChoice: true };
    count = await Question.countDocuments(fallbackStage);
    if (count > 0) {
      return Question.findOne(fallbackStage)
        .skip(Math.floor(Math.random() * count))
        .lean();
    }

    // Keep buzzer playable when Mongo has not been seeded yet (or when a
    // selected category is temporarily empty). The repository ships with a
    // reviewed local bank, so use it as a deterministic last-resort source.
    const wantedCategories = room.config?.categories || [];
    const wantedDifficulty = room.config?.difficulty;
    const used = new Set((room.usedQuestions || []).map((id) => String(id)));
    let local = localQuestionBank.filter((q) => {
      if (wantedCategories.length > 0 && !wantedCategories.includes(q.category)) return false;
      if (room.config?.gameMode === 'trivia' && wantedDifficulty && wantedDifficulty !== 'mixed' && q.difficulty !== wantedDifficulty) return false;
      return !used.has(String(q._id));
    });
    if (local.length === 0) {
      local = localQuestionBank.filter((q) => wantedCategories.length === 0 || wantedCategories.includes(q.category));
    }
    if (local.length > 0) {
      return local[Math.floor(Math.random() * local.length)];
    }
    return null;
  }

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
  const generation = (room.questionPrefetchGeneration || 0) + 1;
  room.questionPrefetchGeneration = generation;

  // Build a temporary snapshot of usedQuestions to avoid race conditions
  const usedSnapshot = [...(room.usedQuestions || [])]; 
  const tempRoom = { ...room, usedQuestions: usedSnapshot };

  const promise = fetchOneQuestion(tempRoom).then(q => {
    if (rooms[code] === room && room.questionPrefetchGeneration === generation) {
      room.prefetchedQuestion = q || null;
      room.prefetching = false;
      room.prefetchPromise = null;
    }
  }).catch(() => {
    if (rooms[code] === room && room.questionPrefetchGeneration === generation) {
      room.prefetching = false;
      room.prefetchPromise = null;
    }
  });
  room.prefetchPromise = promise;
}

const FALLBACK_TRIVIA_QUESTIONS = [
  { text: 'ما هي عاصمة كندا؟', choices: ['تورنتو', 'فانكوفر', 'أوتاوا', 'مونتريال'], answer: 'أوتاوا' },
  { text: 'ما هو أكبر كوكب في المجموعة الشمسية؟', choices: ['المشتري', 'زحل', 'الأرض', 'المريخ'], answer: 'المشتري' },
  { text: 'كم عدد أضلاع المثلث؟', choices: ['3', '4', '5', '6'], answer: '3' },
  { text: 'ما هي عاصمة فرنسا؟', choices: ['باريس', 'ليون', 'مارسيليا', 'نيس'], answer: 'باريس' },
  { text: 'ما هو أسرع حيوان بري في العالم؟', choices: ['الفهد', 'الأسد', 'الغزال', 'النمر'], answer: 'الفهد' },
  { text: 'في أي قارة تقع مصر؟', choices: ['أفريقيا', 'آسيا', 'أوروبا', 'أمريكا الجنوبية'], answer: 'أفريقيا' },
];

// Predict has a distinct question format. Do not fall back to trivia when its
// Mongo collection is empty: the host needs an open-ended prompt, not choices.
const FALLBACK_PREDICT_QUESTIONS = [
  'اذكر حاجة أغلب الناس بتعملها أول ما تصحى من النوم.',
  'اذكر أكلة مصرية مشهورة.',
  'اذكر حاجة بتلاقيها غالبًا في الشنطة.',
  'اذكر مادة دراسية الطلاب بيشتكوا منها كتير.',
  'اذكر مكان الناس بتحب تروحه في الإجازة.',
  'اذكر حاجة ممكن تنساها قبل ما تخرج من البيت.',
  'اذكر حاجة بنستخدمها كل يوم في الموبايل.',
  'اذكر مشروب الناس بتحبه في الصيف.',
];

function createPredictFallbackQuestion() {
  const text = FALLBACK_PREDICT_QUESTIONS[Math.floor(Math.random() * FALLBACK_PREDICT_QUESTIONS.length)];
  return {
    _id: `predict-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    category: 'predict-questions',
    answer: 'إجابة مفتوحة',
  };
}

function createTriviaDesignQuestion() {
  const item = FALLBACK_TRIVIA_QUESTIONS[Math.floor(Math.random() * FALLBACK_TRIVIA_QUESTIONS.length)];
  return {
    _id: `trivia-design-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    text: item.text,
    category: 'general-knowledge',
    choices: item.choices,
    answer: item.answer,
    isDesignPreview: true,
  };
}

async function fetchAndSendNextQuestion(code) {
  const room = rooms[code];
  if (!room) return false;

  // A very fast Predict host can advance before the background prefetch
  // finishes. Reuse that in-flight request; starting a second query from the
  // same used-question snapshot can select the same question twice in a row.
  if (room.config?.gameMode === 'predict' && room.prefetching && room.prefetchPromise) {
    await room.prefetchPromise;
    if (rooms[code] !== room || room.status !== 'PLAYING') return false;
  }

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
      room.nextQuestionTimer = setTimeout(() => {
        if (rooms[code] === room) triggerEndGame(code);
      }, 2000);
      return false;
    }
  }

  if (!question && room.config?.gameMode === 'trivia') {
    question = createTriviaDesignQuestion();
  }

  if (!question) {
    io.to(room.host).emit('error', 'لم يتم العثور على أسئلة في التصنيفات المحددة!');
    room.nextQuestionTimer = setTimeout(() => {
      if (rooms[code] === room) triggerEndGame(code);
    }, 2000);
    return false;
  }

  // The database request may finish after the room was closed or the match
  // was ended. Never let that stale response start a new round afterward.
  if (rooms[code] !== room || room.status !== 'PLAYING') return false;

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
  room.predictTraps = {};
  room.predictVotes = {};
  room.lifelines = {};
  room.fiftyFiftyChoices = {};
  room.frozenPlayers = new Set();
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }
  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }

  const timeLimit = room.config?.timeLimit || 30;
  const isTimedPhase = (room.config?.gameMode === 'trivia' && !question.isDesignPreview) || room.config?.gameMode === 'predict';
  const endTime = isTimedPhase ? Date.now() + (timeLimit * 1000) + 2000 : undefined;
  room.currentQuestionEndTime = endTime;

  io.to(code).emit('question-updated', {
    id: question._id,
    text: question.text,
    category: question.category,
    flagImage: question.flagImage,
    choices: room.config?.gameMode === 'trivia' ? question.choices : undefined,
    endTime: room.config?.gameMode === 'predict' ? null : endTime
  });

  if (room.config?.gameMode === 'trivia') {
    const activeCount = Object.values(room.players).filter(p => !p.disconnected).length;
    io.to(code).emit('trivia-answered-update', {
      count: 0,
      total: activeCount,
    });
  }

  if (room.config?.gameMode === 'predict') {
    beginPredictRound(code);
  }

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

  if (room.config?.gameMode === 'trivia' && !question.isDesignPreview) {
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

const activeSoloPlayers = {};
const soloStats = { TenByTen: 0, DontSayMyWord: 0 };

io.on('connection', (socket) => {
  codenames.register(socket);
  // Legacy game events must never mutate a Codenames room or bypass its rules.
  socket.use(([event, payload], next) => {
    const code = typeof payload === 'string' ? payload : payload?.code;
    const codenamesRoom = rooms[code]?.config?.gameMode === 'codenames';
    const codenamesLobbyChat = event === 'send-room-chat' && rooms[code]?.codenames?.phase === 'lobby';
    if (codenamesRoom && !codenamesLobbyChat && ![
      'codenames-action', 'start-game', 'join-room', 'rejoin-host', 'leave-room',
      'kick-player', 'update-room-config',
    ].includes(event)) return;
    next();
  });
  if (socket.authUserId) {
    connectedUsers.set(socket.authUserId, socket.id);
  }
  socket.on('join_home_screen', () => {
    socket.join('home_screen');
    socket.emit('solo_stats_update', soloStats);
  });

  socket.on('leave_home_screen', () => {
    socket.leave('home_screen');
  });

  const getChessRoomForSocket = (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.config?.gameMode !== 'chess') return null;
    if (room.host !== socket.id && !room.players[socket.id]) return null;
    return room;
  };

  socket.on('chess_move', ({ roomCode, from, to, promotion } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room || room.chessGameOver || !from || !to) return;
    if (!Array.isArray(room.chessMoves)) room.chessMoves = [];
    const hostColor = room.config?.playerColor === 'b' ? 'b' : 'w';
    const moverColor = socket.id === room.host ? hostColor : (hostColor === 'w' ? 'b' : 'w');
    const expectedColor = room.chessMoves.length % 2 === 0 ? 'w' : 'b';
    if (moverColor !== expectedColor) return;
    room.chessMoves.push({ from, to, promotion });
    socket.to(roomCode).emit('chess_move_received', { from, to, promotion });
  });

  socket.on('chess_request_state', ({ roomCode } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room) return;
    socket.emit('chess_state_received', {
      moves: Array.isArray(room.chessMoves) ? room.chessMoves : [],
      gameOver: room.chessGameOver || null,
    });
  });

  socket.on('chess_undo', ({ roomCode } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room || room.chessGameOver || !Array.isArray(room.chessMoves) || room.chessMoves.length === 0) return;
    room.chessMoves.pop();
    socket.to(roomCode).emit('chess_undo_received');
  });

  socket.on('chess_game_over', ({ roomCode, result } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room || room.chessGameOver || !['w', 'b', 'draw'].includes(result?.winner)) return;
    room.chessGameOver = {
      winner: result.winner,
      reason: String(result.reason || 'انتهت المباراة').slice(0, 160),
      icon: String(result.icon || 'trophy-outline').slice(0, 40),
    };
    socket.to(roomCode).emit('chess_game_over_received', room.chessGameOver);
  });

  socket.on('chess_draw_offer', ({ roomCode } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room || room.chessGameOver) return;
    socket.to(roomCode).emit('chess_draw_offer_received');
  });

  socket.on('chess_restart', ({ roomCode } = {}) => {
    const room = getChessRoomForSocket(roomCode);
    if (!room || !room.chessGameOver) return;
    room.chessGameOver = null;
    room.chessMoves = [];
    socket.to(roomCode).emit('chess_restart_received');
  });

  // Domino Realtime Multiplayer Handlers
  socket.on('domino_sync_state', ({ roomCode, state } = {}) => {
    const room = rooms[roomCode];
    if (!room || !room.players?.[socket.id] || room.config?.gameMode !== 'domino') return;
    if (!state || typeof state !== 'object') return;
    room.dominoState = state;
    socket.to(roomCode).emit('domino_state_received', state);
  });

  socket.on('domino_request_state', ({ roomCode } = {}) => {
    const room = rooms[roomCode];
    if (!room || !room.players?.[socket.id] || room.config?.gameMode !== 'domino') return;
    if (room.dominoState) socket.emit('domino_state_received', room.dominoState);
  });

  socket.on('domino_move', ({ roomCode, tileId, playOn, playerIndex } = {}) => {
    const room = rooms[roomCode];
    if (!room || !room.players?.[socket.id] || room.config?.gameMode !== 'domino' || !tileId) return;
    const verifiedPlayerIndex = room.host === socket.id ? 0 : 1;
    socket.to(roomCode).emit('domino_move_received', { tileId, playOn, playerIndex: verifiedPlayerIndex });
  });

  socket.on('domino_draw', ({ roomCode, playerIndex } = {}) => {
    const room = rooms[roomCode];
    if (!room || !room.players?.[socket.id] || room.config?.gameMode !== 'domino') return;
    const verifiedPlayerIndex = room.host === socket.id ? 0 : 1;
    socket.to(roomCode).emit('domino_draw_received', { playerIndex: verifiedPlayerIndex });
  });

  socket.on('domino_pass', ({ roomCode, playerIndex } = {}) => {
    const room = rooms[roomCode];
    if (!room || !room.players?.[socket.id] || room.config?.gameMode !== 'domino') return;
    const verifiedPlayerIndex = room.host === socket.id ? 0 : 1;
    socket.to(roomCode).emit('domino_pass_received', { playerIndex: verifiedPlayerIndex });
  });

  socket.on('domino_restart', ({ roomCode } = {}) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id || room.config?.gameMode !== 'domino') return;
    socket.to(roomCode).emit('domino_restart_received');
  });

  socket.on('join_solo_game', ({ gameId }) => {
    if (activeSoloPlayers[socket.id]) {
      soloStats[activeSoloPlayers[socket.id]] = Math.max(0, (soloStats[activeSoloPlayers[socket.id]] || 0) - 1);
    }
    activeSoloPlayers[socket.id] = gameId;
    soloStats[gameId] = (soloStats[gameId] || 0) + 1;
    io.to('home_screen').emit('solo_stats_update', soloStats);
  });

  socket.on('leave_solo_game', () => {
    const gameId = activeSoloPlayers[socket.id];
    if (gameId) {
      soloStats[gameId] = Math.max(0, (soloStats[gameId] || 0) - 1);
      delete activeSoloPlayers[socket.id];
      io.to('home_screen').emit('solo_stats_update', soloStats);
    }
  });

  const broadcastCommunityOnlineCount = () => {
    try {
      const room = io.sockets.adapter.rooms.get('community');
      const count = room ? room.size : 0;
      io.to('community').emit('community-online-count', count);
    } catch (e) {}
  };

  socket.on('join-community', async (acknowledge = () => {}) => {
    if (!socket.authUserId) {
      acknowledge({ ok: false, reason: 'UNAUTHORIZED' });
      return;
    }

    socket.join('community');
    broadcastCommunityOnlineCount();
    try {
      const messages = await CommunityMessage.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      socket.emit('community-history', messages);
      acknowledge({ ok: true });
    } catch (error) {
      console.error('Community history error:', error.message);
      acknowledge({ ok: false, reason: 'LOAD_FAILED' });
    }
  });

  socket.on('leave-community', () => {
    socket.leave('community');
    broadcastCommunityOnlineCount();
  });

  socket.on('send-community-message', async (payload = {}, acknowledge = () => {}) => {
    if (!socket.authUserId) {
      acknowledge({ ok: false, reason: 'UNAUTHORIZED' });
      return;
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text || text.length > 300) {
      acknowledge({ ok: false, reason: 'INVALID_MESSAGE' });
      return;
    }

    const now = Date.now();
    if (socket.lastCommunityMessageAt && now - socket.lastCommunityMessageAt < 700) {
      acknowledge({ ok: false, reason: 'TOO_FAST' });
      return;
    }
    socket.lastCommunityMessageAt = now;

    try {
      const user = await User.findById(socket.authUserId)
        .select('username isAdmin equippedItems')
        .populate('equippedItems.avatar')
        .populate('equippedItems.theme')
        .populate('equippedItems.effect')
        .populate('equippedItems.border')
        .populate('equippedItems.cover')
        .lean();
      if (!user) {
        acknowledge({ ok: false, reason: 'USER_NOT_FOUND' });
        return;
      }

      const isAnnouncement = payload.isAnnouncement === true && user.isAdmin === true;
      const message = await CommunityMessage.create({
        senderId: user._id,
        senderName: user.username,
        text,
        equippedItems: user.equippedItems || {},
        isAnnouncement,
      });
      const serialized = message.toObject();
      io.to('community').emit('new-community-message', serialized);
      acknowledge({ ok: true, message: serialized });
    } catch (error) {
      console.error('Community message error:', error.message);
      acknowledge({ ok: false, reason: 'SEND_FAILED' });
    }
  });

  socket.on('authenticate', (token, acknowledge = () => {}) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.authUserId = String(decoded.userId);
      socket.userId = socket.authUserId;
      connectedUsers.set(socket.authUserId, socket.id);
      acknowledge({ authenticated: true, userId: socket.authUserId });
    } catch {
      socket.authUserId = null;
      acknowledge({ authenticated: false });
    }
  });

  // مزامنة الوقت
  socket.on('sync-time', (clientTime) => {
    socket.emit('sync-time-response', { clientTime, serverTime: Date.now() });
  });

  // تسجيل المستخدم للإشعارات (دعوات الأصدقاء)
  socket.on('register-user', (userId) => {
    if (socket.authUserId && String(userId) === socket.authUserId) {
      connectedUsers.set(socket.authUserId, socket.id);
      socket.userId = socket.authUserId;
    }
  });

  // إرسال دعوة غرفة
  socket.on('send-room-invite', ({ targetUserId, roomCode, hostName }, acknowledge = () => {}) => {
    const room = rooms[roomCode];
    const isRoomMember = !!room && (room.host === socket.id || !!room.players[socket.id]);
    if (!socket.authUserId || !isRoomMember) {
      acknowledge({ delivered: false, reason: 'NOT_IN_ROOM' });
      return;
    }
    const targetSocketId = connectedUsers.get(String(targetUserId));
    if (!targetSocketId || !io.sockets.sockets.has(targetSocketId)) {
      acknowledge({ delivered: false, reason: 'OFFLINE' });
      return;
    }
    io.to(targetSocketId).emit('receive-room-invite', {
      roomCode,
      hostName: room.players[socket.id]?.name || room.hostName || hostName,
    });
    acknowledge({ delivered: true });
  });

  // حكم بيعمل روم
  socket.on('create-room', async (payload) => {
    const { hostName, config } = payload || {};
    if (!hasMultiplayerCapacityFor(socket.id)) {
      socket.emit('error', multiplayerCapacityMessage());
      return;
    }
    const verifiedHostUserId = socket.authUserId || null;
    const verifiedHostProfile = await getVerifiedRoomProfile(verifiedHostUserId);
    const verifiedHostEquippedItems = verifiedHostProfile?.equippedItems || null;
    const normalizedConfig = { ...(config || {}) };
    if (normalizedConfig.gameMode === 'codenames') {
      Object.assign(normalizedConfig, {
        maxPlayers: [4, 6, 8].includes(Number(normalizedConfig.maxPlayers)) ? Number(normalizedConfig.maxPlayers) : 8,
        lifelinesEnabled: false,
        judgeMode: 'host',
        timeLimit: [0, 60, 90, 120].includes(normalizedConfig.timeLimit) ? normalizedConfig.timeLimit : 90,
      });
    }
    if (normalizedConfig.gameMode === 'predict') {
      normalizedConfig.judgeMode = normalizedConfig.judgeMode === 'ai' ? 'ai' : 'host';
      if (normalizedConfig.judgeMode === 'ai') {
        const aiStatus = await aiJudge.getStatus({ probe: true });
        if (!aiStatus.available) {
          socket.emit('error', 'تحكيم الـAI غير متاح حاليًا. اختار تحكيم الهوست.');
          return;
        }
      }
    }
    const code = generateRoomCode();
    rooms[code] = {
      host: socket.id,
      hostName: hostName || 'Unknown Host',
      hostUserId: verifiedHostUserId,
      hostEquippedItems: verifiedHostEquippedItems,
      status: 'LOBBY', // LOBBY, PLAYING, RESULTS
      config: normalizedConfig,
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
      lifelineLoadouts: {},
      fiftyFiftyChoices: {},
      chatMessages: [],
      predictTeams: {},
      chessMoves: [],
    };

    const isPlayingHost = config?.gameMode === 'codenames' || config?.gameMode === 'predict' || config?.gameMode === 'trivia' || config?.gameMode === 'draw' || config?.gameMode === 'chess' || (config?.gameMode === 'buzzer' && config?.answerMode === 'written');
    if (isPlayingHost) {
      rooms[code].players[socket.id] = {
        name: hostName || 'Unknown Host',
        userId: verifiedHostUserId,
        disconnected: false,
        equippedItems: verifiedHostEquippedItems,
        xp: verifiedHostProfile?.xp || 0,
        level: verifiedHostProfile?.level || 1,
      };
      rooms[code].scores[socket.id] = 0;
      rooms[code].correct[socket.id] = 0;
      rooms[code].wrong[socket.id] = 0;
      rooms[code].cards[socket.id] = { yellow: 0, red: 0 };
      if (config?.gameMode === 'predict') {
        rooms[code].predictTeams = { [socket.id]: 'A' };
      }
    }

    socket.join(code);
    socket.emit('room-created', { code, hostName: rooms[code].hostName });
    codenames.sync(code);
    
    // Immediately sync the host with the exact room state so they appear in their own lobby accurately
    const playersList = Object.entries(rooms[code].players).map(([id, p]) => ({
      id,
      name: p.name,
      userId: p.userId || null,
      score: rooms[code].scores[id] || 0,
      correctAnswers: rooms[code].correct[id] || 0,
      wrongAnswers: rooms[code].wrong[id] || 0,
      disconnected: p.disconnected,
      equippedItems: p.equippedItems,
      xp: p.xp || 0,
      level: p.level || 1,
      team: p.team,
      cards: rooms[code].cards?.[id] || { yellow: 0, red: 0 }
    }));
    socket.emit('joined-room', {
      code,
      playerName: rooms[code].hostName,
      players: playersList,
      status: rooms[code].status,
      config: rooms[code].config,
      hostId: rooms[code].host,
      predictTeams: rooms[code].predictTeams,
      lifelineLoadout: rooms[code].lifelineLoadouts?.[socket.id] || [],
      judge: judgeInfo(rooms[code])
    });
    
    io.emit('public-rooms-update', getPublicRooms());
  });

  // جلب الرومات العامة
  socket.on('get-public-rooms', () => {
    socket.emit('public-rooms-update', getPublicRooms());
  });

  // لاعب بيدخل روم
  
  socket.on('set-predict-team', ({ code, team, teamName, playerId } = {}, ack) => {
    const room = rooms[code];
    if (!room || room.status !== 'LOBBY' || room.config?.gameMode !== 'predict') {
      if (typeof ack === 'function') ack({ ok: false, message: 'الروم غير متاحة لتغيير الفرق الآن.' });
      return;
    }
    const targetTeam = team || teamName;
    const targetPlayerId = (playerId && room.host === socket.id) ? playerId : socket.id;

    if (!room.players[targetPlayerId]) {
      if (typeof ack === 'function') ack({ ok: false, message: 'اللاعب غير موجود.' });
      return;
    }
    
    if (!room.predictTeams) room.predictTeams = {};
    if (!canAssignPredictTeam(room.players, room.predictTeams, targetPlayerId, targetTeam, room.config)) {
      if (typeof ack === 'function') ack({ ok: false, message: 'الفريق ممتلئ أو الاختيار غير صالح.' });
      return;
    }
    room.predictTeams[targetPlayerId] = targetTeam;
    
    if (typeof ack === 'function') ack({ ok: true });
    
    io.to(code).emit('predict-teams-updated', room.predictTeams);
  });

  socket.on('join-room', async ({ code, playerName, restore = false } = {}, acknowledge) => {
    const hasAcknowledge = typeof acknowledge === 'function';
    const respond = (payload) => hasAcknowledge && acknowledge(payload);
    const room = rooms[code];
    if (!room) {
      respond({ ok: false, reason: 'ROOM_NOT_FOUND' });
      if (restore && !hasAcknowledge) socket.emit('room-restore-failed', { reason: 'ROOM_NOT_FOUND' });
      if (restore) return;
      return socket.emit('error', 'الروم مش موجود!');
    }
    const verifiedUserId = socket.authUserId || null;
    const verifiedPlayerProfile = await getVerifiedRoomProfile(verifiedUserId);
    const verifiedEquippedItems = verifiedPlayerProfile?.equippedItems || null;
    if (verifiedUserId && room.hostUserId && String(room.hostUserId) === verifiedUserId && room.host !== socket.id) {
      respond({ ok: false, reason: 'IS_HOST' });
      return;
    }
    
    // Check for reconnecting player
    let reconnectingId = null;
    for (const [id, p] of Object.entries(room.players)) {
      if ((verifiedUserId && String(p.userId) === verifiedUserId) || (!verifiedUserId && !p.userId && p.name === playerName)) {
        reconnectingId = id;
        break;
      }
    }

    if (restore && !reconnectingId) {
      respond({ ok: false, reason: 'SESSION_NOT_FOUND' });
      if (!hasAcknowledge) socket.emit('room-restore-failed', { reason: 'SESSION_NOT_FOUND' });
      return;
    }

    if (!reconnectingId) {
      if (!hasMultiplayerCapacityFor(socket.id)) {
        respond({ ok: false, reason: 'SERVER_BUSY' });
        return socket.emit('error', multiplayerCapacityMessage());
      }
      const supportsMidGameJoin = ['buzzer', 'trivia', 'draw'].includes(room.config?.gameMode || 'buzzer');
      if (room.status !== 'LOBBY' && !(room.status === 'PLAYING' && supportsMidGameJoin)) {
        respond({ ok: false, reason: 'GAME_IN_PROGRESS' });
        return socket.emit('error', 'اللعبة دي لا تسمح بدخول لاعب جديد بعد بدايتها.');
      }
      const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
      const roomCapacity = room.config?.gameMode === 'predict'
        ? getPredictMaxPlayers(room.config)
        : room.config?.gameMode === 'codenames'
          ? ([4, 6, 8].includes(Number(room.config?.maxPlayers)) ? Number(room.config.maxPlayers) : 8)
        : room.config?.gameMode === 'chess'
          ? 2
          : 8;
      const occupiedSlots = ['predict', 'codenames'].includes(room.config?.gameMode)
        ? Object.keys(room.players).length
        : activePlayersCount;
      if (occupiedSlots >= roomCapacity) {
        respond({ ok: false, reason: 'ROOM_FULL' });
        return socket.emit('error', `الروم ممتلئة! الحد الأقصى ${roomCapacity} لاعبين.`);
      }
    }

    if (reconnectingId) {
      cancelPredictAiTakeover(room, reconnectingId);
      if (reconnectingId !== socket.id) {
        // Move old player data to new socket.id
        room.players[socket.id] = room.players[reconnectingId];
        room.scores[socket.id] = room.scores[reconnectingId] || 0;
        room.correct[socket.id] = room.correct[reconnectingId] || 0;
        room.wrong[socket.id] = room.wrong[reconnectingId] || 0;
        if (!room.cards) room.cards = {};
        if (room.cards) room.cards[socket.id] = room.cards[reconnectingId] || { yellow: 0, red: 0 };

        migratePredictPlayerId(room, reconnectingId, socket.id);
        codenames.remap(room, reconnectingId, socket.id);

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

        if (room.fiftyFiftyChoices?.[reconnectingId]) {
          room.fiftyFiftyChoices[socket.id] = room.fiftyFiftyChoices[reconnectingId];
          delete room.fiftyFiftyChoices[reconnectingId];
        }

        if (room.frozenPlayers?.delete(reconnectingId)) {
          room.frozenPlayers.add(socket.id);
        }

        delete room.players[reconnectingId];
        delete room.scores[reconnectingId];
        delete room.correct[reconnectingId];
        delete room.wrong[reconnectingId];
        delete room.cards[reconnectingId];
        
      }

      room.players[socket.id].disconnected = false;
      room.players[socket.id].aiControlled = false;
      room.players[socket.id].name = playerName; // Update name just in case
      room.players[socket.id].equippedItems = verifiedEquippedItems;
      room.players[socket.id].xp = verifiedPlayerProfile?.xp || 0;
      room.players[socket.id].level = verifiedPlayerProfile?.level || 1;

      rebindBuzzTimeout(code, reconnectingId, socket.id);
      if (room.drawerId === reconnectingId) {
        room.drawerId = socket.id;
        if (room.drawDrawerDisconnectTimer) {
          clearTimeout(room.drawDrawerDisconnectTimer);
          room.drawDrawerDisconnectTimer = null;
        }
      }
      if (room.correctGuessers?.delete(reconnectingId)) room.correctGuessers.add(socket.id);
      if (room.drawnPlayers) {
        room.drawnPlayers = room.drawnPlayers.map((id) => id === reconnectingId ? socket.id : id);
      }
      if (room.lifelineLoadouts?.[reconnectingId]) {
        room.lifelineLoadouts[socket.id] = room.lifelineLoadouts[reconnectingId];
        delete room.lifelineLoadouts[reconnectingId];
      }

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
      if (room.config?.gameMode === 'predict' && reconnectingId && reconnectingId !== socket.id) {
        io.to(code).emit('predict-player-id-migrated', {
          previousId: reconnectingId,
          nextId: socket.id,
        });
      }
      const playersList = Object.entries(room.players).map(([id, p]) => ({
        id,
        name: p.name,
        userId: p.userId || null,
        score: room.scores[id] || 0,
        correctAnswers: room.correct[id] || 0,
        wrongAnswers: room.wrong[id] || 0,
        disconnected: p.disconnected,
        equippedItems: p.equippedItems,
        xp: p.xp || 0,
        level: p.level || 1,
        team: room.predictTeams?.[id] || null,
        cards: room.cards?.[id] || { yellow: 0, red: 0 }
      }));

      socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config, hostId: room.host, judge: judgeInfo(room), predictTeams: room.predictTeams, lifelineLoadout: room.lifelineLoadouts?.[socket.id] || [], chatMessages: room.chatMessages || [] });
      respond({ ok: true, code, role: room.host === socket.id ? 'host' : 'player', status: room.status });
      io.to(code).emit('player-rejoined', {
        id: socket.id,
        previousId: reconnectingId !== socket.id ? reconnectingId : null,
        name: playerName,
        userId: verifiedUserId,
        score: room.scores[socket.id],
        equippedItems: room.players[socket.id].equippedItems,
        xp: room.players[socket.id].xp || 0,
        level: room.players[socket.id].level || 1,
        team: room.predictTeams?.[socket.id] || null,
        cards: room.cards?.[socket.id] || { yellow: 0, red: 0 }
      });
      if (room.config?.gameMode === 'predict') emitPredictState(code);
      codenames.presence(code);
      
      // Resend current question state if playing
      if (room.status === 'PLAYING' && room.currentQuestion) {
        socket.emit('question-updated', {
          id: room.currentQuestion._id,
          text: room.currentQuestion.text,
          category: room.currentQuestion.category,
          flagImage: room.currentQuestion.flagImage,
          choices: room.config?.gameMode === 'trivia' ? room.currentQuestion.choices : undefined,
          endTime: room.currentQuestionEndTime,
        });
        if (room.currentQuestion.flagImage && (
          room.config?.gameMode === 'trivia' ||
          room.config?.answerMode === 'written' ||
          room.answerRevealed
        )) {
          socket.emit('image-revealed', room.currentQuestion.flagImage);
        }
        if (room.config?.gameMode === 'trivia') {
          socket.emit('trivia-state-restored', {
            answer: room.triviaAnswers?.[socket.id]?.answer || null,
            usedLifelines: room.usedLifelines?.[socket.id] || {},
            removedChoices: room.fiftyFiftyChoices?.[socket.id] || [],
            frozen: room.frozenPlayers?.has(socket.id) || false,
          });
        }
        if (room.buzzer) {
          const buzzedPlayer = room.players[room.buzzer];
          socket.emit('buzzed', {
            id: room.buzzer,
            name: buzzedPlayer ? buzzedPlayer.name : 'Unknown',
            equippedItems: buzzedPlayer ? buzzedPlayer.equippedItems : null,
            buzzerItem: room.hostEquippedItems?.buzzer || null,
            timeLimit: room.buzzEndTime
              ? Math.max(0, Math.ceil((room.buzzEndTime - Date.now()) / 1000))
              : (room.config?.timeLimit || 0)
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
          roundNumber: room.drawRoundNumber || 0,
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

      // Resend current predict game state if playing predict mode
      if (room.status === 'PLAYING' && room.config?.gameMode === 'predict') {
        emitPredictState(code, socket.id);
      }
      if (room.status === 'RESULTS' && room.gameSummary) {
        socket.emit('game-ended', room.gameSummary);
      }
      return;
    }

    if (room.status === 'RESULTS') {
      respond({ ok: false, reason: 'GAME_ENDED' });
      return socket.emit('error', 'اللعبة انتهت!');
    }

    room.players[socket.id] = {
      name: playerName,
      userId: verifiedUserId,
      disconnected: false,
      equippedItems: verifiedEquippedItems,
      xp: verifiedPlayerProfile?.xp || 0,
      level: verifiedPlayerProfile?.level || 1,
    };
    room.scores[socket.id] = 0;
    room.correct[socket.id] = 0;
    room.wrong[socket.id] = 0;
    if (!room.cards) room.cards = {};
    room.cards[socket.id] = { yellow: 0, red: 0 };
    socket.join(code);
    codenames.presence(code);

    const playersList = Object.entries(room.players).map(([id, p]) => ({
      id,
      name: p.name,
      userId: p.userId || null,
      score: room.scores[id] || 0,
      correctAnswers: room.correct[id] || 0,
      wrongAnswers: room.wrong[id] || 0,
      disconnected: p.disconnected,
      equippedItems: p.equippedItems,
      xp: p.xp || 0,
      level: p.level || 1,
      team: p.team,
      cards: room.cards?.[id] || { yellow: 0, red: 0 }
    }));

    socket.emit('joined-room', { code, playerName, players: playersList, status: room.status, config: room.config, hostId: room.host, judge: judgeInfo(room), predictTeams: room.predictTeams, lifelineLoadout: room.lifelineLoadouts?.[socket.id] || [], chatMessages: room.chatMessages || [] });
    respond({ ok: true, code, role: 'player', status: room.status });
    io.to(code).emit('player-joined', {
      id: socket.id,
      name: playerName,
      userId: verifiedUserId,
      score: 0,
      equippedItems: verifiedEquippedItems,
      xp: verifiedPlayerProfile?.xp || 0,
      level: verifiedPlayerProfile?.level || 1,
      cards: { yellow: 0, red: 0 },
    });
    io.emit('public-rooms-update', getPublicRooms());

    // Send current question state if joining mid-game
    if (room.status === 'PLAYING' && room.currentQuestion) {
      socket.emit('question-updated', {
        id: room.currentQuestion._id,
        text: room.currentQuestion.text,
        category: room.currentQuestion.category,
        flagImage: room.currentQuestion.flagImage,
        choices: room.config?.gameMode === 'trivia' ? room.currentQuestion.choices : undefined,
        endTime: room.currentQuestionEndTime,
      });
      if (room.currentQuestion.flagImage && (
        room.config?.gameMode === 'trivia' ||
        room.config?.answerMode === 'written' ||
        room.answerRevealed
      )) {
        socket.emit('image-revealed', room.currentQuestion.flagImage);
      }
      if (room.buzzer) {
        const buzzedPlayer = room.players[room.buzzer];
        socket.emit('buzzed', {
          id: room.buzzer,
          name: buzzedPlayer ? buzzedPlayer.name : 'Unknown',
          equippedItems: buzzedPlayer ? buzzedPlayer.equippedItems : null,
          buzzerItem: room.hostEquippedItems?.buzzer || null,
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
        roundNumber: room.drawRoundNumber || 0,
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
    if (room.config?.gameMode === 'codenames') return;
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
    if (room.config?.gameMode === 'predict') {
      room.questionPrefetchGeneration = (room.questionPrefetchGeneration || 0) + 1;
      room.prefetching = false;
      room.prefetchPromise = null;
      room.prefetchedQuestion = null;
    }
    room.usedLifelines = {};
    room.lifelines = {};
    room.fiftyFiftyChoices = {};
    room.frozenPlayers = new Set();
    room.predictRound = 0;

    if (room.config.gameMode === 'draw') {
      room.drawnPlayers = [];
      room.drawRoundNumber = 0;
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
        cards: { yellow: 0, red: 0 },
        team: room.predictTeams?.[id] || null
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

    if (room.config?.gameMode === 'codenames') {
      try {
        codenames.startFromLobby(code, socket.id, { preview: process.env.BUZZIT_ENV === 'development' || ALLOW_SOLO_TEST || process.env.NODE_ENV === 'development' });
      } catch (error) {
        socket.emit('error', error.message || 'تعذر بدء كود سري الآن.');
      }
      return;
    }

    // A written Buzzer host competes and is already in room.players, so they
    // need only one joining opponent. A verbal Buzzer host is the judge and
    // needs two joining competitors. Both cases mean two active player slots,
    // but keep their errors explicit so the client and server describe the
    // same rule.
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    const minimumPlayers = room.config?.gameMode === 'draw' ? 1 : 2;
    if (!ALLOW_SOLO_TEST && activePlayersCount < minimumPlayers) {
      const isWrittenBuzzer = room.config?.gameMode === 'buzzer' && room.config?.answerMode === 'written';
      const isVerbalBuzzer = room.config?.gameMode === 'buzzer' && room.config?.answerMode === 'verbal';
      socket.emit('error', isWrittenBuzzer
        ? 'وضع الكتابة يحتاج لاعبًا واحدًا فقط معك لبدء اللعبة.'
        : isVerbalBuzzer
          ? 'وضع الشفاهية يحتاج لاعبين لأنك الحكم.'
          : 'لا يمكن بدء اللعبة بأقل من لاعبين!');
      return;
    }
    if (!ALLOW_SOLO_TEST && room.config?.gameMode === 'predict') {
      const teamError = validatePredictTeamSetup(room.players, room.predictTeams, room.config);
      if (teamError) {
        socket.emit('error', teamError);
        return;
      }
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
    if (room.config?.gameMode === 'codenames') return;
    await triggerEndGame(code, typeof payload === 'object' ? payload : {});
  });

  // لاعب دوس الباز
  socket.on('buzz', (code, acknowledge) => {
    const room = rooms[code];
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    if (!room || room.status !== 'PLAYING') {
      reply({ accepted: false, reason: 'room-not-playing' });
      return;
    }
    if (room.buzzer) {
      reply({ accepted: false, reason: 'already-buzzed', winnerId: room.buzzer });
      return;
    }
    // The answer is on everyone's screen now — no late buzzing.
    if (room.questionOver) {
      reply({ accepted: false, reason: 'question-over' });
      return;
    }

    const eligibleWrittenHost = room.config?.judgeMode === 'host'
      && socket.id === room.host
      && room.config?.answerMode === 'written';
    if (!room.players[socket.id] && !eligibleWrittenHost) {
      reply({ accepted: false, reason: 'not-a-player' });
      return;
    }

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
    room.buzzAcceptedAt = Date.now();
    reply({ accepted: true, winnerId: socket.id, acceptedAt: room.buzzAcceptedAt });

    // Check if timeLimit is set
    const timeLimit = room.config?.timeLimit || 0;
    
    if (timeLimit > 0) {
      scheduleBuzzTimeout(code, socket.id, timeLimit * 1000);
    }
    
    io.to(code).emit('buzzed', { 
      id: socket.id, 
      name: room.players[socket.id]?.name, 
      equippedItems: room.players[socket.id]?.equippedItems,
      buzzerItem: room.hostEquippedItems?.buzzer || null,
      timeLimit 
    });
  });

  // Room Chat Event
  socket.on('send-room-chat', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { code, text } = payload || {};
    if (!code || !text || typeof text !== 'string' || !text.trim()) {
      reply({ ok: false, message: 'اكتب رسالة قبل الإرسال.' });
      return;
    }
    const room = rooms[code];
    if (!room) {
      reply({ ok: false, message: 'الغرفة لم تعد متاحة.' });
      return;
    }

    const player = room.players[socket.id];
    const isHost = room.host === socket.id;
    if (!player && !isHost) {
      reply({ ok: false, message: 'لازم تكون داخل الغرفة لإرسال رسالة.' });
      return;
    }

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
    if (room.chatMessages.length > 100) room.chatMessages.splice(0, room.chatMessages.length - 100);
    io.to(code).emit('room-chat-received', msgObj);
    reply({ ok: true, messageId: msgObj.id });
  });

  // Room Voice Chat (Microphone Audio) Event
  socket.on('send-room-voice-chat', ({ code, audio, duration }) => {
    if (!code || !audio) return;
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
      audio,
      duration: duration || 3,
      type: 'voice',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    room.chatMessages.push(msgObj);
    if (room.chatMessages.length > 100) room.chatMessages.splice(0, room.chatMessages.length - 100);

    io.to(code).emit('room-chat-received', msgObj);
  });

  // Submit Buzzer Answer Event (Remote/Written Play)
  socket.on('submit-buzzer-answer', ({ code, answer }) => {
    if (!code || !answer) return;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING') return;

    if (room.buzzer !== socket.id) return;

    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer || trimmedAnswer.length > 200) return;
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
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'draw' || room.drawRoundEnded) return;
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
  
  // Predict & Trap: Player submits a trap
  require('./services/predictTyping').registerPredictTyping(socket, io, rooms);
  socket.on('request-predict-state', (code) => {
    const room = rooms[code];
    if (!room || room.config?.gameMode !== 'predict' || !room.players[socket.id]) return;
    emitPredictState(code, socket.id);
  });

  socket.on('submit-predict-answer', ({ code, answer } = {}, ack) => {
    const room = rooms[code];
    const reject = (message) => typeof ack === 'function' && ack({ ok: false, message });
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return reject('لم يتم العثور على الغرفة.');
    if (!room.players[socket.id] || room.players[socket.id].disconnected || !room.predictTeams?.[socket.id]) {
      return reject('أنت لست لاعباً نشطاً في هذه الغرفة.');
    }
    if (room.predictPhase !== 'write') return reject('وقت الإجابة انتهى.');
    if (room.predictAnswers?.[socket.id]) return reject('لقد قمت بإرسال إجابتك بالفعل.');
    if (typeof answer !== 'string' || !answer.trim() || answer.trim().length > 40) return reject('يجب أن تكون الإجابة نصاً بين 1 و 40 حرفاً.');
    
    room.predictAnswers = room.predictAnswers || {};
    room.predictAnswers[socket.id] = answer.trim();
    if (typeof ack === 'function') ack({ ok: true });
    emitPredictState(code); // Update for everyone to show answer counts or readiness
    
    maybeBeginPredictJudging(code);
  });

  socket.on('update-predict-judging', ({ code, rejectedPlayerIds } = {}, ack) => {
    const room = rooms[code];
    const reject = (message) => typeof ack === 'function' && ack({ ok: false, message });
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return reject('لم يتم العثور على الغرفة.');
    if (room.predictPhase !== 'judging') return reject('مرحلة المراجعة انتهت.');
    if (room.host !== socket.id) return reject('الهوست فقط هو من يراجع الإجابات.');
    const answerIds = new Set(Object.keys(room.predictAnswers || {}));
    const nextRejected = [...new Set(Array.isArray(rejectedPlayerIds) ? rejectedPlayerIds : [])]
      .filter((id) => answerIds.has(id));
    room.predictRejectedPlayerIds = nextRejected;

    if (typeof ack === 'function') ack({ ok: true });
    emitPredictState(code);
  });

  socket.on('submit-predict-judging', ({ code } = {}, ack) => {
    const room = rooms[code];
    const reject = (message) => typeof ack === 'function' && ack({ ok: false, message });
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return reject('لم يتم العثور على الغرفة.');
    if (room.predictPhase !== 'judging') return reject('مرحلة المراجعة انتهت.');
    if (room.host !== socket.id) return reject('الهوست فقط هو من يعتمد النتيجة.');
    if (typeof ack === 'function') ack({ ok: true });
    evaluatePredictAnswers(code, room.predictRejectedPlayerIds || [], { judgedBy: 'host' });
  });

  socket.on('advance-predict-round', async ({ code } = {}, ack) => {
    const room = rooms[code];
    const reject = (message) => typeof ack === 'function' && ack({ ok: false, message });
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict') return reject('لم يتم العثور على الغرفة.');
    if (room.predictPhase !== 'results') return reject('النتيجة غير جاهزة بعد.');
    if (room.host !== socket.id) return reject('الهوست فقط هو من يبدأ الجولة التالية.');

    room.predictPhase = 'advancing';
    if (typeof ack === 'function') ack({ ok: true });

    if (room.predictRound >= predictTotalRounds(room)) {
      triggerEndGame(code, { totalRounds: predictTotalRounds(room) });
    } else {
      await fetchAndSendNextQuestion(code);
    }
  });

  socket.on('submit-trivia-answer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'trivia') return;
    if (!room.currentQuestion || room.evaluatingTrivia || room.answerRevealed) return;
    if (room.currentQuestionEndTime && Date.now() > room.currentQuestionEndTime) return;
    if (!room.players[socket.id] || room.players[socket.id].disconnected || room.frozenPlayers?.has(socket.id)) return;

    if (!room.triviaAnswers) room.triviaAnswers = {};
    if (room.triviaAnswers[socket.id]) return; // Player already answered this round

    // Record the answer and time
    room.triviaAnswers[socket.id] = {
      answer,
      time: Date.now(),
      usedDouble: room.lifelines && room.lifelines[socket.id] === 'double',
      usedShield: room.lifelines && room.lifelines[socket.id] === 'shield',
    };

    // If everyone still able to answer has answered (frozen players can never
    // submit this round, so they shouldn't hold up early evaluation), evaluate immediately
    const activePlayersCount = Object.values(room.players).filter(p => !p.disconnected).length;
    const answeredCount = Object.keys(room.triviaAnswers).length;

    io.to(code).emit('trivia-answered-update', {
      count: answeredCount,
      total: activePlayersCount,
    });

    const frozenCount = room.frozenPlayers ? room.frozenPlayers.size : 0;
    if (answeredCount >= (activePlayersCount - frozenCount)) {
      evaluateTriviaRound(code);
    }
  });

  socket.on('set-lifeline-loadout', async ({ code, types } = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    const room = rooms[code];
    const allowedTypes = new Set(['freeze', 'double', 'fiftyFifty', 'shield']);
    const uniqueTypes = [...new Set(Array.isArray(types) ? types : [])];
    if (!room || room.status !== 'LOBBY' || room.config?.gameMode !== 'trivia') {
      return reply({ ok: false, message: 'اختيار الكروت متاح قبل بداية المباراة فقط.' });
    }
    if (room.config?.lifelinesEnabled === false) {
      return reply({ ok: false, message: 'كروت المساعدة معطّلة في هذه الغرفة.' });
    }
    if (!room.players[socket.id] || !socket.authUserId) return reply({ ok: false, message: 'سجّل دخولك أولًا.' });
    if (uniqueTypes.length > 3 || uniqueTypes.some((type) => !allowedTypes.has(type))) {
      return reply({ ok: false, message: 'اختار 3 كروت بحد أقصى.' });
    }
    const user = await User.findById(socket.authUserId).select('consumables').lean().catch(() => null);
    if (!user) return reply({ ok: false, message: 'تعذر قراءة مخزون الكروت.' });
    const availableCount = [...allowedTypes].filter((type) => Number(user.consumables?.[type] || 0) > 0).length;
    const requiredCount = Math.min(3, availableCount);
    if (uniqueTypes.length !== requiredCount) {
      return reply({ ok: false, message: `اختار ${requiredCount} كروت من الكروت الموجودة في مخزونك.` });
    }
    if (uniqueTypes.some((type) => Number(user.consumables?.[type] || 0) <= 0)) {
      return reply({ ok: false, message: 'ما ينفعش تختار كارت مش موجود في مخزونك.' });
    }
    if (!room.lifelineLoadouts) room.lifelineLoadouts = {};
    room.lifelineLoadouts[socket.id] = uniqueTypes;
    reply({ ok: true, types: uniqueTypes });
  });

  // استخدام كارت مساعدة (Lifeline)
  socket.on('use-lifeline', async ({ code, type } = {}, acknowledge = () => {}) => {
    const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
    const room = rooms[code];
    const allowedTypes = new Set(['freeze', 'double', 'fiftyFifty', 'shield']);
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'trivia') {
      return reply({ ok: false, message: 'الكارت مش متاح دلوقتي.' });
    }
    if (!room.players[socket.id] || room.players[socket.id].disconnected) {
      return reply({ ok: false, message: 'اللاعب مش نشط في الغرفة.' });
    }
    if (!allowedTypes.has(type)) return reply({ ok: false, message: 'نوع الكارت غير صحيح.' });
    if (!room.lifelineLoadouts?.[socket.id]?.includes(type)) return reply({ ok: false, message: 'الكارت ده مش ضمن التشكيلة اللي اخترتها.' });
    if (room.config?.lifelinesEnabled === false) return reply({ ok: false, message: 'كروت المساعدة مقفولة في المباراة.' });
    if (room.frozenPlayers?.has(socket.id)) return reply({ ok: false, message: 'أنت متجمّد في السؤال ده.' });
    if (room.triviaAnswers && room.triviaAnswers[socket.id]) return reply({ ok: false, message: 'ما ينفعش تستخدم كارت بعد الإجابة.' });

    if (!room.lifelines) room.lifelines = {};
    if (room.lifelines[socket.id]) return reply({ ok: false, message: 'مسموح بكارت مساعدة واحد في السؤال.' });
    if (!room.usedLifelines) room.usedLifelines = {};
    if (!room.usedLifelines[socket.id]) room.usedLifelines[socket.id] = {};
    const usedInMatch = room.usedLifelines[socket.id];
    if (usedInMatch[type]) return reply({ ok: false, message: 'الكارت ده استخدمته مرة في المباراة.' });
    if (Object.keys(usedInMatch).length >= 3) return reply({ ok: false, message: 'وصلت لحد 3 كروت في المباراة.' });
    if (!socket.authUserId) return reply({ ok: false, message: 'سجّل دخولك عشان تستخدم كروتك.' });
    if (!room.lifelinePending) room.lifelinePending = new Set();
    if (room.lifelinePending.has(socket.id)) return reply({ ok: false, message: 'استنى لحظة...' });
    room.lifelinePending.add(socket.id);

    let updatedUser;
    try {
      updatedUser = await User.findOneAndUpdate(
        { _id: socket.authUserId, [`consumables.${type}`]: { $gt: 0 } },
        { $inc: { [`consumables.${type}`]: -1 } },
        { returnDocument: 'after', select: 'consumables' }
      ).lean();
    } catch (error) {
      console.error('Failed to consume lifeline:', error.message);
      room.lifelinePending.delete(socket.id);
      return reply({ ok: false, message: 'تعذر استخدام الكارت. جرّب تاني.' });
    }
    room.lifelinePending.delete(socket.id);
    if (!updatedUser) return reply({ ok: false, message: 'معندكش رصيد من الكارت ده.' });

    // One card per question, one use per type, and three total per match.
    room.lifelines[socket.id] = type;
    room.usedLifelines[socket.id][type] = true;

    // Handle freeze lifeline effect — only freeze players who haven't answered yet
    if (type === 'freeze') {
      const freezerName = room.players[socket.id]?.name || 'لاعب';
      const alreadyAnswered = new Set(Object.keys(room.triviaAnswers || {}));
      if (!room.frozenPlayers) room.frozenPlayers = new Set();
      Object.entries(room.players).forEach(([playerId, player]) => {
        if (playerId !== socket.id && !player.disconnected && !alreadyAnswered.has(playerId)) {
          room.frozenPlayers.add(playerId);
          io.to(playerId).emit('player-frozen', freezerName);
        }
      });

      // Frozen players can never submit an answer this round — if everyone
      // who's still able to answer already has, evaluate immediately instead
      // of waiting for the full timer to expire.
      const activePlayerIds = Object.entries(room.players)
        .filter(([, player]) => !player.disconnected)
        .map(([playerId]) => playerId);
      const answerableCount = activePlayerIds.filter((playerId) => !room.frozenPlayers.has(playerId)).length;
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
        if (!room.fiftyFiftyChoices) room.fiftyFiftyChoices = {};
        room.fiftyFiftyChoices[socket.id] = toRemove;
        socket.emit('fifty-fifty-result', toRemove);
      }
    }

    // Send confirmation back
    const remaining = Number(updatedUser.consumables?.[type] || 0);
    socket.emit('lifeline-used', { type, remaining });
    reply({ ok: true, type, remaining, consumables: updatedUser.consumables });
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

    if (room.config?.gameMode === 'codenames') {
      if (room.status === 'PLAYING') return;
      io.to(playerId).emit('kicked', 'تم إخراجك من الغرفة بواسطة المضيف.');
      io.sockets.sockets.get(playerId)?.leave(code);
      codenames.depart(code, playerId, true);
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
      clearPredictPlayerState(room, playerId);

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
      if (room.config?.gameMode === 'predict') {
        io.to(code).emit('predict-teams-updated', room.predictTeams || {});
        maybeBeginPredictJudging(code);
        emitPredictState(code);
      }
      io.emit('public-rooms-update', getPublicRooms());
    } else {
      console.log(`kick-player error: player ${playerId} not found in room ${code}`);
    }
  });

  // تعديل إعدادات اللوبي قبل بدء المباراة. وضع اللعبة نفسه لا يتغير هنا
  // لأن تغيير قواعده بعد دخول اللاعبين يترك حالتهم غير صالحة.
  socket.on('update-room-config', async ({ code, config } = {}, acknowledge) => {
    const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
    const room = rooms[code];
    if (!room || room.host !== socket.id) return respond({ ok: false, message: 'ليس لديك صلاحية تعديل هذه الغرفة.' });
    if (room.status !== 'LOBBY') return respond({ ok: false, message: 'الإعدادات تُعدّل قبل بدء المباراة فقط.' });

    const incoming = config || {};
    const gameMode = room.config?.gameMode;
    const next = { ...room.config };
    const numeric = (key, min, max) => {
      if (incoming[key] === undefined) return true;
      const value = Number(incoming[key]);
      if (!Number.isInteger(value) || value < min || value > max) return false;
      next[key] = value;
      return true;
    };

    if (!numeric('winScore', 0, 100) || !numeric('timeLimit', 0, 300)) {
      return respond({ ok: false, message: 'قيمة الوقت أو النقاط غير صالحة.' });
    }
    if (incoming.isPrivate !== undefined) next.isPrivate = Boolean(incoming.isPrivate);
    if (incoming.difficulty !== undefined && ['easy', 'medium', 'hard', 'mixed'].includes(incoming.difficulty)) next.difficulty = incoming.difficulty;
    if (incoming.lifelinesEnabled !== undefined) next.lifelinesEnabled = Boolean(incoming.lifelinesEnabled);
    if (incoming.penaltyEnabled !== undefined) next.penaltyEnabled = Boolean(incoming.penaltyEnabled);
    if (gameMode === 'buzzer' && incoming.answerMode !== undefined && ['verbal', 'written'].includes(incoming.answerMode)) {
      next.answerMode = incoming.answerMode;
      if (next.answerMode === 'written') next.judgeMode = 'host';
    }
    if (incoming.judgeMode !== undefined) {
      const allowedJudges = gameMode === 'predict' ? ['host', 'ai'] : gameMode === 'draw' ? ['host', 'rotating'] : ['host', 'rotating'];
      if (!allowedJudges.includes(incoming.judgeMode)) return respond({ ok: false, message: 'طريقة التحكيم غير صالحة.' });
      if (!(gameMode === 'buzzer' && next.answerMode === 'written')) next.judgeMode = incoming.judgeMode;
    }
    if (gameMode === 'buzzer' && incoming.categories !== undefined) {
      if (!Array.isArray(incoming.categories) || incoming.categories.length === 0 || incoming.categories.length > 6) {
        return respond({ ok: false, message: 'اختر فئة واحدة على الأقل.' });
      }
      next.categories = incoming.categories.filter((category) => typeof category === 'string').slice(0, 6);
    }
    if (gameMode === 'predict' && incoming.maxPlayers !== undefined) {
      const maxPlayers = Number(incoming.maxPlayers);
      const activePlayers = Object.values(room.players).filter((player) => !player.disconnected).length;
      const teamA = Object.values(room.predictTeams || {}).filter((team) => team === 'A').length;
      const teamB = Object.values(room.predictTeams || {}).filter((team) => team === 'B').length;
      if (![2, 4, 6].includes(maxPlayers) || activePlayers > maxPlayers || teamA > maxPlayers / 2 || teamB > maxPlayers / 2) {
        return respond({ ok: false, message: 'لا يمكن تقليل عدد اللاعبين عن التوزيع الحالي.' });
      }
      next.maxPlayers = maxPlayers;
    }
    if (gameMode === 'codenames' && incoming.maxPlayers !== undefined) {
      const maxPlayers = Number(incoming.maxPlayers);
      const activePlayers = Object.values(room.players).filter((player) => !player.disconnected).length;
      const redPlayers = Object.values(room.codenames?.teams || {}).filter((team) => team === 'red').length;
      const bluePlayers = Object.values(room.codenames?.teams || {}).filter((team) => team === 'blue').length;
      if (![4, 6, 8].includes(maxPlayers) || activePlayers > maxPlayers || redPlayers > maxPlayers / 2 || bluePlayers > maxPlayers / 2) {
        return respond({ ok: false, message: 'لا يمكن تقليل عدد اللاعبين عن توزيع الفرق الحالي.' });
      }
      next.maxPlayers = maxPlayers;
    }
    if (gameMode === 'predict' && next.judgeMode === 'ai') {
      const aiStatus = await aiJudge.getStatus({ probe: true });
      if (!aiStatus.available) return respond({ ok: false, message: 'تحكيم الـAI غير متاح حاليًا.' });
    }

    room.config = next;
    io.to(code).emit('room-config-updated', next);
    if (gameMode === 'codenames') codenames.sync(code);
    io.emit('public-rooms-update', getPublicRooms());
    respond({ ok: true, config: next });
  });

  // خروج لاعب أو حكم بمزاجه
  socket.on('leave-room', (code, acknowledge) => {
    const respond = typeof acknowledge === 'function' ? acknowledge : () => {};
    const room = rooms[code];
    if (!room) return respond({ ok: true });
    if (room.config?.gameMode === 'codenames') {
      socket.leave(code);
      codenames.depart(code, socket.id, true);
      return respond({ ok: true });
    }

    // Leaving an active two-player chess room is an authoritative resignation.
    // This lives on the server so a modified client cannot avoid the loss.
    if (room.config?.gameMode === 'chess' && !room.chessGameOver) {
      const activeChessPlayers = Object.entries(room.players || {})
        .filter(([, player]) => !player.disconnected);
      if (activeChessPlayers.length >= 2 && room.players?.[socket.id]) {
        const hostColor = room.config?.playerColor === 'b' ? 'b' : 'w';
        const leavingColor = socket.id === room.host ? hostColor : (hostColor === 'w' ? 'b' : 'w');
        const winner = leavingColor === 'w' ? 'b' : 'w';
        room.chessGameOver = {
          winner,
          reason: 'غادر المنافس المباراة؛ تم احتساب الفوز بالانسحاب.',
          icon: 'flag-outline',
        };
        socket.to(code).emit('chess_game_over_received', room.chessGameOver);
      }
    }

    // A Predict host is also a player, but their explicit exit must migrate
    // control to a real connected player. Converting that host seat to AI
    // first used to leave an AI socket as the room host with no human judge.
    if (room.status === 'PLAYING' && room.config?.gameMode === 'predict' && room.host !== socket.id && room.players[socket.id]) {
      socket.leave(code);
      movePredictSeatToAi(code, socket.id);
      io.emit('public-rooms-update', getPublicRooms());
      return respond({ ok: true });
    }

    if (room.host === socket.id) {
      // Host explicitly left! Remove their old participant record before
      // migration, otherwise it remains visible as a ghost player.
      if (room.config?.gameMode === 'predict' && room.players[socket.id]) {
        delete room.players[socket.id];
        delete room.scores[socket.id];
        delete room.correct[socket.id];
        delete room.wrong[socket.id];
        if (room.cards) delete room.cards[socket.id];
        clearPredictPlayerState(room, socket.id);
        io.to(code).emit('player-removed', { id: socket.id });
      } else if (room.players[socket.id]) {
        delete room.players[socket.id];
        delete room.scores[socket.id];
        delete room.correct[socket.id];
        delete room.wrong[socket.id];
        if (room.cards) delete room.cards[socket.id];
        io.to(code).emit('player-removed', { id: socket.id });
      }
      const migrated = migrateHost(code);

      if (migrated && room.config?.gameMode === 'predict') {
        io.to(code).emit('predict-teams-updated', room.predictTeams || {});
        maybeBeginPredictJudging(code);
      }
      
      if (!migrated) {
        // Remove the host first. Otherwise io.to(code) also sends the
        // room-closed event back to the person who explicitly chose to leave,
        // which makes the client show a misleading second popup after exit.
        socket.leave(code);
        io.to(code).emit('room-closed', 'تم إنهاء الغرفة بواسطة الحكم وعدم وجود لاعبين.');
        const clients = io.sockets.adapter.rooms.get(code);
        if (clients) {
          for (const clientId of clients) {
            const clientSocket = io.sockets.sockets.get(clientId);
            if (clientSocket) clientSocket.leave(code);
          }
        }
        clearRoomTimers(room);
        delete rooms[code];
      }
      socket.leave(code);
      io.emit('public-rooms-update', getPublicRooms());
      respond({ ok: true });
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
      clearPredictPlayerState(room, socket.id);
      
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
      if (room.config?.gameMode === 'predict') {
        io.to(code).emit('predict-teams-updated', room.predictTeams || {});
        maybeBeginPredictJudging(code);
        emitPredictState(code);
      }
      io.emit('public-rooms-update', getPublicRooms());
      respond({ ok: true });
    }
  });

  // === DRAW & GUESS EVENTS ===
  socket.on('draw-stroke', (data) => {
    const { code, stroke } = data;
    const room = rooms[code];
    // Only the active drawer may draw — otherwise anyone can scribble over the round.
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'draw' || room.drawRoundEnded || room.drawerId !== socket.id) return;
    if (!stroke || typeof stroke.path !== 'string' || stroke.path.length > 50000) return;
    if (stroke.color !== undefined && (typeof stroke.color !== 'string' || stroke.color.length > 20)) return;
    if (stroke.width !== undefined && (!Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 50)) return;
    
    // Drawer is active, clear AFK timer
    if (room.afkTimer) {
      clearTimeout(room.afkTimer);
      room.afkTimer = null;
    }

    if (!room.drawStrokes) room.drawStrokes = [];
    if (room.drawStrokes.length >= 2000) return;
    room.drawStrokes.push(stroke);
    socket.to(code).emit('draw-update', stroke);
  });

  // Real-time live stroke broadcast (throttled on client, ~30fps)
  socket.on('draw-stroke-live', (data) => {
    const { code, stroke } = data;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'draw' || room.drawRoundEnded || room.drawerId !== socket.id) return;
    if (stroke !== null && (
      !stroke ||
      typeof stroke.path !== 'string' ||
      stroke.path.length > 50000 ||
      (stroke.color !== undefined && (typeof stroke.color !== 'string' || stroke.color.length > 20)) ||
      (stroke.width !== undefined && (!Number.isFinite(stroke.width) || stroke.width < 1 || stroke.width > 50))
    )) return;
    socket.to(code).emit('draw-update-live', stroke); // stroke is null to clear, or object to show
  });

  socket.on('clear-canvas', (code) => {
    const room = rooms[code];
    // Only the active drawer (or the judge) may wipe the canvas.
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'draw' || room.drawRoundEnded || (room.drawerId !== socket.id && room.host !== socket.id)) return;
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

  socket.on('draw-guess', (data, acknowledge = () => {}) => {
    const { code, guess } = data;
    const playerId = socket.id;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config.gameMode !== 'draw') {
      return acknowledge({ accepted: false, message: 'الجولة مش متاحة دلوقتي.' });
    }
    if (!room.currentDrawWord || room.drawRoundEnded || (room.drawRoundTimer === null && room.drawRoundNumber > 0 && room.drawRoundEndData)) {
      return acknowledge({ accepted: false, message: 'الجولة انتهت.' });
    }
    if (!room.correctGuessers) room.correctGuessers = new Set();

    // Drawer can't guess, already-correct players can't spam
    if (socket.id === room.drawerId) return acknowledge({ accepted: false, message: 'الرسام ما ينفعش يخمّن.' });
    if (room.correctGuessers.has(playerId)) return acknowledge({ accepted: false, message: 'إنت خمّنت الكلمة صح بالفعل.' });
    // Only actual competitors score, otherwise a spectator creates a phantom entry
    if (!room.players[playerId] || room.players[playerId].disconnected) return acknowledge({ accepted: false, message: 'الاتصال بالغرفة لسه بيرجع.' });
    if (typeof guess !== 'string' || !guess.trim()) {
      return acknowledge({ accepted: false, message: 'اكتب تخمين الأول.' });
    }
    if (guess.length > 120) {
      return acknowledge({ accepted: false, message: 'التخمين طويل زيادة.' });
    }

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
      acknowledge({ accepted: true, correct: true });
    } else {
      // Wrong guess → broadcast as normal chat
      room.wrong[playerId] = (room.wrong[playerId] || 0) + 1;
      io.to(code).emit('draw-chat', { playerId, guess });
      acknowledge({ accepted: true, correct: false });
    }
  });

  // لاعب اتفصل
  socket.on('disconnect', () => {
    const soloGameId = activeSoloPlayers[socket.id];
    if (soloGameId) {
      soloStats[soloGameId] = Math.max(0, (soloStats[soloGameId] || 0) - 1);
      delete activeSoloPlayers[socket.id];
      io.to('home_screen').emit('solo_stats_update', soloStats);
    }

    if (socket.userId && connectedUsers.get(socket.userId) === socket.id) {
      connectedUsers.delete(socket.userId);
    }

    let publicRoomsChanged = false;
    for (const code in rooms) {
      const room = rooms[code];
      const isPlayer = !!room.players[socket.id];
      const isHost = room.host === socket.id;
      if (room.config?.gameMode === 'codenames') {
        codenames.depart(code, socket.id, false);
        continue;
      }

      if (isPlayer) {
        // Player disconnected - don't delete, mark as disconnected
        room.players[socket.id].disconnected = true;
        const name = room.players[socket.id].name;
        // Every player needs the presence update so all game views can keep
        // the seat visible and mark it as away.
        io.to(code).emit('player-left', { id: socket.id, name });
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

        // Give a backgrounded drawer a short reconnect window, then end the
        // abandoned round so every guesser is not stuck until the full timer.
        if (room.config?.gameMode === 'draw' && room.status === 'PLAYING' && room.drawerId === socket.id) {
          if (room.drawDrawerDisconnectTimer) clearTimeout(room.drawDrawerDisconnectTimer);
          const disconnectedDrawerId = socket.id;
          room.drawDrawerDisconnectTimer = setTimeout(() => {
            const currentRoom = rooms[code];
            if (!currentRoom || currentRoom.status !== 'PLAYING' || currentRoom.drawerId !== disconnectedDrawerId) return;
            const drawer = currentRoom.players[disconnectedDrawerId];
            if (drawer && !drawer.disconnected) return;
            io.to(code).emit('draw-chat', {
              playerId: null,
              guess: 'الرسّام ما رجعش، فالجولة انتهت.',
              isSystem: true,
            });
            currentRoom.drawDrawerDisconnectTimer = null;
            endDrawRound(code);
          }, 10000);
        }

        if (room.votesToPlayAgain?.has(socket.id)) {
          room.votesToPlayAgain.delete(socket.id);
          const activeCount = Object.values(room.players).filter(pl => !pl.disconnected).length;
          io.to(code).emit('vote-count-updated', room.votesToPlayAgain.size, activeCount);
        }

        // In Predict, keep the team seat alive. A short grace period lets a
        // backgrounded phone reconnect; afterward AI temporarily controls the
        // same player id, team and score instead of shrinking the round.
        const predictReplacementScheduled = schedulePredictAiReplacement(code, socket.id);
        if (!predictReplacementScheduled) maybeBeginPredictJudging(code);
      }

      // Checked independently of isPlayer: in trivia/draw the host is also
      // added to room.players, so both branches must be able to run —
      // otherwise a host-who-is-a-player disconnecting never starts the
      // host-reconnect timer, and the room never gets cleaned up (BUG: ghost rooms).
      if (isHost) {
        // Host disconnected - wait for them to reconnect
        room.hostDisconnected = true;
        io.to(code).emit('host-disconnected', { hostId: room.host });
        io.to(code).emit('host-connection-status', { hostId: room.host, online: false });

        // Give the host a short window to return from a background app, then
        // migrate the room instead of leaving everyone waiting over a minute.
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
              clearRoomTimers(rooms[code]);
              delete rooms[code];
            }
            io.emit('public-rooms-update', getPublicRooms());
          }
        }, 30000); // 30 seconds

        publicRoomsChanged = true;
      }
    }
    if (publicRoomsChanged) {
      io.emit('public-rooms-update', getPublicRooms());
    }
  });

  // Re-join as host
  socket.on('rejoin-host', (code, acknowledge) => {
    const hasAcknowledge = typeof acknowledge === 'function';
    const respond = (payload) => hasAcknowledge && acknowledge(payload);
    const room = rooms[code];
    if (!room) {
      respond({ ok: false, reason: 'ROOM_NOT_FOUND' });
      if (!hasAcknowledge) socket.emit('room-restore-failed', { reason: 'ROOM_NOT_FOUND' });
      return;
    }
    if (room) {
      if (room.hostUserId && String(room.hostUserId) !== socket.authUserId) {
        // Predict hosts also play. If the migration timeout already promoted
        // somebody else, let the former host reconnect through the normal
        // player path so their team, answer and score are migrated safely.
        const formerPlayer = Object.values(room.players).find((player) => (
          (player.disconnected || player.aiControlled)
          && player.userId
          && String(player.userId) === socket.authUserId
        ));
        if (formerPlayer) {
          socket.emit('host-migrated-to-player', { code, playerName: formerPlayer.name });
          respond({ ok: true, code, role: 'player', migrated: true, status: room.status });
        } else {
          respond({ ok: false, reason: 'HOST_CHANGED' });
          if (!hasAcknowledge) socket.emit('room-restore-failed', { reason: 'HOST_CHANGED' });
        }
        return;
      }
      if (room.hostTimeout) clearTimeout(room.hostTimeout);

      const previousHostId = room.host;
      const participatingHostId = room.players[previousHostId]
        ? previousHostId
        : Object.keys(room.players).find((id) => (
          room.hostUserId && String(room.players[id].userId) === String(room.hostUserId)
        ));
      if (participatingHostId) cancelPredictAiTakeover(room, participatingHostId);

      // In trivia, draw and written-buzzer modes the host is also a scored
      // player. Socket.IO assigns a new id after reconnecting, so migrate every
      // piece of player state instead of leaving a ghost with the old score and
      // treating the new host as a zero-score player.
      if (participatingHostId && participatingHostId !== socket.id) {
        if (!room.cards) room.cards = {};
        room.players[socket.id] = room.players[participatingHostId];
        room.players[socket.id].disconnected = false;
        room.players[socket.id].aiControlled = false;
        room.players[socket.id].name = room.hostName;
        room.players[socket.id].userId = room.hostUserId || room.players[socket.id].userId || null;
        room.players[socket.id].equippedItems = room.hostEquippedItems || room.players[socket.id].equippedItems || null;
        room.scores[socket.id] = room.scores[participatingHostId] || 0;
        room.correct[socket.id] = room.correct[participatingHostId] || 0;
        room.wrong[socket.id] = room.wrong[participatingHostId] || 0;
        room.cards[socket.id] = room.cards?.[participatingHostId] || { yellow: 0, red: 0 };

        for (const stateMap of [room.triviaAnswers, room.usedLifelines, room.lifelines, room.fiftyFiftyChoices]) {
          if (stateMap?.[participatingHostId]) {
            stateMap[socket.id] = stateMap[participatingHostId];
            delete stateMap[participatingHostId];
          }
        }

        rebindBuzzTimeout(code, participatingHostId, socket.id);
        if (room.drawerId === participatingHostId) {
          room.drawerId = socket.id;
          if (room.drawDrawerDisconnectTimer) {
            clearTimeout(room.drawDrawerDisconnectTimer);
            room.drawDrawerDisconnectTimer = null;
          }
        }
        if (room.votesToPlayAgain?.delete(participatingHostId)) room.votesToPlayAgain.add(socket.id);
        if (room.correctGuessers?.delete(participatingHostId)) room.correctGuessers.add(socket.id);
        if (room.frozenPlayers?.delete(participatingHostId)) room.frozenPlayers.add(socket.id);
        if (room.drawnPlayers) {
          room.drawnPlayers = room.drawnPlayers.map((id) => id === participatingHostId ? socket.id : id);
        }
        if (room.lifelineLoadouts?.[participatingHostId]) {
          room.lifelineLoadouts[socket.id] = room.lifelineLoadouts[participatingHostId];
          delete room.lifelineLoadouts[participatingHostId];
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

        migratePredictPlayerId(room, participatingHostId, socket.id);
        codenames.remap(room, participatingHostId, socket.id);

      }

      room.host = socket.id;
      room.hostDisconnected = false;
      if (room.players[socket.id]) {
        room.players[socket.id].disconnected = false;
        room.players[socket.id].aiControlled = false;
      }
      socket.join(code);
      if (room.config?.gameMode === 'predict' && participatingHostId && participatingHostId !== socket.id) {
        io.to(code).emit('predict-player-id-migrated', {
          previousId: participatingHostId,
          nextId: socket.id,
        });
      }
      
      // Emit full state so host screen doesn't reset to LOBBY
      socket.emit('host-rejoined-state', {
        code,
        status: room.status,
        hostId: room.host,
        judge: judgeInfo(room),
        config: room.config,
        players: Object.entries(room.players).map(([id, p]) => ({
          id,
          name: p.name,
          userId: p.userId || null,
          score: room.scores[id] || 0,
          correctAnswers: room.correct[id] || 0,
          wrongAnswers: room.wrong[id] || 0,
          disconnected: p.disconnected,
          equippedItems: p.equippedItems,
          xp: p.xp || 0,
          level: p.level || 1,
          cards: room.cards?.[id] || { yellow: 0, red: 0 }
        })),
        currentQuestion: room.currentQuestion ? {
          id: room.currentQuestion._id,
          text: room.currentQuestion.text,
          category: room.currentQuestion.category,
          flagImage: room.currentQuestion.flagImage,
          choices: room.config?.gameMode === 'trivia' ? room.currentQuestion.choices : undefined,
          endTime: room.currentQuestionEndTime,
        } : null,
        predictTeams: room.predictTeams,
        lifelineLoadout: room.lifelineLoadouts?.[socket.id] || [],
        chatMessages: room.chatMessages || [],
        // Written mode: the judge plays like everyone else, so reconnecting
        // must never hand them the answer.
        answer: room.currentQuestion && room.config?.answerMode !== 'written'
          ? room.currentQuestion.answer
          : null,
        buzzer: room.buzzer,
        buzzTimeLimit: room.buzzEndTime
          ? Math.max(0, Math.ceil((room.buzzEndTime - Date.now()) / 1000))
          : 0,
      });

      if (room.players[socket.id]) {
        io.to(code).emit('player-rejoined', {
          id: socket.id,
          previousId: participatingHostId && participatingHostId !== socket.id ? participatingHostId : null,
          name: room.players[socket.id].name,
          userId: room.players[socket.id].userId || null,
          score: room.scores[socket.id] || 0,
          equippedItems: room.players[socket.id].equippedItems,
          team: room.predictTeams?.[socket.id] || null,
          cards: room.cards?.[socket.id] || { yellow: 0, red: 0 },
        });
      }

      // Drawing mode has no currentQuestion, so the generic host state above
      // is not enough to rebuild the active round after Android resumes.
      if (room.status === 'PLAYING' && room.config?.gameMode === 'draw') {
        const timeElapsed = (Date.now() - (room.roundStartTime || Date.now())) / 1000;
        const timeLimit = room.config.timeLimit || 60;
        const timeLeft = Math.max(0, Math.ceil(timeLimit - timeElapsed));
        const maskedWord = room.currentDrawWord
          ? room.currentDrawWord.split('').map((c) => c === ' ' ? ' ' : '_').join(' ')
          : '';
        socket.emit('draw-round-start', {
          drawerId: room.drawerId,
          roundNumber: room.drawRoundNumber || 0,
          wordLength: room.currentDrawWord?.length || 0,
          maskedWord,
          timeLimit,
          timeLeft,
        });
        if (socket.id === room.drawerId) socket.emit('draw-word', { word: room.currentDrawWord });
        socket.emit('draw-sync-canvas', room.drawStrokes || []);
      }

      if (room.status === 'PLAYING' && room.currentQuestion?.flagImage && (
        room.config?.gameMode === 'trivia' ||
        room.config?.answerMode === 'written' ||
        room.answerRevealed
      )) {
        socket.emit('image-revealed', room.currentQuestion.flagImage);
      }

      if (room.status === 'PLAYING' && room.config?.gameMode === 'trivia' && room.players[socket.id]) {
        socket.emit('trivia-state-restored', {
          answer: room.triviaAnswers?.[socket.id]?.answer || null,
          usedLifelines: room.usedLifelines?.[socket.id] || {},
          removedChoices: room.fiftyFiftyChoices?.[socket.id] || [],
          frozen: room.frozenPlayers?.has(socket.id) || false,
        });
      }

      if (room.status === 'PLAYING' && room.config?.gameMode === 'predict') {
        emitPredictState(code, socket.id);
      }

      if (room.status === 'RESULTS' && room.gameSummary) {
        socket.emit('game-ended', room.gameSummary);
      }

      // Keep the legacy event for installed clients, and send a stateful
      // companion event so current clients can reliably clear an already
      // visible disconnect timer as soon as the host is restored.
      io.to(code).emit('host-rejoined', { hostId: room.host });
      io.to(code).emit('host-connection-status', { hostId: room.host, online: true });
      codenames.presence(code);
      respond({ ok: true, code, role: 'host', status: room.status });
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BuzzIt running on http://localhost:${PORT}`);
});
