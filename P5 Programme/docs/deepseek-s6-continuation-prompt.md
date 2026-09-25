# Continuation prompt — Passiona DeepSeek implementation plan (Stage 6)

Copy the block below into a fresh session to resume. It is self-contained: the
new session has no memory of the prior conversation.

---

You are continuing a multi-stage implementation of the plan
`~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` in the repo
`/Users/kai/Documents/AI-education-shrink` (macOS, zsh, git repo).

## Mission

Stages 1–5 are DONE, verified, and committed on branch **`plan/passiona-deepseek`**:

- `1af6efe` chore: checkpoint pre-DeepSeek unified-platform work  *(the revert point)*
- `a3b1c67` S1 — envelope wallet + same-origin tools + market route
- `1dbed3f` S2 — learning-event earning path + working market equip
- `6276723` S3 — shared k-NN + `.cap` v2 contract + publish/install/run
- `c7130f8` S4 — recycling station runs the published image model
- `7c36ac5` S5 — self-driving skill: Workshop sensor activity + City test track
- `9bfd239` S5 — city-road proof; the 10 Hz loop kept off IndexedDB

Baseline before this work: `840a569`. Working tree is clean.

**Your job: implement Stage 6 — Achievements and integration. This is the LAST
stage.** Same rhythm as every stage: **build → test → local verified build →
commit → short handoff note.** Do NOT half-build a stage or substitute scripted
successes, fake balances, or placeholder purchases (the plan forbids it). Commit
after the stage so it is revertible. Because it is the final stage, the handoff
note doubles as the GPT Sol handoff (plan §4): changed areas, migration
decisions, tests and results, journey evidence, model-parity evidence,
performance observations, and remaining issues.

## Read first (mandatory)

1. `P5 Programme/AGENTS.md` — canonical guide. Golden rules: canonical source is
   `buddy-kit/client/`; **never** edit `deploy/` (build output); no child PII;
   models **CC0 only**; avoid AI-slop design.
2. `P5 Programme/docs/deepseek-s3-handoff.md`, `deepseek-s4-handoff.md`,
   `deepseek-s5-handoff.md` — what already shipped and the named gaps.
3. `P5 Programme/docs/capability-bridge.md` — §11 is the shipped v2 contract
   (numeric + image + driving, publish/install/run, bounded decision log).
4. `~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` — §2 (the three progress
   forms, launch market, earned statues), §3 (minimum shared interfaces),
   §4 (the Stage 6 row), §5 (whole-experience + defaults).

## Locked decisions (do not relitigate)

- **Envelope-authoritative** store (`city-common/project-store.js`); Workshop
  `champion-session.js` and City `CF_KEYS` are compatibility adapters.
- **One shared k-NN** (`city-common/knn-vector.js`) mirrored from the Workshop's
  `workshop/logic/brain.js`, parity-tested.
- **`.cap` v2** algorithm `knn-unit-majority-v2`; **v1 stays read-only**.
- **`publishSkill` → `installSkill` → `runSkill`** is the only skill contract;
  revisions never auto-update; the decision log is bounded to **200** per
  installation (`skill-registry.js` `MAX_DECISIONS`).
- **Earning is evidence-based**: `city-common/ledger.js` `REWARD_CONFIG`, events
  via `city-common/learning-events.js`; **once-per-scope, replay-safe**; a caller
  never chooses a credit amount. Repeated testing is free; failure is never
  penalised.
- **Extras in scope**: project switching + copy, and city-road driving mode
  (S5 shipped the city-road mode).

## Stage 6 — Achievements and integration (next)

Goal (plan §4): **Complete both challenges, customise, save, and restore on a
fresh browser.**

1. **Skill stages — a new pure module.** Plan §2 lists three distinct progress
   forms; **skill stages** are `Built → Tested → City-connected → Improved` and
   describe EVIDENCE, never a score. **No skill-stages module exists today.** Add
   a pure `city-common/skill-stages.js` (node-testable, no DOM/clock/randomness)
   that derives the stage from evidence:
   - `Built` — a runnable, student-edited skill was saved/published (a capability
     exists with source identity + a passing self-test).
   - `Tested` — a held-out evaluation was run AND its results inspected.
   - `City-connected` — the skill was installed on a host and completed a real
     City test.
   - `Improved` — a newer immutable revision corrects a previously recorded
     failure against the SAME recorded scenario.
   Report it per skill (image sorter, driver) and surface it in the UI. It is not
   a currency and implies no high-score mastery.
2. **Wire the remaining reward rows to real evidence.** Today only
   `tutorial-task` is wired: it calls the ESM `award()` import from
   `city-common/learning-events.js` at `city-pregame/app.js:172`. The
   `window.PassionaLearning` classic-script shim that `learning-events.js`
   installs is currently **unreferenced** (it exists for the Workshop, which
   loads no ES modules). Wire, evidence-first and once-per-scope (all amounts
   come from `REWARD_CONFIG`):
   - `skill-saved` — a runnable, student-edited skill saved (Workshop).
   - `held-out-eval` — a held-out evaluation run AND inspected (Workshop "Test on
     new"; the recycling station's fixed-seed batch; the driving starter's "Test
     on new").
   - `city-install` — the skill installed and a City test completed (recycling
     run / test-track trial).
   - `revision-fixed` — a newer revision corrects a previously recorded failure on
     the SAME recorded scenario (compare the two immutable revisions).
   - `abstain-demo` — the intended "not sure / ask for help" response demonstrated
     (recycling human-check tray; driving stop-on-abstention).
   Events carry evidence references, never credit amounts; duplicates are
   harmless; copying a machine cannot manufacture new eligibility.
3. **Earned statues (separate from purchases, never purchasable).** Plan §2:
   **Recycler statue** (complete the recycling City trial and inspect the
   results), **Road Explorer statue** (complete the test-track trial and inspect
   the results), **Inventor Pavilion** (bring BOTH skills into the City).
   `city-common/market-catalogue.js` already states earned statues are NOT in the
   catalogue — keep them out. Build them as city objects with an inspectable
   evidence card describing what the student actually demonstrated.
4. **Badges + Logbook.** `city-common/badges.js` (`TIERS`, `promote(state, tier,
   evidence)`) and `city-common/milestones.js` (`MILESTONES`,
   `evaluateMilestones`, `milestoneSectionHTML`) exist; the City Logbook already
   renders them (`city-builder.js` reads `readBadges()`). Promote a badge/milestone
   ONLY from observed evidence, with an inspectable evidence card; awards are
   permanent.
5. **Bilingual polish.** Every new surface in **English + Hong Kong Traditional
   Chinese** (icon-led; optional detail panels) — the plan's whole-experience
   check. Follow the existing local-STR pattern and `city-builder/i18n.js`
   en/zh parity; `tests/p5-i18n-parity.test.mjs` guards the city-builder +
   champion-city dictionaries.
6. **Project switching + copy (extras in scope).** The store already has
   `createProject`/`exportProject`/`importProject`; there is **no UI or
   orchestration** for switching or copying. Wire both: a copy preserves
   achievement IDs and claimed rewards; switching swaps the complete wallet and
   progress (plan §3: "Switching to another project switches its complete wallet
   and progress"). Copying must not mint reward eligibility.
7. **Close the integration gaps cheaply and honestly** (or re-defer explicitly in
   the handoff):
   - Mount `city-builder/skill-hosts.js` (still orphaned): a placed host surfaces
     `hostStatus` / `workshopUrl`.
   - `city-builder/ai-nodes.js` is planted-file only — an envelope installation
     should get an in-world node.
   - Workshop/Studio **wallet adapter**: the Workshop credit UI still reads
     `champion-session.js` rather than the envelope.
   - Market card **imagery**; City-side placement gating for purchased
     decorations (`market.js` hands off `?place=<id>`; `city-builder.js` does not
     read `place`).
   - Carry the S4 batch seed back through the Workshop `returnTo` link.
   - S5 carry-ins: the City drive deep link auto-opens the starter (switches the
     active machine); the test track has no dead-sensor UI control.
8. **Full journey test.** A **fresh browser**: complete a tutorial (Academy room),
   earn credits, **build BOTH skills** (image classifier + driving model), run both
   in the City, buy/equip an accessory, place a decoration, save (Champion File +
   cloud code), and **restore everything in a fresh browser**. Prove English and
   Traditional Chinese, keyboard access, touch use, reduced motion, and tablet
   layouts. Test actual image-model assets in at least one browser integration run
   (S4's `recycling.spec.mjs` is the pattern). Include a performance observation
   for inference load / memory cleanup on a tablet-class device and confirm
   inactive simulations are paused.

## Verification workflow (run every stage)

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs            # unit (currently 518 pass / 0 fail)
npm run test:imports                    # import-graph
npm run test:library                    # CC0 asset audit (writes the orphan report)
npm run build:city                      # builds deploy/city-sim
# one-off e2e against the source tree, then the built bundle (no deploy):
E2E_PORT=8397 \
  npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium <spec>.spec.mjs
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8398 \
  npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium <spec>.spec.mjs
```

Notes:
- Rebuild (`npm run build:city`) after adding any `city-common` module before a
  built-mode e2e can see it.
- The e2e static server serves `buddy-kit/client` as docroot in source mode.
  `/workshop/` (bare index) is the legacy remote-embed stub; add ANY query string
  (e.g. `?publishTarget=…`, `?skill=drive`) to reach the canonical `workshop/`.
- Stage 4/5 patterns to reuse: `tests/helpers/workshop-features.mjs` (Node, real
  curated assets); `city-builder/recycling-station.js` and
  `city-builder/test-track.js` (resolve the envelope installation, run through the
  ONE pure rule / simulator); `P5 Programme/tests/e2e/recycling.spec.mjs` and
  `test-track.spec.mjs` (source **and** built).

## Named gaps carried in (fix or explicitly re-defer)

- Earned statues, skill stages, and the remaining badge/milestone promotions are
  **not built** (this stage's job).
- Reward rows beyond `tutorial-task` are **unwired**. The one call site is
  `award('tutorial-task', …)` at `city-pregame/app.js:172` (ESM import); the
  `window.PassionaLearning` shim has no call sites at all yet.
- Skill-host sockets are **not mounted** (`skill-hosts.js` orphaned;
  `ai-nodes.js` planted-file only).
- Workshop/Studio **wallet adapter** absent.
- Market cards have **no imagery**; decorations `?place=` City gating not wired.
- S4: the City does not carry a **batch seed** back through `returnTo`.
- S5: the learned driving model is **not a perfect driver** (honest and visible);
  the deep link **switches the active Workshop machine**; no dead-sensor UI
  control.
- **Project switching + copy**: store ops exist, no UI/orchestration.

## Conventions

- Pure logic in `city-common/*.js` (node-testable, no DOM/clock/randomness); IDB
  code covered by the browser harness. A tiny **fake-IDB** pattern lives in
  `tests/project-economy.test.mjs`.
- Mirror each browser proof in `P5 Programme/tests/e2e/` and each pure proof in
  `tests/`.
- One new handoff doc: `P5 Programme/docs/deepseek-s6-handoff.md` — the final one,
  including the GPT Sol handoff material from plan §4.
- Commit message style: `feat(platform): <summary> (S6)`.

Start with Stage 6. Report after the stage with the test counts and the commit hash.
