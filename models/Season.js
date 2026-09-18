const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true, index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'finished'], default: 'active', index: true },
}, { timestamps: true });

module.exports = mongoose.model('Season', seasonSchema);
