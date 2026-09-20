# BUILD: "My First AI City" — P1-P2 (Ages 6-7)

**Read the shared conventions at `games/primary/CAPSTONE-SHARED-CONVENTIONS.md` first.**

## Game Concept

A tactile, cheerful city-building game for young children. Students drag colorful buildings onto a 6×6 grid, connect them with roads/pipes, and watch their city come alive with animated citizens. Three phases in one session (~30 minutes).

**AI Narrative Arc**: Nova Jr. is a friendly robot learning what a city needs. The student teaches her by placing each building type for the first time — Nova Jr. "learns" what hospitals, schools, and water towers do.

## Design System: Bright + Friendly Theme

```css
:root {
  --color-bg: #e8f4f8;           /* Light sky blue */
  --color-surface: #ffffff;
  --color-surface-alt: #f0f9ff;
  --color-card: #ffffff;

  --color-grass: #86efac;
  --color-grass-dark: #4ade80;
  --color-water: #7dd3fc;
  --color-sand: #fde68a;

  /* Building colors */
  --color-home: #fb923c;
  --color-hospital: #f87171;
  --color-school: #facc15;
  --color-park: #4ade80;
  --color-power: #60a5fa;
  --color-water-tower: #38bdf8;

  /* Task-type accent colors */
  --color-power-task: #facc15;
  --color-water-task: #38bdf8;
  --color-road-task: #a78bfa;

  --color-primary: #3b82f6;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  --color-text: #1e293b;
  --color-text-muted: #64748b;

  --font-display: 'Nunito', 'Comic Sans MS', system-ui, sans-serif;
  --font-body: 'Nunito', system-ui, sans-serif;
  --touch-min: 60px;         /* Extra large for small hands */
  --touch-comfortable: 72px;
}
```

## File Structure

Exactly the standard 11 files (see shared conventions). No additional files.

## Data Model

```js
const GRID_SIZE = 6;

const BUILDING_DEFS = {
  home:    { emoji: '🏠', label: 'Home', cost: 2, needs: ['water','power','road'] },
  school:  { emoji: '🏫', label: 'School', cost: 3, needs: ['water','power','road'] },
  hospital:{ emoji: '🏥', label: 'Hospital', cost: 4, needs: ['water','power','road'] },
  park:    { emoji: '🌳', label: 'Park', cost: 1, needs: [] },
  water:   { emoji: '💧', label: 'Water Tower', cost: 3, provides: 'water' },
  power:   { emoji: '⚡', label: 'Power Plant', cost: 3, provides: 'power' }
};

const REQUIRED_BUILDINGS = { home: 3, school: 1, hospital: 1, water: 1, power: 1 };

const state = {
  phase: 'intro',         // intro | build | connect | watch | end
  budget: 20,
  spent: 0,
  grid: Array(6).fill().map(() => Array(6).fill(null)),
  // grid[r][c] = null | { type: 'home', connections: {} }
  // connections: { water: boolean, power: boolean, road: boolean }

  hazardTiles: [[2,5],[4,1],[5,4]],      // 3 pre-placed hazards
  scanned: new Set(),                     // Set of "r,c" strings
  scanMode: 'normal',                    // 'normal' | 'turbo'

  connections: [],                        // { fromId, toId, type }
  buildingIdCounter: 0,

  // Phase 3: Watch
  citizens: [],                           // Simple positions, no pathfinding
  puddles: [[3,2],[1,4],[4,5]],          // 3 flood tiles
  puddlesDrained: 0,
  wasteSorted: 0,
  simSpeed: 1,                            // 1=slow, 2=normal, 3=fast
  simTime: 0,
  crisisTriggered: false,

  score: { stars: 0 },
  sessionId: Date.now()
};
```

Buildings get IDs as they're placed. The `connections` object tracks which utilities reach each building.

## Phase 1: BUILD (15 min)

### Grid
6×6 grid. Terrain is always the same for consistency:
```
🏞️🏞️🌊🌊🏞️🏞️
🏞️🌊🌊🏞️🏞️🏞️
🏞️🏞️🏞️🏞️🏞️🏞️
🏞️🏞️🏞️🏞️🏞️🏞️
🏞️🏞️🏞️🏞️🏞️🏞️
🏞️🏞️🏞️🏞️🏞️🏞️
```
🌊 = water (decorative, can't build on)  
🏞️ = grass (buildable)

### Sidebar (left or bottom, depending on orientation)
Building palette showing all 6 buildings with emoji, label, and coin cost.
Currently selected building has a glow border. Tap building in palette to select, then tap empty grass tile to place.

### Budget
- Start: 20 coins
- Each placement deducts cost
- If spent > budget, cannot place — Nova Jr. says "You need more coins! Remove a building to try a different spot."
- Tap placed building → "Remove" button appears → press to remove and refund half cost (rounded down)

### Subsurface Scan
- Magnifying glass button activates scan mode
- Tap a tile to scan — 1s animation, then reveal (clear ✅ or hazard ❌)
- Unlimited scans, no cost
- 3 hazard tiles pre-placed (randomized per session)
- If student builds on unscanned hazard: building placed but shows cracked animation, Nova: "Oh no! There was a rock under there! The building is cracked."
- Student can relocate: tap cracked building → "Move" button → select new spot

### Minimum Requirements
Student must place at least: 3 homes, 1 school, 1 hospital, 1 water tower, 1 power plant
Before Phase 2 unlocks, these must all be placed (budget allows exactly this: 2×3+3+4+3+3 = 19 coins with 1 spare)

### Phase 1 → Phase 2 Transition
Once minimum requirements met, button appears: "Connect!" (pulsing, friendly)
Nova Jr.: "Great city! Now connect the water, power, and roads!"

## Phase 2: CONNECT (10 min)

### Three Connection Types (sequential tabs)

**Step 1: Pipes 💧** — Connect water tower to all buildings
- Tap water tower → each unconnected building highlights blue
- Tap each highlighted building to connect
- Blue pipe animates between them (SVG line with flowing dots)
- Connected building's `connections.water = true`

**Step 2: Wires ⚡** — Connect power plant to all buildings
- Same mechanic, yellow/gold highlights and lines
- Connected building's `connections.power = true`

**Step 3: Roads 🛣️** — Connect homes to school and hospital
- Tap any home → valid destinations highlight gray (school, hospital)
- Draw road path: tap home → tap intermediate tiles → tap destination
- Max 3 intermediate tiles (simplified)
- Road follows tapped path with curved SVG line

### Waste Sorting Mini-Game (bonus)
After all connections made, a "Bonus!" button appears.
5 items appear on screen (plastic bottle, apple core, glass jar, newspaper, battery).
3 bins: Recycle ♻️, Compost 🟫, General 🗑️.
Drag item to bin. Correct = 1 coin bonus (visual). Wrong = gentle "try again" wobble.
Items: plastic bottle→Recycle, apple core→Compost, glass jar→Recycle, newspaper→Recycle, battery→General.

### Connection Validation
- Building is "fully connected" when `water && power && (road || type in [water, power, park])`
- Progress indicator shows: "3 / 5 buildings connected"
- Park and power/water buildings don't need roads

### Phase 2 → Phase 3 Transition
When all buildings connected → "Start City!" button (large, pulsing green)
Nova Jr.: "Everything is connected! Press Start to see your city come alive!"

## Phase 3: WATCH (10 min)

### What Happens
- Grid fades in with small animations (citizens appear at homes, bus appears at road)
- **Citizens**: Simple colored circles appear at random buildings, fade out, reappear elsewhere. NOT walking/pathfinding — just fading in/out for performance and simplicity.
- **Bus**: Yellow rectangle emoji that slides along road connections in a loop (homes → school → hospital → homes)
- **Water flow**: Small blue dots moving along pipe SVG lines
- **Power glow**: Brief yellow flash pulsing along wire SVG lines
- Buildings with all connections: green outline glow. Missing connections: red outline.

### Speed Controls
Three large buttons: 🐌 Slow / 🚶 Normal / 🐇 Fast
- Slow: citizens fade every 4 seconds, dots move slowly
- Normal: citizens fade every 2 seconds
- Fast: citizens fade every 0.5 seconds, dots move quickly

### Tap Interactions
- Tap any building → info card:
  - 🏠 Home: "2 people live here. 💧✅ ⚡✅ 🛣️❌"
  - Shows check/cross for each utility
- Tap citizen → "😊 Happy citizen!" or "😟 Needs [missing utility]"
- No score penalty for missing utilities — purely informational

### Black Swan: Rainstorm ⛈️
Triggers after 60 seconds of simulation time.
- Nova Jr.: "Oh no! Heavy rain! Puddles are blocking the roads!"
- 3 puddle icons appear on random grid tiles (blue circles with splash animation)
- Road connections passing through puddle tiles show "blocked" (gray line, dashed)
- Bus stops moving when blocked
- Student taps puddles to drain them (splash animation, 300ms)
- Each drained puddle: "💦 Splash!" with Nova Jr. "Good job!"
- All 3 drained → roads clear, bus resumes
- Score: how fast student drained all 3 (capped star)

### End Screen
After 120 seconds OR all puddles drained + 30s more → transition to End.

**End screen elements:**
1. City screenshot taken via `canvas.toDataURL()` or HTML2Canvas-style DOM capture
2. **Star rating** (1-3):
   - ⭐ All minimum buildings placed
   - ⭐ All buildings connected
   - ⭐ Puddles drained in < 30 seconds
3. **Badge**: "🏗️ My First AI City!"
   Shows star count, e.g. "⭐⭐⭐ City Builder!"
4. Nova Jr. summary: "You built a city with homes, a school, and a hospital. You connected water AND power!"
5. Buttons:
   - "Build a New City!" — resets to Phase 1
   - "Share!" — saves screenshot to clipboard (simple fallback: download image)

## Nova Jr. Intents (P1-P2)

Simplified for young children. Fewer patterns, very short responses.

```js
const INTENTS = [
  { id: 'help',
    patterns: [/help/i, /what.*do/i],
    responses: ['Drag buildings from the side onto the green squares! Then connect them.']
  },
  { id: 'cost',
    patterns: [/cost/i, /how much/i, /coin/i, /money/i],
    responses: ['Homes cost 2 coins. Schools cost 3. Hospitals cost 4. Parks cost 1. Power and water cost 3!']
  },
  { id: 'scan',
    patterns: [/scan/i, /hazard/i, /hidden/i],
    responses: ['Tap the magnifying glass, then tap a square to look underground!', 'Rocks and pipes can be hiding under the ground!']
  },
  { id: 'connect',
    patterns: [/connect/i, /pipe/i, /road/i, /water/i],
    responses: ['Tap the water tower, then tap each building to give them water! Then do the same for power!']
  },
  { id: 'encourage',
    patterns: [/done/i, /finish/i, /ready/i, /good/i, /yay/i],
    responses: ['You are doing a great job!', 'Wow, your city looks amazing!', 'The citizens are going to love living here!']
  },
  { id: 'nova_simple',
    patterns: [/nova/i, /junior/i, /robot/i, /friend/i],
    responses: ['Hi! I am Nova Jr. Let us build a city together!']
  }
];
```

## Audio

| Sound | When | Implementation |
|-------|------|----------------|
| Building placed | After drop | 3 quick rising notes (C5→E5→G5, 60ms each) |
| Connection made | After tap to connect | Ascending sweep (500→1000Hz, 150ms) |
| Wrong sort | Wrong bin in waste sort | Low buzz (200Hz, sawtooth, 100ms) |
| Correct sort | Correct bin | Happy ding (A5, sine, 200ms) |
| Puddle drained | After tap | Splash: noise burst (100ms, filtered white noise) |
| City starts | Phase 3 begins | Ascending arpeggio (C5→E5→G5→C6, 100ms steps) |
| Star earned | On end screen | Triumphant chord (C major, sine, 300ms) |
| Nova speaks | Always before TTS | Soft chime (G4, 100ms) |

## Key Implementation Notes

1. **No pathfinding.** Citizens don't walk. They appear/disappear at buildings. This is critical for performance.
2. **Connections are simple SVGs.** No A* pathfinding for roads. Roads are straight lines between buildings with a midpoint control point for gentle curve.
3. **Grid is HTML/CSS**, not Canvas. Each tile is a `<div>`. Buildings are emoji in `<span>`.
4. **Touch events**: `touchstart`/`touchmove`/`touchend` for drag-and-drop. `click` for taps (works on both touch and mouse).
5. **Ghost element**: When dragging a building from palette, show a semi-transparent copy following the finger.
6. **Snap**: On release, snap to nearest grid tile center. If within 50% of tile, place there.
7. **Phase transitions**: Fade overlay (CSS opacity, 500ms ease). Game state is paused during transition.
8. **Citizen rendering**: `<div>` with `position: absolute`, `border-radius: 50%`, random pastel color, 20px diameter. Positioned at building coordinates. Fade in/out with CSS `transition: opacity 300ms`.
9. **Bus**: Same as citizen but yellow rectangle with `⚡` inside. Moves along road connections with `requestAnimationFrame` and linear interpolation between waypoints.
10. **Error state - Out of coins**: Show red flash on coin counter. Nova says "You need more coins! Remove a building to try a different spot." Tap any building → "Remove" button → removes building, refunds half cost.

## Phase Transition Conditions (Exact)

```
Phase 1 → Phase 2 fires when:
  grid contains count(home) >= 3
  AND count(school) >= 1
  AND count(hospital) >= 1
  AND count(water) >= 1
  AND count(power) >= 1
  AND spent <= budget

Phase 2 → Phase 3 fires when:
  every non-park, non-utility building has water && power && road
  (park only needs water+power; water+power need nothing)

Phase 3 → End fires when:
  (crisisTriggered && all puddles drained && elapsed > 30s)
  OR elapsed > 150s (timeout)
```

## Victory Condition

The game doesn't have "losing." The star count is the score:
- 3 stars: all minimum buildings + all connected + all puddles drained fast
- 2 stars: all minimum buildings + all connected
- 1 star: all minimum buildings placed
- 0 stars: didn't meet minimum (shouldn't happen since it blocks progression)
