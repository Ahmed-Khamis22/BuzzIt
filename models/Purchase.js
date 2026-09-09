const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  purchaseToken: { type: String, sparse: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: String, required: true },
  orderId: { type: String, default: null },
  gemsGranted: { type: Number, required: true },
  platform: { type: String, default: 'android' },
  paymentMethod: { type: String, default: 'google_play' }, // 'google_play' | 'instapay' | 'vodafone_cash'
  referenceNumber: { type: String, default: null },
  senderName: { type: String, default: null },
  senderPhone: { type: String, default: null },
  amountEgp: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'pending', 'rejected'], default: 'completed' },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Purchase', purchaseSchema);
