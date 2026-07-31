const express = require('express');
const { google } = require('googleapis');
const User = require('../models/User');
const Purchase = require('../models/Purchase');
const auth = require('../middleware/auth');

const router = express.Router();

// The only products that grant gems, and how many. Server-side on purpose: the
// client sends a product id, never an amount. Must match the SKUs created in
// the Play Console exactly.
const GEM_PRODUCTS = {
  gems_50: 50,
  gems_150: 150,
  gems_400: 400,
  gems_1000: 1000,
};

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.buzzit.game';

// Google's purchaseState values for a one-time product.
const PURCHASE_STATE_PURCHASED = 0;
const PURCHASE_STATE_PENDING = 2;

let androidPublisher = null;

// Built lazily so the server still boots (and every non-purchase route keeps
// working) when the service-account credentials aren't configured yet.
function getAndroidPublisher() {
  if (androidPublisher) return androidPublisher;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (err) {
    console.error('[purchases] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
    return null;
  }

  const authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  androidPublisher = google.androidpublisher({ version: 'v3', auth: authClient });
  return androidPublisher;
}

// Verify a Google Play purchase and credit the gems it is worth.
//
// The client sends only { productId, purchaseToken }. Everything that decides
// how many gems are granted is resolved here, against Google, so a forged
// request can't mint anything.
router.post('/google/verify', auth, async (req, res) => {
  try {
    const { productId, purchaseToken } = req.body;

    if (!productId || !purchaseToken) {
      return res.status(400).json({ error: 'productId و purchaseToken مطلوبين.' });
    }

    const gems = GEM_PRODUCTS[productId];
    if (!gems) {
      return res.status(400).json({ error: 'منتج غير معروف.' });
    }

    // Cheap pre-check. The unique index below is the real guard — this just
    // avoids calling Google for a token we already know about.
    const existing = await Purchase.findOne({ purchaseToken });
    if (existing) {
      return res.status(409).json({ error: 'عملية الشراء دي اتسجلت قبل كده.', alreadyRedeemed: true });
    }

    const publisher = getAndroidPublisher();
    if (!publisher) {
      console.error('[purchases] Play credentials missing — refusing to grant gems');
      return res.status(503).json({ error: 'خدمة الشراء غير متاحة حالياً. حاول لاحقاً.' });
    }

    let purchase;
    try {
      const { data } = await publisher.purchases.products.get({
        packageName: PACKAGE_NAME,
        productId,
        token: purchaseToken,
      });
      purchase = data;
    } catch (err) {
      // 404/410 from Google means the token is bogus or already consumed.
      const status = err?.response?.status;
      console.warn(`[purchases] Play rejected token (status=${status}) product=${productId}`);
      return res.status(400).json({ error: 'تعذر التحقق من عملية الشراء مع Google Play.' });
    }

    if (purchase.purchaseState === PURCHASE_STATE_PENDING) {
      return res.status(202).json({ error: 'عملية الشراء لسه معلقة. هتتضاف أول ما تكتمل.', pending: true });
    }

    if (purchase.purchaseState !== PURCHASE_STATE_PURCHASED) {
      return res.status(400).json({ error: 'عملية الشراء ملغية أو غير مكتملة.' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });

    // Claim the token first. If a duplicate request is in flight, one of them
    // loses here and no gems are granted twice.
    try {
      await Purchase.create({
        purchaseToken,
        userId: user._id,
        productId,
        orderId: purchase.orderId || null,
        gemsGranted: gems,
      });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: 'عملية الشراء دي اتسجلت قبل كده.', alreadyRedeemed: true });
      }
      throw err;
    }

    user.gems += gems;
    await user.save();

    // Google auto-refunds anything left unacknowledged for three days, so this
    // has to happen — but the gems are already banked, so a failure here must
    // not fail the request. The client consuming the item acknowledges it too.
    if (purchase.acknowledgementState === 0) {
      try {
        await publisher.purchases.products.acknowledge({
          packageName: PACKAGE_NAME,
          productId,
          token: purchaseToken,
        });
      } catch (err) {
        console.error('[purchases] acknowledge failed:', err?.message);
      }
    }

    res.json({ success: true, gemsGranted: gems, gems: user.gems });
  } catch (err) {
    console.error('[purchases] verify failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
