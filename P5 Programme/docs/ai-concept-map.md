# AI Concept Map — where the P5 programme is genuinely AI (and where it is only named AI)

Status: Sprint 0 deliverable (2026-09). Canonical gap list for honest AI teaching.
Owner: P5 frontend (this repo). Cite this doc whenever a sprint touches the 18 mission
buildings, quests, the Hub, or the planner's AI surfaces.

## The spine (and where it is broken)

The programme's narrative: child learns an ML concept in the **AI Workshop** (external
dataflow kit) → exports a capability → **plants** it into their AI City. That spine is
UNWIRED (`tool-integration-map.md`: Workshop→City = NOT WIRED; `capability-bridge.md`
sits at Stage 1 narrative-plant, no live `.cap` runtime). Because of this we must be
scrupulously honest: much of what wears the "AI" label today is decoration, and the
genuine AI in our own codebase is under-shown. This doc is the audit.

## 1. Real AI today (our side, honest and teachable)

| Component | Underlying concept | Educational value |
|---|---|---|
| **Planner Optimizer** (`city-common/optimize.js`) | Greedy hill-climb search (measured, reviewable) | How algorithms step toward a goal; how they get stuck on local optima |
| **Walkability Engine** (`city-common/walkability.js`) | Dijkstra shortest path over the road graph | Pathfinding, graphs, cost weighting — computed but never drawn (see L2) |
| **City Metrics** (`city-common/metrics.js`) | Weighted objective function (+ mayor personas) | AI systems balance competing priorities; weights ARE the policy |
| **Academy recipes** (`city-pregame/`) | weighted score · coverage radius · shortest path · hill-climb | Explicit pre-teaching of the planner's building blocks |
| **City agents** (pedestrians/traffic/drones) | Deterministic agent behaviour / state machines | Decentralised sim logic — currently not legible |
| **Buddy widget** (`buddy.js` etc.) | 7-verb command/response | Conditional logic + state-driven UI (older paradigm; v2 vocabulary deferred) |

## 2. Named AI, not yet taught or shown (the illusion list)

| Asset / system | Current state | The problem |
|---|---|---|
| **18 "AI X" mission buildings** (catalog: `finance_tower` "AI Finance Tower", `traffic_lab` "Traffic Optimization Lab", `drone_routing` "Drone Routing AI", `bus` "AI Bus Scheduler", …) | Static labelled props; several quest `gameUrl: null`; most minigames are EXTERNAL links | "AI" prefix implies the building is doing AI a child can see/explain. It isn't (yet) |
| **Baked-in p5-01 quests** (`hong-kong-real/quests.js`) | Linear completion checklist framed as "AI missions" | Framed as AI, mechanically a fetch/visit checklist, detached from the child's planner work |
| **'Smart' generic facilities** (water/power/bus/recycling in metrics + templates) | Required-utility logic is real, but nothing shows it | The word "Smart" does the talking; the metric does the working invisibly |
| **Hub Scenarios accordion** | Four dead "SOON" cards | Placeholder promise of content that doesn't exist yet |

## 3. The honest ladder (our side only — no Workshop dependency)

The external Workshop team will eventually wire L4; we own L1-L3 TODAY.

- **L1 — Named-with-clear-concept.** A building keeps a specific, truthful label: it is
  either a *real* algorithm/story (and the text says which) or an honest plain label.
  Never "AI" as a decorative skin. When a mission building's minigame exists and teaches
  its lesson (e.g. drone routing → pathfinding), the label says exactly that.
  STATUS (2026-09): mission buildings whose minigame is NOT deployed yet show an honest
  "⏳" (no fake "play me" promise) in the 3D city; quest entry cards carry the real
  lesson title + one-line concept (`hong-kong-real/quests.js` `QUEST_THEMES`).
- **L2 — Visible algorithm.** Draw the math. Planner: render the Dijkstra path when a
  home is selected (Sprint 2). Optimizer: animate accepted/rejected steps + the
  local-optimum stall (Sprint 3). City: the 3D city shows the layout's walking reach /
  zoning as legible overlays (Sprint 4).
  STATUS (2026-09): Walk view draws each selected home's real road routes (green within
  budget, red when too far). The planner's City Score + chosen goals echo into the 3D
  entry overlay ("🌆 Planner AI: … score N").
- **L3 — Child-controlled AI.** Mayor weights already exist; expose an **Explore**
  strategy that shakes the optimizer out of a local optimum — the child sees that human
  oversight is needed when an algorithm gets stuck (Sprint 3; Academy Room 4 teaches the
  same idea first, Sprint 1).
  STATUS (2026-09): the Optimise plan modal offers Greedy vs Explore chips; Explore runs
  fresh-start restarts and keeps the best plan (never worse than Greedy). Academy Room 4
  teaches the escape before the planner ever meets it.
- **L4 — Planted capability.** Deferred until Workshop export flows (capability-bridge
  Stage 2). L1-L3 prepare the visual/mental model so L4 lands cleanly.

## 4. The golden rule (restated)

> Never let a child believe an "AI X" building is doing AI the child cannot see or
> explain. If the concept is Dijkstra, draw the path. If it's a greedy search, show the
> rejected moves. If we cannot visualise the algorithm, we do not claim it is running —
> we use a plain, honest label.

Mirrors `capability-bridge.md`: *the City never fakes what the model did.*
