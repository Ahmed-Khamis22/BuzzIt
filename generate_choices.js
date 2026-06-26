require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

async function generateChoices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/buzzit');
    console.log('Connected to DB');

    const questions = await Question.find({});
    console.log(`Found ${questions.length} questions. Updating choices...`);

    // Group all answers by category to use as wrong choices
    const answersByCategory = {};
    for (const q of questions) {
      if (!answersByCategory[q.category]) {
        answersByCategory[q.category] = [];
      }
      if (!answersByCategory[q.category].includes(q.answer)) {
        answersByCategory[q.category].push(q.answer);
      }
    }

    let updatedCount = 0;

    for (const q of questions) {
      // If choices already exist and have 4 items, we can skip or overwrite. Let's overwrite to be safe.
      const categoryAnswers = answersByCategory[q.category];
      
      // Filter out the correct answer
      let wrongAnswers = categoryAnswers.filter(ans => ans !== q.answer);
      
      // Shuffle wrong answers
      wrongAnswers = wrongAnswers.sort(() => 0.5 - Math.random());
      
      // Pick 3 wrong answers (or less if not enough in category)
      let selectedWrong = wrongAnswers.slice(0, 3);

      // If a category has very few questions, fallback to answers from ANY category
      if (selectedWrong.length < 3) {
        let allAnswers = Object.values(answersByCategory).flat();
        allAnswers = allAnswers.filter(ans => ans !== q.answer && !selectedWrong.includes(ans));
        allAnswers = allAnswers.sort(() => 0.5 - Math.random());
        const needed = 3 - selectedWrong.length;
        selectedWrong = selectedWrong.concat(allAnswers.slice(0, needed));
      }

      // Combine with correct answer
      let finalChoices = [q.answer, ...selectedWrong];

      // Shuffle the final 4 choices
      finalChoices = finalChoices.sort(() => 0.5 - Math.random());

      q.choices = finalChoices;
      await q.save();
      updatedCount++;
    }

    console.log(`Successfully generated choices for ${updatedCount} questions.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

generateChoices();
