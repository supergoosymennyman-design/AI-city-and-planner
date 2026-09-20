# BUILD: "AI City Architect" — P5-P6 (Ages 10-11)

**Read the shared conventions at `games/primary/CAPSTONE-SHARED-CONVENTIONS.md` first.**

## Game Concept

A deep systems-thinking simulation where students design a 15×15 smart city with 6 interactive systems, build a causal knowledge graph, handle cascading failures, and manage crises over simulated decades. Three phases, ~50 minutes.

**AI Narrative Arc**: Nova is an experienced AI city assistant. She knows the theory but needs the student to make real design decisions. As the city evolves, Nova learns from the student's choices and makes increasingly sophisticated predictions. By the simulation phase, Nova acts as a co-pilot — warning about cascading failures before they happen.

## Design System

Same dark dashboard theme as P3-P4 (slate-900 background) with these additions:

```css
:root {
  /* Additional system colors */
  --color-drones: #fb923c;
  --color-safety: #c084fc;
  --color-governance: #f472b6;
  --color-equity: #34d399;

  /* Crisis overlay */
  --color-crisis-heat: rgba(251, 146, 60, 0.15);
  --color-crisis-flood: rgba(56, 189, 248, 0.15);
  --color-crisis-cyber: rgba(192, 132, 252, 0.15);

  /* Simulation speeds */
  --speed-label-color: #94a3b8;

  /* Layer toggle active color */
  --layer-active: var(--color-primary);
}
```

## File Structure

```
index.html
style.css
game.js            — Core state, phase management
settings.js
transcript.js
audio.js
intents.js
conversation.js
city.js            — Grid, buildings, layers, subsurface, connections
simulation.js      — Agent simulation + time engine + crisis engine + cascading
knowledge-graph.js — Multi-node causal knowledge graph
visual-script.js   — Visual scripting editor (command blocks)
main.js            — UI controller
test/index.test.js
PLAN.md
README.md
```

13 files total. `city.js`, `simulation.js`, `knowledge-graph.js`, and `visual-script.js` are the non-standard additions. Simulation sub-systems are consolidated into one file (time engine + crises + cascading are all in `simulation.js`).

## Data Model

```js
const GRID_SIZE = 15;
const TOKEN_BUDGET = 150;

const SYSTEMS = ['power','water','transport','health','waste','governance'];

const BUILDING_DEFS = {
  // Power & Water
  solar:      { system:'power', label:'Solar Farm',     cost:8,  provides:{energy:5},    buildTime:1,  emoji:'☀️' },
  wind:       { system:'power', label:'Wind Turbine',   cost:6,  provides:{energy:3},    buildTime:1,  emoji:'🌬️' },
  hydro:      { system:'power', label:'Hydro Plant',    cost:12, provides:{energy:8},    buildTime:2,  emoji:'🌊' },
  battery:    { system:'power', label:'Battery Storage',cost:10, storage:20,              buildTime:1,  emoji:'🔋' },
  waterTower: { system:'water', label:'Water Tower',    cost:8,  provides:{water:10},     buildTime:1,  emoji:'💧' },
  dataCenter: { system:'power', label:'AI Data Center', cost:20, consumes:{energy:8}, compute:100, sliders:['Cooling'], buildTime:2, emoji:'🖥️' },
  cooling:    { system:'power', label:'Cooling System', cost:5,  type:'air|liquid|green', buildTime:1,  emoji:'❄️' },

  // Transport
  busStop:    { system:'transport', label:'Bus Stop',      cost:4,   sliders:['Frequency'], emoji:'🚏' },
  road:       { system:'transport', label:'Road Segment',  cost:2,                          emoji:'🛣️' },
  depot:      { system:'transport', label:'Bus Depot',     cost:6,                          emoji:'🏭' },
  dronePad:   { system:'transport', label:'Drone Pad',     cost:8,   script:null,           emoji:'🛸' },
  trafficLt:  { system:'transport', label:'Traffic Light', cost:3,   sliders:['GreenDuration'], emoji:'🚦' },
  bikeLane:   { system:'transport', label:'Bike Lane',     cost:2,                          emoji:'🚲' },

  // Health
  hospital:   { system:'health', label:'Hospital',        cost:20,  capacity:50,  buildTime:5,  sliders:['Staff'], emoji:'🏥' },
  clinic:     { system:'health', label:'Clinic',          cost:8,   capacity:10,  buildTime:1,                  emoji:'🩺' },
  greenSpace: { system:'health', label:'Green Space',     cost:3,   sentimentBoost:5,                          emoji:'🌳' },
  airPurifier:{ system:'health', label:'Air Purifier',    cost:5,   pollutionReduction:10,                    emoji:'💨' },

  // Waste
  recycling:  { system:'waste',  label:'Recycling Center',cost:6,   sliders:['Route'],                         emoji:'♻️' },
  collection: { system:'waste',  label:'Collection Point',cost:4,                                             emoji:'🗑️' },
  compost:    { system:'waste',  label:'Compost Facility',cost:5,                                             emoji:'🟫' },
  incinerator:{ system:'waste',  label:'Incinerator',     cost:8,   pollution:-5,                             emoji:'🔥' },

  // Governance
  townHall:   { system:'governance', label:'Town Hall',       cost:12, sliders:['TaxRate'],emoji:'🏛️' },
  aiAuditor:  { system:'governance', label:'AI Auditor Desk', cost:10,                    emoji:'📋' },
  school:     { system:'governance', label:'School',           cost:8,                    emoji:'📚' },
};

const state = {
  phase: 'design',    // intro | design | optimize | simulate | end
  activeLayer: 'all', // 'all' | 'power' | 'logistics' | 'social'
  grid: Array(15).fill().map(() => Array(15).fill(null)),
  hazards: [],         // 12 pre-placed
  scanned: {},         // { mode, result, chart }
  drillSamples: 3,     // Limited drill uses
  buildings: [],
  connections: [],     // [{ fromId, toId, type, layer }]

  tokens: { budget: 150, spent: 0 },
  buildingIdCounter: 0,
  configs: {},

  // Visual scripts (serialized)
  scripts: {
    drones: [],  // [{ dronePadId, blocks: [...] }]
    buses: []    // [{ depotId, blocks: [...] }]
  },

  // Phase 2
  knowledgeGraph: { nodes: [], edges: [] },
  optimizationsAccepted: 0,
  hiltScenarios: [],    // Human-in-the-loop scenarios
  hiltCompleted: 0,
  economics: {
    taxRate: 20, infraBudget: 30, gdp: 100, inflation: 2,
    debt: 0, approval: 75
  },

  // Phase 3
  simulation: {
    speed: 1,            // 1 | 1000 | 1000000
    time: 0,
    displayYear: 2025,
    agents: [],          // 50+ aggregate
    systems: {
      power:       { supply:0, demand:0, health:100, temperature:0 },
      water:       { supply:0, demand:0, health:100, leaks:[] },
      transport:   { coverage:0, avgSpeed:0, health:100, congestion:0 },
      health:      { capacity:0, demand:0, health:100, staffBurnout:0 },
      waste:       { collected:0, overflow:0, health:100 },
      governance:  { funding:0, services:0, health:100 }
    },
    eventLog: [],
    cascadeChain: [],    // Current active cascading failure
    activeCrisis: null,
    crisesEncountered: 0,
    crisesHandled: 0,
    population: 1000
  },

  score: { stars:0 },
  sessionId: Date.now()
};
```

## Phase 1: DESIGN (25 min)

### Grid
15×15 with terrain: River (winding, 2-wide) in NW-SE diagonal. Mountain cluster (3 tiles, impassable) in NW corner. Forest (4 tiles in SE, can build on but costs +2 per tile to clear).

### Layer Toggle
Three buttons at top: ⚡ Power & Utility | 🚚 Logistics & Waste | 👥 Social & Safety
- **Power & Utility** (yellow/blue): Shows grid connections, data lines, water mains, energy flow
- **Logistics & Waste** (purple/green): Shows bus routes, drone paths, collection loops
- **Social & Safety** (red/orange): Shows hospitals, schools, CCTV, citizen sentiment overlay
- "All" (default): Shows everything combined

Toggle changes which SVG connection lines and building overlays are visible. Grid and buildings always visible.

### Subsurface Scan (Advanced)
- **Unlimited scans** in Normal or Turbo mode (same as P3-P4)
- **3 Drill Samples**: Instant reveal of exact hazard type. Student must decide where to use them strategically.
- 12 hazards on grid
- When Turbo scan shows ambiguous chart:
  - Chart is a simple single-line SVG: squiggly shape over time (200×40px graph)
  - Sharp spike = hazard, flat/gentle curve = clear
  - Student must mouse/tap to next hazard and compare charts visually
- Drill: select tile → "Use Drill Sample" button → 2s animation → hazard revealed or confirmed clear
- Penalty for building on hazard: -10 tokens, building at 50% efficiency

### Building Placement
- Palette grouped by 6 systems, scrollable
- Place buildings costing tokens
- Hospitals show "5 ticks to build" (if placed during simulation phase they wouldn't be ready instantly — but for Phase 1, they place immediately)
- Data centers emit heat (affects nearby sentiment)
- Schools boost sentiment but cost upkeep

### Token Budget
- Start: 150 tokens
- Plus government finance: Tax Rate slider (10-30%) affects token income per tick in simulation
- Can't go into negative tokens — must remove or skip buildings

### Visual Scripting
For Drone Pad and Bus Depot placed buildings:

Tap placed drone pad → "Edit Script" button → opens **visual script editor** (bottom panel).

**Script format (serialized as JSON in state):**
```js
// Example: Delivery drone script
{
  blocks: [
    { type: 'trigger', id: 'obstacle_detected', label: 'Obstacle Detected' },
    { type: 'action',  id: 'fly_up',  label: 'Fly Up',     params: { meters: 5 } },
    { type: 'condition', id: 'if_clear', label: 'If Clear', children: [
      { type: 'action', id: 'resume', label: 'Resume Path', params: {} }
    ]},
    { type: 'action',  id: 'return', label: 'Return to Base', params: {} }
  ]
}
```

**Visual editor UI:**
- Palette of block types on left (scrollable): Triggers, Actions, Conditions, Loops
- Script area on right (vertical stack)
- Tap block in palette to add to end of script
- Drag blocks vertically to reorder
- Tap block in script to edit parameters (e.g., Fly Up → tap → "5 meters" → change to 8)
- Trash zone at bottom of editor: drag block here to delete

**Available blocks:**
| Type | Blocks |
|------|--------|
| Triggers | Obstacle Detected, At Destination, Battery < 20%, Time = Rush Hour |
| Actions | Fly Up N, Turn Left, Turn Right, Open Door, Close Door, Wait Ns, Resume Path, Return to Base, Deploy Extra |
| Conditions | If Clear, If Obstacle, If Passengers > N, If Battery > N |
| Loops | Repeat N Times |

Scripts affect agent behavior during simulation phase. If no script, agents use default behavior (simple loop between waypoints).

### Minimum Requirements (Design Phase Complete)
- At least 1 energy source
- At least 1 water source
- At least 1 transport element (bus stop or drone pad)
- At least 1 health building
- At least 1 waste building
- At least 1 governance building
- At least 5 road connections
- Total tokens spent >= 40

## Phase 2: OPTIMIZE (20 min)

### Knowledge Graph (Full Drag Interface)
Unlike P3-P4's guided matching, this is a **free-form node editor**:

- Canvas with SVG rendering
- Drag building-type nodes from a right sidebar onto canvas
- Tap source node → drag arrow to target node → choose relationship label from popup
- Labels: `needs` / `provides` / `consumes` / `produces` / `reduces` / `increases` / `near` / `far from`
- Add **strength**: tap edge → set weak/medium/strong slider
- Minimum 10 relationships
- Goal: identify one **feedback loop** (A→B→C→A)

**Layer coloring**: Nodes colored by system (yellow=power, blue=water, purple=transport, red=health, green=waste, pink=governance).

**Feedback loop detection**: When student creates a cycle, the cycle highlights with a glowing ring animation. Nova: "You found a feedback loop! More buses reduce traffic, which reduces pollution, which improves health, which increases population, which creates demand for more buses."

### AI Optimization
Button: "Run AI Analysis"
- AI finds 5 optimization opportunities
- Each shown as card: [Accept] [Dismiss] [Modify]
- Score: optimizations accepted

### Human-in-the-Loop Scenarios
3 scenarios, presented sequentially. Each requires a **decision with no perfect answer**:

1. **Clinic Closure**: "The AI proposes closing the East District Clinic to save 15 tokens per tick. This will affect 200 residents who will need to travel 15 minutes further."
   - [Accept] → save tokens, -10% sentiment in East district
   - [Override] → keep clinic, +15 token/tick drain
   - [Compromise] → downgrade to mobile clinic (saves 7 tokens, -3% sentiment)

2. **Routing Equity**: "The AI traffic optimizer is routing 70% of buses through the wealthy North district because it has wider roads. Other districts have 30% longer wait times."
   - [Let AI optimize] → max efficiency, -15% equity metric
   - [Force equal routing] → equal wait times, +10% congestion overall
   - [Partial rebalance] → 60/40 split, minor efficiency loss

3. **Secondary Jams**: "The AI cleared the main highway jam by diverting traffic to side streets. Now residential streets are congested."
   - [Maintain diversion] → highway clear, residents angry (-8% sentiment)
   - [Revert] → highway jams again, emergency vehicles delayed
   - [Smart timing] → adjust green lights on side streets to bleed off traffic gradually

Each decision updates the `economics` state and is logged for end-screen report.

### Economic Dashboard (Phase 2 sidebar)
```js
state.economics = {
  taxRate: 20,      // % slider (10-30)
  infraBudget: 30,  // % of tax revenue (10-50)
  gdp: 100,         // index starting at 100
  inflation: 2.0,   // % per tick
  debt: 0,          // can go negative (surplus)
  approval: 75      // 0-100
};
```

A small line graph (SVG, 300×100px) shows projected trends 5 ticks ahead (dotted line) when student moves a slider. Simulated using simple linear projection:
```
projected_gdp = gdp + (infraBudget * 0.2) - (inflation * 0.5)
projected_approval = approval + (sentiment - 50) * 0.1
```

## Phase 3: SIMULATE (20 min)

### Key Performance Requirement

This phase must maintain **30+ fps** on an entry-level tablet. Use **Canvas** (not DOM elements) for all agents. Use DOM for static elements (grid, buildings, dashboard).

### What Renders (Canvas layer)

| Layer | Content | Rendering |
|-------|---------|-----------|
| Grid | Tiles (grass, water, mountain) | Canvas fillRect |
| Buildings | Emoji/icon on building tiles | Canvas fillText (large font) |
| Connections | Roads, pipes, wires | Canvas stroke with dashes/colors |
| Agents (DOM) | Buses, trucks, citizens | Positioned `<div>` with CSS transform |
| Particles (Canvas) | Water flow, power pulsing | Small circles drawn on canvas overlay |
| Overlay | Crisis effects (shimmer, tint) | Canvas globalAlpha fillRect |

### Agents (DOM for interactivity, max 20 visible)

| Agent | Count | Sprite | Behavior |
|-------|-------|--------|----------|
| Citizen | 10-15 | 10px circle, random pastel color | Teleport-fade between buildings (same as P3-P4) |
| Bus | 2-4 | 16×10px yellow rectangle | Smooth path along roads between stops, follows script if exists |
| Drone | 1-3 | 12px orange diamond | Smooth path on drone routes, follows script if exists |
| Water particles | 8-12 | 3px blue dots | Flow along pipes, canvas-rendered |
| Power particles | 8-12 | 3px yellow dots | Pulse along wires, canvas-rendered |
| Waste truck | 1-2 | 16×10px green rectangle | Follow collection loop |

### Time Engine

`simulation.js` handles three speed modes:

| Speed | Label | Tick rate | What happens |
|-------|-------|-----------|-------------|
| 1× | 🔍 Real-Time | 60/s | Tap agents for details, inspect buildings |
| 1000× | 📅 One Day | 60/s × 1000 effective | Agent path animation is skipped — just aggregate stats update. Dashboard bars change every 500ms. Population ages by 1 day per tick. |
| 1,000,000× | 📊 Years | 60/s × 1,000,000 effective | All agent rendering paused. Dashboard updates every 1000ms. Population statistics shift. Property values change. Demographics age. Building icons show wear. |

**Speed transition**: When switching TO 1000× or 1,000,000×: 1s fade transition. Grid dims, agents fade out, dashboard becomes primary focus. Nova: "Fast-forwarding..."

When switching BACK to 1×: 1s fade transition. Agents reappear. Nova: "Back to real-time."

### System Interaction Model

Systems update every tick with simple formulas:

```js
function updateSystems() {
  const s = state.simulation.systems;

  // Power
  s.power.supply = sumBuildings(b => b.provides.energy) * efficiency(s.power.health);
  s.power.demand = countBuildings() * 0.5
    + (dataCenterExists ? 8 : 0)
    + (heatwaveActive ? s.power.demand * 0.4 : 0)
    + coolingPowerCost();
  s.power.health = clamp(100 * s.power.supply / s.power.demand, 0, 100);
  s.power.temperature = (s.power.supply > 0) ? s.power.demand / s.power.supply * 35 : 50;

  // Water
  s.water.supply = sumBuildings(b => b.provides.water) * efficiency(s.water.health);
  s.water.demand = countBuildings() * 0.8;
  s.water.leaks = floodActive ? [/* random tiles */] : [];
  s.water.health = clamp(100 * s.water.supply / s.water.demand, 0, 100);

  // Transport
  s.transport.coverage = bussesRunning() / demand * 100;
  s.transport.congestion = countTrafficLights() > 3 ? 20 : 50;
  s.transport.avgSpeed = 50 - s.transport.congestion * 0.5;
  s.transport.health = clamp(s.transport.coverage * (1 - s.transport.congestion/200), 0, 100);

  // Health
  s.health.capacity = sumBuildings(b => b.capacity || 0) * staffMultiplier();
  s.health.demand = state.simulation.population * 0.05 + (heatwaveActive ? 0.2 : 0);
  s.health.health = clamp(100 * s.health.capacity / s.health.demand, 0, 100);
  s.health.staffBurnout = staffBurnoutRate();

  // Waste
  s.waste.collected = collectionActive ? 80 : 20;
  s.waste.overflow = 100 - s.waste.collected - recyclingCapacity();
  s.waste.health = clamp(100 - s.waste.overflow, 0, 100);

  // Governance
  const taxIncome = countBuildings() * state.economics.taxRate * 0.5;
  s.governance.funding = taxIncome * state.economics.infraBudget / 100;
  s.governance.services = countBuildings() > 10 ? 80 : 40;
  s.governance.health = clamp(s.governance.funding / (countBuildings() * 0.5) * 50, 0, 100);

  // Sentiment (aggregate)
  const sentWeights = { power:0.2, water:0.2, transport:0.15, health:0.25, waste:0.1, governance:0.1 };
  let weightedSent = 0;
  for (const [k, v] of Object.entries(sentWeights)) {
    weightedSent += (s[k]?.health || 50) * v;
  }
  state.simulation.sentiment = Math.round(weightedSent);
}
```

### Cascading Failure Engine

When any system health drops below 20%, it triggers cascade:

```js
const CASCADE_RULES = {
  power: {
    healthBelow: 20,
    effects: [
      { target: 'transport', severity: 0.3, message: 'Traffic lights offline' },
      { target: 'health',    severity: 0.2, message: 'Hospital backup power engaged' },
      { target: 'water',     severity: 0.15, message: 'Pumps slowing' },
      { target: 'governance',severity: 0.25, message: 'Govt AI servers throttling' },
    ]
  },
  transport: {
    healthBelow: 20,
    effects: [
      { target: 'health',    severity: 0.15, message: 'Ambulances delayed' },
      { target: 'waste',     severity: 0.3,  message: 'Collections stalled' },
      { target: 'governance',severity: 0.1,  message: 'Staff commuting disrupted' },
    ]
  },
  water: {
    healthBelow: 20,
    effects: [
      { target: 'health',    severity: 0.25, message: 'Hygiene risk in hospitals' },
      { target: 'power',     severity: 0.1,  message: 'Hydro generation reduced' },
    ]
  },
  // ... etc for health, waste, governance
};
```

When cascade triggers: red warning pulse animation on affected system connection lines (SVG stroke-dashoffset animation). Dashboard health bar flashes red. Event added to log.

**Visual cascade**: SVG connection lines between buildings pulse red in sequence. Like a "wave" of failure propagating through the city. This uses `setTimeout` chaining:

```js
function animateCascade(path) {
  // path is array of connection IDs to animate in sequence
  path.forEach((connId, i) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-conn-id="${connId}"]`);
      if (el) el.classList.add('cascading');
    }, i * 300);
  });
}
```

### Black Swan Events (4 events, sequential)

Each event triggers based on simulation time. Each has a **setup**, a **crisis phase**, and a **resolution** condition.

**Event 1: Heatwave + Cyber Attack** (tick 1800 ≈ 30s at 1×)
- **Setup**: Overlay tints orange. Power demand +50%. Temperature overlay on data centers.
- **Crisis**: "Cyber anomaly detected on the grid! AI Data Centers are overheating!"
- **Resolution**: Multi-choice console:
  1. "Shutdown AI Image Generation" → reduces compute load 40%, no side effect
  2. "Shutdown AI Gaming Servers" → reduces compute load 30%, -5% sentiment
  3. "Reduce Hospital AI" → reduces compute load 20%, health -15%
  4. "Emergency Load Shedding" → cuts all non-essential, -10% sentiment but full power
  Student picks ONE. System adjusts accordingly.
- **Fail**: 90 ticks to choose. If timeout, cascading failure triggers (power → transport → health cascade).

**Event 2: Flood + Supply Chain Freeze** (tick 5400, if event 1 resolved)
- **Setup**: Overlay tints blue. 4 road tiles become water. Pipes break on flood tiles.
- **Crisis**: "Flooding across the East district! Roads blocked, supply routes cut!"
- **Resolution**: Three tabs:
  1. "Repair Pipes" — tap 4 leak icons on grid, each takes 3s
  2. "Reroute Buses" — tap each bus stop near flood, choose "Short Route" or "Long Route"
  3. "Emergency Supplies" — choose: Air drop (costs 8 tokens) or Ground convoy (takes 30s longer)
  Must complete all 3.
- **Fail**: 180 ticks. If timeout, waste builds up, health drops from floodwater contamination.

**Event 3: Economic Shock** (tick 10800, if events 1+2 resolved)
- **Setup**: No visual change, but dashboard shows GDP dropping, inflation spiking.
- **Crisis**: "Global supply chain freeze! Import costs up 300%! GDP dropping 5% per tick!"
- **Resolution**: 3 sliders:
  1. Income Tax Rate (10-40%, default 20%, affects GDP recovery)
  2. Infrastructure Budget (10-50% of revenue, default 30%, affects system health recovery)
  3. AI Auditor Intensity (0-100%, default 50%, affects fraud detection vs civil liberties)
  Student sets all 3. The game simulates 10 projections ticks and shows GDP/inflation/debt trajectory.
  If GDP < 50 after 10 ticks: sentiment drops to 20%. If debt > 200: austerity triggers automatically.
- **No fixed fail state** — there's no perfect answer. Score based on final GDP + sentiment balance.

**Event 4: Population Surge** (tick 18000, if events 1-3 resolved)
- **Setup**: Population meter starts climbing (+5/tick instead of +1)
- **Crisis**: "Massive population influx! Population: 1,450 (+45 from last tick!) All systems under strain!"
- **Resolution**: Build fast:
  - 3 Emergency Building slots appear above grid
  - Choose from: Emergency Clinic (instant, capacity 15), Temporary Housing (instant, +50 pop capacity), Mobile Water Unit (instant, +20 water)
  - Each costs 15 tokens from remaining budget
  - Must place all 3 within 60 ticks
- **Fail**: 60 ticks. If any slot unfilled, cascading failure: waste → health → governance.
  If all 3 filled, city stabilizes. Nova: "The city expanded! Crisis averted!"

### End Screen

**Triggers**: After Event 4 resolved OR total ticks > 25000 OR activeCrisis fails for 300 ticks.

**Elements:**
1. **City Evolution Timelapse**: Capture grid state at 5 checkpoints during simulation, compress into data URIs, then cycle through them (600ms per frame) — like a slideshow timelapse. 5 frames max to avoid memory issues.
2. **Tech Stack Summary Badge**:
   ```
   🏆 AI CITY ARCHITECT — MASTER TIER
   ✓ Multi-Agent Systems
   ✓ Causal Reasoning (X relationships mapped)
   ✓ Cascading Failure Management
   ✓ Human-in-the-Loop Oversight
   ✓ Economic Policy (GDP: X, Inflation: X%)
   ✓ Crisis Response (X/X events handled)
   ```
3. **Detailed Stats Grid**:
   | Metric | Value |
   |--------|-------|
   | Buildings placed | XX |
   | Tokens spent | XX/150 |
   | Graph connections | XX |
   | HILT decisions | X accepted |
   | Final GDP | X |
   | Peak population | X |
   | Crises handled | X/4 |
   | Stars | ⭐⭐⭐ |
4. Nova summary paragraph: auto-generated from template based on score (3 variations: Great/Good/Needs Work).
5. Buttons: "Build Again" / "Export Report" (downloads JSON of city stats)

## Phase Transition Conditions (Exact)

```
Phase 1 → Phase 2 fires when:
  count(buildings each system) >= 1   // all 6 systems have at least 1 building
  AND count(roads) >= 5
  AND spent >= 40

Phase 2 → Phase 3 fires when:
  knowledgeGraph.edges.length >= 10
  AND feedbackLoops.length >= 1
  AND hiltCompleted >= 3

Phase 3 → End fires when:
  simulation.time >= 25000
  OR (crisesHandled >= 4 AND latestCrisisTime + 600 < time)
```

## Nova Intents (P5-P6 — Advanced)

```js
const INTENTS = [
  { priority: 100, id: 'predictive',
    patterns: [/predict/i, /future/i, /forecast/i, /year/i, /trend/i],
    responses: [
      'Based on your current design, in 5 years the aging population in the East district will overwhelm your single hospital. Consider a second clinic there.',
      'Your power grid has 80% solar. That is great for emissions but on cloudy days you lose 60% capacity. Add wind or battery storage for resilience.',
      'Your tax rate of 20% generates enough revenue but your infra budget at 30% means slow growth. If GDP growth is a priority, raise one of these.'
    ]
  },
  { priority: 95, id: 'cascade',
    patterns: [/cascade/i, /chain/i, /ripple/i, /domino/i, /spread/i],
    responses: [
      'When power fails, traffic lights go out, causing jams, which delay ambulances. That is a cascade. Every system depends on every other system. Watch the red pulses on your map!'
    ]
  },
  { priority: 90, id: 'visual_script',
    patterns: [/script/i, /program/i, /block/i, /drone.*route/i, /bus.*logic/i],
    responses: [
      'Drag command blocks to build logic for your drones and buses. Start with a Trigger block, then add Actions. Use Conditions to make decisions. Use Loops to repeat.'
    ]
  },
  { priority: 85, id: 'override',
    patterns: [/override/i, /overrule/i, /disagree/i, /manual/i, /human/i],
    responses: [
      'You can override any AI decision. But there are trade-offs! Overriding the clinic closure saves services but costs tokens. Overriding routing equity may cause congestion somewhere else.',
      'Human-in-the-loop means you make the final call. The AI optimizes for one metric. You balance all of them.'
    ]
  },
  { priority: 80, id: 'equity',
    patterns: [/equity/i, /fair/i, /equal/i, /rich/i, /poor/i, /district/i],
    responses: [
      'AI optimizers naturally favor dense, wealthy areas because they have more data. Check the equity overlay on the map — red areas are underserved. You may need to redistribute resources manually.',
      'Fairness is not the same as equality. Sometimes poorer districts need more resources, not the same resources. The AI does not understand this. You do.'
    ]
  },
  { priority: 75, id: 'economics',
    patterns: [/gdp/i, /inflation/i, /debt/i, /tax/i, /budget/i, /economy/i],
    responses: [
      'GDP grows with infrastructure investment. Inflation rises with spending. Debt accumulates when spending exceeds tax revenue. The AI forecast shows dotted lines — use them to plan ahead.',
    ]
  },
  { priority: 70, id: 'crisis',
    patterns: [/heatwave/i, /flood/i, /cyber/i, /economic.*shock/i, /surge/i, /crisis/i, /emergency/i],
    responses: [
      'Crises cascade! A heatwave becomes a power crisis becomes a transport crisis becomes a health crisis. Act fast on the primary issue to prevent cascading.',
      'You have limited tools during a crisis. Use the emergency console. Every choice has a cost. Prioritize what matters most for YOUR city.'
    ]
  },
  { priority: 60, id: 'knowledge_graph',
    patterns: [/graph/i, /feedback.*loop/i, /cause/i, /effect/i, /relation/i],
    responses: [
      'Your knowledge graph maps how city systems interact. Look for feedback loops — cycles where A affects B and B affects A. Those are leverage points for optimization.'
    ]
  },
  { priority: 40, id: 'general',
    patterns: [/hello/i, /hi/i, /nova/i],
    responses: [
      'I am Nova, your AI City Architect co-pilot. I can analyze designs, predict trends, and warn about cascading failures. What would you like to explore?'
    ]
  }
];
```

## Key Implementation Notes

1. **Consolidate simulation complexity**: All sub-systems (time engine, crisis engine, cascading failures) live in `simulation.js`. This file is large (~600 lines) which is fine. Separate files would create too many cross-references that confuse the AI.

2. **Canvas for agents**: Use a `<canvas>` overlay for water and power particles (up to 24 particles). DOM `<div>` elements for larger agents (buses, trucks, citizens — max 20). This keeps the rendering manageable.

3. **Cascading animation**: SVG `stroke-dashoffset` animation on connection lines with `setTimeout` chain. Each connection flashes red for 500ms then returns to normal. No WebGL, no complex shaders.

4. **Time progression at 1,000,000×**: Agent rendering pauses. Dashboard updates every 1 second (not every tick). Just system math updates, no visual changes to agent positions. Building icons get a subtle CSS filter (`grayscale(0.2)` for "aging").

5. **Visual scripting is serialized JSON**, not a visual block language. The editor renders blocks from JSON, user edits modify the JSON, and the simulation reads the JSON. No complex compiler or interpreter needed.

6. **End screen timelapse**: Store 5 snapshots of building count + system health as data points during simulation. Replay as a simple bar chart animation. Do NOT capture actual screenshots during simulation (memory issues).

7. **Performance budget**: 30+ fps on 7th-gen iPad. If frame drops, reduce citizen count. If still slow, reduce particle rendering to once every 2 frames.

8. **Crisis events have time limits**: Each crisis ticks a `remaining` counter. If it hits 0, the crisis is considered "failed" and cascading effects intensify. Visual: countdown timer on the crisis overlay.

9. **Dialogues during crises use a modal decision UI**: Crisis overlay shows at top of screen (not full-screen - student can still see the city). Shows: crisis name, description, time remaining, and decision buttons/sliders.
