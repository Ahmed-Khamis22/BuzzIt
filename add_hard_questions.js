require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const hardQuestions = [
  { text: "ما هي الدولة الوحيدة التي لا تملك جيشاً عسكرياً على الإطلاق وتعتمد على سويسرا في دفاعها؟", answer: "ليختنشتاين", choices: ["آيسلندا", "ليختنشتاين", "أندورا", "سان مارينو"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو الكوكب الوحيد في النظام الشمسي الذي يدور على جانبه؟", answer: "أورانوس", choices: ["المريخ", "المشتري", "أورانوس", "الزهرة"], category: "general-knowledge", difficulty: "hard" },
  { text: "من هو العالم الذي اكتشف البنسلين بالصدفة؟", answer: "ألكسندر فلمنج", choices: ["لويس باستير", "ماري كوري", "روبرت كوخ", "ألكسندر فلمنج"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي أعمق نقطة في المحيطات على كوكب الأرض؟", answer: "خندق ماريانا", choices: ["خندق بورتوريكو", "البحر الميت", "خندق ماريانا", "خندق تونغا"], category: "general-knowledge", difficulty: "hard" },
  { text: "في أي عام تم توقيع معاهدة فرساي التي أنهت الحرب العالمية الأولى؟", answer: "1919", choices: ["1918", "1919", "1920", "1917"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي الغدة المسؤولة عن تنظيم سرعة التمثيل الغذائي في جسم الإنسان؟", answer: "الغدة الدرقية", choices: ["الغدة النخامية", "البنكرياس", "الغدة الكظرية", "الغدة الدرقية"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو العنصر الكيميائي الذي يمتلك أعلى درجة انصهار بين جميع المعادن؟", answer: "التنجستن", choices: ["التيتانيوم", "البلاتين", "الأوزميوم", "التنجستن"], category: "general-knowledge", difficulty: "hard" },
  { text: "أي من هذه الدول تحدها 14 دولة أخرى وتشارك روسيا في هذا الرقم القياسي؟", answer: "الصين", choices: ["البرازيل", "الهند", "الولايات المتحدة", "الصين"], category: "general-knowledge", difficulty: "hard" },
  { text: "من هو الرسام الذي رسم اللوحة الشهيرة 'الصرخة'؟", answer: "إدفارد مونك", choices: ["فنسنت فان جوخ", "كلود مونيه", "بابلو بيكاسو", "إدفارد مونك"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو أطول نهر في قارة أوروبا؟", answer: "نهر الفولغا", choices: ["نهر الدانوب", "نهر الراين", "نهر التايمز", "نهر الفولغا"], category: "general-knowledge", difficulty: "hard" }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    for (const q of hardQuestions) {
      const exists = await Question.findOne({ text: q.text });
      if (!exists) {
        await Question.create(q);
        console.log(`Inserted: ${q.text}`);
      } else {
        await Question.updateOne({ _id: exists._id }, { $set: { choices: q.choices } });
      }
    }
    
    console.log('Successfully inserted hard questions.');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
