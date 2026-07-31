require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const total = await Question.countDocuments({});
  console.log('Total questions in DB:', total);
  
  const byCategory = await Question.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } }
  ]);
  console.log('Categories:', byCategory);
  
  process.exit();
}).catch(console.error);
