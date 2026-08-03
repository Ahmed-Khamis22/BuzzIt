---
title: BuzzIt Server
emoji: 🎮
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
---

# BuzzIt Multiplayer Server
Multiplayer Node.js + Express + Socket.io backend running on Hugging Face Spaces.

## Rewarded ads: turning on server-side verification

`POST /api/users/claim-ad-reward`, the daily-task ad and extra wheel spins all
spend a row written by `GET /api/ads/ssv`, the callback AdMob signs and sends
once an ad is genuinely watched. Until that callback is configured there are no
rows to spend, so enforcement is behind `REQUIRE_AD_SSV` and **defaults to off**:
missing verifications are logged and the reward is paid anyway.

Turn it on in this order, or every player loses their ad rewards:

1. Deploy this server, then ship the matching app update. Older builds don't
   send a `userId`, so their ad views produce no verification.
2. In the AdMob console, open the rewarded ad unit → Server-side verification,
   and set the callback to `https://<host>/api/ads/ssv`.
3. Watch the logs for `[AdSSV] verified ad for user …`. Nothing else proves the
   callback is reaching us.
4. Only once those appear — and `[AdReward] … grace mode` has gone quiet — set
   `REQUIRE_AD_SSV=true`.

`ALLOW_UNLIMITED_SPIN=true` bypasses the once-a-day wheel limit for testing.
Never set it in production.
