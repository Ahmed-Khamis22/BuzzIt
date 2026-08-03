const crypto = require('crypto');

// AdMob server-side verification.
//
// Google signs each rewarded-ad callback with one of the ECDSA keys published
// below and appends `signature` and `key_id` as the last two query parameters.
// The signed content is the raw query string up to (not including) `&signature=`,
// so we must read it off the original URL — re-serialising a parsed object
// reorders and re-encodes parameters and the signature stops matching.
const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

let keyCache = { keys: null, fetchedAt: 0 };
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

async function getKeys(force = false) {
  const fresh = keyCache.keys && Date.now() - keyCache.fetchedAt < KEY_TTL_MS;
  if (fresh && !force) return keyCache.keys;

  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`verifier-keys fetch failed: ${res.status}`);
  const body = await res.json();

  const keys = new Map();
  for (const k of body.keys || []) {
    keys.set(String(k.keyId), k.pem);
  }
  if (!keys.size) throw new Error('verifier-keys response had no keys');

  keyCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * @param {string} originalUrl req.originalUrl — the raw path+query as received.
 * @returns {Promise<{ok: true, params: URLSearchParams} | {ok: false, reason: string}>}
 */
async function verifySsvRequest(originalUrl) {
  const qIndex = originalUrl.indexOf('?');
  if (qIndex === -1) return { ok: false, reason: 'no query string' };
  const query = originalUrl.slice(qIndex + 1);

  // Google documents signature and key_id as the final two parameters, in that
  // order. Everything before them is what was signed.
  const sigIndex = query.indexOf('&signature=');
  if (sigIndex === -1) return { ok: false, reason: 'no signature parameter' };
  const signedContent = query.slice(0, sigIndex);

  const params = new URLSearchParams(query);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (!signature || !keyId) return { ok: false, reason: 'missing signature or key_id' };

  let keys;
  try {
    keys = await getKeys();
  } catch (err) {
    return { ok: false, reason: `key fetch: ${err.message}` };
  }

  let pem = keys.get(String(keyId));
  if (!pem) {
    // Google rotates keys; a miss usually means our day-old cache is stale.
    try {
      keys = await getKeys(true);
      pem = keys.get(String(keyId));
    } catch (err) {
      return { ok: false, reason: `key refetch: ${err.message}` };
    }
    if (!pem) return { ok: false, reason: `unknown key_id ${keyId}` };
  }

  let valid = false;
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(signedContent);
    verifier.end();
    // base64url — the signature travels in a URL.
    valid = verifier.verify(pem, Buffer.from(signature, 'base64url'));
  } catch (err) {
    return { ok: false, reason: `verify threw: ${err.message}` };
  }

  if (!valid) return { ok: false, reason: 'signature mismatch' };
  return { ok: true, params };
}

module.exports = { verifySsvRequest };
