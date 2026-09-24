# Continuation prompt — Passiona DeepSeek implementation plan (Stages 4–6)

Copy the block below into a fresh session to resume. It is self-contained: the
new session has no memory of the prior conversation.

---

You are continuing a multi-stage implementation of the plan
`~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` in the repo
`/Users/kai/Documents/AI-education-shrink` (macOS, zsh, git repo).

## Mission

Stages 1–3 are DONE, verified, and committed on branch **`plan/passiona-deepseek`**:

- `1af6efe` chore: checkpoint pre-DeepSeek unified-platform work  *(the revert point)*
- `a3b1c67` S1 — envelope wallet + same-origin tools + market route
- `1dbed3f` S2 — learning-event earning path + working market equip
- `6276723` S3 — shared k-NN + `.cap` v2 + publish/install/run

Baseline before this work: `840a569`. Working tree is clean.

**Your job: implement Stages 4, 5, 6 — one stage at a time, same rhythm each
stage: build → test → local verified build → commit → short handoff note.**
Do NOT half-build a stage or substitute scripted successes/placeholders
(the plan forbids it). Commit after each stage so any stage is revertible.

## Read first (mandatory)

1. `/Users/kai/Documents/AI-education-shrink/P5 Programme/AGENTS.md` — canonical
   guide. Golden rules: canonical source is `buddy-kit/client/`; **never** edit
   `deploy/` (build output); no child PII; models must be **CC0 only**; avoid
   AI-slop design.
2. `P5 Programme/docs/deepseek-s1-handoff.md`, `deepseek-s2-handoff.md`,
   `deepseek-s3-handoff.md` — what already shipped and the named gaps.
3. `P5 Programme/docs/capability-bridge.md` — the `.cap` contract (v2 supersedes
   v1; v1 stays read-only).
4. `~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` — §4 the stage table,
   §5 the verification criteria.

## Locked decisions (do not relitigate)

- **Envelope-authoritative** store (`city-common/project-store.js`); Workshop
  `champion-session.js` and City `CF_KEYS` are compatibility adapters.
- **One shared k-NN** (`city-common/knn-vector.js`) mirrored from the Workshop's
  `workshop/logic/brain.js`, parity-tested. The City's v1 minmax/inverse-distance
  k-NN stays for v1 bundles only.
- **`.cap` v2** algorithm `knn-unit-majority-v2`: raw fields → optional bias
  constant → unit-normalize → shared classify (majority vote, distance ties by
  id) → sure-line `1 − d²/2` vs threshold → abstain.
- **Earning is evidence-based**: `city-common/ledger.js` `REWARD_CONFIG`, events
  via `city-common/learning-events.js`; once-per-scope, replay-safe.
- Extras in scope: project switching + copy, and city-road driving mode.

## Verification workflow (run every stage)

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs            # unit (currently 472 pass / 0 fail)
npm run test:imports                    # import-graph
npm run test:library                    # CC0 asset audit (needs any new assets)
npm run build:city                      # builds deploy/city-sim (canonical Workshop + Studio dist + /market/)
# one-off e2e against the built bundle (no deploy):
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8397 \
  npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" --project=chromium <spec>.spec.mjs
# full demo (optional manual):
npm run demo:prepare && PASSIONA_DEMO_PORT=8378 npm run demo:start   # then open /hub/
```

Note: the built bundle must be rebuilt (`npm run build:city`) after adding any
`city-common` module before a built-mode e2e can see it.

## Stage 4 — Recycling station (next)

Goal: the student's published image classifier actually routes a conveyor.

Concrete starting points (from the earlier exploration):
- Runtime contract already exists: `city-common/skill-registry.js`
  (`runSkill(project, installationId, observation)`), store ops
  `publishSkill`/`installSkill`/`runSkill` in `city-common/project-store.js`.
- Curated image features: `workshop/assets/library/features-*.js`
  (`window.WorkshopLibraryChunks`, 32 rows × 1024 float32 unit vectors),
  `workshop/assets/library/catalogue.js` (`trashnet` photos + labels +
  split), preprocessing id `mobilenet-v3-small-224-squash-f32-unit-v1`
  (`workshop/logic/model-library.js:6`). Classes: cardboard, glass, metal,
  paper, plastic, trash.
- The City's image path must feed **curated library feature vectors** (the City
  does NOT run MobileNet live). Each conveyor item needs a source image id + its
  1024-dim feature + a ground-truth label.
- Existing City hooks: `city-builder/skill-hosts.js` (`SKILL_HOSTS.sorter`,
  `hostStatus`, `workshopUrl` — params `publishTarget`/`hostInstanceId`/`returnTo`
  are currently UNREAD), `city-builder/city-builder.js` plant flow
  (`readPlantedCaps`/`writePlantedCaps`, `CAPS_KEY = p5_city_capabilities_v1`),
  `city-builder/ai-nodes.js` (display-only, `CAP_LAST_DEC_KEY` never written).

Deliver:
1. Workshop publish hook that emits a **`.cap` v2** image classifier using
   `city-common/capability-export.js` (and make `hostStatus`/`workshopUrl`
   round-trip work), OR a City-side import that publishes via
   `store.publishSkill`.
2. `city-builder/recycling-station.js`: live conveyor; item → feature →
   `runSkill`; the **prediction** selects the bin; abstain → human-check tray;
   evidence panel (input image → predicted class → bin, confidence, nearest
   examples); normal/confusing/unfamiliar fixed-seed sets; **ground truth scores
   separately and never routes**.
3. Tests proving predicted labels (not ground truth) control bin selection, and
   that changing the model changes sorting (mirror them in
   `P5 Programme/tests/e2e/` and `tests/`).

Exit: changing the student model changes observed sorting.

## Stage 5 — Driving

- Build a Workshop `drive-v1` starter + sensor-data activity (`num`/`data` senses
  in `workshop/game.js` `SENSE_REGISTRY`; numeric brains in `workshop/brains/`).
  Observation contract: left/centre/right obstacle distances, lane offset,
  heading error, speed, traffic-light state, intended turn → one of
  forward/left/right/slow/stop. Publish as a v2 `.cap` (`capability-export.js`).
- `city-builder/test-track.js`: straight roads, curves, an obstacle, a traffic
  light; 10 Hz fixed-step; show sensors + chosen action + previous decisions;
  pause/step/reset/repeat; missing input/abstain/timeout stops the vehicle;
  record collisions/interventions honestly.
- Optional city-road mode: reuse the model on the existing network
  (`city-common/traffic-network.js`, `city-builder/drive.js`, `traffic.js`).
  NOTE (important): the ambient network has **no live signal state** and does
  not expose `addVehicle`; `drive.js` is free-roam with **no sensor readout**.
  Budget accordingly — prefer a bounded route-following mode; log emergency
  stops as simulator interventions; never alter the child's layout.

Exit: changing the model changes vehicle actions in both environments.

## Stage 6 — Achievements + integration

- Wire `city-common/badges.js` `promote()` (already a pure seam) to capability
  evidence; add skill stages (built → tested → city-connected → improved).
- Three earned statues (recycler, road explorer, inventor pavilion) with
  evidence cards — decorative, never purchasable.
- Bilingual EN / 繁中 parity for all new strings (follow each app's i18n module;
  `tests/p5-i18n-parity.test.mjs` guards key-set equality).
- Full-journey Playwright on a fresh browser: tutorial → earn → build both skills
  → run in City → buy/equip/place → save → restore. Keep the 200-decision /
  installation bound.

## Named gaps carried in (fix or explicitly re-defer)

- Purchased **decorations** currently hand off to the City (`?place=<id>`);
  City-side placement gating is not wired.
- Workshop/Studio **wallet adapter**: earned/owned state reaches Market + Champion,
  but the Workshop's own credit UI still reads `champion-session.js`.
- Skill-host adapters still call the display-only path.
- Market cards have no imagery yet.

## Conventions

- Pure logic in `city-common/*.js` (node-testable, no DOM/clock/randomness);
  IDB code covered by the browser harness. A tiny **fake-IDB** pattern lives in
  `tests/project-economy.test.mjs` for store-level tests.
- One new handoff doc per stage: `P5 Programme/docs/deepseek-s<N>-handoff.md`.
- Commit message style: `feat(platform): <summary> (S<N>)`.

Start with Stage 4. Report progress after each stage with the test counts and
the commit hash.
