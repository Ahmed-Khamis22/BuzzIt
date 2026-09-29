const fs = require('fs');
const path = require('path');
const curatedFacts = require('../services/curatedFunTrivia');

const root = path.join(__dirname, '..');
const previewPath = path.join(root, 'question-bank-all-categories-preview.json');
const fallbackPath = path.join(root, 'data', 'questions.json');
const current = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
const retained = current.filter((question) => ![
  'general-knowledge',
  'egyptian-movies',
].includes(question.category));
const preview = [...retained, ...curatedFacts];

if (new Set(preview.map((question) => question.bankKey)).size !== preview.length) {
  throw new Error('Duplicate bankKey in the curated question bank.');
}

fs.writeFileSync(previewPath, `${JSON.stringify(preview, null, 2)}\n`, 'utf8');
fs.writeFileSync(fallbackPath, `${JSON.stringify(preview.map((question) => ({
  ...question,
  status: 'approved',
})), null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  total: preview.length,
  curatedFacts: curatedFacts.length,
  generalKnowledge: curatedFacts.filter((question) => question.category === 'general-knowledge').length,
  egyptianMovies: curatedFacts.filter((question) => question.category === 'egyptian-movies').length,
}));
