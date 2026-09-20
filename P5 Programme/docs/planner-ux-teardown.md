# P5 App UX Teardown — how the Planner, Academy and City feel to a 10-year-old

Status: Sprint 0 deliverable (2026-09). Subjective walkthrough from a child's seat,
read alongside `ai-concept-map.md` + `city-design-benchmark.md`. Written to steer
Sprints 1-2 UX work. All file paths relative to `P5 Programme/buddy-kit/client/`.

## 1. City Planning Academy (`city-pregame/`) — the gate to the Planner

**Journey today:** Intro (Nova) → 4 rooms (nav dots) → Graduation → download license →
planner unlocks. Four rooms teach weighted score, coverage radius, shortest path,
hill-climbing. A child on a fresh iPad lands here first (planner is locked).

**What works:**
- Strong story beats (Leash Garden, Ant Trail, Foggy Mountain) — each concept has a
  concrete, memorable image.
- Room 4 already teaches the local optimum honestly (the hiker stuck at 62, distant 80).
- Guaranteed completion: hint buttons + feedback; no dead ends.

**What feels thin (child's eye):**
- Room 3 (Dijkstra) shows three canned routes (120+100+180m…). The ant walks a chosen
  path but you never see the algorithm *explore and reject* alternatives — so it reads
  as "add the numbers", not "find the shortest path".
- Rooms are single-pass; no within-room checkpoints, so a child who misses the idea has
  nowhere to re-engage except the hint button.
- The four rooms are independent islands. Nothing says "you will use weighted score in
  the planner in exactly this way" at the moment it matters.
- Room 1 (weighted score) is *compute the total* — the child never feels what a weight
  IS. "Drag the weights and watch the total rebalance" would land it.
- Room 4 never connects "the planner gets stuck too" → so when Optimise stalls in the
  planner (local optimum), it's a confusing dead end rather than the taught moment.

## 2. City Planner (`city-planner/`) — the main surface

**Journey today:** tools (place/road/park/move) + drawer of buildings → tap map to place
→ score ring updates → goals modal (mayors / custom sliders) → receipt modal (weighted
breakdown) → "My move" (predict best change, reveal maths) → "Optimise" (hill-climb plan,
Apply/Keep review) → "View my city" → 3D.

**What works:**
- Genuinely deep: real algorithms, reviewable diffs, honest "may trade away a point"
  copy on zoning/trim moves.
- Coach modal on first run teaches the 4-step loop.
- Ranges / Homes / Walk views give three lenses onto the same city.

**What feels thin (child's eye):**
- Walk view colours homes by reach but never draws the *route* — the highest-value
  "the math is real" moment (a home is red → why? → here is the walk) never happens.
- The receipt explains the formula but is static text; changing a slider doesn't show
  the consequence until you close the modal and look again.
- "My move" proposes moves with reason chips — strong — but the Optimise step that
  follows often proposes many moves at once; the child taps Apply without reading why
  each was chosen. The per-move review is a wall of text.
- The drawer has 27 building types; nothing signals which are "mission/AI" (the specials)
  vs. ordinary facilities, and the specials' names claim AI without explaining it.

## 3. 3D AI City (`city-builder/` + `hong-kong-real/`) — the payoff

**Journey today:** entry → (from planner) auto-loads layout → walk the city → champion →
missions → external minigames.

**What works:** walking your own layout is the "train-set" payoff; the 3D city now renders
the plan 1:1 (no build-time resize/compression), so what you designed is what you walk.

**What feels thin (child's eye):**
- Nothing in the 3D world celebrates *why* this layout is good — the score/coverage/
  walkability you earned in 2D has no visible echo (no settled districts, no reach
  glow, no milestone).
- The sims (pedestrians/traffic/drones) move but don't narrate; a jam or a reroute has
  no "because your road network…" moment.
- Mission buildings with external minigames break the flow (leave the city); ones with
  `gameUrl:null` just sit there labelled "AI X".

## Concrete UX directives (for Sprints 1-2)

1. **Academy Room 3**: show the algorithm exploring — reveal candidate routes, reject
   longer ones, highlight the winner. Add a second beat where the *cheapest-looking*
   route is NOT the winner (straight line, no road).
2. **Academy Room 1**: make weights draggable (or steppable with big +/- buttons) and
   recompute the total live.
3. **Academy Room 4**: one extra beat — "the planner hits a small hill; try a big jump
   / restart to reach the taller peak" → seeds the Explore idea.
4. **Planner Walk view**: tap a home → draw its real Dijkstra path to the nearest
   missing need; red home + drawn route = the visible algorithm.
5. **Planner receipt/goals**: live re-weighting (change a slider → receipt rows update
   in place with a brief highlight).
6. **Planner Optimise**: when the hill-climb stalls at a local optimum, say so and offer
   Explore (Sprint 3); keep per-move review but make it skimmable (icon + one line each).
7. Keep everything ≥44px, reduced-motion safe, colour-blind safe, bilingual (zh-Hant/EN).
