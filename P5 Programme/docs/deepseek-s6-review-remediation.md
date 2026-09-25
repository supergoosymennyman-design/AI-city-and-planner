# Continuation prompt — Passiona review remediation (Stages 1–5 findings)

Use this alongside `deepseek-s6-continuation-prompt.md`. It closes three
problems a review found that **the existing tests missed**, and states the exact
contracts the Stage-6 session must consume so the fixes are not lost.

---

## Context

Stages 1–5 shipped and were committed on `plan/passiona-deepseek`. A review then
found three defects that the stage tests did not cover:

1. **Invented reward scopes minted credits with stub evidence.** The ledger only
   checked that evidence was a non-empty object, and accepted *any* `scopeId`.
   So a caller could mint credits for `scopeId:'anything-i-invent'` with
   `evidence:{x:1}`, once per invented scope, without limit. `skill-stages.js`
   then trusted those claims, producing false Tested/City-connected/Improved
   stages.
2. **Several purchasable items had no working action.** Accessories equipped,
   but decorations and landmarks dead-ended at `?place=` (nothing read it),
   and finishes / host-upgrades resolved to a no-op `equip()`.
3. **An emergency stop could be reported as reaching the driving goal.**
   `driving.js` evaluated the finish line *before* the model's own stop, so a
   car that stopped inside the 3 m goal margin was reported `goalReached:true`
   with no intervention — and Stage 6's `reportTrial()` would then grade it a
   fix.

Browser checks were blocked once by a sandbox server-listen restriction; they
now run outside the sandbox. Do not treat a sandbox failure as a product bug.

## Status of the remediation (do not redo)

The following is **already implemented and verified** on this branch/working
tree. Read it before changing anything.

**Ledger hardening — `city-common/ledger.js`**
- `REWARD_SCOPES` is the allow-list: `challenge: ['image-sorter','driver']`,
  `tutorialRooms: [1,2,3,4]`. Mirror `challenges.js` `CHALLENGE_IDS` and the
  Academy `ROOM_ORDER` here (keep in sync).
- Each reward declares an `evidence` schema and/or `anyOf` group (field →
  `string | number | positiveInteger | idList`):
  | reward | scope | required evidence |
  |---|---|---|
  | `tutorial-task` | `academy-room-<N>`, N in allow-list | `{ room: positiveInt }` |
  | `skill-saved` | challenge | `{ capabilityId, key, revision: positiveInt }` |
  | `held-out-eval` | challenge | `{ batch, seed:number }` **or** `{ trackId }` |
  | `city-install` | challenge | `{ installationId }` |
  | `revision-fixed` | challenge | `{ fixedIds:[non-empty strings], fromRevision:positiveInt, toRevision:positiveInt }` |
  | `abstain-demo` | challenge | `{ source }` |
- If `evidence.challengeId` is present it must equal the scope.
- `validateRewardEvidence(reward, evidence, scopeId)` and
  `validateRewardScope(reward, scopeId)` are exported and applied inside
  `recordLearningEvent` (scope first, then evidence). Tests:
  `tests/ledger.test.mjs` ("an invented reward scope cannot mint credits",
  "stub evidence cannot mint credits") and the updated
  `tests/project-economy.test.mjs`.

**Driving goal rule — `city-common/driving.js`**
- `advanceStep` now evaluates collision → off-road → the model's own stop
  (`stop-required` / `emergency-stop`) → **then** the finish line. The old
  `proj.s >= length - GOAL_MARGIN` term was removed from the required-stop
  check, so a clear-road stop inside the margin is a terminal
  `emergency-stop`, never a goal. Regression:
  `tests/driving.test.mjs` — "a model that stops inside the goal margin is an
  emergency stop, never a goal".

**Market actions**
- `city-common/market-catalogue.js`: every item declares an explicit handler;
  `marketHandler(id)` returns `{ action:'equip'|'place', kind, …target }` and
  `marketAction` is derived from it. Kinds/targets:
  - decoration → `propId` in `library.js` (`nat_planter`,
    `scn_park_park-flagGreen`, `prop_bench`, `prop_streetlight_k`,
    `prop_fountain`, `prop_horse_statue`)
  - landmark → `landmarkTemplate` in `landmark-templates.js`
    (`smart-gate`, `festival-plaza`)
  - finish → `finish` in `champion-finishes.js` (`sunset`, `circuit`)
  - host-upgrade → `hostUpgrade` in `host-upgrades.js` (`flagship`, `crystal`)
- `city-common/champion-finishes.js` (new): palettes + `FINISH_STORAGE_KEY`
  (`hk_ai_city_champion_finish_v1`) + `readFinish`/`writeFinish` +
  `applyFinishToObject(root, id)` (duck-typed tint, reversible).
- `city-common/host-upgrades.js` (new): styles + key
  (`hk_ai_city_host_upgrade_v1`) + `readHostUpgrade`/`writeHostUpgrade` +
  `applyHostUpgrade(root, id)`.
- `market/market.js` dispatches every kind (accessory / finish / host-upgrade
  persist; decoration / landmark navigate to `?place=<marketId>`), with an
  explicit "no working action yet" fallback.
- `city-builder/prop-library.js`: new `insertProp(itemId, transform)` mirrors
  `insertLandmark`, committing through the same history/persistence path.
- `city-builder/market-handoff.js` (new): reads `?place=`, **verifies
  ownership against the shared envelope wallet**, places via `insertProp` /
  `insertLandmark`, and clears the query param so a refresh cannot double-place.
  Wired in `city-builder.js` at the prop-library mount
  (`safe('market-handoff', …)`; also sets `window.__marketHandoff`).
- `hong-kong-real/champion-real.js`: the Champion reads the stored finish at
  creation and exposes `setFinish` / `getFinish` / `clearFinish`; the finish is
  re-applied after every skin swap.
- `city-builder/skill-hosts.js`: `createSkillHostRoot` applies
  `readHostUpgrade()` to the host visual.
- Tests: `tests/market-catalogue.test.mjs` (every item resolves to a real
  target), `tests/champion-finishes.test.mjs`, `tests/host-upgrades.test.mjs`,
  `tests/market-handoff.test.mjs`; e2e
  `P5 Programme/tests/e2e/market-actions.spec.mjs`.

## What the Stage-6 session must still land

1. **Store-level evidence existence checks (closes the remaining edge).**
   Shape/scope validation is in the ledger, but `project-store.recordLearningEvent`
   and `recordChallengeOutcome` should also confirm the evidence REFERENCES
   exist in the envelope inside the same transaction — the capability (key +
   revision), the installation, or the run record — and derive `held-out-eval` /
   `city-install` / `abstain-demo` evidence from the `outcome` rather than
   trusting caller `events[].evidence`. Refuse anything that references
   something not in the project.
2. **Mount `skill-hosts.js`** (still orphaned). The host visual already applies
   the purchased upgrade, so mounting them makes `host-upgrade` visible. Also
   surface `hostStatus` / `workshopUrl` from a placed host.
3. **Finish parity in every Champion host.** `champion-real.js` covers the City,
   Studio and any host that uses it. If Studio/Fit-Studio has its own Champion
   path, apply `readFinish()` there too.
4. **`ai-nodes.js`** for envelope-published installations (still planted-file
   only).
5. **Workshop/Studio wallet adapter** (Workshop credit UI still reads
   `champion-session.js`).
6. **Market card imagery**; **project switching + copy** orchestration (copy
   must not mint reward eligibility; switching swaps the whole wallet).
7. **Carry the S4 batch seed back through `returnTo`; add a dead-sensor UI
   control** (S5 carry-ins).
8. **Update `skill-stages.js` / `challenges.js`** if you change `CHALLENGE_IDS`,
   and keep `REWARD_SCOPES.challenge` in sync.

If you have local edits to `city-builder.js`, reconcile the single
`market-handoff` block added at the prop-library mount; nothing else in that
file was changed for this remediation.

## Verification (run every stage; browser checks outside the sandbox)

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs            # currently 543 pass / 0 fail
npm run test:imports
npm run test:library
npm run build:city
# source mode
E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium market-actions.spec.mjs wallet.spec.mjs test-track.spec.mjs recycling.spec.mjs
# built bundle
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 \
  npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium market-actions.spec.mjs wallet.spec.mjs
```

Notes:
- Rebuild after any `city-common` change before a built-mode e2e can see it.
- The two `test-results/` failures (`project-hub` "Channel closed", `recycling`
  2nd-`runBatch` timeout) were sandbox artifacts; both pass outside the sandbox.
- The recycling first test runs ~96 s of a 120 s budget — watch its headroom
  under parallel load.
- Commit style: `fix(platform): <summary> (review remediation)`.
