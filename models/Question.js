const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  category: {
    type: String,
    enum: ['reversed-words', 'general-knowledge', 'describe-it', 'flags', 'word-in-song', 'egyptian-movies'],
    required: true,
  },
  answer: { type: String, required: true },
  // Extra spellings/phrasings that count as correct (e.g. "مصر" for
  // "جمهورية مصر العربية"). Safer than loosening the fuzzy matcher.
  acceptedAnswers: { type: [String], default: [] },
  // Questions a human must score ("sing any song with the word X") have no
  // checkable answer, so they're excluded from written mode where the server
  // grades on its own — otherwise every answer is rejected.
  judgeEvaluated: { type: Boolean, default: false },
  choices: { type: [String], default: [] },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  flagImage: { type: String },
  isCustomTrivia: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  // "الإبلاغ عن السؤال" — one report per user so a single player can't spam it.
  reportCount: { type: Number, default: 0 },
  reportedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});

// Supports the filters used when selecting the next round question.
questionSchema.index({ isCustomTrivia: 1, category: 1, difficulty: 1, judgeEvaluated: 1, _id: 1 });

module.exports = mongoose.model('Question', questionSchema);
