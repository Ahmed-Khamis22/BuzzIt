const axios = require('axios');

const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
const DEFAULT_CF_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const DEFAULT_CEREBRAS_MODEL = 'gpt-oss-120b';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const HEALTH_CACHE_MS = 5 * 60 * 1000;

const JUDGMENT_SCHEMA = {
  type: 'object',
  required: ['answers', 'semanticMatches'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'relevant', 'confidence', 'reason'],
        properties: {
          id: { type: 'string' },
          relevant: { type: 'boolean' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
    semanticMatches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['firstId', 'secondId', 'sameMeaning', 'confidence', 'reason'],
        properties: {
          firstId: { type: 'string' },
          secondId: { type: 'string' },
          sameMeaning: { type: 'boolean' },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    },
  },
};

const BOT_ANSWER_SCHEMA = {
  type: 'object',
  required: ['answer'],
  properties: {
    answer: { type: 'string' },
  },
};

const SOLO_ANSWER_SCHEMA = {
  type: 'object',
  required: ['relevant', 'matchesForbidden', 'confidence', 'reason'],
  properties: {
    relevant: { type: 'boolean' },
    matchesForbidden: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
};

const TEN_BY_TEN_SCHEMA = {
  type: 'object',
  required: ['playerAnswer', 'aiMove'],
  properties: {
    playerAnswer: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    aiMove: {
      type: 'object',
      required: ['type', 'text'],
      properties: {
        type: { type: 'string', enum: ['question', 'guess'] },
        text: { type: 'string' },
      },
    },
  },
};

const TEN_BY_TEN_ANSWER_SCHEMA = {
  type: 'object',
  required: ['answer', 'correctGuess', 'intent', 'guess', 'canonicalClaim', 'reason', 'reply'],
  properties: {
    answer: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    correctGuess: { type: 'boolean' },
    intent: { type: 'string', enum: ['question', 'guess'] },
    guess: { type: 'string' },
    canonicalClaim: { type: 'string' },
    reason: { type: 'string' },
    reply: { type: 'string' },
  },
};

const TEN_BY_TEN_MOVE_SCHEMA = {
  type: 'object',
  required: ['text', 'isGuess', 'dimension'],
  properties: {
    text: { type: 'string' },
    isGuess: { type: 'boolean' },
    dimension: { type: 'string' },
  },
};

function stripJsonFence(value) {
  return String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonPayload(raw) {
  if (raw && typeof raw === 'object') return raw;
  const cleaned = stripJsonFence(raw).replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (originalError) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw originalError;
  }
}

function isStructuredOutputError(error) {
  return error instanceof SyntaxError
    || String(error?.message || '').startsWith('AI_JUDGMENT_')
    || String(error?.message || '').startsWith('AI_BOT_')
    || String(error?.message || '').startsWith('AI_SOLO_')
    || String(error?.message || '').startsWith('AI_TEN_BY_TEN_');
}

function describeProviderError(provider, error, attempt) {
  return {
    provider: provider.id,
    attempt,
    status: error?.response?.status || null,
    code: error?.code || null,
    reason: isStructuredOutputError(error) ? 'INVALID_AI_RESPONSE' : String(error?.message || 'UNKNOWN').slice(0, 160),
  };
}

function outputTokenLimit(schema) {
  if (schema === BOT_ANSWER_SCHEMA) return 100;
  if (schema === SOLO_ANSWER_SCHEMA) return 180;
  if (schema === TEN_BY_TEN_SCHEMA) return 220;
  if (schema === TEN_BY_TEN_ANSWER_SCHEMA) return 180;
  if (schema === TEN_BY_TEN_MOVE_SCHEMA) return 140;
  return 700;
}

function parseTenByTenTurn(raw) {
  const parsed = parseJsonPayload(raw);
  const playerAnswer = ['yes', 'no', 'unknown'].includes(parsed?.playerAnswer)
    ? parsed.playerAnswer
    : null;
  const moveType = ['question', 'guess'].includes(parsed?.aiMove?.type)
    ? parsed.aiMove.type
    : null;
  const moveText = String(parsed?.aiMove?.text || '').trim().slice(0, 100);
  if (!playerAnswer || !moveType || !moveText) throw new Error('AI_TEN_BY_TEN_INVALID_SHAPE');
  return { playerAnswer, aiMove: { type: moveType, text: moveText } };
}

function parseTenByTenAnswer(raw) {
  const parsed = parseJsonPayload(raw);
  const intent = ['question', 'guess'].includes(parsed?.intent) ? parsed.intent : null;
  const guess = String(parsed?.guess || '').trim().slice(0, 80);
  const reply = String(parsed?.reply || '').trim().slice(0, 120);
  if (
    !['yes', 'no', 'unknown'].includes(parsed?.answer)
    || typeof parsed?.correctGuess !== 'boolean'
    || !intent
    || (intent === 'guess' && !guess)
  ) {
    throw new Error('AI_TEN_BY_TEN_ANSWER_INVALID');
  }
  return { answer: parsed.answer, correctGuess: parsed.correctGuess, intent, guess, reply };
}

function parseTenByTenMove(raw) {
  const parsed = parseJsonPayload(raw);
  const text = String(parsed?.text || '').trim().slice(0, 100);
  const dimension = String(parsed?.dimension || '').trim().toLowerCase().slice(0, 60);
  if (!text || typeof parsed?.isGuess !== 'boolean') throw new Error('AI_TEN_BY_TEN_MOVE_INVALID');
  return {
    type: 'question',
    isGuess: parsed.isGuess,
    text,
    ...(dimension ? { dimension } : {}),
  };
}

function normalizeMoveFingerprint(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function movePropertyCore(value) {
  const ignored = new Set(['هل', 'هو', 'هي', 'ده', 'دي', 'دا', 'الشيء', 'الحاجه', 'الكلمه', 'غير', 'مش', 'ليس', 'لا']);
  return normalizeMoveFingerprint(value)
    .split(' ')
    .filter((token) => token && !ignored.has(token))
    .sort()
    .join(' ');
}

function isRedundantTenByTenMove(move, history = []) {
  const nextText = normalizeMoveFingerprint(move?.text);
  const nextCore = movePropertyCore(move?.text);
  const nextDimension = String(move?.dimension || '').trim().toLowerCase();
  return history.some((item) => {
    if (nextText && nextText === normalizeMoveFingerprint(item?.text)) return true;
    if (nextCore && nextCore === movePropertyCore(item?.text)) return true;
    const previousDimension = String(item?.dimension || '').trim().toLowerCase();
    return Boolean(nextDimension && previousDimension && nextDimension === previousDimension);
  });
}

function parseJudgment(raw, answerIdMap) {
  const parsed = parseJsonPayload(raw);
  if (!parsed || !Array.isArray(parsed.answers)) {
    throw new Error('AI_JUDGMENT_INVALID_SHAPE');
  }
  const semanticMatches = Array.isArray(parsed.semanticMatches) ? parsed.semanticMatches : [];

  const knownIds = new Set(answerIdMap.keys());
  const decisions = new Map();
  for (const item of parsed.answers) {
    if (!knownIds.has(item?.id)) continue;
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0));
    decisions.set(answerIdMap.get(item.id), {
      relevant: item.relevant !== false || confidence < 0.85,
      confidence,
      reason: String(item.reason || '').slice(0, 120),
    });
  }

  const semanticMatchPairs = [];
  for (const item of semanticMatches) {
    const first = answerIdMap.get(item?.firstId);
    const second = answerIdMap.get(item?.secondId);
    const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
    if (!first || !second || first === second || item.sameMeaning !== true || confidence < 0.85) continue;
    semanticMatchPairs.push({
      playerIds: [first, second],
      confidence,
      reason: String(item.reason || '').slice(0, 120),
    });
  }

  const rejectedPlayerIds = [];
  const reasonsByPlayerId = {};
  for (const socketId of answerIdMap.values()) {
    const decision = decisions.get(socketId);
    if (decision?.relevant === false) rejectedPlayerIds.push(socketId);
    if (decision?.reason) reasonsByPlayerId[socketId] = decision.reason;
  }
  return { rejectedPlayerIds, reasonsByPlayerId, semanticMatchPairs };
}

function createPrompt(question, anonymousAnswers) {
  return [
    'أنت حكم محايد في لعبة جماعية عربية اسمها توقع ووقع.',
    'مهمتك محدودة في شيئين فقط:',
    '1) هل كل إجابة تصلح منطقيًا ومباشرة كإجابة للسؤال؟ لا ترفض الإجابات المبتكرة أو النادرة، وارفض فقط الإجابة البعيدة بوضوح.',
    '2) قارن كل زوج من الإجابات: sameMeaning=true فقط لو كانتا نفس الإجابة فعليًا رغم اختلاف الإملاء أو اللغة أو الصياغة، وليس لمجرد أنهما من نفس الفئة.',
    'كن محافظًا: عند الشك اعتبر الإجابة relevant=true وsameMeaning=false.',
    'أرجع JSON فقط مطابقًا للمخطط المطلوب، واذكر سببًا عربيًا قصيرًا.',
    `السؤال: ${question}`,
    `الإجابات المجهولة: ${JSON.stringify(anonymousAnswers)}`,
  ].join('\n');
}

function createSoloAnswerPrompt({ question, forbiddenWord, acceptedAnswers, answer }) {
  return [
    'أنت حكم دقيق ومتسامح في لعبة عربية فردية اسمها "ما تقولش كلمتي".',
    'اللاعب يرى المطلوب فقط، ولا يرى الكلمة الممنوعة. يجب أن يكتب إجابة واحدة مناسبة للمطلوب وليست الكلمة الممنوعة أو مرادفًا مطابقًا لها.',
    'احكم على المعنى، وليس التطابق الحرفي فقط. اقبل العامية المصرية، المفرد والجمع، اختلاف الهمزات، والأسماء الشائعة الصحيحة.',
    'relevant=true إذا كانت إجابة اللاعب عنصرًا واحدًا يحقق المطلوب بشكل منطقي ومباشر. ارفض الهبد، الشرح الطويل، والإجابة البعيدة عن الفئة.',
    'matchesForbidden=true إذا كانت إجابة اللاعب هي نفس الكلمة الممنوعة في المعنى، حتى مع اختلاف الكتابة أو اللهجة أو الصيغة.',
    'الأمثلة المقبولة للاستدلال على حدود الفئة فقط، وليست قائمة مغلقة. الإجابة الجديدة الصحيحة تُقبل.',
    'عند الشك البسيط في ارتباط إجابة معقولة بالمطلوب، كن في صف اللاعب واجعل relevant=true. لا تجعل matchesForbidden=true إلا عند تطابق المعنى بوضوح.',
    'أرجع JSON فقط مطابقًا للمخطط، مع سبب عربي قصير لا يكشف تفاصيل زائدة.',
    `المطلوب: ${String(question).slice(0, 400)}`,
    `الكلمة الممنوعة السرية: ${String(forbiddenWord).slice(0, 80)}`,
    `أمثلة إجابات صحيحة: ${JSON.stringify((acceptedAnswers || []).slice(0, 16))}`,
    `إجابة اللاعب: ${String(answer).slice(0, 80)}`,
  ].join('\n');
}

function parseSoloAnswerJudgment(raw) {
  const parsed = parseJsonPayload(raw);
  if (!parsed || typeof parsed.relevant !== 'boolean' || typeof parsed.matchesForbidden !== 'boolean') {
    throw new Error('AI_SOLO_JUDGMENT_INVALID_SHAPE');
  }
  return {
    relevant: parsed.relevant,
    matchesForbidden: parsed.matchesForbidden,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason || '').slice(0, 140),
  };
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

class AiJudge {
  constructor({ env = process.env, http = axios } = {}) {
    this.env = env;
    this.http = http;
    const today = getTodayKey();
    // This is a server-side safety budget for the whole AI feature. Provider
    // quotas are not always identical to the limits configured in their
    // dashboards, so stop before a sudden burst can spend through a free tier
    // or a paid balance. Operators can raise it in Render when demand proves it.
    this.dailyRequestLimit = Math.max(1, Number(env.AI_DAILY_REQUEST_LIMIT) || 1200);
    // Provider order and paid-emergency procedure:
    // docs/AI_FALLBACK_RUNBOOK.md
    this.providers = [
      {
        id: 'google',
        configured: Boolean(env.GEMINI_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        lastLatencyMs: null,
        lastError: null,
        dailyLimit: Math.max(1, Number(env.GEMINI_DAILY_QUOTA) || 1500),
        requestsToday: 0,
        successfulToday: 0,
        failedToday: 0,
        lastResetDay: today,
        run: (prompt, schema) => this.runGoogle(prompt, schema),
      },
      {
        id: 'groq',
        configured: Boolean(env.GROQ_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        lastLatencyMs: null,
        lastError: null,
        dailyLimit: Math.max(1, Number(env.GROQ_DAILY_QUOTA) || 14400),
        requestsToday: 0,
        successfulToday: 0,
        failedToday: 0,
        lastResetDay: today,
        run: (prompt, schema) => this.runGroq(prompt, schema),
      },
      {
        id: 'cerebras',
        configured: Boolean(env.CEREBRAS_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        lastLatencyMs: null,
        lastError: null,
        dailyLimit: Math.max(1, Number(env.CEREBRAS_DAILY_QUOTA) || 14400),
        requestsToday: 0,
        successfulToday: 0,
        failedToday: 0,
        lastResetDay: today,
        run: (prompt, schema) => this.runCerebras(prompt, schema),
      },
      {
        id: 'cloudflare',
        configured: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        lastLatencyMs: null,
        lastError: null,
        dailyLimit: Math.max(1, Number(env.CLOUDFLARE_DAILY_QUOTA) || 10000),
        requestsToday: 0,
        successfulToday: 0,
        failedToday: 0,
        lastResetDay: today,
        run: (prompt, schema) => this.runCloudflare(prompt, schema),
      },
    ];
    this.healthProbePromise = null;
  }

  requestTimeout() {
    // Solo rounds must feel instant. A provider that has not answered by this
    // point is less useful than the deterministic local/fail-open fallback.
    return Math.max(3000, Number(this.env.AI_REQUEST_TIMEOUT_MS) || 6500);
  }

  availableProviders() {
    const now = Date.now();
    if (!this.hasGlobalDailyBudget()) return [];
    return this.providers.filter((provider) => (
      provider.configured
      && provider.disabledUntil <= now
      && this.hasProviderDailyBudget(provider)
    ));
  }

  hasProviderDailyBudget(provider) {
    this.checkDailyReset(provider);
    return (provider.requestsToday || 0) < (provider.dailyLimit || 1);
  }

  totalRequestsToday() {
    return this.providers.reduce((total, provider) => {
      this.checkDailyReset(provider);
      return total + (provider.requestsToday || 0);
    }, 0);
  }

  hasGlobalDailyBudget() {
    return this.totalRequestsToday() < this.dailyRequestLimit;
  }

  checkDailyReset(provider) {
    const today = getTodayKey();
    if (provider.lastResetDay !== today) {
      provider.requestsToday = 0;
      provider.successfulToday = 0;
      provider.failedToday = 0;
      provider.lastResetDay = today;
    }
  }

  markSuccess(provider, latencyMs = null) {
    this.checkDailyReset(provider);
    provider.failures = 0;
    provider.disabledUntil = 0;
    provider.lastCheckedAt = Date.now();
    provider.lastLatencyMs = latencyMs;
    provider.lastError = null;
    provider.requestsToday = (provider.requestsToday || 0) + 1;
    provider.successfulToday = (provider.successfulToday || 0) + 1;
  }

  markFailure(provider, error) {
    this.checkDailyReset(provider);
    provider.failures += 1;
    provider.lastCheckedAt = Date.now();
    provider.requestsToday = (provider.requestsToday || 0) + 1;
    provider.failedToday = (provider.failedToday || 0) + 1;
    const status = error?.response?.status;
    const hardFailure = [400, 401, 402, 403, 404, 429].includes(status);
    const cooldown = status === 402
      ? 6 * 60 * 60 * 1000
      : status === 429
      ? 5 * 60 * 1000
      : hardFailure
        ? 15 * 60 * 1000
        : Math.min(2 * 60 * 1000, provider.failures * 60 * 1000);
    provider.disabledUntil = Date.now() + cooldown;
  }

  recordProviderFailure(provider, error) {
    this.checkDailyReset(provider);
    if (isStructuredOutputError(error)) {
      provider.lastCheckedAt = Date.now();
      provider.requestsToday = (provider.requestsToday || 0) + 1;
      provider.failedToday = (provider.failedToday || 0) + 1;
      return;
    }
    this.markFailure(provider, error);
  }

  rememberProviderError(provider, error, attempt, latencyMs) {
    const details = { ...describeProviderError(provider, error, attempt), latencyMs };
    provider.lastLatencyMs = latencyMs;
    provider.lastError = details;
    console.warn('[ai-provider-failure]', JSON.stringify(details));
    return details;
  }

  async runWithProviderFallback(operation, unavailableCode) {
    // Trying every configured provider and then retrying them can leave a
    // player waiting close to a minute during an outage. Two independent
    // providers give resilience while keeping an interactive turn bounded.
    const providers = this.availableProviders().slice(0, 2);
    const causes = [];

    for (const provider of providers) {
      // A malformed JSON response is not a provider outage. Give that same
      // provider one clean retry before moving to the independent fallback.
      // Every attempt still consumes the shared budget.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        if (!this.hasGlobalDailyBudget() || !this.hasProviderDailyBudget(provider)) break;
        const startedAt = Date.now();
        try {
          const value = await operation(provider);
          this.markSuccess(provider, Date.now() - startedAt);
          return { value, provider: provider.id };
        } catch (error) {
          causes.push(this.rememberProviderError(provider, error, attempt, Date.now() - startedAt));
          this.recordProviderFailure(provider, error);
          if (!isStructuredOutputError(error) || attempt === 2) break;
        }
      }
    }

    const error = new Error(unavailableCode);
    error.causes = causes;
    throw error;
  }

  async runGoogle(prompt, schema = JUDGMENT_SCHEMA) {
    const model = this.env.GEMMA_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await this.http.post(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: outputTokenLimit(schema),
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }, {
      headers: { 'x-goog-api-key': this.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      timeout: this.requestTimeout(),
    });
    return response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  }

  async runCerebras(prompt, schema = JUDGMENT_SCHEMA) {
    const model = this.env.CEREBRAS_MODEL || DEFAULT_CEREBRAS_MODEL;
    const response = await this.http.post('https://api.cerebras.ai/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: 'Return valid JSON only. Follow the requested JSON shape exactly.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_completion_tokens: outputTokenLimit(schema),
      response_format: { type: 'json_object' },
      ...(model === 'gpt-oss-120b' ? { reasoning_effort: 'low' } : {}),
    }, {
      headers: { Authorization: `Bearer ${this.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: this.requestTimeout(),
    });
    return response.data?.choices?.[0]?.message?.content || '';
  }

  async runGroq(prompt, schema = JUDGMENT_SCHEMA) {
    const model = this.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    const response = await this.http.post('https://api.groq.com/openai/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: 'Return valid JSON only. Follow the requested JSON shape exactly.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_completion_tokens: outputTokenLimit(schema),
      response_format: { type: 'json_object' },
      ...(model.startsWith('openai/gpt-oss-')
        ? { reasoning_effort: 'low', include_reasoning: false }
        : {}),
    }, {
      headers: { Authorization: `Bearer ${this.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: this.requestTimeout(),
    });
    return response.data?.choices?.[0]?.message?.content || '';
  }

  async runCloudflare(prompt, schema = JUDGMENT_SCHEMA) {
    const model = this.env.CLOUDFLARE_AI_MODEL || DEFAULT_CF_MODEL;
    const accountId = encodeURIComponent(this.env.CLOUDFLARE_ACCOUNT_ID);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
    const response = await this.http.post(url, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      // Reasoning models can spend the short solo budget before emitting their
      // JSON answer. Workers AI uses max_tokens for this REST endpoint.
      max_tokens: Math.max(512, outputTokenLimit(schema)),
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${this.env.CLOUDFLARE_AI_TOKEN}`, 'Content-Type': 'application/json' },
      timeout: this.requestTimeout(),
    });
    return response.data?.result?.response
      || response.data?.result?.choices?.[0]?.message?.content
      || response.data?.choices?.[0]?.message?.content
      || '';
  }

  async judgePredictRound({ question, answers }) {
    if (!question || !Array.isArray(answers) || answers.length === 0) {
      throw new Error('AI_JUDGMENT_MISSING_INPUT');
    }
    const answerIdMap = new Map();
    const anonymousAnswers = answers.map((answer, index) => {
      const anonymousId = `P${index + 1}`;
      answerIdMap.set(anonymousId, answer.playerId);
      return { id: anonymousId, answer: String(answer.answer || '').slice(0, 80) };
    });
    const prompt = createPrompt(String(question).slice(0, 500), anonymousAnswers);
    const result = await this.runWithProviderFallback(async (provider) => {
        const raw = await provider.run(prompt);
        return parseJudgment(raw, answerIdMap);
    }, 'AI_JUDGING_UNAVAILABLE');
    return { ...result.value, provider: result.provider };
  }

  async generatePredictBotAnswer({ question, role }) {
    if (!question || !['escape', 'hunt'].includes(role)) {
      throw new Error('AI_BOT_MISSING_INPUT');
    }
    const roleInstruction = role === 'escape'
      ? 'أنت هارب. اختر إجابة بشرية عادية وصحيحة يعرفها معظم الناس، لكنها ليست أول إجابة تخطر على البال. لا تستخدم مصطلحات أكاديمية أو تخصصات نادرة لمجرد الهروب.'
      : 'أنت صياد. لا تجاوب كأنك في امتحان؛ تنبأ بما سيكتبه شخص عادي بسرعة خلال ثوانٍ. اختر أول إجابة شعبية وتلقائية تخطر على بال أغلب اللاعبين، وليس الإجابة الأدق علميًا أو الأكثر تخصصًا.';
    const prompt = [
      'أنت لاعب في لعبة عربية اسمها توقع ووقع.',
      roleInstruction,
      'فكر كلاعب عربي في لعبة جماعية خفيفة، واستخدم كلمات يومية قصيرة ومألوفة.',
      'مثال: سؤال "مادة الطلاب بيشتكوا منها" للصياد تكون الإجابة "رياضيات" أو "فيزياء"، وليست "الفيزياء الكمية".',
      'مثال: سؤال "حاجة بنعملها أول ما نصحى" تكون "نغسل وشنا" أو "نبص في الموبايل"، وليست إجابة رسمية أو أدبية.',
      'لا تختر فرعًا متخصصًا إذا كان السؤال يطلب شيئًا عامًا.',
      'لا تشرح ولا تكتب أكثر من إجابة. الإجابة لا تزيد عن 40 حرفًا.',
      'أرجع JSON فقط بالشكل: {"answer":"الإجابة"}.',
      `السؤال: ${String(question).slice(0, 500)}`,
    ].join('\n');
    const result = await this.runWithProviderFallback(async (provider) => {
        const raw = await provider.run(prompt, BOT_ANSWER_SCHEMA);
        const parsed = parseJsonPayload(raw);
        const answer = String(parsed?.answer || '').trim().slice(0, 40);
        if (!answer) throw new Error('AI_BOT_EMPTY_ANSWER');
        return answer;
    }, 'AI_BOT_UNAVAILABLE');
    return { answer: result.value, provider: result.provider };
  }

  async judgeDontSayMyWordAnswer({ question, forbiddenWord, acceptedAnswers = [], answer }) {
    if (!question || !forbiddenWord || !answer) {
      throw new Error('AI_SOLO_JUDGMENT_MISSING_INPUT');
    }
    const prompt = createSoloAnswerPrompt({ question, forbiddenWord, acceptedAnswers, answer });
    const result = await this.runWithProviderFallback(async (provider) => {
      const raw = await provider.run(prompt, SOLO_ANSWER_SCHEMA);
      return parseSoloAnswerJudgment(raw);
    }, 'AI_SOLO_JUDGING_UNAVAILABLE');
    return { ...result.value, provider: result.provider };
  }

  async playTenByTenTurn({ secretWord, category, difficulty, playerQuestion, aiHistory = [] }) {
    if (!secretWord || !playerQuestion) throw new Error('AI_TEN_BY_TEN_MISSING_INPUT');
    const history = aiHistory.slice(-12).map((item) => ({
      move: String(item.text || '').slice(0, 100),
      type: item.type === 'guess' ? 'guess' : 'question',
      answer: ['yes', 'no', 'unknown', 'correct', 'wrong'].includes(item.answer) ? item.answer : 'unknown',
    }));
    const difficultyRule = difficulty === 'easy'
      ? 'اسأل سؤالًا عامًا وبسيطًا، ولا تخمّن مبكرًا.'
      : difficulty === 'hard'
        ? 'اختر سؤالًا يقسم الاحتمالات بقوة، وخمّن عندما تكون لديك قرائن كافية.'
        : 'العب بذكاء طبيعي، ووازن بين السؤال والتخمين.';
    const prompt = [
      'أنت تدير دورًا واحدًا من لعبة عربية اسمها 10×10 بين لاعب وذكاء اصطناعي.',
      `كلمتك السرية التي يسأل عنها اللاعب: ${String(secretWord).slice(0, 80)}`,
      `الفئة: ${String(category).slice(0, 40)}`,
      `سؤال اللاعب عن كلمتك: ${String(playerQuestion).slice(0, 160)}`,
      'أجب عن سؤال اللاعب بقيمة واحدة فقط داخل playerAnswer: yes أو no أو unknown. كن دقيقًا ولا تكشف الكلمة.',
      'ثم اختر حركتك القادمة لتكتشف كلمة اللاعب التي لا تعرفها: question لسؤال نعم/لا، أو guess لتخمين كلمة واحدة.',
      difficultyRule,
      'اعتمد فقط على سجل إجابات اللاعب. لا تدّعِ أنك تعرف كلمته، ولا تكرر سؤالًا سابقًا أو تخمينًا سابقًا.',
      `السجل: ${JSON.stringify(history)}`,
      'أرجع JSON فقط بالشكل المطلوب.',
    ].join('\n');
    const result = await this.runWithProviderFallback(async (provider) => {
      const raw = await provider.run(prompt, TEN_BY_TEN_SCHEMA);
      return parseTenByTenTurn(raw);
    }, 'AI_TEN_BY_TEN_UNAVAILABLE');
    return { ...result.value, provider: result.provider };
  }

  async answerTenByTenQuestion({ secretWord, secretCategory = 'mixed', question, history = [] }) {
    if (!secretWord || !question) throw new Error('AI_TEN_BY_TEN_ANSWER_MISSING_INPUT');
    const recentHistory = history.slice(-80).map((item) => ({
      question: String(item.text || '').slice(0, 160),
      answer: ['yes', 'no', 'unknown'].includes(item.answer) ? item.answer : 'unknown',
    }));
    const prompt = [
      'CRITICAL SEMANTIC RULE: evaluate the complete meaning of the player utterance as one predicate about the secret. Never answer yes because one broad word overlaps while the remaining description is false.',
      'Treat short Arabic descriptions as implied property questions. Identify the exact property expressed by the complete phrase, then decide whether the secret itself satisfies it.',
      'A direct association, use, containment, nearby object, or shared topic is not enough. The secret itself must truthfully satisfy the complete property. Preserve consistency with every earlier answer.',
      'For location questions, judge the characteristic or usual home of the secret, not whether it could temporarily be carried there. Food from a restaurant is not a household object merely because somebody may eat it at home.',
      'Use mutually exclusive party-game categories, not scientific technicalities: food/drink is not classified as an inanimate object; a country/place is not an object; an activity is not an object. Choose the category an ordinary player intends.',
      'For a compound description, yes is allowed only when every essential condition in the description is normally true of the secret. If any essential condition is false, answer no.',
      'Before deciding, rewrite the player utterance internally as one intrinsic, stable, discriminating claim about what the secret IS, normally DOES, or naturally/typically BELONGS. Put that interpretation in canonicalClaim.',
      'Reject accidental possibility: something being capable of entering a location, being used there once, or coexisting with something does not make that location/property characteristic of it.',
      'Purpose descriptions modify the type itself: a "place for X" means a place specifically intended or primarily known for X, not any large region where X can happen.',
      'Set reason to one short factual sentence that tests the canonicalClaim against the secret. Then choose yes only if that factual sentence supports the whole claim.',
      'reply is the only text shown to the player. If the question is clear, reply must be only "نعم" or "لا". If it is genuinely ambiguous, reply may be one very short Egyptian-Arabic clarification of the interpretation, starting with نعم or لا.',
      'When the wording combines a category with a location, purpose, use, or another property, reply must briefly confirm the chosen interpretation using "لو قصدك..." even if you can still decide yes or no.',
      'The clarification must only rephrase the player intent. Never reveal the secret, its category, a new clue, the hidden factual reason, or more than 12 Arabic words.',
      'أنت صاحب كلمة سرية في لعبة أسئلة نعم أو لا عربية.',
      `الكلمة السرية: ${String(secretWord).slice(0, 80)}`,
      `تصنيف الكلمة الحقيقي: ${String(secretCategory).slice(0, 40)}`,
      `سؤال اللاعب: ${String(question).slice(0, 160)}`,
      'أجب بـ yes أو no بشكل قاطع وحاسم لجميع الأسئلة العادية.',
      'ممنوع منعاً باتاً الإجابة بـ unknown لأي سؤال مفهوم المعنى (مثل: هل هي في البيت؟ هل تؤكل؟ هل هي جماد؟ هل هي كائن حي؟). الإجابة يجب أن تكون حتماً yes أو no بناءً على حقيقة الكلمة السرية.',
      'يُمنع استخدام unknown إلا في حالة واحدة فقط: إذا كان سؤال اللاعب كلاماً فارغاً غير مفهوم إطلاقاً أو طلاسم لا صلة لها بأي سؤال.',
      'حافظ على الاتساق مع إجاباتك السابقة ولا تناقض حقيقة واضحة أو تصنيف الكلمة.',
      'تنبيهات هامة جداً:',
      '1. استخدم تصنيفات اللعبة الشعبية المنفصلة: الأكل ليس جمادًا، والبلد ليست جمادًا، والنشاط ليس جمادًا. الجماد هنا يعني شيئًا أو أداة مادية فقط.',
      '2. correctGuess=true فقط إذا كان سؤال اللاعب تخميناً مباشراً للكلمة السرية نفسها (مثل "هل هي موبايل؟").',
      '3. يجب أن تتسامح تماماً مع الفروق الطفيفة عند التخمين، مثل إضافة أو حذف "ال" التعريفية (مثلاً "كرة قدم" هي نفسها "كرة القدم") أو اختلاف التاء المربوطة والمفتوحة أو الهمزات. احكم بالمعنى الدقيق للكلمة.',
      `الإجابات السابقة: ${JSON.stringify(recentHistory)}`,
      'أرجع JSON فقط بالشكل: {"answer":"yes","correctGuess":false,"intent":"question","guess":"","canonicalClaim":"الصفة الثابتة المقصودة","reason":"سبب واقعي قصير","reply":"نعم"}.',
    ].join('\n');
    const result = await this.runWithProviderFallback(async (provider) => {
      const raw = await provider.run(prompt, TEN_BY_TEN_ANSWER_SCHEMA);
      return parseTenByTenAnswer(raw);
    }, 'AI_TEN_BY_TEN_ANSWER_UNAVAILABLE');
    return { ...result.value, provider: result.provider };
  }

  async generateTenByTenMove({ category, difficulty, aiHistory = [], attempt = 1, limit = 10, strategy = 'balanced_split' }) {
    const history = aiHistory.slice(-80).map((item) => ({
      move: String(item.text || '').slice(0, 100),
      type: item.type === 'guess' ? 'guess' : 'question',
      answer: ['yes', 'no', 'unknown', 'correct', 'wrong'].includes(item.answer) ? item.answer : 'unknown',
      dimension: String(item.dimension || '').slice(0, 60),
    }));
    const difficultyRule = difficulty === 'easy'
      ? 'اسأل أسئلة عامة وبسيطة ولا تخمّن قبل وجود قرائن قوية.'
      : difficulty === 'hard'
        ? 'اختر السؤال الذي يقسم الاحتمالات بقوة، وخمّن فور وجود قرائن كافية.'
        : 'العب بذكاء طبيعي ووازن بين السؤال والتخمين.';
    const strategyRule = {
      living_first: 'في بداية الجولة اختبر هل هي كائن حي، ثم لا تكرر هذا المدخل.',
      place_first: 'في بداية الجولة اختبر هل هي مكان أو بلد، ثم انتقل حسب الإجابة.',
      edible_first: 'في بداية الجولة اختبر هل تؤكل أو تشرب، ثم انتقل حسب الإجابة.',
      tangible_first: 'في بداية الجولة اختبر هل يمكن لمسها كشيء مادي، ثم ضيّق النوع.',
      human_made_first: 'في بداية الجولة اختبر هل صنعها الإنسان، ثم ضيّق الاستخدام أو النوع.',
      home_use_first: 'في بداية الجولة اختبر هل مكانها أو استخدامها المعتاد داخل البيت، ثم ضيّق النوع.',
      activity_first: 'في بداية الجولة اختبر هل هي نشاط يفعله الناس، ثم انتقل حسب الإجابة.',
      balanced_split: 'ابدأ بالسؤال الذي يقسم الاحتمالات المتوقعة لأقرب نصفين، من غير ترتيب ثابت.',
    }[strategy] || 'ابدأ بالسؤال الذي يقسم الاحتمالات المتوقعة لأقرب نصفين، من غير ترتيب ثابت.';
    const prompt = [
      'Play optimal 20 Questions, but never follow the same memorized script in every game. Silently maintain concrete candidates compatible with the full history.',
      `This round has a varied opening strategy: ${strategyRule}`,
      'The opening strategy changes only the first angle. After the answer, choose the highest-information unresolved property and follow the evidence.',
      'Possible branches include living beings, places, food/drink, physical objects, activities, and concepts, but their order must not be fixed across games.',
      'Every new question must split the remaining realistic candidates substantially. Use short, normal Arabic such as "هل ده حيوان؟" or "هل دي بلد؟". Never ask academic, vague, metaphorical, or merely associative questions.',
      'A no answer permanently closes that property and its narrower branches. A yes answer locks that property and moves one level deeper. Never revisit either with a synonym.',
      'A property and its negation are the same information dimension. After asking whether something is built, asking whether it is not built is forbidden; infer the opposite from the existing answer.',
      'Return dimension as a short stable semantic key for the information axis being tested, such as top_category, place_kind, country_continent, object_location, or direct_guess. Never reuse any dimension already present in history.',
      'When the history supports one likely answer, guess it immediately. When two candidates remain, ask only the property that separates them, then guess. Optimize for the fewest questions.',
      'أنت لاعب عبقري ومحترف في لعبة "عشرين سؤال" (20 Questions). هدفك اكتشاف الكلمة السرية بأقل عدد من الأسئلة.',
      `الفئة العامّة: ${String(category).slice(0, 40)}. رقم المحاولة الحالية: ${attempt}.`,
      difficultyRule,
      'لا تستخدم قائمة أسئلة محفوظة. لا تكرر فكرة سابقة، وأغلق أي اتجاه إجابته لا، وتعمق فقط في المعلومات المؤكدة.',
      'إذا تكوّن مرشح قوي من السجل فخمنه فورًا، حتى لو كان عدد الأسئلة قليلًا.',
      'صغ سؤالاً واحداً فقط تكون إجابته بـ (نعم/لا). إذا كان تخميناً مباشرًا لكلمة بعينها ضع isGuess=true وإلا false.',
      `سجل الأسئلة والإجابات السابقة: ${JSON.stringify(history)}`,
      'أرجع JSON فقط بالشكل المطلوب.',
    ].join('\n');
    const result = await this.runWithProviderFallback(async (provider) => {
      const raw = await provider.run(prompt, TEN_BY_TEN_MOVE_SCHEMA);
      const move = parseTenByTenMove(raw);
      if (isRedundantTenByTenMove(move, aiHistory)) throw new Error('AI_TEN_BY_TEN_REDUNDANT_MOVE');
      return move;
    }, 'AI_TEN_BY_TEN_MOVE_UNAVAILABLE');
    return { move: result.value, provider: result.provider };
  }

  async probe() {
    if (this.healthProbePromise) return this.healthProbePromise;
    this.healthProbePromise = this.judgePredictRound({
      question: 'اذكر لون السماء في يوم صافٍ.',
      answers: [{ playerId: 'health-check', answer: 'أزرق' }],
    }).then(() => true).catch(() => false).finally(() => {
      this.healthProbePromise = null;
    });
    return this.healthProbePromise;
  }

  async getStatus({ probe = false, forceProbe = false } = {}) {
    const configured = this.providers.filter((provider) => provider.configured);
    if (configured.length === 0) {
      return { available: false, reason: 'NOT_CONFIGURED', providers: [] };
    }
    const newestCheck = Math.max(0, ...configured.map((provider) => provider.lastCheckedAt));
    if (forceProbe || (probe && Date.now() - newestCheck > HEALTH_CACHE_MS)) await this.probe();
    const available = this.availableProviders();
    const now = Date.now();

    let totalRequestsToday = 0;
    let providerDailyLimit = 0;
    let totalSuccessfulToday = 0;
    let totalFailedToday = 0;

    const mappedProviders = configured.map((provider) => {
      this.checkDailyReset(provider);
      const requestsToday = provider.requestsToday || 0;
      const successfulToday = provider.successfulToday || 0;
      const failedToday = provider.failedToday || 0;
      const dailyLimit = provider.dailyLimit || 1500;
      const remainingToday = Math.max(0, dailyLimit - requestsToday);
      const usagePercent = Math.min(100, Math.round((requestsToday / dailyLimit) * 100));

      totalRequestsToday += requestsToday;
      providerDailyLimit += dailyLimit;
      totalSuccessfulToday += successfulToday;
      totalFailedToday += failedToday;

      return {
        id: provider.id,
        available: provider.disabledUntil <= now,
        retryAt: provider.disabledUntil || null,
        lastLatencyMs: provider.lastLatencyMs,
        lastCheckedAt: provider.lastCheckedAt || null,
        lastError: provider.lastError,
        requestsToday,
        successfulToday,
        failedToday,
        dailyLimit,
        remainingToday,
        usagePercent,
      };
    });

    const totalRemainingToday = Math.max(0, this.dailyRequestLimit - totalRequestsToday);
    const overallUsagePercent = Math.min(100, Math.round((totalRequestsToday / this.dailyRequestLimit) * 100));

    return {
      available: available.length > 0,
      reason: available.length > 0 ? null : 'PROVIDERS_UNAVAILABLE',
      totalRequestsToday,
      totalDailyLimit: this.dailyRequestLimit,
      totalRemainingToday,
      totalSuccessfulToday,
      totalFailedToday,
      overallUsagePercent,
      providerDailyLimit,
      providers: mappedProviders,
    };
  }
}

const aiJudge = new AiJudge();

module.exports = {
  AiJudge,
  aiJudge,
  parseJudgment,
  parseSoloAnswerJudgment,
  parseTenByTenTurn,
  parseTenByTenAnswer,
  parseTenByTenMove,
  isRedundantTenByTenMove,
  JUDGMENT_SCHEMA,
  BOT_ANSWER_SCHEMA,
  SOLO_ANSWER_SCHEMA,
  TEN_BY_TEN_SCHEMA,
  TEN_BY_TEN_ANSWER_SCHEMA,
  TEN_BY_TEN_MOVE_SCHEMA,
};
