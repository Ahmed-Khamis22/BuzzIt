const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, required: true, min: 1, max: 100 },
  maxUses: { type: Number, default: 1 },
  uses: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

couponSchema.methods.isValid = function() {
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.uses >= this.maxUses) return false;
  return true;
};

module.exports = mongoose.model('Coupon', couponSchema);
