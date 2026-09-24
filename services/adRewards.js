const AdVerification = require('../models/AdVerification');

// Secure by default in production. Local/dev environments can explicitly set
// REQUIRE_AD_SSV=false while wiring Google's server-side verification callback.
const REQUIRE_AD_SSV = process.env.REQUIRE_AD_SSV !== 'false';

// Google's callback and the app's claim race each other. The callback normally
// wins, but not always, so give it a moment rather than failing a legitimate
// viewer who happened to be quick.
const WAIT_ATTEMPTS = 10;
const WAIT_INTERVAL_MS = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atomically claims the newest unspent verification for this user. The
// findOneAndUpdate is the whole point: two concurrent claims can't both take
// the same row, so one ad can never pay twice.
async function takeVerification(userId) {
  return AdVerification.findOneAndUpdate(
    { userId, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { sort: { createdAt: -1 }, returnDocument: 'after' }
  );
}

/**
 * Spend one verified ad view for this user.
 * @returns {Promise<{ok: boolean, verified: boolean, error?: string}>}
 *   ok=false means the caller must refuse the payout.
 *   verified=false with ok=true means grace mode covered for a missing callback.
 */
async function consumeAdView(userId, context = 'reward') {
  for (let i = 0; i < WAIT_ATTEMPTS; i++) {
    const doc = await takeVerification(userId);
    if (doc) return { ok: true, verified: true };
    if (i < WAIT_ATTEMPTS - 1) await sleep(WAIT_INTERVAL_MS);
  }

  if (REQUIRE_AD_SSV) {
    console.warn(`[AdReward] refused ${context} for ${userId} — no verified ad view`);
    return {
      ok: false,
      verified: false,
      code: 'AD_VIEW_NOT_VERIFIED',
      error: 'تأكيد الإعلان لسه ما وصلش. حاول التحقق مرة أخرى بعد لحظات.',
    };
  }

  console.warn(`[AdReward] ${context} for ${userId} had no verified ad view (grace mode — paying anyway)`);
  return { ok: true, verified: false };
}

module.exports = { consumeAdView, REQUIRE_AD_SSV };
