# CC0 Asset Sprint — target manifest

Goal: restore visual density to the 3D AI City (`city-builder`) and expand the
in-game 🧰 user library. **CC0 / public domain only** — commercial use, no
attribution. Interiors (hospital/lab/spaceship/station) stay out of scope.

## Hard rules
- Every shipped GLB must be CC0 / public-domain, verified at download time.
- No CC-BY, no CC-BY-NC, no "personal-use" itch packs.
- Every source URL + license recorded in `SOURCES.md` / `CC0-MANIFEST.md`
  before deploy.
- Conventions: GLB, metre units, base y=0, centred X/Z, ≤2 materials, low-poly,
  Y-up for cars (`car-check.html`).

## Confirmed CC0 sources (researched 2026-08-29)

### Kenney (https://kenney.nl — CC0, direct zip)
| Pack | Files | Zip URL (verified) | Use |
|---|---|---|---|
| City Kit (Commercial) v2.1 | 50 | https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip | Buildings, skyscrapers, shop/mall/office, awnings |
| City Kit (Industrial) v1.0 | 25 | https://kenney.nl/media/pages/assets/city-kit-industrial/5fcb837741-1750838303/kenney_city-kit-industrial_1.0.zip | Factories, chimneys, tanks (power/water/recycling) |
| City Kit (Suburban) v2.0 | 40 | https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip | Housing, fences, paths, planters, driveways |
| City Kit (Roads) | 70 | https://kenney.nl/media/pages/assets/city-kit-roads/74288c9459-1741864740/kenney_city-kit-roads.zip | Street props: signs, traffic lights, barriers, dumpster, poles |

All ship with ready-made `GLB format` folders (no FBX conversion needed for the
base set). 42 commercial / 25 industrial / 40 suburban / 95 roads GLBs.

### Quaternius (https://quaternius.com — CC0, Google Drive folders via gdown)
| Pack | Models | Drive folder | Use |
|---|---|---|---|
| Ultimate Textured Building Pack | 76 | `1RE3qXhbE5yGS3t-xGFJ8GmOtTgCUF3LQ` | Modular city buildings |
| Public Transport Pack | ~30 | (to fetch) | Buses, trams, trains |
| Ships Pack | ~20 | (to fetch) | Boats, ferries (HK vibe) |
| Cars Pack | ~40 | (to fetch) | More vehicle variety |
| Ultimate Stylized Nature Pack | 60+ | (to fetch) | Trees, rocks, grass, ferns |
| Ultimate House Interior Pack | ~70 | (to fetch) | Furniture for interiors later |
| Junk Food Pack / Ultimate Food Pack | ~40 | (to fetch) | Food props for library |

### KayKit (https://github.com/KayKit-Game-Assets — CC0, GitHub zips)
| Pack | Models | Repo (verified) | Use |
|---|---|---|---|
| City Builder Bits | 32+ | KayKit-City-Builder-Bits-1.0 | Fire hydrants, dumpsters, water towers, market stalls, taxi |
| Furniture Bits | 40+ | KayKit-Furniture-Bits-1.0 | Tables, chairs, sofas, cabinets, beds |
| Restaurant Bits | 40+ | KayKit-Restaurant-Bits-1.0 | Kitchen + dining props |
| Space Base Bits | 57 | KayKit-Space-Base-Bits-1.0 | Already in library (space) |
| Adventurers | 4 | KayKit-Character-Pack-Adventures-1.0 | Already in library (people) |

Format: glTF (non-binary) → convert with `gltf-transform copy`. Single atlas
texture per pack (downsample to 256–512).

### Poly Pizza (https://poly.pizza — filter `license=CC0`)
- Fallback for individual gap-fills (school, hospital, library, stadium,
  playground, HK-specific). API: `license=1` returns CC0 only.
- ⚠️ Poly Pizza also hosts CC-BY (Poly-by-Google) — MUST verify per item.

### Sketchfab via Blender MCP
- `search_sketchfab_models` + `download_sketchfab_model` (downloadable only).
- ⚠️ "Downloadable" ≠ CC0 — verify license per model before import.

## Gap analysis → target wiring
| Need | Where it lands | Source candidates |
|---|---|---|
| Generic building: School | `GENERIC_FACILITY_MODELS.school` | Kenney commercial low-detail + KayKit |
| Generic building: Hospital | `GENERIC_FACILITY_MODELS.hospital` | Kenney commercial building |
| Generic building: Shop/Mall | `GENERIC_FACILITY_MODELS.shop` | Kenney commercial wide building |
| Generic building: Office | `GENERIC_FACILITY_MODELS.office` | Kenney skyscraper |
| Generic building: Library | `GENERIC_FACILITY_MODELS.library` | Kenney building (small civic) |
| Generic building: Stadium | `GENERIC_FACILITY_MODELS.stadium` | Poly Pizza CC0 (or Kenney) |
| Generic building: Police | `GENERIC_FACILITY_MODELS.police` | Kenney building + police vehicles |
| Street props | `street-props.js` / `street-deco.js` | Kenney Roads (signs, cones, dumpster, poles, barriers) |
| Traffic lights | `street-deco.js` | Kenney Roads `traffic-light*.glb` |
| Playground (replaced deleted) | `playground/` + library | Poly Pizza CC0 or KayKit |
| Bus / boat / vehicle variety | `library/vehicles` + `veh_*` | Quaternius Public Transport + Ships + Cars |
| Nature variety | `library/nature` | Quaternius Ultimate Stylized Nature |
| User-library breadth | `library/props` + `library/characters` | KayKit Furniture/Restaurant, Kenney, Quaternius |

## Workflow (per batch)
1. Download → staging (`/var/folders/wv/_sm4kzsx1wl7vvkh9bvk510r0000gn/T/opencode/cc0-sprint/raw/`).
2. Normalize via `scripts/library-normalize.py` (or use pack-native GLB when it
   already meets conventions).
3. Optimize: `npx @gltf-transform/cli optimize --texture-size 256`.
4. Drop into `buddy-kit/client/library/<category>/<source>-<thing>.glb`.
5. Add entry to `city-common/library.js` (id/name/emoji/glb/category/footprint/height).
6. Wire facilities/street-props in `city-builder/city-builder.js`.
7. Regenerate thumbnails: `node scripts/generate-thumbnails.mjs`.
8. Verify locally (server + Playwright: no `/load failed|unknown library/`).
9. Update SOURCES.md / CC0-MANIFEST.md / ATTRIBUTION.md.
10. Deploy `./deploy-city-apps.sh --city-sim`.

## Progress
- [x] Phase 0 tooling rebuilt (normalize.py + generate-thumbnails.mjs + city-smoke.mjs)
- [x] Research: Kenney (4 packs verified), Quaternius (folder IDs), KayKit (3 repos), Poly Pizza/Sketchfab policy
- [x] Downloaded: Kenney Commercial/Industrial/Suburban/Roads; KayKit City Builder/Furniture/Restaurant
- [x] Batch 1 (this pass): facility GLBs wired, street deco expanded, library 147 → 287 entries
  - Generic facilities now GLB-backed: school/hospital/shop/office/library/police/stadium (+ existing fire)
  - Street deco roster: signs/cones/barriers/dumpsters/poles/traffic-light variants (Kenney Roads)
  - Library: buildings 70 (Kenney commercial/industrial/suburban + towers), props 94 (Kenney Roads + KayKit city/furniture/restaurant), vehicles 22 (KayKit cars), nature 49
  - Kenney shared `Textures/colormap.png` copied to all referencing locations
  - 287 thumbnails regenerated, 0 load failures; city smoke test passes (0 critical warnings)
- [ ] Quaternius packs: Drive still rate-limited (only Ultimate Buildings / Public Transport / Ships came through). Remaining packs (cars, stylized nature, food, streets) pending — retry later or source via Poly Pizza CC0.
- [x] Stadium: real CC0 Colosseum (Poly Pizza, CreativeTrio CC0) replaces the Kenney placeholder
- [x] Park fountain: CC0 fountain (Poly Pizza, Isa Lousberg) now decorates parks (replaces the deleted CC-BY one). Swing/slide still pending.
- [ ] Normalize remaining Quaternius FBX + catalog (Phases 3–4 continued)
- [x] Docs: SOURCES.md / CC0-MANIFEST.md / ATTRIBUTION.md updated (batch 2)
- [x] Deploy `./deploy-city-apps.sh --city-sim` (batch 2) + live QA

## Batch 2 (2026-08-29) — Poly Pizza CC0 gap-fills + Quaternius public transport
- Poly Pizza CC0 (all public domain, no attribution): Colosseum (stadium), Boat, Sail Boat, Sail Ship, Small Ship, Raft, Dock → library props + `city-builder/assets/models/stadium.glb`
- Quaternius Public Transport Pack (CC0): Bus, School Bus, Train → library vehicles; Bicycle → library props (normalized via `library-normalize.py --rot-y 90` for vehicle orientation)
- Library now 318 entries (batch 3: +21)
- Fixed `library-normalize.py`: grounding on correct axis (Blender Z = glTF Y), Blender 5.2 materials API, added `--rot-y`
- City smoke test: 0 critical warnings; stadium colosseum renders in scene

## Batch 3 (2026-08-29) — Poly Pizza CC0 round 2 + stadium removal
- REMOVED the Colosseum stadium model (user feedback: terrible) — stadium is procedural facade again
- Poly Pizza CC0 additions: fountain (parks), mailbox, trash bags, houseplant, horse statue, pizza, birthday cake, cupcake, pancakes, waffle, cherries, apple, banana (props); helicopter, motorcycle (vehicles); robot, flying robot, shiba inu, husky, pug, cat (characters)
- Park fountain wired into `street-deco.js` PLAYGROUND (replaces the deleted CC-BY fountain)
- All 21 normalized via Blender + gltf-transform optimized (shiba 851KB→30KB)

## Batch 4 (2026-08-29) — Ferris wheel + Quaternius buildings + more
- Poly Pizza CC0: Ferris Wheel → park deco (`street-deco/ferris-wheel.glb`) + library prop
- Quaternius Ultimate Textured Building Pack (Drive download finally got through): 26 FBX buildings converted → 12 added to library (Gable House, Corner Shop, 2/3/4-storey blocks, 6-Storey Stack…)
- Sketchfab checked for playground equipment + drones + buses — ALL hits were CC-BY/NC, blocked by the CC0 gate (none shipped)
- Library now 331 entries: buildings 82, props 115, vehicles 27, characters 31, nature 49, scenarios 27

## Batch 5 (2026-08-29) — De-drab the AI City
- All 18 special/mission buildings now render real CC0 Kenney GLBs (was: 9 procedural greys + 9 dark placeholder boxes)
  - Fixed the bug where `glbState.skyscraper`/`glbState.industrial` GLBs were never loaded (finance tower + 8 industrial = 9 dark boxes)
  - New `SPECIAL_BUILDING_MODELS` map routes every mission building through `loadBuildingModel`/`applyBuildingModel`; quest beacon + label kept
  - Mission GLBs: kenney-skyscraper-b/d/c (finance/city-central/atc), kenney-building-n/m/l/g/h/j/k/e, kenney-industrial-a..g
  - Finance Tower keeps its twinkling window sparkles (fixed to use stretched world dims)
- Removed the 12 drab Quaternius library buildings (untextured — atlas never downloaded)
- Library: 322 entries (buildings 70); city smoke test 0 critical warnings, 51 textured meshes (was 39)

## Batch 5b (2026-08-29) — Stadium fix (last lit-window cuboid)
- No good CC0 stadium exists on Poly Pizza (only the rejected Colosseum + concert stages), so the Stadium now renders as a proper low-poly arena built in-code: green pitch at ground level, four tiered stands rising around it, corner floodlight towers — instead of the generic lit-window facade cuboid.
- This was the only generic facility left on the facade path, so no permanent "cuboid with light-blue window rectangles" buildings remain.

## Batch 7 (2026-08-29) — Hong Kong identity theme (CC0, Poly Pizza)
- 18 models added: Bamboo ×3 (nature), Temple ×2 + Shrine + Bell Tower + Watch Tower (buildings), Gazebo + Post/Hanging Lantern + Lantern + Neon Signs + Market Stand + Lighthouse (props), Train Carriage + Train Front + High-Speed Train (vehicles)
- Auto-scatter: gazebo added to park deco; post-lanterns + market stands join street junctions
- Library: 340 entries (buildings 75, props 125, vehicles 30, nature 52)
- Quaternius Drive: got Ultimate Stylized Nature (48 .blend files, FBX folders still throttled); remaining packs retrying

## Batch 8 (2026-08-29) — bus stops + Quaternius Stylized Nature
- Procedural HK-blue bus shelter built in code and scattered at road junctions (no clean CC0 bus-stop model exists)
- Quaternius Ultimate Stylized Nature: 48 .blend files converted via Blender (added `.blend` support to library-normalize.py); 19 curated into library (birch/maple/normal/palm/dead trees, bushes, flower clumps, grass)
- Library: 359 entries (nature 71)
- Drive still throttling remaining packs (buildings/simplebuildings/furniture/junkfood/spaceships/farm)

## Batch 9 (2026-08-29) — Environment realism polish
- Ground: Polyhaven CC0 "Aerial Asphalt 01" (1k, 1024²) applied to the 6000 m ground plane, tiled ~20 m, dark-tinted (0x3a4650) for the night scene — replaces the flat colour
- Night sky: subtle 320-point starfield above the horizon (fog-ignoring material)
- Lighting untouched (current dusk hemisphere/sun/rim balance kept)
- Source: https://polyhaven.com/a/aerial_asphalt_01 (CC0)

## Bugfix (2026-08-29) — "Something went wrong building your city" on JSON upload
- Could NOT reproduce with the user's files (`my-ai-city-5.json`, `my-ai-city (9).json`) — both build the city fine in Chromium (local + live, paste + file upload) and WebKit (Safari engine).
- Verified all 78 city asset files + all 358 library GLBs serve 200 on the live Worker.
- Root cause: a device/state-specific failure inside `bootInner()` — one bad model or build step could fail the WHOLE city boot.
- Fix: hardened `bootInner()` — every build step (trees, parks, roads, quest landmarks, generic facilities, street deco, GLB loads, champion, prop library) is now wrapped; a single failure logs `[city-builder] <step> failed (continuing)` and the city builds the rest. Added `window.__bootError` diagnostics hook.
- Deployed + verified both JSONs boot on live.

## Housing fix (2026-08-30) — real residential, no more facade prisms
- Root cause: Batch-1 rewrite of GLB_BUILDING_TYPES dropped the `housing` entry → `glbState.housing` never created → `applyBuildingModel('housing')` early-returned → the CC0 Kenney suburban house GLBs loaded but were never placed → housing stayed as the checkered-blue facade prisms.
- Fix: re-added `housing` to GLB_BUILDING_TYPES (base = housing-a.glb) + copied `Textures/colormap.png` into housing-variants/.
- Variety: housing now randomly picks from **29 CC0 variants** — all 21 Kenney City Kit (Suburban) building-type-a..u houses + 8 extras (Quaternius Town House ×3, Large Town House, House ×2, CreativeTrio Cottage, Kenney 2-storey) downloaded from Poly Pizza CC0, normalized via Blender.
- Verified: file-5 city → 298 textured meshes (was ~51), facade-window prisms 136 → 1. Both user JSONs boot clean locally + live.
- Sketchfab checked for CC0 residential (houses/apartments) — all CC-BY/NC/SA/Free-Standard, none CC0 → not viable for the no-attribution-commercial rule.

## Robots back (2026-08-30) — CC0 robots milling around the city
- Repopulated `pedestrians.js` ROBOT_MODELS (was empty since the CC0 cleanup) with 7 CC0 ground robots: existing `polypizza-robot.glb` (humanoid) + 6 new (Robot/Polygonal Mind, Robot Enemy/Quaternius, Mech/Quaternius, Robot Enemy Large/Quaternius, Android bot/Armory_3D, Rolie the robot/scaranto) — all Poly Pizza CC0, normalized to static bind pose via Blender.
- Fixed latent `pedestrians.js` bug: `normalizeGeo` now de-interleaves InterleavedBufferAttributes (Blender/glTF exports interleave; `mergeGeometries` couldn't merge them → robots failed with "mergeAttributes failed").
- Robots copy to `city-builder/assets/models/robots/` (pedestrians) + `library/characters/` (placeable via 🧰 picker; 6 new library entries, characters 37). ~58 robots gliding around the sample city (density-based; up to 120).
- Sketchfab re-checked for robots — all CC-BY/NC/ND, no CC0 → not viable.
- 1 of 7 robot types skipped as "bad geometry" (6 render) — noted.

## Library expansion (2026-08-30) — 365 → 435 CC0 items
- Kenney Furniture Kit (42 items): beds, chairs, sofas, tables, bookcases, bathroom, kitchen, office, TVs, lamps, plants, rugs → props (`kenney-furn-*`)
- Kenney Car Kit (22 items): ambulance, firetruck, garbage-truck, police, sedans, SUVs, taxis, tractors, trucks, vans, karts → vehicles (`kenney-car-*`)
- Quaternius Stylized Nature FBX (6 more): BirchTree_3/4/5, Bush_Large_Flowers, Bush_Small, DeadTree_2 → nature
- Placed-prop soft cap: 🧰 picker toasts a "keep it tidy" warning at 200 placed props (informational only, no behaviour change) — i18n en+zh
- Verified the 🧰 picker end-to-end: tabs render, cards clickable, placement mode activates, 0 console errors
- Quaternius Drive retry still throttled (only nature pack came through; food/furniture/buildings/farm pending)
- Library now 435: buildings 75, nature 77, props 167, vehicles 52, characters 37, scenarios 27

## More CC0 downloads (2026-08-30) — Kenney Food + Racing, 435 → 492
- Kenney Food Kit (51 items): burgers, pizza, sushi/maki, dim-sum, tacos, subs, fries, pancakes, donuts, cakes, drinks, bowls, fruit/veg, cooking → props (`kenney-food-*`)
- Kenney Racing Kit (6): 4 race cars → vehicles; grandstand + covered grandstand → props (`kenney-race-*`)
- Quaternius Drive retry: STILL throttled (food/farm/furniture/buildings/spaceships all 0 files). Playwright gdrive-fetch needs per-row download-button targeting (shared folders lack select-all) — noted as follow-up.
- Library now 492: buildings 75, nature 77, props 220, vehicles 56, characters 37, scenarios 27
