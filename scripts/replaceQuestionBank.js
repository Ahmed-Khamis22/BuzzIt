require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Question = require('../models/Question');

const BANK_PATH = path.join(__dirname, '..', 'question-bank-all-categories-preview.json');
const FALLBACK_PATH = path.join(__dirname, '..', 'data', 'questions.json');
const CATEGORY_SOURCES = {
  'general-knowledge': 'wikidata_cc0',
  'egyptian-movies': 'wikidata_cc0',
  flags: 'wikidata_cc0',
  'describe-it': 'wiktionary_arabic_swadesh',
  'word-in-song': 'wiktionary_arabic_swadesh',
  'reversed-words': 'wiktionary_arabic_swadesh',
};
const CATEGORIES = Object.keys(CATEGORY_SOURCES);
const FIELDS = [
  'text', 'category', 'answer', 'acceptedAnswers', 'choices', 'isTriviaChoice',
  'isCustomTrivia', 'judgeMode', 'judgeEvaluated', 'difficulty', 'flagImage',
  'bankKey', 'bankVersion', 'source', 'sourceId', 'sourceUrl', 'sourceLicense',
  'sourceAttribution', 'imageSourceUrl', 'status',
];
const FORBIDDEN_CONTENT = /(?:إسرائيل|اسرائيل|إسرائيلي|اسرائيلي|إسرائيلية|اسرائيلية|Israel|Israeli|تل أبيب|تل-أبيب|Tel Aviv|Tel-Aviv)/i;

function loadAndValidateBank() {
  const questions = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
  if (!Array.isArray(questions) || questions.length < 1500) {
    throw new Error('بنك الأسئلة غير مكتمل؛ لن يتم استبدال الأسئلة القديمة.');
  }

  const bankKeys = new Set();
  for (const question of questions) {
    const expectedSource = CATEGORY_SOURCES[question?.category];
    const content = [question?.text, question?.answer, question?.choices, question?.acceptedAnswers]
      .flat(Infinity).filter((value) => typeof value === 'string').join(' ');
    if (
      !expectedSource
      || !question.text
      || !question.answer
      || question.source !== expectedSource
      || !question.sourceUrl
      || !question.sourceLicense
      || question.status !== 'pending'
      || !question.bankKey
      || bankKeys.has(question.bankKey)
      || FORBIDDEN_CONTENT.test(content)
    ) {
      throw new Error(`سجل غير صالح في بنك الأسئلة: ${question?.bankKey || '(بدون bankKey)'}`);
    }
    if (expectedSource === 'wikidata_cc0') {
      if (!question.isTriviaChoice || question.choices?.length !== 4 || !question.choices.includes(question.answer)) {
        throw new Error(`اختيارات غير صالحة في السؤال: ${question.bankKey}`);
      }
    } else if (!question.sourceAttribution || question.sourceLicense !== 'CC BY-SA 4.0') {
      throw new Error(`إسناد أو ترخيص ناقص في السؤال: ${question.bankKey}`);
    }
    bankKeys.add(question.bankKey);
  }

  return { questions, bankKeys };
}

function activeRecords(questions) {
  return questions.map((question) => {
    const record = {};
    for (const field of FIELDS) {
      if (question[field] !== undefined) record[field] = question[field];
    }
    record.status = 'approved';
    return record;
  });
}

function replaceLocalFallback(questions) {
  const records = activeRecords(questions);
  fs.writeFileSync(FALLBACK_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  return records.length;
}

async function replaceDatabaseBank(records, bankKeys) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI مطلوب لمزامنة بنك الأسئلة.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const existing = await Question.find({ bankKey: { $in: [...bankKeys] } })
      .select('source bankKey status')
      .lean();
    const existingStatus = new Map(existing.map((record) => [
      `${record.source}:${record.bankKey}`,
      record.status,
    ]));

    const operations = records.map((record) => {
      const key = `${record.source}:${record.bankKey}`;
      const payload = {
        ...record,
        // Preserve moderator decisions across repeat deployments.
        status: existingStatus.get(key) === 'rejected' ? 'rejected' : 'approved',
      };
      return {
        updateOne: {
          filter: { source: record.source, bankKey: record.bankKey },
          update: { $set: payload },
          upsert: true,
        },
      };
    });
    const upsertResult = await Question.bulkWrite(operations, { ordered: false });

    // Keep player-submitted and custom questions. Remove the old shared bank
    // only after every replacement record has been written successfully.
    const deleteResult = await Question.deleteMany({
      category: { $in: CATEGORIES },
      submittedBy: null,
      bankKey: { $nin: [...bankKeys] },
    });

    return { upsertResult, deleteResult };
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const { questions, bankKeys } = loadAndValidateBank();
  const records = activeRecords(questions);
  console.log(`تم التحقق من ${records.length} سؤالًا موثقًا في ${CATEGORIES.length} تصنيفات.`);

  if (process.argv.includes('--sync-fallback')) {
    replaceLocalFallback(questions);
    console.log('تم استبدال بنك الأسئلة الاحتياطي المحلي بالبنك الموثق.');
  }

  if (process.argv.includes('--apply')) {
    const { upsertResult, deleteResult } = await replaceDatabaseBank(records, bankKeys);
    console.log(JSON.stringify({
      inserted: upsertResult.upsertedCount,
      updated: upsertResult.modifiedCount,
      oldQuestionsRemoved: deleteResult.deletedCount,
    }));
  } else {
    console.log('معاينة فقط: قاعدة البيانات لم تتغير. استخدم --apply للنشر.');
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('فشل استبدال بنك الأسئلة:', error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { loadAndValidateBank, activeRecords };
