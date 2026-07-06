const io = require('socket.io-client');
const assert = require('assert');

// Connect to the running server on port 3000 (from server.js PORT || 3000)
const SERVER_URL = 'http://localhost:4000';

async function runTest() {
  console.log('🚀 Starting Full Test for Game 3 (Draw Game)...');

  const sockets = [];
  const connectSocket = (name) => {
    return new Promise((resolve, reject) => {
      const socket = io(SERVER_URL, {
        transports: ['websocket'],
        forceNew: true
      });
      socket.on('connect', () => {
        console.log(`✅ Socket connected: ${name} (ID: ${socket.id})`);
        resolve(socket);
      });
      socket.on('connect_error', (err) => {
        console.error(`❌ Connection error for ${name}:`, err.message);
        reject(err);
      });
      sockets.push(socket);
    });
  };

  try {
    // 1. Connect Host and Player
    const hostSocket = await connectSocket('Host/Drawer');
    const playerSocket = await connectSocket('Player/Guesser');

    let roomCode = null;
    let currentDrawerId = null;
    let secretWord = null;

    // Set up host listeners
    hostSocket.on('room-created', (code) => {
      roomCode = code;
      console.log(`🏠 Room created with code: ${roomCode}`);
    });

    hostSocket.on('draw-round-start', (data) => {
      currentDrawerId = data.drawerId;
      console.log(`🎨 Round started! Drawer ID: ${currentDrawerId}. Masked: "${data.maskedWord}", Length: ${data.wordLength}`);
    });

    hostSocket.on('draw-word', (data) => {
      secretWord = data.word;
      console.log(`🤫 Secret Word sent to Host Drawer: "${secretWord}"`);
    });

    hostSocket.on('draw-update', (stroke) => {
      console.log(`✏️ Received draw-update (stroke)`);
    });

    hostSocket.on('draw-update-live', (stroke) => {
      console.log(`✏️ Received draw-update-live`);
    });

    hostSocket.on('draw-chat', (data) => {
      console.log(`💬 Chat Message (Host): Player ID: ${data.playerId} - Msg: "${data.guess}"${data.isCorrectGuess ? ' (CORRECT)' : ''}`);
    });

    // Set up player listeners
    playerSocket.on('joined-room', (data) => {
      console.log(`👋 Player joined room. Active players count: ${data.players.length}`);
    });

    playerSocket.on('draw-round-start', (data) => {
      currentDrawerId = data.drawerId;
      console.log(`🎨 Player received Round start! Drawer ID: ${currentDrawerId}`);
    });

    playerSocket.on('draw-word', (data) => {
      secretWord = data.word;
      console.log(`🤫 Secret Word sent to Player Drawer: "${secretWord}"`);
    });

    playerSocket.on('draw-scores-updated', (data) => {
      console.log(`📊 Scores updated:`, data.scores);
    });

    playerSocket.on('draw-guess-correct', (data) => {
      console.log(`🎉 Player guessed correctly! Points rewarded: +${data.points}. Word: "${data.word}"`);
    });

    playerSocket.on('draw-chat', (data) => {
      console.log(`💬 Chat Message (Player): Player ID: ${data.playerId} - Msg: "${data.guess}"${data.isCorrectGuess ? ' (CORRECT)' : ''}`);
    });

    playerSocket.on('draw-round-end', (data) => {
      console.log(`🏁 Round Ended! Secret word was: "${data.word}". Drawer earned: +${data.drawerPoints}. Correct guessers:`, data.correctGuessers);
    });

    // 2. Host creates room in 'draw' mode
    hostSocket.emit('create-room', {
      hostName: 'HostDrawer',
      hostUserId: 'host123',
      config: {
        gameMode: 'draw',
        timeLimit: 10, // short time limit for fast test
        winScore: 50
      }
    });

    // Wait for room-created event
    await new Promise(r => setTimeout(r, 1000));
    assert.ok(roomCode, 'Room code should be generated');

    // 3. Player joins the room
    playerSocket.emit('join-room', {
      code: roomCode,
      playerName: 'GuesserPlayer',
      userId: 'player456'
    });

    await new Promise(r => setTimeout(r, 1000));

    // 4. Host starts the game
    console.log('⚡ Starting the game...');
    hostSocket.emit('start-game', roomCode);

    await new Promise(r => setTimeout(r, 1500));
    assert.ok(currentDrawerId, 'Drawer should be assigned');
    assert.ok(secretWord, 'Secret word should be chosen');

    // Determine who is drawing and who is guessing
    const drawerSocket = (hostSocket.id === currentDrawerId) ? hostSocket : playerSocket;
    const guesserSocket = (hostSocket.id === currentDrawerId) ? playerSocket : hostSocket;

    console.log(`ℹ️ Drawer is ${drawerSocket.id === hostSocket.id ? 'Host' : 'Player'}`);

    // 5. Drawer draws a stroke (live)
    console.log('✏️ Drawer sends live stroke...');
    drawerSocket.emit('draw-stroke-live', {
      code: roomCode,
      stroke: { path: 'M100,100 L200,200', color: '#000000', width: 5 }
    });

    await new Promise(r => setTimeout(r, 500));

    // 6. Drawer commits stroke
    console.log('✏️ Drawer commits final stroke...');
    drawerSocket.emit('draw-stroke', {
      code: roomCode,
      stroke: { path: 'M100,100 L200,200', color: '#000000', width: 5 }
    });

    await new Promise(r => setTimeout(r, 500));

    // 7. Guesser submits a WRONG guess
    console.log('💬 Guesser submits WRONG guess...');
    guesserSocket.emit('draw-guess', {
      code: roomCode,
      guess: 'WRONG_ANSWER_TEST'
    });

    await new Promise(r => setTimeout(r, 1000));

    // 8. Guesser submits the CORRECT guess
    console.log(`💬 Guesser submits CORRECT guess: "${secretWord}"...`);
    guesserSocket.emit('draw-guess', {
      code: roomCode,
      guess: secretWord.replace(/ة/g, 'ه').replace(/أ/g, 'ا').replace(/إ/g, 'ا')
    });

    // Wait for guess processing and round transition
    await new Promise(r => setTimeout(r, 4500));

    console.log('✅ Game 3 (Draw Game) simulation finished successfully!');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  } finally {
    // Disconnect all sockets
    sockets.forEach(s => s.disconnect());
    console.log('🔌 All sockets disconnected.');
    process.exit(0);
  }
}

runTest();
