// Short, human-written Egyptian Arabic quiz questions based on authoritative
// references. Keep these concrete and playable; this is not an AI-generated set.
const refs = {
  whale: ['https://www.fisheries.noaa.gov/species/blue-whale', 'NOAA Fisheries'],
  whaleHeart: ['https://www.fisheries.noaa.gov/feature-story/big-hearted-blue-whale', 'NOAA Fisheries'],
  giraffe: ['https://animals.sandiegozoo.org/animals/giraffe', 'San Diego Zoo Wildlife Alliance'],
  elephant: ['https://nationalzoo.si.edu/animals/asian-elephant', 'Smithsonian National Zoo'],
  ostrich: ['https://nationalzoo.si.edu/animals/ostrich', 'Smithsonian National Zoo'],
  cheetah: ['https://nationalzoo.si.edu/animals/cheetah', 'Smithsonian National Zoo'],
  tiger: ['https://nationalzoo.si.edu/animals/tiger', 'Smithsonian National Zoo'],
  nasa: ['https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/', 'NASA'],
  jupiter: ['https://science.nasa.gov/jupiter/jupiter-facts/', 'NASA'],
  ganymede: ['https://science.nasa.gov/jupiter/jupiter-moons/ganymede/facts/', 'NASA'],
  milky: ['https://science.nasa.gov/solar-system/solar-system-facts/', 'NASA'],
  neptune: ['https://science.nasa.gov/neptune/neptune-facts/', 'NASA'],
  venus: ['https://science.nasa.gov/venus/venus-facts/', 'NASA'],
  mercury: ['https://science.nasa.gov/mercury/facts/', 'NASA'],
  solar: ['https://science.nasa.gov/solar-system/solar-system-facts/', 'NASA'],
  fifa: ['https://www.fifa.com/pt/tournaments/mens/worldcup/articles/maiores-campeoes-copa-do-mundo', 'FIFA'],
  fifaAllEditions: ['https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/brazil-team-profile-history', 'FIFA'],
  tennis: ['https://www.itftennis.com/en/about-us/organisation/tennis-glossary/', 'International Tennis Federation'],
  olympics: ['https://gstatic.olympics.com/s3/mc2026/documents/Education%20Programme/OVEP/English%20Toolkit/OVEP-Fundamentals-2023%20-%20English.pdf', 'International Olympic Committee'],
  ifab: ['https://www.theifab.com/laws/2025-26/the-players/', 'International Football Association Board'],
  elNazer: ['https://elcinema.com/work/1001525/cast', 'ElCinema'],
  saeedi: ['https://elcinema.com/work/1008760/cast', 'ElCinema'],
  kedaReda: ['https://elcinema.com/work/1009131/cast', 'ElCinema'],
};

const rows = [
  ['إيه أكبر حيوان عايش على الأرض؟', 'الحوت الأزرق', ['الفيل الإفريقي', 'القرش الأبيض', 'الحوت الأزرق'], 'whale'],
  ['إيه أطول حيوان بري؟', 'الزرافة', ['الفيل', 'النعامة', 'الزرافة'], 'giraffe'],
  ['رقبة الزرافة طولها حوالي كام؟', 'مترين تقريبًا', ['نص متر', 'مترين تقريبًا', 'خمسة متر'], 'giraffe'],
  ['إيه أضخم حيوان بيعيش على اليابسة؟', 'الفيل', ['وحيد القرن', 'الزرافة', 'الفيل'], 'elephant'],
  ['إيه أكبر طائر في العالم؟', 'النعامة', ['النسر', 'البطريق', 'النعامة'], 'ostrich'],
  ['إيه أسرع حيوان بري؟', 'الفهد', ['الأسد', 'النمر', 'الفهد'], 'cheetah'],
  ['أنهي حيوان بياكل كائنات صغيرة اسمها كريل؟', 'الحوت الأزرق', ['الدب القطبي', 'السلحفاة البحرية', 'الحوت الأزرق'], 'whale'],
  ['أنهي طائر كبير ما بيطيرش؟', 'النعامة', ['البجعة', 'الصقر', 'النعامة'], 'ostrich'],
  ['أنهي حيوان مفيش نمط خطوط عنده مطابق لخطوط نمر تاني؟', 'النمر', ['الحمار الوحشي', 'الزرافة', 'النمر'], 'tiger'],
  ['إيه أقرب قريب عايش للزرافة؟', 'الأوكابي', ['الحمار الوحشي', 'اللاما', 'الأوكابي'], 'giraffe'],
  ['أنهي حيوان بيستخدم خرطومه عشان يلقط الأكل؟', 'الفيل', ['الزرافة', 'وحيد القرن', 'الفيل'], 'elephant'],
  ['إيه أسرع حيوان ثديي على البر؟', 'الفهد', ['الحصان', 'الأسد', 'الفهد'], 'cheetah'],
  ['أنهي طائر عيونه أكبر من عيون أي طائر تاني؟', 'النعامة', ['البومة', 'النسر', 'النعامة'], 'ostrich'],
  ['إيه أسرع حيوان بيجري على رجلين؟', 'النعامة', ['الفهد', 'الحصان', 'النعامة'], 'ostrich'],
  ['الفيل بيهوّي جسمه بإيه لما الجو يبقى حر؟', 'ودانه الكبيرة', ['خرطومه', 'ذيله', 'ودانه الكبيرة'], 'elephant'],
  ['إيه أكبر كوكب في المجموعة الشمسية؟', 'المشتري', ['زحل', 'الأرض', 'المشتري'], 'nasa'],
  ['إيه أصغر كوكب في المجموعة الشمسية؟', 'عطارد', ['المريخ', 'الزهرة', 'عطارد'], 'nasa'],
  ['إيه أكتر كوكب حرارته عالية؟', 'الزهرة', ['عطارد', 'المريخ', 'الزهرة'], 'venus'],
  ['إيه أقرب كوكب للشمس؟', 'عطارد', ['الزهرة', 'الأرض', 'عطارد'], 'mercury'],
  ['أنهي كوكب بيتقال عليه الكوكب الأحمر؟', 'المريخ', ['الزهرة', 'المشتري', 'المريخ'], 'nasa'],
  ['أنهي كوكب مشهور بحلقاته الكبيرة؟', 'زحل', ['أورانوس', 'نبتون', 'زحل'], 'nasa'],
  ['الشمس كوكب ولا نجم؟', 'نجم', ['كوكب', 'قمر', 'نجم'], 'solar'],
  ['الأرض ترتيبها كام من الشمس؟', 'التالت', ['الأول', 'التاني', 'التالت'], 'nasa'],
  ['أنهي قمر هو الأكبر في المجموعة الشمسية؟', 'جانيميد', ['القمر', 'تيتان', 'جانيميد'], 'ganymede'],
  ['أنهي كوكب يومه أقصر من 10 ساعات تقريبًا؟', 'المشتري', ['الأرض', 'المريخ', 'المشتري'], 'jupiter'],
  ['أنهي كوكب بيلف حوالين نفسه في اتجاه عكس أغلب الكواكب؟', 'الزهرة', ['المريخ', 'المشتري', 'الزهرة'], 'venus'],
  ['أنهي كوكب هو أبعد كوكب عن الشمس؟', 'نبتون', ['زحل', 'أورانوس', 'نبتون'], 'neptune'],
  ['المجموعة الشمسية فيها كام كوكب؟', '8 كواكب', ['7 كواكب', '8 كواكب', '9 كواكب'], 'solar'],
  ['أنهي كوكب هو الأصغر وكمان الأقرب للشمس؟', 'عطارد', ['المريخ', 'الزهرة', 'عطارد'], 'mercury'],
  ['مين أكتر منتخب كسب كأس العالم للرجال؟', 'البرازيل', ['ألمانيا', 'الأرجنتين', 'البرازيل'], 'fifa'],
  ['مين اللاعب الوحيد اللي كسب كأس العالم 3 مرات؟', 'بيليه', ['مارادونا', 'ميسي', 'بيليه'], 'fifa'],
  ['أنهي منتخب شارك في كل نسخ كأس العالم للرجال؟', 'البرازيل', ['إيطاليا', 'ألمانيا', 'البرازيل'], 'fifaAllEditions'],
  ['فريق الكورة بيبدأ الماتش بكام لاعب؟', '11 لاعب', ['9 لاعيبة', '10 لاعيبة', '11 لاعب'], 'ifab'],
  ['في أنهي رياضة لاعبين بيستخدموا مضارب عشان يضربوا كورة فوق شبكة؟', 'التنس', ['كرة اليد', 'الاسكواش', 'التنس'], 'tennis'],
  ['الرمز الأولمبي فيه كام حلقة متشابكة؟', '5 حلقات', ['4 حلقات', '5 حلقات', '6 حلقات'], 'olympics'],
  ['أنهي حيوان معروف إنه بيعوم وبيعدي أنهار وبحيرات بسهولة؟', 'النمر', ['الفهد', 'الزرافة', 'النمر'], 'tiger'],
  ['أنهي حيوان قلبه هو الأكبر في العالم؟', 'الحوت الأزرق', ['الفيل', 'الزرافة', 'الحوت الأزرق'], 'whaleHeart'],
  ['أنهي كوكب أكبر من الأرض بحوالي 11 مرة في العرض؟', 'المشتري', ['زحل', 'نبتون', 'المشتري'], 'nasa'],
  ['إيه اسم المجرة اللي فيها مجموعتنا الشمسية؟', 'درب التبانة', ['مجرة المرأة المسلسلة', 'مجرة المثلث', 'درب التبانة'], 'milky'],
];

const movieRows = [
  ['في فيلم الناظر، مين كان عامل دور عاشور؟', 'علاء ولي الدين', ['أحمد حلمي', 'محمد سعد', 'علاء ولي الدين', 'حسن حسني'], 'elNazer'],
  ['في فيلم الناظر، مين كان عامل دور عاطف؟', 'أحمد حلمي', ['علاء ولي الدين', 'حسن حسني', 'أحمد حلمي', 'محمد سعد'], 'elNazer'],
  ['في فيلم الناظر، مين كان عامل دور اللمبي؟', 'محمد سعد', ['أحمد حلمي', 'علاء ولي الدين', 'محمد سعد', 'حسن حسني'], 'elNazer'],
  ['في فيلم الناظر، مين كان عامل دور سيد ضاحي؟', 'حسن حسني', ['محمد سعد', 'أحمد حلمي', 'حسن حسني', 'علاء ولي الدين'], 'elNazer'],
  ['اسم الشخصية اللي لعبها أحمد حلمي في الناظر إيه؟', 'عاطف', ['عاشور', 'سيد ضاحي', 'عاطف', 'اللمبي'], 'elNazer'],
  ['في فيلم صعيدي في الجامعة الأمريكية، مين لعب دور خلف الدهشوري؟', 'محمد هنيدي', ['أحمد السقا', 'هاني رمزي', 'محمد هنيدي', 'غادة عادل'], 'saeedi'],
  ['في فيلم صعيدي في الجامعة الأمريكية، مين لعب دور سعادة؟', 'منى زكي', ['غادة عادل', 'محمد هنيدي', 'منى زكي', 'أحمد السقا'], 'saeedi'],
  ['في فيلم صعيدي في الجامعة الأمريكية، مين لعب دور علي؟', 'أحمد السقا', ['هاني رمزي', 'محمد هنيدي', 'أحمد السقا', 'منى زكي'], 'saeedi'],
  ['في فيلم صعيدي في الجامعة الأمريكية، مين لعب دور سراج؟', 'هاني رمزي', ['أحمد السقا', 'غادة عادل', 'هاني رمزي', 'محمد هنيدي'], 'saeedi'],
  ['في فيلم صعيدي في الجامعة الأمريكية، مين لعب دور عبلة؟', 'غادة عادل', ['منى زكي', 'محمد هنيدي', 'غادة عادل', 'هاني رمزي'], 'saeedi'],
  ['في فيلم صعيدي في الجامعة الأمريكية، اسم شخصية محمد هنيدي إيه؟', 'خلف الدهشوري', ['علي', 'سراج', 'خلف الدهشوري', 'عبلة'], 'saeedi'],
  ['في فيلم كده رضا، مين لعب دور رضا؟', 'أحمد حلمي', ['محمد هنيدي', 'أحمد السقا', 'أحمد حلمي', 'منة شلبي'], 'kedaReda'],
  ['في فيلم كده رضا، مين لعب دور ندى؟', 'منة شلبي', ['غادة عادل', 'منى زكي', 'منة شلبي', 'أحمد حلمي'], 'kedaReda'],
  ['اسم شخصية منة شلبي في فيلم كده رضا إيه؟', 'ندى', ['سعادة', 'عبلة', 'ندى', 'رضا'], 'kedaReda'],
  ['أنهي فيلم من دول فيه شخصية اسمها خلف الدهشوري؟', 'صعيدي في الجامعة الأمريكية', ['الناظر', 'كده رضا', 'صعيدي في الجامعة الأمريكية', 'همام في أمستردام'], 'saeedi'],
  ['أنهي فيلم من دول فيه شخصية اسمها عاطف؟', 'الناظر', ['صعيدي في الجامعة الأمريكية', 'كده رضا', 'الناظر', 'همام في أمستردام'], 'elNazer'],
  ['أنهي فيلم من دول بطله اسمه رضا؟', 'كده رضا', ['الناظر', 'صعيدي في الجامعة الأمريكية', 'كده رضا', 'همام في أمستردام'], 'kedaReda'],
  ['أنهي فيلم جمع أحمد حلمي مع علاء ولي الدين؟', 'الناظر', ['كده رضا', 'صعيدي في الجامعة الأمريكية', 'الناظر', 'همام في أمستردام'], 'elNazer'],
  ['أنهي فيلم من دول شارك فيه أحمد السقا؟', 'صعيدي في الجامعة الأمريكية', ['الناظر', 'كده رضا', 'صعيدي في الجامعة الأمريكية', 'همام في أمستردام'], 'saeedi'],
  ['أنهي فيلم من دول شاركت فيه منة شلبي؟', 'كده رضا', ['الناظر', 'صعيدي في الجامعة الأمريكية', 'كده رضا', 'همام في أمستردام'], 'kedaReda'],
];

const extraOptions = {
  whale: ['الدلفين', 'الحبار العملاق'],
  whaleHeart: ['الدلفين', 'الحبار العملاق'],
  giraffe: ['الحمار الوحشي', 'الأوكابي', 'الحصان'],
  elephant: ['وحيد القرن', 'فرس النهر'],
  ostrich: ['البطريق', 'الطاووس'],
  cheetah: ['الذئب', 'الغزال'],
  tiger: ['الأسد', 'الفهد'],
  nasa: ['نبتون', 'أورانوس', 'عطارد'],
  jupiter: ['زحل', 'المريخ'],
  ganymede: ['أوروبا', 'كاليستو'],
  milky: ['مجرة المرأة المسلسلة', 'مجرة المثلث', 'مجرة الدوامة'],
  neptune: ['المشتري', 'الأرض'],
  venus: ['عطارد', 'المريخ', 'الأرض'],
  mercury: ['الزهرة', 'المريخ', 'الأرض'],
  solar: ['الزهرة', 'المريخ'],
  fifa: ['فرنسا', 'إيطاليا', 'إنجلترا'],
  fifaAllEditions: ['فرنسا', 'إسبانيا', 'الأرجنتين'],
  ifab: ['12 لاعب', '8 لاعيبة'],
  tennis: ['كرة الطائرة', 'كرة القدم'],
  olympics: ['7 حلقات', '3 حلقات'],
};

const generalQuestions = rows.map(([text, answer, choices, ref], index) => ({
  text, answer, choices, ref, category: 'general-knowledge',
  bankKey: `curated_fun_${String(index + 1).padStart(3, '0')}`,
}));
const movieQuestions = movieRows.map(([text, answer, choices, ref], index) => ({
  text, answer, choices, ref, category: 'egyptian-movies',
  bankKey: `curated_egyptian_movie_${String(index + 1).padStart(3, '0')}`,
}));

module.exports = [...generalQuestions, ...movieQuestions].map(({ text, answer, choices, ref, category, bankKey }, index) => {
  const fourChoices = [...choices];
  for (const option of extraOptions[ref] || []) {
    if (!fourChoices.includes(option)) fourChoices.push(option);
    if (fourChoices.length === 4) break;
  }
  if (fourChoices.length !== 4 || !fourChoices.includes(answer)) {
    throw new Error(`Question ${index + 1} must have exactly four choices including its answer.`);
  }
  return {
    text,
    category,
    answer,
    acceptedAnswers: [answer],
    choices: fourChoices,
    isTriviaChoice: true,
    isCustomTrivia: false,
    judgeMode: 'closed',
    judgeEvaluated: false,
    difficulty: category === 'egyptian-movies' || index < 12 ? 'easy' : 'medium',
    bankKey,
    bankVersion: 1,
    source: 'curated_primary_fact',
    sourceId: `${refs[ref][1]}:${index + 1}`,
    sourceUrl: refs[ref][0],
    sourceLicense: 'Fact independently worded; reference linked',
    sourceAttribution: refs[ref][1],
    status: 'pending',
  };
});

