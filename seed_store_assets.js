require('dotenv').config();
const mongoose = require('mongoose');
const StoreItem = require('./models/StoreItem');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  const items = [
    {
      name: 'شبح المعادي',
      description: 'أفاتار مرعب بس دمه خفيف للناس القديمة في اللعبة.',
      price: 100,
      type: 'avatar',
      imageUrl: 'avatar_shabah',
    },
    {
      name: 'الملك فاروق',
      description: 'أفاتار ملكي حصري، هيبتك تسبقك.',
      price: 150,
      type: 'avatar',
      imageUrl: 'avatar_farouk',
    },
    {
      name: 'سيد جيمنج (Gamer)',
      description: 'أفاتار كارتوني فريش للي بيعشقوا الألعاب والتحدي.',
      price: 120,
      type: 'avatar',
      imageUrl: 'avatar_cartoon_gamer',
    },
    {
      name: 'الأسطى حنكش',
      description: 'شنيور في الميكانيكا، ولسانه أطول منه.',
      price: 60,
      type: 'avatar',
      imageUrl: 'avatar_hankash',
    },
    {
      name: 'أم عبده',
      description: 'اللي بتجيب من الآخر بشبشب أو معلقة خشب.',
      price: 80,
      type: 'avatar',
      imageUrl: 'avatar_om_abdo',
    },
    {
      name: 'توت عنخ آمون',
      description: 'أفاتار فرعوني أصيل، غالي بس يستاهل.',
      price: 200,
      type: 'avatar',
      imageUrl: 'avatar_tut',
    },
    {
      name: 'كأس العالم 2026',
      description: 'ثيم احتفالي بمشاركة مصر في كأس العالم 2026! البتلو برنا وبنوجسم مصر.',
      price: 150,
      type: 'theme',
      imageUrl: 'theme_world_cup',
    },
    {
      name: 'كلاكس ميكروباص',
      description: 'صوت مزعج بس بيصحي النايمين أول ما تدوس على الزرار.',
      price: 50,
      type: 'effect',
      soundUrl: 'red-card.mp3',
    },
    {
      name: 'نغمة الانتصار',
      description: 'صوت فوز أسطوري يحسسك إنك كسبت مليون جنيه.',
      price: 60,
      type: 'effect',
      soundUrl: 'win.mp3',
    },
    // ---- New Items: Borders ----
    {
      name: 'إطار ناري',
      description: 'إطار مولع نار للأفاتار بتاعك، يبين إنك مش بتهزر.',
      price: 150,
      type: 'border',
      imageUrl: 'border_fire',
    },
    {
      name: 'إطار نيون',
      description: 'إطار سايبربانك بألوان النيون اللي بتخطف العين.',
      price: 150,
      type: 'border',
      imageUrl: 'border_neon',
    },
    {
      name: 'إطار ألماس',
      description: 'إطار للناس الـ VIP بس، ألماس بيبرق حوالين صورتك.',
      price: 150,
      type: 'border',
      imageUrl: 'border_diamond',
    },
    // ---- New Items: Covers ----


    // ---- New Batch (Mass Expansion) ----
    {
      name: 'عم محمد البواب',
      description: 'أفاتار مصري أصيل، قاعد بيشرب شاي في الشارع وبيراقب الرايح والجاي.',
      price: 90,
      type: 'avatar',
      imageUrl: 'avatar_bawab',
    },
    {
      name: 'سواق التوك توك',
      description: 'أفاتار بستايل سريّح ومطرقع، معاه رخصة قيادة من المريخ.',
      price: 110,
      type: 'avatar',
      imageUrl: 'avatar_tuktuk',
    },
    {
      name: 'فرعون الغضب',
      description: 'أفاتار فرعوني مرعب للمحترفين فقط. عيونه بتطلع نار.',
      price: 350,
      type: 'avatar',
      imageUrl: 'avatar_pharaoh',
    },
    {
      name: 'أهرامات الجيزة (Pyramids)',
      description: 'غلاف كارتوني رائع للأهرامات وقت الغروب مع خيال جمل.',
      price: 250,
      type: 'cover',
      imageUrl: 'cover_pyramids',
    },
    {
      name: 'القاهرة سايبربانك (Cyberpunk)',
      description: 'غلاف لمدينة القاهرة كارتوني في المستقبل مع تكاتك طايرة وأنوار نيون.',
      price: 300,
      type: 'cover',
      imageUrl: 'cover_cyberpunk_cairo',
    },
    {
      name: 'شارع المعز (Moez)',
      description: 'غلاف كارتوني رائع لشارع المعز الأثري والفوانيس المضيئة بالليل.',
      price: 200,
      type: 'cover',
      imageUrl: 'cover_moez',
    },
    {
      name: 'غرفة الألعاب (Gaming Setup)',
      description: 'غلاف كارتوني رائع لسيت-أب ألعاب متكامل مع إضاءة ليد ونيون.',
      price: 250,
      type: 'cover',
      imageUrl: 'cover_gaming',
    },
    {
      name: 'الخيمة البدوية (Sinai Camp)',
      description: 'غلاف كارتوني لخيمة بدوية ونار مشتعلة تحت سماء صحراء سيناء المرصعة بالنجوم.',
      price: 200,
      type: 'cover',
      imageUrl: 'cover_bedouin',
    },
    {
      name: 'عروس البحر (Alexandria Coast)',
      description: 'غلاف كارتوني رائع لكورنيش وبحر إسكندرية بالليل مع قمر منير.',
      price: 150,
      type: 'cover',
      imageUrl: 'cover_alexandria',
    },
    {
      name: 'سحر النيل (Nile River)',
      description: 'غلاف كارتوني لنهر النيل مع مركب فلوكة والأهرامات البعيدة وقت الغروب.',
      price: 150,
      type: 'cover',
      imageUrl: 'cover_nile',
    },
    {
      name: 'إطار الماتريكس',
      description: 'إطار هكرز وكود أخضر بينزل على الشاشة، عشان تبان تقيل في اللعبة.',
      price: 150,
      type: 'border',
      imageUrl: 'border_matrix',
    },
    {
      name: 'الذهب الخالص',
      description: 'إطار من الذهب عيار ٢٤، للناس الأغنية بجد.',
      price: 150,
      type: 'border',
      imageUrl: 'border_gold_rush',
    },
    {
      name: 'أعماق البحر',
      description: 'إطار أزرق متدرج زي الماية، روقان وهدوء.',
      price: 150,
      type: 'border',
      imageUrl: 'border_ocean',
    },
    {
      name: 'السحر الأسود',
      description: 'إطار طلاسم ورونية سحرية غامضة بتنور بلون بنفسجي ساحر.',
      price: 150,
      type: 'border',
      imageUrl: 'border_magic',
    },
    {
      name: 'الكون الفسيح',
      description: 'إطار الفضاء والمجرات بتدوير نجوم وسدم كونية حوالين بروفايلك.',
      price: 150,
      type: 'border',
      imageUrl: 'border_cosmic',
    },
    {
      name: 'الصقيع الأبدي',
      description: 'إطار الجليد الكريستالي مع بلورات الثلج المتساقطة المتجمدة.',
      price: 150,
      type: 'border',
      imageUrl: 'border_ice',
    },
    {
      name: 'السم الزعاف',
      description: 'إطار مادة كيميائية سامة بتغلي وبتطلع فقاعات خضراء مرعبة.',
      price: 150,
      type: 'border',
      imageUrl: 'border_toxic',
    },
    {
      name: 'لعنة الفراعنة',
      description: 'ثيم (ألوان التطبيق) بألوان الدهب والأسود الملكي.',
      price: 200,
      type: 'theme',
      imageUrl: 'theme_pharaoh',
    },

    // ---- New Egyptian Themes ----
    {
      name: 'ليالي رمضان',
      description: 'ثيم فوانيس وسحر رمضان في حواري القاهرة القديمة. جو مصري أصيل.',
      price: 130,
      type: 'theme',
      imageUrl: 'theme_ramadan',
    },
    {
      name: 'الألتراس',
      description: 'ثيم نار وحماس وجماهير ملاعب مصر. لمحبي الكرة والجنان.',
      price: 140,
      type: 'theme',
      imageUrl: 'theme_ultras',
    },
    {
      name: 'عروس البحر',
      description: 'ثيم الإسكندرية والبحر المتوسط، روقان وهدوء وملوكية.',
      price: 130,
      type: 'theme',
      imageUrl: 'theme_alexandria',
    },
    {
      name: 'سيناء الساحرة',
      description: 'ثيم جبال سيناء وسماء المجرة الرهيبة. لمحبي الطبيعة والسفر.',
      price: 160,
      type: 'theme',
      imageUrl: 'theme_sinai',
    },
    {
      name: 'قاهرة الليل',
      description: 'ثيم القاهرة من فوق بالليل. مدينة مليون نور وصوت.',
      price: 180,
      type: 'theme',
      imageUrl: 'theme_cairo_night',
    },
    // ---- New Legendary Items (Gem-Only) ----
    {
      name: 'الفرعون الذهبي الخالد',
      description: 'أفاتار فرعوني أسطوري بالذهب الخالص والعيون المضيئة، رمز الهيبة المطلقة.',
      price: 99999,
      gemPrice: 100,
      isGemOnly: true,
      type: 'avatar',
      imageUrl: 'avatar_gold_pharaoh',
    },
    {
      name: 'فارس السايبربانك',
      description: 'شخصية مستقبلية ترتدي خوذة تقنية عالية التفاصيل وقناع نيون مضيء.',
      price: 99999,
      gemPrice: 80,
      isGemOnly: true,
      type: 'avatar',
      imageUrl: 'avatar_cyber_knight',
    },
    {
      name: 'رونين السايبربانك الأسطوري',
      description: 'شخصية الساموراي الرقمي المستقبلي بقناع معدني وإضاءة نيون أرجوانية مشعة.',
      price: 99999,
      gemPrice: 90,
      isGemOnly: true,
      type: 'avatar',
      imageUrl: 'avatar_cyber_ronin',
    },

    {
      name: 'سحر النيل',
      description: 'ثيم خاص بسحر نهر النيل وأجواء مصر المحروسة. للي بيحب بلده بجد.',
      price: 99999,
      gemPrice: 90,
      isGemOnly: true,
      type: 'theme',
      imageUrl: 'theme_nile_egypt',
    },
    {
      name: 'إطار التنين الذهبي الأسطوري',
      description: 'إطار التنين الذهبي الأسطوري بالذهب الخالص والعيون المضيئة مع تنين يلتف حول صورتك.',
      price: 99999,
      gemPrice: 75,
      isGemOnly: true,
      type: 'border',
      imageUrl: 'border_dragon',
    },
    {
      name: 'إطار أفق الحدث الأسطوري',
      description: 'إطار نيون مستقبلي متوهج يحيط صورتك بهالة من البريق المضيء بتصميم كوني جذاب.',
      price: 99999,
      gemPrice: 75,
      isGemOnly: true,
      type: 'border',
      imageUrl: 'border_horizon',
    },
    // ---- Admin Items ----
    {
      name: 'الزعيم (Admin)',
      description: 'أفاتار حصري لمديري اللعبة فقط.',
      price: 0,
      gemPrice: 0,
      isGemOnly: false,
      type: 'avatar',
      imageUrl: 'avatar_admin',
      isAvailable: true,
      isAdminOnly: true
    },
    {
      name: 'إطار الإدارة (Admin)',
      description: 'إطار مخصص لإدارة اللعبة.',
      price: 0,
      gemPrice: 0,
      isGemOnly: false,
      type: 'border',
      imageUrl: 'border_admin',
      isAvailable: true,
      isAdminOnly: true
    },
    {
      name: 'غلاف الزعيم (Admin)',
      description: 'غلاف بروفايل حصري لمديري اللعبة مكتوب عليه ADMIN.',
      price: 0,
      gemPrice: 0,
      isGemOnly: false,
      type: 'cover',
      imageUrl: 'cover_admin',
      isAvailable: true,
      isAdminOnly: true
    }
  ];

  const names = items.map(i => i.name);
  await StoreItem.deleteMany({ name: { $nin: names } });

  for (const item of items) {
    await StoreItem.updateOne(
      { name: item.name },
      { $set: item },
      { upsert: true }
    );
  }
  console.log('Store items with assets seeded successfully!');
  mongoose.disconnect();
}

seed();
