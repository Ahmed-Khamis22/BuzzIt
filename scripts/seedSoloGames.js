const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Question = require('../models/Question');

dotenv.config();

const demoQuestions = [
  {
    text: "لون من ألوان الطيف",
    category: "dont-say-my-word",
    answer: "أحمر",
    acceptedAnswers: ["برتقالي", "أصفر", "أخضر", "أزرب", "أزرق", "نيلي", "بنفسجي", "ازرق"],
    difficulty: "easy"
  },
  {
    text: "فاكهة لونها أصفر",
    category: "dont-say-my-word",
    answer: "موز",
    acceptedAnswers: ["ليمون", "مانجو", "أناناس", "اناناس", "مانجا", "تفاح أصفر"],
    difficulty: "easy"
  },
  {
    text: "عاصمة عربية",
    category: "dont-say-my-word",
    answer: "القاهرة",
    acceptedAnswers: ["الرياض", "عمان", "بيروت", "دمشق", "بغداد", "الخرطوم", "تونس", "الجزائر", "الرباط", "صنعاء", "مسقط", "الكويت", "المنامة", "أبوظبي", "ابوظبي", "الدوحة", "نواكشوط", "جيبوتي", "مقديشو", "طرابلس", "القدس"],
    difficulty: "easy"
  },
  {
    text: "حيوان مفترس",
    category: "dont-say-my-word",
    answer: "أسد",
    acceptedAnswers: ["نمر", "فهد", "ذئب", "دب", "تمساح", "ضبع", "ثعلب", "قرش", "اسد", "نمر عربي"],
    difficulty: "easy"
  },
  {
    text: "شكل هندسي",
    category: "dont-say-my-word",
    answer: "مربع",
    acceptedAnswers: ["دائرة", "مستطيل", "مثلث", "معين", "مخروط", "اسطوانة", "خماسي", "سداسي"],
    difficulty: "easy"
  },
  {
    text: "فصل من فصول السنة",
    category: "dont-say-my-word",
    answer: "الصيف",
    acceptedAnswers: ["الشتاء", "الربيع", "الخريف"],
    difficulty: "easy"
  },
  {
    text: "كوكب في المجموعة الشمسية",
    category: "dont-say-my-word",
    answer: "الأرض",
    acceptedAnswers: ["عطارد", "الزهرة", "المريخ", "المشتري", "زحل", "أورانوس", "نيبتون", "بلوتو"],
    difficulty: "easy"
  },
  {
    text: "حاسة من الحواس الخمس",
    category: "dont-say-my-word",
    answer: "الشم",
    acceptedAnswers: ["النظر", "السمع", "التذوق", "اللمس"],
    difficulty: "easy"
  },
  {
    text: "لغة برمجة",
    category: "dont-say-my-word",
    answer: "جافا سكربت",
    acceptedAnswers: ["جافا", "بايثون", "سي", "سي بلس بلس", "روبي", "سويفت", "كوتلن", "دارت", "بي اتش بي", "php", "javascript", "python", "java", "c++", "c#", "ruby", "swift", "kotlin", "dart"],
    difficulty: "medium"
  },
  {
    text: "نوع من أنواع الرياضة",
    category: "dont-say-my-word",
    answer: "كرة القدم",
    acceptedAnswers: ["كرة السلة", "التنس", "السباحة", "الجري", "الملاكمة", "المصارعة", "كرة الطائرة", "تنس الطاولة", "الجودو", "الكاراتيه", "جمباز"],
    difficulty: "easy"
  }
];

async function seedDontSayMyWord() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/buzzit';
    await mongoose.connect(mongoUri);
    console.log('Connected to DB');

    let added = 0;
    for (const q of demoQuestions) {
      const exists = await Question.findOne({ text: q.text, category: q.category });
      if (!exists) {
        await Question.create(q);
        added++;
      }
    }
    console.log(`Added ${added} 'dont-say-my-word' questions successfully.`);
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

seedDontSayMyWord();
