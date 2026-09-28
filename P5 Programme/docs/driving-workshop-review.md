# Driving School Workshop review — local build

City signs, the activity dock, the general driving entry and paired Workshop publication open the Audi school. `city-builder.js` owns driving routing; `city-activities.js` exposes `openLegacyDriving(capability)` for earlier machines. The dock remains available without a physical school site. Capability cards select the displayed ID and revision.

The school offers Practise a skill, Mixed journey and My City roads. All eleven courses retain their existing simulation. Each preview explains the encounters and success condition, shows the installed revision, and starts with a whole-route camera. Run remains explicit. Repeat preserves the complete scenario; new conditions change the seed and starting lane offset. Scenario numbers and model identity are under Advanced details.

Results retain decision replay, simulated sensor readings, location, requested steering/speed and the influencing training examples. A barrier stop is reported separately from arrival. Improving a recorded decision preserves the scenario through Workshop publication and returns to it. Matching previous/current outcomes appear together; corrected scenarios are labelled practice. Fresh scenarios remain separate checks.

Earlier driving links carry `drivingMode=legacy`, the exercise and saved source machine. Legacy sessions preserve the paired tab's saved machine. Selected capabilities run as detached snapshots. Paired publication continues to use the existing atomic project-store mutation, revision retention and Champion File sections.

The renderer-independent simulation remains model-controlled: track projection measures sensors and never steers or corrects position. City trials use admitted road geometry, controlled encounters and a traffic reservation. Closing or switching experiences releases it. These trials do not establish unrestricted traffic, overtaking, parking or camera perception.

## Verification

- Driving and Workshop publication unit suites: 42 passing tests. Includes all drills across held-out seeds, route rejection, footprint checks, immutable paired publication, inference parity, faults and a learned steering correction.
- Import graph and library audit passed. The library audit reports two existing orphan warnings, no missing assets or provenance failures.
- Local build uses `npm run build:city`; no deployment.
- Browser verification: all 16 distinct cases passed across the built-bundle runs: seven focused Audi checks, four earlier-runner regressions, four Workshop regressions, and one backup/restore journey. The final focused snapshot passed five cases, then the two legacy cases passed after restoring the displayed revision label.
- The speed test taught a weak startup `stop` example through the Workshop API and timed out. A child-facing correction to `go` produced a new published revision that arrived on the same scenario; a fresh seed also arrived and was not marked practice. The steering test taught a weak `sharp-left` example, failed off-road, then corrected the recorded decision to `straight` through the Workshop UI and arrived on repeat.
- City entry tests used the actual sign, dock, general button and capability card. The route test verified a real traffic reservation is released after completion and after switching experiences. Other cases covered no physical site, missing/damaged bundles, failed Audi asset loading, Chinese tablet layout, exact legacy machine and exercise, and Champion File restoration.
- Screenshots reviewed at English and Traditional Chinese desktop/tablet sizes: [English desktop](/private/tmp/driving-arena-desktop.png), [English tablet](/private/tmp/driving-arena-tablet-en.png), [Chinese desktop](/private/tmp/driving-arena-desktop-zh.png), [Chinese tablet](/private/tmp/driving-arena-tablet-zh.png), [speed comparison](/private/tmp/driving-improved-comparison.png), [steering correction](/private/tmp/driving-steering-improvement.png), [City route preview](/private/tmp/driving-city-route-preview.png).
- Sample Champion File with the corrected pair and trials: [driving-workshop-review.passiona](/private/tmp/driving-workshop-review.passiona). Import it from the City entry screen to inspect the saved examples.
- Frozen preview: http://localhost:8383/city-builder/?activity=driving (bundle at `/private/tmp/passiona-driving-review.l63VES`). The standard `deploy/city-sim` local build was regenerated after the final fix. No deployment was run.
