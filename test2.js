require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const custom = await Question.aggregate([
    { $group: { _id: { cat: "$category", isCustom: "$isCustomTrivia" }, count: { $sum: 1 } } }
  ]);
  console.log(custom);
  process.exit();
}).catch(console.error);
