# Driving School proving-ground presentation

The shared `city-common/driving-presentation.js` now builds the version-1 facility for both the permanent City school and the separate venue. The 190 m centreline, school bounds, simulation, decisions, replay data, course version and saved-project format are unchanged by this visual upgrade.

Permanent scenery owns the asphalt, continuous edge lines, shoulders, drainage grates, kerbs, reflectors, bend guardrails and chevrons, supported entrance sign, control pavilion, numbered boards, fencing, shrubs and unlit lamp poles. Placement follows the centreline; elevated roadside details leave the crossing encounter sections clear. Signs follow the existing English/Traditional Chinese preference.

Trials own the blue start, yellow route guide, bordered green target, exact encounter crossing paint, striped barriers, low-detail cars and human figures. Traffic signals have independent red, amber and green lenses; the arena updates their emissive state from the existing simulation. Actor anchors remain at their original transforms. Archived unversioned geometry receives its own road presentation without the version-1 facility.

Repeated cuboids and shrubs use instancing. Generated grain and sign textures belong to scene materials; venue disposal releases textures, geometry, materials and instance buffers. No added lighting casts shadows. Depth bias separates road layers in distant city views.

## Local review

Run `node 'P5 Programme/tests/e2e/static-server.mjs' 8396` from the repository root, then open `http://localhost:8396/tools/driving-preview.html`. The review page offers overview, entrance, chase, bend and encounter cameras; exercise and language selectors; and a reopen button with live renderer statistics. The student app remains at `/city-builder/` on the same server.

The initial presentation-module reference captures are in `.tmp/driving-before-*.png`; final close views are in `.tmp/driving-after-*.png`. The full English/Traditional Chinese, desktop/tablet screenshot matrix is in `.tmp/driving-review/`. These local review artifacts are not deployed assets.

## Verification

- 36 driving unit tests passed, plus four materials/placement tests.
- All 10 existing driving browser checks passed: teaching, running, corrections, rotated placement, exercise switching, replay, closing/reopening, asset failure, Chinese tablet layout, fallback venue and old saved geometry.
- The added `driving-presentation.spec.mjs` passed, covering footprint bounds, five repeated openings, language switching, all three signal states and screenshot capture at 1440 × 1000 and 1024 × 768.
- Repeated openings and a complete exercise/language cycle returned to the same renderer resource counts. The isolated mixed venue uses approximately 49 draw calls, 34 geometries and 14 textures (calls vary with the camera).
- Source/bundle import audit and whitespace checks passed.

No deployment is included. Existing unrelated working-tree changes were retained.
