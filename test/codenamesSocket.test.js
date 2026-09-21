const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
let client;
try { client = require('socket.io-client').io; }
catch { try { client = require('../../BuzzIt-App/node_modules/socket.io-client').io; } catch {} }
const { createCodenamesService } = require('../services/codenamesGame');

test('four live sockets play with isolated secret maps, private chat and reconnect recovery', { timeout: 15000, skip: !client && 'socket.io-client needed for local integration test' }, async t => {
  const server = http.createServer();
  const io = new Server(server);
  const code = 'TEST1';
  const room = { code, status: 'LOBBY', config: { gameMode: 'codenames', timeLimit: 0 }, players: {}, scores: {}, correct: {}, wrong: {}, cards: {} };
  const rooms = { [code]: room }, clients = [];
  const service = createCodenamesService({ io, rooms, publicUpdate() {}, migrateHost() {
    room.host = Object.keys(room.players).find(id => !room.players[id].disconnected) || room.host;
  } });
  io.on('connection', socket => {
    const name = socket.handshake.auth.name;
    const old = Object.keys(room.players).find(id => room.players[id].name === name);
    room.players[socket.id] = { name, disconnected: false };
    if (old) { service.remap(room, old, socket.id); delete room.players[old]; }
    if (!room.host) room.host = socket.id;
    socket.join(code); service.register(socket); service.presence(code);
    socket.on('disconnect', () => service.depart(code, socket.id, false));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    delete rooms[code];
    for (const key of ['codenamesTimer', 'codenamesPauseTimer', 'codenamesCleanupTimer']) clearTimeout(room[key]);
    clients.forEach(s => s.disconnect());
    await new Promise(resolve => io.close(resolve));
  });
  async function connect(name) {
    const s = client(`http://127.0.0.1:${server.address().port}`, { auth: { name }, transports: ['websocket'], reconnection: false });
    clients.push(s); s.on('codenames-state', state => s.state = state);
    await new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
    await action(s, 'sync'); return s;
  }
  async function action(s, action, extra = {}) {
    return s.timeout(3000).emitWithAck('codenames-action', { code, action, matchId: s.state?.matchId, revision: s.state?.revision, ...extra });
  }
  const [a, b, c, d] = [await connect('a'), await connect('b'), await connect('c'), await connect('d')];
  assert.equal((await action(a, 'start')).ok, true);
  for (const s of clients) await action(s, 'sync');
  const captain = clients.find(s => s.state.isCaptain && s.state.team === room.codenames.turn);
  const guesser = clients.find(s => !s.state.isCaptain && s.state.team === room.codenames.turn);
  const enemy = clients.find(s => s.state.team !== room.codenames.turn && !s.state.isCaptain);
  assert(guesser.state.board.every(c => c.color === null));
  assert(captain.state.board.every(c => c.color));
  assert.equal((await action(guesser, 'clue', { word: 'ارتباط', count: 2 })).ok, false);
  assert.equal((await action(captain, 'clue', { word: 'ارتباط', count: 2 })).ok, true);
  await action(guesser, 'sync');
  assert.equal((await action(guesser, 'chat', { text: 'رسالة خاصة' })).ok, true);
  await action(enemy, 'sync'); assert.equal(enemy.state.messages.length, 0);
  const index = room.codenames.board.findIndex(c => c.color === room.codenames.turn);
  assert.equal((await action(guesser, 'guess', { index })).ok, true);
  await action(enemy, 'sync');
  assert.equal(enemy.state.board[index].revealed, true);
  assert(enemy.state.board.filter(c => !c.revealed).every(c => c.color === null));
  const oldId = captain.id, name = room.players[oldId].name;
  const disconnected = new Promise(resolve => io.sockets.sockets.get(oldId).once('disconnect', resolve));
  captain.disconnect(); await disconnected;
  assert(room.codenames.pausedUntil);
  const restored = await connect(name);
  assert.equal(restored.state.isCaptain, true); assert.equal(restored.state.pausedUntil, null);
  assert(restored.state.board.every(c => c.color));
  assert(!room.players[oldId]);
  const currentGuesser = clients.find(s => s.connected && s.state?.team === room.codenames.turn && !s.state?.isCaptain);
  await action(currentGuesser, 'sync');
  const assassin = room.codenames.board.findIndex(c => c.color === 'assassin');
  assert.equal((await action(currentGuesser, 'guess', { index: assassin })).ok, true);
  assert.equal(room.codenames.phase, 'finished');
  const host = clients.find(s => s.connected && s.id === room.host);
  await action(host, 'sync'); assert.equal((await action(host, 'lobby')).ok, true);
  assert.equal(room.codenames.board.length, 0);
});
