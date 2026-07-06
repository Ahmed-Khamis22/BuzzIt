import sys, re

path = r'g:\Projects\BuzzIt\buzzit-server\server.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add drawWords loading
if 'const drawWords =' not in content:
    content = content.replace('const rooms = {};', "const rooms = {};\nconst drawWords = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/drawWords.json'), 'utf8'));")

# 2. Add startNextDrawRound function
draw_logic = """
async function startNextDrawRound(code) {
  const room = rooms[code];
  if (!room) return;

  // Pick a drawer who hasn't drawn yet (or random if all drawn)
  const players = Object.keys(room.players);
  let availableDrawers = players.filter(p => !room.drawnPlayers.includes(p));
  if (availableDrawers.length === 0) {
    // If winScore is 0 and everyone has drawn, end game
    if (room.config.winScore === 0) {
      return handleEndGame(code);
    }
    // Otherwise reset drawn players
    room.drawnPlayers = [];
    availableDrawers = players;
  }

  const drawerId = availableDrawers[Math.floor(Math.random() * availableDrawers.length)];
  room.drawnPlayers.push(drawerId);
  room.drawerId = drawerId;
  
  // Pick a random word
  const word = drawWords[Math.floor(Math.random() * drawWords.length)];
  room.currentDrawWord = word;
  
  // Mask word for guessers (e.g. "تفاحة" -> "_ _ _ _ _")
  // Actually, we can just give them the length
  const maskedWord = word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');

  io.to(code).emit('draw-round-start', {
    drawerId,
    wordLength: word.length,
    maskedWord
  });
  
  // Send the actual word only to the drawer
  if (room.players[drawerId] && room.players[drawerId].socketId) {
    io.to(room.players[drawerId].socketId).emit('draw-word', { word });
  }
}
"""
if 'async function startNextDrawRound' not in content:
    content = content.replace('async function fetchAndSendNextQuestion(code) {', draw_logic + '\nasync function fetchAndSendNextQuestion(code) {')

# 3. Patch handleStartGame
if 'room.config.gameMode === \'draw\'' not in content:
    hook = """
    room.cards = {};
    for (let playerId in room.players) {
      room.cards[playerId] = { yellow: 0, red: 0 };
    }
    room.votesToPlayAgain.clear();
    room.rotatedHostData = {};
    room.usedQuestions = [];

    if (room.config.gameMode === 'draw') {
      room.drawnPlayers = [];
      io.to(code).emit('game-started', {
        players: Object.entries(room.players).map(([id, p]) => ({
          id, name: p.name, score: 0, disconnected: p.disconnected, equippedItems: p.equippedItems
        }))
      });
      startNextDrawRound(code);
      return;
    }
"""
    content = re.sub(r'room\.cards = \{\};[\s\S]*?room\.usedQuestions = \[\];', hook.strip(), content)

# 4. Add socket handlers
socket_handlers = """
  socket.on('draw-stroke', (data) => {
    const { code, stroke } = data;
    socket.to(code).emit('draw-update', stroke);
  });

  socket.on('clear-canvas', (code) => {
    socket.to(code).emit('canvas-cleared');
  });

  socket.on('draw-guess', (data) => {
    const { code, playerId, guess } = data;
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config.gameMode !== 'draw') return;

    // Send guess to chat
    io.to(code).emit('draw-chat', { playerId, guess });

    if (guess.trim().toLowerCase() === room.currentDrawWord.toLowerCase() && playerId !== room.drawerId) {
      // Correct!
      room.scores[playerId] = (room.scores[playerId] || 0) + 1;
      
      io.to(code).emit('draw-guess-correct', {
        winnerId: playerId,
        word: room.currentDrawWord,
        scores: room.scores
      });

      const winScore = room.config.winScore;
      if (winScore > 0 && room.scores[playerId] >= winScore) {
        setTimeout(() => handleEndGame(code), 3000);
      } else {
        setTimeout(() => startNextDrawRound(code), 4000);
      }
    }
  });
"""
if 'socket.on(\'draw-stroke\'' not in content:
    content = content.replace('socket.on(\'disconnect\', () => {', socket_handlers + '\n  socket.on(\'disconnect\', () => {')


with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Server patched successfully')
