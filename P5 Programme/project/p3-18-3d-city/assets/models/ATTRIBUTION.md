# 3D Asset Attribution — AI City Architect 3D (p3-18-3d-city)

External GLB models used by the game, with licenses and sources.

## Citizens (6 rigged character models)
Files: `citizen-man.glb`, `citizen-woman.glb`, `citizen-worker.glb`,
`citizen-business.glb`, `citizen-casual.glb`, `citizen-punk.glb`

- **Source:** [Poly Pizza](https://poly.pizza) — Quaternius character pack
  ([City Pack](https://poly.pizza/bundle/City-Pack-q11onRvPoJ))
- **Creator:** Quaternius
- **License:** CC0 1.0 (Public Domain) — free for commercial use, no attribution required.
  See: https://quaternius.com/ and https://poly.pizza/
- **Notes:** Humanoid armatures with Idle/Walk/Run/Jump animations. Models are
  used as-is (scaled to game units in `city-assets.js`).

## Vehicles
Files: `bus.glb`, `dumptruck.glb`, `police.glb`, `taxi.glb`, `ambulance.glb`, `trash.glb`, `firetruck.glb`

| File | Source | License | Notes |
|---|---|---|---|
| `bus.glb` | [Quaternius Public Transport Pack](https://quaternius.com/packs/publictransport.html) | CC0 1.0 | Clean low-poly city bus (converted OBJ→GLB; replaced the old CC-BY model that dragged a road + bus stop along with it) |
| `dumptruck.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Orange service/dump truck |
| `police.glb` | [Poly Pizza](https://poly.pizza) — Quaternius | CC0 1.0 | White police car with blue lights |
| `taxi.glb` | [Poly Pizza](https://poly.pizza) — Quaternius | CC0 1.0 | Yellow taxi |
| `ambulance.glb` | [Kenney Car Kit](https://kenney.nl/assets/car-kit) | CC0 1.0 | White ambulance (replaced the CC-BY Poly Pizza ambulance) |
| `trash.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Trash/prop model |
| `firetruck.glb` | [Kenney Car Kit](https://kenney.nl/assets/car-kit) | CC0 1.0 | Fire truck — storm crisis response vehicle |

Attribution for CC-BY models is satisfied by this file.

## City Props
Files: `trafficlight.glb`, `streetlight.glb`, `bench.glb`, `hydrant.glb`,
`trashcan.glb`, `tree.glb`, `tree-pine.glb`, `tree-k.glb`, `tree-high.glb`,
`stopsign.glb`, `busstop.glb`

| File | Source | License | Notes |
|---|---|---|---|
| `trafficlight.glb` | [Poly Pizza](https://poly.pizza) | CC0 1.0 | Traffic signal at road junctions |
| `streetlight.glb` | [Poly Pizza](https://poly.pizza) | CC0 1.0 | Street lamp post |
| `bench.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Park bench |
| `hydrant.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Fire hydrant beside emergency stations |
| `trashcan.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Trash can beside collection points |
| `tree.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Broadleaf tree in green spaces |
| `tree-pine.glb` | [Poly Pizza](https://poly.pizza) | CC0 1.0 | Pine tree variant in green spaces |
| `tree-k.glb` | [Kenney Mini Forest](https://kenney.nl/assets/mini-forest) | CC0 1.0 | Low round tree (Kenney) — extra species variety |
| `tree-high.glb` | [Kenney Mini Forest](https://kenney.nl/assets/mini-forest) | CC0 1.0 | Tall tree (Kenney) — extra species variety |
| `stopsign.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Stop sign at dead-end/simple junctions |
| `busstop.glb` | [Poly Pizza](https://poly.pizza) | CC-BY 3.0 | Bus stop shelter beside bus stops |

## Buildings (modelled in Blender for this game)
Files: `bldg_wind.glb`, `bldg_water.glb`, `bldg_solar.glb`, `bldg_hosp.glb`,
`bldg_data.glb`, `bldg_emerg.glb`, `bldg_auditor.glb`, `bldg_recycle.glb`,
`bldg_clinic.glb`, `bldg_depot.glb`, `bldg_town.glb`, `bldg_collect.glb`

- **Author:** Generated procedurally in Blender for this project (no third-party mesh).
- **License:** CC0 — own work.
- **Notes:** Match the game's system color palette (see `city-logic.js` `SYS_COLOR`).
  Regenerate with `.opencode/blender-build-buildings.py`:
  `blender -b -P .opencode/blender-build-buildings.py`

## External Buildings
| File | Source | License | Notes |
|---|---|---|---|
| `bldg_school.glb` | [Poly Pizza](https://poly.pizza) — Schoolhouse | CC-BY 3.0 | School building (scale 0.2) |
| `bldg_drone.glb` | [Poly Pizza](https://poly.pizza) — Landing Pad (Kay Lousberg) | CC0 1.0 | Drone pad surface (used as prop) |

## Reuse rules
- If a model is removed or replaced, update this file.
- CC-BY models (dumptruck, trash, bench, hydrant, trashcan, tree,
  stopsign, busstop, bldg_school) keep this attribution notice with the game.
- Kenney CC0 models (`ambulance`, `firetruck`, `tree-k`, `tree-high`) are
  public domain from https://kenney.nl/ (Car Kit + Mini Forest) — no attribution
  required, kept here for provenance.
