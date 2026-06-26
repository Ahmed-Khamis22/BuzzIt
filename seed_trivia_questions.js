require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const triviaQuestions = [
  { text: "ما هي عاصمة أستراليا؟", answer: "كانبرا", choices: ["سيدني", "كانبرا", "ملبورن", "بيرث"], category: "general-knowledge", difficulty: "medium" },
  { text: "من هو الرسام الذي رسم لوحة الموناليزا؟", answer: "ليوناردو دا فينشي", choices: ["فنسنت فان جوخ", "بابلو بيكاسو", "مايكل أنجلو", "ليوناردو دا فينشي"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هو الكوكب الأقرب للشمس؟", answer: "عطارد", choices: ["الزهرة", "عطارد", "المريخ", "المشتري"], category: "general-knowledge", difficulty: "easy" },
  { text: "كم عدد القارات في العالم؟", answer: "7", choices: ["5", "6", "7", "8"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي لغة البرمجة التي تم تطويرها بواسطة جيمس غوسلينغ في شركة صن ميكروسيستمز؟", answer: "جافا", choices: ["بايثون", "سي شارب", "جافا", "روبي"], category: "general-knowledge", difficulty: "hard" },
  { text: "في أي عام بدأت الحرب العالمية الثانية؟", answer: "1939", choices: ["1935", "1939", "1941", "1945"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هو العنصر الكيميائي الذي يمثله الرمز O؟", answer: "الأكسجين", choices: ["الذهب", "الفضة", "الأكسجين", "الحديد"], category: "general-knowledge", difficulty: "easy" },
  { text: "أين يقع مقر الأمم المتحدة الرئيسي؟", answer: "نيويورك", choices: ["جنيف", "نيويورك", "لندن", "باريس"], category: "general-knowledge", difficulty: "medium" },
  { text: "من هو مكتشف الجاذبية الأرضية؟", answer: "إسحاق نيوتن", choices: ["ألبرت أينشتاين", "جاليليو جاليلي", "نيكولا تسلا", "إسحاق نيوتن"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي أكبر دولة في العالم من حيث المساحة؟", answer: "روسيا", choices: ["الصين", "الولايات المتحدة", "كندا", "روسيا"], category: "general-knowledge", difficulty: "medium" },
  { text: "كم عدد أسنان الإنسان البالغ؟", answer: "32", choices: ["28", "30", "32", "34"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الغاز الأكثر وفرة في الغلاف الجوي للأرض؟", answer: "النيتروجين", choices: ["الأكسجين", "ثاني أكسيد الكربون", "الهيدروجين", "النيتروجين"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي أصغر قارة في العالم؟", answer: "أستراليا", choices: ["أوروبا", "أستراليا", "أنتاركتيكا", "أمريكا الجنوبية"], category: "general-knowledge", difficulty: "medium" },
  { text: "من هو مؤلف كتاب 'البؤساء'؟", answer: "فيكتور هوغو", choices: ["تشارلز ديكنز", "فيكتور هوغو", "وليام شكسبير", "مارك توين"], category: "general-knowledge", difficulty: "hard" },
  { text: "أي حيوان هو أسرع حيوان بري في العالم؟", answer: "الفهد", choices: ["الأسد", "الحصان", "الفهد", "الغزال"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو أطول نهر في العالم؟", answer: "نهر النيل", choices: ["نهر الأمازون", "نهر المسيسيبي", "نهر اليانغتسي", "نهر النيل"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هو أصل اختراع الشطرنج؟", answer: "الهند", choices: ["الصين", "بلاد فارس", "الهند", "مصر"], category: "general-knowledge", difficulty: "hard" },
  { text: "كم عدد ألوان قوس قزح؟", answer: "7", choices: ["5", "6", "7", "8"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي العملة الرسمية في اليابان؟", answer: "الين", choices: ["اليوان", "الين", "الوون", "البات"], category: "general-knowledge", difficulty: "medium" },
  { text: "من هي أول امرأة فازت بجائزة نوبل؟", answer: "ماري كوري", choices: ["روزاليند فرانكلين", "أدا لوفليس", "ماري كوري", "جين غودال"], category: "general-knowledge", difficulty: "hard" }
];

// We add a specific field or use a specific category to identify them as trivia-only.
// Since category enum is strict, we will set them as 'general-knowledge' and maybe add a tag in text or add a boolean flag? 
// The prompt says "اعمل اسئلة تخص اللعبه دي لوحده", meaning "make questions for this game".
// We can just set them as general knowledge and update the server to only pick these questions by using an identifier.
// Or better yet, we can add a new enum value "trivia-game" to the Question schema first!

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    for (const q of triviaQuestions) {
      // mark them with a custom field so server can filter them
      const exists = await Question.findOne({ text: q.text });
      if (!exists) {
        await Question.create({ ...q, isCustomTrivia: true });
        console.log(`Inserted: ${q.text}`);
      } else {
        await Question.updateOne({ _id: exists._id }, { $set: { choices: q.choices, isCustomTrivia: true } });
      }
    }
    
    console.log('Successfully inserted dedicated trivia questions.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
