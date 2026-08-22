const test = require('node:test');
const assert = require('node:assert/strict');
const { AiJudge } = require('../services/aiJudge');

const googleResponse = (payload) => ({
  data: {
    candidates: [{
      content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] },
    }],
  },
});

const validJudgment = {
  answers: [{ id: 'P1', relevant: true, confidence: 0.99, reason: 'ok' }],
  semanticMatches: [],
};

const judgeOneAnswer = (judge) => judge.judgePredictRound({
  question: 'question',
  answers: [{ playerId: 'socket-a', answer: 'answer' }],
});

test('judging extracts JSON wrapped in ordinary model text', async () => {
  const http = {
    post: async () => googleResponse(`Here is the result:\n${JSON.stringify(validJudgment)}\nDone.`),
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  const result = await judgeOneAnswer(judge);
  assert.equal(result.provider, 'google');
});

test('judging treats an omitted semantic match list as no matches', async () => {
  const http = {
    post: async () => googleResponse({
      answers: [{ id: 'P1', relevant: true, confidence: 0.99, reason: 'ok' }],
    }),
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  const result = await judgeOneAnswer(judge);
  assert.deepEqual(result.semanticMatchPairs, []);
});

test('judging retries once when every available provider returns malformed output', async () => {
  let calls = 0;
  const http = {
    post: async () => {
      calls += 1;
      return calls === 1 ? googleResponse('not-json') : googleResponse(validJudgment);
    },
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  const result = await judgeOneAnswer(judge);
  assert.equal(calls, 2);
  assert.equal(result.provider, 'google');
  assert.equal((await judge.getStatus()).available, true);
});

test('malformed output does not mark a reachable provider as offline', async () => {
  const http = { post: async () => googleResponse('not-json') };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  await assert.rejects(
    judgeOneAnswer(judge),
    (error) => error.message === 'AI_JUDGING_UNAVAILABLE' && error.causes.length === 2,
  );
  assert.equal((await judge.getStatus()).available, true);
});

test('authentication errors are not retried', async () => {
  let calls = 0;
  const http = {
    post: async () => {
      calls += 1;
      const error = new Error('unauthorized');
      error.response = { status: 401 };
      throw error;
    },
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  await assert.rejects(judgeOneAnswer(judge), { message: 'AI_JUDGING_UNAVAILABLE' });
  assert.equal(calls, 1);
  assert.equal((await judge.getStatus()).available, false);
});
