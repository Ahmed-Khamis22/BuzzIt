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
    || String(error?.message || '').startsWith('AI_SOLO_');
}

function isRetryableProviderError(error) {
  if (isStructuredOutputError(error)) return true;
  const status = Number(error?.response?.status || 0);
  if ([408, 409, 425].includes(status) || status >= 500) return true;
  return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error?.code);
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
  return 700;
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

class AiJudge {
  constructor({ env = process.env, http = axios } = {}) {
    this.env = env;
    this.http = http;
    // Provider order and paid-emergency procedure:
    // docs/AI_FALLBACK_RUNBOOK.md
    this.providers = [
      {
        id: 'google',
        configured: Boolean(env.GEMINI_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        run: (prompt, schema) => this.runGoogle(prompt, schema),
      },
      {
        id: 'groq',
        configured: Boolean(env.GROQ_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        run: (prompt, schema) => this.runGroq(prompt, schema),
      },
      {
        id: 'cerebras',
        configured: Boolean(env.CEREBRAS_API_KEY),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        run: (prompt, schema) => this.runCerebras(prompt, schema),
      },
      {
        id: 'cloudflare',
        configured: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN),
        failures: 0,
        disabledUntil: 0,
        lastCheckedAt: 0,
        run: (prompt, schema) => this.runCloudflare(prompt, schema),
      },
    ];
    this.healthProbePromise = null;
  }

  requestTimeout() {
    return Math.max(3000, Number(this.env.AI_REQUEST_TIMEOUT_MS) || 12000);
  }

  availableProviders() {
    const now = Date.now();
    return this.providers.filter((provider) => provider.configured && provider.disabledUntil <= now);
  }

  markSuccess(provider) {
    provider.failures = 0;
    provider.disabledUntil = 0;
    provider.lastCheckedAt = Date.now();
  }

  markFailure(provider, error) {
    provider.failures += 1;
    provider.lastCheckedAt = Date.now();
    const status = error?.response?.status;
    const hardFailure = [400, 401, 403, 404, 429].includes(status);
    const cooldown = status === 429
      ? 5 * 60 * 1000
      : hardFailure
        ? 15 * 60 * 1000
        : Math.min(2 * 60 * 1000, provider.failures * 60 * 1000);
    provider.disabledUntil = Date.now() + cooldown;
  }

  recordProviderFailure(provider, error) {
    if (isStructuredOutputError(error)) {
      provider.lastCheckedAt = Date.now();
      return;
    }
    this.markFailure(provider, error);
  }

  async runWithProviderFallback(operation, unavailableCode) {
    const providers = this.availableProviders();
    const retryProviders = [];
    const causes = [];

    for (const provider of providers) {
      try {
        const value = await operation(provider);
        this.markSuccess(provider);
        return { value, provider: provider.id };
      } catch (error) {
        causes.push(describeProviderError(provider, error, 1));
        this.recordProviderFailure(provider, error);
        if (isRetryableProviderError(error)) retryProviders.push(provider);
      }
    }

    for (const provider of retryProviders) {
      try {
        const value = await operation(provider);
        this.markSuccess(provider);
        return { value, provider: provider.id };
      } catch (error) {
        causes.push(describeProviderError(provider, error, 2));
        this.recordProviderFailure(provider, error);
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
      messages: [{ role: 'user', content: prompt }],
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
      messages: [{ role: 'user', content: prompt }],
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

  async getStatus({ probe = false } = {}) {
    const configured = this.providers.filter((provider) => provider.configured);
    if (configured.length === 0) {
      return { available: false, reason: 'NOT_CONFIGURED', providers: [] };
    }
    const newestCheck = Math.max(0, ...configured.map((provider) => provider.lastCheckedAt));
    if (probe && Date.now() - newestCheck > HEALTH_CACHE_MS) await this.probe();
    const available = this.availableProviders();
    return {
      available: available.length > 0,
      reason: available.length > 0 ? null : 'PROVIDERS_UNAVAILABLE',
      providers: configured.map((provider) => ({
        id: provider.id,
        available: provider.disabledUntil <= Date.now(),
        retryAt: provider.disabledUntil || null,
      })),
    };
  }
}

const aiJudge = new AiJudge();

module.exports = {
  AiJudge,
  aiJudge,
  parseJudgment,
  parseSoloAnswerJudgment,
  JUDGMENT_SCHEMA,
  BOT_ANSWER_SCHEMA,
  SOLO_ANSWER_SCHEMA,
};
