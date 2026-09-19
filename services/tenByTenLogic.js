const crypto = require('crypto');

const SESSION_TTL_MS = 90 * 60 * 1000;
const AI_QUESTION_STRATEGIES = [
  'living_first',
  'place_first',
  'edible_first',
  'tangible_first',
  'human_made_first',
  'home_use_first',
  'activity_first',
  'balanced_split',
];

const WORD_BANK = {
  people: [
    'محمد صلاح', 'عادل إمام', 'أحمد زويل', 'أم كلثوم', 'ليونيل ميسي', 'كريستيانو رونالدو',
    'محمد رمضان', 'أحمد حلمي', 'منى زكي', 'ياسمين عبد العزيز', 'تامر حسني', 'عمرو دياب',
    'نجيب محفوظ', 'مجدي يعقوب', 'عمر الشريف', 'سمير غانم', 'دنيا سمير غانم', 'محمد هنيدي',
    'كريم عبد العزيز', 'أحمد السقا', 'محمد منير', 'فيروز', 'شيرين عبد الوهاب', 'أحمد مكي',
    'محمد أبو تريكة', 'مستر بين', 'جاكي شان', 'محمد علي كلاي', 'مارادونا', 'بيليه',
  ],
  animals: [
    'أسد', 'فيل', 'زرافة', 'دولفين', 'بطريق', 'قطة', 'حصان', 'نسر', 'كلب', 'أرنب',
    'قرد', 'نمر', 'ذئب', 'ثعلب', 'دب', 'جمل', 'بقرة', 'خروف', 'ماعز', 'دجاجة',
    'بطة', 'سمكة', 'قرش', 'حوت', 'تمساح', 'ثعبان', 'سلحفاة', 'ضفدع', 'نحلة', 'فراشة',
    'نملة', 'عنكبوت', 'فأر', 'حمار', 'حمار وحشي',
  ],
  plants: [
    'وردة', 'نخلة', 'صبار', 'عباد الشمس', 'نعناع', 'ريحان', 'بقدونس', 'كزبرة', 'قمح', 'ذرة',
    'شجرة التفاح', 'شجرة البرتقال', 'شجرة العنب', 'شجرة الزيتون', 'شجرة الموز', 'قطن', 'أرز',
    'شجرة المانجو', 'فراولة', 'نبات البطيخ',
  ],
  countries: [
    'مصر', 'السعودية', 'المغرب', 'فرنسا', 'اليابان', 'البرازيل', 'إيطاليا', 'الهند',
    'أمريكا', 'إنجلترا', 'الصين', 'ألمانيا', 'إسبانيا', 'تركيا', 'الإمارات', 'قطر',
    'الكويت', 'الجزائر', 'تونس', 'ليبيا', 'السودان', 'الأردن', 'لبنان', 'سوريا',
    'العراق', 'فلسطين', 'جنوب أفريقيا', 'روسيا', 'كندا', 'أستراليا',
  ],
  food: [
    'بيتزا', 'كشري', 'برجر', 'ملوخية', 'شاورما', 'مكرونة', 'آيس كريم', 'فلافل', 'فول', 'طعمية',
    'كبسة', 'مندي', 'محشي', 'فتة', 'كفتة', 'كباب', 'حواوشي', 'بطاطس مقلية', 'أرز باللبن',
    'عيش', 'جبنة', 'بيض', 'شوربة', 'سلطة', 'بسبوسة', 'كنافة', 'كيكة', 'شوكولاتة',
    'تفاح', 'موز', 'برتقال', 'مانجو', 'بطيخ', 'سمك مشوي', 'فراخ مشوية',
  ],
  things: [
    'موبايل', 'ساعة', 'سيارة', 'مفتاح', 'مظلة', 'كتاب', 'ثلاجة', 'كاميرا', 'ترابيزة', 'كرسي',
    'سرير', 'باب', 'شباك', 'تلفزيون', 'كمبيوتر', 'مروحة', 'تكييف', 'غسالة', 'بوتاجاز', 'ملعقة',
    'شوكة', 'سكينة', 'طبق', 'كوباية', 'قلم', 'قلم رصاص', 'شنطة مدرسة', 'كرة', 'حذاء', 'قميص',
    'نظارة', 'سماعة', 'لمبة', 'مرآة', 'فرشاة أسنان', 'صابونة', 'محفظة', 'زجاجة', 'دراجة', 'طائرة',
  ],
  entertainment: [
    'كرة القدم', 'السينما', 'الشطرنج', 'الرسم', 'الغناء', 'ألعاب الفيديو', 'المسرح', 'السباحة',
    'القراءة', 'الرقص',
  ],
};

const CATEGORY_LABELS = {
  people: 'شخصيات مشهورة', animals: 'حيوانات', plants: 'نباتات', countries: 'بلاد', food: 'أكل',
  entertainment: 'ترفيه', things: 'أشياء', mixed: 'أي حاجة',
};

const FALLBACK_QUESTIONS = [
  'هل هو كائن حي؟',
  'هل يمكن رؤيته أو لمسه؟',
  'هل يرتبط بالطعام؟',
  'هل يوجد عادة داخل المنزل؟',
  'هل هو معروف في معظم دول العالم؟',
  'هل يستخدمه الناس بشكل يومي؟',
  'هل حجمه أكبر من الإنسان غالبًا؟',
  'هل يبدأ اسمه بحرف من النصف الأول من الأبجدية؟',
];

function normalizeArabic(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function allWords(category) {
  if (WORD_BANK[category]) return WORD_BANK[category];
  return Object.values(WORD_BANK).flat();
}

function chooseSecret(category = 'mixed', excludedSecrets = []) {
  const words = allWords(category);
  const excludedValues = Array.isArray(excludedSecrets) ? excludedSecrets : [excludedSecrets];
  const excluded = new Set(excludedValues.map(normalizeArabic).filter(Boolean));
  const choices = words.filter((word) => !excluded.has(normalizeArabic(word)));
  return (choices.length ? choices : words)[crypto.randomInt(choices.length || words.length)];
}

function guessesMatch(guess, secret) {
  return normalizeArabic(guess) === normalizeArabic(secret);
}

function categoryForSecret(secret) {
  const normalizedSecret = normalizeArabic(secret);
  return Object.entries(WORD_BANK).find(([, words]) => (
    words.some((word) => normalizeArabic(word) === normalizedSecret)
  ))?.[0] || null;
}

function containsAny(text, values) {
  return values.some((value) => text.includes(value));
}

function extractDirectGuess(question) {
  const normalized = normalizeArabic(question);
  const explicitPatterns = [
    /^(?:هل )?(?:كلمتك|الكلمه|الاجابه) (?:هي|هو) (.+)$/,
    /^(?:هل )?(?:تقصد|قصدك) (.+)$/,
    /^(?:تخميني|اتوقع|اظن انها|اظن انه) (.+)$/,
  ];
  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  const shortGuess = normalized.match(/^(?:هل )?(?:هي|هو) (.+)$/)?.[1]?.trim();
  if (shortGuess && allWords('mixed').some((word) => normalizeArabic(word) === shortGuess)) return shortGuess;

  if (allWords('mixed').some((word) => normalizeArabic(word) === normalized)) return normalized;

  return null;
}

// High-confidence facts are resolved locally before asking an AI provider.
// Returning null means the question is open or ambiguous and still needs AI.
function answerKnownQuestion({ secretWord, question }) {
  const normalizedQuestion = normalizeArabic(question);
  const normalizedSecret = normalizeArabic(secretWord);
  if (!normalizedQuestion || !normalizedSecret) return null;

  const directGuess = extractDirectGuess(normalizedQuestion);
  if (directGuess) {
    const correctGuess = guessesMatch(directGuess, normalizedSecret);
    return { answer: correctGuess ? 'yes' : 'no', correctGuess, source: 'local_direct_guess' };
  }

  const category = categoryForSecret(normalizedSecret);
  if (!category) return null;

  const compactQuestion = normalizedQuestion
    .replace(/^(?:هل )?(?:دي|ده|هي|هو|الكلمه|كلمتك)\s*/, '')
    .trim();

  // Local answers are intentionally restricted to complete, unambiguous
  // category questions. Compound descriptions must be judged semantically as
  // a whole; matching one word inside a longer sentence caused false positives.
  const exactCategoryQuestions = [
    { aliases: ['بلد', 'دوله'], category: 'countries' },
    { aliases: ['حيوان'], category: 'animals' },
    { aliases: ['نبات', 'شجره'], category: 'plants' },
    { aliases: ['شخص', 'انسان', 'شخصيه', 'بني ادم'], category: 'people' },
    { aliases: ['اكل', 'اكله', 'طعام', 'وجبه'], category: 'food' },
    { aliases: ['شي', 'شيء', 'جهاز', 'اداه', 'جماد'], category: 'things' },
  ];
  const exactCategoryQuestion = exactCategoryQuestions.find(({ aliases }) => aliases.includes(compactQuestion));
  if (exactCategoryQuestion) {
    return {
      answer: category === exactCategoryQuestion.category ? 'yes' : 'no',
      correctGuess: false,
      source: 'local_fact',
    };
  }

  if (['كائن حي', 'عايش', 'حي'].includes(compactQuestion)) {
    return {
      answer: ['people', 'animals', 'plants'].includes(category) ? 'yes' : 'no',
      correctGuess: false,
      source: 'local_fact',
    };
  }

  const asksAboutMobilePlay = containsAny(normalizedQuestion, ['موبايل', 'تليفون', 'هاتف'])
    && containsAny(normalizedQuestion, ['لعب', 'بتتلعب', 'نلعب', 'العب']);
  if (asksAboutMobilePlay) {
    const playableOnMobile = new Set(['الشطرنج', 'العاب الفيديو']);
    return {
      answer: playableOnMobile.has(normalizedSecret) ? 'yes' : 'no',
      correctGuess: false,
      source: 'local_fact',
    };
  }

  if (['لعبه', 'لعبه فيديو', 'جيم'].includes(compactQuestion)) {
    const games = new Set(['كره القدم', 'الشطرنج', 'العاب الفيديو']);
    return { answer: games.has(normalizedSecret) ? 'yes' : 'no', correctGuess: false, source: 'local_fact' };
  }

  return null;
}

function resolveInterpretedAnswer({ secretWord, judgment }) {
  if (judgment?.intent === 'guess') {
    const correctGuess = guessesMatch(judgment.guess, secretWord);
    return { answer: correctGuess ? 'yes' : 'no', correctGuess };
  }
  return {
    answer: ['yes', 'no', 'unknown'].includes(judgment?.answer) ? judgment.answer : 'unknown',
    correctGuess: false,
  };
}

function createInitialAiMove(category) {
  const categoryQuestion = {
    people: 'هل الشخصية التي تفكر فيها رجل؟',
    animals: 'هل يعيش الحيوان غالبًا على اليابسة؟',
    plants: 'هل هذا النبات شجرة؟',
    countries: 'هل تقع الدولة في قارة آسيا؟',
    food: 'هل تؤكل هذه الأكلة ساخنة غالبًا؟',
    entertainment: 'هل يحتاج هذا النشاط إلى أكثر من شخص؟',
    things: 'هل تستخدم هذا الشيء داخل المنزل عادة؟',
  };
  return { type: 'question', isGuess: false, text: categoryQuestion[category] || 'هل الشيء الذي تفكر فيه كائن حي؟' };
}

function createSession({ userId, category, difficulty, excludedSecrets = [], maxActions = 120 }) {
  const safeCategory = WORD_BANK[category] ? category : category === 'mixed' ? 'mixed' : 'mixed';
  const safeDifficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
  const aiSecret = chooseSecret(safeCategory, excludedSecrets);
  const aiQuestionStrategy = AI_QUESTION_STRATEGIES[crypto.randomInt(AI_QUESTION_STRATEGIES.length)];
  const safeMaxActions = Math.max(80, Math.min(200, Number(maxActions) || 120));
  return {
    id: crypto.randomBytes(18).toString('hex'),
    userId: String(userId),
    category: safeCategory,
    difficulty: safeDifficulty,
    aiSecret,
    aiQuestionStrategy,
    playerActions: 0,
    aiActions: 0,
    maxActions: safeMaxActions,
    playerSolvedAt: null,
    aiSolvedAt: null,
    status: 'playing',
    phase: 'player',
    winner: null,
    playerHistory: [],
    aiHistory: [],
    pendingAiMove: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

function nextFallbackMove(session) {
  const used = new Set(session.aiHistory.map((item) => normalizeArabic(item.text)));
  const nextQuestion = FALLBACK_QUESTIONS.find((question) => !used.has(normalizeArabic(question)));
  if (nextQuestion) return { type: 'question', isGuess: false, text: nextQuestion };
  const candidates = allWords(session.category).filter((word) => word !== session.aiSecret);
  const guess = candidates[session.aiActions % candidates.length] || 'موبايل';
  return { type: 'question', isGuess: true, text: `هل كلمتك هي ${guess}؟` };
}

function finishSession(session) {
  if (session.playerSolvedAt && session.aiSolvedAt) {
    if (session.playerSolvedAt < session.aiSolvedAt) session.winner = 'player';
    else if (session.aiSolvedAt < session.playerSolvedAt) session.winner = 'ai';
    else session.winner = 'tie';
    session.status = 'finished';
  } else if (session.playerSolvedAt) {
    session.winner = 'player'; session.status = 'finished';
  } else if (session.aiSolvedAt) {
    session.winner = 'ai'; session.status = 'finished';
  } else {
    session.winner = 'tie'; session.status = 'finished';
  }
  session.phase = 'result';
  return session;
}

function publicSession(session, extra = {}) {
  return {
    sessionId: session.id,
    category: session.category,
    categoryLabel: CATEGORY_LABELS[session.category],
    difficulty: session.difficulty,
    playerActions: session.playerActions,
    aiActions: session.aiActions,
    maxActions: session.maxActions,
    playerSolvedAt: session.playerSolvedAt,
    aiSolvedAt: session.aiSolvedAt,
    status: session.status,
    phase: session.phase,
    winner: session.winner,
    surrendered: Boolean(session.surrendered),
    aiMove: session.pendingAiMove ? {
      type: session.pendingAiMove.type,
      isGuess: Boolean(session.pendingAiMove.isGuess),
      text: session.pendingAiMove.text,
    } : null,
    ...(session.status === 'finished' ? { aiSecret: session.aiSecret } : {}),
    ...extra,
  };
}

module.exports = {
  CATEGORY_LABELS, SESSION_TTL_MS, WORD_BANK,
  answerKnownQuestion, categoryForSecret, chooseSecret, createInitialAiMove, createSession, extractDirectGuess,
  finishSession, guessesMatch, nextFallbackMove, normalizeArabic,
  publicSession, resolveInterpretedAnswer,
};
