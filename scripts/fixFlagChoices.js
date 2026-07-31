// One-off fix: trivia-mode "flags" questions were seeded with an empty
// `choices` array, so the MCQ screen had nothing to render for them — that's
// why they looked like they "never show up". Backfills choices using other
// flag answers in the DB as distractors.
require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('../models/Question');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const flagQuestions = await Question.find({ category: 'flags', isCustomTrivia: true });
  const allAnswers = [...new Set(flagQuestions.map((q) => q.answer))];

  let fixed = 0;
  for (const q of flagQuestions) {
    if (q.choices && q.choices.length > 0) continue;

    const pool = allAnswers.filter((a) => a !== q.answer);
    const wrong = shuffle(pool).slice(0, 3);
    if (wrong.length < 3) continue; // not enough distinct countries yet, skip

    q.choices = shuffle([q.answer, ...wrong]);
    await q.save();
    fixed++;
  }

  console.log(`Backfilled choices on ${fixed}/${flagQuestions.length} trivia flag questions.`);
  process.exit();
}
run().catch((e) => { console.error(e); process.exit(1); });
