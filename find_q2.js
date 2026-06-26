require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const qs = await Question.find({ gameId: 'game1' });
  console.log('Total Game 1 questions:', qs.length);
  qs.forEach(q => {
    if (q.question.includes('الناظر') || q.question.includes('ناظر')) {
      console.log('Found:', q.question);
    }
  });
  process.exit(0);
});
