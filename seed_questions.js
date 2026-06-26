require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/Question');

const fs = require('fs');
const path = require('path');

const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8')
);

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected! Clearing existing questions...");
    await Question.deleteMany({});
    console.log("Inserting default questions...");
    await Question.insertMany(questions);
    console.log("Successfully seeded", questions.length, "questions!");
  } catch (err) {
    console.error("Seeding failed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

seed();
