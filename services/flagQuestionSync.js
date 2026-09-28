const fs = require('fs');
const path = require('path');
const Question = require('../models/Question');

async function syncFlagQuestions() {
  const sourcePath = path.join(__dirname, '..', 'data', 'questions.json');
  const questions = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const flags = questions.filter((question) => question.category === 'flags' && question.flagImage);

  if (flags.length < 4) {
    console.warn('Flag sync skipped: at least four flag questions are required.');
    return;
  }

  const operations = flags.filter((flag) => flag.source && flag.bankKey).map((flag) => {
    const { status, ...record } = flag;
    return {
      updateOne: {
        filter: { source: flag.source, bankKey: flag.bankKey },
        update: {
          $set: record,
          $setOnInsert: { status: 'approved' },
        },
        upsert: true,
      },
    };
  });

  if (!operations.length) {
    console.warn('Flag sync skipped: no source-backed flags with stable bank keys were found.');
    return;
  }

  const result = await Question.bulkWrite(operations);
  console.log(`Source-backed flag questions synced (${operations.length} countries, ${result.upsertedCount} added).`);
}

module.exports = syncFlagQuestions;
