const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');

function buildChoices(flags, index) {
  const answer = flags[index].answer;
  const choices = [answer];

  for (let offset = 1; choices.length < 4 && offset < flags.length; offset++) {
    const candidate = flags[(index + offset) % flags.length].answer;
    if (!choices.includes(candidate)) choices.push(candidate);
  }

  return choices;
}

async function syncFlagQuestions() {
  const sourcePath = path.join(__dirname, '..', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const flags = questions.filter((question) => question.category === 'flags' && question.flagImage);

  if (flags.length < 4) {
    console.warn('Flag sync skipped: at least four flag questions are required.');
    return;
  }

  const operations = [];
  flags.forEach((flag, index) => {
    const shared = {
      text: flag.text,
      category: 'flags',
      answer: flag.answer,
      difficulty: flag.difficulty || 'medium',
      flagImage: flag.flagImage,
    };

    operations.push({
      updateOne: {
        filter: { category: 'flags', answer: flag.answer, isCustomTrivia: true, flagImage: { $exists: true } },
        update: { $set: { ...shared, choices: buildChoices(flags, index), isCustomTrivia: true } },
        upsert: true,
      },
    });
    operations.push({
      updateOne: {
        filter: { category: 'flags', answer: flag.answer, isCustomTrivia: { $ne: true }, flagImage: { $exists: true } },
        update: { $set: { ...shared, isCustomTrivia: false } },
        upsert: true,
      },
    });
  });

  const result = await Question.bulkWrite(operations);
  console.log(`Flag questions synced (${flags.length} countries, ${result.upsertedCount} added).`);
}

module.exports = syncFlagQuestions;
