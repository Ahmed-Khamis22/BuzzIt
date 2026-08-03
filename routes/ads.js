const express = require('express');
const mongoose = require('mongoose');
const AdVerification = require('../models/AdVerification');
const { verifySsvRequest } = require('../services/adSsv');

const router = express.Router();

// AdMob calls this directly — no user token involved, the signature is the
// authentication. Configure the URL in the AdMob console under the rewarded
// unit's "Server-side verification" section:
//
//   https://buzzit-6l4o.onrender.com/api/ads/ssv
//
// Always answer 200. Google retries non-2xx, and retrying won't fix a bad
// signature or an unknown user — it just fills the log with noise.
router.get('/ssv', async (req, res) => {
  try {
    const result = await verifySsvRequest(req.originalUrl);
    if (!result.ok) {
      console.warn('[AdSSV] rejected callback:', result.reason);
      return res.sendStatus(200);
    }

    const params = result.params;
    const userId = params.get('user_id');
    const transactionId = params.get('transaction_id');

    if (!userId || !mongoose.isValidObjectId(userId)) {
      console.warn('[AdSSV] signed callback with unusable user_id:', userId);
      return res.sendStatus(200);
    }
    if (!transactionId) {
      console.warn('[AdSSV] signed callback with no transaction_id');
      return res.sendStatus(200);
    }

    // customData carries the reward type the app asked for. Informational —
    // the payout endpoints decide amounts themselves.
    let rewardType = null;
    const customData = params.get('custom_data');
    if (customData) {
      try {
        rewardType = JSON.parse(customData)?.rewardType || null;
      } catch {
        rewardType = customData;
      }
    }

    // Unique index on transactionId makes the retry case a no-op rather than a
    // duplicate reward.
    try {
      await AdVerification.create({ userId, transactionId, rewardType });
      console.log(`[AdSSV] verified ad for user ${userId} (${rewardType || 'no type'})`);
    } catch (err) {
      if (err?.code === 11000) {
        console.log(`[AdSSV] duplicate callback for transaction ${transactionId}, ignoring`);
      } else {
        throw err;
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[AdSSV] callback handler failed:', err);
    res.sendStatus(200);
  }
});

module.exports = router;
