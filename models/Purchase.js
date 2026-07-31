const mongoose = require('mongoose');

// One row per redeemed Google Play purchase. The unique index on purchaseToken
// is what makes redemption idempotent: a replayed token hits a duplicate-key
// error instead of granting gems a second time. Never drop that index.
const purchaseSchema = new mongoose.Schema({
  purchaseToken: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: String, required: true },
  // Google's own order id, kept for cross-referencing refunds in the console.
  orderId: { type: String, default: null },
  gemsGranted: { type: Number, required: true },
  platform: { type: String, default: 'android' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Purchase', purchaseSchema);
