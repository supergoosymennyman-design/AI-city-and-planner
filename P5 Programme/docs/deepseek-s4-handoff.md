# Stage 4 handoff — the recycling station

Date: 2026-09-24 · branch `plan/passiona-deepseek`

## What changed

**The `.cap` v2 contract now carries IMAGE classifiers.**
- `city-common/cap-runtime.js`: a new v2 input kind `image` (`CAP_INPUT_IMAGE`,
  `CAP_IMAGE_DIMENSION = 1024`). An image bundle names its pinned feature extractor
  (`input.preprocessing`) and width; `parseCapability` refuses one that does not.
  `runInferenceUnit` accepts a `{ vector }` event, a bare array, or `{ studyIndex }`
  (a stored study example, used by compact self-tests). v1 and numeric v2 are unchanged.
- `city-common/capability-export.js`: `buildImageCapabilityV2()` — base64 little-endian
  study vectors + labels, no code. Its self-test gate re-runs one stored study example per
  label through the real runtime; **an expected abstention is now reproducible too**
  (previously the gate silently rejected any abstention case, so a bundle could never
  self-test the honest "not sure" path).

**The station's pure rules — `city-common/recycling.js` (new).**
- `BINS` / `BIN_FOR_LABEL`, `checkCompatibility` (extractor + dimension + algorithm).
- `routeDecision` / `routeResult` / `routeItem` / `runConveyor`: **the prediction selects
  the bin**; ground truth is copied onto the result for scoring only and is never read by
  the routing rule. Abstention → `human-check`.
- `scoreRun`: correct/wrong/abstained against ground truth, reported separately.
- `selectItems`: fixed-seed `normal` / `confusing` / `unfamiliar` batches (the unfamiliar
  set is the classes the model was not taught — the honest route to an abstention).

**Workshop publishes → City runs.**
- `workshop/game.js`: headless host seam `publishImageModel(modelId, table)` returns a
  placed library photo model (TrashNet k-NN) as plain data `{ id, name, dataset, labels, k,
  examples }`. Reads only the shipped curated photos — private/uploaded examples never leave.
- `workshop/publish-capability.js` (new ES module, loaded by `index.html`): reads
  `publishTarget` / `hostInstanceId` / `returnTo`, builds the image bundle, `store.publishSkill`,
  and (when a host is named) `store.installSkill(key, hostInstanceId, { hostType: 'sorter' })`.
  Re-publishing an identical trained state reuses the published key (no spurious revision).
  A small banner appears only when the City sends the student here; publishing is never automatic.
- `city-builder/recycling-station.js` (new): the live conveyor. Resolves the skill from the
  authoritative envelope installation (`store.runSkill`) with a planted image `.cap` as the
  offline fallback; both go through the one pure routing rule. Loads the REAL curated
  features from `../workshop/assets/library/` (chunk scripts decoded + unit-normalized),
  shows source image → predicted class → bin → confidence → nearest studied photos, bins,
  the human-check tray, and a separately-scored answer-key line. `trainFromLibrary()` is the
  deterministic browser-run/demo entry that publishes a real-trained model with no round-trip.
- `city-builder/city-builder.js`: the capability panel now recognises image caps (not
  "unreadable"), offers "Run the recycling station", and the planted-file size guard allows a
  real image model (2 MB vs 200 KB) — a 120-photo sorter is legitimately hundreds of KB.
- `city-builder/recycling-station.css` (new): self-contained, ≥48px controls, reduced-motion aware.

## Tests

- `tests/cap-image.test.mjs`, `tests/recycling.test.mjs`, `tests/workshop-publish.test.mjs`.
- `P5 Programme/tests/e2e/recycling.spec.mjs` — two real-browser runs against the **actual
  curated 1024-dim features**: (1) routes by prediction and a genuinely different model
  changes sorting; (2) the Workshop publishes a `.cap` the City then installs and resolves.
- Verified: `node --test tests/*.test.mjs` → **499 pass / 0 fail** (was 472);
  `test:imports` OK; `test:library` PASS; `build:city` OK; the recycling spec passes in
  **source** and against the **built** bundle. Regression: `project-hub`, `gateways`,
  `badges-capabilities` (24 tests) all pass.
- One test-infrastructure fix: the e2e static server mapped `/workshop/*` to the legacy
  remote-embed stub (`project-shell`). Stage 1 packaged the real Workshop, so assets and the
  publish deep link now resolve to the canonical `workshop/`; the bare `/workshop/` index
  keeps the stub for the existing hub/gateway previews.

## Named gaps (carried forward)

- **Skill-host sockets are not mounted.** `skill-hosts.js` is still orphaned; the station is
  reached from the capability panel. `hostStatus` / `workshopUrl` exist but no placed host
  surfaces them yet (Stage 6 integration).
- **`ai-nodes.js` is still planted-file only.** An envelope-published installation gets no 3D
  node; the station records last decisions under the planted cap id it ran.
- **The Workshop publish banner needs a trained TrashNet library model** on the table
  (Data library). With none it reports `no-image-model` honestly.
- Published image caps default to a **threshold of 0.2** (sure line `1 − d²/2` → d ≤ 1.265):
  the operating point where same-class neighbours (~1.23) decide and unseen classes (~1.35)
  abstain to the human-check tray. The bundle carries it; the child does not tune it yet.
- The child cannot yet re-run the *same batch* from the City after returning from the
  Workshop via the `returnTo` link (the batch seed is not yet carried in the URL).
