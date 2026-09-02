# 3D Model Sources — AI City prop library

Every prop GLB in `city-builder/assets/models/` ships with the app and is loaded
on demand (lazy) when a child places it. All models below are **CC0** (public
domain) — free for personal AND commercial use, no attribution required.
Sources are recorded here for good practice and future auditability.

## Existing models (shipped originally)

| Set | Source | Notes |
|---|---|---|
| Buildings, nature, street props, people, robots, vehicles, cars, playground | Bundled in repo | Low-poly, mixed provenance (Quaternius-style). Kept as-is. |
| Champion accessories (Hunyuan GLBs) | AI-generated (Hunyuan3D/Trellis) | `champion-city/assets/accessories/` |

## Added batch (this pass)

| Pack | Source | License | Where it went |
|---|---|---|---|
| **KayKit — Adventurers** (Knight, Mage, Rogue) | github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | CC0 | `people/knight.glb`, `people/mage.glb`, `people/rogue.glb` |
| **KayKit — City Builder Bits** (fire hydrant, dumpster, trash can, water tower, sedan, taxi) | github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits | CC0 | `street/` + `vehicles/` (converted glTF→GLB, embedded) |
| **Quaternius** via Poly Pizza (SUV, Dog, Junk Boat, Spaceship) | poly.pizza (Quaternius uploads) | CC0 | `vehicles/suv.glb`, `animals/dog.glb`, `hk/boat.glb`, `space/spaceship.glb` |

## Second wave (bigger batch)

| Set | Source | License | Where it went |
|---|---|---|---|
| **Quaternius** cars (Sports Car, Pickup Truck, Motorcycle) | poly.pizza | CC0 | `vehicles/` |
| **Quaternius** farm animals (Cow, Pig, Sheep, Chicken, Horse) | poly.pizza | CC0 | `animals/` |
| **Quaternius** space (Rocket, UFO) | poly.pizza | CC0 | `space/` |
| **Quaternius** nature (Palm Tree, Cactus) | poly.pizza | CC0 | `nature/` |
| **Quaternius** food (Hamburger, Pizza, Donut, Ice Cream) | poly.pizza | CC0 | `food/` (new category) |

Notes:
- KayKit models use a single atlas texture; the GLBs are self-contained.
- City Builder Bits were converted from glTF to self-contained GLB with
  `gltf-transform copy` (24–84 KB each).
- Quaternius models downloaded as individual GLBs from poly.pizza
  (`static.poly.pizza/<uuid>.glb`).
- New categories: Animals, Space, Hong Kong (HK junk boat), Food & Snacks.

## Mega wave (large library — this pass)

| Set | Source | License | Where it went |
|---|---|---|---|
| **Lab Assets** (279 GLB, ~140 curated) | itch free pack | personal-use | `lab/` (new **lab** category) |
| **Molten Maps SciFi Asset Pack** (136 GLB → 79 base types) | itch free pack | personal-use | `lab/` (wired under `space`) |
| **office_pack** (28 GLB) | itch free pack | personal-use | `office/` (new **office** category) |
| **Retro computers** (8 OBJ→GLB) | itch free pack | personal-use | `office/` |
| **FrostyCybrpack Assets V2** (618 GLB → 31 curated) | itch free pack | personal-use | `cyber/` (wired under `space`/`office`/`street`) |
| **KayKit Space Base Bits** (57 glTF→GLB) | github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits | CC0 | `space/` |
| **Sci-Fi Essentials Kit** (37 glTF→GLB, 21 neutral kept, textures 512) | itch Standard | personal-use | `space/` |
| **Modular SciFi MegaKit** (28 props + 3 aliens, textures 512) | itch Standard | personal-use | `space/` + `robots/` |
| **Intergalactic Spaceships V2** (embedded glTF→GLB) | itch free pack | personal-use | `space/intergalactic-ships.glb` |
| **GLB.zip planets** (Mercury, Jupiter, Saturn, Wild Giant) | poly.pizza | CC0 | `space/` (resized 512) |
| **Ultimate Modular Men/Women** (21 rigged FBX→GLB static) | Quaternius | CC0 | `friends/` |
| **Stylized Nature MegaKit** (68 glTF→GLB, textures 512) | Quaternius | CC0 | `nature/` (nature now ~90 props) |
| **Ultimate Stylized Nature** (12 FBX→GLB) | Quaternius | CC0 | `nature/` |
| **City Pack** (34 FBX→GLB, ~22 curated) | itch free pack | personal-use | `street/` |
| **42-fbx residential buildings** (10 FBX→GLB) | itch free pack | personal-use | `street/` (Apartment Blocks) |
| **Bus_stop / Laundry / DINER** (FBX→GLB) | itch free packs | personal-use | `street/` + `hk/` |
| **assets spaceship + tyco ship** (7 FBX→GLB) | itch/direct | personal-use | `space/` |
| **Mecha bots ×9** (OBJ→GLB) | MagicaVoxel packs | personal-use | `robots/` |
| **SciFi Props FreePack** (5 GLBs) | itch free pack | personal-use | HOLD — 90 MB each, needs downsizing |

Notes:
- Non-CC0 packs are used under the project owner's personal-use policy; re-verify
  before any commercial release.
- FBX→GLB conversions via headless Blender 5.2 (`fbx2glb_resilient.py`).
- glTF→GLB via `gltf-transform copy`; oversized textures resized to 512 px.
- Prop library grew ~59 → **554 props across 12 categories** (added `lab`, `office`; nature ~90).
- `prop-library.js` + `i18n.js` synced copy-verbatim to all 3 sims; models shared
  from `city-builder/assets/models/` (same origin).

| **Tables pack** (10 PBR tables, OBJ+MTL→GLB, textures 512) | itch paid pack | personal-use | `office/` (Table 01–11) |

| **Spacestations** (6 .blend→GLB space stations) | itch free pack | personal-use | `space/` |
| **EnvironmentPack** (5 sci-fi corridor FBX→GLB) | itch free pack | personal-use | `space/` |

Final tally: **575 props, 12 categories** (nature ~90, space ~228, lab ~219 files wired as 140, office 51).

## Interior scenario wave (structural environment assets)

| Set | Source | License | Where it went |
|---|---|---|---|
| **FrostyCybrpack walls_and_floors** (38 curated) | itch free pack | personal-use | `interiors/cyber/` (2 wall styles: 1m/2m/4m, corners, doors, windows, columns, floor, ceiling) |
| **Modular SciFi walls/platforms/columns/decals** (158, textures 512) | itch Standard | personal-use | `interiors/scifi/` (84 walls, 38 platforms, 8 columns, 28 decals) |
| **[AR] Hospital Assets FREE** (17 GLBs) | itch free pack | personal-use | `hospital/` (structural walls/floor + beds/machines/cupboards) |
| **Spaceship_Modules + Exta** (2 hallway GLBs) | itch free pack | personal-use | `interiors/spaceship/` (hallway packs) |

> ⚠️ The "personal-use" packs above were REMOVED from the shipped library in
> the CC0 cleanup. They are documented here only for history. Anything that
> ships today is CC0 / public-domain only.

## CC0 re-density batch (2026-08-29)

All models below are **CC0 1.0** (public domain, no attribution required). Sources
are recorded for provenance. Kenney GLBs embed the shared `Textures/colormap.png`.

| Model | Source | License | Notes |
|---|---|---|---|
| `school.glb`, `hospital.glb`, `shop.glb`, `office.glb`, `library.glb`, `police.glb` | Kenney City Kit (Commercial) v2.1 — https://kenney.nl/assets/city-kit-commercial | CC0 | Generic facility buildings (was: flat facade boxes). `office` = skyscraper-b, `shop` = wide low-detail, `hospital` = building-i, `school` = building-c, `library` = building-a, `police` = building-d. Stadium stays procedural (no GLB). |
| `street-deco/stop-sign.glb`, `warning-sign.glb`, `street-sign.glb`, `construction-cone.glb`, `construction-barrier.glb`, `dumpster.glb`, `electricity-pole.glb`, `traffic-light-vertical.glb`, `traffic-light-horizontal.glb` | Kenney City Kit (Roads) — https://kenney.nl/assets/city-kit-roads | CC0 | Street furniture scattered at road junctions (`street-deco.js`). |
| `Textures/colormap.png` | Kenney City Kit (Commercial) | CC0 | Shared Kenney colormap referenced relatively by the GLBs. |

These are the building blocks for the walkable interior scenarios (Tech Lab / Spaceship / Space Station / Hospital).

### Mission buildings (2026-08-29) — Kenney City Kit, CC0
The 18 special/mission buildings (`city-builder/assets/models/mission/*.glb`) are
Kenney City Kit (Commercial + Industrial) GLBs, CC0 — same packs documented above.
Kept the quest beacon + label; only the building body is a real model now.
