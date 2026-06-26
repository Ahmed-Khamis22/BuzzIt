require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/buzzit';

const questions = [
  // تاريخ
  { text: 'من هو مؤسس الدولة الأموية؟', answer: 'معاوية بن أبي سفيان', choices: ['معاوية بن أبي سفيان', 'عمر بن الخطاب', 'هارون الرشيد', 'عبد الملك بن مروان'], category: 'general-knowledge', difficulty: 'medium', isCustomTrivia: true },
  { text: 'في أي عام حدثت غزوة بدر؟', answer: '2 هـ', choices: ['2 هـ', '3 هـ', '5 هـ', '1 هـ'], category: 'general-knowledge', difficulty: 'easy', isCustomTrivia: true },
  { text: 'من هو القائد المسلم الذي فتح الأندلس؟', answer: 'طارق بن زياد', choices: ['طارق بن زياد', 'موسى بن نصير', 'صلاح الدين الأيوبي', 'عقبة بن نافع'], category: 'general-knowledge', difficulty: 'medium', isCustomTrivia: true },
  { text: 'متى سقطت الإمبراطورية الرومانية الغربية؟', answer: '476 م', choices: ['476 م', '1453 م', '395 م', '1066 م'], category: 'general-knowledge', difficulty: 'hard', isCustomTrivia: true },
  
  // رياضة
  { text: 'أي دولة فازت بكأس العالم 2018؟', answer: 'فرنسا', choices: ['فرنسا', 'كرواتيا', 'البرازيل', 'ألمانيا'], category: 'general-knowledge', difficulty: 'easy', isCustomTrivia: true },
  { text: 'من هو الهداف التاريخي لدوري أبطال أوروبا؟', answer: 'كريستيانو رونالدو', choices: ['كريستيانو رونالدو', 'ليونيل ميسي', 'روبرت ليفاندوفسكي', 'راؤول غونزاليس'], category: 'general-knowledge', difficulty: 'medium', isCustomTrivia: true },
  { text: 'كم عدد لاعبي فريق كرة السلة الأساسيين في الملعب؟', answer: '5', choices: ['5', '6', '7', '4'], category: 'general-knowledge', difficulty: 'easy', isCustomTrivia: true },
  { text: 'في أي مدينة أقيمت دورة الألعاب الأولمبية عام 2016؟', answer: 'ريو دي جانيرو', choices: ['ريو دي جانيرو', 'لندن', 'طوكيو', 'بكين'], category: 'general-knowledge', difficulty: 'medium', isCustomTrivia: true },

  // جغرافيا (معلومات عامة أو جغرافيا)
  { text: 'ما هي عاصمة أستراليا؟', answer: 'كانبرا', choices: ['كانبرا', 'سيدني', 'ملبورن', 'بريزبان'], category: 'general-knowledge', difficulty: 'medium', isCustomTrivia: true },
  { text: 'ما هو أطول نهر في العالم؟', answer: 'نهر النيل', choices: ['نهر النيل', 'نهر الأمازون', 'نهر المسيسيبي', 'نهر اليانغتسي'], category: 'general-knowledge', difficulty: 'easy', isCustomTrivia: true },
  
  // أعلام
  { text: 'إلى أي دولة ينتمي هذا العلم؟', answer: 'اليابان', choices: ['اليابان', 'الصين', 'كوريا الجنوبية', 'فيتنام'], category: 'flags', difficulty: 'easy', isCustomTrivia: true, flagImage: 'https://flagcdn.com/w320/jp.png' },
  { text: 'إلى أي دولة ينتمي هذا العلم؟', answer: 'كندا', choices: ['كندا', 'أستراليا', 'نيوزيلندا', 'الولايات المتحدة'], category: 'flags', difficulty: 'easy', isCustomTrivia: true, flagImage: 'https://flagcdn.com/w320/ca.png' },
  { text: 'إلى أي دولة ينتمي هذا العلم؟', answer: 'البرازيل', choices: ['البرازيل', 'الأرجنتين', 'المكسيك', 'كولومبيا'], category: 'flags', difficulty: 'easy', isCustomTrivia: true, flagImage: 'https://flagcdn.com/w320/br.png' },
  { text: 'إلى أي دولة ينتمي هذا العلم؟', answer: 'ألمانيا', choices: ['ألمانيا', 'بلجيكا', 'هولندا', 'فرنسا'], category: 'flags', difficulty: 'medium', isCustomTrivia: true, flagImage: 'https://flagcdn.com/w320/de.png' },
  { text: 'إلى أي دولة ينتمي هذا العلم؟', answer: 'إيطاليا', choices: ['إيطاليا', 'المكسيك', 'إيرلندا', 'فرنسا'], category: 'flags', difficulty: 'medium', isCustomTrivia: true, flagImage: 'https://flagcdn.com/w320/it.png' }
];

async function seed() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to DB');

    for (const q of questions) {
      await Question.create(q);
      console.log(`Inserted: ${q.text}`);
    }

    console.log('Successfully inserted more trivia categories.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
