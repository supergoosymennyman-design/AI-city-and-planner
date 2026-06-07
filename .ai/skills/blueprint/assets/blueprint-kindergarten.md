---
lesson: <NN as integer, e.g. 3>
track: kindergarten
title: <Lesson title>
ageBand: <e.g. K2-K3>
bigIdea: <integer 1-5; teach-by-example is usually 3>
aiRepresentation: <real-model | rule-based | remix | remote-real — be honest>
smeReviewed: false
reviewer: ''
owner: ''
---

# Lesson <NN> — <Title>

> Extracted from `source/kindergarten/<band>-<NN>-<slug>/<source file>`.
> Stage 1 below is faithful to the designer's script; Stage 2 is the build enrichment. This is
> the authoritative brief the game is built to (DoD pedagogy gate) and the input to /build-game.

<!-- ============================ STAGE 1 — FAITHFUL EXTRACTION ============================ -->
<!-- Copy from the source. Do not invent. Mark anything absent as "(not in source)". -->

## Simple AI explanation (teacher says, Part A)
<Verbatim (lightly tidied) the designer's "Simple AI Explanation" for this lesson.>

## 25-minute flow (the designer's script)
<The Part A / Part B / Part C beats as written by the designer: what the Teacher says, what the
Children respond, and what the AI says/does. Keep the three-part structure and timings.>

- **Part A — <name> (<n> min):** <teacher ↔ kids ↔ AI beats>
- **Part B — <name> (<n> min):** <…>
- **Part C — <name> (<n> min):** <…>

## Teacher tips (from the source, if any)
<Any "Teacher Tips" / app suggestions / no-internet fallback the designer included. Or "(not in source)".>

<!-- ============================ STAGE 2 — BUILD ENRICHMENT ============================ -->
<!-- Design decisions that turn the script into a buildable game. Use valid enum values. -->

## The teachable-machine truth (core mechanic — do NOT soften)
<The honest mechanic. For "teach the AI" lessons: the AI has NO built-in knowledge; it learns
ONLY the label the children give it, with no correction. If they label it wrong, it answers
wrong — and that visible mistake IS the lesson (Big Idea 3). State it plainly here.>

## Interaction design (what the app actually does)
<Concretely, what is on screen and what happens, part by part. The teach action, the AI's
response, the recognition/game loop, the win moment. Enough that a developer knows what to
build without re-reading the script.>

## AI capability & representation
- **Capabilities:** <list from the Capability enum, e.g. trainModel, speak, listen>
- **aiRepresentation:** <one enum value> — <one line: why this is the honest label for the impl>

## Win / fail / progress
- **Success state:** <what "done / well taught" looks like on screen>
- **No-fail design:** <how the game stays encouraging — kindergarten games should not punish;
  describe how a wrong/odd answer is handled (usually: the AI honestly repeats what it learned)>

## Inputs & two-channel accessibility (golden rule #6)
For every core instruction, feedback, and action, name the ≥2 channels. `tap` is always present.
- **Instruction channels:** <≥2 of audio | visual | symbol> — <how each is delivered>
- **Input channels:** <≥2 of tap | voice | camera | keyboard | switch, incl. tap> — <how>
- **Per-action redundancy:** <e.g. "teach" is a tap button AND the spoken "AI, this is X";
  the AI's reply is spoken (TTS) AND shown as an on-screen bubble.>

## UX & design-standard binding
This game follows the kindergarten UI/UX standard — `docs/standards/ui-ux-common.md` + `docs/standards/kindergarten-ui-ux.md` — for visual
identity, touch targets, motion/flash safety, and colour-blind-safe cues. Do **not** invent
colours, fonts, or sizes here; they come from `@edu/ui` tokens.
- **Components:** built from `@edu/ui` (e.g. `Button`, `AICharacter`); no hand-rolled controls.
- **Lesson-specific UX:** <anything notable for THIS lesson's feel/pacing — e.g. the celebratory
  "AI learned it!" moment, how the teach button reads to a pre-reader, drag-vs-tap choices.>

## Accessibility scope (honest)
<Any inherent exception and its mitigation. If the lesson CONTENT is intrinsically sensory
(e.g. naming a colour, hearing a sound), say so plainly — it is a documented inherent limit,
not an oversight — and list mitigations (e.g. shape-coded scores, CVD-safe palette). If none,
write "Fully operable via tap + audio + visual.">

## Learning objective
<One sentence: what the child learns/does.>

## Observable success criteria
<Bulleted, each observable yes/no by someone watching a child play.>
- <criterion 1>
- <criterion 2>
- <criterion 3 — usually the concept check, e.g. "recognises the AI only knows what it was taught">

## Common misconception this game must NOT reinforce
<The wrong idea to avoid teaching, e.g. "the computer already knows colours". One or two lines.>
