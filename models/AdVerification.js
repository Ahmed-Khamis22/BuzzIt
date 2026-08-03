const mongoose = require('mongoose');

// One row per rewarded ad that Google told us was genuinely watched, created by
// the SSV callback in routes/ads.js. The client can't forge these — it never
// touches this collection, and the callback is signed by Google.
//
// A row is spent by exactly one payout (claim-ad-reward, the daily-task bump,
// or an extra wheel spin), which is what stops a single ad from being cashed
// in three times.
const adVerificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Google's id for this reward event. Unique so a retried callback — Google
  // does retry — can never mint a second reward.
  transactionId: { type: String, required: true, unique: true },
  // Whatever the app put in customData; we send the reward type through it.
  rewardType: { type: String, default: null },
  consumedAt: { type: Date, default: null },
  // Nothing here matters for long: a verification the app never cashed in
  // within the hour is a dead ad view.
  createdAt: { type: Date, default: Date.now, expires: 3600 },
});

// The lookup every payout does: my newest unspent verification.
adVerificationSchema.index({ userId: 1, consumedAt: 1, createdAt: -1 });

module.exports = mongoose.model('AdVerification', adVerificationSchema);
