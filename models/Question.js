const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  category: {
    type: String,
    enum: ['reversed-words', 'general-knowledge', 'describe-it', 'flags', 'word-in-song', 'egyptian-movies'],
    required: true,
  },
  answer: { type: String, required: true },
  choices: { type: [String], default: [] },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  flagImage: { type: String },
  isCustomTrivia: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Question', questionSchema);
