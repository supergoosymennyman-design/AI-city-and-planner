# Stage 6 handoff — achievements and integration (final)

Current backup/storage contract: [Project backup and recovery](project-backup-and-recovery.md). The historical stage notes below describe the earlier implementation.

Date: 2026-09-25 · branch `plan/passiona-deepseek` · baseline `840a569`

This is the last stage of the DeepSeek implementation plan
(`~/Desktop/Passiona-DeepSeek-Implementation-Plan.md`). It is also the GPT Sol
handoff material required by plan §4.

## Status

Stage 6 is complete and committed. Exit condition (plan §4): *complete both
challenges, customise, save, and restore on a fresh browser* — proven end to end
by `full-journey.spec.mjs` in a second, empty browser context, and per-leg by the
dedicated specs below.

Commits landed on top of the Stage-5 head (`9bfd239`), plus the S6 continuation
prompt (`d7f46c5`):

| commit | scope |
|---|---|
| `eee330f` | `fix(platform): … (review remediation)` — reward-scope allow-list + typed evidence, the driving goal-vs-stop fix, and full market-action wiring |
| `55c2980` | `feat(platform): evidence-derived skill stages + challenge-scoped rewards (S6a)` |
| `87911b8` | `feat(platform): earned statues, evidence-promoted badges, project switching (S6b)` |
| `3f33f60` | `feat(platform): verify learning-event evidence exists before it mints (S6c)` |
| `c511e96` | `feat(platform): skill-host socket bridge, batch returnTo, i18n coverage (S6c)` |
| `61174fc` | `docs: stage 6 handoff (final, GPT Sol material)` |
| `780aea9` | `feat(platform): envelope AI nodes, socket installs, full-journey spec (S6c)` |
| `c8e32ac` | `feat(platform): dead-sensor control on the City test track (S5 carry-in)` |

## Changed areas

**New pure modules (`city-common/`).**
- `challenges.js` — the registered challenges (`image-sorter`, `driver`) and the
  per-scenario run record used to detect an honest revision fix. A reward scope
  is the CHALLENGE, never a machine id, so copying a machine cannot mint
  eligibility.
- `skill-stages.js` — `Built → Tested → City-connected → Improved`, derived
  purely from envelope evidence. Not stored, not a score.
- `achievements.js` — badge tiers promoted from observed evidence
  (Skeptic → Auditor → Architect) plus the evidence card.
- `statues.js` — the three earned statues, kept out of `market-catalogue.js`.
- (`champion-finishes.js`, `host-upgrades.js` — the review remediation's finish
  and host-upgrade appliers.)

**Envelope store (`city-common/project-store.js`).**
- `recordChallengeOutcome(challengeId, outcome, events)` records a City run and
  commits its rewards + badge promotion in ONE IndexedDB transaction, then
  verifies inside that transaction that the evidence references really exist
  (capability, installation, abstention) before anything mints. `city-install`
  is stamped with the REAL installation id.
- `readChallenges`, `readAchievements`, `listProjects`, `switchProject`,
  `copyProject`. A copy carries the same claimed rewards so it cannot re-earn;
  switching swaps the complete wallet and progress; badges are mirrored to the
  legacy key so the Logbook and Champion File keep working.

**Wiring.** Workshop publish → `skill-saved`; recycling station and City test
track → `held-out-eval` / `city-install` / `abstain-demo` / `revision-fixed`
(the last derived from the recorded run, not claimed). The project bar gained a
project switcher and Copy. The Logbook renders badge evidence cards and the
statues section. Skill-host sockets now see envelope-published skills. The
recycling station carries its fixed-seed batch through the Workshop `returnTo`.

## Migration decisions (locked)

- **Envelope-authoritative**, per the earlier stages. Badges live in
  `projects.badges`; the legacy `p5_city_badges_v1` key is a mirror so the
  Logbook, planner, and Champion File are unchanged. Skill stages are DERIVED,
  never stored. Milestones stay the planner's layout recognition (no change).
- **Evidence over scores.** Skill stages and badge tiers only ever move on
  recorded evidence; failure is never penalised and repeated testing is free.

## Tests and results

From the repo root, on the frozen tree:

```bash
node --test tests/*.test.mjs      # 553 pass / 0 fail  (was 518 at baseline)
npm run test:imports             # OK — source AND bundle (160 / 164 files)
npm run test:library             # PASS (2 known orphans, 0 missing/dup/oversized)
npm run build:city               # OK (library audit + import graph + minify)
```

New unit coverage: `tests/skill-stages.test.mjs` (9), `tests/achievements.test.mjs`
(5), plus list/copy/switch, atomic badge promotion, the revision-fix sequence,
and evidence-existence refusals in `tests/project-economy.test.mjs`; the ledger
scope/typed-evidence tests and the bounded i18n parity extension
(`tests/p5-i18n-parity.test.mjs`).

Browser (source and built), all passing:
`full-journey.spec.mjs`, `recycling.spec.mjs`, `test-track.spec.mjs`,
`wallet.spec.mjs`, `market-actions.spec.mjs`, `project-hub.spec.mjs`,
`city-smoke.spec.mjs`, `badges-capabilities.spec.mjs`, `picker.spec.mjs`,
`prop-persistence.spec.mjs`.

## Journey evidence (per leg)

- **The whole journey in one run:** `full-journey.spec.mjs` — a fresh browser
  earns through the real recycling path (build → install → run), buys an
  accessory off the credits, exports the project, then a SECOND empty browser
  restores it and the wallet, ownership, badge and earned statue all return.
- **Tutorial → credits:** `wallet.spec.mjs` — a learning event funds the market.
- **Build a skill:** `recycling.spec.mjs` — the Workshop publishes a `.cap` the
  City installs and runs; `test-track.spec.mjs` for the driving model.
- **Change the model, observe the change:** both specs prove a genuinely
  different model changes sorting / vehicle actions.
- **Customise:** `market-actions.spec.mjs` — every purchasable type has a working
  action; a bought decoration really places and clears the request.
- **Save / restore:** `full-journey.spec.mjs` (fresh browser, store round-trip);
  `save-restore.spec.mjs` — Champion File round-trip; `project-hub.spec.mjs` —
  import hydrates City state before resume.

## Model-parity evidence

- `tests/knn-vector-parity.test.mjs` loads the SHIPPED Workshop brain and asserts
  identical decisions across a seeded grid plus ties.
- `tests/driving.test.mjs` (with the remediation's goal fix) proves the model's
  actions control movement; a clear-road stop inside the goal margin is an
  emergency stop, never a goal.
- `tests/cap-image.test.mjs` / `tests/recycling.test.mjs` prove the prediction
  selects the bin and ground truth never routes.

## Performance observations

- The City test track runs inference at 10 Hz; the per-step decision is
  in-memory, and an envelope installation's bounded log (200 decisions,
  `MAX_DECISIONS`) is written throttled (every 10th + terminal step), so a
  1200-step city-road run never stalls on IndexedDB. Whole-trial runs use the
  pure simulator and mirror once.
- Skill-stage derivation is pure and cheap (no clock/storage); badges are
  promoted once per run inside an existing transaction.

## Remaining issues

1. **Drive deep link switches the active Workshop machine.** The City's
   `?skill=drive` hand-off deliberately loads the Driving starter and autosaves
   first, so nothing is lost — but it does replace whatever was on the table.
   `game.js` exposes no cheap "is this the child's own machine" predicate, so a
   safe fix needs a small accessor there; left as-is rather than risking that
   file. (The dead-sensor UI control from S5 is DONE — see below.)
2. ~~**Studio wallet adapter** — the Workshop/Studio credit UI still reads
   `champion-session.js`.~~ **RESOLVED (S6c).** The Studio now reads and spends the
   SHARED envelope wallet: `studio/src/champion.js` is an envelope-first adapter
   (`shopState()`/`purchase()` go through `project-store.js` + `ledger.js`, with the
   Studio's pure `unlock.js` kept as the pre-gate and the session economy mirrored as
   a compatibility adapter). The Workshop/Studio `Credits & Owned Gear` dialog reads
   the envelope via `window.PassionaLearning.wallet()` (auto-detected) or an explicit
   provider, and teacher awards route to the envelope with the PIN still verified.
   `migrateEconomyFromChampion` imports a legacy session wallet exactly once, and
   `studio/dist` was rebuilt so the bundle matches `src`. See the S6c addendum below.
3. **Interpretation note:** the review-remediation doc states "`skill-hosts.js`
   is still orphaned". It is NOT — `prop-library.js` mounts it with sockets. The
   real gap was envelope awareness, now bridged for both reads (sockets see
   envelope skills) and writes (Save connection creates a real installation).
4. **Milestones stay planner-driven.** Badges cover skill evidence; the milestone
   taxonomy remains the planner's layout recognition, so milestones are not
   mirrored into the envelope. Acceptable, but a future stage could unify them.

Resolved since the first draft of this handoff: the ai-node bridge for envelope
installations, the skill-socket write path, the one combined fresh-browser
journey spec (`full-journey.spec.mjs`), the S5 dead-sensor UI control, the
Studio/Workshop envelope wallet adapter (S6c — below), and the full S6c hardening
round (existence checks, badge ladder, two-tab proof, durability, migration and
oversized-export proof — below).

## S6c — Studio/Workshop envelope wallet adapter (follow-up)

Closes remaining-issue item 2 above. The envelope is authoritative; the Champion
session is a compatibility adapter.

- **`city-common/studio-wallet.js` (new, pure)** — `studioCatalogue(catalog)` maps
  the Studio model catalogue into the ledger catalogue shape (`price` from
  `unlock.coins`, `0` for free/level) so `store.purchase` reads the SAME price the
  Studio showed; `walletOf(economy)` reads the Studio `{coins, owned}` shape.
  Unit coverage: `tests/studio-wallet.test.mjs` (8 tests, includes a real
  `purchaseItem` debit + idempotency check).
- **`studio/src/champion.js`** — on open it connects `project-store.js`, imports the
  legacy session wallet exactly once (`migrateEconomyFromChampion`), caches
  `readEconomy()` for the synchronous shop readout, mirrors it into
  `session.file.economy`, and re-reads on `passiona:project-store-change` and window
  focus. `shopState()` prefers the envelope; `purchase()` asks the Studio's pure
  `unlock.js` first (the level gate still holds) then commits through
  `store.purchase`. No IndexedDB → the original session economy is the wallet,
  unchanged. Teacher award / legacy-ownership import / deliberate Champion-File
  restore are routed to the envelope (`teacherAward`, `importLegacyOwned`,
  `replaceWallet` — restore REPLACES, never merges).
- **`workshop/toolbox/champion-controls.js`** — the credits dialog reads the shared
  wallet through an injected async `wallet()` or, automatically, the
  `window.PassionaLearning` shim; a teacher award routes through `awardTo` (or the
  shim's new `teacherAward`) after `ChampionSession.verifyPIN`. With no envelope
  every path is the session, exactly as before.
- **`champion-session.js`** exports `verifyPIN` (additive); **`learning-events.js`**
  exposes `teacherAward` on the shim. One-way mirror only — the session economy is
  never a source of credits.

Build + verification (frozen tree):

```bash
node --test tests/*.test.mjs       # 561 pass / 0 fail (553 + 8 new)
npm run test:imports              # OK (168 files)
npm run test:library              # PASS
npm run build:city                # OK (studio/dist rebuilt first: cd client/studio && npm run build)
cd "P5 Programme/buddy-kit/client/studio" && npm test   # 2159 pass / 0 fail
# source mode
E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium wallet.spec.mjs market-actions.spec.mjs full-journey.spec.mjs
# built bundle (Studio + Workshop wallet surfaces)
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 npx playwright test \
  --config "P5 Programme/tests/e2e/playwright.config.mjs" --project=chromium \
  studio-wallet.spec.mjs wallet.spec.mjs market-actions.spec.mjs full-journey.spec.mjs
```

`studio-wallet.spec.mjs` (built mode): seed the shared wallet → the Studio shows it
→ buy a 40-credit Studio model → Studio balance falls → the store holds the debit +
ownership (and a replay cannot charge twice) → the Market reads the same balance;
then the Workshop credits dialog shows the same envelope balance.

## S6c hardening — the review findings closed (follow-up)

On top of the adapter, a bounded remediation closed the remaining accepted review
findings. Each landed as its own verified commit:

| commit | scope |
|---|---|
| `4717240` | `feat(platform): existence-check skill-saved and tutorial-task (S6c)` |
| `53fcb79` | `feat(platform): existence-check remaining rewards + badge ladder + store cleanup (S6c)` |
| `42e828d` | `test(platform): two-tab concurrency proof for the shared wallet (S6c)` |
| `7968730` | `feat(platform): storage durability + eviction restore offer (S6c)` |
| `1eeb194` | `feat(platform): pure challenge-outcome, migration + oversized-export proof (S6c)` |

**Existence checks.** `recordSkillSaved(capabilityKey)` refuses a key the envelope
does not hold (or whose self-test fails), then mints `skill-saved` scoped to the
capability's challenge. `recordTutorialTask(room)` refuses a room the project has
not completed; `markTutorialRoom(room)` is the Academy's record. The shared door
(`learning-events`) routes both types at these methods, so `award('skill-saved'…)`
and `award('tutorial-task'…)` can no longer mint from stub evidence.

**Badge ladder.** `badgeAchievement` now returns the highest tier only when the
whole ladder below it is satisfied: Architect needs BOTH challenges installed AND a
held-out evaluation AND an abstain demo; Auditor needs the held-out rung too. The
abstain gate additionally requires ≥1 CORRECT graded answer in the same run (the
recycling station and the City test track pass their counts explicitly).

**Store hygiene.** `recordChallengeOutcome`'s non-transactional body is now the
pure `applyChallengeOutcome(current, …)` (unit-tested without IDB); the store calls
it INSIDE the `mutate` transaction, evidence-existence checks included (no TOCTOU).
The badge mirror is written AFTER commit with a warning on failure; `readEconomy`,
`readSection`, `readCapabilities`, `readInstallations`, `readChallenges` and
`readAchievements` re-read IndexedDB instead of the cached copy; the `already-paid`
ledger branch builds a NEW economy; `stageOf`'s self-test is memoised (a published
revision is immutable, so the result is stable).

**Durability.** `city-common/persistence.js` requests `navigator.storage.persist()`
at boot from every shell (city-builder, planner, pregame, hub, market) and, on a
returning device whose envelope is empty, offers the Champion File / cloud restore
rather than silently starting from zero. CAVEAT: `persist()` is only a SUGGESTION —
a browser may ignore it and iOS Safari can still evict after ~7 days. The Champion
File (💾) and cloud codes (☁️) remain the real safety net.

**Copy semantics (plan §3).** `copyProject` keeps the FULL clone: wallet, claimed
rewards, achievements and progress all travel, and a copy is explicitly NOT
eligible to re-earn (it carries the same `claimed` book). A copy is therefore an
INDEPENDENT FORK with no single-project advantage — it cannot mint a second
eligibility for any reward already claimed in the source.

Verification (frozen tree):

```bash
node --test tests/*.test.mjs      # 572 pass / 0 fail
npm run test:imports             # OK (171 files)
npm run test:library             # PASS
npm run build:city               # OK
# source browser checks
E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium full-journey.spec.mjs recycling.spec.mjs test-track.spec.mjs \
  wallet.spec.mjs market-actions.spec.mjs badges-capabilities.spec.mjs \
  migration.spec.mjs two-tab-wallet.spec.mjs
```

New coverage: `tests/persistence.test.mjs` (6), `tests/project-export-oversized.test.mjs`
(2 — a 24 MB three-model export round-trips every asset and all progress), the pure
`applyChallengeOutcome` + existence-check tests in `tests/project-economy.test.mjs`,
the stricter ladder in `tests/achievements.test.mjs`, and the `migration.spec.mjs`
(an older serialized envelope upgrades and still earns) and `two-tab-wallet.spec.mjs`
(two pages, one context, no lost award and no double-spend) browser specs.

### City → Model Studio → City model editing (follow-up)

- **Decorate Select/Move works during and after placement.** The placement overlay
  is a full-screen pointer boundary (`z-index: 2147483390`) that covered the
  Decorate bar, so "Select / Move" and any model tap looked dead after a model was
  dropped (the child had to find the small "✓ Done" pill). The bar now sits above
  the overlay, Select/Move leaves placement first (`propLibrary.cancelPlacement`),
  the Models button does too, Escape leaves a pending placement before it leaves
  Decorate, and switching to Explore cancels placement.
- **The same-origin Model Studio page did not exist.** The City's "Edit model in
  Fit Studio" opened `/studio/model.html?transfer=…`, but the Vite Studio shipped
  only `index.html` — the working `model.html` lived in the separate Fit Studio
  origin, which cannot share the same-origin transfer IndexedDB. Added
  `studio/model.html` + `studio/src/model-entry.js` as a second Vite entry, using
  the SAME `city-common/model-transfer.js` store the City writes. The City's
  return half (already built) now runs: it validates the returned GLB, stores it as
  a device-local custom model, and swaps it onto that one placed object.
- Return is seamless: the draft's `returnTo` resumes the same city
  (`?resume=1`/`?example=1&mode=decorate`), the edited object is re-selected so its
  inspector is right there, and the `studioTransfer` query param is cleaned so a
  refresh cannot replay.
- Library GLBs that reference external textures carry an absolute `sourceUrl` in
  the draft so the Model Studio resolves and EMBEDS them; the saved revision is
  self-contained.
- Fixed a latent `history` shadowing bug in the City return handler
  (`history.replaceState` → `window.history.replaceState`): `history` is the
  module's command-history object, so the call threw — invisible while the page
  404'd.
- Coverage: `P5 Programme/tests/e2e/city-model-edit.spec.mjs` (source: select,
  resize, delete; built: the full City → Model Studio → City round-trip).

## GPT Sol handoff (plan §4 checklist)

- **Changed areas:** `city-common/{challenges,skill-stages,achievements,statues,
  ledger,driving,project-store,market-catalogue,champion-finishes,host-upgrades}.js`,
  `city-builder/{city-builder,recycling-station,test-track,market-handoff,
  prop-library,skill-hosts}.js`, `city-common/project-bar.{js,css}`,
  `market/market.js`, `hong-kong-real/champion-real.js`, `workshop/publish-capability.js`,
  `champion-city/styles.css`, plus tests and docs.
- **Migration decisions:** see above (envelope-authoritative; derived stages;
  legacy keys as mirrors).
- **Tests and results:** 553 unit / 0 fail; imports OK; library PASS; build OK;
  9 browser specs green in source and (market/wallet) built mode.
- **Model-parity evidence:** shared k-NN parity, image routing by prediction,
  driving action control + honest stops.
- **Performance:** 10 Hz loop off IndexedDB; ≥44px/48px controls; reduced-motion aware.
- **Remaining issues:** the four items above.

## How to verify

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs && npm run test:imports && npm run test:library && npm run build:city
E2E_PORT=8397 npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium full-journey.spec.mjs recycling.spec.mjs test-track.spec.mjs wallet.spec.mjs \
  market-actions.spec.mjs project-hub.spec.mjs badges-capabilities.spec.mjs \
  migration.spec.mjs two-tab-wallet.spec.mjs city-model-edit.spec.mjs
# built bundle
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 npx playwright test \
  --config "P5 Programme/tests/e2e/playwright.config.mjs" --project=chromium full-journey.spec.mjs market-actions.spec.mjs wallet.spec.mjs
```

Note: the bare `/workshop/` route is the legacy embed stub; add any query string
(e.g. `?publishTarget=city`) to reach the canonical Workshop.
