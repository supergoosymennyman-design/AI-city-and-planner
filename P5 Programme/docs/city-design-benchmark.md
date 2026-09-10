# City Design Benchmark — what we can learn from city games (and what we must not copy)

Status: Sprint 0 deliverable (2026-09). Input to Sprints 1-5.
Audience of our product: ~10-year-olds (P5), Hong Kong bilingual (zh-Hant/EN), school
iPads in a browser — no install, no hover, no right-click, ~2-minute classroom beats,
no fail states, no accounts/PII, deterministic seeded RNG, buildless ES modules,
anti-"AI-slop" visual style (no purple gradients / glassmorphism), CC0 assets only.

The city-building genre thrives on what designers call **"train-set satisfaction"** —
the visceral reward of defining a structure and then watching an autonomous system come
alive within your constraints. For a 10-year-old that satisfaction depends on **readable
feedback loops**: positive and negative feedback must be immediate and legible, pulling
the child into observe → hypothesise → adjust. We borrow these genre staples WITHOUT the
anti-patterns of mobile gaming: no Skinner-box repetition rewards, no attendance
stickers, no overfitter 100%-score traps (see `badges-and-tiers.md`).

## 1. What the greats do

| Game | Core engagement loop | Readable-feedback trick | Milestone pattern | What a 10yo feels |
|---|---|---|---|---|
| **Pocket City / SimCity BuildIt** | Short sessions, rapid placement, immediate resource response | Happiness bars, resource bubbles, large legible icons | Frequent level-up pop-ups, new building unlocks | "Things happen fast. My actions are instantly validated." |
| **Cities: Skylines** | Deep macroscopic sim with emergent agents | Colour-coded info views, traffic heatmaps | Population thresholds unlock services + density | "I'm running a complex machine — small changes ripple everywhere." |
| **SimCity 4** | Cultivating the environment to earn natural upgrades | Visual prosperity/decay + audio cues (sirens, cheers) | Organic low→high wealth growth to skyscrapers | "I set the stage; if conditions are right, greatness grows." |
| **Urbek** | Puzzle-like proximity building, emergent neighbourhood identity | Immediate visual snapping when a neighbour rule is satisfied | Distinct neighbourhoods transform by local synergy | "I'm discovering secret combos. The city mirrors my choices." |

The two models of city sim (macro-simulation vs agent-based) matter to us: agent sims
make every citizen "touchable" and legible but are chaotic to balance; macro sims hide
the process. **Our product is already a hybrid** — real algorithms (metrics, Dijkstra,
hill-climb) + light agent decoration (pedestrians/traffic/drones). The winning move is
to make the *algorithmic* layer the legible one.

## 2. What our P5 simulation is missing vs them

The engine is real, but its outputs are not rendered in ways a 10-year-old can read:

1. **No living feedback tied to the child's own choices.** Adjusting mayor weights
   changes planner metrics, but nothing in the flow celebrates or reflects *why*.
2. **Sim agents are not legible.** Pedestrians/traffic/drones exist but don't say why
   they delay, where they go, or how the child's layout affects their commute.
3. **The Dijkstra walkability graph is computed and never drawn.** The strongest
   "show the algorithm" asset we own is invisible.
4. **The greedy hill-climb visibly stalls.** Hitting a local optimum reads as a dead
   end instead of a lesson in algorithmic limits — unless we teach the limit and give
   an Explore escape (see ai-concept-map L3 + the optimizer sprint).
5. **"AI X" naming without visible AI.** 18 mission buildings wear AI labels but are
   static props; several minigames are `gameUrl:null`. See `ai-concept-map.md`.
6. **No milestones-as-recognition.** Nothing says "you balanced a district" or "every
   home can walk to a park" at the moment it happens.

## 3. Tablet constraints that change the answers

- No hover → everything is touch-first, immediately actionable, ≥44px targets.
- No right-click → one control vocabulary (drag = place, slider = tune, tap = select).
- Short classroom beats (~2 min rounds), autosave mid-lesson, resume after interruption.
- No fail states — poor planning = inefficiency, never "Game Over" (P5-LESSON-CONVENTIONS).
- No microtransactions / no artificial friction.
- **Deterministic seeded RNG**: same layout → same traffic every run, so a change the
  child makes measures *their choice*, not noise. Never break this for spectacle.
- Memory/asset caps on shared tablets: lazy-load, cap bundle sizes (~30MB city GLB cap).
- Reduced-motion media query: no flashing >3×/sec, animations off when requested.

## 4. Design principles we adopt (implementable, cited by later sprints)

1. **Readable feedback first.** Surface outcomes in the canvas/HUD — colour shifts,
   bubbles, glow trails — not buried in a modal. (Sprints 2 + 4.)
2. **Make the invisible graph visible.** Draw the Dijkstra walk path on the road network
   when a home is selected; animate the optimizer accepting/rejecting steps. The math
   must be a *seen thing*. (Sprints 2 + 3.)
3. **Milestones-as-recognition.** Retroactive, never gates: "First self-sufficient
   home", "Every home can walk to a park". Consistent with badges-and-tiers.md. (Sprint 5.)
4. **Cultivate-then-celebrate.** Place → see → upgrade. A district that satisfies its
   coverage/quiet goals visibly "settles" (a small jade flag / people appear), proving
   the environment was cultivated correctly. (Sprint 4.)
5. **Legible agent sim.** When traffic jams or a drone reroutes, show *why* in a tiny
   CC0 thought bubble / localized note tied to the child's roads. (Sprint 4.)
6. **Keep reviewability.** Never hide the math. Apply/Keep review of optimizer diffs
   stays the focal point — the AI is a collaborative tool, not a black box that
   overrides the child's agency. (Sprint 3.)
