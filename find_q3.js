require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const qs = await Question.find({});
  console.log('Total questions:', qs.length);
  if (qs.length > 0) {
    console.log('Sample question structure:', qs[0]);
  }
  
  const nazerQs = qs.filter(q => JSON.stringify(q).includes('الناظر') || JSON.stringify(q).includes('ناظر'));
  console.log('Questions containing الناظر in ANY field:', nazerQs.length);
  nazerQs.forEach(q => console.log(q));
  
  process.exit(0);
});
