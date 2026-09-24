# Stage 1 handoff — persistence, packaging, and the launch market route

Date: 2026-09-24 · branch `plan/passiona-deepseek`

## What changed

**One authoritative wallet (envelope).**
- `city-common/ledger.js` (new, pure): the shipped transaction rules plus the
  two achievement books this plan adds (`claimed`, `evidence`). Credits come
  from a **versioned config with stable achievement IDs** (`REWARD_CONFIG`), never
  from a caller. `recordLearningEvent` is once-per-scope and replay-safe;
  `purchaseItem` reads the price from the catalogue only.
- `city-common/project-store.js`: the envelope now owns an `economy`. New atomic
  `mutate()` performs read → compare → write **inside one IndexedDB transaction**
  (the two-tab guarantee); `commitSection` was rebuilt on it. New ops:
  `readEconomy`, `transact`, `award`, `purchase`, `recordLearningEvent`,
  `readCapabilities`. `migrateEconomyFromChampion` imports a legacy Workshop
  wallet **exactly once** and never sums duplicate credits.

**Packaging — the tools are now same-origin routes of the City build.**
- `deploy/scripts/deploy-city-apps.sh` overlays the **canonical `client/workshop`**
  and the built **`client/studio/dist`** into the bundle (replacing the old
  iframe placeholder and the legacy Fit Studio copy), and now ships **`/market/`**.
  Falls back to Fit Studio only when no Studio dist exists.
- `shared/links.js` + `home/links.js`: `WORKSHOP_URL`, `FIT_STUDIO_URL`, new
  `MARKET_URL` all resolve through `citySim(...)` (same origin, one edit point).
- `city-common/market-catalogue.js` (new): the 18-item launch market with the
  plan's price ladder.
- `client/market/` (new): real surface — reads the shared wallet, lists the
  catalogue, and purchases through the ledger (bilingual EN / 繁中).

## Tests

- `tests/ledger.test.mjs`, `tests/project-economy.test.mjs`, `tests/market-catalogue.test.mjs` (new).
- `tests/p5-links-mirror.test.mjs`, `tests/demo-navigation.test.mjs` updated for `MARKET_URL` / `/market/`.
- e2e `gateways.spec.mjs` updated to the same-origin Workshop route; new `market.spec.mjs`.
- Verified: `node --test tests/*.test.mjs` → **455 pass / 0 fail**;
  `build:city` (library audit + import graph) OK;
  built-bundle e2e: `city-smoke`, `project-hub`, `gateways`, `badges-capabilities`, `market` → **all pass**.

## Still open (later stages)

- Workshop (`game.js`, classic script) and Studio compatibility adapters that
  read/write the envelope wallet — the bridge exists (`migrateEconomyFromChampion`)
  but the apps do not call it yet.
- Equipping a purchased accessory and placing a purchased decoration (Stage 2).
- The capability export/publish bridge itself (Stage 3).
