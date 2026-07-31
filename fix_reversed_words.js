require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

async function fixReversedWords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const questions = await Question.find({ category: 'reversed-words' });
    console.log(`Found ${questions.length} reversed-words questions.`);

    let updated = 0;
    for (const q of questions) {
      // The answer is the original word
      const word = q.answer;
      
      // Reverse with spaces to force isolated letters
      const reversedWithSpaces = word.split('').reverse().join(' ');

      if (q.isCustomTrivia) {
        // Trivia Question
        q.text = `ما هي الكلمة الصحيحة لهذه الحروف المعكوسة: ( ${reversedWithSpaces} )؟`;
      } else {
        // Buzzer Question
        q.text = `اقرأ الحروف المعكوسة ليخمنها اللاعبون: ( ${reversedWithSpaces} )`;
      }

      await q.save();
      updated++;
    }

    console.log(`Successfully updated ${updated} questions with disconnected letters!`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixReversedWords();
