# Tool Integration Map — how the Passiona apps interact

Single source of truth for what is WIRED vs NOT across the Passiona tools (P5 focus).
"Ours" = this repo's code (`buddy-kit/client`, worker, deploy). The Workshop, Fit
Studio and the Rigger live on separate origins/teams. Last updated 2026-09.

## The tools

| Tool | Role | Where it lives | Status |
|---|---|---|---|
| **AI Workshop** | dataflow ML instrument — *the brain* | `workshop.ai-education.workers.dev` (external team) | built; capability export NOT wired (see below) |
| **2D Planner** | design the city (buildings/roads/parks + score + hill-climb optimise) | `/planner/` on p5-city-sim (ours) | ✅ built |
| **3D AI City** | walkable city, missions, champion, prop library | `/city-builder/` on p5-city-sim (ours) | ✅ built |
| **Fit Studio** | dress pre-made gear onto the base champion, bake + export GLB | `p5-fit-studio.*.workers.dev` (separate) | built |
| **Rigger ("3D Studio")** | build a creature from primitives → auto-rig skeleton → procedural gaits → export | `floral-bread-9885.prestonip005.workers.dev` (separate) | built (will integrate with Fit Studio) |
| **Coding Buddy** | chat agent; 7 verbs; "Do it" approval card | same-origin widget inside city/planner (ours) | built |
| **Champion** | the robot/creature the child authors | lives in the 3D city | built |

## Inter-app links

| Link | Promise | Actual state (verified 2026-09) |
|---|---|---|
| **Planner → City** | layout becomes the 3D city | ✅ WIRED — same origin, `localStorage` handoff, auto-load on `?from=planner`. No file round-trip. |
| **Pregame → Planner** | Academy unlocks the planner | ✅ WIRED — same-origin flag `p5_planner_unlocked`. |
| **Champion File / cloud** | "everything lives in the Champion File"; restore on any device | ✅ WIRED (ours) — one bundled JSON (layout+quests+props+skin+flags), named download, KV-backed cloud codes `NOVA-XXXXXX` (`/api/save`, `/api/load`). |
| **Workshop → City** | a built capability "plants" into the city and governs it | ⚠️ NOT WIRED — Workshop emits no capability JSON; the browser city runs baked-in quests (old p5-01 recycle-eye), not Workshop models. The `PLATFORM-BLUEPRINT.md` `ICapability` contract is frozen but targets a FUTURE Unity platform, not the browser city. |
| **Fit Studio / Rigger → City** | your champion appears in the city | ⚠️ CROSS-ORIGIN FILE ROUND-TRIP — export a ~26–42 MB static-bake GLB, shrink it (city cap ~30 MB), re-upload in the city entry ("Upload your fitted champion"). Works; heavy. Fit Studio + Rigger are planned to be integrated into one "author your champion" tool. |
| **Coding Buddy ↔ Workshop** | the agent supervises/verifies builds | ⚠️ NOT WIRED — Buddy's 7 verbs (`setParam/createGroup/addItems/removeItems/runCheck/undoLast/rememberUser`) were built for the OLD label-a-classifier paradigm (`logic/projects/recycle-eye.js`); they cannot express Workshop dataflow (split/evaluate/read-gap/cascade). |

## Identity — three AI presences (decided 2026-09)

- **Champion** = the creature the child builds/dresses/animates (in Fit Studio + Rigger). NOT a chat agent.
- **Coding Buddy** = the chat agent (7 verbs, approval cards). Persona says **"your Coding Buddy"** — code identity renamed away from "Champion, your AI robot" across `city-builder/buddy.js`, `shared/scenario-buddy.js`, `champion-city/buddy-bridge.js` (was previously mislabelled "Champion"; the old "keep it Champion, NEVER coding buddy" guidance in SIM_AGENT_PROMPT.md is superseded).
- **Workshop coach** = reads a child's Workshop machine, explains it / changes it (the one optional networked feature in the Workshop brief). Separate character question still open (does it share the Coding Buddy identity?).

The chat widget must never claim to BE the Champion creature.

## Known structural gaps / risks (from the holistic review)

1. **Workshop→City "plant it" is the programme's spine and it is unwired.** Options: (a) full browser capability runtime + contract (correct long-term, needs Workshop-team coordination), (b) lightweight artifact bridge (Workshop exports trained-model JSON the city loads as a planted building), (c) narrative plant now (build appears as a real labelled building; governance later). Recommendation: ship (c) soon, design toward (a).
2. **Same Workshop for P1 (5–6) and P5 (9–10).** The Workshop brief's age band is "upper primary and above"; there is no P1 simple-mode/template layer in the product yet. P1 lessons must be planned as teacher-pre-built, touch-one-part experiences until a template layer exists.
3. **Buddy verbs are the old paradigm** — need a v2 vocabulary to supervise Workshop builds (split/evaluate/diagnose).
4. **Data persistence is still fragmented** — the Champion File covers the city origin's keys; the Workshop saves its own file; Fit Studio keeps its own IndexedDB wardrobe. One "Passiona save" is the eventual goal.
5. **The 3D city's quest AI is baked-in old p5-01 content**, not tied to the child's actual builds (see #1).

## Architecture notes (for agents)

- Planner + pregame + city-builder share ONE origin (p5-city-sim) so `localStorage` is shared; `deploy/city-sim/planner` + `pregame` are the same-origin apps; the old `p5-planner`/`p5-pregame` workers are redirect stubs.
- Champion File module: `buddy-kit/client/city-common/champion-file.js` (`collectState`/`writeState`/`composeChampionFile`/`sanitizeChampionFile`/`championFilename`/`rememberSavedAt`/`lastSavedAt`).
- Cloud save/load: worker endpoints `/api/save` + `/api/load` in `buddy-kit/worker/index.mjs`, KV binding `SAVES` (namespace id in `deploy/city-sim/cloudflare/wrangler.jsonc`).
- Save UI: planner toolbar "💾 Save my city" + city-builder entry overlay/HUD ("💾 Save my city", "☁️ Save to cloud", "☁️ Open from cloud").
- Entry resume: city-builder entry shows "↩ Last saved: …" from `p5_city_saved_at_v1` (set by every save action).

## Ownership table (who builds what)

| Piece | Owner | Contract / handoff |
|---|---|---|
| 2D Planner, 3D AI City, Coding Buddy widget, Champion File + cloud, badges | **Us** (this repo) | — |
| AI Workshop (dataflow ML kit, export side) | **External Workshop team** | `.cap` bundle export → see `capability-bridge.md` (LIVING DRAFT, for joint review) |
| Fit Studio + Rigger (champion authoring, export side) | **External team** | `.champ` recipe + shared asset library → see §Contracts below |
| Champion primitives/gear CC0 library | **Us** (host + stable IDs) | the shared library both sides reference |

## Contracts added (2026-09)

1. **`.cap` — Capability Bundle** (`docs/capability-bridge.md`). Workshop exports an
   immutable, versioned, DATA-ONLY JSON bundle; the City runs it with its OWN
   independent runtime. V1 = single JSON (base64 buffers), numeric k-NN classifier
   first, `selftest` enforced before any live mount, evidence index + decision log,
   three-stage rollout with explicit cut lines. The City never fakes what the model
   did.
2. **`.champ` — Champion recipe** (planned). The champion authoring tools export a
   tiny recipe JSON (base + rig + gait + sockets + gear ids) instead of a heavy
   GLB; the City rebuilds the creature from the SHARED primitive/gear asset
   library (stable ids, hosted in our CC0 library). Premade gear = a small id; the
   custom Hunyuan path = the heavy GLB travels (or gets "checked in" to the shared
   library once). Stage-1 city loader = static assembly; rig/gaits later.

## Champion authoring design (adopted 2026-09, from consultation)

- One tool, two sequential modes: **"The Lab"** (build from primitives, rig,
  tag body parts) → **"GEAR UP"** → **"The Armory"** (snap premade gear onto the
  tagged sockets; a **Custom Forge** for the Hunyuan hardcore path).
- Champion behaviour in the city = "Golden Retriever": presence + reaction,
  never authority (follows, head-tracks, whirrs/chirps, `?`/`!` emotes). The
  champion never says "your model is good" — only evidence does.
- Two-stream accessories: **premade gear** (programme-provided, all students) +
  **custom Hunyuan + Fit Studio/Rigger** (strong students, the hardcore path).

## Two axes — do not conflate

- **Badge tiers** (Builder → Skeptic → Auditor → Architect) = conceptual depth in
  the WORKSHOP: what the child can build and prove (`docs/badges-and-tiers.md`).
- **Bridge stages** (Stage 1/2/3 in `capability-bridge.md`) = what the CITY can
  honestly run.
A child can be an "Architect" in the Workshop while the City is still at Stage 1.
Badges recognise the first axis; the bridge serves the second.

## Badges (see `docs/badges-and-tiers.md`)

Retroactive diploma, never a gate. Evidence Protocol (badge embeds held-out score,
threshold, split). Display = small tier emblem in the City HUD corner (PUBG-style),
tap → Inspector's Logbook; transferable in the Champion File. Award engine deferred
until `.cap` evidence flows; MVP shows the lowest tier.
