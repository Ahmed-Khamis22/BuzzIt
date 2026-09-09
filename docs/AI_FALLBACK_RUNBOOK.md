# AI fallback runbook

Last reviewed: 2026-08-22

This file is the operational reference for AI-dependent games. Never put API
keys in this file, the Expo application, source control, logs, or chat. Backend
secrets belong in the server environment only.

## Normal request path

1. Resolve deterministic/closed answers locally.
2. Reuse the in-memory cache, then the persistent MongoDB cache.
3. Call configured AI providers in the order defined in `services/aiJudge.js`.
4. If every provider is unavailable, use the safe game-specific degraded
   behavior. A player must not lose only because AI infrastructure failed.

Providers currently intended for production:

- Google: primary free provider.
- Groq: first independent fallback (`openai/gpt-oss-20b`).
- Cloudflare Workers AI: second independent fallback.
- Cerebras: optional only; leave `CEREBRAS_API_KEY` empty while the account
  returns HTTP 402.

## Paid contingency

If free limits start affecting real players, upgrade Groq to Developer tier
before adding another provider. No code or model change is required: keep
`GROQ_MODEL=openai/gpt-oss-20b` and retain the existing key or rotate it.

Measured on 2026-08-22 using a real solo-game judgment:

- 415 input tokens
- 52 completion tokens
- about USD 0.000047 per judgment at the price then published by Groq
- about USD 0.047 per 1,000 judgments
- about USD 0.47 per 10,000 judgments
- about USD 4.67 per 100,000 judgments

Prices can change. Verify the current price before enabling billing:
https://console.groq.com/docs/model/openai/gpt-oss-20b

Groq billing reference:
https://console.groq.com/docs/billing-faqs

## Incident checklist

1. Check `/api/ai/status` and server logs for the provider and HTTP status.
2. A `429` is a quota/rate-limit event: allow automatic fallback; do not ship
   a client update.
3. A `401` or `403` usually means a revoked key or account permission issue:
   rotate/fix the backend secret, restart the backend, and run a live probe.
4. A `402` is a billing/credit problem: disable that provider by clearing its
   environment variable until billing is intentionally enabled.
5. Confirm Google, Groq, and Cloudflare independently before a release.
6. Never edit or redeploy the public 1.0.2 build while diagnosing the local
   1.0.4 development version.

## Environment variables

See `.env.ai.example`. After changing a secret, restart the backend. A provider
with an empty key is skipped automatically.
