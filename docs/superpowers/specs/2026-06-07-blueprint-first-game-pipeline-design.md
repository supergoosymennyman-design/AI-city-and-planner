# Design — Blueprint-First Game Development Pipeline

> Status: **approved** (design phase) · Date: 2026-06-07 · Author: Edward + Claude
> Next: implementation plan (writing-plans). This spec defines the **meta-layer** — the
> workflow, the shared skill, and the subagent architecture — not any individual game.

## Problem

Today's flow is **template-first**: `game-scaffolder` clones the reference game
(`color-the-rainbow`) and the developer tweaks it. This bakes one game's mechanic into every
game, and starts coding before the lesson is actually understood.

We want to invert it to **blueprint-first**: development starts from the course designer's
detailed lesson flow (e.g. `source/Kindergarten/This is how the Kindergarten games should
work.docx`). That flow is the **blueprint** — it must exist before any code — and the game is
built *from it*, composing shared building blocks, never cloning another game. The subagent
structure is redesigned so one command can take an approved blueprint to a CI-green, reviewed,
production-ready game with only two human gates.

## Decisions (from brainstorming)

1. **Blueprint = two-stage chain.** The designer's source is non-technical and authoritative;
   we cannot expect it to be buildable as-is. A **shared skill** enriches it into a buildable
   blueprint. The skill must be followable by **even a weaker model** (rigor lives in the
   structure, not the model's judgment) and must handle **both tracks** (kindergarten,
   primary).
2. **Two human gates.** Human approves the enriched blueprint (before code) and does final
   SME/pedagogy + playtest sign-off (after build + CI green). Autonomous in between.
   "Production-ready" = passes all automated gates **and** awaits human SME sign-off.
3. **Not from template.** No reference game is ever cloned. Standardization comes from two
   forces instead: **`@edu/*` building blocks** (the recurring functions, like the `source/`
   toolbox) and **reviewer agents** (UI/UX, contract, pedagogy). Games are composed bespoke.
4. **One orchestrator command** (`/build-game`) with **optional human-intervention points** on
   top of the two hard gates.
5. **Lean + track-aware decomposition** (chosen over fully-split and maximally-lean): KG uses a
   single builder; primary splits architect/implementer because sim games join the
   deterministic City.
6. **Refine, don't redo, the existing agents:** three of four survive with light edits; only
   `game-scaffolder` (clone-the-template) is retired.
7. **Source intake is a per-game folder the developer fills first** — any format
   (`.docx`/`.md`/`.pdf`) — and its presence is a hard precondition (Gate 0).

## Document chain

Each artifact gates the next. Artifact 0 already exists for the current curriculum; the bridge
from "teaching script" to "buildable game" is made explicit and skill-driven.

| # | Artifact | Format | Made by | Location |
|---|----------|--------|---------|----------|
| 0 | **Designer source intake** — dropped in *first* by the developer | `.docx`/`.md`/`.pdf` (any) | course designer | `source/<track>/<NN-slug>/` (one folder per game) |
| 1 | **Lesson brief** — faithful extraction (Simple AI explanation, 25-min Part A/B/C script, AI lines, teacher tips) | `.md` | `blueprint` skill, Stage 1 | `docs/curriculum/<track>-NN-<slug>.md` (+ `lessons.json` registry) |
| 2 | **Game blueprint** — enriched, buildable (interaction design, capability/ML, win/fail, a11y scope, misconception, success criteria) | `.md` (same file, enriched sections) | `blueprint` skill, Stage 2 | same file — **Human Gate 1** |
| 3 | **Game implementation** — bespoke, composed from `@edu/*` blocks | code | builder / architect+implementer | `games/<track>/<id>/` |

`docs/curriculum/kindergarten-03-color-the-rainbow.md` is the worked example of a Stage-2
blueprint (it already contains the enrichment: teachable-machine truth, a11y scope, success
criteria, banned misconception).

## The shared `blueprint` skill (centerpiece)

A **rigid, checklist-driven** skill — fill-in-the-slots with validation, not "use judgment" —
so a weaker model can't drift. Two track templates:

- **Kindergarten template** (teachable-machine framing). Required slots:
  - On-screen behavior: *what does the AI literally show/do?*
  - **Capability** from the `Capability` enum (voice / camera-recognition / joints / draw).
  - **Teachable-machine truth** + the **misconception to NOT reinforce**.
  - For each Part A/B/C action: the **two a11y channels** (tap always present).
  - Win/fail states + **observable success criteria**.
  - Honest `aiRepresentation` (must match the planned impl).
- **Primary template** (AI City Architect framing). Adds:
  - Deterministic sim state (fixed-point milli-units, seeded rng).
  - `dependsOn` inputs from prior lessons (DAG).
  - Contribution to the merged City (lessons 18–20) and live-scale behavior.

**Stage 1 (extract):** parse the intake file(s) → faithful lesson brief (no invention).
**Stage 2 (enrich):** fill the track template's slots from the brief.
**Self-check before "done":** every slot filled, capability ∈ enum, every action two-channel,
`aiRepresentation` honest, success criteria observable. The structure carries the rigor.

## Subagent roster

Defined once and mirrored by the existing `scripts/sync-agents.mjs` → `.claude/agents` +
`.opencode/agent`.

**Keep & lightly refine (3):**
- `contract-reviewer` — refine: pedagogy fields must trace to the **blueprint chain** (not just
  a curriculum file).
- `kid-ux-reviewer` — refine: also verify the game **composes `@edu/ui` blocks**
  (standardization-via-blocks), not only that it uses tokens.
- `core-guardian` — keep as-is; more relevant now that games compose shared blocks.

**Retire / replace (1):**
- `game-scaffolder` (clone-the-reference-template) — **retired**. Its only surviving kernel
  (emit an inert, contract-conformant shell) folds into the builder. No game is ever cloned.

**New (6):**
- `blueprint-author` — runs the `blueprint` skill (Stages 1–2).
- `game-builder` — **KG**: designs *and* implements bespoke from the blueprint, composing
  `@edu/*` blocks and scaffolding its own inert shell.
- `game-architect` + `game-implementer` — **primary only**: split because sim games join the
  deterministic City (architect produces the tech plan; implementer writes code).
- `pedagogy-reviewer` — automated pre-check feeding Human Gate 2: does the game teach the
  lesson's concept, avoid the banned misconception, and is `aiRepresentation` honest vs. the
  blueprint?
- `verifier` — runs `npm run validate` + Playwright tablet-viewport smoke + axe a11y; emits the
  "CI-green" signal.

## Orchestrator pipeline (`/build-game <track> <lesson>`)

```
Gate 0  ── source intake present & non-empty? ──(no)──▶ STOP:
   │ yes                                              "drop the designer doc in source/<track>/<NN-slug>/ first"
   ▼
[blueprint-author] Stage 1 extract → Stage 2 enrich   (blueprint skill)
   ▼
★ Gate 1 (HUMAN) ── approve blueprint ──────────────────────────────┐
   │ approved                                          (optional --checkpoint pauses
   ▼                                                    before/after any phase)
KG:  [game-builder]            Primary: [game-architect] → [game-implementer]
   ▼
[reviewers, parallel]  contract · kid-ux · core-guardian · pedagogy
   ▼
[verifier]  npm run validate + Playwright tablet smoke + axe
   ▼
green? ──(no)──▶ fix loop: feed failures back to builder/implementer ──┐ (bounded retries)
   │ yes                                                                │
   ▼ ◀──────────────────────────────────────────────────────────────────┘
★ Gate 2 (HUMAN) ── SME/pedagogy + playtest sign-off ──▶ PRODUCTION-READY (open PR)
```

- **Gate 0 (hard precondition):** literal "we must have it before we can start."
- **Human-intervention options:** `--checkpoint=blueprint,design,review` opts into a pause after
  any named phase, on top of the two hard gates. Default run pauses only at Gate 0/1/2.
- **Bounded fix loop:** after N rounds (default to a small number) without green, escalate to the
  human rather than looping forever; report what failed.

## Standardization model (no template)

Consistency comes from two forces, never from cloning:
1. **`@edu/*` building blocks** — the recurring functions (port `source/toolbox/
   {conversation,joints,recognition}.js` into typed packages `@edu/toolbox`/`@edu/ai`, plus
   `@edu/ui` crayon standard). The builder *composes* these.
2. **Reviewer agents** — enforce UI/UX, contract, and pedagogy standards on the bespoke result.

## Scope

**In scope (this spec produces):** the `blueprint` skill (KG + primary templates), the
`/build-game` orchestrator + Gate 0 + `--checkpoint` model + bounded fix loop, the 6 new + 3
refined agents (retiring `game-scaffolder`), the `source/<track>/<NN-slug>/` intake convention,
and the document chain + `lessons.json` registry.

**Out of scope (declared dependencies, tracked in PROGRESS):** building any individual game; the
`@edu/toolbox`/`@edu/ai` port of `source/toolbox`; `@edu/ui` expansion; Playwright/axe test
infra wiring (R1). The pipeline *enables* these; it does not deliver them.

## Open questions / defaults to confirm in planning

- Exact `lessons.json` schema and whether the registry generation is part of the `blueprint`
  skill or a separate `scripts/` step.
- Fix-loop retry count and escalation message format.
- Whether `game-architect`/`game-implementer` for primary should themselves be split into the
  sim vs. view concern, or remain one architect + one implementer.
