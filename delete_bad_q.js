require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  await Question.deleteOne({ _id: '6a3e67f38db31986266e79be' });
  console.log('Deleted bad question.');
  process.exit(0);
});
