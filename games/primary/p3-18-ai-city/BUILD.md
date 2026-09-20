# BUILD: "AI City Builder" — P3-P4 (Ages 8-9)

**Read the shared conventions at `games/primary/CAPSTONE-SHARED-CONVENTIONS.md` first.**

## Game Concept

Students design a 10×10 smart city, manage a token budget, configure AI systems with sliders, connect causal relationships in a knowledge graph, then run an animated simulation with black swan events. Three phases, ~40 minutes.

**AI Narrative Arc**: Nova knows how individual AI systems work (she learned from lessons 1-17) but doesn't know how to combine them into a city. The student teaches her by making design decisions. By the simulation phase, Nova can predict and warn about problems.

## Design System: Dark Dashboard Theme

```css
:root {
  --slate-950: #020617;
  --slate-900: #0f172a;
  --slate-800: #1e293b;
  --slate-700: #334155;
  --slate-600: #475569;
  --slate-500: #64748b;
  --slate-400: #94a3b8;
  --slate-300: #cbd5e1;
  --slate-200: #e2e8f0;
  --slate-100: #f1f5f9;
  --slate-50:  #f8fafc;

  --color-bg: var(--slate-900);
  --color-surface: var(--slate-800);
  --color-surface-hover: var(--slate-700);
  --color-border: var(--slate-600);
  --color-text: var(--slate-50);
  --color-text-muted: var(--slate-400);
  --color-text-subtle: var(--slate-500);

  --color-primary: #38bdf8;
  --color-primary-dim: #0c4a6e;
  --color-primary-glow: rgba(56, 189, 248, 0.25);
  --color-success: #22c55e;
  --color-success-dim: #166534;
  --color-warning: #eab308;
  --color-warning-dim: #713f12;
  --color-danger: #ef4444;
  --color-danger-dim: #7f1d1d;
  --color-token: #fbbf24;
  --color-token-dim: #78350f;

  --color-power: #facc15;
  --color-water: #38bdf8;
  --color-transport: #a78bfa;
  --color-health: #f87171;
  --color-waste: #4ade80;

  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;
}
```

## File Structure

```
index.html
style.css
game.js            — Core state, phase management, grid
settings.js
transcript.js
audio.js
intents.js
conversation.js
knowledge-graph.js — Knowledge graph UI and logic
simulation.js      — Agent-based simulation engine + events
main.js            — UI controller (loads last)
test/index.test.js
PLAN.md
README.md
```

13 files total. `knowledge-graph.js` and `simulation.js` are the non-standard additions.

## Data Model

```js
const GRID_SIZE = 10;
const TOKEN_BUDGET = 100;

const SYSTEMS = ['power','water','transport','health','waste'];

const BUILDING_DEFS = {
  // Power & Water
  solar:      { system:'power', label:'Solar Farm',     cost:8,  provides:{energy:5},    emoji:'☀️' },
  wind:       { system:'power', label:'Wind Turbine',   cost:6,  provides:{energy:3},    emoji:'🌬️' },
  waterTower: { system:'water', label:'Water Tower',    cost:8,  provides:{water:10},    emoji:'💧' },
  datacenter: { system:'power', label:'AI Data Center', cost:15, consumes:{energy:3},    emoji:'🖥️', sliders:['Cooling'] },

  // Transport
  busStop:    { system:'transport', label:'Bus Stop',   cost:4,  sliders:['Frequency'],  emoji:'🚏' },
  road:       { system:'transport', label:'Road',       cost:2,  emoji:'🛣️' },
  depot:      { system:'transport', label:'Bus Depot',  cost:5,  emoji:'🏭' },
  trafficLt:  { system:'transport', label:'Traffic Light',cost:3,sliders:['GreenDuration'], emoji:'🚦' },

  // Health
  hospital:   { system:'health', label:'Hospital',      cost:15, capacity:50, sliders:['Staff'], emoji:'🏥' },
  clinic:     { system:'health', label:'Clinic',        cost:8,  capacity:10,              emoji:'🩺' },
  greenSpace: { system:'health', label:'Green Space',   cost:2,  sentiment:+5,            emoji:'🌳' },

  // Waste
  recycling:  { system:'waste',  label:'Recycling Ctr', cost:6,  sliders:['Route'],       emoji:'♻️' },
  collection: { system:'waste',  label:'Collection Pt', cost:4,                            emoji:'🗑️' },
};

// Slider definitions
const SLIDER_DEFS = {
  Frequency:     { label:'Bus Frequency', min:5, max:30, default:15, unit:'min', desc:'Lower = more buses, costs more tokens' },
  GreenDuration: { label:'Green Light',   min:10,max:60, default:30, unit:'s',   desc:'Longer = better traffic flow' },
  Staff:         { label:'Nurse Staff',   min:1, max:5,  default:3,  unit:'',    desc:'More = faster healing, risk of burnout' },
  Route:         { label:'Route Length',  min:3, max:10, default:5,  unit:'stops',desc:'Longer = more coverage, harder to maintain' },
  Cooling:       { label:'Cooling Type',  options:['Air','Liquid','Green'], default:'Air', desc:'Air=cheap, Liquid=efficient, Green=best but $$' },
};

const state = {
  phase: 'design',    // intro | design | optimize | simulate | end
  grid: Array(10).fill().map(() => Array(10).fill(null)),
  hazards: [],         // Array of [r,c] — 8 pre-placed
  scanned: {},         // 'r,c' → { mode, result, chart? }
  buildings: [],
  connections: [],     // [{ fromId, toId, type: 'road'|'pipe'|'wire' }]

  tokens: { budget: 100, spent: 0 },
  buildingIdCounter: 0,

  // Slider config per building
  configs: {},         // buildingId → { sliderId: value }

  // Phase 2
  knowledgeGraph: {
    nodes: [],         // { id, type, label, x, y }
    edges: []          // { from, to, label, strength }
  },
  optimizationScore: 0,
  acceptedOptimizations: 0,

  // Phase 3
  simulation: {
    speed: 1,          // 1 | 10 | 100
    time: 0,
    maxTime: 5000,     // ticks
    agents: [],
    systems: {
      power:    { supply:0, demand:0, health:100, mix: { battery:50, fossil:30, slowAI:20 } },
      water:    { supply:0, demand:0, health:100, pressure:1.0 },
      transport:{ coverage:0, avgWait:0, health:100 },
      health:   { capacity:0, demand:0, sentiment:100, staffBurnout:0 },
      waste:    { collected:0, overflow:0, health:100 }
    },
    eventLog: [],
    crisisCount: 0,
    crisesHandled: 0,
  },

  score: { stars:0 },
  sessionId: Date.now()
};
```

## Phase 1: DESIGN (20 min)

### Grid
10×10. A river runs through tiles `[0][2]`, `[0][3]`, `[1][3]`, `[1][4]`, `[2][4]` (winding). These tiles cannot be built on.

### Building Placement
- Palette on left side, grouped by system (Power/Water, Transport, Health, Waste)
- Tap building type in palette → multiple taps to place multiple copies
- Tap tile to place, tap placed building to select → shows config panel in right panel
- **Cannot place on water tiles or hazard tiles**
- **Cannot place on a tile that already has a building**

### Subsurface Scan (L2)
- Button: "Scan Mode" toggles scanner overlay
- Two modes toggleable: Normal / Turbo
  - **Normal**: 2-second scan per tile, 100% accurate, shows hazard icon
  - **Turbo**: Instant scan, shows a simple squiggly "chart" line. Student must eyeball: sharp spike = hazard, flat = clear. 20% false positive/negative rate.
- 8 hazard tiles randomly placed per session (rocks, pipes, artifacts)
- Building on unscanned hazard: building placed with 50% efficiency penalty until moved
- Efficiency penalty shown as yellow warning icon on building

### Token Budget
- Start: 100 tokens
- Each building cost subtracts from budget
- Remaining always shown in top bar
- **Out of tokens**: Red flash, toast "Out of tokens! Remove a building to free up tokens."
- Remove building: tap selected building → "Remove" button → refunds 60% of cost

### Slider Configuration
Tap placed building → right panel shows sliders specific to that building type.
Slider changes apply immediately. No cost for changing sliders.

### Minimum Requirements (Design Phase Complete)
Must place at least:
- 1 power source (solar or wind)
- 1 water tower
- 1 bus stop
- 1 hospital or clinic
- 1 recycling center
- At least 3 roads (to connect things)
- Minimum token spend: 25 tokens

### Phase 1 → Phase 2
When min requirements met → "Optimize!" button appears in bottom bar.
Nova: "Good design! Now let's see how everything connects. Open the Knowledge Graph!"

## Phase 2: OPTIMIZE (15 min)

### Knowledge Graph

#### Simplified UI — NOT a free-form drag editor
The knowledge graph uses a **guided matching** approach:

1. **Palette of concept cards** in a bottom tray:
   - Home, School, Hospital, Bus Stop, Power Plant, Water Tower,
     Data Center, Recycling Center, Park, Citizens

2. **Canvas area** (center of screen) showing 4-5 pre-placed nodes
   (the buildings the student placed in Phase 1)

3. **Student task**: Drag relationship labels between nodes:
   - `→ needs →` / `→ provides →` / `→ consumes →`
   - `→ near →` / `→ far from →` / `→ reduces →` / `→ increases →`
   - Available labels appear based on node types being connected

4. **Minimum**: Connect at least 5 relationships

5. **Feedback**: After each connection, canvas highlights related nodes and shows a "+Optimization" message

#### AI Optimization
1. Button: "Analyze with AI" — enabled after 5+ connections
2. AI examines graph and finds 3 issues:
   - "Your homes have power but no hospital nearby. Sentiment will drop."
   - "The Data Center consumes energy but you have no backup power."
   - "Your recycling center is far from most buildings."
3. Each issue shows as a suggestion card: "[Accept] [Dismiss]"
4. Accepted suggestions turn into green annotations on the graph
5. Score: number accepted

#### Quick Scenarios (3 simple challenges)
After graph analysis, 3 scenarios pop up sequentially. Each is a single interaction:

1. **Traffic**: "Traffic is backed up at the main intersection!"
   → Slider appears: "Adjust Green Light Duration" (10-60s)
   → Student sets it → Nova: "Traffic flow improved by [X]%"

2. **Power**: "The data center is draining the grid!"
   → Three radio buttons: "Drain Battery / Fire up Fossil / Slow AI Training"
   → Student picks → Nova: "[X] chosen. Power stabilized."

3. **Waste**: "Recycling center over capacity!"
   → Simple toggle: "Add another collection truck" yes/no
   → Student picks → Nova: "Waste processing [increased/stays same]"

### Phase 2 → Phase 3 Transition
After completing all 3 scenarios → "Start Simulation!" button (pulsing).
Nova: "Your city is optimized! Let's see it run!"

## Phase 3: SIMULATE (15 min)

### What Renders

**Grid**: Same as design phase but now animated. Buildings have glow effects.

**Agents** (max 15 for performance):
| Agent | Render | Behavior |
|-------|--------|----------|
| Citizen (×5-8) | 12px colored circle | Appears at home → fades → appears at school/hospital/clinic → repeats. NO walking animation. |
| Bus (×1-2) | Small yellow rectangle | Moves along road connections between bus stops. Linear interpolation. |
| Water (particles) | 3px blue dots | Flow along pipe connections. Periodic. |
| Power (particles) | 3px yellow dots | Pulse along wire connections. Periodic. |
| Waste Truck (×1) | Small green rectangle | Moves along road to recycling center, pauses, returns. |

**Important**: Citizens do NOT walk. They teleport-fade. This is intentional for performance. Buses and trucks do move smoothly.

### Dashboard (right panel, 300px wide)

```
┌────────────────────────┐
│  CITY DASHBOARD        │
├────────────────────────┤
│  💰 Tokens  78/100     │
│  😊 Sentiment  82%     │
├────────────────────────┤
│  ⚡ Power      ████░░  │
│  💧 Water      ██████  │
│  🚌 Transport  ████░░  │
│  🏥 Health     █████░  │
│  ♻️ Waste      ███░░░  │
├────────────────────────┤
│  EVENT LOG             │
│  ▶️ City started       │
│  ▶️ Bus #1 began route │
│  ▶️ Power spike! (48s) │
└────────────────────────┘
```

- System health bars: green (>70%), yellow (30-70%), red (<30%)
- Event log: last 5 events, auto-scroll
- Sentiment: percentage based on service coverage

### Speed Controls
Three buttons at bottom: 🔍 1× / 🏃 10× / 📈 100×
- 1×: Real-time, tap agents for details
- 10×: Events speed up, good for watching patterns
- 100×: Simulation ticks fast, dashboard updates every 2s

### Black Swan Events

**Event 1: Heatwave** (triggers at tick 600 ≈ 60s at 1×)
- Screen overlay: subtle orange gradient at edges
- Power demand +40% (displayed as spike on dashboard bar)
- Hospital admissions +20%
- Transport slows 30%
- **Action**: Student sees dashboard change and must adjust sliders
  - Energy mix sliders appear: Battery / Fossil / Slow AI
  - Or: Bus Frequency slider to add more buses
- Nova: "Heatwave! Power demand is spiking. Adjust the energy mix or deploy more buses to get people to cool zones."
- **Resolved when**: Energy mix adjusted so power supply > demand × 1.2
- **Time limit**: 120 ticks to resolve, else sentiment drops to 30%

**Event 2: Flood** (triggers at tick 1200, if heatwave resolved)
- Screen overlay: subtle blue at bottom
- 2-3 road tiles become water tiles (tap to inspect)
- Water pipes in flooded tiles show "leak" (red droplet icon)
- Bus route blocked if flood on route path
- **Action**: Tap each leak to repair (2s per repair), then buses auto-reroute
- Nova: "Flooding! Pipes are leaking and roads are blocked! Tap leaks to repair."
- **Resolved when**: All leaks repaired (2-3 taps)
- **Time limit**: 90 ticks, else waste builds up from stalled collection

### Crisis Score
- Each crisis handled successfully: +1 point
- Crisis failed (timeout): +0 points
- Crisis partial: +0.5 points

### End Screen

**Triggers**: After 3000 ticks total OR both crises resolved + 60s.

**Elements:**
1. City screenshot captured from DOM
2. **Star rating** (1-3):
   - ⭐ Placed minimum buildings + made 5+ graph connections
   - ⭐ Accepted 2+ AI optimizations
   - ⭐ Handled 2/2 crises successfully
3. **Tech Badge**:
   ```
   🏆 AI CITY BUILDER
   ✓ Resource Allocation
   ✓ Systems Planning
   ✓ Crisis Management
   ```
4. Stats: Buildings placed, tokens spent, optimizations accepted, crises handled
5. Nova summary: "You built a smart city with power, water, transport, health, and waste systems!"
6. Buttons: "Build Again" / "Export Screenshot"

## Nova Intents (P3-P4)

```js
const INTENTS = [
  { id: 'help', patterns: [/help/i, /how.*play/i], responses: [
    'Place buildings on the grid to build a smart city! Each building costs tokens. Connect them with knowledge graph relationships to optimize.'
  ]},
  { id: 'tokens', patterns: [/token/i, /budget/i, /cost/i], responses: [
    'You have 100 tokens. Each building costs a different amount. Power sources cost 6-8, hospitals cost 15. Spend wisely!'
  ]},
  { id: 'scan', patterns: [/scan/i, /hazard/i, /underground/i], responses: [
    'Toggle Scan Mode to look under the ground. Normal mode is accurate but slow. Turbo mode is fast but the charts are blurry!'
  ]},
  { id: 'slider_help', patterns: [/slider/i, /configure/i, /setting/i], responses: [
    'Tap a building to open its settings. Bus frequency changes how often buses come. Staff allocation affects hospital speed.'
  ]},
  { id: 'graph', patterns: [/graph/i, /connect/i, /relation/i, /cause/i], responses: [
    'Drag labels between buildings in the Knowledge Graph to show how they affect each other. "Hospital needs Power" — that is a relationship!'
  ]},
  { id: 'crisis', patterns: [/heatwave/i, /flood/i, /crisis/i, /emergency/i], responses: [
    'Crises test your city! Heatwave means power and health strain. Flood means blocked roads and leaks. Adjust sliders quickly to respond!'
  ]},
  { id: 'sentiment', patterns: [/happy/i, /sad/i, /citizen/i, /people/i], responses: [
    'Citizens are happy when they have power, water, transport, and health services nearby. Check the Sentiment bar on the dashboard!'
  ]},
  { id: 'encourage', patterns: [/good/i, /nice/i, /great/i, /well done/i], responses: [
    'Your city is coming together nicely! Keep going!',
    'Great choices! The citizens will benefit from this.',
    'You are thinking like a real city planner!'
  ]}
];
```

## Simulation Engine Design

The simulation runs as a tick-based loop:

```js
// In simulation.js, called by main.js requestAnimationFrame loop
function tick(deltaMs) {
  const speed = state.simulation.speed;
  let ticks = Math.floor(deltaMs / (1000 / 60)) * speed; // 60 tick/s base

  for (let i = 0; i < Math.min(ticks, 10); i++) { // cap per frame
    updateAgents();
    updateSystems();
    checkEvents();
    state.simulation.time++;
  }
  render();
}
```

Systems update each tick:
- `power.supply` = sum of `provides.energy` from built power buildings
- `power.demand` = sum of building base demand + crisis modifier
- `power.health` = clamp(100 × supply / demand, 0, 100)
- `health.capacity` = sum of hospital/clinic capacities × staff multiplier
- `health.demand` = building count × 3 + crisis modifier
- `health.sentiment` = weighted average of all system healths
- etc.

Crisis events are checked every 60 ticks:
```js
function checkEvents() {
  const t = state.simulation.time;
  if (t === 600 && !state.crisisTriggered.heatwave) triggerHeatwave();
  if (t === 1200 && !state.crisisTriggered.flood && state.crisisHandled.heatwave) triggerFlood();
}
```

## Phase Transition Conditions (Exact)

```
Phase 1 → Phase 2 fires when:
  count(buildings where system='power' and provides.energy) >= 1
  AND count(buildings where system='water') >= 1
  AND count(buildings where system='transport') >= 1
  AND count(buildings where system='health') >= 1
  AND count(buildings where system='waste') >= 1
  AND count(roads) >= 3
  AND state.spent >= 25

Phase 2 → Phase 3 fires when:
  knowledgeGraph.edges.length >= 5
  AND all 3 scenarios completed (tracked by scenarioFlags)

Phase 3 → End fires when:
  state.simulation.time >= 3000
  OR (both crises handled AND state.simulation.time > crisisEndTime + 600)
```

## Key Implementation Notes

1. **Knowledge graph is NOT a free-form canvas**. It's a guided connection-matching UI. Pre-placed nodes from Phase 1 buildings. Student selects a source node, then a target node, then picks a relationship label from a dropdown. SVG draws the arrow.
2. **Citizens teleport-fade**, they don't walk. Buses and trucks do move smoothly.
3. **All simulation agents are DOM elements** (not Canvas). Performance limit: 15 agents.
4. **Dashboard updates every 500ms** (not every frame). Use a throttle timer.
5. **Crisis UI**: Overlay at top of screen with crisis name, time remaining, and action buttons/sliders. Not a full-screen modal — student can still see the city.
6. **Slider changes during simulation**: Sliders remain accessible. Changes apply immediately to system values (next tick recomputes).
7. **Needs at least one road between related buildings** for transport simulation to work (buses need paths). Roads are simple tile-to-tile connections.
