const axios = require('axios');
const { io } = require('../../BuzzIt-App/node_modules/socket.io-client');

const BASE_URL = process.env.TEST_SERVER_URL || 'http://localhost:4000';

function once(socket, event, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function emitAck(socket, event, payload, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function login(email) {
  const response = await axios.post(`${BASE_URL}/api/auth/login`, {
    email,
    password: 'DevTest123!',
  });
  return response.data;
}

async function connect(token) {
  const socket = io(BASE_URL, { auth: { token }, transports: ['websocket'] });
  await once(socket, 'connect');
  return socket;
}

async function waitForPredictState(socket, predicate, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('predict-state', handler);
      reject(new Error('Timed out waiting for matching predict state'));
    }, timeoutMs);
    const handler = (state) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      socket.off('predict-state', handler);
      resolve(state);
    };
    socket.on('predict-state', handler);
  });
}

async function main() {
  const hostAuth = await login('devplayer1@example.com');
  const playerAuth = await login('devplayer2@example.com');
  let host = await connect(hostAuth.token);
  let player = await connect(playerAuth.token);

  try {
    const roomCreated = once(host, 'room-created');
    host.emit('create-room', {
      hostName: hostAuth.user.username,
      hostUserId: hostAuth.user._id,
      config: { gameMode: 'predict', judgeMode: 'host', maxPlayers: 2, winScore: 4, timeLimit: 30, isPrivate: true },
    });
    const { code } = await roomCreated;
    const joined = await emitAck(player, 'join-room', {
      code,
      playerName: playerAuth.user.username,
      userId: playerAuth.user._id,
    });
    if (!joined?.ok) throw new Error(`Join failed: ${JSON.stringify(joined)}`);
    const teamAck = await emitAck(player, 'set-predict-team', { code, team: 'B' });
    if (!teamAck?.ok) throw new Error(`Team assignment failed: ${JSON.stringify(teamAck)}`);

    const writeStatePromise = waitForPredictState(host, (state) => state.phase === 'write');
    host.emit('start-game', code);
    await writeStatePromise;
    const oldPlayerId = player.id;
    player.disconnect();

    const takeoverState = await waitForPredictState(host, (state) => (
      state.teams?.B?.some((entry) => entry.id === oldPlayerId && entry.aiControlled)
    ));
    const takeoverPlayer = takeoverState.teams.B.find((entry) => entry.id === oldPlayerId);
    if (takeoverPlayer.name !== playerAuth.user.username) throw new Error('AI did not preserve the player name');

    const botAnsweredState = await waitForPredictState(host, (state) => (
      state.submittedPlayerIds?.includes(oldPlayerId)
    ));
    const scoreBefore = botAnsweredState.teamScores?.B || 0;

    player = await connect(playerAuth.token);
    const restoredStatePromise = waitForPredictState(player, (state) => (
      state.myTeam === 'B' && state.teams?.B?.some((entry) => entry.id === player.id && !entry.aiControlled)
    ));
    const restored = await emitAck(player, 'join-room', {
      code,
      playerName: playerAuth.user.username,
      userId: playerAuth.user._id,
      restore: true,
    });
    if (!restored?.ok) throw new Error(`Restore failed: ${JSON.stringify(restored)}`);
    const restoredState = await restoredStatePromise;
    if ((restoredState.teamScores?.B || 0) !== scoreBefore) throw new Error('Score changed during seat restoration');
    if (!restoredState.submitted) throw new Error('The bot answer was not migrated to the returning player');

    const hostScoreBefore = restoredState.teamScores?.A || 0;
    const hostChangedPromise = once(player, 'host-changed', 25000);
    host.disconnect();
    const hostChanged = await hostChangedPromise;
    if (hostChanged.hostId !== player.id) throw new Error('A human player was not promoted after the host left');

    host = await connect(hostAuth.token);
    const migratedHost = await emitAck(host, 'rejoin-host', code);
    if (!migratedHost?.ok || migratedHost.role !== 'player') {
      throw new Error(`Former host was not redirected to their AI-controlled seat: ${JSON.stringify(migratedHost)}`);
    }
    const hostRestoredStatePromise = waitForPredictState(host, (state) => (
      state.myTeam === 'A' && state.teams?.A?.some((entry) => entry.id === host.id && !entry.aiControlled)
    ));
    const hostSeatRestore = await emitAck(host, 'join-room', {
      code,
      playerName: hostAuth.user.username,
      userId: hostAuth.user._id,
      restore: true,
    });
    if (!hostSeatRestore?.ok) throw new Error(`Former host seat restore failed: ${JSON.stringify(hostSeatRestore)}`);
    const hostRestoredState = await hostRestoredStatePromise;
    if ((hostRestoredState.teamScores?.A || 0) !== hostScoreBefore) throw new Error('Former host score changed during restoration');

    console.log(JSON.stringify({
      ok: true,
      roomCode: code,
      aiPreservedName: true,
      aiSubmittedAnswer: true,
      playerRestoredTeam: restoredState.myTeam,
      playerRestoredSubmission: restoredState.submitted,
      scorePreserved: true,
      humanHostMigration: true,
      formerHostSeatRestored: true,
    }, null, 2));
  } finally {
    host.disconnect();
    player.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
