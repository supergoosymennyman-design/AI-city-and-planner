# Paired Audi driving

The new entry is **Audi driving school**, available independently of activity
site placement. Earlier Number-sense driving machines retain their existing
runtime and are reachable through **Earlier driving machine**.

## Workshop controls and saved revisions

`drive-v2` creates one editable machine with Steering and Speed subtabs. The
subtabs filter the floor, diagram, selection and inspector without changing the
machine, learning, connections or undo history. A persistent overview labels
inputs as **simulated sensors** and shows both controllers' modes and outputs.
The inspection panel exposes the bound controller and car output, physical
readings, requested actions and influencing examples. Other bench equipment
trains and evaluates examples; it is not an additional runtime controller.

Steering starts with **Default: Straight ahead** and no examples. Speed starts
with **Constant: Go** (6 m/s); Slow is 2 m/s and Stop is 0 m/s. Teaching explicitly
selects Trained model. Returning to a constant preserves learned examples; an
empty trained controller discloses its default and remains runnable. Opening a
starter never trains anything. The 375 steering and 1,200 speed practice rows
keep stable schemas across exercises. Re-teaching skips readings already
learned, preserving corrections.

`data-vector.js` supplies the same min/max, categorical one-hot, level-constant
and unit-vector transform to Workshop and the driving runtime. The shared
`driving-machine.js` compiler reads the editable saved machine, validates its
explicit controller/output bindings and `reading → show` connections, and
exports the actual shelves, IDs, readings, k and thresholds. The
`passiona.driving` version-3 bundle supports default, constant and trained
controllers, corrected driver-relative action mappings and self-tests. Versions
1 and 2 validate under their original rules before converting steering labels;
example IDs, readings, vectors and speed models are preserved. Saved Workshop
steering shelves convert once using a convention marker. Version-1 learned pairs and
earlier Number-sense machines remain readable. Missing or disconnected bound
controllers produce a visible repair problem; they never select an older model.

**Run and Repeat use the latest saved machine. Resume and replay retain the
current attempt's revision.** At the first Run/Step, one project-store mutation
compiles the latest saved machine, retains its executable revision, and records
the attempt reference and scenario together. Unchanged configurations reuse
revisions. Each prepared attempt is detached and immutable. Workshop uses its
existing save queue, displays Saving/Saved/Save failed, and flushes before
navigation. Failed saves block the transition. A missing or invalid latest
configuration blocks a new attempt and offers the Workshop repair link.

Entering through Workshop or City creates the same empty editable starter.
The first exercise centres the car on the straight barrier course. Straight
steering and constant Go collide through normal physics. After impact the
message is: “Speed stayed on Go, so the car did not brake.” The improvement link
opens Speed in the same machine with the recorded readings available for a
correction. Existing trained machines and exercise selections are preserved.

The opaque `projects.driving` project section contains bundles, the installed
revision, the current attempt reference, three completed attempts, and correction/practice records. It is part
of the existing complete Champion archive, not the smaller cloud City snapshot.
Inference is prepared once in memory. There are no per-tick IndexedDB writes.

## Runtime and scenes

`driving-simulation.js` runs decisions at 10 Hz and bicycle-model physics at
20 Hz. Steering and target speed are independent. The Audi footprint is
5 × 2.05 metres; wheelbase is 2.91 metres. Collision checks sweep four substeps.
The route projection provides sensors only and never snaps the vehicle's pose.

Normal stop decisions can wait and restart. Invalid input, abstention and
runtime errors terminate the attempt with a recorded braking intervention.
Collisions, leaving the road, red-light crossings, and amber crossings when
stopping was possible are recorded separately from model-requested controls.
A completed journey requires the entire stopped footprint inside the marked
finish area, with no violation or intervention. A barrier safe stop is a
different outcome. Trials used for corrections are subsequently practice
evidence, not held-out evidence.

The [permanent school](permanent-driving-school.md) uses the City camera and
rendering pipeline for placed trials, with a separate scene for no-space and
old-course compatibility. It uses the existing Audi GLB and shared loader,
chase/overhead/whole-route views, Pause/Step and replay. The launcher stays out of Decorate mode's editing controls.
An asset failure disables driving. Hidden tabs pause; exit, project changes,
context loss and rendering errors release temporary objects and reservations.
Signals, actor appearances, sensors and scoring read the same scenario state.
The scenario seed is editable; repeating a saved trial uses its original
geometry and seed with the latest saved configuration. The current course,
seed, revision and result remain visible above the controls.

## Student City routes

`driving-routes.js` searches the actual directed road graph, offsets into Hong
Kong left lanes, smooths joins and checks curvature, the full Audi footprint,
buildings and solid props. It returns up to three routes of 40–200 metres, with
bounded search work. Open roads and dead ends are valid. Roundabout/closed-ring
manoeuvres, reversals, lane changes, and geometrically invalid connections are
excluded conservatively. The saved layout is never modified.
Road coverage uses small covering discs over the entire rectangular footprint,
so paved corners alone cannot admit a gap underneath the Audi.

The preview lists lane keeping, finish braking, and signal/crossing encounters
only when a sufficiently long straight section can host them. Each attempt
saves its geometry, seed and exact model revision. Repeat reuses that scenario.
Geometry changes invalidate the preview. Rejected routes explain insufficient
length, narrow clearance, obstruction, unsupported turns or malformed data and
link to Planner.

The ambient traffic runtime reserves a corridor including junction conflict
space, suspends vehicles inside it, and holds others outside its boundary.
Distant traffic continues. Release is idempotent, removes suspension flags and
lets the existing traffic controller resume. No City traffic model steers the
student's Audi.

## City boot reliability

Optional pedestrian and cloud GLBs now start in the boot-owned deferred phase,
after the usable City is mounted. Teardown cancels an unstarted phase and
generation checks discard stale completions. The tablet boot check measures
crowd loading at the readiness transition, rather than after a delayed browser
automation round trip. Cold small/sample/large Cities, three concurrent
CPU-throttled Cities, and resize all pass. Asset budgets count model/image
requests separately from the growing buildless JavaScript import graph.

## Verification and release gate

- `tests/driving-machine.test.mjs`: empty collision, Constant Stop, partial
  learning, threshold/evidence parity, bend steering, explicit bindings, empty
  defaults, legacy pairs, revision reuse and complete archive recovery.
- `tests/e2e/driving-machine.spec.mjs`: subtab filtering and undo, recovery,
  failed-save navigation, first-entry collision, Speed handoff, latest-on-Run,
  unchanged Resume/replay, disconnected controller blocking, and bilingual
  tablet layouts.

- `tests/driving-pair.test.mjs`: real Workshop teaching, exported decision and
  influencing-example parity, 44 held-out runs across 11 drill types and four
  seeds, displaced/misaligned starts, weak models, uncertainty, invalid inputs,
  independent controls, stopped arrival, footprint and lifecycle checks.
  Mixed courses assert actual stops at both the signal and the later obstacle.
  The trained pair also completes admitted City straights, curves and a corner.
- `tests/driving-routes.test.mjs`: open, curved, joined, intersecting,
  disconnected, narrow, obstructed, closed-ring and malformed roads; immutable
  atomic publication; bounded evidence; traffic suspension and restoration.
- `tests/e2e/driving-pair.spec.mjs`: visible teaching controls, publication,
  arena, replay, correction, republishing, City trial, Champion-file recovery,
  asset failure and Traditional Chinese tablet-layout/project-switch checks.

The earlier release baseline passed **616/616** unit tests. The expanded three-test browser run
passed teaching → publication → arena → correction → republishing → City trial
→ Champion File restoration, Traditional Chinese tablet layout/project switch,
and Audi asset failure. Library and import checks and the City build pass.
The source regression sweep covers all 51 browser spec files, including their
documented built-only skips. Failed cases were corrected and rerun: current
Champion archive assertions, local Workshop routing, accurate preload/readiness
measurement, the driving launcher's overlap with editing controls, and legacy
Step/reset state. **16 selected built-browser checks pass** across
`driving-pair`, `city-model-edit`, `editor-backup`, `recycling`,
`studio-city-export`, `studio-wallet`, `test-track` and `workshop-handoff`.
These include the complete new driving journey and the built-only legacy
publication/recovery paths. The entire browser suite was swept against source;
the built run was focused on these eight files, not the full release suite.
The final boot and legacy-control changes additionally pass their 28 and 11
targeted unit checks. Automated checks are not a full hardware release clearance.

The direct Workshop-control change passes **653/653 unit tests**, all **10
source driving-pair browser tests**, and **6 built-browser tests** from
`driving-machine` and `workshop-skills`. These cover empty-starter collision,
constant Stop, partial learning, exact classifier/evidence parity, broken
bindings, cross-tab latest-on-Run behavior, frozen Resume/replay, save failures,
archive recovery, City-created starters, project switching, and English and
Traditional Chinese tablet layouts. Library integrity, source/bundle import
checks and `npm run build:city` also pass. This is focused browser verification,
not a rerun of the full browser suite. No production deployment was performed.

Reproduce the focused checks from the repository root:

```sh
node --test tests/driving-machine.test.mjs tests/driving-pair.test.mjs tests/driving-routes.test.mjs
E2E_PORT=8393 ./node_modules/.bin/playwright test --config 'P5 Programme/tests/e2e/playwright.config.mjs' driving-pair.spec.mjs --workers=1
E2E_PORT=8393 E2E_DOCROOT='P5 Programme/deploy/city-sim' ./node_modules/.bin/playwright test --config 'P5 Programme/tests/e2e/playwright.config.mjs' driving-machine.spec.mjs workshop-skills.spec.mjs --project chromium
```

For the built-browser check, build with `npm run build:city` and prefix the
Playwright command with `E2E_DOCROOT='P5 Programme/deploy/city-sim'`.
The full repository check is `npm run test:all`. Run 3D suites serially on
this host; concurrent SwiftShader browsers compete for the same rendering budget.

Actual target-tablet sustained performance remains a hardware acceptance gate.
Desktop SwiftShader and viewport emulation do not satisfy it. Completed attempts
include a bounded display-frame sample summary (median, p95 and maximum frame
time). On the target tablet, record the model/browser, run repeated mixed and
long City trials for at least two minutes, and inspect these summaries alongside
input responsiveness and context-loss behaviour. No production
deployment is authorized by this implementation note.
