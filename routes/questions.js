const express = require('express');
const Question = require('../models/Question');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category, difficulty, limit = 10 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;

    const questions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: Number(limit) } },
    ]);

    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, admin, async (req, res) => {
  try {
    const { text, category, answer, difficulty, flagImage } = req.body;
    if (!text || !category || !answer) {
      return res.status(400).json({ error: 'text, category and answer are required' });
    }

    const question = await Question.create({ text, category, answer, difficulty, flagImage });
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/report', auth, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'السؤال غير موجود.' });

    if (question.reportedBy.some((id) => String(id) === String(req.userId))) {
      return res.status(409).json({ error: 'أبلغت عن هذا السؤال بالفعل.' });
    }

    question.reportedBy.push(req.userId);
    question.reportCount += 1;
    await question.save();

    res.json({ success: true, reportCount: question.reportCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
