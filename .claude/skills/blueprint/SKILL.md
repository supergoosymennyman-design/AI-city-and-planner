---
name: blueprint
description: >-
  Turn a course designer's non-technical lesson source (a .docx/.md/.pdf in
  source/<track>/<band>-<NN>-<slug>/) into a buildable, standardized GAME BLUEPRINT at
  docs/curriculum/<track>-<band>-NN-<slug>.md. Use this BEFORE writing any game code — the
  blueprint is the required, human-approved input to the /build-game pipeline. Trigger
  whenever someone wants to start a new AI-education game, "write the blueprint / lesson
  spec / curriculum brief", extract a lesson from the designer's doc, or turn a lesson
  flow into something a developer (or the game-builder agent) can build from. Handles both
  the kindergarten (teachable-machine) and primary (AI City Architect sim) tracks.
---

# Blueprint — designer source → buildable game blueprint

## Why this skill exists

The course designer hands us a **non-technical lesson script** (what the teacher and the AI
say in a 25-minute class). A developer cannot build from that alone — it never says *what the
app shows on screen, which AI capability runs, what "winning" looks like, or how a deaf or
blind child uses it*. Today people fill that gap by hand and inconsistently. This skill closes
it with a **fixed two-stage procedure and fill-in-the-blank templates**, so the result is the
same shape every time and **even a small/weak model can produce a correct blueprint** by
copying a template and filling every slot — not by designing from a blank page.

The output (`docs/curriculum/<track>-<band>-NN-<slug>.md`) is the contract between the designer and
the build pipeline. The game's `manifest.ts` pedagogy fields trace back to it, so getting it
right and honest here is what makes the downstream game correct.

## Before you start (hard precondition)

The designer source **must already be present**. Check that
`source/<track>/<band>-<NN>-<slug>/` exists and contains at least one file (`.docx`, `.md`, `.pdf`, or
plain text). If it is missing or empty, **stop** and tell the user:

> "Drop the designer's lesson doc into `source/<track>/<band>-<NN>-<slug>/` first — the blueprint must
> be built from a source, not invented."

`<track>` is `kindergarten` or `primary`. `<band>` is the grade band — `k2`/`k3` (kindergarten)
or `p1`–`p6` (primary). `<NN>` is the zero-padded lesson number **within the band** (e.g. `03`).
`<slug>` is the kebab-case lesson title (e.g. `color-the-rainbow`). Lesson numbers reset per
band, so the band is required to disambiguate — see `docs/curriculum/README.md` and the canonical
`docs/curriculum/lessons.json` registry.

## How to read the source

The source may be `.docx`, `.pdf`, or `.md`/`.txt`. To read non-text formats:
- `.docx`: `unzip -p "<file>" word/document.xml | sed -e 's/<[^>]*>//g'` (strip XML tags), or
  the firecrawl-parse skill if available.
- `.pdf`: use the Read tool (it reads PDFs), or firecrawl-parse.
- `.md`/`.txt`: Read directly.

One source file may contain **many lessons** (the kindergarten doc holds all 20). Find the
section for the lesson you were asked to blueprint and work only from that section.

## The two stages

Do them in order. **Never start Stage 2 before Stage 1 is complete**, because enrichment that
isn't anchored to the real script is how a model hallucinates a different lesson.

### Stage 1 — Faithful extraction (copy, do not invent)

Copy the lesson's content from the source into the template's Stage-1 sections **verbatim or
lightly tidied** (fix obvious OCR/encoding noise; keep the designer's wording and structure).
This is transcription, not design. If the source doesn't state something a Stage-1 slot asks
for, write `(not in source)` — do **not** make it up.

### Stage 2 — Enrichment (the design decisions)

Now fill the design slots that turn the script into something buildable. Every Stage-2 slot is
a real decision: the on-screen interaction, the AI capability, win/fail, two-channel
accessibility, the honest representation of the AI, and the misconception to avoid. Use only
valid contract values — see `references/capability-and-manifest-reference.md` for the exact
enums (capabilities, aiRepresentation, a11y channels, etc.). Picking a value not in those
enums will fail the downstream gate.

**The look and accessibility follow the project standard — do not invent your own.** The shared
UI/UX standard lives in `docs/standards/ui-ux-common.md` plus the track doc
(`kindergarten-ui-ux.md` or `primary-ui-ux.md`) — touch targets, two-channel a11y,
motion/flash safety, colour-blind-safe cues, the `@edu/ui` component system. The blueprint
**references** it and records only the *lesson-specific* UX (which interactions, which two
channels per action, pacing, any inherent sensory exception) — it never restates button sizes
or colours. The `game-builder` composes `@edu/ui` and the `kid-ux-reviewer` enforces the
standard at review time.

## Procedure

1. Confirm the precondition (source folder non-empty). If not, stop (see above).
2. Pick the track template and **copy it verbatim** to `docs/curriculum/<track>-<band>-NN-<slug>.md`:
   - kindergarten → `assets/blueprint-kindergarten.md`
   - primary → `assets/blueprint-primary.md`
3. Read the source for this lesson. Do **Stage 1** — fill every Stage-1 slot from the source.
4. Do **Stage 2** — fill every Stage-2 slot, using valid enum values from the reference file.
5. Run the **self-check** below. Fix anything that fails. Only then report done.

## Self-check (run before declaring done — this is the quality gate)

Go through every item. If any fails, fix it before finishing.

**Both tracks:**
- [ ] The output file is at `docs/curriculum/<track>-<band>-NN-<slug>.md` and has **no remaining
      `<...>` placeholders** and no leftover template instructions.
- [ ] Stage-1 sections match the source (a reader of the docx would recognize this lesson);
      anything absent from the source is marked `(not in source)`, never invented.
- [ ] `bigIdea` is an integer 1–5 (AI4K12 Big Idea).
- [ ] `aiRepresentation` is one of `real-model | rule-based | remix | remote-real`, and it is
      **honest** — it describes what the game will actually do, not what sounds impressive.
- [ ] Every `capability` listed is from the enum in the reference file.
- [ ] `instructionChannels` has ≥2 of `audio | visual | symbol`.
- [ ] `inputChannels` has ≥2 of `tap | voice | camera | keyboard | switch` **and includes
      `tap`** (tap is always present — golden rule #6).
- [ ] Every core **instruction, feedback, and action** in the 25-min flow is reachable via
      ≥2 independent channels (e.g. a spoken line has an on-screen/symbol twin; voice input has
      a tap twin). Voice (STT) is never the only way to do anything — it is Android-Chrome-only.
- [ ] The **misconception to avoid** is stated, and the interaction design does not reinforce
      it (e.g. don't let the AI "magically know" something it was never taught).
- [ ] Each **observable success criterion** is something an observer could mark yes/no while
      watching a child play — not a feeling ("enjoys colours") but an action ("names the colour
      the AI shows").
- [ ] The **UX & design-standard binding** section references `docs/standards/ui-ux-common.md` +
      the track doc (`kindergarten-ui-ux.md` / `primary-ui-ux.md`) and names `@edu/ui` as the
      component source; it records lesson-specific UX only and does **not**
      invent its own colours, fonts, or target sizes (those come from the standard / tokens).

**Primary track also:**
- [ ] The sim is **deterministic**: fixed-point milli-units (no floats persisted), a seeded
      `rng`, and **no `Math.random`**. The blueprint says what the seed and state are.
- [ ] `dependsOn` lists prior lessons' outputs this one consumes, and forms a **DAG** (no
      cycle — it never depends on a later lesson).
- [ ] The **City contribution** is stated: what subsystem/state this lesson adds to the merged
      City (lessons 18–20) and how it behaves at live scale (1×–1000×).

## Notes

- One blueprint = one lesson = one game. If asked to blueprint several, do them one at a time,
  each its own file.
- If the source is ambiguous about a *design* choice (Stage 2), make the most pedagogically
  honest choice and add a short `> Design note:` line explaining it, rather than guessing
  silently. The human approves the blueprint at Gate 1, so surfaced assumptions are good.
- The worked reference example is `docs/curriculum/kindergarten-k2-03-color-the-rainbow.md` — read
  it to see the target quality (especially the honest "teachable-machine truth" and a11y-scope
  sections).
