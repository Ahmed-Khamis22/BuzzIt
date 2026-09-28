const CHAPTERS = [
  {
    id: 'chapter_1', title: 'البداية', description: 'أول خيوط التحقيق', order: 1,
    requiredCaseIds: ['donation_envelope', 'gala_blackout', 'forged_signatures', 'anonymous_letter', 'changed_beneficiary_names'],
    caseIds: ['donation_envelope', 'gala_blackout', 'forged_signatures', 'anonymous_letter', 'changed_beneficiary_names'],
    caseSlots: ['اختفاء ظرف التبرعات', 'فوضى الحفل الخيري', 'توقيعات مزوّرة', 'الرسالة المجهولة', 'الأسماء التي تغيّرت'],
    cases: 5, reward: { coins: 100, xp: 25 },
  },
  {
    id: 'chapter_2', title: 'قبل الزيارة', description: 'أزمات متصاعدة تهدد منحة الخير', order: 2,
    // Keep campaign progression locked by default, regardless of NODE_ENV.
    // Tests may open chapter two only through an explicit local opt-in.
    openForTesting: process.env.CASE_FILE_OPEN_CHAPTERS_FOR_TESTING === 'true',
    requiredCaseIds: ['missing_donor_laptop', 'fake_donor_call', 'forged_purchase_invoices', 'restoration_sabotage', 'false_fire_alarm'],
    caseIds: ['missing_donor_laptop', 'fake_donor_call', 'forged_purchase_invoices', 'restoration_sabotage', 'false_fire_alarm'],
    caseSlots: ['اللابتوب المفقود', 'المتبرع المزيّف', 'فواتير على الورق', 'تخريب الترميم', 'إنذار يوم الزيارة'],
    cases: 5, reward: { coins: 150, xp: 50 },
  },
];

const CASES = [
  {
    id: 'donation_envelope', chapterId: 'chapter_1', order: 1,
    title: 'اختفاء ظرف التبرعات', summary: 'اختفى ظرف التبرعات من مكتب الجمعية بين الثانية والثانية واثنتين وعشرين دقيقة.',
    description: 'اختفى ظرف التبرعات من مكتب الجمعية خلال فترة قصيرة. كان المكتب مفتوحًا للموظفين، ولم يُعثر على أثر اقتحام. افحص السجلات والأقوال لتعرف من أخذ الظرف.',
    difficulty: 'hard', location: 'مكتب الجمعية', incidentStartTime: '2:00', incidentEndTime: '2:22',
    recommendedTime: 600, maxWrongAccusations: 3, maxHints: 3, maxRewardedHints: 1,
    starThresholds: {
      threeStars: { maxTimeMultiplier: 1, maxHints: 1, maxErrors: 0 },
      twoStars: { maxTimeMultiplier: 1.5, maxHints: 2, maxErrors: 1 },
    },
    rewardedHints: ['اجمع بين وقت العملية في الإيصال، وزمن الطريق، وحركة الباب والكاميرا.'],
    rewards: { coins: 120, xp: 30, gems: 0 },
    suspects: [
      { id: 'ahmed', name: 'أحمد', occupation: 'موظف استقبال', relationToCase: 'كان على مكتب الاستقبال وقت الاختفاء.', statement: 'خرجت للمحل الساعة 2:00 ورجعت الساعة 2:10.', timeline: ['1:55 — كان عند الاستقبال', '2:00 — قال إنه خرج للمحل', '2:10 — قال إنه عاد للمكتب'], relatedEvidenceIds: ['entry-log', 'shop-receipt', 'cctv'] },
      { id: 'mona', name: 'منى', occupation: 'منسقة الجمعية', relationToCase: 'كانت تجهز ملفات التبرعات في الغرفة المجاورة.', statement: 'دخلت المكتب الساعة 2:05 لأخذ سجل، وصورت محتويات الدرج في رسالة للمدير قبل ما أرجع للملفات.', timeline: ['2:05 — دخلت المكتب', '2:07 — أرسلت صورة من داخل الدرج', '2:08 — رجعت إلى غرفة الملفات'], relatedEvidenceIds: ['entry-log', 'message', 'cctv'] },
      { id: 'khaled', name: 'خالد', occupation: 'مشرف الصيانة', relationToCase: 'مرّ بالممر لإصلاح المصباح.', statement: 'كنت في الممر فقط، وانتهيت من إصلاح المصباح قبل الثانية بعشر دقائق.', timeline: ['1:50 — سجل بدء الصيانة', '1:58 — غادر المبنى'], relatedEvidenceIds: ['cctv', 'entry-log'] },
    ],
    evidence: [
      { id: 'entry-log', type: 'record', title: 'سجل الباب', shortDescription: 'أوقات فتح وإغلاق المكتب', fullDescription: 'سجل الباب يثبت دخول بطاقة منى الساعة 2:05 وخروجها الساعة 2:08، ولا يسجل عودتها حتى نهاية الفترة. بطاقة أحمد تسجل خروجًا الساعة 2:14. تظهر حركة خروج لخالد قبل الثانية، ولا يوجد دخول جديد له بعد ذلك.', timestamp: '1:50–2:14', relatedSuspectIds: ['ahmed', 'mona', 'khaled'], important: true },
      { id: 'cctv', type: 'video', title: 'لقطة الممر', shortDescription: 'شخص خرج بملف ورجع من غيره', fullDescription: 'الصورة لا تكشف الوجه ولا محتوى الملف. عند 2:14 يظهر شخص خارجًا من ناحية المكتب حاملًا ملفًا مسطحًا، وعند 2:22 يعود من غيره. جودة اللقطة لا تسمح بتحديد هل الشخص موظف أو زائر، ولا تظهر حركة أخرى واضحة في الممر خلال الفترة.', timestamp: '2:14–2:22', relatedSuspectIds: ['ahmed', 'mona'], important: true },
      { id: 'shop-receipt', type: 'receipt', title: 'إيصال المتجر', shortDescription: 'عملية شراء في توقيت قريب من حركة الممر', fullDescription: 'الإيصال صادر الساعة 2:18 من متجر يبعد أربع دقائق على الأقل مشيًا عن الجمعية. عملية الشراء نقدية ولا تحمل اسم المشتري. التوقيت يسمح لشخص خرج الساعة 2:14 أن يصل للمتجر، لكنه لا يثبت وحده مين صاحب الإيصال.', timestamp: '2:18', relatedSuspectIds: [], important: true },
      { id: 'message', type: 'message', title: 'صورة منى للدرج', shortDescription: 'صورة أُرسلت أثناء تجهيز الملفات', fullDescription: 'رسالة منى للمدير الساعة 2:07 مرفق بها صورة لسجل التبرعات داخل الدرج. يظهر ظرف التبرعات في الصورة، لكن اللقطة لا توضح قيمته أو ما إذا كان قد تحرك بعد ذلك.', timestamp: '2:07', relatedSuspectIds: ['mona'], important: true },
    ],
    timeline: [
      { time: '2:00', text: 'بداية الفترة التي اختفى خلالها الظرف.' },
      { time: '2:05', text: 'منى دخلت المكتب للحصول على السجل.' },
      { time: '2:07', text: 'منى أرسلت رسالة تؤكد أن الظرف كان في الدرج.' },
      { time: '2:14', text: 'شخص خرج من ناحية المكتب حاملًا ملفًا مسطحًا.' },
      { time: '2:18', text: 'سُجلت عملية شراء في متجر يبعد دقائق عن الجمعية.' },
      { time: '2:22', text: 'عاد الشخص إلى المبنى من دون الملف.' },
    ],
    hints: [
      'ابدأ بتحديد آخر لحظة مؤكدة كان الظرف فيها داخل الدرج.',
      'رتّب وقت الصورة، وخروج الشخص وعودته، ووقت الإيصال. أي رواية تقدر تفسر التلاتة؟',
      'الإيصال مجهول صاحبه واللقطة مش واضحة؛ ميّز بين القرينة اللي تثبت فرصة والقرينة اللي تربط شخصًا بالتوقيت.',
    ],
    culpritId: 'ahmed', solutionExplanation: 'صورة منى تثبت أن الظرف كان في الدرج بعد دخولها. سجل الباب والكاميرا يضعان حركة الخروج اللاحقة في نافذة اختفائه، لكن اللقطة لا تكشف هوية الشخص بوجهه أو محتوى الملف. الإيصال عند 2:18 والمتجر الذي يبعد أربع دقائق لا ينسجمان مع قول أحمد إنه عاد الساعة 2:10 ولا مع عودة الشخص إلى المكتب الساعة 2:22. خالد كان قد غادر قبل بدء نافذة الاختفاء. جمع التوقيتات، لا أي دليل منفرد، هو ما يرجح أحمد.',
    supportingEvidenceIds: ['entry-log', 'cctv', 'shop-receipt', 'message'],
  },

{
    "id": "gala_blackout",
    "chapterId": "chapter_1",
    "order": 2,
    "title": "فوضى الحفل الخيري",
    "summary": "انقطاع مفاجئ في نظام الصوت أثناء حفل جمع التبرعات السنوي يحوّل الأمسية إلى فضيحة صغيرة أمام المتبرعين والصحافة.",
    "description": "في ذروة كلمة رئيسة الجمعية عن أهداف العام القادم، ينقطع الصوت فجأة في القاعة الكبرى، تحت لوحة تكريم قديمة للمؤسس الحاج سامي معلّقة على الجدار الخلفي، ثم يظهر أن جزءًا من الكابلات قد قُطع. الحدث يتزامن مع وجود متبرع كبير في الصالة كان يفترض أن يُعلن عن تبرعه على الهواء. الجمعية تريد معرفة: هل هو عطل فني عادي، أم تخريب متعمد؟",
    "difficulty": "hard",
    "location": "القاعة الكبرى - مقر جمعية الخير",
    "incidentStartTime": "19:30",
    "incidentEndTime": "19:45",
    "recommendedTime": 480,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 2,
    "starThresholds": {
      "threeStars": {
        "maxTimeMultiplier": 1.0,
        "maxHints": 0,
        "maxErrors": 0
      },
      "twoStars": {
        "maxTimeMultiplier": 1.5,
        "maxHints": 1,
        "maxErrors": 1
      }
    },
    "rewardedHints": [
      "اجمع بين سجل بطاقة الدخول وشهادة الشخص الذي ظهر قرب الستارة: هل يصفان حركة واحدة؟",
      "راجع وقت إنشاء مسودة المقال ووقت نشرها، ثم قارنهما بباقي القرائن."
    ],
    "rewards": {
      "coins": 50,
      "xp": 30,
      "gems": 0
    },
    "suspects": [
      {
        "id": "moamen_tech",
        "name": "مؤمن",
        "occupation": "متطوع مسؤول عن الصوت والإضاءة",
        "relationToCase": "كان في غرفة التحكم طوال الحفل",
        "statement": "كنت في غرفة التحكم من البداية، وما لاحظتش حاجة غريبة غير لما الصوت قطع فجأة قدامي.",
        "timeline": [
          "دخل غرفة المعدات الساعة 18:50 ولم يسجَّل خروجه بعدها.",
          "بث مباشر خلفي يُظهر يديه على منصة التحكم بشكل متواصل من 19:20 حتى بعد الحادثة.",
          "زميلته المتطوعة نورهان كانت بجانبه طوال هذه الفترة."
        ],
        "relatedEvidenceIds": [
          "access_log_equipment_room",
          "technical_report_cable",
          "backstage_livestream_footage",
          "co_volunteer_testimony"
        ]
      },
      {
        "id": "sally_reporter",
        "name": "سالي",
        "occupation": "صحفية مستقلة",
        "relationToCase": "كانت تغطي الحفل لحسابها الإخباري",
        "statement": "كنت بس بصوّر صور عامة للحضور والمسرح، ما قربتش من أي غرفة خاصة خالص.",
        "timeline": [
          "تحركت بين الصالة والمدخل خلال الأمسية حسب أقوالها.",
          "ظهرت في صورة حضور قرب الستارة بعد 19:28."
        ],
        "relatedEvidenceIds": [
          "access_log_equipment_room",
          "witness_sally_panel",
          "fast_published_article"
        ]
      },
      {
        "id": "kareem_treasurer",
        "name": "كريم",
        "occupation": "أمين صندوق الجمعية",
        "relationToCase": "يقول إنه كان يتحدث مع أحد كبار المتبرعين وقت الحادثة",
        "statement": "كنت واقف جنب المسرح بالظبط باكلم الأستاذ سامح عن التبرع، وشهود كتير شافوني.",
        "timeline": [
          "يقول إنه تحدث مع أحد كبار المتبرعين قرب المسرح من 19:20 حتى بعد العطل."
        ],
        "relatedEvidenceIds": ["donor_stage_feed"]
      },
      {
        "id": "morad_contractor",
        "name": "المهندس مراد",
        "occupation": "مقاول ترميم مبنى الجمعية",
        "relationToCase": "كان يعمل في الطابق العلوي وقت الحفل",
        "statement": "أنا وفريقي كنا فوق بنكمل شغل الترميم، ما لناش أي دعوة بجهاز الصوت تحت.",
        "timeline": [
          "سجل الدخول يوضح تواجده وفريقه في منطقة الترميم بالطابق العلوي فقط طوال المساء.",
          "لا يوجد أي تسجيل دخول له أو لفريقه في غرفة المعدات."
        ],
        "relatedEvidenceIds": [
          "access_log_equipment_room"
        ]
      }
    ],
    "evidence": [
      {
        "id": "cut_mic_cable",
        "type": "physical",
        "title": "كابل صوت مقطوع",
        "shortDescription": "كابل رئيسي به قطع نظيف وليس تلفًا طبيعيًا",
        "fullDescription": "الكابل الذي تسبب في الانقطاع به قطع مستقيم وحاد، لا يشبه التمزق الناتج عن قدم أو كرسي، بل أقرب لقطع بأداة حادة.",
        "timestamp": "19:32",
        "relatedSuspectIds": [],
        "important": true
      },
      {
        "id": "access_log_equipment_room",
        "type": "document",
        "title": "سجل دخول غرفة المعدات",
        "shortDescription": "بطاقات الدخول قبل العطل",
        "fullDescription": "السجل يوضح أن مؤمن دخل الساعة 18:50 ولم يسجَّل خروجه. بطاقة الصحافة رقم P-03 فتحت باب غرفة المعدات الساعة 19:27. سجل التوزيع يثبت استلام سالي للبطاقة، لكنه لا يسجل إن كانت أعارتها لحد. مراد وفريقه مسجَّل دخولهم لمنطقة الترميم بالطابق العلوي فقط.",
        "timestamp": "18:50 - 19:32",
        "relatedSuspectIds": [
          "moamen_tech",
          "sally_reporter",
          "morad_contractor"
        ],
        "important": true
      },
      {
        "id": "witness_sally_panel",
        "type": "testimony",
        "title": "شهادة من قرب الستارة",
        "shortDescription": "شاهد لمح شخصًا بكاميرا صحفية قرب لوحة التوصيلات",
        "fullDescription": "أحد المتطوعين لمح شخصًا بكاميرا صحفية قرب الستارة خلف لوحة التوصيلات عند 19:28، لكنه لم يستطع تمييز الوجه أو نوع الكاميرا. غادر الشخص المكان بعد أقل من دقيقتين؛ والشهادة وحدها لا تثبت أن حامل البطاقة هو نفس الشخص.",
        "timestamp": "19:28",
        "relatedSuspectIds": [
          "sally_reporter"
        ],
        "important": true
      },
      {
        "id": "fast_published_article",
        "type": "digital",
        "title": "سجل تعديلات المقال",
        "shortDescription": "ملف المقال حُفظ قبل الانقطاع ثم نُشر بعده",
        "fullDescription": "بيانات الملف تظهر أن مسودة المقال حُفظت أول مرة الساعة 19:05، ثم عُدلت بعد انقطاع الصوت ونُشرت الساعة 19:42. النسخة الأولى تتناول ارتباك الحفل فقط؛ وصف مكان الكابلات وسبب القطع ظهر في تعديل بعد الواقعة، قبل إعلان التقرير الفني.",
        "timestamp": "19:42",
        "relatedSuspectIds": [
          "sally_reporter"
        ],
        "important": true
      },
      {
        "id": "technical_report_cable",
        "type": "document",
        "title": "تقرير فني عن سبب العطل",
        "shortDescription": "يستبعد التلف الطبيعي أو تقصير مؤمن",
        "fullDescription": "تقرير فني من فريق صيانة خارجي يؤكد أن سبب العطل قطع متعمد بأداة حادة، وليس تلفًا ناتجًا عن قِدم الكابلات أو سوء استخدام، ما يستبعد إهمال مؤمن كسبب للحادثة.",
        "timestamp": "20:15",
        "relatedSuspectIds": [
          "moamen_tech"
        ],
        "important": true
      },
      {
        "id": "backstage_livestream_footage",
        "type": "digital",
        "title": "تسجيل البث المباشر الخلفي",
        "shortDescription": "يُظهر يدي مؤمن على منصة التحكم بلا انقطاع",
        "fullDescription": "كاميرا داخلية كانت تبث لحظيًا عمل مؤمن على منصة الصوت لأغراض المتابعة الفنية. التسجيل يُظهر يديه على المنصة بشكل متواصل من الساعة 19:20 حتى ما بعد انقطاع الصوت، ولا يظهر أي اقتراب من لوحة التوصيلات الموجودة خلف الستارة على الجانب الآخر من الغرفة.",
        "timestamp": "19:20 - 19:34",
        "relatedSuspectIds": [
          "moamen_tech"
        ],
        "important": true
      },
      {
        "id": "co_volunteer_testimony",
        "type": "testimony",
        "title": "شهادة زميلة متطوعة",
        "shortDescription": "تؤكد أن مؤمن لم يغادر منصة التحكم لحظة",
        "fullDescription": "المتطوعة نورهان، التي كانت تساعد مؤمن في غرفة المعدات، تفيد بأنه لم يبتعد عن منصة الصوت ولم يقترب من لوحة التوصيلات طوال الوقت الذي كانت معه فيه، بما يشمل وقت الحادثة.",
        "timestamp": "19:20 - 19:32",
        "relatedSuspectIds": [
          "moamen_tech"
        ],
        "important": true
      },
      {
        "id": "donor_stage_feed",
        "type": "digital",
        "title": "بث المنصة",
        "shortDescription": "كريم ظاهر قرب المتبرع أثناء فترة الانقطاع",
        "fullDescription": "لقطة البث المتصل للمنصة بين 19:20 و19:34 تُظهر كريم بجوار الأستاذ سامح طوال كلمة الإعلان، بما فيها لحظة انقطاع الصوت.",
        "timestamp": "19:20–19:34",
        "relatedSuspectIds": ["kareem_treasurer"],
        "important": true
      },
      {
        "id": "old_founder_plaque",
        "type": "testimony",
        "title": "ملاحظة عابرة عن اللوحة التذكارية",
        "shortDescription": "أحد الحضور يذكر لوحة تكريم المؤسس القديمة أثناء الفوضى",
        "fullDescription": "أثناء محاولة السيطرة على الفوضى بعد انقطاع الصوت، ذكر أحد كبار المتطوعين أنه لاحظ اهتزاز لوحة تكريم الحاج سامي المعلّقة خلف المسرح، وتمنى لو كانت الجمعية اهتمت بصيانتها منذ سنوات. لا علاقة لهذه الملاحظة بسبب انقطاع الصوت.",
        "timestamp": "19:35",
        "relatedSuspectIds": [],
        "important": false
      }
    ],
    "timeline": [
      {
        "time": "18:50",
        "text": "مؤمن يدخل غرفة المعدات ويبدأ ضبط الصوت."
      },
      {
        "time": "19:20",
        "text": "بداية كلمة رئيسة الجمعية، وبداية بث الكاميرا الخلفية لمتابعة عمل مؤمن."
      },
      {
        "time": "19:27",
        "text": "تُسجل حركة دخول إلى غرفة المعدات قبل انقطاع الصوت."
      },
      {
        "time": "19:28",
        "text": "شاهد يلمح شخصًا قرب الستارة خلف المسرح."
      },
      {
        "time": "19:32",
        "text": "انقطاع الصوت المفاجئ بسبب قطع الكابل."
      },
      {
        "time": "19:42",
        "text": "نُشرت تغطية للحفل بعد الانقطاع بعشر دقائق."
      }
    ],
    "hints": [
      "حدد أولًا إذا كان الانقطاع عطلًا أم فعلًا متعمدًا.",
      "اجمع بين سجل بطاقة الدخول وشهادة الشاهد؛ لا تعتمد على أيٍّ منهما منفردًا.",
      "قارن أول نسخة من المقال بما ظهر للناس وقت الحفل، مش بوقت النشر بس."
    ],
    "culpritId": "sally_reporter",
    "solutionExplanation": "تقرير الكابل يثبت أن الانقطاع لم ينتج عن تلف عادي. سجل بطاقة P-03 يضع بطاقة الصحافة في غرفة المعدات قبل الواقعة، وشاهد آخر رأى حامل كاميرا صحفية قرب التوصيلات من دون أن يتعرف على الوجه. البطاقة كانت بعهدة سالي، وهي نفت دخول أي غرفة خاصة؛ كما بدأ ملف مقالها قبل الانقطاع ثم عُدّل بعده. لا يثبت أي دليل منفرد أنها قطعت الكابل، لكن اجتماع الحركة والتوقيت وسجل المقال يرجحها. البث الخلفي وشهادة نورهان يضعان مؤمن عند منصة التحكم، وبث المنصة يضع كريم بجوار المتبرع، بينما لم يدخل مراد غرفة المعدات.",
    "supportingEvidenceIds": [
      "cut_mic_cable",
      "technical_report_cable",
      "backstage_livestream_footage",
      "co_volunteer_testimony",
      "access_log_equipment_room",
      "witness_sally_panel",
      "fast_published_article",
      "donor_stage_feed"
    ]
  },
  {
    "id": "forged_signatures",
    "chapterId": "chapter_1",
    "order": 3,
    "title": "توقيعات مزوّرة",
    "summary": "سجل حضور يوم التنظيف الجماعي يظهر عددًا من الأسماء أكبر بكثير من العدد الحقيقي الذي حضر فعليًا طوال اليوم.",
    "description": "عند تجهيز تقرير الأنشطة لمنحة الخير، تلاحظ منى أن سجل حضور \"يوم التنظيف الجماعي\" الذي قدّمه يوسف يحوي 42 توقيعًا، بينما يُظهر سجل تسجيل الوصول الفردي عند البوابة، الذي يوثّق كل من حضر فعليًا في أي وقت خلال اليوم، 34 اسمًا فريدًا فقط. يجب معرفة من أضاف الفارق (8 أسماء) ولماذا.",
    "difficulty": "hard",
    "location": "مقر الجمعية - مكتب التوثيق",
    "incidentStartTime": "08:00",
    "incidentEndTime": "12:30",
    "recommendedTime": 540,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 2,
    "starThresholds": {
      "threeStars": {
        "maxTimeMultiplier": 1.0,
        "maxHints": 0,
        "maxErrors": 0
      },
      "twoStars": {
        "maxTimeMultiplier": 1.5,
        "maxHints": 1,
        "maxErrors": 1
      }
    },
    "rewardedHints": [
      "احسب الفارق بالضبط بين عدد توقيعات تقرير يوسف وعدد الأسماء الفريدة في سجل البوابة - هل يطابق عدد التوقيعات المتشابهة خطيًا؟",
      "رسالة يوسف على مجموعة الفريق قبل الفعالية تطلب تسجيل الغائبين صراحة."
    ],
    "rewards": {
      "coins": 55,
      "xp": 35,
      "gems": 0
    },
    "suspects": [
      {
        "id": "youssef_team_lead",
        "name": "يوسف",
        "occupation": "قائد فريق المتطوعين الشباب",
        "relationToCase": "مسؤول عن جمع توقيعات فريقه في السجل",
        "statement": "الفريق بتاعنا اشتغل بجد يوم التنظيف، والرقم اللي في السجل صحيح على حد علمي.",
        "timeline": [
          "جمع سجل فريقه بنفسه وسلّمه لمنى الساعة 12:15.",
          "أرسل رسالة على مجموعة الفريق مساء اليوم السابق يطلب فيها تسجيل الأسماء حتى لو الشخص غائب."
        ],
        "relatedEvidenceIds": [
          "handwriting_match_signatures",
          "witness_denies_names",
          "youssef_chat_message",
          "youssef_handwriting_sample"
        ]
      },
      {
        "id": "mona",
        "name": "منى",
        "occupation": "منسقة المتطوعين",
        "relationToCase": "هي من لاحظت التناقض وأبلغت عنه",
        "statement": "أنا اللي لاحظت إن العدد غريب لما قارنت بسجل البوابة، وسلمت السجل زي ما استلمته من الفرق من غير ما أدقق وقتها.",
        "timeline": [
          "استلمت السجل النهائي من يوسف الساعة 12:30 دون فحص فوري.",
          "قارنت السجل بسجل تسجيل الوصول عند البوابة بعد يومين فلاحظت الفارق."
        ],
        "relatedEvidenceIds": [
          "entry_desk_sign_in_log"
        ]
      },
      {
        "id": "ahmed",
        "name": "أحمد",
        "occupation": "موظف استقبال",
        "relationToCase": "يقول إنه كان مكلفًا بجرد المخزن طوال صباح الحدث",
        "statement": "أنا كنت جوه المخزن بجرد الأدوات طول الصبح، حتى ما شاركتش في التنظيف نفسه ولا قربت من ورقة التوقيعات.",
        "timeline": [
          "يفيد بأنه قضى الصباح داخل المخزن، لكن لا يوجد دليل مستقل في هذه القضية يثبت ذلك."
        ],
        "relatedEvidenceIds": []
      },
      {
        "id": "kareem_treasurer",
        "name": "كريم",
        "occupation": "أمين صندوق الجمعية",
        "relationToCase": "يراجع أرقام الحضور لتقرير المنحة",
        "statement": "أنا باستلم الأرقام النهائية بس عشان أحطها في التقرير، ما ليش دعوة بجمع التوقيعات نفسها.",
        "timeline": [
          "يفيد بأنه كان في البنك بين 9:00 و11:00، لكن لا يوجد دليل مستقل في هذه القضية يثبت ذلك."
        ],
        "relatedEvidenceIds": []
      }
    ],
    "evidence": [
      {
        "id": "entry_desk_sign_in_log",
        "type": "document",
        "title": "سجل تسجيل الوصول الفردي عند البوابة",
        "shortDescription": "يحصي كل من حضر فعليًا طوال اليوم",
        "fullDescription": "سجل منفصل عن ورقة توقيعات فريق يوسف، حيث وقّع كل متطوع بنفسه عند وصوله الفعلي للبوابة مع تسجيل وقت الدخول، من بداية الفعالية الساعة 8:00 وحتى نهايتها 12:00. مراجعة السجل بالكامل، وليس في لحظة واحدة فقط، تُظهر 34 اسمًا فريدًا لأشخاص حضروا فعليًا في أي وقت خلال اليوم.",
        "timestamp": "08:00 - 12:00",
        "relatedSuspectIds": [],
        "important": true
      },
      {
        "id": "handwriting_match_signatures",
        "type": "document",
        "title": "ملاحظات على التوقيعات",
        "shortDescription": "تكرار في طريقة كتابة بعض الحروف",
        "fullDescription": "في مجموعة من الأسماء الإضافية، تتكرر طريقة رسم حرفين وضغط القلم في مواضع متشابهة. الملاحظات وحدها لا تحدد الكاتب؛ يلزم مقارنتها بعينة خط موثقة وبعدد الحضور الفعلي.",
        "timestamp": "بعد الحدث بيومين",
        "relatedSuspectIds": [
          "youssef_team_lead"
        ],
        "important": true
      },
      {
        "id": "youssef_handwriting_sample",
        "type": "document",
        "title": "عينة خط يد سابقة ليوسف",
        "shortDescription": "مرجع للمقارنة الخطية",
        "fullDescription": "نسخة من سجل حضور فعالية سابقة معروف أنها بخط يوسف بالكامل، استُخدمت كمرجع لمقارنة أسلوب الكتابة مع التوقيعات المشكوك بها في سجل هذه الفعالية.",
        "timestamp": "فعالية سابقة",
        "relatedSuspectIds": [
          "youssef_team_lead"
        ],
        "important": false
      },
      {
        "id": "witness_denies_names",
        "type": "testimony",
        "title": "شهادة متطوع ينكر معرفة أسماء من فريقه",
        "shortDescription": "لا يعرف بعض الأسماء المسجلة ضمن فريقه",
        "fullDescription": "أحد أعضاء فريق يوسف الحاضرين فعليًا يفيد بأنه لا يعرف عدة أسماء مسجلة ضمن نفس فريقه في السجل، رغم أنه كان معهم طوال الوقت.",
        "timestamp": "بعد الحدث بيوم",
        "relatedSuspectIds": [
          "youssef_team_lead"
        ],
        "important": true
      },
      {
        "id": "youssef_chat_message",
        "type": "digital",
        "title": "رسالة على مجموعة الفريق",
        "shortDescription": "رسالة عن ترتيب الفريق في تقرير الفعالية",
        "fullDescription": "رسالة يوسف قبل الحدث تقول: \"راجعوا كشف الفريق قبل التسليم، وخلوه يعكس شغلنا طول اليوم\". ممكن تكون طلبًا عاديًا بمراجعة الكشف؛ الرسالة لا تطلب إضافة أسماء ولا تزوير توقيع.",
        "timestamp": "اليوم السابق للحدث، 21:10",
        "relatedSuspectIds": [
          "youssef_team_lead"
        ],
        "important": true
      },
      {
        "id": "old_mural_restoration_note",
        "type": "testimony",
        "title": "ملاحظة عن جدارية قديمة",
        "shortDescription": "أحد المتطوعين يذكر أثناء التنظيف جدارية قديمة بجوار مدخل الجمعية",
        "fullDescription": "أثناء تنظيف الفناء الخارجي، لاحظ أحد المتطوعين أن الجدارية القديمة التي تحمل اسم عائلة الحاج سامي بدأت تتآكل ألوانها، واقترح أن تُدرَج ضمن أعمال الترميم القادمة. لا علاقة لهذه الملاحظة بموضوع التوقيعات.",
        "timestamp": "10:15",
        "relatedSuspectIds": [],
        "important": false
      }
    ],
    "timeline": [
      {
        "time": "08:00",
        "text": "بدء فعالية التنظيف الجماعي وبدء تسجيل الوصول الفردي عند البوابة."
      },
      {
        "time": "12:00",
        "text": "انتهاء الفعالية."
      },
      {
        "time": "12:15",
        "text": "يوسف يسلّم سجل حضور فريقه (42 توقيعًا) لمنى."
      },
      {
        "time": "12:30",
        "text": "منى تستلم السجل الكامل دون فحص فوري."
      },
      {
        "time": "بعد يومين",
        "text": "منى تقارن السجل بسجل البوابة الفردي وتلاحظ فارق 8 أسماء."
      }
    ],
    "hints": [
      "قارن عدد الأسماء الفريدة في سجل البوابة الفردي، الذي يغطي اليوم كله، بعدد التوقيعات في تقرير الفريق.",
      "ابحث عن نمط متكرر بين أسماء يفترض أن أصحابها كتبوا بأنفسهم.",
      "اجمع مقارنة الخط مع السجل المستقل والرسالة، ولا تجعل الدافع وحده دليلًا."
    ],
    "culpritId": "youssef_team_lead",
    "solutionExplanation": "مقارنة البوابة المستقلة تكشف أن ثمانية أسماء في كشف الفريق لم يحضروا. عينة الخط الموثقة تربط أسلوب كتابة هذه الأسماء بيوسف، ورسالة ترتيب التقرير تفسر ضغطه لإظهار فريقه بعدد أكبر من الفرق الأخرى من دون أن تكون اعترافًا بالتزوير. اجتماع العدد غير المتطابق، ونمط الخط، ورسالة ما قبل التسليم هو ما يحدد المسؤول.",
    "supportingEvidenceIds": [
      "entry_desk_sign_in_log",
      "handwriting_match_signatures",
      "youssef_handwriting_sample",
      "witness_denies_names",
      "youssef_chat_message"
    ]
  },
  {
    "id": "anonymous_letter",
    "chapterId": "chapter_1",
    "order": 4,
    "title": "الرسالة المجهولة",
    "summary": "رسالة مجهولة المصدر تصل للجنة منحة الخير تتهم الجمعية بسوء إدارة التبرعات، قبل أسابيع من زيارة التقييم.",
    "description": "تصل رسالة مطبوعة دون توقيع أو عنوان مرسل إلى لجنة منحة الخير، تتهم الجمعية بصرف جزء من التبرعات بشكل غير واضح، وتذكر تفصيلاً داخليًا دقيقًا عن الميزانية. يجب معرفة من كتب الرسالة قبل أن تؤثر على قرار المنحة.",
    "difficulty": "hard",
    "location": "مكتب الجمعية - جهاز الكمبيوتر والطابعة المشتركة",
    "incidentStartTime": "الأحد 22:30",
    "incidentEndTime": "الثلاثاء (تاريخ استلام الرسالة)",
    "recommendedTime": 720,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 2,
    "starThresholds": {
      "threeStars": {
        "maxTimeMultiplier": 1.0,
        "maxHints": 0,
        "maxErrors": 0
      },
      "twoStars": {
        "maxTimeMultiplier": 1.5,
        "maxHints": 1,
        "maxErrors": 1
      }
    },
    "rewardedHints": [
      "قارن أسلوب كتابة الرسالة برسائل سابقة معروف مرسلها.",
      "تحقق من مكان كل مشتبه به ليلة الأحد تحديدًا وقت طباعة الرسالة."
    ],
    "rewards": {
      "coins": 70,
      "xp": 45,
      "gems": 0
    },
    "suspects": [
      {
        "id": "hala_former_volunteer",
        "name": "هالة",
        "occupation": "متطوعة سابقة",
        "relationToCase": "تركت مسؤوليتها عن أحد المشاريع قبل شهر بعد قرار عدم تجديدها",
        "statement": "أنا سبت التطوع بس عشان مشغوليتي، مش ليا أي دعوة بأي رسالة اتبعتت للجنة.",
        "timeline": [
          "سجّل الممر المؤدي لمكتب الطابعة بطاقة زائر صادرة باسمها في نفس الفترة.",
          "ظلت مشتركة في القائمة البريدية الداخلية رغم مغادرتها الرسمية قبل شهر."
        ],
        "relatedEvidenceIds": [
          "printer_usage_log",
          "late_access_badge",
          "internal_budget_detail",
          "friend_testimony_hala",
          "writing_style_comparison"
        ]
      },
      {
        "id": "youssef_team_lead",
        "name": "يوسف",
        "occupation": "قائد فريق المتطوعين الشباب",
        "relationToCase": "كان في حالة توتر مع الإدارة بعد قضية التوقيعات",
        "statement": "أنا مش عارف حاجة عن البند المالي ده أصلاً، ولا وصلتني أي تفاصيل عنه.",
        "timeline": [
          "لم يكن مشتركًا في القائمة البريدية التي تضمنت التفصيل المالي المذكور في الرسالة."
        ],
        "relatedEvidenceIds": []
      },
      {
        "id": "kareem_treasurer",
        "name": "كريم",
        "occupation": "أمين صندوق الجمعية",
        "relationToCase": "البند المالي المذكور في الرسالة من ضمن مسؤولياته",
        "statement": "أنا نفسي سألت عن نفس البند ده في الاجتماع العلني الأسبوع اللي فات، مالوش داعي أكتب رسالة مجهولة بنفس الموضوع.",
        "timeline": [
          "سأل عن نفس البند المالي علنًا في اجتماع سابق للجمعية."
        ],
        "relatedEvidenceIds": [
          "kareem_public_question"
        ]
      },
      {
        "id": "morad_contractor",
        "name": "المهندس مراد",
        "occupation": "مقاول ترميم مبنى الجمعية",
        "relationToCase": "له دخول شبه يومي لمبنى الجمعية",
        "statement": "أنا كنت في مدينة تانية بموقع شغل مختلف ليلة الأحد دي، عندي فاتورة فندق تثبت كده.",
        "timeline": [
          "كان في مدينة أخرى بموقع عمل مختلف ليلة الأحد، بحسب فاتورة فندق مؤرخة."
        ],
        "relatedEvidenceIds": [
          "hotel_invoice_morad"
        ]
      }
    ],
    "evidence": [
      {
        "id": "letter_printed_analysis",
        "type": "document",
        "title": "تحليل طباعة الرسالة",
        "shortDescription": "طُبعت على طابعة الجمعية الداخلية",
        "fullDescription": "خط عيب معروف في طابعة مكتب الجمعية (خط باهت متكرر في كل صفحة) يظهر بوضوح في نسخة الرسالة المرسلة للجنة، ما يؤكد أنها طُبعت على جهاز الجمعية وليس من الخارج.",
        "timestamp": "غير محدد بدقة",
        "relatedSuspectIds": [],
        "important": true
      },
      {
        "id": "printer_usage_log",
        "type": "document",
        "title": "سجل استخدام جهاز المكتب",
        "shortDescription": "استخدام ليلي بعد ساعات العمل الرسمية",
        "fullDescription": "سجل الطابعة يثبت خروج مهمة من حساب المتطوعين المشترك بين 22:30 و22:50 ليلة الأحد. الحساب لا يسجل اسم المستخدم، ولا يحدد وحده من كان أمام الجهاز. الرسالة اتبعت للجنة صباح الاثنين، ووصلت الثلاثاء.",
        "timestamp": "22:30 - 22:50",
        "relatedSuspectIds": [
          "hala_former_volunteer",
          "kareem_treasurer"
        ],
        "important": true
      },
      {
        "id": "late_access_badge",
        "type": "record",
        "title": "سجل بطاقة الدخول المسائية",
        "shortDescription": "بطاقة زائر دخلت قرب وقت الطباعة",
        "fullDescription": "بطاقة الزائر V-14 فتحت باب الممر المؤدي إلى مكتب الطابعة الساعة 22:27، ثم خرجت من المقر الساعة 22:52. سجل تسليم البطاقات يربطها بهالة، لكن لا توجد كاميرا داخل المكتب تثبت ما فعلته هناك.",
        "timestamp": "الأحد 22:27–22:52",
        "relatedSuspectIds": ["hala_former_volunteer"],
        "important": true
      },
      {
        "id": "internal_budget_detail",
        "type": "document",
        "title": "تفصيل ميزانية داخلي",
        "shortDescription": "رقم بند لم يُعلن إلا لقائمة بريدية محدودة",
        "fullDescription": "الرسالة تذكر رقم البند المالي (214) بدقة، وهو تفصيل لم يُرسل إلا ضمن تقرير داخلي لقائمة بريدية صغيرة من الأعضاء والمتطوعين السابقين المسؤولين عن مشاريع محددة، وكانت هالة لا تزال مشتركة بها رغم مغادرتها.",
        "timestamp": "الأسبوع السابق للرسالة",
        "relatedSuspectIds": [
          "hala_former_volunteer"
        ],
        "important": true
      },
      {
        "id": "friend_testimony_hala",
        "type": "testimony",
        "title": "شهادة صديقة لهالة",
        "shortDescription": "تؤكد غضبها الشديد من قرار الجمعية",
        "fullDescription": "صديقة مقربة لهالة تقول إنها تضايقت من عدم تجديد دورها في أحد المشاريع الشهر الماضي. لم تسمع منها تهديدًا بإرسال رسالة أو نشر معلومات داخلية.",
        "timestamp": "قبل الرسالة بأسبوعين",
        "relatedSuspectIds": [
          "hala_former_volunteer"
        ],
        "important": true
      },
      {
        "id": "kareem_public_question",
        "type": "document",
        "title": "محضر اجتماع علني",
        "shortDescription": "كريم سأل عن نفس البند علنًا قبل الرسالة",
        "fullDescription": "محضر اجتماع موثّق يُظهر أن كريم سأل علنًا عن البند المالي رقم 214 قبل وصول الرسالة بأيام؛ أي إن معرفته بهذا الرقم لا تثبت وحدها أنه مصدر الرسالة.",
        "timestamp": "قبل الرسالة بخمسة أيام",
        "relatedSuspectIds": [
          "kareem_treasurer"
        ],
        "important": false
      },
      {
        "id": "writing_style_comparison",
        "type": "document",
        "title": "مقارنة أسلوب الكتابة",
        "shortDescription": "عبارات الرسالة تشبه أسلوب هالة في رسائل سابقة",
        "fullDescription": "مقارنة نص الرسالة المجهولة برسائل سابقة كانت هالة ترسلها لمجموعة المتطوعين قبل استقالتها تُظهر تشابهًا واضحًا في اختيار الكلمات وطريقة الصياغة.",
        "timestamp": "غير محدد",
        "relatedSuspectIds": [
          "hala_former_volunteer"
        ],
        "important": true
      },
      {
        "id": "hotel_invoice_morad",
        "type": "document",
        "title": "فاتورة فندق مراد",
        "shortDescription": "تثبت تواجده خارج المدينة ليلة كتابة الرسالة",
        "fullDescription": "فاتورة فندق باسم المهندس مراد، مؤرخة ليلة الأحد، تثبت تسجيل دخوله لفندق في مدينة أخرى الساعة 21:00 وخروجه صباح الاثنين، بما يستبعد وجوده في مكتب الجمعية وقت طباعة الرسالة الساعة 22:30.",
        "timestamp": "الأحد 21:00 - الاثنين صباحًا",
        "relatedSuspectIds": [
          "morad_contractor"
        ],
        "important": true
      },
      {
        "id": "building_history_remark",
        "type": "testimony",
        "title": "ملاحظة عابرة عن تاريخ المبنى",
        "shortDescription": "عضو قديم يذكر أن مبنى الجمعية كان تبرعًا شخصيًا من عائلة الحاج سامي",
        "fullDescription": "أثناء التحقيق، ذكر أحد أعضاء مجلس الإدارة القدامى بشكل عابر أن مبنى الجمعية بأكمله كان تبرعًا من الحاج سامي، جد المهندس مراد، منذ عقود، وأن \"القصة الكاملة وراء التبرع محدش فاكرها كويس دلوقتي\". لا علاقة لهذه الملاحظة بموضوع الرسالة المجهولة.",
        "timestamp": "أثناء التحقيق",
        "relatedSuspectIds": [],
        "important": false
      }
    ],
    "timeline": [
      {
        "time": "قبل شهر",
        "text": "قرار الجمعية بعدم تجديد دور هالة في أحد المشاريع."
      },
      {
        "time": "الأربعاء (الأسبوع السابق للرسالة)",
        "text": "إرسال تقرير داخلي يحوي رقم البند 214 لقائمة بريدية محدودة."
      },
      {
        "time": "الأحد 21:00",
        "text": "مراد يسجّل دخوله لفندق في مدينة أخرى."
      },
      {
        "time": "الأحد 22:30",
        "text": "بطاقة زائر تدخل المقر وتُسجل مهمة طباعة من الحساب المشترك؛ الرسالة تُرسل للجنة صباح الاثنين."
      },
      {
        "time": "الثلاثاء",
        "text": "لجنة المنحة تستلم الرسالة المجهولة."
      }
    ],
    "hints": [
      "سجل الطابعة لا يكشف اسم المستخدم. ابحث عمّن كان داخل المقر وقت المهمة.",
      "قارن من وصلهم التفصيل المالي مع من عرفه في اجتماع علني.",
      "اجمع بين فرصة الدخول، وأسلوب الرسالة، والدافع من غير اعتبار أي واحدة حاسمة بمفردها."
    ],
    "culpritId": "hala_former_volunteer",
    "solutionExplanation": "تحليل الطباعة يثبت أن الرسالة خرجت من جهاز الجمعية، وسجل الطابعة يحدد وقت المهمة فقط من دون اسم المستخدم. عند مطابقته بسجل بطاقة الزائر، تظهر هالة داخل المقر في الفترة نفسها. هالة كانت ضمن القائمة التي وصلها رقم البند، وتكشف مقارنة الأسلوب صلة بصياغتها؛ أما يوسف فلم تصله المعلومة، ومراد كان خارج المدينة. اجتماع وقت الدخول، والوصول للتفصيل، وأسلوب الرسالة هو ما يرجح هالة، مع بقاء كل قرينة منفردة غير كافية.",
    "supportingEvidenceIds": [
      "letter_printed_analysis",
      "printer_usage_log",
      "late_access_badge",
      "internal_budget_detail",
      "friend_testimony_hala",
      "writing_style_comparison",
      "hotel_invoice_morad"
    ]
  },
  {
    "id": "changed_beneficiary_names",
    "chapterId": "chapter_1",
    "order": 5,
    "title": "الأسماء التي تغيّرت",
    "summary": "تكتشف منى حذف أسرتين مستحقتين من قائمة المساعدات وإضافة اسمين بلا اعتماد ميداني.",
    "description": "قبل زيارة لجنة منحة الخير، تراجع منى قائمة الأسر المستفيدة فتجد اسمين معتمدين اختفيا، واسمين جديدين أُضيفا من دون المرور بإجراءات التقييم المعتادة. كما أن مبلغ مساعدة إحدى الأسرتين الجديدتين أعلى من المتوسط بلا مستند يبرره. المطلوب معرفة من عدّل القائمة ولماذا.",
    "difficulty": "hard",
    "location": "مكتب التوثيق والبيانات - جمعية الخير",
    "incidentStartTime": "مساء اليوم السابق",
    "incidentEndTime": "صباح يوم المراجعة",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": {
      "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 },
      "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 }
    },
    "rewardedHints": [
      "الجهاز مشترك، لكن سجل الحفظ مربوط بحساب واحد. قارن صاحب الحساب بدافع محتمل وبغياب أوراق الاعتماد."
    ],
    "rewards": { "coins": 50, "xp": 30, "gems": 0 },
    "suspects": [
      {
        "id": "reem_archivist",
        "name": "ريم",
        "occupation": "موظفة الأرشفة والبيانات",
        "relationToCase": "تتولى تحديث القائمة الرقمية بعد اعتماد الطلبات.",
        "statement": "أنا نفّذت التعديلات المكتوبة اللي وصلتني، وما ضفتش أسماء من نفسي.",
        "timeline": ["مساء يوم التعديل — دخلت إلى النظام خارج ساعات العمل.", "صباح المراجعة — قالت إنها نفّذت تعليمات مكتوبة."],
        "relatedEvidenceIds": ["system_access_log", "new_names_no_approval", "reem_family_link", "coworker_testimony"]
      },
      {
        "id": "hassan_social_worker",
        "name": "الأستاذ حسن",
        "occupation": "الأخصائي الاجتماعي",
        "relationToCase": "يعتمد الأسر الجديدة بعد التقييم الميداني.",
        "statement": "ما اعتمدتش أي أسرة جديدة الشهر ده. كنت في زيارة ميدانية وقت التعديل.",
        "timeline": ["قبل شهرين — اعتمد الأسرتين المحذوفتين بعد تقييمهما.", "مساء يوم التعديل — زار أسرة أخرى خارج مقر الجمعية."],
        "relatedEvidenceIds": ["old_approved_list", "new_names_no_approval", "hassan_field_visit"]
      },
      {
        "id": "kareem_treasurer",
        "name": "كريم",
        "occupation": "أمين صندوق الجمعية",
        "relationToCase": "يراجع مبالغ المساعدات المصروفة.",
        "statement": "أنا اللي لاحظت الزيادة في المبلغ وبلغت عنها أول ما راجعت الحسابات.",
        "timeline": ["بعد أيام من التعديل — اكتشف الزيادة أثناء المراجعة الدورية وأبلغ عنها."],
        "relatedEvidenceIds": ["system_access_log", "raised_payment_record"]
      },
      {
        "id": "fatma_beneficiary",
        "name": "الحاجة فاطمة",
        "occupation": "ممثلة أسرة مستفيدة",
        "relationToCase": "أسرتها من الأسرتين اللتين حُذف اسماهما.",
        "statement": "مساعدتنا اتقطعت من غير إخطار. عايزة أعرف مين شطب اسمنا وليه.",
        "timeline": ["بعد اكتشاف الحذف — حضرت للجمعية واعترضت ونشرت تعليقًا غاضبًا."],
        "relatedEvidenceIds": ["fatma_social_post", "old_approved_list"]
      }
    ],
    "evidence": [
      {
        "id": "system_access_log",
        "type": "record",
        "title": "سجل دخول النظام",
        "shortDescription": "دخول إلى جهاز تحديث القائمة مساءً",
        "fullDescription": "سجل النظام يوضح أن جلسة ريم فتحت ملف القائمة وحفظت نسخة جديدة مساء اليوم السابق للمراجعة، خارج ساعات العمل ومن دون مهمة مسندة لها. الجهاز مشترك، فالسجل يربط التعديل بحسابها لكنه لا يثبت وحده مين كان قدام الشاشة أو سبب التغيير.",
        "timestamp": "مساء اليوم السابق",
        "relatedSuspectIds": ["reem_archivist", "hassan_social_worker", "kareem_treasurer"],
        "important": true
      },
      {
        "id": "old_approved_list",
        "type": "document",
        "title": "نسخة القائمة المعتمدة",
        "shortDescription": "تثبت اعتماد الأسرتين قبل حذفهما",
        "fullDescription": "نسخة ورقية مؤرخة قبل شهرين تحمل توقيع الأستاذ حسن، وتظهر فيها الأسرتان اللتان اختفى اسماهما من القائمة الحالية بصفتهما مستفيدتين معتمدتين.",
        "timestamp": "قبل شهرين",
        "relatedSuspectIds": ["hassan_social_worker", "fatma_beneficiary"],
        "important": true
      },
      {
        "id": "new_names_no_approval",
        "type": "document",
        "title": "ملف الأسماء الجديدة",
        "shortDescription": "لا توجد استمارات تقييم ميداني للاسمين",
        "fullDescription": "ملف الشهر الحالي لا يحتوي على استمارات زيارة أو اعتماد ميداني للاسمين الجديدين، رغم أن التقييم الميداني شرط لإضافتهما إلى قائمة المستفيدين.",
        "timestamp": "الشهر الحالي",
        "relatedSuspectIds": ["reem_archivist", "hassan_social_worker"],
        "important": true
      },
      {
        "id": "raised_payment_record",
        "type": "record",
        "title": "سجل مبلغ المساعدة",
        "shortDescription": "زيادة غير موثقة لإحدى الأسرتين الجديدتين",
        "fullDescription": "سجل الصرف يبيّن أن مبلغ إحدى الأسرتين الجديدتين أعلى من المتوسط المعتاد، ولا يوجد قرار اعتماد أو مستند يشرح سبب الزيادة. كريم أبلغ عنها أثناء مراجعته للحسابات.",
        "timestamp": "بعد أيام من التعديل",
        "relatedSuspectIds": ["reem_archivist", "kareem_treasurer"],
        "important": true
      },
      {
        "id": "reem_family_link",
        "type": "document",
        "title": "صلة قرابة غير معلنة",
        "shortDescription": "إحدى الأسرتين الجديدتين قريبة لريم",
        "fullDescription": "بيانات الأسرة الجديدة ذات المساعدة الأعلى تؤكد أنها أسرة خالة ريم. لا يظهر في الطلب ما يثبت أنها تقدمت رسميًا أو خضعت لتقييم ميداني.",
        "timestamp": "عند مراجعة بيانات الطلب",
        "relatedSuspectIds": ["reem_archivist"],
        "important": true
      },
      {
        "id": "coworker_testimony",
        "type": "testimony",
        "title": "شهادة زميلة ريم",
        "shortDescription": "ريم تحدثت عن ضائقة خالتها قبل التعديل",
        "fullDescription": "تقول زميلة ريم إنها سمعتها قبل أسبوعين تعبّر عن قلقها على وضع خالتها المادي، وتتمنى لو وجدت طريقة لمساعدتها بسرعة.",
        "timestamp": "قبل أسبوعين",
        "relatedSuspectIds": ["reem_archivist"],
        "important": true
      },
      {
        "id": "fatma_social_post",
        "type": "message",
        "title": "تعليق الحاجة فاطمة",
        "shortDescription": "منشور غاضب بعد اكتشاف حذف اسم أسرتها",
        "fullDescription": "نشرت الحاجة فاطمة تعليقًا تتهم فيه شخصًا داخل الجمعية بأخذ حقوق الناس، لكن توقيت المنشور جاء بعد اكتشافها حذف اسم أسرتها. لا يربطها أي دليل بتعديل النظام.",
        "timestamp": "بعد اكتشاف الحذف",
        "relatedSuspectIds": ["fatma_beneficiary"],
        "important": false
      },
      {
        "id": "hassan_field_visit",
        "type": "testimony",
        "title": "إثبات زيارة الأستاذ حسن",
        "shortDescription": "زيارة موثقة وقت تعديل القائمة",
        "fullDescription": "إفادة رب الأسرة وسجل الزيارة يثبتان وجود الأستاذ حسن في زيارة ميدانية خارج مقر الجمعية وقت دخول ريم إلى النظام.",
        "timestamp": "مساء يوم التعديل",
        "relatedSuspectIds": ["hassan_social_worker"],
        "important": true
      },
      {
        "id": "building_history_remark",
        "type": "testimony",
        "title": "حكاية قديمة عن المبنى",
        "shortDescription": "ملاحظة عابرة عن بداية توزيع المساعدات",
        "fullDescription": "أثناء التحقيق، يذكر عضو قديم أن نظام تسجيل الأسر بدأ أيام الحاج سامي، عندما بدأت الجمعية توزيع المساعدات من المبنى الذي تبرع به. لا تساعد المعلومة في تحديد من عدّل القائمة، لكنها تذكّر بتاريخ الجمعية.",
        "timestamp": "أثناء التحقيق",
        "relatedSuspectIds": [],
        "important": false
      }
    ],
    "timeline": [
      { "time": "قبل شهرين", "text": "اعتماد الأسرتين المحذوفتين بعد تقييم ميداني." },
      { "time": "قبل أسبوعين", "text": "زميلة في الجمعية تتذكر حديثًا عن ضائقة مادية داخل إحدى العائلات." },
      { "time": "مساء اليوم السابق", "text": "تُعدّل قائمة المستفيدين خارج ساعات العمل." },
      { "time": "صباح المراجعة", "text": "منى تكتشف اختفاء الأسرتين، والحاجة فاطمة تعترض على حذف اسم أسرتها." },
      { "time": "بعد أيام", "text": "كريم يلاحظ زيادة مبلغ المساعدة أثناء مراجعة الصرف ويبلغ عنها." }
    ],
    "hints": [
      "افصل بين الشخص الذي يعتمد أسماء الأسر، والشخص الذي يملك صلاحية تعديل القائمة الرقمية.",
      "الإضافة الجديدة تحتاج إلى استمارة تقييم ميداني. هل توجد هذه الاستمارة؟",
      "سجل الحفظ يحدد حسابًا لا شخصًا وحده؛ هل توجد قرائن مستقلة تربط صاحبه بإحدى الإضافات؟"
    ],
    "culpritId": "reem_archivist",
    "solutionExplanation": "ريم هي التي غيّرت القائمة. سجل الدخول يثبت أنها استخدمت النظام خارج ساعات العمل، وملف الأسماء الجديدة يخلو من الاعتماد الميداني المطلوب. إحدى الأسرتين المضافة هي أسرة خالتها، وكانت ريم قد تحدثت عن قلقها على وضعها قبل التعديل. بذلك يتضح الدافع وطريقة التلاعب. الأستاذ حسن كان في زيارة موثقة، وكريم أبلغ عن الزيادة بنفسه، والحاجة فاطمة اعترضت بعد حذف اسم أسرتها، فهي متضررة وليست الفاعلة.",
    "supportingEvidenceIds": ["system_access_log", "new_names_no_approval", "reem_family_link", "coworker_testimony"]
  },
  {
    "id": "missing_donor_laptop",
    "chapterId": "chapter_2",
    "order": 1,
    "title": "اللابتوب المفقود",
    "summary": "يختفي جهاز غرفة التخزين الذي يحمل قاعدة بيانات المتبرعين الكبار خلال عطلة نهاية الأسبوع.",
    "description": "قبل زيارة لجنة منحة الخير، يختفي اللابتوب الوحيد الذي يحمل نسخة محدّثة من قاعدة بيانات كبار المتبرعين، من غرفة تخزين مغلقة بلا آثار اقتحام. تتبعوا مفتاح الغرفة وأثر الجهاز لتعرفوا من أخذه.",
    "difficulty": "hard",
    "location": "غرفة التخزين الملحقة بمكتب الإدارة",
    "incidentStartTime": "مساء الخميس",
    "incidentEndTime": "صباح السبت",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": { "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 }, "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 } },
    "rewardedHints": ["إيصال الرهن يربط الجهاز نفسه بشخص محدد، ثم ارجع للأدلة التي تشرح كيف وصل إليه ولماذا."],
    "rewards": { "coins": 60, "xp": 30, "gems": 0 },
    "suspects": [
      { "id": "samer_archivist", "name": "سامر", "occupation": "متطوع في الأرشفة", "relationToCase": "انضم للجمعية قبل شهرين، وكان يسأل عن المفتاح الاحتياطي.", "statement": "ما قربتش من غرفة التخزين ومش عارف المفتاح الاحتياطي بيتحط فين.", "timeline": ["قبل أيام — سأل عن مكان المفتاح الاحتياطي.", "يوم الجمعة — ظهرت معاملة رهن للجهاز نفسه."], "relatedEvidenceIds": ["pawn_ticket", "pawn_contact_match", "debt_calls", "key_question"] },
      { "id": "kareem_treasurer", "name": "كريم", "occupation": "أمين الصندوق", "relationToCase": "يملك مفتاحًا رسميًا لغرفة التخزين.", "statement": "ما دخلتش غرفة التخزين من أسبوعين، ودخولي للمقر الخميس كان عشان كشف حساب نسيته.", "timeline": ["مساء الخميس — دخل المقر عشر دقائق بعد العمل."], "relatedEvidenceIds": ["kareem_entry"] },
      { "id": "mona_coordinator", "name": "منى", "occupation": "منسقة المتطوعين", "relationToCase": "آخر من استخدم الجهاز قبل اختفائه، وهي من أبلغت عنه.", "statement": "استخدمت الجهاز لتحديث الحضور وقفلت الغرفة قبل ما أمشي.", "timeline": ["مساء الخميس — استخدمت اللابتوب وأغلقت الغرفة.", "صباح السبت — اكتشفت اختفاءه وأبلغت الإدارة."], "relatedEvidenceIds": ["mona_last_use", "mona_prior_lock"] }
    ],
    "evidence": [
      { "id": "pawn_ticket", "type": "receipt", "title": "إيصال محل الرهن", "shortDescription": "رقم الجهاز يطابق اللابتوب المفقود", "fullDescription": "إيصال مؤرخ بيوم الجمعة من محل يرهن الأجهزة المستعملة. الرقم التسلسلي يطابق اللابتوب المفقود، لكن خانة الاسم غير مقروءة ورقم الهاتف مسجل بآخر أربعة أرقام فقط.", "timestamp": "الجمعة", "relatedSuspectIds": [], "important": true },
      { "id": "pawn_contact_match", "type": "record", "title": "بيانات التواصل في معاملة الرهن", "shortDescription": "رقم مختصر يطابق سجل أحد المتطوعين", "fullDescription": "آخر أربعة أرقام في إيصال الرهن تطابق رقم هاتف سامر المسجل لدى الجمعية. التطابق يحدد صاحب المعاملة، بينما يثبت الإيصال نفسه أن الجهاز المرهون هو اللابتوب المفقود.", "timestamp": "الجمعة", "relatedSuspectIds": ["samer_archivist"], "important": true },
      { "id": "debt_calls", "type": "record", "title": "مكالمات التحصيل", "shortDescription": "اتصالات متكررة قبل اختفاء الجهاز", "fullDescription": "سجل هاتف سامر يُظهر مكالمات متكررة من شركة تحصيل ديون خلال الأسبوع السابق، وبإلحاح متصاعد.", "timestamp": "الأسبوع السابق", "relatedSuspectIds": ["samer_archivist"], "important": true },
      { "id": "key_question", "type": "testimony", "title": "سؤال عن المفتاح الاحتياطي", "shortDescription": "زميل يتذكر سؤال سامر عن مكان المفتاح", "fullDescription": "زميل سامر في الأرشفة يقول إنه سأله قبل أيام عن مكان المفتاح الاحتياطي لغرفة التخزين، بحجة إحضار ورق قديم.", "timestamp": "قبل الحادثة بأيام", "relatedSuspectIds": ["samer_archivist"], "important": true },
      { "id": "kareem_entry", "type": "record", "title": "دخول كريم للمقر", "shortDescription": "دخول متأخر يثير الشك أولًا", "fullDescription": "سجل المبنى يثبت دخول كريم مساء الخميس لإحضار كشف حساب نسيه. كاميرا الممر المؤدي إلى مكتبه لا تُظهره متجهًا إلى غرفة التخزين.", "timestamp": "الخميس مساءً", "relatedSuspectIds": ["kareem_treasurer"], "important": false },
      { "id": "mona_last_use", "type": "testimony", "title": "آخر استخدام للجهاز", "shortDescription": "منى استخدمت اللابتوب مساء الخميس", "fullDescription": "تقول منى إنها استخدمت اللابتوب لتحديث بيانات الحضور، ثم أعادته إلى مكانه وأغلقت الغرفة كالمعتاد.", "timestamp": "الخميس مساءً", "relatedSuspectIds": ["mona_coordinator"], "important": true },
      { "id": "mona_prior_lock", "type": "record", "title": "واقعة القفل السابقة", "shortDescription": "منى نسيت قفل الغرفة جيدًا مرة من قبل", "fullDescription": "توجد ملاحظة إدارية قديمة بأن منى لم تُحكم قفل الغرفة مرة سابقة. هذا يفسر احتمال سهولة الوصول للمفتاح، لكنه لا يربطها بأخذ اللابتوب أو رهنه.", "timestamp": "واقعة سابقة", "relatedSuspectIds": ["mona_coordinator"], "important": false }
    ],
    "timeline": [
      { "time": "الأسبوع السابق", "text": "موظف في الجمعية يتلقى مكالمات متكررة من شركة تحصيل ديون." },
      { "time": "قبل أيام", "text": "أحد العاملين يستفسر عن مكان المفتاح الاحتياطي." },
      { "time": "الخميس مساءً", "text": "منى تستخدم اللابتوب وتغلق غرفة التخزين." },
      { "time": "فجر الجمعة", "text": "يختفي اللابتوب خلال عطلة نهاية الأسبوع." },
      { "time": "الجمعة", "text": "جهاز بنفس الرقم التسلسلي يظهر في معاملة رهن." },
      { "time": "السبت صباحًا", "text": "منى تكتشف الاختفاء وتبلغ الإدارة." }
    ],
    "hints": ["افصل بين من كانت له فرصة الوصول، ومن ثبت أنه تعامل مع الجهاز بعد اختفائه.", "الإيصال لا يذكر اسمًا كاملًا؛ قارن بيانات التواصل بسجلات الجمعية.", "استخدم الدافع والسؤال عن المفتاح لتفسير طريقة الوصول، لا لتحديد الفاعل وحدهما."],
    "culpritId": "samer_archivist",
    "solutionExplanation": "معاملة الرهن تخص اللابتوب المفقود بحسب الرقم التسلسلي، وآخر أرقام الهاتف المستخدم فيها تطابق رقم سامر. مكالمات التحصيل تفسر حاجته للمال، وسؤاله السابق عن المفتاح يربطه بالتحضير للوصول إلى الغرفة. دخول كريم للمقر لا يثبت دخوله غرفة التخزين، وسابقة منى لا تربطها بالرهن.",
    "supportingEvidenceIds": ["pawn_ticket", "pawn_contact_match", "debt_calls", "key_question"]
  },
  {
    "id": "fake_donor_call",
    "chapterId": "chapter_2",
    "order": 2,
    "title": "المتبرع المزيّف",
    "summary": "مكالمة بصوت متبرع كبير تعلن سحب تبرعه قبل زيارة لجنة المنحة.",
    "description": "يتلقى مكتب الجمعية اتصالًا من شخص ينتحل صوت الأستاذ سامح ويقول إنه سيسحب تبرعه الكبير بسبب الفوضى الأخيرة. طارق يلاحظ اختلافًا طفيفًا في الصوت، والتحقيق يكشف أن المكالمة سُجلت بصوت مركّب.",
    "difficulty": "hard",
    "location": "مكتب الاستقبال",
    "incidentStartTime": "الثلاثاء صباحًا",
    "incidentEndTime": "الثلاثاء مساءً",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": { "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 }, "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 } },
    "rewardedHints": ["اجمع بين الصوت المنشور علنًا، وآثار برنامج التحرير، ورسالة صاحب الدافع."],
    "rewards": { "coins": 60, "xp": 30, "gems": 0 },
    "suspects": [
      { "id": "youssef_suspended", "name": "يوسف", "occupation": "قائد فريق المتطوعين الموقوف مؤقتًا", "relationToCase": "يريد استعادة مكانته بعد قضية التوقيعات.", "statement": "ما ليش علاقة بالمكالمة، وكنت بعيد عن الاستقبال وقتها.", "timeline": ["قبل يومين — استخدم برنامج تحرير صوت.", "قبل يوم — أرسل لصديقه عن استغلال أزمة لإثبات نفسه."], "relatedEvidenceIds": ["youssef_editing", "youssef_message", "call_recording"] },
      { "id": "tareq_receptionist", "name": "طارق", "occupation": "موظف استقبال جديد", "relationToCase": "هو من استقبل المكالمة وأبلغ عنها.", "statement": "الصوت كان مقنع، بس حسيت إن نطق بعض الكلمات مش طبيعي وبلغت الإدارة.", "timeline": ["الثلاثاء صباحًا — استقبل المكالمة.", "بعدها بساعات — أبلغ الإدارة بشكه."], "relatedEvidenceIds": ["call_recording", "tareq_report"] },
      { "id": "sally_reporter", "name": "سالي", "occupation": "صحفية", "relationToCase": "سألت عن انسحاب المتبرعين بعد انتشار الخبر.", "statement": "سؤالي كان بسبب منشور شفته للأستاذ سامح، مش عشان عرفت بالمكالمة قبلها.", "timeline": ["بعد المكالمة بساعات — سألت عن انسحاب المتبرعين."], "relatedEvidenceIds": ["sally_question", "public_samah_audio"] }
    ],
    "evidence": [
      { "id": "call_recording", "type": "audio", "title": "تسجيل المكالمة", "shortDescription": "تفاوتات قصيرة بين بعض المقاطع", "fullDescription": "تسجيل الخط الأرضي واضح، لكن تظهر عند ثلاث وصلات تغيرات مفاجئة في طبقة الصوت واختفاء لضجيج الخلفية. لا يكفي التسجيل وحده لمعرفة مصدر المقاطع أو من أجرى المكالمة.", "timestamp": "الثلاثاء صباحًا", "relatedSuspectIds": ["youssef_suspended", "tareq_receptionist"], "important": true },
      { "id": "public_samah_audio", "type": "audio", "title": "كلمة شكر قديمة", "shortDescription": "تسجيل علني لصوت الأستاذ سامح", "fullDescription": "كلمة شكر قصيرة للأستاذ سامح نُشرت على صفحة الجمعية بعد حفل العام الماضي، وهي مصدر علني متاح لعينة من صوته.", "timestamp": "بعد حفل العام الماضي", "relatedSuspectIds": ["youssef_suspended", "sally_reporter"], "important": true },
      { "id": "youssef_editing", "type": "record", "title": "مشروع صوتي محفوظ", "shortDescription": "مقاطع قصيرة من كلمة قديمة على جهاز يوسف", "fullDescription": "بإذن يوسف، عُثر على مشروع تحرير صوتي أُنشئ قبل الاتصال بيومين. يحتوي المشروع على مقاطع منفصلة من كلمة الشكر المنشورة للأستاذ سامح، لكنه لا يحتوي على نسخة كاملة مطابقة للمكالمة.", "timestamp": "قبل الحادثة بيومين", "relatedSuspectIds": ["youssef_suspended"], "important": true },
      { "id": "youssef_message", "type": "message", "title": "رسالة يوسف لصديقه", "shortDescription": "يوسف يريد استعادة مكانته في الفريق", "fullDescription": "رسالة أرسلها يوسف قبل الحادثة بيوم: «مش هفضل موقوف كتير، لازم أرجع أثبت إني أقدر أساعد الفريق». لا تذكر الرسالة أي مكالمة أو خطة بعينها.", "timestamp": "قبل الحادثة بيوم", "relatedSuspectIds": ["youssef_suspended"], "important": true },
      { "id": "sally_question", "type": "testimony", "title": "سؤال سالي عن المتبرعين", "shortDescription": "سؤالها جاء بعد المكالمة لا قبلها", "fullDescription": "سألت سالي عن انسحاب متبرعين بعد انتشار خبر المكالمة. كانت قد رأت تعليقًا عامًا للأستاذ سامح عن جمعيات أخرى وربطته بالخبر خطأً، ولا دليل على معرفتها بالمكالمة مسبقًا.", "timestamp": "بعد المكالمة بساعات", "relatedSuspectIds": ["sally_reporter"], "important": false },
      { "id": "tareq_report", "type": "record", "title": "بلاغ طارق", "shortDescription": "طارق بادر بالإبلاغ عن غرابة الصوت", "fullDescription": "سجل الإدارة يثبت أن طارق أبلغ عن شكه في المكالمة بعد استقبالها بساعات، قبل بدء التحقيق معه.", "timestamp": "الثلاثاء مساءً", "relatedSuspectIds": ["tareq_receptionist"], "important": false }
    ],
    "timeline": [
      { "time": "العام الماضي", "text": "نُشرت كلمة شكر بصوت الأستاذ سامح على صفحة الجمعية." },
      { "time": "قبل يومين", "text": "مشروع صوتي يُحفظ على جهاز مشترك في مقر الجمعية." },
      { "time": "قبل يوم", "text": "تصل رسالة داخلية قبل إجراء المكالمة بيوم." },
      { "time": "الثلاثاء صباحًا", "text": "طارق يستقبل المكالمة المزيفة ويلاحظ تفاوتًا في الصوت." },
      { "time": "الثلاثاء بعد الظهر", "text": "سالي تسأل عن انسحاب متبرعين بناءً على معلومة عامة منفصلة." },
      { "time": "الثلاثاء مساءً", "text": "طارق يبلغ الإدارة رسميًا بشكوكه." }
    ],
    "hints": ["حدد ما الذي تكشفه فواصل الصوت، وما الذي لا تستطيع إثباته وحدها.", "قارن الملفات الصوتية السابقة بالمقاطع المستخدمة في المكالمة، ثم افحص توقيتها.", "استخدم الرغبة في استعادة المكانة كدافع محتمل، لا كاعتراف بالخطة."],
    "culpritId": "youssef_suspended",
    "solutionExplanation": "مقارنة التسجيل بالكلمة العلنية تكشف أن المقاطع الصوتية مأخوذة منها ومجمعة عند الوصلات غير الطبيعية. مشروع يوسف يحتوي على أجزاء منفصلة من الكلمة نفسها قبل المكالمة، ثم تظهر رسالته عن رغبته في استعادة مكانته كدافع محتمل؛ لا يثبت أي منها وحده أنه صاحب الاتصال، لكن اجتماع المصدر والمشروع والتوقيت والدافع يرجح ذلك. طارق أبلغ عن غرابة الصوت، وسالي سألت بعد الواقعة اعتمادًا على معلومة منفصلة.",
    "supportingEvidenceIds": ["call_recording", "public_samah_audio", "youssef_editing", "youssef_message"]
  },
  {
    "id": "forged_purchase_invoices",
    "chapterId": "chapter_2",
    "order": 3,
    "title": "فواتير على الورق",
    "summary": "ثلاث فواتير مشتريات وهمية تحمل توقيع كريم وختم محل أدوات التنظيف.",
    "description": "أثناء تدقيق داخلي قبل زيارة لجنة المنحة، تظهر ثلاث فواتير لمشتريات أدوات تنظيف بمبالغ مبالغ فيها، موقّعة باسم كريم. كريم ينفي التوقيع، ومورّد الأدوات ينفي إصدار الفواتير أو الختم.",
    "difficulty": "hard",
    "location": "مكتب الحسابات",
    "incidentStartTime": "قبل زيارة اللجنة بأيام",
    "incidentEndTime": "يوم التدقيق الداخلي",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": { "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 }, "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 } },
    "rewardedHints": ["مسودة المقال وتاريخ تجهيز الختم يكشفان من جهّز الفضيحة قبل اكتشافها رسميًا."],
    "rewards": { "coins": 60, "xp": 30, "gems": 0 },
    "suspects": [
      { "id": "sally_investigative", "name": "سالي", "occupation": "صحفية", "relationToCase": "كانت تسأل عن شفافية الحسابات قبل اكتشاف الفواتير.", "statement": "كنت بجهز تقريرًا عن الجمعيات، وما زورتش أي مستند.", "timeline": ["قبل أسبوعين — طلبت تصنيع ختم مطاطي.", "قبل أيام — سألت عن الحسابات.", "بعد اكتشاف الفواتير — ظهرت مسودة مقالها لدقائق."], "relatedEvidenceIds": ["sally_stamp_order", "sally_draft", "signature_analysis", "stamp_analysis"] },
      { "id": "kareem_invoice_victim", "name": "كريم", "occupation": "أمين الصندوق", "relationToCase": "اسمه وتوقيعه ظاهران على الفواتير المشبوهة.", "statement": "التوقيع مش توقيعي، والفواتير دي ما وافقتش عليها.", "timeline": ["يوم التدقيق — واجهته الفواتير وأصر أنها مزورة."], "relatedEvidenceIds": ["signature_analysis", "supplier_statement", "kareem_tension"] },
      { "id": "fathy_supplier", "name": "الأستاذ فتحي", "occupation": "مورّد أدوات", "relationToCase": "اسم محله وختمه ظاهران على الفواتير.", "statement": "الفواتير دي مش صادرة من محلي والختم مش ختمي.", "timeline": ["بعد اكتشاف الفواتير — قدّم نموذجًا من ختمه الحقيقي."], "relatedEvidenceIds": ["stamp_analysis", "supplier_statement"] },
      { "id": "mona_auditor", "name": "منى", "occupation": "منسقة المتطوعين", "relationToCase": "تشارك في تنظيم ملفات الفعاليات التي تُراجعها الجمعية.", "statement": "ما تعاملتش مع الفواتير ولا أدخلت مشتريات في السجلات.", "timeline": ["يوم التدقيق — ساعدت في جمع ملفات الشهرين الماضيين."], "relatedEvidenceIds": ["signature_analysis", "supplier_statement"] }
    ],
    "evidence": [
      { "id": "signature_analysis", "type": "document", "title": "تحليل التوقيع", "shortDescription": "توقيع الفواتير لا يطابق توقيع كريم الموثق", "fullDescription": "مقارنة توقيع كريم على مستندات موثقة بتوقيعه على الفواتير تظهر اختلافات دقيقة في زوايا الحروف، بما يتفق مع محاولة تقليد.", "timestamp": "يوم التدقيق", "relatedSuspectIds": ["sally_investigative", "kareem_invoice_victim", "mona_auditor"], "important": true },
      { "id": "stamp_analysis", "type": "document", "title": "الختم غير المطابق", "shortDescription": "ختم الفواتير يختلف عن ختم المورد الحقيقي", "fullDescription": "نموذج ختم الأستاذ فتحي الحقيقي يختلف في تفاصيل التصميم عن الختم الظاهر على الفواتير الثلاث. في كل نسخة مزورة عيب صغير في الإطار عند الركن السفلي، ويتكرر بنفس الشكل؛ المقارنة بالختم الشخصي المضبوط لاحقًا قد تحدد الأداة المستخدمة.", "timestamp": "يوم التدقيق", "relatedSuspectIds": ["sally_investigative", "fathy_supplier"], "important": true },
      { "id": "sally_draft", "type": "document", "title": "سجل مسودة صحفية", "shortDescription": "مسودة أُنشئت قبل اكتمال التدقيق", "fullDescription": "بيانات الملف تثبت أن سالي بدأت مسودة عن مشتريات الجمعية قبل اكتمال التدقيق الرسمي. تتضمن المسودة اسم المورد وعدد الفواتير، لكنها لا تكشف مصدر معلوماتها أو من أنشأ الفواتير.", "timestamp": "قبل إعلان نتيجة التدقيق", "relatedSuspectIds": ["sally_investigative"], "important": true },
      { "id": "sally_stamp_order", "type": "receipt", "title": "طلب ختم مطاطي", "shortDescription": "إيصال طلب شخصي من محل أختام", "fullDescription": "إيصال من محل أختام قبل الواقعة بأسبوعين يثبت طلب سالي ختمًا مطاطيًا شخصيًا. شكل الختم مختلف عن ختم الأستاذ فتحي، لكن تجربة الطباعة المرفقة بالإيصال فيها عيب صغير عند الركن السفلي يشبه العيب المتكرر على الفواتير الثلاث.", "timestamp": "قبل الحادثة بأسبوعين", "relatedSuspectIds": ["sally_investigative"], "important": true },
      { "id": "supplier_statement", "type": "testimony", "title": "إفادة الأستاذ فتحي", "shortDescription": "المورّد ينفي إصدار الفواتير", "fullDescription": "ينفي الأستاذ فتحي إصدار الفواتير بالمبالغ المذكورة، ويؤكد أن ختم محله الظاهر عليها ليس ختمه الحقيقي.", "timestamp": "يوم التدقيق", "relatedSuspectIds": ["fathy_supplier", "kareem_invoice_victim"], "important": true },
      { "id": "kareem_tension", "type": "testimony", "title": "ارتباك كريم أثناء السؤال", "shortDescription": "توتر طبيعي لا يثبته دليل مادي", "fullDescription": "تردد كريم في تذكر تاريخ زيارته الأخيرة للمحل، لكنه لا يغيّر من أن التوقيع والختم لا يطابقان الأصل، ولا توجد قرينة تربطه بصنعهما.", "timestamp": "أثناء التحقيق", "relatedSuspectIds": ["kareem_invoice_victim"], "important": false }
    ],
    "timeline": [
      { "time": "قبل أسبوعين", "text": "طلب تصنيع ختم مطاطي شخصي من محل قريب." },
      { "time": "قبل أيام", "text": "تبدأ الاستفسارات عن شفافية حسابات الجمعية." },
      { "time": "قبل التدقيق بيوم", "text": "الفواتير المزورة تُدرج في سجل المشتريات." },
      { "time": "يوم التدقيق", "text": "تُكتشف الفواتير ويؤكد الأستاذ فتحي أن الختم ليس ختمه." },
      { "time": "بعد الاكتشاف بساعات", "text": "تظهر مسودة مقال عن الفواتير قبل حذفها." }
    ],
    "hints": ["حدد الأول إيه اللي يثبت إن الفواتير مضروبة.", "قارن العيب الصغير في طبعة الختم بالعينات اللي ظهرت في التحقيق.", "بعد ما تحدد الأداة المحتملة، شوف مين كان عنده سبب يجهز التفاصيل قبل إعلانها."],
    "culpritId": "sally_investigative",
    "solutionExplanation": "تحليل التوقيع والختم يثبت أن الفواتير مزورة، لكن ده وحده ما يحددش مين عملها. عيب الإطار الصغير المتكرر على الفواتير يطابق تجربة الختم اللي طلبته سالي، بينما مسودتها بتثبت إنها عرفت عدد الفواتير واسم المورد قبل انتهاء التدقيق. اجتماع الأداة ومعرفة التفاصيل المبكرة يرجح إنها جهزت التزوير للنشر؛ كريم وفتحي اتستخدمت أسماؤهم وأختامهم من غير إذنهم.",
    "supportingEvidenceIds": ["signature_analysis", "stamp_analysis", "sally_draft", "sally_stamp_order", "supplier_statement"]
  },
  {
    "id": "restoration_sabotage",
    "chapterId": "chapter_2",
    "order": 4,
    "title": "تخريب الترميم",
    "summary": "حوادث تخريب ليلية متكررة تهدد بتأخير ترميم مبنى الجمعية قبل زيارة اللجنة.",
    "description": "على مدار أسبوع، تتعرض معدات ورشة الترميم للتخريب: تُقطع كابلات وتُسكب مواد على أخشاب معالجة. قرب المهندس مراد من الورشة يجعله موضع الشك الأول، لكن آثارًا من خارج فريقه تظهر في كل حادثة.",
    "difficulty": "hard",
    "location": "ورشة الترميم الملحقة بمبنى الجمعية",
    "incidentStartTime": "بداية الأسبوع السابق للزيارة",
    "incidentEndTime": "نهاية الأسبوع السابق للزيارة",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": { "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 }, "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 } },
    "rewardedHints": ["فرّق بين مصلحة صاحب المشروع ومصلحة طرف من برّه، وبعدها ارجع لعلامات العربية."],
    "rewards": { "coins": 60, "xp": 30, "gems": 0 },
    "suspects": [
      { "id": "morad_contractor", "name": "المهندس مراد", "occupation": "مقاول الترميم", "relationToCase": "مسؤول المشروع والأقرب إلى الورشة بحكم عمله.", "statement": "كل يوم تأخير يقلل أرباحي ويعرضني لغرامة، مصلحتي إن الشغل يخلص.", "timeline": ["خلال الأسبوع — وفريقه يدخل الورشة يوميًا في أوقات العمل."], "relatedEvidenceIds": ["workshop_logs", "night_camera"] },
      { "id": "sid_competitor", "name": "المقاول سيد", "occupation": "مقاول منافس", "relationToCase": "خسر مناقصة الترميم لصالح مراد بفارق ضئيل.", "statement": "ما دخلتش الورشة بعد ما خسر العرض، ومليش مصلحة في تعطيل شغل الجمعية.", "timeline": ["قبل شهرين — خسر عرض المناقصة.", "خلال الأسبوع — ظهرت عربية بعلامات تشبه عربيته قرب المدخل الخلفي."], "relatedEvidenceIds": ["bid_record", "security_witness", "company_tool", "night_camera"] },
      { "id": "bilal_worker", "name": "بلال", "occupation": "عامل جديد بفريق مراد", "relationToCase": "أخطأ سابقًا في ترتيب الأدوات فتأخر العمل قليلًا.", "statement": "غلطي القديم كان من قلة الخبرة، لكن ما خربتش معدات الورشة.", "timeline": ["قبل أسابيع — أخطأ في ترتيب الأدوات دون قصد."], "relatedEvidenceIds": ["bilal_old_mistake", "workshop_logs"] }
    ],
    "evidence": [
      { "id": "night_camera", "type": "video", "title": "كاميرا المدخل الخلفي", "shortDescription": "شخص غريب عن فريق الورشة يظهر قبل الحوادث", "fullDescription": "تُظهر الكاميرا الخارجية شخصًا لا يرتدي زي فريق مراد يدخل المنطقة الخلفية ليلًا قبل كل حادثة. الوجه غير واضح، لكن في لقطتين ظهر جزء من لوحة العربية: رقمها الأخير 72، والمصباح الخلفي اليمين مكسور.", "timestamp": "ليالي الحوادث", "relatedSuspectIds": ["sid_competitor", "morad_contractor"], "important": true },
      { "id": "company_tool", "type": "document", "title": "أداة القطع المجهولة", "shortDescription": "ملصق ممزق على أداة من موقع الحادثة الأخيرة", "fullDescription": "عُثر على أداة قطع صغيرة قرب موقع آخر حادثة. بقي جزء من ملصق شركة على المقبض، لكن الاسم غير مكتمل والملصق يمكن نقله؛ لا يكفي وحده لإثبات مالك الأداة.", "timestamp": "نهاية الأسبوع", "relatedSuspectIds": ["sid_competitor"], "important": true },
      { "id": "security_witness", "type": "testimony", "title": "شهادة حارس الأمن", "shortDescription": "علامة مميزة في عربية ظهرت قرب الورشة", "fullDescription": "حارس الأمن وصف عربية صغيرة بلوحة آخرها 72 ومصباح خلفي يمين مكسور، شافها قرب المدخل الخلفي مرتين في مواعيد الحوادث. سجل تصاريح المقاولين يبين إن العلامتين دول يخصوا عربية سيد وحدها، لكن مفيش شاهد شافه سايقها.", "timestamp": "خلال الأسبوع", "relatedSuspectIds": ["sid_competitor"], "important": true },
      { "id": "bid_record", "type": "document", "title": "سجل المناقصة", "shortDescription": "سيد خسر عقد الترميم بفارق ضئيل", "fullDescription": "وثيقة المناقصة تثبت أن سيد قدم عرضًا للمشروع وخسره لصالح مراد بفارق بسيط قبل بدء الترميم بشهرين.", "timestamp": "قبل شهرين", "relatedSuspectIds": ["sid_competitor", "morad_contractor"], "important": true },
      { "id": "workshop_logs", "type": "record", "title": "سجل دخول فريق الورشة", "shortDescription": "وجود مراد وفريقه نهارًا مرتبط بعملهم", "fullDescription": "تُظهر السجلات دخول مراد وفريقه خلال ساعات العمل المعتادة، ولا يظهر أي منهم في أوقات التسلل الليلي التي سبقت حوادث التخريب.", "timestamp": "أيام الحوادث", "relatedSuspectIds": ["morad_contractor", "bilal_worker"], "important": false },
      { "id": "bilal_old_mistake", "type": "testimony", "title": "خطأ بلال السابق", "shortDescription": "تأخير قديم سببه ترتيب الأدوات", "fullDescription": "تأخر العمل قبل أسابيع بسبب خطأ غير مقصود من بلال في ترتيب الأدوات. لا يربطه أي دليل بحوادث التخريب الحالية.", "timestamp": "قبل أسابيع", "relatedSuspectIds": ["bilal_worker"], "important": false }
    ],
    "timeline": [
      { "time": "قبل شهرين", "text": "سيد يخسر عرض المناقصة لصالح مراد بفارق ضئيل." },
      { "time": "بداية الأسبوع", "text": "أول حادثة تخريب تقع ليلًا في الورشة." },
      { "time": "منتصف الأسبوع", "text": "حارس الأمن يلاحظ عربية قرب المدخل الخلفي في وقت غير معتاد." },
      { "time": "طوال الأسبوع", "text": "تتكرر الحوادث وتظهر حركة ليلية قبل كل واحدة منها." },
      { "time": "نهاية الأسبوع", "text": "تُعثر أداة تحمل جزءًا من اسم شركة على المقبض، وتُراجع علامات العربية التي ظهرت في اللقطات." }
    ],
    "hints": ["اسأل من الذي يستفيد من تعطيل المشروع ومن الذي يخسر منه.", "قارن توقيت ظهور الشخص الغريب بتوقيت حوادث التخريب.", "اجمع بين أداة القطع وسجل المناقصة وشهادة الحارس."],
    "culpritId": "sid_competitor",
    "solutionExplanation": "الكاميرا والحارس سجّلوا نفس علامتين في العربية: آخر اللوحة والمصباح المكسور. سجل التصاريح يربط العلامتين بعربية سيد، لكن مش بالسواق لوحده؛ سجل المناقصة يوضح دافعه، وتكرار ظهور العربية قبل كل حادثة يربطها بالتخريب. أداة القطع تفضل قرينة مساعدة بس لأن ملصقها ممكن يتنقل. الأدلة المجتمعة ترجح سيد، بينما مراد كان يخسر من التأخير وبلال غلطه قديم ومختلف عن الحوادث دي.",
    "supportingEvidenceIds": ["night_camera", "company_tool", "security_witness", "bid_record", "workshop_logs"]
  },
  {
    "id": "false_fire_alarm",
    "chapterId": "chapter_2",
    "order": 5,
    "title": "إنذار يوم الزيارة",
    "summary": "إنذار حريق يدوي يوقف جولة لجنة المنحة في أهم يوم للجمعية.",
    "description": "في صباح زيارة لجنة تقييم منحة الخير، ينطلق إنذار الحريق بينما تبدأ اللجنة جولتها، فيُخلى المبنى رغم عدم وجود حريق. يتضح أن الإنذار فُعّل يدويًا من ممر جانبي بالطابق العلوي، في توقيت لم يكن يعرفه إلا عدد محدود.",
    "difficulty": "hard",
    "location": "مبنى جمعية الخير",
    "incidentStartTime": "صباح يوم الزيارة",
    "incidentEndTime": "بعد بدء جولة اللجنة بدقائق",
    "recommendedTime": 600,
    "maxWrongAccusations": 3,
    "maxHints": 3,
    "maxRewardedHints": 1,
    "starThresholds": { "threeStars": { "maxTimeMultiplier": 1.0, "maxHints": 0, "maxErrors": 0 }, "twoStars": { "maxTimeMultiplier": 1.5, "maxHints": 1, "maxErrors": 1 } },
    "rewardedHints": ["قارن بين اللي كان عارف وقت الجولة، واللي كان قريب من نقطة الإنذار وقت تشغيله."],
    "rewards": { "coins": 60, "xp": 30, "gems": 0 },
    "suspects": [
      { "id": "shady_volunteer", "name": "شادي", "occupation": "متطوع بفريق الاستقبال", "relationToCase": "كان مكلفًا بمرافقة لجنة التقييم ويعرف جدول جولتها.", "statement": "كنت فوق أجيب مياه للضيوف وما شوفتش اللي حصل.", "timeline": ["قبل يوم — وصلت له رسالة عن توقيت وصول اللجنة للطابق الثاني.", "صباح الزيارة — غادر موقع المرافقة دقائق قبل الإنذار."], "relatedEvidenceIds": ["visit_schedule", "shady_message", "escort_log", "alarm_location"] },
      { "id": "samira_chair", "name": "الحاجة سميرة", "occupation": "رئيسة الجمعية", "relationToCase": "كانت متوترة قرب لوحة التحكم الرئيسية قبل الإنذار.", "statement": "كنت بتفقد الإضاءة من توتري، لكن ما لمستش الإنذار.", "timeline": ["قبل الزيارة — تفقدت لوحة التحكم الرئيسية."], "relatedEvidenceIds": ["samira_control_panel", "alarm_location"] },
      { "id": "gaber_maintenance", "name": "الأسطى جابر", "occupation": "عامل صيانة", "relationToCase": "فحص جهاز الإنذار قبل الحادثة بيومين.", "statement": "فحصي كان روتينيًا ومثبت في تقرير الصيانة، والجهاز كان سليم.", "timeline": ["قبل يومين — أجرى فحص الصيانة الدوري."], "relatedEvidenceIds": ["maintenance_report", "alarm_location"] }
    ],
    "evidence": [
      { "id": "alarm_location", "type": "record", "title": "مكان زر الإنذار", "shortDescription": "الزر اليدوي في ممر جانبي بالطابق العلوي", "fullDescription": "فحص الموقع يثبت أن نقطة الإنذار اليدوي اللي اتفعلت في ممر جانبي بالطابق العلوي، بعيد عن مسار جولة اللجنة ومش بيعدي عليه الضيوف عادة. ده يخلي الضغط بالصدفة أقل احتمالًا، لكنه ما يحددش مين ضغط الزر.", "timestamp": "صباح الزيارة", "relatedSuspectIds": ["shady_volunteer", "samira_chair", "gaber_maintenance"], "important": true },
      { "id": "visit_schedule", "type": "document", "title": "جدول جولة اللجنة", "shortDescription": "توقيتات تفصيلية لم تكن متاحة للجميع", "fullDescription": "جدول داخلي يحدد نقاط جولة لجنة التقييم وتوقيت وصولها لكل طابق. كان متاحًا لعدد محدود من فريق التنظيم، ومنهم شادي المكلّف بالمرافقة.", "timestamp": "قبل يوم من الزيارة", "relatedSuspectIds": ["shady_volunteer"], "important": true },
      { "id": "shady_message", "type": "message", "title": "رسالة محذوفة جزئيًا", "shortDescription": "رسالة عن توقيت الجولة وترتيب سابق", "fullDescription": "بعد إذن رسمي بفحص هاتف شادي، استُعيد جزء من محادثة مع رقم غير محفوظ: «التوقيت زي ما اتفقنا، لما الجولة توصل للدور التاني»، أُرسلت قبل الزيارة بيوم. الرسالة لا تذكر إنذارًا أو زرًا بعينه.", "timestamp": "قبل يوم من الزيارة", "relatedSuspectIds": ["shady_volunteer"], "important": true },
      { "id": "escort_log", "type": "record", "title": "سجل مرافقة اللجنة", "shortDescription": "غياب شادي قبل انطلاق الإنذار", "fullDescription": "سجل المرافقة يُظهر أن شادي غادر موقعه لدقائق بحجة إحضار المياه، ولم يعد بها، وذلك قبل انطلاق الإنذار مباشرة.", "timestamp": "صباح الزيارة", "relatedSuspectIds": ["shady_volunteer"], "important": true },
      { "id": "samira_control_panel", "type": "testimony", "title": "تفقد لوحة التحكم", "shortDescription": "سميرة كانت متوترة قرب لوحة بعيدة عن زر الإنذار", "fullDescription": "شاهد رأى الحاجة سميرة تتفقد الإضاءة قرب لوحة التحكم الرئيسية. لوحة التحكم بعيدة عن زر الإنذار اليدوي في الطابق العلوي ولا تشغّله.", "timestamp": "قبل الإنذار بدقائق", "relatedSuspectIds": ["samira_chair"], "important": false },
      { "id": "maintenance_report", "type": "document", "title": "تقرير الصيانة الدوري", "shortDescription": "فحص الأسطى جابر كان موثقًا وروتينيًا", "fullDescription": "تقرير موقع من المشرف يثبت أن الأسطى جابر فحص الجهاز قبل يومين، وأنه كان يعمل بصورة سليمة. لم يتضمن الفحص عبثًا بالإنذار، ولم يكن جابر مطلعًا على جدول الزيارة التفصيلي.", "timestamp": "قبل يومين", "relatedSuspectIds": ["gaber_maintenance"], "important": false }
    ],
    "timeline": [
      { "time": "قبل يومين", "text": "الأسطى جابر يفحص جهاز الإنذار ويثبت سلامته." },
      { "time": "قبل يوم", "text": "يصل جدول الزيارة إلى عدد محدود من فريق التنظيم." },
      { "time": "صباح الزيارة", "text": "تبدأ جولة اللجنة داخل المبنى." },
      { "time": "قبل الوصول للطابق العلوي", "text": "يغادر مرافق اللجنة موقعه لدقائق." },
      { "time": "بعدها بدقائق", "text": "ينطلق الإنذار اليدوي من الممر الجانبي." }
    ],
    "hints": ["تحقق من مكان زر الإنذار: هل يمكن الضغط عليه بالصدفة؟", "مين كان يعرف توقيت تحرك اللجنة بالتفصيل؟", "اربط رسالة شادي وغيابه المؤقت بتوقيت الإنذار."],
    "culpritId": "shady_volunteer",
    "solutionExplanation": "الرسالة عن التوقيت لوحدها غامضة، ومكان الزر يخلي الضغط العابر أقل احتمالًا من غير ما يكشف مين عمله. جدول الجولة يوضح إن شادي يعرف حركة اللجنة، وسجل المرافقة يبين إنه ساب مكانه قبل الإنذار وما رجعش بالمياه. اجتماع المعرفة والتوقيت والغياب يرجح شادي، والرسالة بتلمّح إن فيه طرفًا تاني هيتكشف في الفصل الثالث «ملفات سرية».",
    "supportingEvidenceIds": ["alarm_location", "visit_schedule", "shady_message", "escort_log"]
  }
];

const CASE_TEXT_FIELDS = new Set([
  'title', 'summary', 'description', 'location', 'occupation', 'relationToCase',
  'statement', 'timeline', 'text', 'shortDescription', 'fullDescription',
  'hints', 'rewardedHints', 'solutionExplanation', 'timestamp',
]);

const EGYPTIAN_CASE_PHRASES = [
  ['فوضى الحفل الخيري', 'لخبطة الحفلة الخيرية'],
  ['توقيعات مزوّرة', 'توقيعات مضروبة'],
  ['الرسالة المجهولة', 'الجواب المجهول'],
  ['الأسماء التي تغيّرت', 'الأسماء اللي اتغيرت'],
  ['اللابتوب المفقود', 'اللابتوب اللي اختفى'],
  ['المتبرع المزيّف', 'المتبرع المزيف'],
  ['فواتير على الورق', 'فواتير مضروبة'],
  ['تخريب الترميم', 'تخريب شغل الترميم'],
  ['يجب معرفة', 'لازم نعرف'],
  ['يجب تحديد', 'لازم نحدد'],
  ['افحص السجلات', 'راجع السجلات'],
  ['افحص', 'بص على'],
  ['تحقق من', 'اتأكد من'],
  ['ابحث عن', 'دور على'],
  ['اجمع بين', 'اربط بين'],
  ['ابدأ بتحديد', 'ابدأ وحدد'],
  ['لم يُعثر على أثر اقتحام', 'ما لقوش أي أثر لاقتحام'],
  ['لا علاقة لهذه الملاحظة', 'الملاحظة دي مالهاش علاقة'],
  ['لا علاقة لهذه', 'دي مالهاش علاقة'],
  ['لا علاقة ب', 'مالهاش علاقة بـ'],
  ['لا يعتمد على', 'ما تعتمدش على'],
  ['لا تعتمد على', 'ما تعتمدش على'],
  ['لا تجعل', 'ما تخليش'],
  ['لا يكشف', 'ما بيكشفش'],
  ['لا تكشف', 'ما بتكشفش'],
  ['لا يوضح', 'ما بيوضحش'],
  ['لا توضح', 'ما بتوضحش'],
  ['لا يربط', 'ما بيربطش'],
  ['لا يذكر', 'ما بيذكرش'],
  ['لا يحدد', 'ما بيحددش'],
  ['لا يحمل', 'مش عليه'],
  ['لا تحمل', 'مش مكتوب عليها'],
  ['لم يبتعد', 'ما بعدش'],
  ['لم يقترب', 'ما قربش'],
  ['لم تذكر', 'ما جابتش سيرة'],
  ['لم تسمع', 'ما سمعتش'],
  ['لم يذكر', 'ما جابش سيرة'],
  ['لم يحدد', 'ما حددش'],
  ['لم يثبت', 'ما أثبتش'],
  ['لم يستطع تمييز', 'ما قدرش يميّز'],
  ['لم يستطع', 'ما قدرش'],
  ['لم يُعثر', 'ما لقوش'],
  ['لم يسجَّل', 'ما اتسجلش'],
  ['لم يسجل', 'ما اتسجلش'],
  ['لا يزال', 'لسه'],
  ['لا تزال', 'لسه'],
  ['لا يعرف', 'ما يعرفش'],
  ['لا تعرف', 'ما تعرفش'],
  ['لا تذكر', 'ما بتقولش'],
  ['لا تستطيع', 'ما تقدرش'],
  ['لا يستطيع', 'ما يقدرش'],
  ['لا يطابقان الأصل', 'مش زي الأصل'],
  ['لا يطابقان', 'مش شبه بعض'],
  ['لا يطابق', 'مش شبه'],
  ['لا يتضمن', 'مافيهوش'],
  ['لا يتضمن ', 'مافيهوش '],
  ['لا يربطها', 'ما بيربطهاش'],
  ['لا يربطه', 'ما بيربطوش'],
  ['لا يثبت', 'مش بيثبت'],
  ['لا تثبت', 'مش بتثبت'],
  ['لا يساعد', 'مش بيساعد'],
  ['لا تساعد', 'مش بتساعد'],
  ['لا يغيّر', 'ما بيغيرش'],
  ['لا يغير', 'ما بيغيرش'],
  ['لا يحتوي', 'مافيهوش'],
  ['لا تحتوي', 'مافيهاش'],
  ['لم يغادر', 'ما سابش'],
  ['لم يعد بها', 'ما رجعش بيها'],
  ['لم يتضمن', 'ماكانش فيه'],
  ['لم تتضمن', 'ماكانش فيها'],
  ['لم يُرسل', 'ما اتبعتش'],
  ['لم يرسل', 'ما اتبعتش'],
  ['لا يرتدي', 'مش لابس'],
  ['لا يشبه', 'مش شبه'],
  ['لا تشغّله', 'ما بتشغلوش'],
  ['لا تشغله', 'ما بتشغلوش'],
  ['به قطع', 'فيه قطع'],
  ['يلزم', 'لازم'],
  ['موثقة', 'متسجلة'],
  ['موثق', 'متسجل'],
  ['أثناء التحقيق', 'وقت التحقيق'],
  ['خلال الأسبوع', 'في الأسبوع'],
  ['الأسبوع السابق', 'الأسبوع اللي فات'],
  ['اليوم السابق', 'اليوم اللي قبله'],
  ['بعد الحدث بيومين', 'بعدها بيومين'],
  ['بعد الحدث بيوم', 'بعدها بيوم'],
  ['في أي وقت في اليوم', 'في أي وقت طول اليوم'],
  ['بما يشمل', 'وده يشمل'],
  ['منفردًا', 'لوحده'],
  ['منفردة', 'لوحدها'],
  ['فريدًا', 'مختلفًا'],
  ['فريدة', 'مختلفة'],
  ['يفترض أن', 'المفروض إن'],
  ['يفترض', 'المفروض'],
  ['يملك صلاحية', 'معاه صلاحية'],
  ['تملك صلاحية', 'معاها صلاحية'],
  ['الأشخاص', 'الناس'],
  ['التوقيتات', 'الأوقات'],
  ['توقيت ', 'وقت '],
  ['على حد علمي', 'على قد ما أعرف'],
  ['ما لقوش على أثر اقتحام', 'ما لقوش أي أثر لاقتحام'],
  ['لا تقول', 'ما بتقولش'],
  ['لا بتقول', 'ما بتقولش'],
  ['لا تثبت', 'ما بتثبتش'],
  ['لا تسجل', 'ما بتسجلش'],
  ['لا يساعد', 'مش بيساعد'],
  ['لا تساعد', 'مش بتساعد'],
  ['لا يغيّر', 'ما بيغيرش'],
  ['لا يغير', 'ما بيغيرش'],
  ['لا يحتوي', 'مافيهوش'],
  ['لا تحتوي', 'مافيهاش'],
  ['لا تحمل اسم', 'مش مكتوب عليها اسم'],
  ['يحوي', 'فيه'],
  ['تحوي', 'فيها'],
  ['يستبعد', 'بيستبعد'],
  ['تستبعد', 'بتستبعد'],
  ['يكشف', 'بيكشف'],
  ['تكشف', 'بتكشف'],
  ['يربط', 'بيربط'],
  ['يربطها', 'بيربطها'],
  ['يضع', 'بيحط'],
  ['تضع', 'بتحط'],
  ['يحدد', 'بيحدد'],
  ['تحدد', 'بتحدد'],
  ['يحوّل', 'بيحوّل'],
  ['تتحول', 'بتتحول'],
  ['يتلقى', 'بيستقبل'],
  ['تصل رسالة', 'وصلت رسالة'],
  ['تصل ', 'بتوصل '],
  ['يختفي', 'بيختفي'],
  ['تختفي', 'بتختفي'],
  ['المطلوب معرفة', 'محتاجين نعرف'],
  ['مطلوب معرفة', 'محتاجين نعرف'],
  ['عندما', 'لما'],
  ['أحد المتطوعين', 'واحد من المتطوعين'],
  ['أحد الأعضاء', 'واحد من الأعضاء'],
  ['هذا يفسر', 'وده يفسر'],
  ['هذا ', 'ده '],
  ['هذه ', 'دي '],
  ['ذلك ', 'ده '],
  ['الأخرى', 'التانية'],
  ['الآخر', 'التاني'],
  ['عُثر على', 'لقوا'],
  ['استُعيد جزء من محادثة', 'قدروا يرجعوا جزء من محادثة'],
  ['أُرسلت قبل الزيارة', 'اتبعتت قبل الزيارة'],
  ['مسجَّل دخولهم', 'متسجل دخولهم'],
  ['مسجَّل', 'متسجل'],
  ['أُنشئ', 'اتعمل'],
  ['حُفظ', 'اتحفظ'],
  ['عُدلت', 'اتعدلت'],
  ['نُشرت', 'اتنشرت'],
  ['لم تُحكم', 'ما قفلتش'],
  ['ما بداخل', 'اللي جوه'],
  ['الواقعة', 'اللي حصل'],
  ['الحادثة', 'اللي حصل'],
  ['النسخة الأولى تتناول', 'النسخة الأولى بتتكلم عن'],
  ['عن أهداف العام القادم', 'عن أهداف السنة الجاية'],
  ['يراجع', 'بيراجع'],
  ['تراجع', 'بتراجع'],
  ['يلاحظ', 'بيلاحظ'],
  ['تلاحظ', 'بتلاحظ'],
  ['يتضح', 'بيبان'],
  ['تتضح', 'بتبان'],
  ['قبل أن', 'قبل ما'],
  ['بعد أن', 'بعد ما'],
  ['الذين', 'اللي'],
  ['التي', 'اللي'],
  ['الذي', 'اللي'],
  ['اللاتي', 'اللي'],
  ['خلال', 'في'],
  ['أثناء', 'وقت'],
  ['فعليًا', 'بجد'],
  ['فقط', 'بس'],
  ['من دون', 'من غير'],
  ['دون ', 'من غير '],
  ['لا توجد', 'مفيش'],
  ['لا يوجد', 'مفيش'],
  ['لا تكفي', 'مش كفاية'],
  ['لا يكفي', 'مش كفاية'],
  ['لا يثبت', 'مش بيثبت'],
  ['لا تثبت', 'مش بتثبت'],
  ['لا يظهر', 'مش بيظهر'],
  ['لا تظهر', 'مش بتظهر'],
  ['لا يسجل', 'مش بيسجل'],
  ['لا يحدد', 'ما بيحددش'],
  ['لم يكن', 'ماكانش'],
  ['لم تكن', 'ماكانتش'],
  ['لم يظهر', 'ما ظهرش'],
  ['لم تظهر', 'ما ظهرتش'],
  ['تثبت', 'بتثبت'],
  ['يثبت', 'بيثبت'],
  ['تؤكد', 'بتأكد'],
  ['يؤكد', 'بيأكد'],
  ['تُظهر', 'بتوضح'],
  ['يُظهر', 'بيوضح'],
  ['تظهر', 'بتظهر'],
  ['يظهر', 'بيظهر'],
  ['توضح', 'بتوضح'],
  ['يوضح', 'بيوضح'],
  ['تفيد بأنه', 'بتقول إنه'],
  ['يفيد بأنه', 'بيقول إنه'],
  ['تقول', 'بتقول'],
  ['يقول', 'بيقول'],
  ['مما ', 'وده '],
  ['لذلك', 'عشان كده'],
  ['لهذا', 'عشان كده'],
  ['لكنها', 'بس هي'],
  ['لكنه', 'بس هو'],
  ['لكنهم', 'بس هما'],
  ['غير أن', 'بس'],
  ['يرجح', 'بيرجّح'],
  ['ترجح', 'بترجّح'],
  ['بالتحديد', 'بالظبط'],
  ['الأسرة المستفيدة', 'الأسرة اللي بتاخد مساعدة'],
  ['الأسر المستفيدة', 'الأسر اللي بتاخد مساعدة'],
];

const CASE_SOLUTION_EGYPTIAN = {
  donation_envelope: 'صورة منى بتأكد إن الظرف كان لسه في الدرج بعد ما دخلت. سجل الباب والكاميرا بيحددوا حركة الخروج وقت ما الظرف اختفى، بس الكاميرا ما بتكشفش الوش ولا اللي جوه الملف. الإيصال متسجل الساعة 2:18 من محل بعيد أربع دقايق، وده ما يركبش مع كلام أحمد إنه رجع 2:10، خصوصًا إن الشخص رجع المكتب 2:22 من غير الملف. خالد كان خرج قبل الفترة دي. لما نجمع الأوقات مع بعض، الأدلة بترجّح أحمد؛ مفيش دليل واحد لوحده حسم الموضوع.',
  gala_blackout: 'التقرير الفني بيقول إن الكابل اتقطع عمدًا، مش عطل عادي. سجل البطاقة بيحط بطاقة الصحافة جوه غرفة المعدات قبل اللي حصل، والشاهد شاف حد بكاميرا صحفية عند التوصيلات من غير ما يشوف وشه. البطاقة كانت مع سالي، وهي قالت إنها ما دخلتش أي غرفة خاصة. كمان مسودة مقالها اتعملت قبل انقطاع الصوت واتعدلت بعده. كل قرينة لوحدها مش دليل قاطع، بس لما نجمع الحركة والتوقيت والمقال، سالي هي الأرجح. البث وشهادة نورهان بيثبتوا إن مؤمن كان عند منصة التحكم، وكريم كان جنب المتبرع، ومراد ما دخلش غرفة المعدات.',
  forged_signatures: 'سجل البوابة فيه 34 شخص حضروا فعلًا، مع إن كشف يوسف فيه 42 توقيع. عينة خطه شبه الأسماء الزيادة، والرسالة اللي بعتها قبل الفعالية بتقول خلّوا الكشف كامل عشان فريقه ما يبانش أقل من الفرق التانية. الرسالة لوحدها مش اعتراف، بس مع فرق العدد وتشابه الخط بتوضح إن يوسف هو اللي زوّد الأسماء.',
  anonymous_letter: 'الرسالة اتطبعت من طابعة الجمعية، بس سجل الطابعة ما بيحددش مين استخدمها. بطاقة الزائر اللي كانت مع هالة دخلت وقت الطباعة وخرجت بعدها بدقايق. هالة كان وصلها رقم البند الداخلي، وطريقة كتابة الرسالة شبه كلامها في رسايل قديمة. مراد كان بره المدينة، وكريم كان عارف الرقم من اجتماع معلن. لما نربط وقت الدخول بالمعلومة وأسلوب الكتابة، الأدلة بترجّح هالة؛ ومفيش علامة واحدة لوحدها بتحسم الموضوع.',
  changed_beneficiary_names: 'سجل الدخول بيأكد إن ريم دخلت على النظام بره مواعيد الشغل، والاسمين اللي اتضافوا مالهمش استمارات التقييم المطلوبة. واحدة من الأسرتين هي أسرة خالتها، وزميلتها قالت إن ريم كانت قلقانة على ظروف خالتها قبل التعديل. كده الدافع وطريقة التعديل بيربطوا ريم بالقضية. حسن كان في زيارة ميدانية موثقة، وكريم هو اللي بلغ عن مبلغ المساعدة، وفاطمة اعترضت بعد ما اسم أسرتها اتمسح، يعني هي متضررة مش الفاعلة.',
  missing_donor_laptop: 'رقم الجهاز في إيصال الرهن مطابق للابتوب المختفي، وآخر أربع أرقام من رقم الموبايل في المعاملة هي نفس رقم سامر. مكالمات تحصيل الديون تشرح ليه كان محتاج فلوس، وسؤاله عن المفتاح يوضح إنه كان بيدور على طريقة يدخل المخزن. دخول كريم للمبنى ما يثبتش إنه دخل المخزن، وخطأ منى القديم في قفل الباب ما بيربطهاش برهن الجهاز. الأدلة بترجّح سامر.',
  fake_donor_call: 'مقارنة المكالمة بالتسجيل العلني بتوضح إن الصوت متجمع من مقاطع متفرقة، ومشروع يوسف فيه مقاطع من نفس التسجيل قبل المكالمة بيومين. رسالته عن رغبته يرجع يثبت نفسه ممكن تكون دافع، بس مش اعتراف. لما نجمع مصدر الصوت والمشروع وتوقيته مع الرسالة، يوسف هو الأرجح. طارق بلغ عن غرابة المكالمة، وسالي سألت عن الموضوع بعد ما حصل.',
  forged_purchase_invoices: 'تحليل التوقيع والختم بيأكد إن الفواتير مش أصلية. إيصال محل الأختام بيبين إن سالي طلبت ختم مطاطي قبل اللي حصل، ومسودة المقال اللي بدأت قبل التدقيق كان فيها تفاصيل الفواتير من بدري. لما نجمع الدليلين دول مع بعض، سالي هي الأرجح إنها زوّرت الفواتير. كريم والأستاذ فتحي اتزورت أسماؤهم وأختامهم.',
  restoration_sabotage: 'سيد خسر المناقصة لمراد، وده بيديله دافع يعطل شغل الترميم. حارس الأمن شاف عربية شبه عربيته قرب المدخل وقت حوادث التخريب، والكاميرا بتأكد إن حد غريب كان بيدخل المنطقة بالليل. أداة القطع ممكن تكون اتنقلت، فمش دليل حاسم لوحدها. تجميع التوقيت مع الدافع وشهادة الحارس بيرجّح سيد، لكنه ما يثبتش هويته بشكل قاطع؛ مراد بيتضرر من التأخير وبلال مالوش علاقة غير بغلط قديم.',
  false_fire_alarm: 'شادي شغّل إنذار الحريق بالتنسيق مع حد تاني. الرسالة لوحدها مش بتقول إنهم كانوا مخططين للإنذار، بس جدول الجولة يثبت إن شادي كان عارف اللجنة هتوصل إمتى، وسجل المرافقة بيبين إنه ساب مكانه قبل الإنذار بدقايق. مكان الزر بعيد عن طريق الناس المعتاد، فده بيستبعد إن حد ضغطه بالغلط. الشخص التاني لسه مجهول، وده الخيط اللي هيكمل للفصل التالت «ملفات سرية».',
};

const CASE_OVERVIEWS_EGYPTIAN = {
  donation_envelope: {
    summary: 'ظرف التبرعات اختفى من مكتب الجمعية في الفترة ما بين الساعة 2 و2:22.',
    description: 'ظرف التبرعات اختفى من مكتب الجمعية في وقت قصير. المكتب كان مفتوح للموظفين، ومفيش أي أثر لاقتحام. راجع السجلات والأقوال عشان تعرف مين أخد الظرف.',
  },
  gala_blackout: {
    summary: 'الصوت قطع فجأة في حفل التبرعات السنوي، وده عمل إحراج قدام المتبرعين والصحافة.',
    description: 'في عز كلمة رئيسة الجمعية عن أهداف السنة الجاية، الصوت قطع فجأة في القاعة الكبيرة، تحت لوحة تكريم الحاج سامي اللي على الحيطة الخلفية. بعد كده اكتشفوا إن جزء من الكابلات اتقطع. الحكاية حصلت وفيه متبرع كبير موجود، وكان المفروض يعلن عن تبرعه على الهوا. يا ترى ده عطل عادي ولا حد بوّظ الصوت عمدًا؟',
  },
  forged_signatures: {
    summary: 'كشف حضور يوم التنضيف فيه 42 توقيع، مع إن سجل البوابة بيأكد إن اللي حضروا فعلًا كانوا 34 بس.',
    description: 'منى بتجهز تقرير الأنشطة لمنحة الخير، فتلاحظ إن كشف يوم التنضيف اللي سلّمه يوسف فيه 42 توقيع. بس سجل البوابة المستقل، اللي بيسجل كل واحد حضر ووقت دخوله طول اليوم، فيه 34 اسم مختلف بس. محتاجين نعرف مين زوّد الـ8 أسماء دول وليه.',
  },
  anonymous_letter: {
    summary: 'جواب مجهول وصل للجنة منحة الخير، بيتهم الجمعية بسوء التصرف في التبرعات قبل زيارة التقييم بأسابيع.',
    description: 'لجنة منحة الخير وصلها جواب مطبوع من غير اسم أو عنوان مرسل. الجواب بيتهم الجمعية إنها بتصرف جزء من التبرعات بشكل مش واضح، وبيذكر رقم داخلي دقيق في الميزانية. لازم نعرف مين كتبه قبل ما يأثر على قرار المنحة.',
  },
  changed_beneficiary_names: {
    summary: 'منى اكتشفت إن أسرتين اتشالوا من قائمة المساعدات، واتضاف مكانهم اسمين من غير تقييم ميداني.',
    description: 'قبل زيارة لجنة منحة الخير، منى بتراجع قائمة الأسر اللي بتاخد مساعدات، فتلاقي اسمين معتمدين اتشالوا واسمين جداد اتضافوا من غير تقييم ميداني. وكمان مساعدة واحدة من الأسر الجديدة أعلى من المعتاد من غير ورق يفسر السبب. مين غيّر القائمة وليه؟',
  },
  missing_donor_laptop: {
    summary: 'لابتوب عليه بيانات كبار المتبرعين اختفى من مخزن مقفول من غير أي أثر اقتحام.',
    description: 'قبل زيارة لجنة منحة الخير، اللابتوب الوحيد اللي عليه نسخة محدثة من بيانات كبار المتبرعين اختفى من مخزن مقفول. الباب مفيهوش أي أثر اقتحام. تتبعوا المفتاح وأثر اللابتوب عشان تعرفوا مين أخده.',
  },
  fake_donor_call: {
    summary: 'شخص قلّد صوت متبرع كبير واتصل بالجمعية وقال إنه هيسحب تبرعه قبل زيارة اللجنة.',
    description: 'مكتب الجمعية استقبل مكالمة من شخص بيقلد صوت الأستاذ سامح، وقال إنه هيسحب تبرعه الكبير بسبب اللي حصل مؤخرًا. طارق حس إن في حاجة غريبة في الصوت، والتحقيق كشف إن المكالمة معمولة من تسجيلات متجمعة. مين اللي عملها؟',
  },
  forged_purchase_invoices: {
    summary: 'ثلاث فواتير مشتريات تنظيف مضروبة، عليها توقيع كريم وختم محل الأدوات.',
    description: 'في مراجعة حسابات قبل زيارة لجنة المنحة، ظهرت 3 فواتير لأدوات تنظيف بمبالغ أكبر من الحقيقة، وممضية باسم كريم. كريم بيقول إنه ما مضاش عليها، وصاحب المحل بينفي إنه طلع الفواتير أو استخدم الختم ده.',
  },
  restoration_sabotage: {
    summary: 'معدات ورشة الترميم بتتخرب بالليل، وده ممكن يأخر الشغل قبل زيارة اللجنة.',
    description: 'على مدار أسبوع، حد بيبوّظ معدات ورشة الترميم: بيقطع كابلات وبيكب مواد على الخشب المعالج. قرب مراد من الورشة بيخليه أول واحد الناس تشك فيه، بس في آثار بتشير لحد من بره فريقه. مين اللي بيخرب الشغل؟',
  },
  false_fire_alarm: {
    summary: 'إنذار الحريق اشتغل يدوي وقت جولة اللجنة، مع إن مفيش حريق.',
    description: 'صباح زيارة لجنة تقييم منحة الخير، إنذار الحريق اشتغل واللجنة بدأت جولتها، مع إن مفيش حريق. حد ضغط زر الإنذار بإيده من ممر جانبي فوق، وفي توقيت ماكانش يعرفه غير ناس قليلة. مين عطّل الزيارة؟',
  },
};

function toEgyptianCaseText(value) {
  let text = value;
  for (const [formal, egyptian] of EGYPTIAN_CASE_PHRASES) text = text.split(formal).join(egyptian);
  return text
    .split('ببت').join('بت')
    .split('ببي').join('بي')
    .split('بتبت').join('بت')
    .split('بسها').join('بس هي')
    .split('بسه').join('بس هو')
    .split('من بس').join('من غير ما')
    .split('لا بت').join('ما بت')
    .split('لا بي').join('ما بي')
    .split('مافيهوش على').join('مافيهوش')
    .split('مافيهاش على').join('مافيهاش')
    .split('ماكانش فيه الفحص عبثًا بالإنذار').join('الفحص ما كشفش أي عبث بالإنذار')
    .split('ما قدرش تمييز').join('ما قدرش يميّز')
    .split('لم يُعثر على أثر اقتحام').join('ما لقوش أي أثر لاقتحام')
    .replace(/لكن(?=[،؛.!؟\s])/g, 'بس');
}

function localizeCaseNode(node, parentKey = '') {
  if (Array.isArray(node)) {
    return node.map((item) => typeof item === 'string' && CASE_TEXT_FIELDS.has(parentKey)
      ? toEgyptianCaseText(item)
      : localizeCaseNode(item, parentKey));
  }
  if (!node || typeof node !== 'object') return node;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && CASE_TEXT_FIELDS.has(key)) node[key] = toEgyptianCaseText(value);
    else if (Array.isArray(value) || (value && typeof value === 'object')) node[key] = localizeCaseNode(value, key);
  }
  return node;
}

for (const caseData of CASES) localizeCaseNode(caseData);
for (const caseData of CASES) {
  const overview = CASE_OVERVIEWS_EGYPTIAN[caseData.id];
  if (overview) Object.assign(caseData, overview);
  if (CASE_SOLUTION_EGYPTIAN[caseData.id]) caseData.solutionExplanation = CASE_SOLUTION_EGYPTIAN[caseData.id];
}
for (const chapter of CHAPTERS) {
  chapter.description = toEgyptianCaseText(chapter.description);
  chapter.caseSlots = chapter.caseSlots.map(toEgyptianCaseText);
}

function publicCase(caseData) {
  const { culpritId, solutionExplanation, supportingEvidenceIds, hints, rewardedHints, ...visible } = caseData;
  return visible;
}

function publicCampaign(progress = {}) {
  const completed = new Set(progress.solvedCaseIds || []);
  const chapters = CHAPTERS.map((chapter) => {
    const unlocked = chapter.order === 1 || chapter.openForTesting === true || CHAPTERS
      .filter((candidate) => candidate.order === chapter.order - 1)
      .every((previous) => previous.requiredCaseIds.every((id) => completed.has(id)));
    const cases = chapter.caseIds.map((id) => CASES.find((item) => item.id === id)).filter(Boolean);
    return {
      id: chapter.id, title: chapter.title, description: chapter.description, order: chapter.order,
      caseCount: chapter.cases, requiredCaseIds: chapter.requiredCaseIds, reward: chapter.reward,
      unlocked, completed: chapter.requiredCaseIds.every((id) => completed.has(id)),
      cases: [ ...cases.map((item) => ({
        id: item.id, title: item.title, difficulty: item.difficulty,
        stars: Math.max(Number(progress.caseRecords?.[item.id]?.bestStars) || 0, Number(progress.caseRecords?.[item.id]?.stars) || 0),
        solved: completed.has(item.id), available: true,
      })), ...(chapter.caseSlots || []).slice(cases.length).map((title, index) => ({
        id: `locked_${chapter.id}_${index + cases.length + 1}`, title,
        stars: 0, solved: false, available: false,
      })) ],
    };
  });
  return { chapters, caseCount: CASES.length };
}

function findCase(caseId) { return CASES.find((item) => item.id === String(caseId)); }

// Kept for the legacy streak endpoints while the campaign client moves over.
// Every case in the bank is currently 'hard', so an exact difficulty match is
// not always possible; when the exact tier has no (fresh) case left we widen
// the pool to any case the player has not seen recently instead of always
// handing back CASES[0]. `usedIds` (cases already shown in this run) is
// honored first so a single run never repeats a case.
function selectCase(difficulty = 2, usedIds = []) {
  const target = difficulty >= 3 ? 'hard' : difficulty === 1 ? 'easy' : 'medium';
  const used = Array.isArray(usedIds) ? usedIds : [];
  const inTier = CASES.filter((item) => item.difficulty === target);
  const poolOrder = [
    inTier.filter((item) => !used.includes(item.id)),
    inTier,
    CASES.filter((item) => !used.includes(item.id)),
    CASES,
  ];
  for (const pool of poolOrder) {
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return CASES[0];
}

module.exports = { CASES, CHAPTERS, findCase, publicCase, publicCampaign, selectCase };
