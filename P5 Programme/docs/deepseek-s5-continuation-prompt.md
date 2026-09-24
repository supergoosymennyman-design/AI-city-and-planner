# Continuation prompt — Passiona DeepSeek implementation plan (Stage 5)

Copy the block below into a fresh session to resume. It is self-contained: the
new session has no memory of the prior conversation.

---

You are continuing a multi-stage implementation of the plan
`~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` in the repo
`/Users/kai/Documents/AI-education-shrink` (macOS, zsh, git repo).

## Mission

Stages 1–4 are DONE, verified, and committed on branch **`plan/passiona-deepseek`**:

- `1af6efe` chore: checkpoint pre-DeepSeek unified-platform work  *(the revert point)*
- `a3b1c67` S1 — envelope wallet + same-origin tools + market route
- `1dbed3f` S2 — learning-event earning path + working market equip
- `6276723` S3 — shared k-NN + `.cap` v2 + publish/install/run
- `c7130f8` S4 — recycling station runs the published image model

Baseline before this work: `840a569`. Working tree is clean.

**Your job: implement Stage 5 — Driving.** Same rhythm as every stage:
**build → test → local verified build → commit → short handoff note.** Do NOT
half-build a stage or substitute scripted successes/placeholders (the plan
forbids it). Commit after the stage so it is revertible. Stages 6 remains after this.

## Read first (mandatory)

1. `/Users/kai/Documents/AI-education-shrink/P5 Programme/AGENTS.md` — canonical
   guide. Golden rules: canonical source is `buddy-kit/client/`; **never** edit
   `deploy/` (build output); no child PII; models **CC0 only**; avoid AI-slop design.
2. `P5 Programme/docs/deepseek-s3-handoff.md` and `deepseek-s4-handoff.md` — what
   already shipped and the named gaps.
3. `P5 Programme/docs/capability-bridge.md` — the `.cap` contract (v2 supersedes v1;
   v1 stays read-only). **For Stage 5 you reuse the NUMERIC v2 path already built in
   S3** (`buildCapabilityV2` in `city-common/capability-export.js`) — the sensor model
   is named numeric fields, not the S4 image path.
4. `~/Desktop/Passiona-DeepSeek-Implementation-Plan.md` — §3 "Self-driving skill",
   §4 the stage table, §5 the verification criteria.

## Locked decisions (do not relitigate)

- **Envelope-authoritative** store (`city-common/project-store.js`); Workshop
  `champion-session.js` and City `CF_KEYS` are compatibility adapters.
- **One shared k-NN** (`city-common/knn-vector.js`) mirrored from the Workshop's
  `workshop/logic/brain.js`, parity-tested.
- **`.cap` v2** algorithm `knn-unit-majority-v2`: raw fields → optional bias
  constant → unit-normalize → shared classify (majority vote, distance ties by id)
  → sure-line `1 − d²/2` vs threshold → abstain.
- **`publishSkill` → `installSkill` → `runSkill`** (`city-common/skill-registry.js`,
  store ops in `project-store.js`) is the only skill contract; revisions never
  auto-update. Stage 4 established the publish-bridge pattern: a **Workshop host
  seam** returns plain data, an **ES module** (`workshop/publish-capability.js`)
  builds + publishes + installs, and the City **resolves the installation** and runs
  it via `store.runSkill`. Follow that pattern for driving.
- Earning is evidence-based: `city-common/ledger.js` `REWARD_CONFIG`, events via
  `city-common/learning-events.js`; once-per-scope, replay-safe.
- Extras in scope: project switching + copy, and city-road driving mode.

## Stage 5 — Driving (next)

Goal: **changing the model changes vehicle actions in both environments.**

1. **Workshop `drive-v1` starter + sensor-data activity.** Observation contract:
   left / centre / right obstacle distances, lane offset, heading error, speed,
   traffic-light state, intended turn → one of **forward / left / right / slow /
   stop**. Reuse the existing `num`/`data` senses in `workshop/game.js`
   `SENSE_REGISTRY` and the numeric brains in `workshop/brains/`. Students label
   sensor situations, train, inspect held-out cases, and publish as a **v2 `.cap`**
   (`buildCapabilityV2`, numeric fields — already exists). Follow the S4 publish
   bridge: a host seam on `game.js` + an ES module + `store.publishSkill/installSkill`.
2. **`city-builder/test-track.js`** (new): straight roads, curves, an obstacle, and
   a traffic light; **10 Hz fixed-step**; show sensors + chosen action + previous
   decisions; pause / step / reset / repeat-the-same-trial; **missing input,
   abstention, timeout, or runtime failure stops the vehicle**; record collisions
   and interventions honestly — never a hidden successful driver.
3. **Optional "Try in my city".** Reuse the same model + observation contract on the
   existing road network. NOTE (important): the ambient network has **no live signal
   state** and does not expose `addVehicle`; `city-builder/drive.js` is free-roam with
   **no sensor readout**. Prefer a bounded route-following mode; log emergency stops
   as simulator interventions; **never alter the child's layout**. If no usable route
   exists, explain what is missing and offer the track.

Exit: changing the model changes vehicle actions in both environments.

## Verification workflow (run every stage)

```bash
cd /Users/kai/Documents/AI-education-shrink
node --test tests/*.test.mjs            # unit (currently 499 pass / 0 fail)
npm run test:imports                    # import-graph
npm run test:library                    # CC0 asset audit (writes the orphan report)
npm run build:city                      # builds deploy/city-sim
# one-off e2e against the built bundle (no deploy):
E2E_DOCROOT="P5 Programme/deploy/city-sim" E2E_PORT=8397 \
  npx playwright test --config "P5 Programme/tests/e2e/playwright.config.mjs" \
  --project=chromium <spec>.spec.mjs
```

Notes:
- Rebuild (`npm run build:city`) after adding any `city-common` module before a
  built-mode e2e can see it.
- The e2e static server (`P5 Programme/tests/e2e/static-server.mjs`) serves
  `buddy-kit/client` as docroot in source mode. `/workshop/` (bare index) is the
  legacy remote-embed stub, but workshop **assets and the publish deep link
  (`?publishTarget=…`)** resolve to the canonical `workshop/` source (fixed in S4).
- Stage 4 tests load the real curated photos from
  `workshop/assets/library/` — see `tests/helpers/workshop-features.mjs` (Node) and
  `city-builder/recycling-station.js` (browser chunk decode) for the pattern to reuse
  if Stage 5 needs real assets.

## Named gaps carried in (fix or explicitly re-defer)

- Purchased **decorations** hand off to the City (`?place=<id>`); City-side placement
  gating is not wired.
- Workshop/Studio **wallet adapter**: earned/owned reaches Market + Champion, but the
  Workshop's own credit UI still reads `champion-session.js`.
- **Skill-host sockets are not mounted** — `city-builder/skill-hosts.js` is still
  orphaned; S4 reached the station from the capability panel. `hostStatus` /
  `workshopUrl` exist but no placed host surfaces them. (`ai-nodes.js` is also still
  planted-file only.)
- Market cards have no imagery yet.
- S4: the City does not yet carry a batch seed back through the Workshop `returnTo`
  link.

## Conventions

- Pure logic in `city-common/*.js` (node-testable, no DOM/clock/randomness); IDB code
  covered by the browser harness. A tiny **fake-IDB** pattern lives in
  `tests/project-economy.test.mjs`.
- Mirror each browser proof in `P5 Programme/tests/e2e/` and each pure proof in `tests/`.
- One new handoff doc per stage: `P5 Programme/docs/deepseek-s5-handoff.md`.
- Commit message style: `feat(platform): <summary> (S5)`.

Start with Stage 5. Report after the stage with the test counts and the commit hash.
