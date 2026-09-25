const Question = require('../models/Question');
const { buildManagedQuestionBank } = require('./gameQuestionBank');
const GAME_QUESTION_BANK_VERSION = 5;

const BROAD_SOLO_QUESTIONS = [
  {
    text: 'اذكر اسم لون',
    answer: 'أحمر',
    acceptedAnswers: ['أزرق', 'أخضر', 'أصفر', 'أسود', 'أبيض', 'برتقالي', 'بنفسجي', 'وردي', 'بني', 'رمادي'],
  },
  {
    text: 'اذكر اسم فاكهة',
    answer: 'تفاح',
    acceptedAnswers: ['موز', 'برتقال', 'عنب', 'مانجو', 'فراولة', 'بطيخ', 'خوخ', 'رمان', 'تين', 'كمثرى', 'جوافة'],
  },
  {
    text: 'اذكر دولة عربية',
    answer: 'مصر',
    acceptedAnswers: ['السعودية', 'الإمارات', 'المغرب', 'تونس', 'الجزائر', 'سوريا', 'فلسطين', 'العراق', 'لبنان', 'الأردن', 'الكويت', 'قطر'],
  },
  {
    text: 'اذكر مهنة أو وظيفة',
    answer: 'طبيب',
    acceptedAnswers: ['مهندس', 'مدرس', 'محامي', 'محاسب', 'طيار', 'نجار', 'سباك', 'شرطي', 'صحفي', 'ممرض'],
  },
  {
    text: 'اذكر وسيلة مواصلات',
    answer: 'سيارة',
    acceptedAnswers: ['طائرة', 'قطار', 'مترو', 'أتوبيس', 'سفينة', 'دراجة', 'موتوسيكل', 'تاكسي', 'ترام'],
  },
  {
    text: 'اذكر حيوانًا مفترسًا',
    answer: 'أسد',
    acceptedAnswers: ['نمر', 'فهد', 'ذئب', 'دب', 'تمساح', 'ضبع', 'قرش', 'ثعلب'],
  },
  {
    text: 'اذكر كوكبًا في المجموعة الشمسية',
    answer: 'الأرض',
    acceptedAnswers: ['عطارد', 'الزهرة', 'المريخ', 'المشتري', 'زحل', 'أورانوس', 'نبتون'],
  },
  {
    text: 'اذكر شكلًا هندسيًا',
    answer: 'مربع',
    acceptedAnswers: ['دائرة', 'مستطيل', 'مثلث', 'معين', 'خماسي', 'سداسي'],
  },
  {
    text: 'اذكر مشروبًا ساخنًا',
    answer: 'شاي',
    acceptedAnswers: ['قهوة', 'نسكافيه', 'سحلب', 'كاكاو', 'يانسون', 'قرفة'],
  },
  {
    text: 'اذكر رياضة تُلعب بالكرة',
    answer: 'كرة القدم',
    acceptedAnswers: ['كرة السلة', 'كرة الطائرة', 'كرة اليد', 'التنس', 'تنس الطاولة'],
  },
];

const NARROW_SOLO_QUESTIONS = [
  {
    text: 'حالة من حالات المادة الأساسية',
    answer: 'صلبة',
    acceptedAnswers: ['سائلة', 'غازية'],
  },
  {
    text: 'لون في إشارة المرور',
    answer: 'أحمر',
    acceptedAnswers: ['أصفر', 'أخضر'],
  },
  {
    text: 'نوع مثلث حسب أطوال أضلاعه',
    answer: 'متساوي الأضلاع',
    acceptedAnswers: ['متساوي الساقين', 'مختلف الأضلاع'],
  },
  {
    text: 'وجبة أساسية في اليوم',
    answer: 'الفطار',
    acceptedAnswers: ['الغداء', 'العشاء'],
  },
  {
    text: 'علامة ترقيم تنهي الجملة',
    answer: 'النقطة',
    acceptedAnswers: ['علامة الاستفهام', 'علامة التعجب'],
  },
  {
    text: 'زاوية حسب قياسها',
    answer: 'حادة',
    acceptedAnswers: ['قائمة', 'منفرجة'],
  },
  {
    text: 'فصل من فصول السنة',
    answer: 'الصيف',
    acceptedAnswers: ['الشتاء', 'الربيع', 'الخريف'],
  },
  {
    text: 'حاسة من الحواس الخمس',
    answer: 'النظر',
    acceptedAnswers: ['السمع', 'الشم', 'التذوق', 'اللمس'],
  },
];

// These are open-ended prompts, not trivia questions. `answer` is still
// required by the shared Question model, while the Predict game judges the
// players' submitted answers separately.
const PREDICT_QUESTIONS = [
  'اذكر حاجة أغلب الناس بتعملها أول ما تصحى من النوم.',
  'اذكر أكلة مصرية مشهورة.',
  'اذكر حاجة بتلاقيها غالبًا في الشنطة.',
  'اذكر مادة دراسية الطلاب بيشتكوا منها كتير.',
  'اذكر مكان الناس بتحب تروحه في الإجازة.',
  'اذكر حاجة ممكن تنساها قبل ما تخرج من البيت.',
  'اذكر تطبيق ناس كتير بتفتحه كل يوم.',
  'اذكر مشروب الناس بتحبه في الصيف.',
  'اذكر حاجة بتعمل دوشة في البيت.',
  'اذكر حاجة ممكن تلاقيها على مكتب الطالب.',
  'اذكر سبب شائع يخلي الواحد يتأخر عن ميعاده.',
  'اذكر حاجة بتاخدها معاك لما تروح البحر.',
  'اذكر أكلة الناس بتحب تطلبها دليفري.',
  'اذكر حاجة الأطفال بتحب تلعب بيها.',
  'اذكر مكان ممكن تقابل فيه أصحابك.',
  'اذكر حاجة بتستخدمها لما النور يقطع.',
  'اذكر حاجة الناس بتعملها في الويك إند.',
  'اذكر حاجة بتشتريها من السوبر ماركت كل أسبوع.',
  'اذكر حاجة ممكن تضيع منك في البيت.',
  'اذكر رياضة ناس كتير بتحب تتفرج عليها.',
];

async function syncSoloGameQuestions() {
  const { soloQuestions, predictQuestions } = buildManagedQuestionBank();
  const questions = [...soloQuestions, ...predictQuestions];

  // This is a one-time migration for the game categories. It removes the old
  // low-variety bank the user asked to replace, while future starts preserve
  // records carrying this bank version and their stable bank keys.
  await Question.deleteMany({
    category: { $in: ['dont-say-my-word', 'predict-questions'] },
    bankVersion: { $ne: GAME_QUESTION_BANK_VERSION },
  });

  const operations = questions.map((question) => ({
    updateOne: {
      filter: { category: question.category, bankKey: question.bankKey },
      update: {
        $set: { ...question, bankVersion: GAME_QUESTION_BANK_VERSION },
      },
      upsert: true,
    },
  }));
  const result = await Question.bulkWrite(operations, { ordered: false });
  console.log(`Curated game bank synced (${questions.length} records; ${result.upsertedCount} added).`);
}

module.exports = syncSoloGameQuestions;
