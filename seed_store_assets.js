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
      name: 'قهوة بلدي',
      description: 'ثيم بألوان القهوة البلدي الأصيلة، ريحة البن هتطلع من الشاشة.',
      price: 80,
      type: 'theme',
      imageUrl: 'theme_qahwa',
    },
    {
      name: 'نوستالجيا التمانينات',
      description: 'ثيم بألوان النيون والديسكو، للناس اللي بتحب الروقان.',
      price: 120,
      type: 'theme',
      imageUrl: 'theme_80s',
    },
    {
      name: 'كلاكس ميكروباص',
      description: 'صوت مزعج بس بيصحي النايمين أول ما تدوس على الزرار.',
      price: 50,
      type: 'effect',
      soundUrl: 'red-card.mp3', // Map to existing sound for now
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
      imageUrl: 'border_fire', // Logic will handle this as a special gradient
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
    {
      name: 'مملكة الفانتازيا',
      description: 'عالم سحري مليان ألوان كارتونية، لمحبي الـ RPG.',
      price: 200,
      type: 'cover',
      imageUrl: 'cover_cartoon_fantasy',
    },
    {
      name: 'سايبربانك نيون',
      description: 'مدينة مستقبلية وألوان نيون قوية، جو الخيال العلمي.',
      price: 250,
      gemPrice: 50,
      type: 'cover',
      imageUrl: 'cover_cartoon_cyberpunk',
    },
    {
      name: 'الفضاء العميق',
      description: 'كواكب ونجوم وسفن فضائية بأسلوب كارتوني.',
      price: 180,
      type: 'cover',
      imageUrl: 'cover_cartoon_space',
    },
    {
      name: 'سباق النيون',
      description: 'طريق سباق سريع وألوان نيون سريعة لمحبي السرعة.',
      price: 150,
      type: 'cover',
      imageUrl: 'cover_cartoon_racing',
    },
    {
      name: 'أركيد 80s',
      description: 'أجهزة ألعاب كلاسيكية وألوان ريترو بأسلوب فيكتور.',
      price: 100,
      type: 'cover',
      imageUrl: 'cover_cartoon_arcade',
    },
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
      name: 'أهرامات الجيزة',
      description: 'غلاف للبروفايل فيه الأهرامات العظيمة وقت الغروب. سحر لا يقاوم.',
      price: 250,
      type: 'cover',
      imageUrl: 'cover_pyramids',
    },
    {
      name: 'القاهرة سايبربانك',
      description: 'غلاف لمدينة القاهرة في المستقبل، نيون وتكاتك طايرة.',
      price: 300,
      type: 'cover',
      imageUrl: 'cover_cyberpunk_cairo',
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
    {
      name: 'المدينة الذكية',
      description: 'ثيم (ألوان التطبيق) ألوان نيون وماجينتا، سايبربانك ستايل.',
      price: 220,
      type: 'theme',
      imageUrl: 'theme_cyberpunk',
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
      name: 'بوابة الفضاء الفرعونية',
      description: 'غلاف بروفايل يدمج الأهرامات الذهبية العظيمة مع بوابة النجوم الكونية المضيئة.',
      price: 99999,
      gemPrice: 120,
      isGemOnly: true,
      type: 'cover',
      imageUrl: 'cover_cosmic_portal',
    },
    {
      name: 'المدينة الطائرة',
      description: 'مدينة مستقبلية معلقة بين الكواكب البعيدة والسدم الكونية الساحرة.',
      price: 99999,
      gemPrice: 120,
      isGemOnly: true,
      type: 'cover',
      imageUrl: 'cover_floating_city',
    },
    {
      name: 'الشبكة الرقمية الأسطورية',
      description: 'ثيم غامق فاخر جداً مع خطوط نيون مضيئة ومؤثرات بريميوم في كامل التطبيق.',
      price: 99999,
      gemPrice: 90,
      isGemOnly: true,
      type: 'theme',
      imageUrl: 'theme_cyberpunk',
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
