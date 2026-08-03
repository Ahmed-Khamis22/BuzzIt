const { ipKeyGenerator } = require('express-rate-limit');

// Render sits behind Cloudflare, so req.socket.remoteAddress is always the
// proxy — every user would land in the same bucket. Cloudflare rewrites
// cf-connecting-ip on every request (a client can't forge it), so prefer it
// and fall back to req.ip, which needs `trust proxy` set in server.js.
// ipKeyGenerator normalises IPv6 into a /56 so one client can't walk its
// own subnet to get a fresh bucket per request.
function clientIpKey(req) {
  const ip = req.headers['cf-connecting-ip'] || req.ip || '';
  return ipKeyGenerator(ip);
}

// Most Egyptian mobile users share a handful of carrier NAT addresses, so an
// IP-only bucket on the signup flow would punish strangers for each other's
// attempts. These endpoints all carry an email, which is the thing we
// actually want to throttle. Fall back to IP when the body has no email.
function emailKey(req) {
  const email = req.body?.email;
  if (typeof email === 'string' && email.trim()) {
    return `email:${email.trim().toLowerCase()}`;
  }
  return `ip:${clientIpKey(req)}`;
}

module.exports = { clientIpKey, emailKey };
