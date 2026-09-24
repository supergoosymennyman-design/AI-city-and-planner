# Stage 3 handoff — the capability bridge (v2)

Date: 2026-09-24 · branch `plan/passiona-deepseek`

## What changed

**One shared k-NN, proven identical to the Workshop's.**
- `city-common/knn-vector.js` (new, pure): a mirror of the Workshop
  `logic/brain.js` rules — unit vectors, Euclidean distance, k-nearest,
  **majority vote**, distance ties by id, vote ties by the nearer voter, plus
  `unitVec` / `numberVec` / `surenessOf`.
- `tests/knn-vector-parity.test.mjs` loads the **shipped Workshop brain** and
  asserts identical (label, value, evidence ids/labels/distances) across a
  seeded grid of 200 queries × 9 k values, plus deliberate distance/vote ties.

**A new contract, `.cap` specVersion 2 (`knn-unit-majority-v2`).**
- `cap-runtime.js` now parses v1 **and** v2 and dispatches inference:
  event → raw fields → optional bias → unit-normalize → shared classify →
  sure-line (`1 − d²/2`) vs threshold → abstain. v1 bundles stay read-only and
  unchanged.
- `city-common/capability-export.js` (new, pure): deterministic builder for a v2
  bundle from a labelled example set (base64 little-endian vectors/labels, no
  code).

**The publish → install → run contract.**
- `city-common/skill-registry.js` (new, pure) over the envelope's reserved
  `capabilities` / `installations` slots: `publishCapability` (self-test gate,
  immutable per revision), `installSkill` (host-kind check, idempotent),
  `runSkill` (returns the real decision; bounded **200**-decision log),
  `updateAvailable` (surfaces a revision; **never auto-replaces**).
- `project-store.js` exposes `publishSkill` / `installSkill` / `runSkill`,
  each committing inside one transaction.

## Tests

- `tests/knn-vector-parity.test.mjs`, `tests/cap-v2.test.mjs`,
  `tests/skill-registry.test.mjs`; a store-level skill test in
  `tests/project-economy.test.mjs`.
- Verified: `node --test tests/*.test.mjs` → **472 pass / 0 fail** (v1 cap tests
  still green).

## Named gaps (carried forward)

- **Workshop export UI**: the shared builder and contract exist, but the
  Workshop's publish button/params (`publishTarget`, `hostInstanceId`) are still
  unread — Stage 4 needs the image path, so the exporter hook lands there.
- **Host adapters**: `skill-hosts.js` still calls the display-only path; the
  recycling station (Stage 4) is the first real `runSkill` consumer.
- Image-kNN reuses the **curated library feature vectors** (the City does not run
  the MobileNet extractor live), which is what Stage 4 will feed it.
