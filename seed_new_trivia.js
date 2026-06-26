require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const triviaQuestions = [
  // أعلام
  { text: "أي دولة تمتلك علم به ورقة قيقب حمراء؟", answer: "كندا", choices: ["الولايات المتحدة", "سويسرا", "كندا", "اليابان"], category: "flags", difficulty: "easy" },
  { text: "ما الدولة التي علمها يحتوي على شمس حمراء على خلفية بيضاء؟", answer: "اليابان", choices: ["الصين", "كوريا الجنوبية", "الفلبين", "اليابان"], category: "flags", difficulty: "easy" },
  { text: "علم أي دولة يتكون من ألوان أخضر، أبيض، أحمر بشكل عمودي؟", answer: "إيطاليا", choices: ["فرنسا", "إيطاليا", "ألمانيا", "المكسيك"], category: "flags", difficulty: "medium" },
  { text: "أي من هذه الدول ليس في علمها اللون الأزرق؟", answer: "ألمانيا", choices: ["روسيا", "ألمانيا", "فرنسا", "الولايات المتحدة"], category: "flags", difficulty: "hard" },
  { text: "ما هي الدولة الوحيدة التي علمها غير مستطيل أو مربع؟", answer: "نيبال", choices: ["سويسرا", "الفاتيكان", "نيبال", "قطر"], category: "flags", difficulty: "medium" },

  // أفلام مصرية
  { text: "من هو بطل فيلم 'الناظر'؟", answer: "علاء ولي الدين", choices: ["محمد هنيدي", "علاء ولي الدين", "أحمد حلمي", "عادل إمام"], category: "egyptian-movies", difficulty: "easy" },
  { text: "فيلم 'إشاعة حب' من بطولة سعاد حسني وعمر الشريف ومن؟", answer: "يوسف وهبي", choices: ["عبد الحليم حافظ", "رشدي أباظة", "يوسف وهبي", "أحمد رمزي"], category: "egyptian-movies", difficulty: "medium" },
  { text: "ما اسم شخصية أحمد مكي في فيلم 'لا تراجع ولا استسلام'؟", answer: "حزلقوم", choices: ["الكبير", "حزلقوم", "إتش دبور", "جوني"], category: "egyptian-movies", difficulty: "easy" },
  { text: "في أي فيلم قال عادل إمام جملة 'بلد بتاعة شهادات صحيح'؟", answer: "أنا وهو وهي", choices: ["السفارة في العمارة", "أنا وهو وهي", "الإرهابي", "طيور الظلام"], category: "egyptian-movies", difficulty: "hard" },
  { text: "من أخرج فيلم 'الممر'؟", answer: "شريف عرفة", choices: ["خالد يوسف", "شريف عرفة", "مروان حامد", "طارق العريان"], category: "egyptian-movies", difficulty: "medium" },

  // معلومات عامة - علوم وتاريخ وجغرافيا
  { text: "ما هو أكبر محيط في العالم؟", answer: "المحيط الهادئ", choices: ["المحيط الأطلسي", "المحيط الهادئ", "المحيط الهندي", "المحيط المتجمد الشمالي"], category: "general-knowledge", difficulty: "easy" },
  { text: "كم عدد الكواكب في المجموعة الشمسية؟", answer: "8", choices: ["7", "8", "9", "10"], category: "general-knowledge", difficulty: "easy" },
  { text: "من هو أول إنسان هبط على سطح القمر؟", answer: "نيل آرمسترونغ", choices: ["يوري غاغارين", "نيل آرمسترونغ", "باز ألدرين", "جون غلين"], category: "general-knowledge", difficulty: "medium" },
  { text: "في أي قارة تقع البرازيل؟", answer: "أمريكا الجنوبية", choices: ["إفريقيا", "أوروبا", "أمريكا الشمالية", "أمريكا الجنوبية"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو أطول نهر في العالم؟", answer: "نهر النيل", choices: ["نهر الأمازون", "نهر المسيسيبي", "نهر اليانغتسي", "نهر النيل"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي عاصمة اليابان؟", answer: "طوكيو", choices: ["كيوتو", "أوساكا", "طوكيو", "سول"], category: "general-knowledge", difficulty: "easy" },
  { text: "من بنى الهرم الأكبر في الجيزة؟", answer: "خوفو", choices: ["خفرع", "منكاورع", "زوسر", "خوفو"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الرمز الكيميائي للذهب؟", answer: "Au", choices: ["Ag", "Go", "Au", "Fe"], category: "general-knowledge", difficulty: "medium" },
  { text: "في أي سنة انتهت الحرب العالمية الأولى؟", answer: "1918", choices: ["1914", "1918", "1939", "1945"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو أسرع حيوان بري؟", answer: "الفهد", choices: ["الأسد", "الحصان", "الغزال", "الفهد"], category: "general-knowledge", difficulty: "easy" },
  { text: "من اخترع المصباح الكهربائي؟", answer: "توماس إديسون", choices: ["نيكولا تسلا", "ألبرت أينشتاين", "ألكسندر غراهام بيل", "توماس إديسون"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي اللغة الأكثر تحدثاً في العالم؟", answer: "الإنجليزية", choices: ["الصينية الماندرين", "الإسبانية", "الإنجليزية", "العربية"], category: "general-knowledge", difficulty: "hard" },
  { text: "كم عدد خلايا الدم الحمراء التي ينتجها الجسم يومياً؟", answer: "الملايين", choices: ["الآلاف", "الملايين", "المليارات", "المئات"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو العنصر الأساسي المكون للشمس؟", answer: "الهيدروجين", choices: ["الأكسجين", "الكربون", "الهيليوم", "الهيدروجين"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي أصغر دولة في العالم؟", answer: "الفاتيكان", choices: ["موناكو", "الفاتيكان", "سان مارينو", "ناورو"], category: "general-knowledge", difficulty: "easy" }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    for (const q of triviaQuestions) {
      const exists = await Question.findOne({ text: q.text });
      if (!exists) {
        await Question.create({ ...q, isCustomTrivia: true });
        console.log(`Inserted: ${q.text}`);
      } else {
        await Question.updateOne({ _id: exists._id }, { $set: { choices: q.choices, isCustomTrivia: true, category: q.category } });
      }
    }
    
    console.log('Successfully inserted new dedicated trivia questions.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
