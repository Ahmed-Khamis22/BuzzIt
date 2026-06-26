require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const qs = await Question.find({ question: /الناظر/ });
  console.log(qs.map(q => ({ id: q._id, question: q.question, answers: q.answers, correctIndex: q.correctAnswerIndex })));
  process.exit(0);
});
