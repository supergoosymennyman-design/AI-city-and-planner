# AI City: dusk neighbourhood design

Implemented 13 September 2026 in the canonical browser client. Local preview: http://localhost:8389/city-builder/. No live deployment.

## Appearance and space

A shared palette coordinates green-grey ground, warm neutral lighting, quieter bloom, pale paving and a procedural dusk sky. The ground uses a 128 × 128 generated texture; the sky adds one simple mesh and no downloaded texture. Road layers have enough height separation to prevent the stripes seen from the aerial camera. Clouds retain their component positions and hide at aerial heights to keep the map readable.

Up to six small public spaces on tablets (12 on desktop) reuse existing trees, benches, planters and occasional parasols. Spaces connect to pavements, avoid roads/buildings/parks and reserve two metres around student objects. They are derived scenery: placing or moving an object recomputes the affected environment without writing generated objects into the student's layout or save. Owned GPU resources are disposed on rebuild. The added public-space layer stays within 12 draw calls in the browser budget check.

## People

A shared pavement graph checks complete path segments against obstacles and uses the zebra crossings actually drawn by the road renderer. Citizens gather and walk to local destinations. Shared destination reservations and local spacing reduce overlapping crowds. Pedestrians wait for a safe traffic gap and cars yield to occupied crossings.

The former ambient robot population was removed (2026-09-19). Robot props/catalogue entries remain placeable; only the sliding ambient robot crowd is gone, and the caps below apply to citizens alone.

Movement uses fixed 10 Hz simulation steps with interpolated rendering. Faraway humans remain standing in instanced batches; nearby humans use a reusable Idle/Walk skeleton pool. Promotion starts within 45 metres and retirement occurs beyond 65 metres. Counts are capped at 48 citizens on tablets and 80 on desktop, with lower populations where the graph has too few destinations. Animation caps are three on detected low-end devices, six on other tablets, and 12 on desktop. The existing performance governor reduces animation capacity before reducing resolution. Reduced motion suppresses skeletal downloads and decorative movement; hidden tabs skip updates. The main loop also pauses rendering while the WebGL context is lost, avoiding shader errors and resuming on restoration.

Two derivatives of the existing CC0 Quaternius casual characters replace large animation downloads. Each has 2,750 triangles, one vertex-colour material, no textures, and only Idle/Walk. Combined size is 415,376 bytes (406 KiB), below the 500 KiB limit. `scripts/build-city-citizens.py` and `scripts/compact-city-glb.py` reproduce them. Sources and provenance remain in the library manifest. Failed optional animation downloads leave the static crowd usable.

Tablet trees also retain the earlier compact-model fallback; the full model library remains available on demand.

## Verification

- 207 unit tests pass, including deterministic routes, whole-segment obstacle clearance, crossing reservations, reduced motion, pathological coordinates and the character asset budget.
- 16 source browser checks pass for boot, crowd rendering, picker/placement, repeated derived-environment rebuilds, save/restore, missing animation assets and reduced motion.
- The initial fresh build passed library/provenance audit, minification and import-graph validation. Two existing orphan assets remain audit warnings. A subsequent rebuild including the graphics-recovery fix passes audit/minification but currently fails the planner import check: concurrent planner edits reference missing `city-common/display-names.js`. Those unrelated edits were preserved. The city itself is verified against that rebuilt output.
- Ten distinct built-browser checks pass, including WebGL context loss/restoration and a visible walking state after deterministically ending the initial conversation pause (software rendering does not provide useful real-time performance measurements).

Screenshots: [street level](visual-qa/dusk-neighbourhood/foreground.png), [overview](visual-qa/dusk-neighbourhood/overview.png), [tablet profile](visual-qa/dusk-neighbourhood/tablet.png).

The browser tablet profile verifies feature and asset caps, not real iPad memory pressure or sustained frame rate. Physical older-iPad Safari testing is still required before making a hardware reliability claim. Dense existing building layouts can still dominate the city's total rendering cost.
