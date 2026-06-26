require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const allQuestions = await Question.find({});
    console.log(`Found ${allQuestions.length} questions.`);

    // Group by category
    const byCategory = {};
    allQuestions.forEach(q => {
      const cat = q.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(q.answer);
    });

    let updatedCount = 0;

    for (let q of allQuestions) {
      const cat = q.category || 'general';
      let pool = byCategory[cat].filter(ans => ans !== q.answer);

      // If category doesn't have enough answers, fallback to all answers
      if (pool.length < 3) {
        pool = allQuestions.map(x => x.answer).filter(ans => ans !== q.answer);
      }

      // Shuffle pool
      pool = pool.sort(() => 0.5 - Math.random());

      // Pick 3 unique wrong answers
      const wrongChoices = Array.from(new Set(pool)).slice(0, 3);
      
      // Combine and shuffle
      const allChoices = [...wrongChoices, q.answer].sort(() => 0.5 - Math.random());
      
      q.choices = allChoices;
      await q.save();
      updatedCount++;
    }

    console.log(`Successfully generated smart choices for ${updatedCount} questions based on categories.`);
    process.exit(0);
  } catch (error) {
    console.error('Error generating smart choices:', error);
    process.exit(1);
  }
}

run();
