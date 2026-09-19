# AI City Architect — 3D (P3-P4 Capstone, Lessons 18-20)

A 3D version of the AI City Architect capstone. Students design a living city in
3D, then watch it come alive with buses, trucks, citizens, weather and Black
Swan crises — and walk through it as **their AI champion** (same skins and
accessories as the main HK simulation).

## Location

**This is the canonical copy**, served by the buddy-kit gateway:

```
P5 Programme/project/p3-18-3d-city/
→ http://localhost:8787/project/p3-18-3d-city/
```

(An earlier standalone copy exists at `games/primary/p3-18-3d-city/` with a
procedural robot champion — superseded by this shared-champion version.)

## How to run

Start the buddy-kit gateway (if not already running):

```bash
cd "P5 Programme/buddy-kit/server" && npm start
# open http://localhost:8787/project/p3-18-3d-city/
```

Three.js loads from CDN; the champion GLB skins, animation clips and accessory
modules load from `/champion-city/...` (shared with the HK city, same origin).

## Shared champion

The capstone champion is **the same AI champion as the main simulation**:

- Same 5 full-body skins (always available): Crimson Guardian, Dragon Emperor,
  Neon Dragon Mech, Pastel Bunny Bot, Neon Sentinel
- Same 13 animation clips (walk, run, jump, wave, 7 dances, turns)
- Same modular accessories (head / face / back slots) — the unlockable
  cosmetics students earn through lessons
- Skin + accessory choices persist across games via localStorage
  (`hk_ai_city_skin_v1`, `hk_ai_city_accessories_v1`)
- Grid movement is capstone-specific (BFS tile-to-tile), everything else is shared

## Phases

### Design (Lesson 18)
- 20×20 grid with a river and mountains
- 17 building types across 6 systems (power, water, transport, health, waste, safety)
- 500-token budget; tap palette → tap ground to place
- Walk tool: tap the ground to send your champion there
- Remove tool: tap a building to remove it (refund)
- Build checklist: 1 building per system, 3+ roads, 25+ tokens

### Simulate (Lesson 20)
- Press ▶ Simulate once the checklist is complete
- Buses and waste trucks drive along your road network (BFS-routed)
- Citizens appear near buildings
- Weather cycles (clear → cloudy → rain → storm) with sky + rain effects
- System health bars + sentiment in the dashboard
- Black Swan crises (heatwave, flood, storm) with decision panels — choices
  affect system health

## Controls

- **Orbit camera**: drag to rotate, scroll/pinch to zoom
- **🎥 Follow**: toggle third-person follow of your champion
- **🎨**: champion customization (Presets + Accessories tabs)
- **Palette**: 🚶 Walk / 🏗️ Build / 🗑️ Remove tools
- **📋 checklist**: build requirements

## Files

| File | Purpose |
|------|---------|
| `index.html` | Entry point, HUD, palette, dashboard, crisis panel, skin sidebar |
| `style.css` | Dark dashboard theme (P3-P4 conventions) |
| `city-logic.js` | Pure state: grid, buildings, budget, BFS routing, requirements |
| `city-render.js` | Three.js scene: terrain, grid, river, buildings, weather |
| `city-sim.js` | Simulation: vehicles, citizens, weather, crises |
| `champion.js` | Shared champion (GLB skins + animations + accessories) on the capstone grid |
| `main.js` | UI wiring, palette, tools, phase flow, render loop |

Shared modules (not copied, imported from the gateway origin):
- `/champion-city/skins.js` — skin + accessory sidebar
- `/champion-city/accessories.js` — accessory registry + geometry
- `/champion-city/assets/clips/*.glb` — skins + animation clips

## Not yet included (next iterations)

- Knowledge graph (Lesson 19)
- Full 12 crisis scenarios + exam
- Nova AI voice companion (reuse from buddy-kit gateway)
- Hunyuan-generated 3D building models (currently procedural)
