const mongoose = require('mongoose');
require('dotenv').config();
const Question = require('./models/Question');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/buzzit';

const questions = [
  {
    text: "اسم ممثل مصري كوميدي",
    category: "predict-questions",
    answer: "أحمد حلمي",
    acceptedAnswers: ["عادل إمام", "محمد هنيدي", "محمد سعد", "أحمد مكي", "أحمد فهمي", "شيكو", "هشام ماجد", "سمير غانم"],
    difficulty: "easy"
  },
  {
    text: "اسم مدينة مصرية",
    category: "predict-questions",
    answer: "القاهرة",
    acceptedAnswers: ["الإسكندرية", "الجيزة", "الأقصر", "أسوان", "شرم الشيخ", "الغردقة", "بورسعيد", "المنصورة"],
    difficulty: "easy"
  },
  {
    text: "اسم لون",
    category: "predict-questions",
    answer: "أحمر",
    acceptedAnswers: ["أزرق", "أخضر", "أصفر", "أسود", "أبيض", "برتقالي", "بنفسجي", "بني", "رمادي"],
    difficulty: "easy"
  },
  {
    text: "شخصية كرتونية مشهورة",
    category: "predict-questions",
    answer: "سبونج بوب",
    acceptedAnswers: ["ميكي ماوس", "توم", "جيري", "باتمان", "سوبرمان", "سبايدرمان", "بيكاتشو", "بن تن"],
    difficulty: "easy"
  },
  {
    text: "اسم أكلة مصرية",
    category: "predict-questions",
    answer: "كشري",
    acceptedAnswers: ["فول", "طعمية", "ملوخية", "محشي", "مسقعة", "شاورما", "حواوشي", "كباب", "كفتة", "بامية"],
    difficulty: "easy"
  },
  {
    text: "اسم رياضة",
    category: "predict-questions",
    answer: "كرة القدم",
    acceptedAnswers: ["كرة السلة", "التنس", "السباحة", "الملاكمة", "المصارعة", "الجمباز", "الاسكواش", "كرة اليد", "الكرة الطائرة"],
    difficulty: "easy"
  },
  {
    text: "اسم فيلم مصري مشهور",
    category: "predict-questions",
    answer: "الإرهاب والكباب",
    acceptedAnswers: ["صعيدي في الجامعة الأمريكية", "الناظر", "اللمبي", "عسكر في المعسكر", "غبي منه فيه", "همام في أمستردام"],
    difficulty: "easy"
  },
  {
    text: "اسم مطرب عربي مشهور",
    category: "predict-questions",
    answer: "عمرو دياب",
    acceptedAnswers: ["تامر حسني", "محمد حماقي", "وائل جسار", "جورج وسوف", "نانسي عجرم", "إليسا", "شيرين", "حسين الجسمي"],
    difficulty: "easy"
  },
  {
    text: "اسم تطبيق على الموبايل",
    category: "predict-questions",
    answer: "واتساب",
    acceptedAnswers: ["فيسبوك", "انستجرام", "تويتر", "تيك توك", "سناب شات", "يوتيوب", "ماسنجر", "تليجرام"],
    difficulty: "easy"
  },
  {
    text: "اسم دولة عربية",
    category: "predict-questions",
    answer: "مصر",
    acceptedAnswers: ["السعودية", "الإمارات", "فلسطين", "الكويت", "قطر", "المغرب", "الجزائر", "تونس", "لبنان", "سوريا", "العراق"],
    difficulty: "easy"
  },
  {
    text: "اسم فاكهة",
    category: "predict-questions",
    answer: "تفاح",
    acceptedAnswers: ["موز", "برتقال", "مانجو", "بطيخ", "عنب", "فراولة", "تين", "خوخ", "مشمش"],
    difficulty: "easy"
  },
  {
    text: "اسم حيوان",
    category: "predict-questions",
    answer: "أسد",
    acceptedAnswers: ["نمر", "فيل", "زرافة", "قطة", "كلب", "قرد", "حصان", "غزال", "تمساح"],
    difficulty: "easy"
  },
  {
    text: "اسم وسيلة مواصلات",
    category: "predict-questions",
    answer: "عربية",
    acceptedAnswers: ["مترو", "ميكروباص", "أتوبيس", "تاكسي", "قطار", "توك توك", "طيارة", "سفينة", "عجلة", "موتوسيكل"],
    difficulty: "easy"
  },
  {
    text: "اسم مهنة أو وظيفة",
    category: "predict-questions",
    answer: "دكتور",
    acceptedAnswers: ["مهندس", "مدرس", "ظابط", "محامي", "محاسب", "نجار", "سباك", "كهربائي", "طيار", "صحفي"],
    difficulty: "easy"
  },
  {
    text: "حاجة بنلبسها",
    category: "predict-questions",
    answer: "تيشيرت",
    acceptedAnswers: ["بنطلون", "قميص", "جاكيت", "كوتشي", "شراب", "جزمة", "طاقية", "فستان", "جيبة"],
    difficulty: "easy"
  }
];

async function seed() {
  try {
    if (process.env.BUZZIT_ENV !== 'development' || !process.env.MONGODB_DB_NAME) {
      throw new Error('Refusing to seed predict questions outside the isolated development database.');
    }
    await mongoose.connect(DB_URI, { dbName: process.env.MONGODB_DB_NAME });
    console.log('Connected to DB');
    
    let added = 0;
    for (const q of questions) {
      const exists = await Question.findOne({ text: q.text });
      if (!exists) {
        await Question.create(q);
        added++;
      }
    }
    
    console.log(`Successfully added ${added} predict questions.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
