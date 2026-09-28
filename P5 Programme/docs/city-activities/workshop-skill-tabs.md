# Workshop skill tabs and City runs

Workshop's Recycling, Driving and Free build tabs retain machine IDs in
`projects.workshopSkills`. Existing work is first retained in Free build.
Switching flushes the machine and shared workspace before opening the next slot;
a failed save blocks navigation. Existing paired Driving installations can supply
the original machine when the tab has no selection yet.

Recycling explicitly resolves a `table:<block id>`, `saved:<model id>` or `quick`
reference. One eligible candidate selects automatically; multiple candidates
require a choice. Camera sense with Memory and library photo k-NN models export
their own shelves, k and confidence threshold. Numeric example IDs determine
Camera tie order. Unsupported brains and inputs give a reason. Labels retain
the model's original spelling; English and Traditional Chinese material aliases
are applied only when choosing a City bin.

**Try in AI City** captures the latest selected model, flushes saves and navigates
in the same tab. Driving captures its steering and speed revision atomically.
Recycling can open personal photos or the separate nine-object practice. The
latter reports accuracy against its answer key; personal photos report only
predictions and counts. Neither City simulation has a second model picker.

Each recycling trial clones its capability and batch. Reset clears results and
bin contents, rereads the active selection, and starts a fresh trial. Pausing
retains the current item. Counts change on arrival, not on prediction. The
intake renders up to twelve representative parcels while counts retain every
accepted photo (up to the existing limit of sixty). A completed replay cannot
append duplicate results. Driving rereads its revision when setting up the next
trial, never while it runs.

Quick models and waiting features use sessionStorage. **Save model** explicitly
stores a capability, feature vectors and labels in `projects.sorterModels`;
these and skill references survive Champion File recovery. Original photos are
not included. Expired session data requires returning to Workshop; an absent or
incompatible selected model never substitutes a different saved model.

Verification covers model parity, bilingual routing, sixty-item accounting,
immutable run state, pause/reset, rejected uploads, tab restoration, current
threshold capture, explicit selection, save failure and paired Driving capture.
Browser suites must use `E2E_DOCROOT="P5 Programme/deploy/city-sim"`: the source
server intentionally routes `/workshop/` to a legacy online wrapper.

Verification on 2026-09-27:

- `npm run test:unit`: 616 passed.
- `npm run build:city`: library audit, minification and import checks passed.
- Final built-preview run of `workshop-skills.spec.mjs` and
  `personal-sorter.spec.mjs`: 6 passed. Includes library training through the UI,
  Camera/Memory picker and decision parity, changed confidence/revision,
  ambiguous selection, simulated save failure, quick-model feature preservation,
  rejected uploads, reset, English/Traditional Chinese tablet layouts and an
  orbited/zoomed City view.
- `workshop-handoff.spec.mjs` passed. All three `driving-pair.spec.mjs` tests
  passed, including correction, City-route completion, Champion File recovery,
  project switching and asset-load failure. The long route is advanced through
  the real Step control to avoid relying on software-GPU wall-clock throughput.
- Camera/Memory browser tests seed a trained machine fixture; they do not test
  physical webcam hardware. Library teaching and quick-photo uploads use the UI.
- Built locally; no deployment was performed.
