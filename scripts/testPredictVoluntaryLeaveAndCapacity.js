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

async function waitForPredictState(socket, predicate, timeoutMs = 20000) {
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
  const [hostAuth, playerAuth, outsiderAuth] = await Promise.all([
    login('devplayer1@example.com'),
    login('devplayer2@example.com'),
    login('devplayer3@example.com'),
  ]);
  const host = await connect(hostAuth.token);
  const player = await connect(playerAuth.token);
  const outsider = await connect(outsiderAuth.token);

  try {
    const roomCreated = once(host, 'room-created');
    host.emit('create-room', {
      hostName: hostAuth.user.username,
      hostUserId: hostAuth.user._id,
      config: { gameMode: 'predict', judgeMode: 'host', maxPlayers: 2, winScore: 4, timeLimit: 30, isPrivate: false },
    });
    const { code } = await roomCreated;
    const joined = await emitAck(player, 'join-room', {
      code,
      playerName: playerAuth.user.username,
      userId: playerAuth.user._id,
    });
    if (!joined?.ok) throw new Error(`Player join failed: ${JSON.stringify(joined)}`);
    const teamAck = await emitAck(player, 'set-predict-team', { code, team: 'B' });
    if (!teamAck?.ok) throw new Error(`Team assignment failed: ${JSON.stringify(teamAck)}`);

    const publicRoomsPromise = once(outsider, 'public-rooms-update');
    outsider.emit('get-public-rooms');
    const publicRooms = await publicRoomsPromise;
    const publicRoom = publicRooms.find((entry) => entry.code === code);
    if (!publicRoom) throw new Error('Public room was not listed');
    if (publicRoom.playerCount !== 2 || publicRoom.maxPlayers !== 2 || !publicRoom.isFull || publicRoom.joinable) {
      throw new Error(`Wrong public capacity: ${JSON.stringify(publicRoom)}`);
    }

    const outsiderJoin = await emitAck(outsider, 'join-room', {
      code,
      playerName: outsiderAuth.user.username,
      userId: outsiderAuth.user._id,
    });
    if (outsiderJoin?.ok || outsiderJoin?.reason !== 'ROOM_FULL') {
      throw new Error(`Full-room guard failed: ${JSON.stringify(outsiderJoin)}`);
    }

    const writeStatePromise = waitForPredictState(host, (state) => state.phase === 'write');
    host.emit('start-game', code);
    await writeStatePromise;

    const oldPlayerId = player.id;
    const aiTakeoverPromise = waitForPredictState(host, (state) => (
      state.teams?.B?.some((entry) => entry.name === playerAuth.user.username && entry.aiControlled)
    ));
    player.emit('leave-room', code);
    const takeoverState = await aiTakeoverPromise;
    const aiSeat = takeoverState.teams.B.find((entry) => entry.name === playerAuth.user.username);
    if (!aiSeat || aiSeat.id === oldPlayerId) throw new Error('Voluntary leave did not detach the AI seat from the live socket');

    let staleStateDelivered = false;
    const staleHandler = () => { staleStateDelivered = true; };
    player.on('predict-state', staleHandler);
    host.emit('request-predict-state', code);
    await new Promise((resolve) => setTimeout(resolve, 500));
    player.off('predict-state', staleHandler);
    if (staleStateDelivered) throw new Error('Old room state leaked to the player after voluntary leave');

    const restoredStatePromise = waitForPredictState(player, (state) => (
      state.myTeam === 'B'
      && state.teams?.B?.some((entry) => entry.id === player.id && !entry.aiControlled)
    ));
    const restored = await emitAck(player, 'join-room', {
      code,
      playerName: playerAuth.user.username,
      userId: playerAuth.user._id,
    });
    if (!restored?.ok) throw new Error(`Seat restore failed: ${JSON.stringify(restored)}`);
    const restoredState = await restoredStatePromise;
    if (!restoredState.teams.B.some((entry) => entry.name === playerAuth.user.username)) {
      throw new Error('Player name was not restored');
    }

    console.log(JSON.stringify({
      ok: true,
      publicCapacity: '2/2',
      fullRoomRejected: true,
      aiSeatDetachedFromSocket: true,
      noOldRoomEventLeak: true,
      playerNameRestored: true,
      playerTeamRestored: restoredState.myTeam,
    }, null, 2));
  } finally {
    host.disconnect();
    player.disconnect();
    outsider.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
