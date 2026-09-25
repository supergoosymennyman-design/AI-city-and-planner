# Stage 6 handoff — achievements and integration (final)

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

1. **S5 carry-ins (unchanged):** the City drive deep link still switches the
   active Workshop machine; the test track still has no dead-sensor UI control.
2. **Studio wallet adapter** — the Workshop/Studio credit UI still reads
   `champion-session.js`. (`publish-capability.js` already awards through the
   envelope `learning-events.js`.)
3. **Interpretation note:** the review-remediation doc states "`skill-hosts.js`
   is still orphaned". It is NOT — `prop-library.js` mounts it with sockets. The
   real gap was envelope awareness, now bridged for both reads (sockets see
   envelope skills) and writes (Save connection creates a real installation).
4. **Milestones stay planner-driven.** Badges cover skill evidence; the milestone
   taxonomy remains the planner's layout recognition, so milestones are not
   mirrored into the envelope. Acceptable, but a future stage could unify them.

Resolved since the first draft of this handoff: the ai-node bridge for envelope
installations, the skill-socket write path, and the one combined fresh-browser
journey spec (`full-journey.spec.mjs`).

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
  market-actions.spec.mjs project-hub.spec.mjs badges-capabilities.spec.mjs
# built bundle
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 npx playwright test \
  --config "P5 Programme/tests/e2e/playwright.config.mjs" --project=chromium full-journey.spec.mjs market-actions.spec.mjs wallet.spec.mjs
```

Note: the bare `/workshop/` route is the legacy embed stub; add any query string
(e.g. `?publishTarget=city`) to reach the canonical Workshop.
