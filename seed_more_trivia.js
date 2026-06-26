require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const questions = [
  // أعلام
  { text: "علم يتكون من هلال ونجمة حمراء على خلفية بيضاء؟", answer: "تركيا", choices: ["تونس", "تركيا", "الجزائر", "باكستان"], category: "flags", difficulty: "easy" },
  { text: "علم دولة يتكون من لونين أزرق وأصفر فقط؟", answer: "أوكرانيا", choices: ["السويد", "أوكرانيا", "كولومبيا", "البرازيل"], category: "flags", difficulty: "easy" },
  { text: "علم أي دولة عربية يحتوي على شجرة الأرز الخضراء؟", answer: "لبنان", choices: ["الأردن", "سوريا", "فلسطين", "لبنان"], category: "flags", difficulty: "easy" },
  { text: "علم به نسر أصفر في المنتصف على خلفية مقسمة أحمر وأسود وأصفر؟", answer: "ألمانيا", choices: ["بلجيكا", "ألمانيا", "مصر", "أسبانيا"], category: "flags", difficulty: "medium" },
  { text: "ما الدولة التي علمها يحتوي على دائرة حمراء كبيرة في المنتصف على خلفية خضراء؟", answer: "بنغلاديش", choices: ["اليابان", "بنغلاديش", "باكستان", "جزر المالديف"], category: "flags", difficulty: "hard" },
  { text: "علم يتكون من صليب أبيض على خلفية حمراء؟", answer: "سويسرا", choices: ["الدنمارك", "إنجلترا", "سويسرا", "جورجيا"], category: "flags", difficulty: "easy" },
  { text: "علم مقسم عمودياً إلى أخضر وأبيض وبرتقالي؟", answer: "أيرلندا", choices: ["إيطاليا", "ساحل العاج", "الهند", "أيرلندا"], category: "flags", difficulty: "medium" },
  { text: "ما هي الدولة التي علمها أسود وأحمر وأصفر أفقياً؟", answer: "ألمانيا", choices: ["بلجيكا", "ألمانيا", "هولندا", "كولومبيا"], category: "flags", difficulty: "easy" },
  { text: "علم أي دولة يتكون من مثلث أحمر ونجمة بيضاء بالإضافة إلى خطوط زرقاء وبيضاء؟", answer: "كوبا", choices: ["بورتوريكو", "كوبا", "الفلبين", "تشيلي"], category: "flags", difficulty: "hard" },
  { text: "علم به نجمة سداسية زرقاء على خلفية بيضاء؟", answer: "إسرائيل", choices: ["اليونان", "فنلندا", "الأرجنتين", "إسرائيل"], category: "flags", difficulty: "easy" },
  
  // أفلام مصرية
  { text: "من بطل فيلم 'الجزيرة'؟", answer: "أحمد السقا", choices: ["أحمد عز", "أمير كرارة", "كريم عبد العزيز", "أحمد السقا"], category: "egyptian-movies", difficulty: "easy" },
  { text: "ما اسم فيلم الرعب المصري الذي يحكي عن طبيب نفسي يتعامل مع عالم الجن؟", answer: "الفيل الأزرق", choices: ["التعويذة", "الفيل الأزرق", "كامب", "وردة"], category: "egyptian-movies", difficulty: "easy" },
  { text: "فيلم 'إشاعة حب' من إخراج من؟", answer: "فطين عبد الوهاب", choices: ["عز الدين ذو الفقار", "حسن الإمام", "يوسف شاهين", "فطين عبد الوهاب"], category: "egyptian-movies", difficulty: "hard" },
  { text: "من هو الممثل الذي أدى دور 'رأفت الهجان'؟", answer: "محمود عبد العزيز", choices: ["نور الشريف", "عادل إمام", "محمود عبد العزيز", "يحيى الفخراني"], category: "egyptian-movies", difficulty: "easy" },
  { text: "من شارك أحمد حلمي بطولة فيلم 'آسف على الإزعاج'؟", answer: "منة شلبي", choices: ["منى زكي", "دنيا سمير غانم", "منة شلبي", "غادة عادل"], category: "egyptian-movies", difficulty: "medium" },
  { text: "في أي فيلم ظهرت شخصية 'اللمبي' لأول مرة؟", answer: "الناظر", text: "الناظر", choices: ["اللمبي", "اللي بالي بالك", "الناظر", "عوكل"], category: "egyptian-movies", difficulty: "medium" },
  { text: "من هي بطلة فيلم 'خلي بالك من زوزو'؟", answer: "سعاد حسني", choices: ["فاتن حمامة", "شادية", "سعاد حسني", "نادية لطفي"], category: "egyptian-movies", difficulty: "easy" },
  { text: "ما هو الفيلم المصري الوحيد الذي ترشح للقائمة القصيرة في الأوسكار؟", answer: "لا يوجد", choices: ["المهاجر", "دعاء الكروان", "باب الحديد", "لا يوجد"], category: "egyptian-movies", difficulty: "hard" },
  { text: "من قام بدور 'عاطف' في فيلم الناظر؟", answer: "أحمد حلمي", choices: ["محمد سعد", "أحمد حلمي", "علاء ولي الدين", "أحمد مكي"], category: "egyptian-movies", difficulty: "medium" },
  { text: "فيلم 'ولاد رزق' من إخراج من؟", answer: "طارق العريان", choices: ["شريف عرفة", "مروان حامد", "طارق العريان", "خالد يوسف"], category: "egyptian-movies", difficulty: "medium" },

  // معلومات عامة
  { text: "ما هو المعدن الذي يوجد في الحالة السائلة في درجة حرارة الغرفة؟", answer: "الزئبق", choices: ["الحديد", "الألومنيوم", "الذهب", "الزئبق"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هو العضو الذي يضخ الدم في جسم الإنسان؟", answer: "القلب", choices: ["الرئتين", "الكبد", "القلب", "الكلى"], category: "general-knowledge", difficulty: "easy" },
  { text: "من هو مؤسس شركة مايكروسوفت؟", answer: "بيل غيتس", choices: ["ستيف جوبز", "مارك زوكربيرغ", "بيل غيتس", "إيلون ماسك"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي عاصمة إسبانيا؟", answer: "مدريد", choices: ["برشلونة", "إشبيلية", "فالنسيا", "مدريد"], category: "general-knowledge", difficulty: "easy" },
  { text: "كم عدد قارات العالم؟", answer: "7", choices: ["5", "6", "7", "8"], category: "general-knowledge", difficulty: "easy" },
  { text: "من هو النبي الذي ألقي في النار ونجا منها؟", answer: "إبراهيم", choices: ["يوسف", "موسى", "عيسى", "إبراهيم"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الحيوان الذي يُعرف بسفينة الصحراء؟", answer: "الجمل", choices: ["الحصان", "الأسد", "الجمل", "الفيل"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو لون الزمرد؟", answer: "أخضر", choices: ["أحمر", "أزرق", "أخضر", "أصفر"], category: "general-knowledge", difficulty: "easy" },
  { text: "من كتب رواية مئة عام من العزلة؟", answer: "غابرييل غارسيا ماركيز", choices: ["نجيب محفوظ", "فيكتور هوغو", "غابرييل غارسيا ماركيز", "تشارلز ديكنز"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي الدولة التي تمتلك أكبر عدد من السكان؟", answer: "الهند", choices: ["الصين", "الهند", "الولايات المتحدة", "روسيا"], category: "general-knowledge", difficulty: "medium" },
  { text: "من اكتشف البنسلين؟", answer: "ألكسندر فليمنغ", choices: ["لويس باستير", "ماري كوري", "ألبرت أينشتاين", "ألكسندر فليمنغ"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي أطول سورة في القرآن الكريم؟", answer: "البقرة", choices: ["آل عمران", "النساء", "المائدة", "البقرة"], category: "general-knowledge", difficulty: "easy" },
  { text: "في أي قارة تقع مصر؟", answer: "أفريقيا", choices: ["آسيا", "أوروبا", "أفريقيا", "أمريكا الجنوبية"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو أصغر كوكب في المجموعة الشمسية؟", answer: "عطارد", choices: ["المريخ", "الزهرة", "بلوتو", "عطارد"], category: "general-knowledge", difficulty: "medium" },
  { text: "من هو الرسام الذي قطع أذنه؟", answer: "فان جوخ", choices: ["بيكاسو", "دا فينشي", "فان جوخ", "سلفادور دالي"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي العاصمة الإدارية للمملكة العربية السعودية؟", answer: "الرياض", choices: ["جدة", "مكة", "الرياض", "الدمام"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي القوة التي تبقي الكواكب في مداراتها حول الشمس؟", answer: "الجاذبية", choices: ["المغناطيسية", "الكهرباء", "الاحتكاك", "الجاذبية"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الغاز الذي نتنفسه ونحتاجه للحياة؟", answer: "الأكسجين", choices: ["النيتروجين", "ثاني أكسيد الكربون", "الهيدروجين", "الأكسجين"], category: "general-knowledge", difficulty: "easy" },
  { text: "من هو مكتشف أمريكا؟", answer: "كريستوفر كولومبوس", choices: ["ماجلان", "ماركو بولو", "فاسكو دا غاما", "كريستوفر كولومبوس"], category: "general-knowledge", difficulty: "easy" },
  { text: "كم عدد الساعات في اليوم؟", answer: "24", choices: ["12", "20", "24", "48"], category: "general-knowledge", difficulty: "easy" },
  { text: "أي فريق كرة قدم إسباني يلقب بالملكي؟", answer: "ريال مدريد", choices: ["برشلونة", "أتلتيكو مدريد", "إشبيلية", "ريال مدريد"], category: "general-knowledge", difficulty: "easy" },
  { text: "في أي سنة بدأت الحرب العالمية الثانية؟", answer: "1939", choices: ["1914", "1939", "1945", "1918"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي أكبر بحيرة عذبة في العالم من حيث الحجم؟", answer: "بحيرة بايكال", choices: ["بحيرة سوبيريور", "بحيرة فيكتوريا", "بحيرة بايكال", "بحر قزوين"], category: "general-knowledge", difficulty: "hard" },
  { text: "من هو مؤسس موقع فيسبوك؟", answer: "مارك زوكربيرغ", choices: ["بيل غيتس", "ستيف جوبز", "إيلون ماسك", "مارك زوكربيرغ"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي أعلى قمة جبلية في العالم؟", answer: "إيفرست", choices: ["كليمنجارو", "الألب", "إيفرست", "جبال الأنديز"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الطائر الذي لا يطير ويعيش في القطب الجنوبي؟", answer: "البطريق", choices: ["النعامة", "البطريق", "النسر", "الطاووس"], category: "general-knowledge", difficulty: "easy" },
  { text: "أي مدينة تُعرف بمدينة التلال السبع؟", answer: "روما", choices: ["أثينا", "اسطنبول", "باريس", "روما"], category: "general-knowledge", difficulty: "hard" },
  { text: "من هو أول خليفة للمسلمين؟", answer: "أبو بكر الصديق", choices: ["عمر بن الخطاب", "عثمان بن عفان", "علي بن أبي طالب", "أبو بكر الصديق"], category: "general-knowledge", difficulty: "easy" },
  { text: "كم عدد الأيام في السنة الكبيسة؟", answer: "366", choices: ["365", "366", "364", "360"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو العنصر الكيميائي الأوفر في الكون؟", answer: "الهيدروجين", choices: ["الهيليوم", "الكربون", "الأكسجين", "الهيدروجين"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي السورة التي تعد قلب القرآن؟", answer: "يس", choices: ["الرحمن", "الملك", "الكهف", "يس"], category: "general-knowledge", difficulty: "medium" },
  { text: "من رسم لوحة العشاء الأخير؟", answer: "ليوناردو دا فينشي", choices: ["مايكل أنجلو", "رافائيل", "ساندرو بوتيتشيلي", "ليوناردو دا فينشي"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هي القارة المأهولة الأقل سكاناً؟", answer: "أستراليا", choices: ["أمريكا الجنوبية", "أوروبا", "أستراليا", "أفريقيا"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي أكبر غابة استوائية في العالم؟", answer: "الأمازون", choices: ["الكونغو", "الأمازون", "بورنيو", "تايغا"], category: "general-knowledge", difficulty: "easy" },
  { text: "أي جهاز يستخدم لقياس الضغط الجوي؟", answer: "البارومتر", choices: ["الترمومتر", "الأنيمومتر", "البارومتر", "السيزموغراف"], category: "general-knowledge", difficulty: "medium" },
  { text: "ما هي العاصمة السابقة لليابان قبل طوكيو؟", answer: "كيوتو", choices: ["أوساكا", "نارا", "هيروشيما", "كيوتو"], category: "general-knowledge", difficulty: "hard" },
  { text: "ما هو المكون الرئيسي للزجاج؟", answer: "الرمل", choices: ["الحديد", "البلاستيك", "الرمل", "الجبس"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي أكبر جزيرة في العالم؟", answer: "جرينلاند", choices: ["أستراليا", "مدغشقر", "جرينلاند", "غينيا الجديدة"], category: "general-knowledge", difficulty: "medium" },
  { text: "في أي مدينة يقع برج إيفل؟", answer: "باريس", choices: ["لندن", "روما", "مدريد", "باريس"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو الحيوان الأثقل على وجه الأرض؟", answer: "الحوت الأزرق", choices: ["الفيل الأفريقي", "الحوت الأزرق", "وحيد القرن", "الزرافة"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هي أصغر عظمة في جسم الإنسان؟", answer: "عظمة الركاب في الأذن", choices: ["عظمة الأنف", "عظمة الركاب في الأذن", "عظمة الفك", "عظمة الأصبع"], category: "general-knowledge", difficulty: "hard" },
  { text: "من هو مخترع الهاتف؟", answer: "ألكسندر غراهام بيل", choices: ["توماس إديسون", "نيكولا تسلا", "غاليليو", "ألكسندر غراهام بيل"], category: "general-knowledge", difficulty: "easy" },
  { text: "ما هو البحر الذي يفصل بين قارتي أفريقيا وأوروبا؟", answer: "البحر الأبيض المتوسط", choices: ["البحر الأحمر", "البحر الأسود", "البحر الأبيض المتوسط", "بحر العرب"], category: "general-knowledge", difficulty: "easy" }
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    
    let count = 0;
    for (const q of questions) {
      const exists = await Question.findOne({ text: q.text });
      if (!exists) {
        // shuffle choices
        const shuffledChoices = [...q.choices].sort(() => 0.5 - Math.random());
        await Question.create({ ...q, choices: shuffledChoices, isCustomTrivia: true });
        count++;
      } else {
        const shuffledChoices = [...q.choices].sort(() => 0.5 - Math.random());
        await Question.updateOne({ _id: exists._id }, { $set: { choices: shuffledChoices, isCustomTrivia: true, category: q.category } });
      }
    }
    
    console.log(`Successfully inserted/updated ${count} dedicated trivia questions.`);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();
