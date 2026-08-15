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
  const answers = flags.map(q => q.answer);

  let count = 0;
  for (const [index, q] of flags.entries()) {
    const { text, category, answer, difficulty, flagImage } = q;
    const choices = [answer];
    for (let offset = 1; choices.length < 4; offset++) {
      const candidate = answers[(index + offset) % answers.length];
      if (!choices.includes(candidate)) choices.push(candidate);
    }
    // Insert for Trivia
    await Question.updateOne(
      { category, answer, isCustomTrivia: true, flagImage: { $exists: true } },
      { $set: { text, category, answer, difficulty, flagImage, choices, isCustomTrivia: true } },
      { upsert: true }
    );
    // Insert for Buzzer
    await Question.updateOne(
      { category, answer, isCustomTrivia: { $ne: true }, flagImage: { $exists: true } },
      { $set: { text, category, answer, difficulty, flagImage, isCustomTrivia: false } },
      { upsert: true }
    );
    count += 2;
  }
  
  console.log(`Successfully inserted ${count} flag questions into DB!`);
  process.exit();
}
run().catch(console.error);
