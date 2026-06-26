const mongoose = require('mongoose');

const playerResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: { type: String, required: true },
  score: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  wrongAnswers: { type: Number, default: 0 },
}, { _id: false });

const gameHistorySchema = new mongoose.Schema({
  roomCode: { type: String, required: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  players: [playerResultSchema],
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  totalRounds: { type: Number, default: 0 },
  categories: [{ type: String }],
  playedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GameHistory', gameHistorySchema);
