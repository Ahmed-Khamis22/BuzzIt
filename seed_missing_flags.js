require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');
const fs = require('fs');
const path = require('path');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
  
  const flags = questions.filter(q => q.category === 'flags');
  console.log(`Found ${flags.length} flags in data/questions.json`);

  let count = 0;
  for (const q of flags) {
    const { text, category, answer, difficulty, flagImage } = q;
    // Insert for Trivia
    await Question.create({ text, category, answer, difficulty, flagImage, isCustomTrivia: true });
    // Insert for Buzzer
    await Question.create({ text, category, answer, difficulty, flagImage, isCustomTrivia: false });
    count += 2;
  }
  
  console.log(`Successfully inserted ${count} flag questions into DB!`);
  process.exit();
}
run().catch(console.error);
