// Typing is transient activity, never answer content or a submitted-answer flag.
function registerPredictTyping(socket, io, rooms) {
  let lastActiveAt = 0;
  socket.on('predict-typing', (payload = {}) => {
    const { code, round, typing } = payload || {};
    const room = rooms[code];
    if (!room || room.status !== 'PLAYING' || room.config?.gameMode !== 'predict' ||
        room.predictPhase !== 'write' || room.predictRound !== round ||
        !room.players[socket.id] || room.players[socket.id].disconnected ||
        !room.predictTeams?.[socket.id] || room.predictAnswers?.[socket.id] ||
        typeof typing !== 'boolean') return;
    const now = Date.now();
    if (typing && now - lastActiveAt < 400) return;
    lastActiveAt = typing ? now : 0;
    io.to(code).emit('predict-typing', { playerId: socket.id, round, typing });
  });
}

module.exports = { registerPredictTyping };
