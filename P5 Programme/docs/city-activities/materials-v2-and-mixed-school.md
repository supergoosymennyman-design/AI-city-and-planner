# Mixed Driving School and material practice v2

The City permanently hosts `schoolScenario('mixed', 71)` using the same course renderer
and Audi loader as the driving arena. `driving-school-site.js` derives its
82.8 × 177.0 m reservation from the centreline bounds plus 10 m on every side.
Existing buildings, roads, props and trees are not moved. If placement fails,
the dock remains usable and explains the space requirement. The Audi is parked
in the City, loads through `createGLTFLoader`, and has an explicit retry state.
Closing a legacy exercise rebuilds the mixed preview. Paired trials use the same permanent road and temporarily hide the parked car; see [Permanent driving school](../permanent-driving-school.md). Ordinary school entries
select Mixed journey; explicit exercise and correction/repeat routes retain
those conditions. Course loading immediately disables Run and Step.

`city-waste.js`, `assets/city-recycling/` and the original scanner generator are
frozen v1 references. V2 is additive: `city-waste-v2.js` and
`assets/city-recycling-v2/` contain 32 distinct material fragments and their
actual MobileNet features. The same deterministic meshes appear in scanner
images, the waiting pile, the belt and the selected destination, even when the
prediction is wrong. Unknown uploaded photos use varied neutral fragments;
their features remain session-only. No existing model is automatically retrained.

`materials-v2` selects twelve held-out objects (three each of metal, plastic,
cardboard and glass). `batch-1` retains nine original objects and is named
“Earlier practice — 9 objects.” Exercise selection is saved separately in
`projects.activityExercises`; completed results include `datasetVersion`.
Historical results without that field resolve to v1 and are labelled as earlier
practice. Workshop handoffs carry the exercise. Champion Files preserve both
selection and results as part of the project envelope. New starter graphs have
four material branches and human check; authored graphs are not migrated.

## Verification

- Full unit run: 638 passed before the last additive test; final focused run:
  62 passed, covering v2 assets, all four destinations, unchanged v1 models,
  exercise recovery, driving simulation and Champion Files.
- Library audit and source/bundle import checks passed.
- Existing paired driving, recycling-machine and activity-backup browser
  suites passed (earlier-exercise fixtures now select their exercise explicitly).
- New browser coverage checks actual City Audi dimensions, mixed defaults,
  returning from legacy driving, missing Audi retry, English/Traditional Chinese
  tablet framing, wrong-bin glass identity, neutral photos, saved old selection,
  and four-material Workshop teaching. Scanner contact sheet is source-only.
- Original and v2 geometry, scanner, image and MobileNet hashes are checked.

Local screenshots are written to `/private/tmp/materials-*.png` by
`tests/e2e/materials-refresh.spec.mjs`. Regenerate the v2 data using
`scripts/generate-city-recycling-v2.mjs` with the source server on port 8379.
This procedure never rewrites the original dataset.
