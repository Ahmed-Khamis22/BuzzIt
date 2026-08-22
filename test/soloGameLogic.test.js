const test = require('node:test');
const assert = require('node:assert/strict');

const {
  answerCount,
  buildDifficultyCurve,
  evaluateContextualAnswer,
  evaluateKnownAnswer,
  normalizeArabic,
} = require('../services/soloGameLogic');
const { parseSoloAnswerJudgment } = require('../services/aiJudge');
const { cacheIdentity } = require('../services/soloJudgmentCache');

test('normalizes common Arabic spelling differences', () => {
  assert.equal(normalizeArabic('  أُخْضَر  '), 'اخضر');
  assert.equal(normalizeArabic('مدرسة'), 'مدرسه');
});

test('known answers catch the forbidden word before accepted variants', () => {
  const question = { answer: 'أسد', acceptedAnswers: ['اسد', 'نمر', 'فهد'] };
  assert.equal(evaluateKnownAnswer(question, 'الأسد').outcome, 'unknown');
  assert.equal(evaluateKnownAnswer(question, 'اسد').outcome, 'forbidden');
  assert.equal(evaluateKnownAnswer(question, 'نمر').outcome, 'valid');
});

test('contextual spelling catches a one-letter typo in the forbidden season', () => {
  const question = {
    answer: 'الصيف',
    acceptedAnswers: ['الشتاء', 'الربيع', 'الخريف'],
  };
  assert.deepEqual(
    evaluateContextualAnswer(question, 'الضيف'),
    {
      outcome: 'forbidden',
      method: 'contextual_spelling',
      confidence: 0.8,
      matchedAnswer: 'الصيف',
      distance: 1,
    },
  );
});

test('contextual spelling accepts a clear transposition but defers ambiguous short words', () => {
  const question = {
    answer: 'الصيف',
    acceptedAnswers: ['الشتاء', 'الربيع', 'الخريف'],
  };
  assert.equal(evaluateContextualAnswer(question, 'الشتااء').outcome, 'valid');

  const shortQuestion = { answer: 'نمر', acceptedAnswers: ['تمر'] };
  assert.equal(evaluateContextualAnswer(shortQuestion, 'قمر').outcome, 'unknown');
});

test('difficulty curve starts broad and ends narrow', () => {
  const questions = Array.from({ length: 15 }, (_, index) => ({
    _id: String(index),
    answer: `forbidden-${index}`,
    acceptedAnswers: Array.from({ length: index + 2 }, (__, answerIndex) => `answer-${index}-${answerIndex}`),
  }));
  const selected = buildDifficultyCurve(questions, 10, () => 0.5);
  assert.equal(selected.length, 10);
  for (let index = 1; index < selected.length; index += 1) {
    assert.ok(answerCount(selected[index - 1]) >= answerCount(selected[index]));
  }
  assert.equal(answerCount(selected[0]), 16);
  assert.equal(answerCount(selected.at(-1)), 2);
});

test('parses a structured solo AI judgment', () => {
  assert.deepEqual(parseSoloAnswerJudgment(JSON.stringify({
    relevant: true,
    matchesForbidden: false,
    confidence: 0.94,
    reason: 'إجابة مناسبة',
  })), {
    relevant: true,
    matchesForbidden: false,
    confidence: 0.94,
    reason: 'إجابة مناسبة',
  });
});

test('persistent cache keys collapse harmless Arabic spelling differences', () => {
  assert.deepEqual(cacheIdentity({
    questionId: '507f1f77bcf86cd799439011',
    forbiddenWord: 'أَحْمَر',
    answer: '  احمر  ',
  }), {
    questionId: '507f1f77bcf86cd799439011',
    normalizedForbidden: 'احمر',
    normalizedAnswer: 'احمر',
  });
});
