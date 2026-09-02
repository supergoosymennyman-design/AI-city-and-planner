# 3D Asset Attribution — City Builder (city-builder)

All external GLB models used by the 3D city builder, with licenses and sources.

## Kenney (CC0 1.0 — public domain)

Source: https://kenney.nl · License: Creative Commons CC0 (no attribution required, kept for provenance)

### Residential housing variants (`assets/models/housing-variants/`)
- `housing-a.glb`, `housing-c.glb`, `housing-h.glb`, `housing-j.glb`, `housing-n.glb`, `housing-u.glb`
- From **Kenney City Kit (Suburban) v2.0** — https://kenney.nl/assets/city-kit-suburban
- Low-poly stylized houses with a shared 512×512 colormap (embedded into each GLB).
- Used as the 2×2 residential block units; each unit picks a random variant.

### Park nature filler (`assets/models/nature-filler/`)
- `plant_bush.glb`, `plant_bushDetailed.glb`, `plant_bushTriangle.glb`
- `flower_yellowA/B.glb`, `flower_purpleA/B.glb`
- `grass_leafs.glb`, `grass_leafsLarge.glb`
- `rock_smallA/B.glb`, `mushroom_redTall.glb`
- From **Kenney Nature Kit** — https://kenney.nl/assets/nature-kit
- Tiny untextured low-poly props scattered inside parks via InstancedMesh.

### Trees (`assets/models/nature/`)
- `tree-normal/pine/birch/maple/dead.glb` — Quaternius/Kenney style packs (CC0).
- Park model `park.glb`, street props `streetlight.glb`, `bench.glb` — Kenney (CC0).

## Poly Pizza / Google Poly archive

### Facility buildings
- `hospital.glb` — **"Hospital" by Poly by Google**, CC-BY 3.0 (embedded texture)
  https://poly.pizza/m/asNvyjkcSG1
- `stadium.glb` — **"Ballpark" by Poly by Google**, CC-BY 3.0 (embedded texture)
  https://poly.pizza/m/45Ez39JSdz6

### Fire station
- `fire-station.glb` — **"Fire Station with Fire Trucks" by Ivan Klus**, CC0 1.0
  https://poly.pizza/m/akzBrALzbei

### Parked vehicles (from the P3 AI City capstone, originals below)
- `vehicles/ambulance.glb` — **"Ambulance"**, Quaternius/Poly Pizza style, CC0 (ported from `p3-18-3d-city/assets/models/vehicles/`)
- `vehicles/firetruck.glb` — **"Fire Truck"**, CC0 (ported from `p3-18-3d-city/assets/models/vehicles/`)
- `vehicles/police.glb` — **"Police Car"**, CC0 (ported from `p3-18-3d-city/assets/models/police.glb`)
- `vehicles/bus.glb` — **"Bus"**, CC0 (ported from `p3-18-3d-city/assets/models/bus.glb`)

### Playground (`assets/models/playground/`)
- `swing-set.glb` — **"Swing set" by Poly by Google**, CC-BY 3.0
  https://poly.pizza/m/e-IJdcqZH4p
- `slide-opt.glb` — **"Slide" by Poly by Google**, CC-BY 3.0 (texture downscaled to 256²)
  https://poly.pizza/m/dDe3njWPbg0
- `fountain-opt.glb` — **"Fountain" by Poly by Google**, CC-BY 3.0 (texture downscaled to 256²)
  https://poly.pizza/m/4KKY7CmNe_r

### Street deco (`assets/models/street-deco/`)
- `traffic-light.glb` — **"Traffic Light" by Quaternius**, CC0 1.0
  https://poly.pizza/m/lg9AKWejnF
- `stop-sign.glb` — **"Stop sign" by Poly by Google**, CC-BY 3.0
  https://poly.pizza/m/60GyU9CdZ9r

## CC-BY credits (required)

> ⚠️ The Poly-by-Google CC-BY models (Swing set, Slide, Fountain, Stop sign,
> Hospital, Ballpark) were REMOVED in the CC0 cleanup and are no longer shipped.
> The credits line below is retained for history only.

Playground, facility and some street models are by **Poly by Google** and licensed
[CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution:

> "Swing set", "Slide", "Fountain", "Stop sign", "Hospital", "Ballpark" — Poly by Google
> (via Poly Pizza), CC-BY 3.0. https://poly.pizza

## CC0 re-density batch (2026-08-29) — Kenney City Kit

All new facility + street-deco models are **CC0 1.0** from Kenney's City Kit
packs — no attribution required, kept for provenance:

- `school/hospital/shop/office/library/police/stadium.glb` — Kenney City Kit
  (Commercial) v2.1 — https://kenney.nl/assets/city-kit-commercial
- `street-deco/stop-sign.warning-sign.street-sign.glb`,
  `street-deco/construction-cone.glb`, `construction-barrier.glb`,
  `dumpster.glb`, `electricity-pole.glb`, `traffic-light-vertical/horizontal.glb`
  — Kenney City Kit (Roads) — https://kenney.nl/assets/city-kit-roads

## Reuse rules
- If a model is removed or replaced, update this file.
- CC0 models (Kenney, Quaternius) are public domain — attribution kept for provenance.
- CC-BY models (Poly by Google) require the credits line above.
- CC-BY / non-CC0 models must NOT be added — see CC0-MANIFEST.md.
