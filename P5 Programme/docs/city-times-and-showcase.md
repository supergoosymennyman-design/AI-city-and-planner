# City times and showcase refresh

Implemented locally on 13 September 2026. Canonical source is `buddy-kit/client`.

## What changed

The time button cycles Morning → Day → Sunset → Night, defaults to Sunset, and remembers the device's last choice under `p5_city_time_v1`. Changes blend from the current appearance over 700 ms, or immediately with reduced motion. The same scene, lights and materials are reused. Sky, fog, clouds, window emission, street lamps, stars, exposure and bloom respond together. A generated 256px mask isolates blue window colours in existing building atlases for night lighting. Large reflective models retain their original library identities and transforms.

The 2D planner's **Automatic scenery** checkbox records `autoScenery` in the layout. Missing or invalid values default to on; explicit `false` survives sanitization, planner exports and Champion Files. Off removes added pocket gardens, filler planting, furniture and parked decorative vehicles. Student-authored parks and objects, essential street lights/markings and moving residents/traffic remain. Generated decoration never enters the student's saved object list or planning metrics.

The **City Essentials** shelf presents 24 coordinated existing CC0 models with English/Traditional Chinese display names and search aliases. Full categories and catalogue-wide search remain available. No GLBs are downloaded just to browse. Existing neutral-background thumbnails are reused. Cards have protected 180px minimum rows and 100px previews, preventing the shared 44px button rule from clipping the shelf.

Automatic housing now uses six Kenney suburban models instead of the 29-file mixed pool. Three office silhouettes and two small rounded trees complement them. Housing and office mesh parts are instanced by shared geometry/material, and locations determine the variants consistently. The selected house/office/tree models and their external images total **1,088,210 bytes**, below the **1.5 MiB** cap. The old housing pool alone was 7,769,388 bytes. The detailed forest packs remain available in the library but are no longer loaded for everyday scenery.

The example city distributes neighbourhoods around its avenues instead of filling the first northern grid rows. Existing collision-clearance tests still pass. Parks gain a circular walking path, safe pavement links and soft lawn clearings. Planting is grouped beside the path using the existing placement counts. Landscape surfaces use at most three merged batches; the tablet cap is six calls / 20,000 triangles. Public spaces keep their six-tablet / twelve-desktop cap and move clear of student placements.

## Verification

The full unit suite passed 213 tests. New checks cover preset defaults/cycling, bilingual shelf integrity, asset budgets and scenery preference preservation. Source and built-browser checks cover the scenery handoff, library browsing, reduced motion, placement/resource cleanup, graphics recovery and save/restore. Four matched aerial views and four tablet street-level views were inspected. Repeated-switch verification requires a newly rendered frame before checking GPU resources.

Fourteen distinct built-browser scenarios pass, including the corrected time-preference reload wait. The local build passes the CC0/library audit, minification and import-graph check. The earlier missing planner display-name module is now present in the workspace. There are still two existing orphan-asset audit warnings.

Physical older-iPad Safari testing is still outstanding. Software-rendered browser tests establish feature/resource caps, not sustained frame rate or real device memory limits. Large student-authored scenes can still exceed a tablet's capabilities.

## Preview captures

| Time | Aerial | Tablet street level |
|---|---|---|
| Morning | [View](visual-qa/city-times/morning.png) | [View](visual-qa/city-times/tablet-morning.png) |
| Day | [View](visual-qa/city-times/day.png) | [View](visual-qa/city-times/tablet-day.png) |
| Sunset | [View](visual-qa/city-times/sunset.png) | [View](visual-qa/city-times/tablet-sunset.png) |
| Night | [View](visual-qa/city-times/night.png) | [View](visual-qa/city-times/tablet-night.png) |

[City Essentials shelf](visual-qa/city-times/essentials.png)
