# City learning sites

The first release contains two permanent procedural sites in the existing City
renderer: recycling and driving school. The four later templates remain roadmap
work. No activity drives on student roads or controls ordinary traffic.

## Student sequence

Open Recycling from the City button or the site's sign. Choose Improve. In the
Workshop banner choose **Train / inspect model**, then in the Data library choose **City recycling**, select k-NN, train a new
version, and place it. Publish to my City explicitly installs that revision at
`city-recycling-school-v1`. Run the nine held-out objects. Expand Inspect to see
the exact scanner image, prediction, confidence, answer key and destination.
Correct sorts, wrong sorts and human checks are separate. Reset uses the same
nine identities. Improve returns to the original saved machine and model block;
use **Train / inspect model** to replace that model's learned version or change its confidence setting and publish
again. Publishing elsewhere never silently changes this site's installation.

For Driving, choose one of **Gentle bend**, **Stop before a barrier**, or **Red →
green** before Improve. Choose New exercise in the Workshop publish banner to
create its Files → Splitter → Number model bench. Run the machine and press
**Teach it**, then test its studied and separate validation examples. Keep what
it learned before leaving. Publish to install at `city-driving-school-v1`.
Existing saved machines are reopened on later Improve journeys; creating a new
exercise is always explicit. The confidence and k settings are exported unchanged.

- Bend: inspect lane offset and heading error. Add examples that steer left when
  drifting right, and right when drifting left. An always-forward model leaves
  the road; the reference teaching set completes the bend.
- Barrier: inspect ahead distance. Teach slowing below 12 m and stopping below
  5 m. The exercise succeeds only when fully stopped before the barrier, with
  no collision. An always-forward model hits it.
- Light: include red readings at both moving and zero speed, plus green readings
  at zero speed so the car can restart. Running the red stop line fails, even if
  the car could later reach the destination.

`driving-school-data.js` supplies practice readings as ordinary editable data.
There is no instructor controller inside the City runtime. Unit verification
trains via Workshop `applyTeachEffect`, exports via `publishDriveModel`, and runs
the resulting real k-NN for seeds 1, 42 and 77. Each exercise passes for each seed.

## Runtime and persistence

One trial owner runs at 10 Hz inside the City's animation loop. Display poses
interpolate between steps. Repeated Run cannot create another loop. Pause/Step,
Reset, leaving, hidden tabs, project changes and WebGL context loss never accrue
catch-up time. A failed or missing asset reports an error and can be retried.
Procedural site geometry has no external model-loading dependency.

The resolver requires a site identifier and reads exactly its installation.
Completed results, scenario and revision are saved under the project envelope's
`projects.cityActivities`, carried by the project archive. Reload opens ready to
repeat; it never silently starts a trial. Site placement searches clear ground
against buildings, road segments, saved props, gateway bounds and trees; existing saved layout
records are not moved. New prop placement reserves the sites' approach footprint. If the saved city has no clear nearby ground, it asks for space instead of deleting or moving student work.

## Verification

- `node --test tests/city-activities.test.mjs`: real scanner learning/routing,
  driving learning and failures, lifecycle, site revision binding and placement.
- `node "P5 Programme/scripts/verify-city-activities.mjs"`: real City browser
  integration and desktop/tablet-layout screenshots (server port 8379).
- `npm run test:unit`, `npm run test:library`, `npm run test:imports`.

A physical tablet performance check is still required before release. Browser
viewport emulation is layout evidence only; it does not prove touch comfort,
thermal behaviour, battery impact, or sustained frame rate on target hardware.

Latest local verification: an earlier 589-test full suite passed; the latest targeted run passed 46 tests and all 11 activity tests pass, including the new driving-selector regression. The latest full-suite rerun finished at 593/594; the existing optimizer runtime assertion exceeded its 1,000 ms limit (1,149 ms) and also failed an isolated retry. Real Workshop UI training, replacing an original block and publishing a new revision passed. The driving starter also passed Run → Teach → Publish through the ordinary button-event path. An earlier representative-city browser verification passed reset mid-animation, repeated Run, close during loading, real WebGL loss/restoration, project-switch closure, archived result availability, failed scanner-asset loading and retry. Desktop and 820-pixel tablet layouts were visually reviewed in English and Traditional Chinese. Screenshots are generated under `/private/tmp/city-activities`. The final City build, minification (zero failures), and source/bundle import checks passed, along with 45 targeted activity/publish/driving/recycling tests. No production deployment was performed.

Unresolved release gate: the default full-example City regression timed out during project storage opening with both software and native rendering. A subsequent smaller-city recheck also timed out opening project storage. Earlier successful browser evidence does not clear this newer regression. A diagnostic that stopped the animation loop after boot completed publication, installation and recycling opening successfully, so rendering/update contention is implicated; this is not yet a proven root cause. Diagnose and rerun the full City suite before release; physical tablet performance remains unverified. No production deployment was performed.
