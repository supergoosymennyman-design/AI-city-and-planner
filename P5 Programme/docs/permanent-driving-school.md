# Permanent driving school

New school scenarios use `courseVersion: 1`: a 190 m, 7 m wide road with
60 m straight, 40 m right bend (32 m radius), 20 m straight, 40 m left bend
(32 m radius), and 30 m finishing straight. The centreline is sampled every
metre. Seeds change starting offset and encounter conditions, never the road.

Drill sections are 0–60 m for straight/encounters, 50–120 m for right,
110–190 m for left, 50–190 m for S-bend, and 0–190 m for Mixed.
Barrier positions are 30–42 m; Mixed has its signal at 18 m and crossing
vehicle at 110 m. The reserved rectangle, including ten-metre margins, is
82.8 × 177.0 m. Placement still refuses occupied ground.

`cityActivities.drivingSite` exposes the course-local scene group, bounds,
and `setTrialVisible()`. The site owns the continuous road mesh and parked
Audi. Trials attach only markers, actors and their own Audi to that group.
Closing, replacing a drill or losing WebGL restores the parked preview and
invalidates pending loads. A late preview load respects trial visibility.

Simulation and evidence remain in course-local metres. The trial group and
camera target share the site transform, including rotation. In-City trials
use the City camera, composer, lighting and road/detail updates. Camera pose
and projection are restored on exit. Chase is the default; overhead and
whole-course views remain available. Blue marks the start, yellow dashes the
active section and green the stopped-arrival area. Inactive roads remain
visible. Road geometry is a single mesh to avoid overlapping bend surfaces.

If no school site fits, the dock opens a separate 3D venue. Unversioned saved
school scenarios also use this venue, retaining the saved track exactly.
“Replay saved decisions” reads the original records and original model
revision; “Repeat with installed revision” runs the saved scenario with the
current installed pair. Neither opening nor replay trains a model. Earlier
single-model machines and City-road traffic reservations remain supported.
The existing Champion File includes the driving section, revisions and
attempts. Correction/republication and practice tracking use exact scenarios.

Verification is in `tests/driving-pair.test.mjs`,
`tests/materials-refresh.test.mjs`, and `tests/e2e/driving-pair.spec.mjs`.
The simulation matrix covers all 11 drills × four seeds, stopped arrival,
encounter stops/restarts and weak-model failures. Browser checks cover the
Workshop round trip, saved-file recovery, bilingual desktop/tablet layouts,
placement transforms, compatibility replay, late loads, project changes,
legacy entry and no-space fallback. Physical target-tablet sustained GPU
performance remains a device acceptance check; headless SwiftShader is not
representative of that hardware.

Verified locally on 2026-09-29: all 640 unit tests, all nine driving browser
checks against the minified City bundle, the library integrity audit, import
graph checks, and the City build passed. The browser checks use Chromium with
SwiftShader at desktop and 1024 × 768 tablet viewports. No deployment was made.

## Driver direction convention

Paired controls use positive steering for left and negative steering for right
under the existing heading convention. Sensor fields and route points are
unchanged. Bend names and chevrons derive from signed route heading changes.
Each sign has separate readable front and back faces; back chevrons reverse
their printed glyph to preserve the physical direction. Back bend labels describe the reverse traversal.

Driving bundles now publish version 3. Versions 1 and 2 are validated with
their original control and self-test rules, then their steering example labels
and self-test decisions are swapped before version 3 preparation. Speed models,
example IDs, sensor readings and vectors remain intact. Archived replay poses
are never rewritten. Saved Workshop steering pieces make the same shelf swap
on load or compilation and store `steeringConvention: driver-left-positive-v3`
to prevent repeat conversion. New steering pieces carry this marker immediately.

Focused verification: `tests/driving-directions.test.mjs` covers driver-relative
turns at multiple headings, bend drill signs, legacy validation and idempotent
conversion. `driving-presentation.spec.mjs` checks both sign faces and physical
arrow orientation in English and Traditional Chinese, with local screenshots.

Direction correction verified locally on 2026-10-01: 48 focused driving unit
tests, 16 distinct driving browser cases, and import checks passed. The final
presentation cases were rerun after updating reverse-view label expectations.
Both bends and front/back English and Traditional Chinese signs were visually
reviewed from localhost screenshots. No production deployment was performed.
