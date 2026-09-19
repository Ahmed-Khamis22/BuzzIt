const test = require('node:test');
const assert = require('node:assert/strict');
const { AiJudge, parseJudgment } = require('../services/aiJudge');

const googleResponse = (payload) => ({
  data: { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] },
});

test('AI judging is unavailable when no backend provider is configured', async () => {
  const judge = new AiJudge({ env: {}, http: { post: async () => assert.fail('must not call network') } });
  assert.deepEqual(await judge.getStatus({ probe: true }), {
    available: false,
    reason: 'NOT_CONFIGURED',
    providers: [],
  });
});

test('AI stops using providers after the configured shared daily budget', async () => {
  let calls = 0;
  const judge = new AiJudge({
    env: { GEMINI_API_KEY: 'test-key', AI_DAILY_REQUEST_LIMIT: '1' },
    http: {
      post: async () => {
        calls += 1;
        return googleResponse({
          answers: [{ id: 'P1', relevant: true, confidence: 0.99, reason: 'صحيحة' }],
          semanticMatches: [],
        });
      },
    },
  });

  await judge.judgePredictRound({
    question: 'اذكر لونًا',
    answers: [{ playerId: 'socket-a', answer: 'أزرق' }],
  });
  await assert.rejects(
    judge.judgePredictRound({
      question: 'اذكر لونًا',
      answers: [{ playerId: 'socket-b', answer: 'أحمر' }],
    }),
    { message: 'AI_JUDGING_UNAVAILABLE' },
  );

  assert.equal(calls, 1);
  const status = await judge.getStatus();
  assert.equal(status.totalRequestsToday, 1);
  assert.equal(status.totalRemainingToday, 0);
  assert.equal(status.available, false);
});

test('Google judgment maps anonymous IDs and only rejects high-confidence decisions', async () => {
  const http = {
    post: async () => googleResponse({
      answers: [
        { id: 'P1', relevant: false, confidence: 0.96, reason: 'بعيدة عن السؤال' },
        { id: 'P2', relevant: false, confidence: 0.54, reason: 'قرار غير مؤكد' },
      ],
      semanticMatches: [
        { firstId: 'P1', secondId: 'P2', sameMeaning: true, confidence: 0.93, reason: 'نفس المعنى' },
      ],
    }),
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  const result = await judge.judgePredictRound({
    question: 'اذكر مدينة',
    answers: [
      { playerId: 'socket-a', answer: 'القاهرة' },
      { playerId: 'socket-b', answer: 'عاصمة مصر' },
    ],
  });

  assert.equal(result.provider, 'google');
  assert.deepEqual(result.rejectedPlayerIds, ['socket-a']);
  assert.deepEqual(result.semanticMatchPairs[0].playerIds, ['socket-a', 'socket-b']);
  assert.equal(result.reasonsByPlayerId['socket-a'], 'بعيدة عن السؤال');
});

test('Cloudflare is used when the Google provider fails', async () => {
  const calls = [];
  const http = {
    post: async (url, body) => {
      calls.push({ url, body });
      if (url.includes('generativelanguage.googleapis.com')) {
        const error = new Error('google down');
        error.response = { status: 503 };
        throw error;
      }
      return {
        data: {
          result: {
            response: JSON.stringify({
              answers: [{ id: 'P1', relevant: true, confidence: 0.99, reason: 'مرتبطة' }],
              semanticMatches: [],
            }),
          },
        },
      };
    },
  };
  const judge = new AiJudge({
    env: { GEMINI_API_KEY: 'google', CLOUDFLARE_ACCOUNT_ID: 'account', CLOUDFLARE_AI_TOKEN: 'cloudflare' },
    http,
  });
  const result = await judge.judgePredictRound({
    question: 'اذكر لونًا',
    answers: [{ playerId: 'socket-a', answer: 'أزرق' }],
  });

  assert.equal(result.provider, 'cloudflare');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.max_tokens, 700);
  assert.equal((await judge.getStatus()).providers.find((provider) => provider.id === 'google').available, false);
});

test('Groq is used before the other fallbacks when Google is unavailable', async () => {
  const calls = [];
  const http = {
    post: async (url, body) => {
      calls.push({ url, body });
      if (url.includes('generativelanguage.googleapis.com')) {
        const error = new Error('google quota');
        error.response = { status: 429 };
        throw error;
      }
      if (url.includes('api.groq.com')) {
        return {
          data: {
            choices: [{ message: { content: JSON.stringify({
              relevant: true,
              matchesForbidden: false,
              confidence: 0.98,
              reason: 'valid answer',
            }) } }],
          },
        };
      }
      assert.fail('A later fallback should not be called after Groq succeeds');
    },
  };
  const judge = new AiJudge({
    env: {
      GEMINI_API_KEY: 'google',
      GROQ_API_KEY: 'groq',
      CEREBRAS_API_KEY: 'cerebras',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      CLOUDFLARE_AI_TOKEN: 'cloudflare',
    },
    http,
  });
  const result = await judge.judgeDontSayMyWordAnswer({
    question: 'name a color',
    forbiddenWord: 'red',
    acceptedAnswers: ['blue', 'green'],
    answer: 'blue',
  });

  assert.equal(result.provider, 'groq');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.model, 'openai/gpt-oss-20b');
  assert.equal(calls[1].body.max_completion_tokens, 180);
});

test('Cerebras is used before Cloudflare when Google is unavailable', async () => {
  const calls = [];
  const http = {
    post: async (url, body) => {
      calls.push({ url, body });
      if (url.includes('generativelanguage.googleapis.com')) {
        const error = new Error('google quota');
        error.response = { status: 429 };
        throw error;
      }
      if (url.includes('api.cerebras.ai')) {
        return {
          data: {
            choices: [{ message: { content: JSON.stringify({
              relevant: true,
              matchesForbidden: false,
              confidence: 0.97,
              reason: 'إجابة مناسبة',
            }) } }],
          },
        };
      }
      assert.fail('Cloudflare should not be called after Cerebras succeeds');
    },
  };
  const judge = new AiJudge({
    env: {
      GEMINI_API_KEY: 'google',
      GROQ_API_KEY: '',
      CEREBRAS_API_KEY: 'cerebras',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      CLOUDFLARE_AI_TOKEN: 'cloudflare',
    },
    http,
  });
  const result = await judge.judgeDontSayMyWordAnswer({
    question: 'اذكر فصلًا من فصول السنة',
    forbiddenWord: 'الصيف',
    acceptedAnswers: ['الشتاء', 'الربيع', 'الخريف'],
    answer: 'الشتاء',
  });

  assert.equal(result.provider, 'cerebras');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.max_completion_tokens, 180);
});

test('parser ignores unknown IDs and low-confidence semantic matches', () => {
  const parsed = parseJudgment({
    answers: [{ id: 'unknown', relevant: false, confidence: 1, reason: 'x' }],
    semanticMatches: [{ firstId: 'P1', secondId: 'P2', sameMeaning: true, confidence: 0.5, reason: 'شك' }],
  }, new Map([['P1', 'a'], ['P2', 'b']]));
  assert.deepEqual(parsed.rejectedPlayerIds, []);
  assert.deepEqual(parsed.semanticMatchPairs, []);
});

test('bot answer generation returns one short answer through the shared provider fallback', async () => {
  const http = {
    post: async () => googleResponse({ answer: 'الإسكندرية' }),
  };
  const judge = new AiJudge({ env: { GEMINI_API_KEY: 'test-key' }, http });
  const result = await judge.generatePredictBotAnswer({
    question: 'اذكر مدينة ساحلية في مصر',
    role: 'escape',
  });
  assert.deepEqual(result, { answer: 'الإسكندرية', provider: 'google' });
});
