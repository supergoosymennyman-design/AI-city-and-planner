# Stage 5 handoff — driving

Date: 2026-09-25 · branch `plan/passiona-deepseek`

## What changed

**The `.cap` v2 NUMERIC path now carries a driving skill.**
- `city-common/driving.js` (new, pure): the whole contract and the simulator.
  - the OBSERVATION CONTRACT — `left / center / right` obstacle distance,
    `laneOffset`, `headingError`, `speed`, `trafficLight`, `turnIntent` — and the
    FIVE ACTIONS `forward / left / right / slow / stop`;
  - `DRIVE_PLUS_CONSTANT = 10` (the Workshop number sense's own bias), so a bundle
    is byte-identical to `numberVec(...)` and the City reproduces the belt;
  - the EXPLICIT FIXED ACTUATOR MAPPING (`ACTUATORS`) — the City never invents
    motion the model did not ask for;
  - a deterministic 10 Hz fixed-step vehicle + track simulation, five built-in
    tracks (`straight / curve / obstacle / light / full`, the full one containing
    all four features), and the honest stop rules: **missing input, abstention,
    timeout, runtime failure, collision and off-road all STOP the car** and are
    recorded as events/interventions — there is no hidden successful driver;
  - `cityRouteTrack(roads)` — "try in my city": a bounded route read READ-ONLY
    from the child's own road polyline; `{ok:false, reason}` when none exists.
- `city-common/capability-export.js`: `buildDriveCapability()` — the v2 numeric
  builder for the eight fields, a per-action self-test (re-run through the real
  runtime, kept only when it reproduces) plus a **dead-sensor abstention case**.

**Workshop `drive-v1` starter + sensor-data activity.**
- `workshop/logic/drive-data.js` (new, UMD): the authored driving table and the
  "careful driver" rule that labels it — one clean rule the child can read, with
  the five actions all exercised.
- `workshop/logic/datasets.js`: a new `drive` dataset (`kind:'labels'`, 200 seeded
  rows) — the multi-class label path the Evaluator already grades.
- `workshop/logic/drive-examples.js` (new): the starter bench — Files (the driving
  table) → Splitter (Training/Validation/Test) → Feeder → Track → a Model wearing
  the NUMBER sense with the k-NN brain → Evaluator + Tally, and the three act
  buttons (Teach it / Test what it studied / Test on new). The `full` guided track
  reuses the ice-cream bench's shape deliberately.
- `workshop/game.js`:
  - `driveExample('drive-v1')` builds the gallery table with its OWN shelves
    (`learning = {}`), so driving examples never mix with another machine's;
  - `buildDriveTable({seed, train})` — the deterministic trained table, filing the
    Training share through the REAL teaching path (`applyTeachEffect` →
    `modelEntry` → the number sense's own extractor), hand-taught so a Run never
    sweeps it;
  - `publishDriveModel()` — the host seam: reads a Number-sense model's shelves as
    plain data `{id, name, k, threshold, examples:[{label, values, display}]}`. A
    sticker that does not parse back to the eight numbers, or whose stored vector
    is not `numberVec(values)`, is SKIPPED — no bundle is built from an example it
    cannot reproduce;
  - `loadGalleryMachine('drive-v1')` — the deep-link path the City's hand-off uses.
- `workshop/publish-capability.js`: now dispatches on `?skill=drive`; builds the v2
  drive bundle, `publishSkill`, and `installSkill(key, hostInstanceId, {hostType:
  'driver'})`. Identical trained state reuses its key; a changed one is a new
  revision. On a drive deep link it opens the Driving starter; nothing is ever
  auto-published.
- `assets/demo/Demo.json` + `Demo.zh-Hant.json`: the `drive-v1` machine, so the
  starter is reachable from the ordinary examples list.

**The City test track.**
- `city-builder/test-track.js` (new): resolves the student's driving skill from the
  authoritative envelope (`store.runSkill`, planted `.cap` fallback), then runs the
  ONE pure simulator at 10 Hz. Shows the eight sensors, the chosen action, the
  previous decisions, the outcome and the interventions; controls are
  Run/Pause, Step, Reset and Repeat-the-same-trial, with a track picker including
  **Try in my city**. It never fabricates a success: a run that does not finish
  leaves an intervention behind.
- `city-builder/test-track.css` (new): self-contained, ≥48px controls, reduced-motion aware.
- `city-builder/city-builder.js`: the capability panel recognises a drive bundle
  (not "display-only"), offers "Driving test track", and hands the live layout's
  roads to the track READ-ONLY via `setCitySource`.

## Tests

- `tests/driving.test.mjs` (19 tests): the contract; compatibility refusals; the
  model controls movement (a forward model travels, a stop model does not; left
  and right end on opposite sides); changing the model changes the actions;
  abstention/missing-input/timeout/runtime-failure stop the car; collisions are
  recorded; determinism and 10 Hz; the light cycle; the instructor rule is total;
  a model trained from the real sensor rows drives; **try-in-my-city never mutates
  the roads**.
- `P5 Programme/tests/e2e/test-track.spec.mjs` (5 tests): the Workshop publishes a
  driving model the City test car then drives (through the real `publishSkill` →
  `installSkill` → `runSkill` path); **changing the published model changes the
  vehicle actions on the same track**; no model → an honest "no-model" with the
  Workshop link; an UNTRAINED model publishes nothing; the capability panel opens
  the track and "try in my city" finds a bounded route in the real example city.
- Verified: `node --test tests/*.test.mjs` → **518 pass / 0 fail** (was 499);
  `npm run test:imports` OK (151 files, source AND bundle); `npm run test:library`
  PASS; `npm run build:city` OK. The track spec passes in **source** and against
  the **built** bundle. Regression: `badges-capabilities`, `recycling`,
  `accessibility` (10 tests) all pass.

## Named gaps (carried forward)

- **The learned model is not a perfect driver.** Trained from the 200-row table's
  Training share, the k-NN reaches the goal on `straight`/`curve`/`light` and
  sometimes stops or leaves the road on the `full` track — which is honest and is
  the lesson (train it, change k, test again). A larger/denser table and a
  gentler policy would lift it; the contract and the honesty rules are the
  deliverable here, not a guaranteed lap.
- **A "dead sensor" control is not in the UI.** `driving.js` supports missing
  input and it is unit-tested, but the track always returns a reading; the UI
  shows abstention/timeout/runtime-failure stops.
- **The City-road hand-off auto-opens the Driving starter** (`?skill=drive`).
  It is a deliberate City hand-off, but it does switch the active Workshop
  machine; the usual autosave runs first.
- **Try-in-my-city picks the longest road's leading stretch.** No route planner,
  no traffic, no junction turns yet; when no usable road exists it explains and
  offers the guided track (verified).
- Still open from earlier stages: skill-host sockets are not mounted; Market cards
  have no imagery; decorations `?place=` gating; the City does not carry a batch
  seed back through `returnTo`.
