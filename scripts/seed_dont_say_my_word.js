const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Question = require('../models/Question');

dotenv.config();

const questions = [
  // EASY QUESTIONS (Lots of valid answers)
  {
    text: "أذكر اسم لون",
    answer: "أحمر",
    category: "dont-say-my-word",
    acceptedAnswers: ["أزرق", "اخضر", "أخضر", "أصفر", "اصفر", "أسود", "اسود", "أبيض", "ابيض", "برتقالي", "بنفسجي", "رمادي", "وردي", "بمبي", "بني", "كحلي", "نبيتي", "زيتي"]
  },
  {
    text: "أذكر اسم فاكهة",
    answer: "تفاح",
    category: "dont-say-my-word",
    acceptedAnswers: ["موز", "برتقال", "عنب", "مانجو", "فراولة", "بطيخ", "خوخ", "رمان", "تين", "كمثرى", "جوافة", "أناناس", "كيوي", "برقوق", "مشمش", "كانتالوب", "بلح"]
  },
  {
    text: "أذكر اسم حيوان أليف",
    answer: "قطة",
    category: "dont-say-my-word",
    acceptedAnswers: ["كلب", "عصفور", "هامستر", "سلحفاة", "سمكة", "ببغاء", "أرنب", "ارنب", "قطة", "ارنب", "كتكوت"]
  },
  {
    text: "أذكر وسيلة مواصلات",
    answer: "سيارة",
    category: "dont-say-my-word",
    acceptedAnswers: ["عربية", "طيارة", "قطار", "قطر", "مترو", "أتوبيس", "اتوبيس", "سفينة", "مركب", "موتوسيكل", "عجلة", "دراجة", "توكتوك", "تاكسي"]
  },
  {
    text: "أذكر اسم دولة عربية",
    answer: "مصر",
    category: "dont-say-my-word",
    acceptedAnswers: ["السعودية", "سعودية", "الامارات", "إمارات", "المغرب", "تونس", "الجزائر", "سوريا", "فلسطين", "العراق", "لبنان", "الأردن", "الكويت", "قطر", "البحرين", "عمان", "اليمن", "ليبيا", "السودان", "الصومال", "موريتانيا"]
  },
  {
    text: "أذكر اسم أكلة مصرية",
    answer: "كشري",
    category: "dont-say-my-word",
    acceptedAnswers: ["ملوخية", "محشي", "فول", "طعمية", "فلافل", "شاورما", "كفتة", "حواوشي", "كبدة", "بامية", "مكرونة بشاميل", "رقاق", "فتة", "مسقعة", "فطير"]
  },
  {
    text: "أذكر اسم رياضة بالكرة",
    answer: "كرة القدم",
    category: "dont-say-my-word",
    acceptedAnswers: ["كرة السلة", "سلة", "كرة الطائرة", "طائرة", "تنس", "كرة يد", "يد", "بينج بونج", "تنس طاولة", "اسكواش", "جولف", "بيسبول", "رغبي"]
  },
  {
    text: "أذكر شهر من شهور السنة الميلادية",
    answer: "يناير",
    category: "dont-say-my-word",
    acceptedAnswers: ["فبراير", "مارس", "أبريل", "ابريل", "مايو", "يونيو", "يوليو", "أغسطس", "اغسطس", "سبتمبر", "أكتوبر", "اكتوبر", "نوفمبر", "ديسمبر"]
  },
  {
    text: "أذكر اسم جهاز كهربائي في المنزل",
    answer: "تلاجة",
    category: "dont-say-my-word",
    acceptedAnswers: ["غسالة", "بوتاجاز", "مكواة", "تلفزيون", "مروحة", "تكييف", "ميكروويف", "خلاط", "مكنسة", "دفاية", "سخان", "سشوار", "شاشة"]
  },
  {
    text: "أذكر جزء من أجزاء الجسم",
    answer: "عين",
    category: "dont-say-my-word",
    acceptedAnswers: ["يد", "إيد", "رجل", "قدم", "رأس", "راس", "أنف", "مناخير", "أذن", "ودن", "فم", "بؤ", "شعر", "قلب", "بطن", "لسان", "أسنان"]
  },
  {
    text: "أذكر مهنة أو وظيفة",
    answer: "دكتور",
    category: "dont-say-my-word",
    acceptedAnswers: ["طبيب", "مهندس", "مدرس", "معلم", "محامي", "ظابط", "ضابط", "شرطي", "محاسب", "نجار", "سباك", "كهربائي", "طيار", "ممرضة", "مترجم"]
  },

  // MEDIUM QUESTIONS (5-9 Answers)
  {
    text: "أذكر اسم كوكب في المجموعة الشمسية",
    answer: "الأرض",
    category: "dont-say-my-word",
    acceptedAnswers: ["المريخ", "مريخ", "عطارد", "المشتري", "مشتري", "زحل", "الزهرة", "زهرة", "أورانوس", "نيبتون"]
  },
  {
    text: "أذكر اسم مشروب ساخن",
    answer: "شاي",
    category: "dont-say-my-word",
    acceptedAnswers: ["قهوة", "نسكافيه", "سحلب", "كاكاو", "هوت شوكليت", "يانسون", "نعناع", "قرفة", "زنجبيل"]
  },
  {
    text: "أذكر اسم فصل من فصول السنة",
    answer: "الصيف",
    category: "dont-say-my-word",
    acceptedAnswers: ["صيف", "الشتاء", "شتاء", "الخريف", "خريف", "الربيع", "ربيع"]
  },
  {
    text: "أذكر اسم مادة دراسية في المدرسة",
    answer: "عربي",
    category: "dont-say-my-word",
    acceptedAnswers: ["رياضيات", "حساب", "إنجليزي", "انجليزي", "علوم", "دراسات", "تاريخ", "جغرافيا", "فيزياء", "كيمياء", "أحياء", "فرنساوي"]
  },
  {
    text: "أذكر شيء يوضع في القدم",
    answer: "حذاء",
    category: "dont-say-my-word",
    acceptedAnswers: ["جزمة", "كوتشي", "شبشب", "صندل", "شراب", "جورب"]
  },
  {
    text: "أذكر اسم تطبيق تواصل اجتماعي",
    answer: "فيسبوك",
    category: "dont-say-my-word",
    acceptedAnswers: ["واتساب", "انستجرام", "تيك توك", "تويتر", "تليجرام", "سناب شات", "يوتيوب"]
  },
  {
    text: "أذكر اسم حيوان مفترس",
    answer: "أسد",
    category: "dont-say-my-word",
    acceptedAnswers: ["نمر", "فهد", "ذئب", "ضبع", "ثعلب", "دب", "تمساح", "قرش"]
  },
  {
    text: "أذكر اسم آلة موسيقية",
    answer: "بيانو",
    category: "dont-say-my-word",
    acceptedAnswers: ["جيتار", "عود", "كمان", "طبلة", "قانون", "ناي", "دف", "أورج"]
  },

  // HARD & VERY HARD QUESTIONS (Fewer than 5 answers - Rounds 8-10 Challenge!)
  {
    text: "أذكر اسم طائر لا يطير",
    answer: "نعامة",
    category: "dont-say-my-word",
    acceptedAnswers: ["بطريق", "دجاجة", "فرخة", "كيوي"]
  },
  {
    text: "أذكر اتجاه من الاتجاهات الأصلية",
    answer: "الشمال",
    category: "dont-say-my-word",
    acceptedAnswers: ["الجنوب", "الشرق", "الغرب"]
  },
  {
    text: "أذكر نوع من أنواع المشروبات الغازية",
    answer: "بيبسي",
    category: "dont-say-my-word",
    acceptedAnswers: ["كوكاكولا", "سفن أب", "سفن", "ميرندا", "فانتا", "سبيرو سباتس", "شويبس"]
  },
  {
    text: "أذكر اسم حالة من حالات المادة",
    answer: "صلبة",
    category: "dont-say-my-word",
    acceptedAnswers: ["سائلة", "غازية", "بلازما"]
  },
  {
    text: "أذكر اسم محيط في العالم",
    answer: "المحيط الهادئ",
    category: "dont-say-my-word",
    acceptedAnswers: ["المحيط الأطلسي", "المحيط الهندي", "المحيط المتجمد الشمالي", "المحيط المتجمد الجنوبي"]
  },
  {
    text: "أذكر اسم مادة يصنع منها الزجاج",
    answer: "رمل",
    category: "dont-say-my-word",
    acceptedAnswers: ["الرمل", "السيليكا", "رمل الزجاج"]
  },
  {
    text: "أذكر اسم عنصر كيميائي تنفسه البشري أساسي للحياة",
    answer: "أكسجين",
    category: "dont-say-my-word",
    acceptedAnswers: ["الاكسجين", "أوكسجين"]
  },
  {
    text: "أذكر اسم هرم من أهرامات الجيزة الثلاثة الشهيرة",
    answer: "خوفو",
    category: "dont-say-my-word",
    acceptedAnswers: ["خفرع", "منقرع"]
  }
];

async function seedDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/buzzit', process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : undefined);
    console.log('Connected to MongoDB for Seeding Don\'t Say My Word...');

    await Question.deleteMany({ category: 'dont-say-my-word' });
    console.log('Cleared old questions.');

    await Question.insertMany(questions);
    console.log(`Successfully seeded ${questions.length} diverse 'dont-say-my-word' questions!`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
}

seedDB();
