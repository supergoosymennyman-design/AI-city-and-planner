---
name: build-game
description: >-
  Orchestrate the end-to-end, blueprint-first build of ONE AI-education game from the course
  designer's source doc to a CI-green, reviewed, production-ready game. Use when someone says
  "build game", "/build-game", "make the game for lesson N", "start the <track> lesson N game",
  or wants to run the whole pipeline for a lesson. Drives the specialist subagents in order
  (blueprint → build → review → verify), loops fixes until green, and pauses ONLY at the two
  human gates (approve blueprint; final SME/playtest sign-off). Handles kindergarten and primary
  tracks. This is the single entry point — prefer it over invoking the build/review agents by hand.
---

# /build-game — the blueprint-first pipeline orchestrator

## Why this exists
Games are built **from an approved lesson blueprint, never by cloning a template** (see
`docs/superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md`). This skill is the
one command that runs the whole flow so a teammate doesn't hand-wire seven agents and forget a
gate. You (the orchestrator) dispatch each specialist as a **subagent** via the Task tool, read
its structured result, and decide the next step. The autonomous middle runs unattended; you stop
only at the two human gates.

## Inputs
- **track** — `kindergarten` or `primary`.
- **lesson** — the lesson number; derive `<NN>` (zero-padded) and a kebab `<slug>` (the game id).
- Optional **`--checkpoint=<phase,...>`** — extra human pauses after named phases
  (`blueprint`, `design`, `build`, `review`, `verify`), on top of the two hard gates.
- Optional **`--max-fix-rounds=N`** — fix-loop budget before escalating to a human (default **3**).

## Pipeline

### Gate 0 — source intake present (hard precondition)
Confirm `source/<track>/<NN-slug>/` exists and is non-empty (lowercase track). If not, **STOP**:
> "Drop the designer's lesson doc into `source/<track>/<NN-slug>/` first — the blueprint must be
> built from a source, not invented."

### Phase 1 — Blueprint  → ★ Human Gate 1
Dispatch **blueprint-author** (it runs the `blueprint` skill). It writes
`docs/curriculum/<track>-NN-<slug>.md` and self-checks.
**★ HUMAN GATE 1 (always):** present the blueprint path + its summary and ask the human to
approve or request changes. Do **not** proceed to code until approved. (Loop blueprint-author on
requested changes.)

### Phase 2 — Build (track-aware)
- **kindergarten:** dispatch **game-builder** (designs + implements bespoke from the blueprint).
- **primary:** dispatch **game-architect** (writes `games/primary/<id>/PLAN.md`), then
  **game-implementer** (codes the plan). If `--checkpoint=design`, pause after the architect.

### Phase 3 — Review (parallel)
Dispatch these as concurrent subagents (one Task message, multiple calls):
**contract-reviewer**, **kid-ux-reviewer**, **pedagogy-reviewer**, and (primary only)
**core-guardian**. Collect every PASS/FAIL + the ranked findings.

### Phase 4 — Verify
Dispatch **verifier** (`npm run validate` + tablet smoke + axe where wired). Get the GREEN/RED
verdict with exact output.

### Fix loop (bounded)
If any reviewer FAILs or the verifier is RED: summarize the blocking findings and dispatch the
builder/implementer again to fix exactly those, then re-run Phase 3–4. Repeat up to
`--max-fix-rounds` (default 3). If still not green, **STOP and escalate to the human** with the
remaining findings — never loop forever, never claim green without the verifier's output.

### ★ Human Gate 2 — SME / playtest sign-off
When reviews pass and the verifier is GREEN, the game is **automation-complete**. Present a
summary (what was built, reviewer results, verifier output) and hand off for the human **SME
pedagogy review + playtest**. On sign-off, open the PR (use the DoD PR template). "Production-
ready" = green + human SME sign-off.

## Rules for you, the orchestrator
- **Dispatch, don't do.** Run each step as a subagent so each gets a clean context; you keep the
  thread and the decisions. Pass each subagent the `track`, `<NN-slug>`, and the relevant paths.
- **Respect the gates.** Gate 0/1/2 are non-negotiable. `--checkpoint` adds pauses; it never
  removes the hard gates.
- **Be honest about partial tooling.** If Playwright/axe aren't wired yet, the verifier says so;
  report that plainly rather than implying full verification.
- **One game per run.** For several lessons, run the pipeline once per lesson.
