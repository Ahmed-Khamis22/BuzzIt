const mongoose = require('mongoose');

const storeItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  gemPrice: { type: Number, default: null },
  isGemOnly: { type: Boolean, default: false },
  type: {
    type: String,
    enum: ['theme', 'avatar', 'effect', 'border', 'cover'], // item categories
    required: true,
  },
  imageUrl: { type: String },
  soundUrl: { type: String },
  isAvailable: { type: Boolean, default: true },
  isAdminOnly: { type: Boolean, default: false },
});

storeItemSchema.index({ isAvailable: 1, isAdminOnly: 1 });

module.exports = mongoose.model('StoreItem', storeItemSchema);
