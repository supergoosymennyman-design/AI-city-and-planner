# Continuation prompt — Passiona Studio/Workshop wallet adapter

Copy the block below into a fresh session. It is self-contained: the new session
has no memory of the prior conversation.

---

You are continuing the Passiona DeepSeek implementation in the repo
`/Users/kai/Documents/AI-education-shrink` (macOS, zsh, git). Branch
**`plan/passiona-deepseek`**, working tree clean at `10b34b7`.

## Mission (one bounded job)

Make the **Studio** (and the Workshop's credit surface) read and spend the
**envelope wallet** instead of the legacy Champion session, with the session kept
as a compatibility adapter. This is the last named integration gap from the plan
§3 line: *"Port the existing Champion session's transactional safeguards into the
project store. Workshop and Studio use compatibility adapters against that
store."*

Done means: earning in the Academy/recycling/City changes the balance the Studio
shows; buying in the Studio debits the SAME shared wallet the Market reads; and
the Studio still works if no envelope exists. Then build the Studio bundle so
`dist` matches `src`, verify, commit, and update the handoff.

## Read first (mandatory)

1. `P5 Programme/AGENTS.md` and the repo `AGENTS.md` — golden rules: canonical
   source is `P5 Programme/buddy-kit/client/`; **never** edit `deploy/` (build
   output); no child PII; models CC0 only; no AI-slop.
2. `P5 Programme/docs/deepseek-s6-handoff.md` — what Stage 6 shipped and the
   remaining-issues list (this task is item 2).
3. `~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` §2 (credits/market) and
   §3 (minimum shared interfaces: `purchaseItem`, envelope authoritative).
4. `P5 Programme/docs/deepseek-s6-review-remediation.md` — the ledger's reward
   scope/evidence contract you must not weaken.

## The exact surfaces

**Envelope store (authoritative).** `P5 Programme/buddy-kit/client/city-common/project-store.js`
- `createProjectStore()` → `openActiveProject()`, `readEconomy()`,
  `purchase(itemId, transactionId, catalogue, { at })`,
  `recordLearningEvent(event)`, `readAchievements()`, `exportProject()`.
- `purchase` reads the price from the catalogue via `ledger.js`
  (`purchaseItem`) and commits debit+ownership in ONE IndexedDB transaction.
- `migrateEconomyFromChampion(project, championEconomy)` imports a legacy
  Workshop wallet exactly once. Do not call it a second time.

**Studio (Vite app).** `P5 Programme/buddy-kit/client/studio/`
- `src/champion.js` — imports the classic `../../workshop/toolbox/champion-session.js`,
  creates `session`, and is the wallet surface: `shopState()` reads
  `session.file.economy` (`e.balance`, `e.owned`); `purchase(model, catalog)`
  and `issue()`/`edit` go through `session.edit`.
- `src/main.js` — "Credits & Owned Gear" button (`ChampionControls.credits`),
  `savePortable`, `migrateStudio`, `session.subscribe`.
- Build: `studio/package.json` → `npm run build` (vite). **`studio/dist/` is
  NOT tracked** — it is build output. `deploy-city-apps.sh` rsyncs
  `client/studio/dist/` into `city-sim/studio/` (falling back to the legacy Fit
  Studio if dist is missing). So: change `src`, then REBUILD `dist`, or leave
  both alone. Never ship a src/dist mismatch.
- Studio's own checks: `studio/run-tests.mjs` (`npm test`).

**Workshop credit surface (classic scripts).**
- `workshop/toolbox/champion-session.js` (the session), `champion-controls.js`
  (`credits()` dialog), `workshop/game.js` (`championSession = await
  ChampionSession.create(initial)` ~line 8839; the `#championCredits` button
  ~8938).
- `workshop/publish-capability.js` is an ES module loaded by `workshop/index.html`;
  it imports `city-common/learning-events.js`, which installs the
  `window.PassionaLearning` shim for classic scripts
  (`{ award, report, wallet, rewardFor, config }`).

**Catalogue.** `city-common/market-catalogue.js` — 18 items, prices live here.
Never hard-code a price in a caller.

## Locked decisions (do not relitigate)

- **Envelope-authoritative.** The Studio/Workshop session is a compatibility
  adapter; the envelope owns balance + owned items + claimed rewards.
- **One commit primitive.** Purchases go through `store.purchase` → the ledger;
  a caller never chooses a price or a credit amount.
- **Reuse the existing adapter pattern.** `champion-session.js` is already a
  compatibility adapter for the OLD session; mirror the pattern used for badges
  in Stage 6 (envelope authoritative, legacy key mirrored) rather than inventing
  a new store.
- Keep unsupported/legacy fields readable; do not delete a child's data.

## Suggested approach

1. Add a small adapter in the Studio (`src/champion.js`) that prefers the
   envelope: read `store.readEconomy()` for balance/owned, and route buys through
   `store.purchase(itemId, transactionId, MARKET_CATALOGUE)`. Keep
   `session.file.economy` as the fallback AND mirror the envelope into it so the
   existing synchronous `shopState()` UI keeps working without an async rewrite.
2. The Workshop's credits dialog is display/award-only today; make its balance
   read the envelope when the shim is present (`window.PassionaLearning.wallet()`),
   else the session.
3. `migrateEconomyFromChampion` exactly once on first Studio open with a legacy
   store present.
4. Rebuild `studio/dist` (`cd "P5 Programme/buddy-kit/client/studio" && npm run build`).

Guardrails: no fake balances, no placeholder purchases; a purchase that fails
must not leave a debit; a copied project must not re-earn; do not weaken the
ledger's typed-evidence/scope validation.

## Verification (run every change)

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs            # currently 553 pass / 0 fail
npm run test:imports
npm run test:library
npm run build:city
# Studio's own checks
cd "P5 Programme/buddy-kit/client/studio" && npm test
# browser: the shared wallet must still be the one the Market/City use
cd /Users/kai/Documents/AI-education-shrink
E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium wallet.spec.mjs market-actions.spec.mjs full-journey.spec.mjs
```

Add unit coverage in `tests/` for the adapter (pure logic in `city-common/` if
you factor any out). If Studio purchases now hit the envelope, extend
`P5 Programme/tests/e2e/wallet.spec.mjs` or add a Studio spec to prove it.

## Deliverables

- Code + tests, committed as `feat(platform): Studio/Workshop envelope wallet adapter (S6c)`.
- `studio/dist` rebuilt so the built bundle matches `src`.
- Update `P5 Programme/docs/deepseek-s6-handoff.md`: mark remaining-issue item 2
  resolved (or record exactly why not).

## Concurrency warning

Other agents (v4.1 flash / Codex) have edited this tree concurrently before and
caused a near-miss on a commit. Before you start AND before you commit: run
`git status`, and if files you did not write appear, stop and reconcile rather
than committing a mixed tree.

## Optional second item (lower value)

The City drive deep link (`?skill=drive`) deliberately loads the Driving starter
and autosaves first, but it replaces whatever was on the Workshop table. A safe
fix needs a small "is this the child's own machine" accessor added to
`workshop/game.js` (17k lines — be conservative), then gate
`openDriveStarter()` in `workshop/publish-capability.js` on it. Documented as
remaining-issue item 1 in the S6 handoff. Only do this if the Studio adapter is
finished and verified.
