const express = require('express');
const GameHistory = require('../models/GameHistory');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/save', auth, async (req, res) => {
  try {
    const { roomCode, hostId, players, winnerId, totalRounds, categories } = req.body;
    if (!roomCode || !players) {
      return res.status(400).json({ error: 'roomCode and players are required' });
    }

    const history = await GameHistory.create({
      roomCode,
      hostId,
      players,
      winnerId,
      totalRounds,
      categories,
    });

    res.status(201).json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await GameHistory.find({ 'players.userId': userId }).sort({ playedAt: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
