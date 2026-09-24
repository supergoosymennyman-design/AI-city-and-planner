# Stage 2 handoff — economy, earning path, and the market

Date: 2026-09-24 · branch `plan/passiona-deepseek`

## What changed

**A real earning path (evidence, not attendance).**
- `city-common/learning-events.js` (new): the one door an app uses to report
  demonstrated work. It wraps the envelope wallet, installs the
  `window.PassionaLearning` shim for classic scripts, and is fire-and-forget so a
  missing store never breaks a lesson.
- `city-pregame/app.js`: finishing an Academy room (a practical task, not a
  visit) reports `tutorial-task` scoped per room. Replaying a room cannot re-earn.

**A working market.**
- `client/market/`: the 18-item launch catalogue with prices, ownership, and a
  real Buy → Equip / Place card action. Buying commits a debit + ownership
  through the shared envelope wallet.
- `champion-city/accessories.js`: three new procedural market accessories
  (antenna, shoulder ornament, badge pin) plus `marketId` links on the reused
  ones; equip writes the same `hk_ai_city_accessories_v1` map the Champion wears.
- `project-hub`: a Market card shows the shared balance and links the route.

## Tests

- `tests/market-catalogue.test.mjs`: pricing ladder, and a **drift guard** that
  every purchasable accessory exists in the Champion registry with the right slot.
- e2e `wallet.spec.mjs`: a learning event credits once and replays harmlessly; an
  empty wallet cannot buy; a funded wallet buys and equips (`face_visor`).
- Verified: `node --test tests/*.test.mjs` → **456 pass / 0 fail**; built-bundle
  e2e `project-hub`, `market`, `wallet` → all pass.

## Named gaps (carried forward, not hidden)

- **Decoration placement** currently hands off to the City (`?place=<id>`); the
  City-side placement of a purchased decoration is not yet gated/wired.
- **Workshop/Studio wallet adapter**: earned/owned state reaches the Market and
  the Champion, but the Workshop's own credit UI still reads the old
  champion-session economy until Stage 3's adapter lands.
- Card **previews** are name/price cards; imagery arrives with the prestige and
  decoration geometry.
