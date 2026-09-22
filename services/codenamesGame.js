const { randomInt, randomUUID } = require('crypto');

// Curated, single-word Arabic nouns. No external API or AI calls are needed.
const WORDS = [...new Set(`بحر نهر جزيرة شاطئ سفينة مرساة شراع موج سمكة حوت قرش لؤلؤ صدفة غواص ميناء
شمس قمر نجم كوكب فضاء صاروخ مدار سماء سحاب مطر برق رعد ثلج ريح عاصفة ضباب
غابة شجرة ورقة زهرة ورد صبار نخلة بذرة جذر ثمرة تفاح موز عنب برتقال ليمون بطيخ فراولة زيتون
أسد نمر فيل زرافة حصان جمل حمار كلب قط فأر أرنب ذئب ثعلب دب قرد غزال نسر صقر بومة حمامة بطريق فراشة نحلة نملة عنكبوت ثعبان سلحفاة تمساح
كتاب قلم دفتر ورق مدرسة جامعة معلم طالب مكتبة قصة قصيدة لغة حرف رقم سؤال جواب علم تاريخ
طبيب ممرض مستشفى دواء قلب عين أذن يد قدم رأس دم عظم جلد سن شعر
بيت باب نافذة سقف حائط مفتاح قفل كرسي مكتب سرير وسادة مرآة ساعة مصباح شمعة سجادة مطبخ حمام حديقة سلم
خبز أرز ملح سكر عسل لبن جبن زبدة بيض لحم دجاج قهوة شاي عصير ماء كوب طبق ملعقة شوكة سكين فرن ثلاجة
مدينة قرية شارع طريق جسر برج قصر قلعة هرم متحف مسجد كنيسة سوق متجر بنك مصنع مزرعة مطار محطة
سيارة قطار طائرة دراجة حافلة عجلة محرك وقود إشارة خريطة بوصلة رحلة تذكرة حقيبة جواز
ملك ملكة أمير تاج عرش جندي حارس شرطي قاض محام لص جاسوس سجن سيف درع حرب سلام راية
ذهب فضة نحاس حديد حجر رمل زجاج خشب قماش خيط إبرة مقص حبل صندوق رسالة طابع بريد هاتف شاشة كاميرا صورة فيلم مسرح موسيقى أغنية عود طبلة بيانو
كرة ملعب هدف سباق سباحة جري قفز كأس ميدالية فريق حكم لاعب جبل كهف وادي بركان صحراء نار دخان رماد جليد كنز لغز حلم نوم فرح ضحك ظل نور لون أحمر أزرق أخضر أصفر`.split(/\s+/))];

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const other = team => team === 'red' ? 'blue' : 'red';
const teamCapacity = room => Math.max(2, Math.floor((Number(room.config?.maxPlayers) || 8) / 2));
const normalize = value => value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase();

function setup(room) {
  if (!room.codenames) room.codenames = { phase: 'lobby', teams: {}, captains: { red: null, blue: null }, revision: 0, board: [], history: [] };
  const game = room.codenames;
  for (const id of Object.keys(game.teams)) {
    if (!room.players[id]) delete game.teams[id];
  }
  for (const team of ['red', 'blue']) {
    if (!room.players[game.captains[team]] || game.teams[game.captains[team]] !== team) {
      game.captains[team] = null;
    }
  }
  return game;
}

function unavailableTeams(room) {
  const g = setup(room);
  return ['red', 'blue'].filter(team => {
    const captain = g.captains[team];
    return !room.players[captain] || room.players[captain].disconnected
      || !Object.entries(room.players).some(([id, p]) => g.teams[id] === team && id !== captain && !p.disconnected);
  });
}
function ready(room) {
  const g = setup(room);
  const redPlayers = Object.values(g.teams).filter(team => team === 'red').length;
  const bluePlayers = Object.values(g.teams).filter(team => team === 'blue').length;
  return Object.keys(room.players).length >= 4 && unavailableTeams(room).length === 0
    && Object.values(room.players).every(p => !p.disconnected)
    && redPlayers >= 2 && bluePlayers >= 2
    && Math.abs(redPlayers - bluePlayers) <= 1;
}
function remaining(g, team) { return g.board.filter(c => c.color === team && !c.revealed).length; }
function addDevelopmentPlayers(room) {
  const g = setup(room);
  const hostId = room.host;
  if (!hostId || !room.players[hostId]) return;
  const players = [
    [hostId, 'red', 'captain', room.players[hostId].name || 'قائد الأحمر'],
    ['dev-red-operative', 'red', 'operative', 'مخمّن الأحمر'],
    ['dev-blue-captain', 'blue', 'captain', 'قائد الأزرق'],
    ['dev-blue-operative', 'blue', 'operative', 'مخمّن الأزرق'],
  ];
  for (const [id, team, role, name] of players) {
    if (!room.players[id]) room.players[id] = { name, userId: null, disconnected: false, developmentOnly: true };
    room.players[id].disconnected = false;
    g.teams[id] = team;
    if (role === 'captain') g.captains[team] = id;
  }
}
function snapshot(room, id) {
  const g = setup(room);
  const captain = Object.values(g.captains).includes(id);
  return {
    code: room.code, hostId: room.host, phase: g.phase, matchId: g.matchId, revision: g.revision,
    team: g.teams[id], isCaptain: captain, turn: g.turn, clue: g.clue, guessesLeft: g.guessesLeft,
    deadline: g.deadline, pausedUntil: g.pausedUntil, winner: g.winner, reason: g.reason,
    remaining: { red: remaining(g, 'red'), blue: remaining(g, 'blue') }, captains: g.captains,
    canStart: ready(room), history: g.history.slice(-12), timeLimit: room.config.timeLimit,
    maxPlayers: [4, 6, 8].includes(Number(room.config.maxPlayers)) ? Number(room.config.maxPlayers) : 8,
    messages: (g.messages || []).filter(m => m.team === g.teams[id]).slice(-30),
    rewardStatus: g.rewardStatus,
    rewards: { coins: g.rewards?.coinsEarnedMap?.[room.players[id]?.userId] || 0, xp: g.rewards?.xpEarnedMap?.[room.players[id]?.userId] || 0 },
    players: Object.entries(room.players).map(([pid, p]) => ({ id: pid, name: p.name, team: g.teams[pid], disconnected: !!p.disconnected, developmentOnly: !!p.developmentOnly, equippedItems: p.equippedItems })),
    // Never serialize the hidden key to a guesser, even to the room owner.
    board: g.board.map((c, index) => ({ index, word: c.word, revealed: c.revealed, color: captain || c.revealed || g.phase === 'finished' ? c.color : null })),
  };
}
function start(room, allowDevelopmentPreview = false) {
  if (!ready(room)) {
    if (!allowDevelopmentPreview) throw new Error('محتاجين فريقين متقاربين في العدد، وفي كل فريق قائد ومخمّن واحد على الأقل.');
    addDevelopmentPlayers(room);
  }
  const old = setup(room);
  const turn = randomInt(2) ? 'red' : 'blue';
  const colors = shuffle([...Array(9).fill(turn), ...Array(8).fill(other(turn)), ...Array(7).fill('neutral'), 'assassin']);
  room.codenames = { teams: old.teams, captains: old.captains, phase: 'clue', turn, matchId: randomUUID(), revision: old.revision + 1,
    board: shuffle(WORDS).slice(0, 25).map((word, i) => ({ word, color: colors[i], revealed: false })),
    clue: null, guessesLeft: 0, winner: null, reason: null, history: [], startedAt: Date.now() };
  room.scores = {}; room.correct = {}; room.wrong = {};
  room.status = 'PLAYING';
}
function finish(room, winner, reason) {
  const g = setup(room);
  g.phase = 'finished'; g.winner = winner; g.reason = reason; g.deadline = null; g.pausedUntil = null; g.revision++;
  room.status = 'RESULTS';
}
function nextTurn(g) { g.turn = other(g.turn); g.phase = 'clue'; g.clue = null; g.guessesLeft = 0; }
function act(room, id, event, payload = {}) {
  const g = setup(room);
  if (!room.players[id] || room.players[id].disconnected) throw new Error('أعد الاتصال بالغرفة أولًا.');
  if (event === 'chat') {
    if (!['clue', 'guess'].includes(g.phase) || Object.values(g.captains).includes(id)) throw new Error('القائد يتواصل بالتلميح فقط أثناء المباراة.');
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!text || text.length > 180) throw new Error('اكتب رسالة قصيرة حتى ١٨٠ حرفًا.');
    if (!g.messages) g.messages = [];
    const last = g.messages.findLast(m => m.id === id);
    if (last && Date.now() - last.at < 1000) throw new Error('استنى ثانية قبل الرسالة التالية.');
    g.messages.push({ id, name: room.players[id].name, team: g.teams[id], text, at: Date.now() });
    g.messages = g.messages.slice(-60); return;
  }
  if (event === 'team' || event === 'captain') {
    if (g.phase !== 'lobby') throw new Error('الفرق والأدوار ثابتة بعد بداية المباراة.');
    const target = payload.playerId || id;
    if (target !== id && room.host !== id) throw new Error('المضيف فقط يغيّر أدوار باقي اللاعبين.');
    if (!room.players[target]) throw new Error('اللاعب مش موجود.');
    if (event === 'team') {
      if (!['red', 'blue'].includes(payload.team)) throw new Error('اختار فريقًا صحيحًا.');
      if (payload.role !== undefined && !['captain', 'operative'].includes(payload.role)) throw new Error('اختار دورًا صحيحًا.');
      if (Object.entries(g.teams).filter(([pid, t]) => pid !== target && t === payload.team).length >= teamCapacity(room)) throw new Error(`الفريق مكتمل: ${teamCapacity(room)} لاعبين بحد أقصى.`);
      const currentCaptain = g.captains[payload.team];
      const operativeCount = Object.entries(g.teams).filter(([pid, t]) => pid !== target && t === payload.team && pid !== currentCaptain).length;
      if (payload.role === 'operative' && operativeCount >= teamCapacity(room) - 1) throw new Error('أماكن المخمنين مكتملة، اختار قائد الكلمات.');
      const previousTeam = g.teams[target];
      if (previousTeam && previousTeam !== payload.team && g.captains[previousTeam] === target) g.captains[previousTeam] = null;
      g.teams[target] = payload.team;
      if (payload.role === 'captain') g.captains[payload.team] = target;
      if (payload.role === 'operative' && g.captains[payload.team] === target) g.captains[payload.team] = null;
    } else {
      if (room.host !== id && target !== id) throw new Error('اختيار غير مسموح.');
      if (!g.teams[target]) throw new Error('اختار الفريق الأول قبل تحديد القائد.');
      const team = g.teams[target];
      g.captains[team] = g.captains[team] === target ? null : target;
    }
  } else if (event === 'start') {
    if (room.host !== id || g.phase !== 'lobby') throw new Error('المضيف يبدأ المباراة من غرفة الانتظار.');
    const isDevPreview = process.env.BUZZIT_ENV === 'development' || process.env.ALLOW_SOLO_TEST === 'true' || process.env.NODE_ENV === 'development';
    start(room, isDevPreview); return;
  } else if (event === 'lobby') {
    if (room.host !== id || g.phase !== 'finished') throw new Error('انتظر نهاية المباراة.');
    room.codenames = { phase: 'lobby', teams: g.teams, captains: g.captains, revision: g.revision + 1, board: [], history: [] };
    room.status = 'LOBBY'; setup(room); return;
  } else {
    if (!['clue', 'guess'].includes(g.phase) || g.pausedUntil) throw new Error('المباراة متوقفة حاليًا.');
    if (payload.matchId !== g.matchId || payload.revision !== g.revision) throw new Error('حصل تحديث في الدور، جرّب بعد تحديث الشاشة.');
    if (g.teams[id] !== g.turn) throw new Error('الدور للفريق الآخر.');
    const isCaptain = g.captains[g.turn] === id;
    if (event === 'clue') {
      if (!isCaptain || g.phase !== 'clue') throw new Error('القائد فقط يرسل التلميح في بداية الدور.');
      const word = typeof payload.word === 'string' ? payload.word.trim() : '';
      const count = payload.count;
      if (!/^[\p{L}\p{M}]{1,24}$/u.test(word) || !Number.isInteger(count) || count < 1 || count > remaining(g, g.turn)) throw new Error('اكتب كلمة واحدة وحدّد عددًا من ١ لعدد كلمات فريقك المتبقية.');
      const n = normalize(word);
      if (g.board.some(c => !c.revealed && (normalize(c.word).includes(n) || n.includes(normalize(c.word))))) throw new Error('التلميح ما ينفعش يكون كلمة ظاهرة على اللوحة أو جزءًا منها.');
      g.clue = { word, count }; g.guessesLeft = count + 1; g.phase = 'guess';
      g.history.push({ type: 'clue', team: g.turn, word, count, text: `تلميح ${g.turn === 'red' ? 'الأحمر' : 'الأزرق'}: ${word} — ${count}` });
    } else if (event === 'guess') {
      if (isCaptain || g.phase !== 'guess') throw new Error('انتظر تلميح قائد فريقك قبل اختيار كلمة.');
      if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= 25) throw new Error('اختار كلمة من اللوحة.');
      const card = g.board[payload.index];
      if (card.revealed) throw new Error('الكلمة مكشوفة بالفعل.');
      card.revealed = true; g.guessesLeft--;
      if (card.color === g.turn) {
        room.correct[id] = (room.correct[id] || 0) + 1;
        room.scores[id] = (room.scores[id] || 0) + 1;
      } else room.wrong[id] = (room.wrong[id] || 0) + 1;
      g.history.push({ type: 'guess', team: g.turn, playerName: room.players[id].name, word: card.word, color: card.color, text: `${room.players[id].name}: ${card.word}` });
      if (card.color === 'assassin') { finish(room, other(g.turn), 'تم اختيار الكلمة السوداء.'); return; }
      if (remaining(g, 'red') === 0 || remaining(g, 'blue') === 0) { finish(room, remaining(g, 'red') === 0 ? 'red' : 'blue', 'الفريق كشف كل كلماته.'); return; }
      if (card.color !== g.turn || g.guessesLeft <= 0) nextTurn(g);
    } else if (event === 'end') {
      if (isCaptain || g.phase !== 'guess') throw new Error('المخمّنون فقط ينهون دور التخمين.');
      nextTurn(g);
    } else throw new Error('طلب غير معروف.');
  }
  g.revision++;
}

function createCodenamesService({ io, rooms, migrateHost, publicUpdate, saveResults }) {
  function sync(code) {
    const room = rooms[code];
    if (room?.config?.gameMode !== 'codenames') return;
    room.code = code;
    const g = setup(room);
    for (const [id, p] of Object.entries(room.players)) if (!p.disconnected) {
      const viewerId = g.devViewers?.[id] || id;
      io.to(id).emit('codenames-state', snapshot(room, viewerId));
    }
  }
  function clearTimers(room) {
    clearTimeout(room.codenamesTimer); clearTimeout(room.codenamesPauseTimer); clearTimeout(room.codenamesCleanupTimer);
    room.codenamesTimer = room.codenamesPauseTimer = room.codenamesCleanupTimer = null;
  }
  function schedule(code, reset = false) {
    const room = rooms[code]; if (!room) return;
    const g = setup(room);
    clearTimeout(room.codenamesTimer);
    if (g.phase === 'finished') {
      clearTimeout(room.codenamesPauseTimer);
      if (!g.resultsHandled) {
        g.resultsHandled = true;
        // Incomplete/instant forfeits must not become a currency farming loop.
        const eligible = Date.now() - g.startedAt >= 60000 && g.board.filter(c => c.revealed).length >= 5;
        g.rewardStatus = eligible && saveResults ? 'saving' : 'ineligible';
        if (eligible && saveResults) {
          const savedRoom = { ...room, players: { ...room.players }, scores: { ...room.scores },
            correct: { ...room.correct }, wrong: { ...room.wrong }, codenames: { ...g, teams: { ...g.teams } } };
          Promise.resolve().then(() => saveResults(code, savedRoom)).then(result => {
            g.rewards = result; g.rewardStatus = 'saved'; if (rooms[code]?.codenames === g) sync(code);
          }).catch(error => { console.error('Codenames results:', error.message); g.rewardStatus = 'error'; if (rooms[code]?.codenames === g) sync(code); });
        }
      }
      if (!room.codenamesCleanupTimer) room.codenamesCleanupTimer = setTimeout(() => close(code), 10 * 60 * 1000);
      return;
    }
    if (!['clue', 'guess'].includes(g.phase) || g.pausedUntil) return;
    if (reset || !g.deadline) g.deadline = room.config.timeLimit ? Date.now() + room.config.timeLimit * 1000 : null;
    if (g.deadline) room.codenamesTimer = setTimeout(() => {
      if (rooms[code] !== room) return;
      g.history.push({ text: 'انتهى الوقت، الدور للفريق الآخر.' }); nextTurn(g); g.revision++;
      schedule(code, true); sync(code);
    }, Math.max(0, g.deadline - Date.now()));
  }
  function close(code) {
    const room = rooms[code]; if (!room) return;
    clearTimers(room);
    io.to(code).emit('room-closed', 'تم إغلاق غرفة كود سري.');
    io.in(code).socketsLeave(code); delete rooms[code]; publicUpdate();
  }
  function presence(code, explicit = false) {
    const room = rooms[code]; if (room?.config?.gameMode !== 'codenames') return;
    const g = setup(room);
    if (!room.players[room.host] || room.players[room.host].disconnected) migrateHost(code);
    if (['clue', 'guess'].includes(g.phase)) {
      const missing = unavailableTeams(room);
      if (missing.length && explicit) {
        finish(room, missing.length === 1 ? other(missing[0]) : null, 'انتهت المباراة لانسحاب قائد أو عدم وجود مخمّن في فريق.');
        schedule(code);
      } else if (missing.length && !g.pausedUntil) {
        g.remainingMs = g.deadline ? Math.max(1, g.deadline - Date.now()) : null;
        g.deadline = null; g.pausedUntil = Date.now() + 75000; g.revision++;
        clearTimeout(room.codenamesTimer);
        room.codenamesPauseTimer = setTimeout(() => {
          if (rooms[code] !== room) return;
          const absent = unavailableTeams(room);
          if (absent.length) finish(room, absent.length === 1 ? other(absent[0]) : null, 'انتهت مهلة رجوع اللاعبين: ٧٥ ثانية.');
          schedule(code); sync(code); publicUpdate();
        }, 75000);
      } else if (!missing.length && g.pausedUntil) {
        clearTimeout(room.codenamesPauseTimer); g.pausedUntil = null; g.revision++;
        g.deadline = g.remainingMs ? Date.now() + g.remainingMs : null;
        schedule(code);
      }
    }
    const active = Object.values(room.players).some(p => !p.disconnected);
    if (!active) {
      if (!room.codenamesCleanupTimer) room.codenamesCleanupTimer = setTimeout(() => close(code), 75000);
    } else if (g.phase !== 'finished') {
      clearTimeout(room.codenamesCleanupTimer); room.codenamesCleanupTimer = null;
    }
    sync(code); publicUpdate();
  }
  function remap(room, oldId, newId) {
    if (room.config?.gameMode !== 'codenames' || oldId === newId || !room.codenames) return;
    const g = room.codenames;
    if (g.teams[oldId]) { g.teams[newId] = g.teams[oldId]; delete g.teams[oldId]; }
    for (const t of ['red', 'blue']) if (g.captains[t] === oldId) g.captains[t] = newId;
    g.revision++;
  }
  function depart(code, id, explicit) {
    const room = rooms[code]; if (room?.config?.gameMode !== 'codenames' || !room.players[id]) return false;
    if (explicit) {
      delete room.players[id];
      for (const key of ['scores', 'correct', 'wrong', 'cards']) delete room[key]?.[id];
      io.to(code).emit('player-removed', { id });
    } else {
      room.players[id].disconnected = true;
      io.to(code).emit('player-left', { id });
    }
    if (room.host === id) {
      room.hostDisconnected = true;
      migrateHost(code);
    }
    presence(code, explicit);
    if (explicit && !Object.keys(room.players).length) close(code);
    return true;
  }
  function register(socket) {
    socket.on('codenames-action', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (!payload || typeof payload.code !== 'string') throw new Error('طلب غير صالح.');
        const room = rooms[payload.code];
        if (room?.config?.gameMode !== 'codenames' || !room.players[socket.id] || !socket.rooms.has(payload.code)) throw new Error('الغرفة غير متاحة.');
        const developmentPreview = process.env.BUZZIT_ENV === 'development' || process.env.ALLOW_SOLO_TEST === 'true' || process.env.NODE_ENV === 'development';
        if (developmentPreview && payload.testPlayerId) {
          if (!room.players[payload.testPlayerId]) throw new Error('دور التجربة غير متاح.');
          const g = setup(room);
          g.devViewers = { ...(g.devViewers || {}), [socket.id]: payload.testPlayerId };
        }
        if (payload.action === 'sync') { sync(payload.code); reply({ ok: true }); return; }
        const before = setup(room);
        const phase = before.phase, turn = before.turn;
        if (before.deadline && Date.now() >= before.deadline && !before.pausedUntil) throw new Error('انتهى وقت الدور، انتظر التحديث.');
        const actingId = developmentPreview && payload.testPlayerId ? payload.testPlayerId : socket.id;
        act(room, actingId, payload.action, payload);
        if (payload.action === 'lobby') clearTimers(room);
        schedule(payload.code, phase !== room.codenames.phase || turn !== room.codenames.turn);
        sync(payload.code); publicUpdate(); reply({ ok: true });
      } catch (e) { reply({ ok: false, message: e.message }); }
    });
  }
  function startFromLobby(code, playerId, { preview = false } = {}) {
    const room = rooms[code];
    if (!room || room.config?.gameMode !== 'codenames') throw new Error('الغرفة غير متاحة.');
    if (preview) {
      if (room.host !== playerId) throw new Error('المضيف يبدأ المباراة من غرفة الانتظار.');
      start(room, true);
    } else {
      act(room, playerId, 'start');
    }
    const players = Object.entries(room.players).map(([id, player]) => ({
      id,
      name: player.name,
      score: 0,
      disconnected: player.disconnected,
      equippedItems: player.equippedItems,
    }));
    io.to(code).emit('game-started', { players });
    schedule(code, true);
    sync(code);
    publicUpdate();
  }
  return { register, sync, presence, remap, depart, startFromLobby };
}

module.exports = { setup, ready, start, snapshot, act, finish, remaining, unavailableTeams, createCodenamesService };
