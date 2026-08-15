const fs = require('fs');
const path = require('path');

function normalize(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[ًٌٍَُِّْـ\s'"؟?!،,.()\-]/g, '')
    .toLowerCase();
}

const findings = [];
const baseQuestions = require('../data/questions.json');

baseQuestions.forEach((question, index) => {
  const answer = normalize(question.answer);
  if (answer.length > 1 && normalize(question.text).includes(answer)) {
    findings.push(['data/questions.json', index + 1, question.text, question.answer]);
  }
});

const root = path.join(__dirname, '..');
const seedFiles = fs.readdirSync(root).filter((name) => /^(seed.*|add_hard_questions)\.js$/.test(name));
const objectPattern = /\{\s*(?:q|text):\s*(["'`])(.+?)\1\s*,\s*(?:a|answer):\s*(["'`])(.+?)\3/g;

for (const file of seedFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(objectPattern)) {
    const answer = normalize(match[4]);
    if (answer.length > 1 && normalize(match[2]).includes(answer)) {
      findings.push([file, '-', match[2], match[4]]);
    }
  }
}

console.log(`Answer appears in question: ${findings.length}`);
findings.forEach((finding) => console.log(finding.join('\t')));
