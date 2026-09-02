# Batch 5 — De-drab the AI City (plan)

## Goal
Remove the drab/procedural buildings from the 3D AI City so every visible
building is a real, textured CC0 model — consistent with the generic facilities
(school/hospital/office/…) that already look good.

## Root causes (verified by inspection)
1. **9 permanent dark-grey boxes** — `finance_tower` + the 8 industrial mission
   buildings (`water/power/recycling/delivery/traffic_lab/traffic_emergency/
   subsurface/monitoring`) push into `glbState.skyscraper` / `glbState.industrial`
   but `loadBuildingModel()` is never called for those keys, so their GLBs never
   load and they stay as flat `0x2d3640`/`0x3a4650` placeholders forever
   (`city-builder.js` ~781-828).
2. **9 procedural grey mission buildings** — the rest of the 18 special buildings
   are built in `quest-buildings.js` from muted solid colours (`0x2d4a75`,
   `0x6b6f76`, `0x4a4f56`…) with thin neon accents — dull next to the textured
   Kenney buildings.
3. **12 flat Quaternius library buildings** — exported as 1 untextured material
   (`images:0, texturedMaterials:0`); the pack's texture atlas was missing from
   the Drive download. (These are library picker items, not auto-placed, but
   still drab.)

## Decisions (user-confirmed)
- **All 18 mission buildings → real GLBs** (keep quest beacon + label).
- **Remove the 12 Quaternius buildings** (do not re-convert).

## Work items

### A. Remove the 12 drab Quaternius buildings  ✅ DONE
- Deleted `library/buildings/quaternius-*.glb` (12 files).
- Removed the 12 `bld_q_*` entries from `city-common/library.js`.
- Library now 322 entries (buildings 70).

### B. Copy the 18 mission GLBs  ✅ DONE
- Copied Kenney textured buildings into `city-builder/assets/models/mission/`:

| Mission | Source | Mission | Source |
|---|---|---|---|
| finance_tower | kenney-skyscraper-b | delivery | kenney-building-e |
| city_central | kenney-skyscraper-d | water | kenney-industrial-a |
| atc | kenney-skyscraper-c | power | kenney-industrial-b |
| treasury | kenney-building-n | recycling | kenney-industrial-c |
| sentiment_lab | kenney-building-m | subsurface | kenney-industrial-d |
| drone_routing | kenney-building-l | monitoring | kenney-industrial-e |
| health | kenney-building-g | traffic_lab | kenney-industrial-f |
| robot_grid | kenney-building-h | traffic_emergency | kenney-industrial-g |
| swarm | kenney-building-j | | |
| bus | kenney-building-k | | |

### C. Code changes (PENDING — blocked by plan mode, use `edit` when unblocked)

1. Add `SPECIAL_BUILDING_MODELS` const (type → `assets/models/mission/*.glb`)
   right after `GLB_BUILDING_TYPES` in `city-builder/city-builder.js`.
2. Rewrite the special-building loop (~781-843): route every `isSpecial(b.type)`
   building through `glbState[b.type]` (spot + neutral placeholder box + beacon +
   label + `continue`), falling back to `questDesign` only if no model is mapped.
   This replaces the `INDUSTRIAL_SPECIALS` branch and the `finance_tower` branch.
3. Load the GLBs: add
   `for (const [type, url] of Object.entries(SPECIAL_BUILDING_MODELS)) loadBuildingModel(type, url);`
   next to the existing `GLB_BUILDING_TYPES` load loop (~2530).
4. Stretch scaling: `applyBuildingModel` currently stretches only when
   `GLB_BUILDING_TYPES[spot.glbType]` — add `SPECIAL_BUILDING_MODELS` to that
   check (build a combined Set) so mission towers reach their catalog heights.
5. Sparkles: the finance tower should keep its twinkling window sparkles.
   Change `addSkyscraperSparkles(spot, s, st.size)` → pass world dims
   `addSkyscraperSparkles(spot, spot.fp[0], spot.h, spot.fp[1])` and rewrite the
   function to use `w/h/d` directly (the old `s` var is undefined under stretch).
   Trigger on `spot.glbType === 'finance_tower'`.
6. `INDUSTRIAL_SPECIALS` const becomes unused — leave in place (harmless) or
   remove; no lint gate.

### D. Verify + ship (PENDING)
- `node --input-type=module --check` on `city-builder.js`.
- Regenerate thumbnails if any library ids changed (none new added this batch).
- Local `python3 -m http.server 8377` + `scripts/city-smoke.mjs` → expect canvas
  + 0 critical warnings + no `load failed` (especially the mission GLBs).
- Screenshot the city to confirm the 18 mission buildings now show textured
  buildings (labels/beacons still present).
- Update docs: `SOURCES.md`/`CC0-MANIFEST.md` — note the 12 Quaternius buildings
  removed + 18 Kenney mission buildings added (all CC0).
- Deploy `./deploy-city-apps.sh --city-sim` + live QA.

## Out of scope
- Interior scenarios (hospital/lab/spaceship/station).
- Playground swing/slide (no CC0 found).
- Remaining Quaternius packs (Drive rate-limiting).
