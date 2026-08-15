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
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;
    const query = { 'players.userId': userId };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ error: 'Invalid before cursor' });
      }
      query.playedAt = { $lt: before };
    }

    const history = await GameHistory.find(query)
      .sort({ playedAt: -1 })
      .limit(limit)
      .lean();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
