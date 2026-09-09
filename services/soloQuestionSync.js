const Question = require('../models/Question');

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

async function syncSoloGameQuestions() {
  const operations = [...BROAD_SOLO_QUESTIONS, ...NARROW_SOLO_QUESTIONS].map((question) => ({
    updateOne: {
      filter: { category: 'dont-say-my-word', text: question.text },
      update: {
        $set: { judgeMode: 'closed' },
        $setOnInsert: {
          ...question,
          category: 'dont-say-my-word',
          difficulty: question.acceptedAnswers.length <= 4 ? 'hard' : 'easy',
        },
      },
      upsert: true,
    },
  }));
  const result = await Question.bulkWrite(operations, { ordered: false });
  console.log(`Solo-game difficulty questions synced (${result.upsertedCount} added).`);
}

module.exports = syncSoloGameQuestions;
