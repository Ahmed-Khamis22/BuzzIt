import json
import os

# 1. Reversed Words Generator (100 common Arabic words)
reversed_words_base = [
    {"word": "كمبيوتر", "diff": "medium"},
    {"word": "تلفزيون", "diff": "medium"},
    {"word": "ديناصور", "diff": "hard"},
    {"word": "مهندس", "diff": "easy"},
    {"word": "موبايل", "diff": "easy"},
    {"word": "طيارة", "diff": "easy"},
    {"word": "تفاحة", "diff": "easy"},
    {"word": "أتوبيس", "diff": "medium"},
    {"word": "مستشفى", "diff": "medium"},
    {"word": "جامعة", "diff": "medium"},
    {"word": "مدرسة", "diff": "easy"},
    {"word": "طبيب", "diff": "easy"},
    {"word": "أستاذ", "diff": "easy"},
    {"word": "كتاب", "diff": "easy"},
    {"word": "نظارة", "diff": "easy"},
    {"word": "ساعة", "diff": "easy"},
    {"word": "مفتاح", "diff": "easy"},
    {"word": "شباك", "diff": "easy"},
    {"word": "طاولة", "diff": "easy"},
    {"word": "مطبخ", "diff": "easy"},
    {"word": "حديقة", "diff": "easy"},
    {"word": "شارع", "diff": "easy"},
    {"word": "مدينة", "diff": "easy"},
    {"word": "جزيرة", "diff": "medium"},
    {"word": "محيط", "diff": "medium"},
    {"word": "سفينة", "diff": "medium"},
    {"word": "دراجة", "diff": "medium"},
    {"word": "سيارة", "diff": "easy"},
    {"word": "تلفون", "diff": "easy"},
    {"word": "تكييف", "diff": "medium"},
    {"word": "ثلاجة", "diff": "medium"},
    {"word": "غسالة", "diff": "easy"},
    {"word": "بوتاجاز", "diff": "medium"},
    {"word": "مروحة", "diff": "easy"},
    {"word": "شاحن", "diff": "easy"},
    {"word": "سماعة", "diff": "easy"},
    {"word": "كاميرا", "diff": "easy"},
    {"word": "شاشة", "diff": "easy"},
    {"word": "كهرباء", "diff": "hard"},
    {"word": "مغناطيس", "diff": "hard"},
    {"word": "تلسكوب", "diff": "hard"},
    {"word": "ميكروسكوب", "diff": "hard"},
    {"word": "صاروخ", "diff": "medium"},
    {"word": "كوكب", "diff": "easy"},
    {"word": "مجرة", "diff": "medium"},
    {"word": "رائد فضاء", "diff": "hard"},
    {"word": "تاريخ", "diff": "easy"},
    {"word": "جغرافيا", "diff": "hard"},
    {"word": "رياضيات", "diff": "hard"},
    {"word": "فيزياء", "diff": "hard"},
    {"word": "كيمياء", "diff": "hard"},
    {"word": "أحياء", "diff": "easy"},
    {"word": "فلسفة", "diff": "medium"},
    {"word": "موسيقى", "diff": "medium"},
    {"word": "رواية", "diff": "easy"},
    {"word": "قصيدة", "diff": "medium"},
    {"word": "مسرحية", "diff": "medium"},
    {"word": "سينما", "diff": "easy"},
    {"word": "متحف", "diff": "easy"},
    {"word": "معرض", "diff": "easy"},
    {"word": "مكتبة", "diff": "easy"},
    {"word": "حكومة", "diff": "medium"},
    {"word": "رئيس", "diff": "easy"},
    {"word": "وزير", "diff": "easy"},
    {"word": "سفير", "diff": "easy"},
    {"word": "قانون", "diff": "easy"},
    {"word": "محكمة", "diff": "medium"},
    {"word": "قاضي", "diff": "easy"},
    {"word": "محامي", "diff": "easy"},
    {"word": "شرطة", "diff": "easy"},
    {"word": "جيش", "diff": "easy"},
    {"word": "جنود", "diff": "easy"},
    {"word": "معركة", "diff": "medium"},
    {"word": "انتصار", "diff": "medium"},
    {"word": "حرية", "diff": "easy"},
    {"word": "سلام", "diff": "easy"},
    {"word": "وطن", "diff": "easy"},
    {"word": "شعب", "diff": "easy"},
    {"word": "حضارة", "diff": "medium"},
    {"word": "آثار", "diff": "easy"},
    {"word": "مومياء", "diff": "medium"},
    {"word": "فرعون", "diff": "easy"},
    {"word": "أهرامات", "diff": "medium"},
    {"word": "تمثال", "diff": "easy"},
    {"word": "قلعة", "diff": "easy"},
    {"word": "برج", "diff": "easy"},
    {"word": "ناطحة سحاب", "diff": "hard"},
    {"word": "طريق سريعة", "diff": "hard"},
    {"word": "مطار", "diff": "easy"},
    {"word": "محطة", "diff": "easy"},
    {"word": "تذكرة", "diff": "easy"},
    {"word": "حقيبة", "diff": "easy"},
    {"word": "فندق", "diff": "easy"},
    {"word": "سياحة", "diff": "medium"},
    {"word": "شاطئ", "diff": "easy"},
    {"word": "رمال", "diff": "easy"},
    {"word": "أمواج", "diff": "easy"},
    {"word": "غابة", "diff": "easy"},
    {"word": "أشجار", "diff": "easy"},
    {"word": "زهور", "diff": "easy"}
]

reversed_words_questions = []
for item in reversed_words_base:
    word = item["word"]
    # Reverse letters with spaces
    letters = list(word.replace(" ", ""))
    letters.reverse()
    reversed_text = " - ".join(letters)
    reversed_words_questions.append({
        "text": f"الكلمة المعكوسة: {reversed_text}",
        "category": "reversed-words",
        "answer": word,
        "difficulty": item["diff"]
    })

# 2. Flags Generator (42 countries)
flags_base = [
    {"name": "مصر", "code": "eg"},
    {"name": "السعودية", "code": "sa"},
    {"name": "المغرب", "code": "ma"},
    {"name": "الإمارات", "code": "ae"},
    {"name": "فلسطين", "code": "ps"},
    {"name": "الأردن", "code": "jo"},
    {"name": "لبنان", "code": "lb"},
    {"name": "تونس", "code": "tn"},
    {"name": "الجزائر", "code": "dz"},
    {"name": "الكويت", "code": "kw"},
    {"name": "البحرين", "code": "bh"},
    {"name": "قطر", "code": "qa"},
    {"name": "سلطنة عمان", "code": "om"},
    {"name": "العراق", "code": "iq"},
    {"name": "سوريا", "code": "sy"},
    {"name": "السودان", "code": "sd"},
    {"name": "ليبيا", "code": "ly"},
    {"name": "موريتانيا", "code": "mr"},
    {"name": "اليمن", "code": "ye"},
    {"name": "الصومال", "code": "so"},
    {"name": "فرنسا", "code": "fr"},
    {"name": "إيطاليا", "code": "it"},
    {"name": "إسبانيا", "code": "es"},
    {"name": "ألمانيا", "code": "de"},
    {"name": "إنجلترا", "code": "gb"},
    {"name": "البرازيل", "code": "br"},
    {"name": "الأرجنتين", "code": "ar"},
    {"name": "اليابان", "code": "jp"},
    {"name": "الصين", "code": "cn"},
    {"name": "أمريكا", "code": "us"},
    {"name": "كندا", "code": "ca"},
    {"name": "روسيا", "code": "ru"},
    {"name": "تركيا", "code": "tr"},
    {"name": "المكسيك", "code": "mx"},
    {"name": "البرتغال", "code": "pt"},
    {"name": "هولندا", "code": "nl"},
    {"name": "بلجيكا", "code": "be"},
    {"name": "السويد", "code": "se"},
    {"name": "سويسرا", "code": "ch"},
    {"name": "الهند", "code": "in"},
    {"name": "كوريا الجنوبية", "code": "kr"},
    {"name": "أستراليا", "code": "au"},
    {"name": "كوراساو", "code": "cw"},
    {"name": "المالديف", "code": "mv"},
    {"name": "سنغافورة", "code": "sg"},
    {"name": "آيسلندا", "code": "is"},
    {"name": "جامايكا", "code": "jm"},
    {"name": "مدغشقر", "code": "mg"},
    {"name": "موناكو", "code": "mc"},
    {"name": "البهاما", "code": "bs"},
    {"name": "نيبال", "code": "np"},
    {"name": "سريلانكا", "code": "lk"},
    {"name": "الرأس الأخضر", "code": "cv"}
]

flags_questions = []
for item in flags_base:
    flags_questions.append({
        "text": "ما هي الدولة صاحبة هذا العلم؟",
        "category": "flags",
        "answer": item["name"],
        "difficulty": "medium" if item["code"] not in ["eg", "sa", "ma", "ae", "ps"] else "easy",
        "flagImage": f"https://flagcdn.com/w640/{item['code']}.png"
    })

# 3. Word in Song Generator (35 common song words)
song_words = [
    {"word": "حبيبي", "ans": "يا نور العين"},
    {"word": "البحر", "ans": "يا واد يا تقيل"},
    {"word": "الليل", "ans": "آه يا ليل"},
    {"word": "الهوا", "ans": "جانا الهوا"},
    {"word": "عيون", "ans": "عيونك شايفها"},
    {"word": "حب", "ans": "الحب كله"},
    {"word": "قلبي", "ans": "يا طيب القلب"},
    {"word": "روحي", "ans": "يا روحي غيبي"},
    {"word": "يا ليل", "ans": "يا ليل وعين"},
    {"word": "جميل", "ans": "حلو وجميل"},
    {"word": "شوق", "ans": "علمني الشوق"},
    {"word": "دنيا", "ans": "الدنيا حلوة"},
    {"word": "قمر", "ans": "يا واد يا قمر"},
    {"word": "نور", "ans": "يا نور عيني"},
    {"word": "سهر", "ans": "سهر الليالي"},
    {"word": "غالي", "ans": "يا غالي عليا"},
    {"word": "وداع", "ans": "ساعة الوداع"},
    {"word": "سفر", "ans": "مكتوب عليا السفر"},
    {"word": "غربة", "ans": "يا غربة"},
    {"word": "فراق", "ans": "فراق بفراق"},
    {"word": "كلام", "ans": "كلام الناس"},
    {"word": "حلم", "ans": "حلم جميل"},
    {"word": "طريق", "ans": "طريقنا طويل"},
    {"word": "عمر", "ans": "العمر مشوار"},
    {"word": "زمن", "ans": "يا زمن"},
    {"word": "ضحكة", "ans": "ضحكتها علامة"},
    {"word": "دموع", "ans": "دموعي تنزل"},
    {"word": "جرح", "ans": "جرح تاني"},
    {"word": "صبر", "ans": "الصبر طيب"},
    {"word": "ورد", "ans": "يا ورد مين يشتريك"},
    {"word": "شمس", "ans": "شمس الشموسة"},
    {"word": "سما", "ans": "السما زرقا"},
    {"word": "مطر", "ans": "مطر مطر"},
    {"word": "بلد", "ans": "يا بلدنا"},
    {"word": "صاحب", "ans": "يا صاحبي"}
]

song_questions = []
for item in song_words:
    song_questions.append({
        "text": f"قول/غني مقطع من أغنية فيها كلمة: '{item['word']}'",
        "category": "word-in-song",
        "answer": item["ans"],
        "difficulty": "easy"
    })

# 4. Describe It (35 tricky riddles)
describe_it_questions = [
    {"text": "حاجة ليها سنان كتير بس مش بتعض؟", "answer": "المشط"},
    {"text": "حاجة بتشتريها خضرا، وتكون حمرا في السوق، وتبقى سودا لما تستخدمها في البيت؟", "answer": "الشاي"},
    {"text": "حاجة بتشتريها عشان تكسرها قبل ما تستخدمها؟", "answer": "البيض"},
    {"text": "حاجة بتمشي وتوقف بس ملهاش رجلين؟", "answer": "الساعة"},
    {"text": "حاجة بتطير بس ملهاش جناحين وممكن تبكي بدون عينين؟", "answer": "السحاب"},
    {"text": "حاجة كل ما تاخد منها تكبر وكل ما تضيف ليها تصغر؟", "answer": "الحفرة"},
    {"text": "حاجة بتمشي وراك طول النهار ومتقدرش تلمسها؟", "answer": "الضل"},
    {"text": "بيت ملوش أبواب ولا شبابيك؟", "answer": "البيض"},
    {"text": "حاجة بتتكلم كل لغات العالم وملهاش لسان؟", "answer": "صدى الصوت"},
    {"text": "حاجة بتعدي المايه ومبتتبلش؟", "answer": "الضوء"},
    {"text": "حاجة بتكبر لما نضربها؟", "answer": "الأعداد"},
    {"text": "حاجة ليها عين واحدة بس مبتشوفش؟", "answer": "الإبرة"},
    {"text": "حاجة بتدخل المايه ناشفة وتطلع مبلولة؟", "answer": "الاسفنج"},
    {"text": "حاجة بتكتب ومبتعرفش تقرأ؟", "answer": "القلم"},
    {"text": "حاجة كل ما تغليها تجمد؟", "answer": "البيض"},
    {"text": "حاجة بتسمع بلا أذن وتتكلم بلا لسان؟", "answer": "التلفون"},
    {"text": "حاجة إذا لمستها بتصرخ؟", "answer": "الجرس"},
    {"text": "حاجة بتولد في النار وإذا رجعت ليها بتموت؟", "answer": "الفحم"},
    {"text": "حاجة بنرميها بعد ما نطبخها وناكل اللي جواها؟", "answer": "البيض"},
    {"text": "حاجة بتنقص كل ما زادت؟", "answer": "العمر"},
    {"text": "حاجة بتنضف لما تسود؟", "answer": "السبورة"},
    {"text": "حاجة بتطلع الجبل من غير رجلين؟", "answer": "الدخان"},
    {"text": "حاجة بتاكل ومتشبعش وإذا شربت تموت؟", "answer": "النار"},
    {"text": "حاجة ليها رجلين ومبتمشيش؟", "answer": "البنطلون"},
    {"text": "حاجة بترميه لما تحتاجها؟", "answer": "هلب السفينة"},
    {"text": "حاجة موجودة في وسط باريس؟", "answer": "حرف الراء"},
    {"text": "حاجة موجودة في القرن مرة وفي الدقيقة مرتين وموجودة في الساعة؟", "answer": "حرف القاف"},
    {"text": "ابن مامتك وباباك وميبقاش أخوك ولا أختك؟", "answer": "أنت"},
    {"text": "حاجة مليانة ثقوب ومع ذلك بتحفظ المايه جواها؟", "answer": "الاسفنج"},
    {"text": "حاجة بتتحرك حواليك بس متشوفهاش؟", "answer": "الهواء"},
    {"text": "حاجة بتشوف كل شيء ومعندهاش عيون؟", "answer": "المراية"},
    {"text": "شجرة ملهاش ظل ولا ثمار؟", "answer": "شجرة العائلة"},
    {"text": "حاجة بتجري ومبتتعبش؟", "answer": "الماء"},
    {"text": "حاجة بنمشي عليها ومبنقدرش نعديها؟", "answer": "السقف"},
    {"text": "حاجة بتصنعها بس متقدرش تشوفها؟", "answer": "الصوت"}
]

describe_questions = []
for item in describe_it_questions:
    describe_questions.append({
        "text": item["text"],
        "category": "describe-it",
        "answer": item["answer"],
        "difficulty": "medium"
    })

# 5. General Knowledge (50 verified solid questions)
general_knowledge_base = [
    {"text": "ما هو الكوكب الأكثر سخونة في المجموعة الشمسية؟", "answer": "الزهرة"},
    {"text": "ما هي أصغر دولة في العالم؟", "answer": "الفاتيكان"},
    {"text": "ما هو العضو الوحيد في جسم الإنسان الذي يمكنه إعادة النمو بعد استئصال جزء منه؟", "answer": "الكبد"},
    {"text": "ما هي الدولة الأفريقية الوحيدة التي لم تُستعمر قط؟", "answer": "إثيوبيا"},
    {"text": "ما هو البحر الأكثر ملوحة في العالم؟", "answer": "البحر الميت"},
    {"text": "ما هو الغاز الأكثر وفرة في الغلاف الجوي للأرض؟", "answer": "النيتروجين"},
    {"text": "ما هي عاصمة أستراليا؟", "answer": "كانبرا"},
    {"text": "ما هو أطول نهر في العالم؟", "answer": "نهر النيل"},
    {"text": "ما هي عاصمة اليابان؟", "answer": "طوكيو"},
    {"text": "كم عدد كواكب المجموعة الشمسية؟", "answer": "8"},
    {"text": "ما هي أكبر صحراء في العالم؟", "answer": "الصحراء الكبرى"},
    {"text": "ما هو أسرع حيوان بري في العالم؟", "answer": "الفهد"},
    {"text": "ما هو الحيوان الذي يُلقب بملك الغابة؟", "answer": "الأسد"},
    {"text": "ما هو المحيط الأكبر في العالم؟", "answer": "المحيط الهادئ"},
    {"text": "ما هي أكبر جزيرة في العالم؟", "answer": "جرينلاند"},
    {"text": "ما هو أصغر محيط في العالم؟", "answer": "المحيط المتجمد الشمالي"},
    {"text": "في أي قارة تقع صحراء غوبي؟", "answer": "آسيا"},
    {"text": "ما هو المعدن الذي يوجد في الحالة السائلة في درجة حرارة الغرفة؟", "answer": "الزئبق"},
    {"text": "ما هو الفيتامين الذي يتم تصنيعه في الجلد عند التعرض لأشعة الشمس؟", "answer": "فيتامين د"},
    {"text": "ما هو العنصر الكيميائي الذي يمثله الرمز Fe؟", "answer": "الحديد"},
    {"text": "ما هو أكبر بلد في العالم من حيث المساحة؟", "answer": "روسيا"},
    {"text": "ما هي عاصمة فرنسا؟", "answer": "باريس"},
    {"text": "ما هو أثقل حيوان في العالم؟", "answer": "الحوت الأزرق"},
    {"text": "كم عدد صمامات قلب الإنسان؟", "answer": "4"},
    {"text": "ما هي عملة دولة اليابان؟", "answer": "الين"},
    {"text": "ما هي عاصمة إيطاليا؟", "answer": "روما"},
    {"text": "كم عدد أسنان الشخص البالغ؟", "answer": "32"},
    {"text": "ما هي عاصمة روسيا؟", "answer": "موسكو"},
    {"text": "من هو مكتشف الجاذبية الأرضية؟", "answer": "إسحاق نيوتن"},
    {"text": "ما هو الاسم العلمي للماء؟", "answer": "H2O"},
    {"text": "ما هو الكوكب الأقرب إلى الشمس؟", "answer": "عطارد"},
    {"text": "ما هي الدولة التي تسمى أرض الشمس المشرقة؟", "answer": "اليابان"},
    {"text": "ما هي أصغر قارة في العالم؟", "answer": "أستراليا"},
    {"text": "ما هو الطائر الذي لا يطير ولديه أجنحة ويسبح في الماء؟", "answer": "البطريق"},
    {"text": "ما هو أطول جبل في العالم؟", "answer": "إفرست"},
    {"text": "ما هي عاصمة إسبانيا؟", "answer": "مدريد"},
    {"text": "ما هو العضو المسؤول عن تصفية الدم في جسم الإنسان؟", "answer": "الكلية"},
    {"text": "ما هي الدولة الأكثر سكاناً في العالم حالياً؟", "answer": "الهند"},
    {"text": "ما هي عاصمة إنجلترا؟", "answer": "لندن"},
    {"text": "كم عدد خطوط الطول على الكرة الأرضية؟", "answer": "360"},
    {"text": "ما هو الطائر الذي يضع أكبر بيضة في العالم؟", "answer": "النعامة"},
    {"text": "ما هو الغاز الذي يستخدم لإطفاء الحرائق؟", "answer": "ثاني أكسيد الكربون"},
    {"text": "ما هي أكبر خلية في جسم الإنسان؟", "answer": "البويضة"},
    {"text": "كم عدد ألوان قوس قزح؟", "answer": "7"},
    {"text": "ما هي لغة البرازيل الرسمية؟", "answer": "البرتغالية"},
    {"text": "كم عدد فقرات عنق الزرافة؟", "answer": "7"},
    {"text": "ما هي عاصمة كندا؟", "answer": "أوتاوا"},
    {"text": "ما هو أقسى عنصر طبيعي معروف على وجه الأرض؟", "answer": "الماس"},
    {"text": "كم عدد قارات العالم؟", "answer": "7"},
    {"text": "ما هو الكوكب الأكبر في مجموعتنا الشمسية؟", "answer": "المشتري"}
]

gk_questions = []
for item in general_knowledge_base:
    gk_questions.append({
        "text": item["text"],
        "category": "general-knowledge",
        "answer": item["answer"],
        "difficulty": "medium"
    })

# 6. Egyptian Movies & Series (50 verified questions)
egyptian_movies_base = [
    {"text": "مين بطل فيلم 'الحريفة' (2024)؟", "answer": "نور النبوي"},
    {"text": "ما هو الفيلم الوحيد الذي جمع عادل إمام وأحمد زكي؟", "answer": "شياطين الإنس"},
    {"text": "مين بطلة فيلم 'إكس مراتي' (2024) مع هشام ماجد ومحمد ممدوح؟", "answer": "أمينة خليل"},
    {"text": "ما هو الفيلم الذي جمع كريم عبد العزيز وأحمد حلمي في بداياتهما الفنية عام 1999؟", "answer": "عبود على الحدود"},
    {"text": "مين بطل فيلم 'فاصل من اللحظات اللذيذة' (2024) بجانب هنا الزاهد؟", "answer": "هشام ماجد"},
    {"text": "مين بطلة مسلسل 'نعمة الأفوكاتو' في رمضان 2024؟", "answer": "مي عمر"},
    {"text": "ما هو الفيلم الوحيد اللي مثل فيه محمد هنيدي مع عمرو دياب؟", "answer": "آيس كريم في جليم"},
    {"text": "مين بطل فيلم 'شماريخ' (2023) مع أمينة خليل؟", "answer": "آسر ياسين"},
    {"text": "ما هو أول فيلم لتامر حسني عام 2004؟", "answer": "حالة حب"},
    {"text": "مين بطل فيلم 'عسل إسود'؟", "answer": "أحمد حلمي"},
    {"text": "مين بطلة فيلم 'اللمبي'؟", "answer": "عبلة كامل"},
    {"text": "ما هو الفيلم المشترك الذي جمع بين كريم عبد العزيز وأحمد عز؟", "answer": "كيرة والجن"},
    {"text": "مين بطل فيلم 'سهر الليالي'؟", "answer": "شريف منير"},
    {"text": "ما هو أول فيلم كوميدي طويل للفنان محمد سعد كبطل مطلق؟", "answer": "اللمبي"},
    {"text": "مين بطل مسلسل 'جعفر العمدة' في رمضان 2023؟", "answer": "محمد رمضان"},
    {"text": "مين بطل مسلسل 'الحشاشين' في رمضان 2024؟", "answer": "كريم عبد العزيز"},
    {"text": "مين بطلة مسلسل 'تحت الوصاية' في رمضان 2023؟", "answer": "منى زكي"},
    {"text": "بطل فيلم 'تيتو' بجانب أحمد الفيشاوي وخالد صالح؟", "answer": "أحمد السقا"},
    {"text": "بطل فيلم 'صعيدي في الجامعة الأمريكية'؟", "answer": "محمد هنيدي"},
    {"text": "بطلة فيلم 'صعيدي في الجامعة الأمريكية' بجانب هنيدي؟", "answer": "منى زكي"},
    {"text": "مين بطل فيلم 'الناظر'؟", "answer": "علاء ولي الدين"},
    {"text": "مين بطل فيلم 'ابن عز'؟", "answer": "علاء ولي الدين"},
    {"text": "مين بطل فيلم 'أبو علي'؟", "answer": "كريم عبد العزيز"},
    {"text": "مين بطلة فيلم 'أبو علي' بجانب كريم عبد العزيز؟", "answer": "منى زكي"},
    {"text": "مين بطل فيلم 'حرب أطاليا'؟", "answer": "أحمد السقا"},
    {"text": "مين بطل فيلم 'إكس لارج'؟", "answer": "أحمد حلمي"},
    {"text": "مين بطلة فيلم 'إكس لارج' بجانب أحمد حلمي؟", "answer": "دنيا سمير غانم"},
    {"text": "مين بطل فيلم 'جاءنا البيان التالي'؟", "answer": "محمد هنيدي"},
    {"text": "مين بطل فيلم 'فول الصين العظيم'؟", "answer": "محمد هنيدي"},
    {"text": "مين بطل فيلم 'الباشا تلميذ'؟", "answer": "كريم عبد العزيز"},
    {"text": "مين بطل فيلم 'واحد من الناس'؟", "answer": "كريم عبد العزيز"},
    {"text": "مين بطل فيلم 'الجزيرة'؟", "answer": "أحمد السقا"},
    {"text": "مين بطلة فيلم 'الجزيرة' بجانب أحمد السقا؟", "answer": "هند صبري"},
    {"text": "مين بطل فيلم 'كده رضا'؟", "answer": "أحمد حلمي"},
    {"text": "مين بطل فيلم 'آسف على الإزعاج'؟", "answer": "أحمد حلمي"},
    {"text": "مين بطل فيلم 'ملاكي إسكندرية'؟", "answer": "أحمد عز"},
    {"text": "مين بطل فيلم 'الرهينة'؟", "answer": "أحمد عز"},
    {"text": "مين بطل فيلم 'ولاد رزق' الأول عام 2015؟", "answer": "أحمد عز"},
    {"text": "مين بطل فيلم 'الفيل الأزرق'؟", "answer": "كريم عبد العزيز"},
    {"text": "مين بطل فيلم 'أمير الظلام'؟", "answer": "عادل إمام"},
    {"text": "مين بطل فيلم 'السفارة في العمارة'؟", "answer": "عادل إمام"},
    {"text": "مين بطل فيلم 'مرجان أحمد مرجان'؟", "answer": "عادل إمام"},
    {"text": "مين بطل فيلم 'طباخ الريس'؟", "answer": "طلعت زكريا"},
    {"text": "مين بطل فيلم 'حبيبي نائماً' مع مي عز الدين؟", "answer": "خالد أبو النجا"},
    {"text": "مين بطل فيلم 'عمر وسلمى' بجانب مي عز الدين؟", "answer": "تامر حسني"},
    {"text": "مين بطل فيلم 'حرب كرموز'؟", "answer": "أمير كرارة"},
    {"text": "مين بطل مسلسل 'كلبش'؟", "answer": "أمير كرارة"},
    {"text": "مين بطل فيلم 'مستر إكس' (2023)؟", "answer": "أحمد فهمي"},
    {"text": "مين بطل فيلم 'بيت الروبي' (2023) بجانب كريم عبد العزيز؟", "answer": "كريم محمود عبد العزيز"},
    {"text": "مين بطل فيلم 'البدلة' مع أكرم حسني؟", "answer": "تامر حسني"}
]

movie_questions = []
for item in egyptian_movies_base:
    movie_questions.append({
        "text": item["text"],
        "category": "egyptian-movies",
        "answer": item["answer"],
        "difficulty": "medium"
    })

# Combine all lists
all_questions = (
    flags_questions +
    song_questions +
    describe_questions +
    gk_questions +
    movie_questions +
    reversed_words_questions
)

print(f"Total compiled questions: {len(all_questions)}")

# Write to questions.json
target_path = os.path.join("data", "questions.json")
with open(target_path, "w", encoding="utf-8") as f:
    json.dump(all_questions, f, ensure_ascii=False, indent=2)

print("Saved successfully to data/questions.json!")
