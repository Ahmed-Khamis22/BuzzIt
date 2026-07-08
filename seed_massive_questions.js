require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const triviaQuestions = [
  // General Knowledge (Trivia)
  { text: "ما هو أطول نهر في العالم؟", answer: "نهر النيل", choices: ["نهر الأمازون", "نهر النيل", "نهر المسيسيبي", "نهر الفرات"], category: "general-knowledge", difficulty: "easy", isCustomTrivia: true },
  { text: "ما هي عاصمة اليابان؟", answer: "طوكيو", choices: ["بكين", "سيول", "طوكيو", "بانكوك"], category: "general-knowledge", difficulty: "easy", isCustomTrivia: true },
  { text: "من هو مخترع المصباح الكهربائي؟", answer: "توماس إديسون", choices: ["ألبرت أينشتاين", "نيكولا تسلا", "توماس إديسون", "ألكسندر جراهام بيل"], category: "general-knowledge", difficulty: "medium", isCustomTrivia: true },
  { text: "كم عدد الكواكب في المجموعة الشمسية؟", answer: "8", choices: ["7", "8", "9", "10"], category: "general-knowledge", difficulty: "easy", isCustomTrivia: true },
  { text: "ما هو الحيوان الأسرع في العالم؟", answer: "الفهد", choices: ["الأسد", "الحصان", "الفهد", "الغزال"], category: "general-knowledge", difficulty: "easy", isCustomTrivia: true },
  { text: "ما هو العنصر الكيميائي الذي يرمز له بالرمز O؟", answer: "الأكسجين", choices: ["الذهب", "الأكسجين", "الكربون", "الحديد"], category: "general-knowledge", difficulty: "medium", isCustomTrivia: true },
  { text: "في أي قارة تقع دولة البرازيل؟", answer: "أمريكا الجنوبية", choices: ["أفريقيا", "أمريكا الشمالية", "أمريكا الجنوبية", "أوروبا"], category: "general-knowledge", difficulty: "easy", isCustomTrivia: true },
  { text: "ما هي لغة البرمجة التي تم اختراعها عام 1995 وتستخدم بكثرة في الويب؟", answer: "JavaScript", choices: ["Python", "Java", "C++", "JavaScript"], category: "general-knowledge", difficulty: "hard", isCustomTrivia: true },
  { text: "من رسم لوحة الموناليزا؟", answer: "ليوناردو دا فينشي", choices: ["فان جوخ", "بيكاسو", "ليوناردو دا فينشي", "مايكل أنجلو"], category: "general-knowledge", difficulty: "medium", isCustomTrivia: true },
  { text: "ما هو أصغر كوكب في المجموعة الشمسية؟", answer: "عطارد", choices: ["المريخ", "عطارد", "الأرض", "الزهرة"], category: "general-knowledge", difficulty: "medium", isCustomTrivia: true },
  
  // Egyptian Movies (Trivia)
  { text: "مين اللي قال الجملة دي: 'أنا مش قصير تيزة أنا طويل وأهبل'؟", answer: "عادل إمام", choices: ["محمد هنيدي", "عادل إمام", "سعيد صالح", "أحمد زكي"], category: "egyptian-movies", difficulty: "easy", isCustomTrivia: true },
  { text: "في فيلم 'الناظر'، ما هو اسم المدرسة؟", answer: "عاشور", choices: ["عاشور", "النجاح", "صلاح الدين", "الأبطال"], category: "egyptian-movies", difficulty: "medium", isCustomTrivia: true },
  { text: "من هو بطل فيلم 'غبي منه فيه'؟", answer: "هاني رمزي", choices: ["أحمد حلمي", "محمد سعد", "هاني رمزي", "أحمد مكي"], category: "egyptian-movies", difficulty: "easy", isCustomTrivia: true },
  { text: "في فيلم 'صعيدي في الجامعة الأمريكية'، ما هو اسم الشخصية التي جسدها محمد هنيدي؟", answer: "خلف الدهشوري", choices: ["عاطف", "خلف الدهشوري", "سعيد", "علي"], category: "egyptian-movies", difficulty: "medium", isCustomTrivia: true },
  { text: "مين بطل مسلسل 'الكبير أوي'؟", answer: "أحمد مكي", choices: ["أحمد عز", "أحمد حلمي", "أحمد السقا", "أحمد مكي"], category: "egyptian-movies", difficulty: "easy", isCustomTrivia: true },
  { text: "في فيلم 'فول الصين العظيم'، محي الشرقاوي سافر فين؟", answer: "الصين", choices: ["اليابان", "الصين", "كوريا", "تايلاند"], category: "egyptian-movies", difficulty: "easy", isCustomTrivia: true },
  { text: "اسم بطل فيلم 'اللمبي' الحقيقي هو؟", answer: "محمد سعد", choices: ["أحمد سعد", "محمد سعد", "سعد الصغير", "حسن حسني"], category: "egyptian-movies", difficulty: "easy", isCustomTrivia: true },
  
  // Word in Song (Trivia)
  { text: "أكمل الأغنية: 'لولا الملامة يا هوى لولا الملامة...' لوردة الجزائرية", answer: "لفرد جناحي في الهوا", choices: ["لطير في الهوا", "لفرد جناحي في الهوا", "لأغني في الهوا", "لأرقص في الهوا"], category: "word-in-song", difficulty: "hard", isCustomTrivia: true },
  { text: "أكمل الأغنية: 'أنا كل ما أقول التوبة...' لعبد الحليم", answer: "يا بوي ترميني المقادير", choices: ["يا بوي ترميني المقادير", "أرجع تاني", "أحن إليك", "أنسى اللي فات"], category: "word-in-song", difficulty: "medium", isCustomTrivia: true },
  { text: "أكمل الأغنية لعمرو دياب: 'يا أجمل عيون وأحلى طيف...'؟", answer: "يا أرق من نسمة صيف", choices: ["يا أحلى من ورد الربيع", "يا أرق من نسمة صيف", "يا نور عيني", "يا قمر الليل"], category: "word-in-song", difficulty: "medium", isCustomTrivia: true },
  
  // Reversed Words (Trivia)
  { text: "ما هي الكلمة الصحيحة لهذه الكلمة المعكوسة: 'ةرايس'؟", answer: "سيارة", choices: ["دراجة", "طيارة", "سيارة", "سفينة"], category: "reversed-words", difficulty: "easy", isCustomTrivia: true },
  { text: "ما هي الكلمة الصحيحة لهذه الكلمة المعكوسة: 'نويزفيليت'؟", answer: "تيليفزيون", choices: ["راديو", "تيليفزيون", "تليفون", "ميكروفون"], category: "reversed-words", difficulty: "medium", isCustomTrivia: true },
  { text: "ما هي الكلمة الصحيحة لهذه الكلمة المعكوسة: 'روتويپمك'؟", answer: "كمپيوتر", choices: ["لابتوپ", "موبايل", "كمپيوتر", "تابلت"], category: "reversed-words", difficulty: "hard", isCustomTrivia: true }
];

const buzzerQuestions = [
  // General Knowledge (Buzzer)
  { text: "ما هو أطول نهر في العالم؟", answer: "نهر النيل", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "ما هي عاصمة اليابان؟", answer: "طوكيو", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "من هو مخترع المصباح الكهربائي؟", answer: "توماس إديسون", category: "general-knowledge", difficulty: "medium", isCustomTrivia: false },
  { text: "كم عدد الكواكب في المجموعة الشمسية؟", answer: "8", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "ما هو الحيوان الأسرع في العالم؟", answer: "الفهد", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "في أي قارة تقع دولة البرازيل؟", answer: "أمريكا الجنوبية", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "ما هو أصغر كوكب في المجموعة الشمسية؟", answer: "عطارد", category: "general-knowledge", difficulty: "medium", isCustomTrivia: false },
  { text: "ما هو الغاز الذي تتنفسه النباتات في عملية البناء الضوئي؟", answer: "ثاني أكسيد الكربون", category: "general-knowledge", difficulty: "medium", isCustomTrivia: false },
  { text: "كم عدد أسنان الإنسان البالغ؟", answer: "32", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },
  { text: "ما هو أكبر محيط في العالم؟", answer: "المحيط الهادئ", category: "general-knowledge", difficulty: "easy", isCustomTrivia: false },

  // Egyptian Movies (Buzzer)
  { text: "مين اللي قال الجملة دي: 'أنا مش قصير تيزة أنا طويل وأهبل'؟", answer: "عادل إمام", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },
  { text: "في فيلم 'الناظر'، ما هو اسم المدرسة؟", answer: "عاشور", category: "egyptian-movies", difficulty: "medium", isCustomTrivia: false },
  { text: "من هو بطل فيلم 'غبي منه فيه'؟", answer: "هاني رمزي", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },
  { text: "في فيلم 'صعيدي في الجامعة الأمريكية'، ما هو اسم الشخصية التي جسدها محمد هنيدي؟", answer: "خلف الدهشوري خلف", category: "egyptian-movies", difficulty: "medium", isCustomTrivia: false },
  { text: "مين بطل مسلسل 'الكبير أوي'؟", answer: "أحمد مكي", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },
  { text: "اسم بطل فيلم 'اللمبي' الحقيقي هو؟", answer: "محمد سعد", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },
  { text: "فيلم مصري كوميدي بطولته أحمد حلمي، يجسد فيه دور 3 أخوات توأم؟", answer: "كده رضا", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },
  { text: "فيلم بطولته كريم عبد العزيز وماجد الكدواني، وتدور أحداثه عن نادي الرجال السري؟", answer: "نادي الرجال السري", category: "egyptian-movies", difficulty: "easy", isCustomTrivia: false },

  // Word in Song (Buzzer)
  { text: "أكمل الأغنية: 'لولا الملامة يا هوى لولا الملامة...' لوردة الجزائرية", answer: "لفرد جناحي في الهوا", category: "word-in-song", difficulty: "hard", isCustomTrivia: false },
  { text: "أكمل الأغنية: 'أنا كل ما أقول التوبة...' لعبد الحليم", answer: "يا بوي ترميني المقادير", category: "word-in-song", difficulty: "medium", isCustomTrivia: false },
  { text: "أكمل الأغنية لعمرو دياب: 'يا أجمل عيون وأحلى طيف...'", answer: "يا أرق من نسمة صيف", category: "word-in-song", difficulty: "medium", isCustomTrivia: false },
  { text: "أكمل أغنية ويجز: 'عفاريت الأسفلت...'", answer: "مبنخافش الموت", category: "word-in-song", difficulty: "easy", isCustomTrivia: false },
  { text: "أكمل أغنية بهاء سلطان: 'تعالى أدلعك...'", answer: "قولي إيه هيمنعك", category: "word-in-song", difficulty: "easy", isCustomTrivia: false },

  // Reversed Words (Buzzer) - The Judge reads the reversed word, players must say the correct word
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: ةرايس", answer: "سيارة", category: "reversed-words", difficulty: "easy", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: نويزفيليت", answer: "تيليفزيون", category: "reversed-words", difficulty: "medium", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: روتويپمك", answer: "كمپيوتر", category: "reversed-words", difficulty: "hard", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: ةلاطسأ", answer: "أسطالة", category: "reversed-words", difficulty: "hard", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: بياطاب", answer: "باطايب (بطاطس)", category: "reversed-words", difficulty: "medium", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: ناويلخ", answer: "خليوان (حيوان)", category: "reversed-words", difficulty: "hard", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: بلك", answer: "كلب", category: "reversed-words", difficulty: "easy", isCustomTrivia: false },
  { text: "اقرأ الكلمة المعكوسة ليخمنها اللاعبون: ةطق", answer: "قطة", category: "reversed-words", difficulty: "easy", isCustomTrivia: false },
  
  // Describe It (Buzzer) - The judge describes the word without saying it
  { text: "أوصف الكلمة دي بدون ما تقولها: 'موبايل'", answer: "موبايل", category: "describe-it", difficulty: "easy", isCustomTrivia: false },
  { text: "أوصف الكلمة دي بدون ما تقولها: 'إنترنت'", answer: "إنترنت", category: "describe-it", difficulty: "medium", isCustomTrivia: false },
  { text: "أوصف الكلمة دي بدون ما تقولها: 'تلاجة'", answer: "تلاجة", category: "describe-it", difficulty: "easy", isCustomTrivia: false },
  { text: "أوصف الكلمة دي بدون ما تقولها: 'طيارة'", answer: "طيارة", category: "describe-it", difficulty: "easy", isCustomTrivia: false },
  { text: "أوصف الكلمة دي بدون ما تقولها: 'دكتور سنان'", answer: "دكتور سنان", category: "describe-it", difficulty: "medium", isCustomTrivia: false },
];

// Procedural Generation: Reversed Words
const arabicWords = require('./data/drawWords.json'); // We will use the expanded draw words list
arabicWords.forEach(word => {
  if (word.length >= 3) {
    const reversed = word.split('').reverse().join('');
    buzzerQuestions.push({
      text: `اقرأ الكلمة المعكوسة ليخمنها اللاعبون: ${reversed}`,
      answer: word,
      category: "reversed-words",
      difficulty: word.length <= 4 ? "easy" : (word.length <= 6 ? "medium" : "hard"),
      isCustomTrivia: false
    });
  }
});

// Procedural Generation: Math & Quick Thinking (Buzzer)
// We will generate 1000 math questions (multiplication, addition, subtraction)
for (let i = 0; i < 500; i++) {
  const num1 = Math.floor(Math.random() * 12) + 2;
  const num2 = Math.floor(Math.random() * 12) + 2;
  buzzerQuestions.push({
    text: `كم حاصل ضرب ${num1} في ${num2}؟`,
    answer: (num1 * num2).toString(),
    category: "general-knowledge",
    difficulty: "easy",
    isCustomTrivia: false
  });
}
for (let i = 0; i < 300; i++) {
  const num1 = Math.floor(Math.random() * 100) + 20;
  const num2 = Math.floor(Math.random() * 100) + 20;
  buzzerQuestions.push({
    text: `كم حاصل جمع ${num1} زائد ${num2}؟`,
    answer: (num1 + num2).toString(),
    category: "general-knowledge",
    difficulty: "medium",
    isCustomTrivia: false
  });
}
for (let i = 0; i < 200; i++) {
  const num1 = Math.floor(Math.random() * 200) + 100;
  const num2 = Math.floor(Math.random() * 50) + 10;
  buzzerQuestions.push({
    text: `كم حاصل طرح ${num1} ناقص ${num2}؟`,
    answer: (num1 - num2).toString(),
    category: "general-knowledge",
    difficulty: "hard",
    isCustomTrivia: false
  });
}

// Procedural Generation: Trivia Math
for (let i = 0; i < 300; i++) {
  const num1 = Math.floor(Math.random() * 10) + 3;
  const num2 = Math.floor(Math.random() * 10) + 3;
  const ans = num1 * num2;
  const choices = [
    (ans).toString(),
    (ans + Math.floor(Math.random() * 5) + 1).toString(),
    (ans - Math.floor(Math.random() * 5) - 1).toString(),
    (ans + 10).toString()
  ].sort(() => Math.random() - 0.5);
  
  triviaQuestions.push({
    text: `كم حاصل ضرب ${num1} في ${num2}؟`,
    answer: ans.toString(),
    choices: choices,
    category: "general-knowledge",
    difficulty: "easy",
    isCustomTrivia: true
  });
}

async function seedMassiveQuestions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log('Clearing old questions...');
    await Question.deleteMany({});
    
    console.log(`Inserting ${triviaQuestions.length} Trivia questions...`);
    await Question.insertMany(triviaQuestions);
    
    console.log(`Inserting ${buzzerQuestions.length} Buzzer questions...`);
    await Question.insertMany(buzzerQuestions);

    console.log('Massive seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding questions:', err);
    process.exit(1);
  }
}

seedMassiveQuestions();
