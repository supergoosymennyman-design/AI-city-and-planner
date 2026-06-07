---
lesson: <NN as integer>
track: primary
title: <Lesson title>
ageBand: <e.g. P5-P6>
bigIdea: <integer 1-5>
aiRepresentation: <real-model | rule-based | remix | remote-real — be honest>
smeReviewed: false
reviewer: ''
owner: ''
---

# Lesson <NN> — <Title>

> Extracted from `source/primary/<band>-<NN>-<slug>/<source file>`.
> Stage 1 is faithful to the designer's flow; Stage 2 is the build enrichment. Primary games are
> 2D-sim "AI City Architect" lessons — deterministic, and lessons 18–20 merge earlier games into
> one authoritative City. This is the authoritative brief + input to /build-game.

<!-- ============================ STAGE 1 — FAITHFUL EXTRACTION ============================ -->
<!-- Copy from the source. Do not invent. Mark anything absent as "(not in source)". -->

## Lesson framing (designer's words)
<The designer's explanation / goal for this lesson, lightly tidied.>

## Lesson flow (the designer's script)
<The activity beats as written: the scenario, what the learner does, what the AI/sim does, the
intended "aha". Keep the designer's structure and any timings.>

## Teacher / facilitation notes (from the source, if any)
<Any guidance the designer included, or "(not in source)".>

<!-- ============================ STAGE 2 — BUILD ENRICHMENT ============================ -->
<!-- Design decisions that turn the flow into a buildable, deterministic sim. Use valid enums. -->

## The AI truth (core mechanic — do NOT soften)
<The honest mechanic and which AI4K12 Big Idea it makes visible. What does the AI/sim actually
compute, and what misconception does the design avoid?>

## Interaction design (what the app actually does)
<What is on screen, what the learner manipulates, how the sim responds, the goal/win. Enough
that a developer knows what to build.>

## AI capability & representation
- **Capabilities:** <list from the Capability enum>
- **aiRepresentation:** <one enum value> — <why this is honest for the impl>

## Deterministic sim state (CITY CONTRACT — golden rule #7)
<The sim must be reproducible. Specify:>
- **State:** <the key sim variables, in fixed-point milli-units — NO floats persisted>
- **Seed / rng:** <how randomness is seeded; there is NO `Math.random` in sim code>
- **Tick:** <what advances per tick, and that the same seed+inputs → identical state>

## dependsOn (prior lessons — must be a DAG)
<Which earlier lessons' outputs/state this lesson consumes. Must not depend on a later lesson.
If none, write "none (introduces new state)".>

## City contribution (the merge — lessons 18–20)
<When you reference the namespaced state slice, write the CONCRETE game id, e.g.
`ext['designing-the-ai-city']` — never angle-bracket placeholder notation like `ext['<id>']`.>
- **Subsystem/state added to the merged City:** <what this lesson contributes>
- **Live-scale behavior:** <how it behaves at 1×–1000× live, and beyond via precomputed
  fast-forward>

## Win / fail / progress
- **Success state:** <what success looks like>
- **Failure / retry design:** <how the learner recovers; keep it constructive>

## Inputs & two-channel accessibility (golden rule #6)
- **Instruction channels:** <≥2 of audio | visual | symbol> — <how each is delivered>
- **Input channels:** <≥2 of tap | voice | camera | keyboard | switch, incl. tap> — <how>
- **Per-action redundancy:** <each core action reachable ≥2 ways; tap always present>

## UX & design-standard binding
This game follows the primary UI/UX standard — `docs/standards/ui-ux-common.md` + `docs/standards/primary-ui-ux.md` — for visual
identity, touch targets, motion/flash safety, colour-blind-safe cues, and (for the Canvas City)
the Parallel-DOM + keyboard/switch requirement. Do **not** invent colours/fonts/sizes; they come
from `@edu/ui` tokens.
- **Components:** built from `@edu/ui`; Canvas interactions have an accessible DOM mirror.
- **Lesson-specific UX:** <notable feel/pacing for THIS lesson — e.g. how the sim's state reads
  at a glance, how a colour-blind child distinguishes districts, drag-vs-tap for placement.>

## Accessibility scope (honest)
<Inherent limits + mitigations, or "Fully operable via tap + audio + visual.">

## Learning objective
<One sentence.>

## Observable success criteria
- <observable criterion 1>
- <observable criterion 2>
- <concept-check criterion>

## Common misconception this game must NOT reinforce
<The wrong idea to avoid.>
