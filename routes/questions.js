const express = require('express');
const crypto = require('crypto');
const Question = require('../models/Question');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

/**
 * Helper to escape regex special characters
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * GET /api/questions
 * Get approved questions with filter by category and difficulty
 */
router.get('/', async (req, res) => {
  try {
    const { category, difficulty, limit = 10 } = req.query;
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 10;

    // Only fetch approved questions by default
    const filter = { $or: [{ status: 'approved' }, { status: { $exists: false } }] };
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;

    const questions = await Question.aggregate([
      { $match: filter },
      { $sample: { size: safeLimit } },
    ]);

    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/questions/suggest
 * UGC: Allows players to suggest a question in-game (WITH ANTI-SPAM & ANTI-DUPLICATE CHECKS)
 */
router.post('/suggest', auth, async (req, res) => {
  const requestId = crypto.randomUUID();
  try {
    const { text, category, answer, choices, difficulty } = req.body;

    // 1. Basic field checks
    if (typeof text !== 'string' || typeof category !== 'string' || typeof answer !== 'string' || !text.trim() || !category.trim() || !answer.trim()) {
      return res.status(400).json({ error: 'السؤال، الفئة، والإجابة هي حقول مطلوبة.' });
    }

    const trimmedText = text.trim();
    const trimmedAnswer = answer.trim();
    const allowedCategories = Question.schema.path('category')?.enumValues || [];
    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'نوع السؤال المختار غير معروف. اختار نوعًا من القائمة.' });
    }
    if (difficulty && !['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({ error: 'درجة صعوبة السؤال غير صالحة.' });
    }

    // 2. Minimum length checks (prevent spam/gibberish like "a", "123")
    if (trimmedText.length < 10) {
      return res.status(400).json({ error: 'نص السؤال قصير جداً. يجب أن يكون 10 أحرف على الأقل.' });
    }
    if (trimmedAnswer.length < 2) {
      return res.status(400).json({ error: 'الإجابة قصيرة جداً. يجب أن تكون حرفين على الأقل.' });
    }

    // 3. User pending limit check (max 5 pending questions at a time per user to stop spamming)
    const pendingCount = await Question.countDocuments({
      submittedBy: req.userId,
      status: 'pending',
    });
    if (pendingCount >= 5) {
      return res.status(429).json({
        error: 'لديك 5 أسئلة بانتظار المراجعة بالفعل. انتظر مراجعتها أولاً قبل إضافة أسئلة جديدة.',
      });
    }

    // 4. Duplicate question check (case-insensitive search)
    const existingQuestion = await Question.findOne({
      text: { $regex: new RegExp(`^${escapeRegex(trimmedText)}$`, 'i') },
    });
    if (existingQuestion) {
      return res.status(409).json({ error: 'هذا السؤال موجود بالفعل في قاعدة البيانات.' });
    }

    // 5. Create pending question (NO REWARD YET - Reward is given ONLY upon Admin approval)
    const question = await Question.create({
      text: trimmedText,
      category,
      answer: trimmedAnswer,
      acceptedAnswers: [trimmedAnswer],
      choices: Array.isArray(choices) ? choices.map((c) => String(c).trim()).filter(Boolean) : [],
      difficulty: difficulty || 'medium',
      status: 'pending',
      submittedBy: req.userId,
    });

    res.status(201).json({
      message: 'تم إرسال اقتراحك بنجاح! سيتم مراجعته من فريق الأدمن ورصد الـ 50 كوينز في حسابك عند الاعتماد.',
      question,
    });
  } catch (err) {
    console.error(`[Question Suggest] requestId=${requestId} userId=${req.userId} code=${err.code || 'unknown'} message=${err.message}`, err.stack);
    res.status(500).json({
      error: 'حصل عطل أثناء حفظ السؤال. حاول تاني واكتب كود المتابعة للدعم لو المشكلة استمرت.',
      requestId,
    });
  }
});

/**
 * GET /api/questions/pending (Admin)
 * Retrieve pending UGC suggested questions
 */
router.get('/pending', auth, admin, async (req, res) => {
  try {
    const pendingQuestions = await Question.find({ status: 'pending' })
      .populate('submittedBy', 'username profileImage')
      .sort({ createdAt: -1 });

    res.json(pendingQuestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/questions/:id/approve (Admin)
 * Approve a suggested question & reward player (50 coins + 20 XP)
 */
router.post('/:id/approve', auth, admin, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'السؤال غير موجود.' });

    if (question.status === 'approved') {
      return res.status(400).json({ error: 'تمت الموافقة على هذا السؤال بالفعل من قبل.' });
    }

    question.status = 'approved';
    await question.save();

    // Reward player ONLY NOW after admin verified the question is valid and not spam
    if (question.submittedBy) {
      await User.findByIdAndUpdate(question.submittedBy, {
        $inc: { coins: 50, xp: 20 },
      });
    }

    res.json({ success: true, message: 'تمت الموافقة على السؤال ورصد 50 كوينز للاعب.', question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/questions/:id/reject (Admin)
 * Reject a suggested question (No reward given)
 */
router.post('/:id/reject', auth, admin, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'السؤال غير موجود.' });

    question.status = 'rejected';
    await question.save();

    res.json({ success: true, message: 'تم رفض السؤال وتجاهله.', question });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/questions (Admin Direct Add)
 */
router.post('/', auth, admin, async (req, res) => {
  try {
    const { text, category, answer, difficulty, flagImage, acceptedAnswers, choices } = req.body;
    if (!text || !category || !answer) {
      return res.status(400).json({ error: 'text, category and answer are required' });
    }

    const question = await Question.create({
      text: text.trim(),
      category,
      answer: answer.trim(),
      acceptedAnswers: acceptedAnswers || [answer.trim()],
      choices: choices || [],
      difficulty,
      flagImage,
      status: 'approved',
    });
    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/questions/:id/report
 */
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
