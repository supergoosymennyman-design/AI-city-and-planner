# Champion Recipe — the `.champ` contract (Authoring tools → AI City)

**Status:** DRAFT v0.1 — handoff to the Fit Studio + Rigger team.
**Owner (this repo):** the City's recipe parser + shared asset library.
**Fit Studio + Rigger team:** implements the EXPORT side (the authoring UI).

Same shape as the `.cap` contract (`capability-bridge.md`): the authoring tools
export a tiny **recipe** — not a heavy baked GLB — and the City rebuilds the
creature from a SHARED primitive/gear library. "Send the recipe, not the cake."

## Why

Exporting a ~26–42 MB static GLB for every champion tweak destroys school-tablet
storage and patience. A `.champ` recipe is a few KB and keeps the rig + procedural
gaits (a living companion, not a statue).

## The recipe (v1)

```jsonc
{
  "magic": "passiona.champion",
  "specVersion": 1,
  "name": "Boxy",
  "parts": [
    { "id": "body", "shape": "box",  "w": 0.6, "h": 0.7, "d": 0.4, "x": 0, "y": 1.0, "z": 0 },
    { "id": "head", "shape": "box",  "w": 0.4, "h": 0.4, "d": 0.4, "x": 0, "y": 1.8, "z": 0 }
  ],
  "rig":  { "kind": "2-leg", "gait": "walk" },
  "gear": [ { "socket": "head", "item": "premade:helmet_04" } ]
}
```

- `parts` — primitives the City builds procedurally (box/sphere/capsule/cylinder/
  cone; no GLB needed for the base body). `w/h/d > 0`, `x/y/z` numbers.
- `rig.kind` — `2-leg` | `4-leg` | `skeletonized`; `rig.gait` — walk/trot/pace/
  gallop/run/idle (the Rigger's procedural gaits).
- `gear` — an array of `{ socket, item }`. **Premade** gear ids (`premade:*`) come
  from the SHARED library (hosted in our CC0 library with stable ids). **Custom**
  gear ids (anything not `premade:`) are the Hunyuan hardcore path — the recipe
  references them by id, and the custom GLB either travels once or gets "checked
  in" to the shared library so it becomes a stable id.

The City parser (`city-common/champ-recipe.js`) validates magic/version/parts/rig/
gear and summarises what it would build. The **3D assembler** (rebuilding the
creature from parts + rig + gait in the champion runtime) is the next step and
waits on the authoring tool's real export — no speculative 3D build yet.

## Rules

- The champion is IDENTITY, never authority: it never says "your model is good".
- Premade gear must exist in the shared library (unlisted `premade:*` ids are
  rejected) so the recipe is self-consistent.
- Two streams by design: premade gear for everyone; custom Hunyuan gear for the
  strong students who want the hardcore path.
- No PII: recipe ids are random or child-chosen handles.
