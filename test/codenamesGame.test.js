const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, start, ready, act, snapshot, remaining, createCodenamesService } = require('../services/codenamesGame');

function room() {
  const r = { code: 'ABC12', host: 'a', status: 'LOBBY', config: { gameMode: 'codenames', timeLimit: 90 }, players: {}, scores: {}, correct: {}, wrong: {}, cards: {} };
  for (const id of ['a', 'b', 'c', 'd']) r.players[id] = { name: id, userId: id, disconnected: false };
  setup(r); return r;
}
function send(r, id, action, extra = {}) { act(r, id, action, { matchId: r.codenames.matchId, revision: r.codenames.revision, ...extra }); }
function guesser(r, team = r.codenames.turn) { return Object.keys(r.players).find(id => r.codenames.teams[id] === team && id !== r.codenames.captains[team]); }
function clue(r, n = 1) { send(r, r.codenames.captains[r.codenames.turn], 'clue', { word: 'ارتباط', count: n }); }
function card(r, color) { return r.codenames.board.findIndex(c => c.color === color && !c.revealed); }

test('25 unique words; nine starting agents, eight opponents, seven neutral, one assassin', () => {
  for (let i = 0; i < 30; i++) {
    const r = room(); start(r); const g = r.codenames;
    assert.equal(new Set(g.board.map(c => c.word)).size, 25);
    assert.equal(remaining(g, g.turn), 9);
    assert.equal(remaining(g, g.turn === 'red' ? 'blue' : 'red'), 8);
    assert.equal(g.board.filter(c => c.color === 'neutral').length, 7);
    assert.equal(g.board.filter(c => c.color === 'assassin').length, 1);
  }
});
test('requires four connected players with captain and guesser on each team', () => {
  const r = room(); assert.equal(ready(r), true);
  r.players.c.disconnected = true; assert.equal(ready(r), false); assert.throws(() => start(r));
  delete r.players.c; assert.equal(ready(r), false);
});
test('host is a normal guesser and receives no secret key unless chosen captain', () => {
  const r = room(); send(r, 'a', 'captain', { playerId: 'c' }); start(r);
  const hostView = JSON.parse(JSON.stringify(snapshot(r, 'a')));
  assert(hostView.board.every(c => c.color === null));
  assert(snapshot(r, 'c').board.every(c => c.color !== null));
});
test('only current captain can give one valid word and bounded integer count', () => {
  const r = room(); start(r); const captain = r.codenames.captains[r.codenames.turn];
  assert.throws(() => send(r, guesser(r), 'clue', { word: 'ارتباط', count: 1 }));
  for (const word of ['كلمتين هنا', '<script>', '', r.codenames.board[0].word]) assert.throws(() => send(r, captain, 'clue', { word, count: 1 }));
  for (const count of [0, 10, -1, 1.5, '2']) assert.throws(() => send(r, captain, 'clue', { word: 'ارتباط', count }));
  clue(r, 2); assert.equal(r.codenames.guessesLeft, 3); assert.equal(r.codenames.phase, 'guess');
});
test('normalizes Arabic diacritics to prevent using board words as clues', () => {
  const r = room(); start(r); r.codenames.board[0].word = 'أسد';
  assert.throws(() => send(r, r.codenames.captains[r.codenames.turn], 'clue', { word: 'اَسد', count: 1 }));
});
test('captains, opponents and outsiders cannot reveal cards', () => {
  const r = room(); start(r); clue(r);
  const captain = r.codenames.captains[r.codenames.turn];
  assert.throws(() => send(r, captain, 'guess', { index: 0 }));
  assert.throws(() => send(r, guesser(r, r.codenames.turn === 'red' ? 'blue' : 'red'), 'guess', { index: 0 }));
  assert.throws(() => send(r, 'outsider', 'guess', { index: 0 }));
});
test('matching card keeps turn; clue count plus one exhausts turn', () => {
  const r = room(); start(r); clue(r); const turn = r.codenames.turn, id = guesser(r);
  send(r, id, 'guess', { index: card(r, turn) });
  assert.equal(r.codenames.turn, turn); assert.equal(r.codenames.guessesLeft, 1);
  send(r, id, 'guess', { index: card(r, turn) });
  assert.notEqual(r.codenames.turn, turn); assert.equal(r.codenames.phase, 'clue');
});
test('neutral ends turn; opponent card scores for opponent', () => {
  for (const type of ['neutral', 'opponent']) {
    const r = room(); start(r); clue(r); const turn = r.codenames.turn;
    const enemy = turn === 'red' ? 'blue' : 'red', before = remaining(r.codenames, enemy);
    send(r, guesser(r), 'guess', { index: card(r, type === 'neutral' ? type : enemy) });
    assert.notEqual(r.codenames.turn, turn);
    assert.equal(remaining(r.codenames, enemy), before - (type === 'opponent' ? 1 : 0));
  }
});
test('assassin loses immediately, full map revealed only after finish', () => {
  const r = room(); start(r); clue(r); const id = guesser(r), turn = r.codenames.turn;
  send(r, id, 'guess', { index: card(r, 'assassin') });
  assert.equal(r.codenames.phase, 'finished'); assert.notEqual(r.codenames.winner, turn);
  assert(snapshot(r, id).board.every(c => c.color));
  assert.throws(() => send(r, id, 'guess', { index: 0 }));
});
test('revealing final opponent agent awards opponent victory', () => {
  const r = room(); start(r); const enemy = r.codenames.turn === 'red' ? 'blue' : 'red';
  const index = card(r, enemy); r.codenames.board.forEach((c, i) => { if (c.color === enemy && i !== index) c.revealed = true; });
  clue(r); send(r, guesser(r), 'guess', { index }); assert.equal(r.codenames.winner, enemy);
});
test('same revision cannot reveal two cards concurrently; stale matches rejected', () => {
  const r = room(); start(r); clue(r, 2); const g = r.codenames, id = guesser(r);
  const payload = { matchId: g.matchId, revision: g.revision, index: card(r, g.turn) };
  act(r, id, 'guess', payload);
  assert.throws(() => act(r, id, 'guess', { ...payload, index: card(r, g.turn) }));
  assert.throws(() => act(r, id, 'guess', { ...payload, revision: g.revision, matchId: 'old' }));
});
test('cannot end turn before first guess or change roles during match', () => {
  const r = room(); start(r); clue(r); const id = guesser(r);
  assert.throws(() => send(r, id, 'end'));
  assert.throws(() => send(r, id, 'captain'));
  assert.throws(() => send(r, id, 'team', { team: 'blue' }));
  send(r, id, 'guess', { index: card(r, r.codenames.turn) }); send(r, id, 'end');
  assert.equal(r.codenames.phase, 'clue');
});
test('private chat is filtered per team and captains cannot add clues via chat', () => {
  const r = room(); start(r); const id = guesser(r);
  send(r, id, 'chat', { text: 'نتفق قبل الاختيار' });
  assert.equal(snapshot(r, id).messages.length, 1);
  const enemy = guesser(r, r.codenames.turn === 'red' ? 'blue' : 'red');
  assert.equal(snapshot(r, enemy).messages.length, 0);
  assert.throws(() => send(r, r.codenames.captains[r.codenames.turn], 'chat', { text: 'تلميح' }));
});

function harness(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const r = room(), rooms = { ABC12: r }, out = [], handlers = {};
  const io = { to: id => ({ emit: (event, data) => out.push({ id, event, data }) }), in: () => ({ socketsLeave() {} }) };
  const service = createCodenamesService({ io, rooms, publicUpdate() {}, migrateHost() {
    const next = Object.keys(r.players).find(id => !r.players[id].disconnected);
    if (next) r.host = next;
  } });
  function socket(id) {
    const events = {}; service.register({ id, rooms: new Set(['ABC12']), on: (event, handler) => events[event] = handler });
    handlers[id] = events; return events;
  }
  function action(id, action, extra = {}) {
    if (!handlers[id]) socket(id);
    let result;
    handlers[id]['codenames-action']({ code: 'ABC12', action, matchId: r.codenames.matchId, revision: r.codenames.revision, ...extra }, res => result = res);
    return result;
  }
  return { r, rooms, service, out, action };
}
test('server timer expires to next team; guess stage gets its own deadline', t => {
  const { r, action } = harness(t); assert.equal(action('a', 'start').ok, true);
  const turn = r.codenames.turn; t.mock.timers.tick(40000);
  action(r.codenames.captains[turn], 'clue', { word: 'ارتباط', count: 2 });
  t.mock.timers.tick(89999); assert.equal(r.codenames.turn, turn);
  t.mock.timers.tick(1); assert.notEqual(r.codenames.turn, turn);
});
test('disconnect pauses time; reconnect remaps captain and resumes remaining time', t => {
  const { r, service, action } = harness(t); action('a', 'start'); t.mock.timers.tick(20000);
  const captain = r.codenames.captains[r.codenames.turn];
  service.depart('ABC12', captain, false); assert(r.codenames.pausedUntil);
  t.mock.timers.tick(50000); assert.equal(r.codenames.phase, 'clue');
  r.players.new = { ...r.players[captain], disconnected: false }; service.remap(r, captain, 'new'); delete r.players[captain];
  service.presence('ABC12'); assert.equal(r.codenames.pausedUntil, null);
  assert.equal(r.codenames.captains[r.codenames.turn], 'new');
  assert.equal(r.codenames.deadline - Date.now(), 70000);
  assert(snapshot(r, 'new').board.every(c => c.color));
});
test('disconnect forfeit after grace; explicit essential departure forfeits immediately', t => {
  const { r, service, action } = harness(t); action('a', 'start');
  const captain = r.codenames.captains.red;
  service.depart('ABC12', captain, false); t.mock.timers.tick(75000);
  assert.equal(r.codenames.winner, 'blue'); assert.equal(r.codenames.phase, 'finished');
});
test('explicit captain departure cannot promote a guesser who has not seen key', t => {
  const { r, service, action } = harness(t); action('a', 'start');
  service.depart('ABC12', r.codenames.captains.red, true);
  assert.equal(r.codenames.phase, 'finished'); assert.equal(r.codenames.winner, 'blue');
});
test('fresh rematch clears old key and messages; only host can restart', t => {
  const { r, action } = harness(t); action('a', 'start'); const oldId = r.codenames.matchId;
  action(r.codenames.captains[r.codenames.turn], 'clue', { word: 'ارتباط', count: 1 });
  action(guesser(r), 'guess', { index: card(r, 'assassin') });
  assert.equal(action('b', 'lobby').ok, false); assert.equal(action('a', 'lobby').ok, true);
  assert.equal(r.codenames.board.length, 0); action('a', 'start'); assert.notEqual(r.codenames.matchId, oldId);
  assert.equal(snapshot(r, guesser(r)).messages.length, 0);
});
test('sync outsider rejected and finished cleanup releases room', t => {
  const { rooms, r, action } = harness(t); assert.equal(action('x', 'sync').ok, false);
  action('a', 'start'); action(r.codenames.captains[r.codenames.turn], 'clue', { word: 'ارتباط', count: 1 });
  action(guesser(r), 'guess', { index: card(r, 'assassin') });
  t.mock.timers.tick(10 * 60 * 1000); assert.equal(rooms.ABC12, undefined);
});
