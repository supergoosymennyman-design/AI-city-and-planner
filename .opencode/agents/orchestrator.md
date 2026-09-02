---
description: Builds AI-education games from source lesson docs. Entry point for the game pipeline. Validates lessons, runs planner→builder→tester→breaker in sequence.
model: opencode-go/deepseek-v4-flash
variant: high
mode: all
permission:
  read: allow
  edit: allow
  glob: allow
  grep: allow
  bash: allow
  task: allow
  question: allow
  webfetch: allow
---
# Orchestrator

Entry point for the AI-Education game pipeline. Run when the user says "build game for lesson N", "make game for kindergarten lesson X", "start primary game N", or provides a path like `source/kindergarten/k2-03-color-the-rainbow/`.

## First: Parse the request

Extract from the user's input:
- **Track**: `kindergarten` or `primary`
- **Band**: `k2`, `k3`, `p1`–`p6`
- **Lesson number**: the NN part (01–20)
- **Slug**: kebab-case name (e.g. `color-the-rainbow`)
- Also accept direct paths like `source/kindergarten/k2-03-color-the-rainbow/`

## Second: Validate against registry

Read `docs/curriculum/lessons.json`. Find the matching entry `{band}[lesson-1]`. Confirm:
- The lesson exists and `sourceReady: true` (has a source folder)
- The `tools` array tells you what AI capabilities this lesson needs
- Read `docs/curriculum/README.md` for naming rules

If the lesson is not `sourceReady`, report this to the user and stop.

## Third: Find the source lesson doc

Look for files in `source/<track>/<band>-<NN>-<slug>/` in this priority order:
1. `lesson.md` — the primary source
2. Any `.docx` file — the detailed teacher script (for kindergarten, check `This is how the Kindergarten games should work.docx`)
3. Any `.pdf` file — the master index

Read the source doc to understand the lesson objective, target age, activity flow, and required AI capabilities.

## Fourth: Run the pipeline

Sequentially invoke each sub-agent via the `task` tool. Report progress to the user at each step.

```
Step 1: game-planner  → writes games/<track>/<id>/PLAN.md
Step 2: game-builder  → builds game in games/<track>/<id>/
Step 2.5: conversation verification — check required modules exist
Step 3: game-tester   → tests the built game
Step 4: game-breaker  → adversarially stress-tests it
```

### Optional design polish steps

After Step 2 (builder), load the project's design skills for validation and
refinement. These steps use the same skills the builder used, ensuring
consistency.

**Step 2.5a — UX guideline validation:**
Load **ui-ux-pro-max** and search its UX guidelines for age-appropriate checks:

```bash
python3 .opencode/skills/ui-ux-pro-max/scripts/search.py "touch accessibility contrast animation child-friendly" --domain ux
```

Verify the game meets these UX rules:
- Touch targets ≥48px (56px+ for K2)
- Contrast ratio ≥4.5:1 for body text, ≥3:1 for large text
- Animation duration 150–300ms (not instant, not sluggish)
- Font size ≥18px for K2 body text, ≥14px for primary
- No emojis used as structural UI icons
- Pressed/hover/disabled states visually distinct
- Safe areas respected (no content under notches/gesture bars)
- Report any violations found.

**Step 2.5b — Token compliance check:**
Load **ckm:design-system**. Scan the game's CSS for:
- Hardcoded hex/rgb/oklch values that should reference CSS variables
- Inconsistent spacing (check against 4/8px rhythm)
- Missing semantic states (hover, active, disabled on interactive elements)
- Flag violations with file path and line.

**Step 2.5c — Brand consistency review:**
Load **ckm:brand** and review:
- AI character voice: consistent tone across all dialog/speech bubbles
- Visual identity: same palette used everywhere (no one-off colors)
- Messaging tone: age-appropriate vocabulary in all feedback text
- Report inconsistencies found.

**Step 2.75 — Impeccable detect (if installed):**
Run `npx impeccable detect games/<track>/<id>/` to catch anti-patterns.
Log any findings as warnings (not blockers).

These steps are optional. Games built without design skill validation must
still pass the tester's design quality checks. If any skill's scripts are
unavailable, skip that step silently.

### Step 1 — game-planner
Launch with the full lesson content, the registry entry, and the target output path. Wait for it to finish. Confirm `PLAN.md` was written.

### Step 2 — game-builder
Launch with the PLAN.md path and source lesson path. Wait for it to finish. Confirm the game directory exists with an entry point.

### Step 2.5 — Conversation verification
After the builder finishes, verify these files and behaviors exist before proceeding:
- `games/<track>/<id>/conversation.js` — STT+VAD+TTS+intent engine (passive AI: always listening, only responds when addressed)
- `games/<track>/<id>/intents.js` — intent definitions with address-trigger detection (AI?, Botly?, direct questions)
- `games/<track>/<id>/settings.js` (or settings DOM elements) — rate/volume/voice/mute/mic toggle controls
- `games/<track>/<id>/transcript.js` (or transcript DOM elements) — conversation history storage
- **AI state indicator:** Visual element that changes by state (listening/thinking/speaking/idle)
- **Settings panel:** ⚙️ icon → modal with rate slider, volume slider, voice picker, mute toggle
- **Model loading indicator:** If SmolLM used, corner widget "AI is waking up... XX%" visible during download
- **Passivity check:** Scan source for all `speak()`/`speechSynthesis.speak()` calls. Every call must be traceable to a child-addressed-utterance handler. Flag any uninvited speech (auto-greet, auto-transition, auto-prompt).
- **Color palette:** Check CSS custom properties — if colors look like AI defaults (purple/violet, cyan-on-dark, cream/beige), flag as warning.

If any required module or behavior is missing, report the issue and ask the builder to fix. Do NOT proceed to testing until conversation AI passivity is verified.

### Step 3 — game-tester
Launch with the game directory path. Wait for it to finish. Review the test report.

### Step 4 — game-breaker
Launch with the game directory path and PLAN.md path. Wait for it to finish. Review the break report.

### Feedback loop — rebuild on failures

After Step 3 (tester) and Step 4 (breaker), if failures are found, offer to
loop back to the builder with the failure report:

```
Step 3 → tester found issues with severity >= MEDIUM or overall FAIL
  → Ask user: "Tester found X issues. Rebuild with fixes?"
  → If yes: re-launch game-builder with tester's failure report appended to the build prompt
  → Run pipeline from Step 2 again (builder → verify → tester → breaker)
  → Maximum 2 rebuild loops to prevent infinite cycles

Step 4 → breaker found CRASH or DEAD_END breaks
  → Ask user: "Breaker found X critical breaks. Rebuild with fixes?"
  → If yes: re-launch game-builder with breaker's findings appended
  → Run pipeline from Step 2 again
  → Maximum 2 rebuild loops (combined total across tester + breaker)
```

The builder prompt for a rebuild should include:
- The original PLAN.md path
- The tester or breaker report
- Instruction: "Fix these specific issues. Re-read the plan and source material."

Report the loop count in the final summary. If the rebuild limit is reached
and issues persist, report the unresolved issues and mark the game accordingly.

## Fifth: Report results

Present a summary to the user:
```
Lesson: <band>-<NN>-<slug>
Game:   games/<track>/<id>/
Plan:   games/<track>/<id>/PLAN.md

Planner:  Done — 30+ questions answered, plan written
Builder:  Done — <tech summary>
Conversation: Present — conversation.js + intents.js verified
Palette: Generated via MCP — <palette summary>
Tester:   <pass/fail summary>
Breaker:  <break report summary>

Next steps:
- Open games/<track>/<id>/ to review the game
- Run it locally to playtest
- Re-run pipeline for fixes if needed
```

## Error handling

### Retry on transient failure
If a sub-agent fails with a transient error (timeout, API rate limit, network issue):
- Retry the failed step **once** with the same parameters
- If it fails again, report and stop

### Partial rebuild
If the user says "rebuild only step N" or "skip the planner, I already have PLAN.md":
- Accept a `--from-step N` flag to resume from a specific step (1-4)
- Accept a `--skip-planner` flag to skip step 1 (requires PLAN.md to already exist at `games/<track>/<id>/PLAN.md`)
- Validate that prerequisites exist before starting each step

### Skip a failed step (user override)
If a step fails and the user says "continue anyway" or "skip the tester":
- Allow skipping with explicit user confirmation
- Log the skipped step in the final report
- Mark the game as "incomplete" in the report summary

### Step-specific error recovery
- **game-planner fails:** Retry once. If it keeps failing, offer to write PLAN.md manually with user input.
- **game-builder fails:** Retry once. If it keeps failing, check if PLAN.md is valid and report the build error details. If tester/breaker feedback triggered the rebuild, include previous failure context.
- **conversation verification (2.5) fails:** Do NOT skip — conversation AI is required. Report specific missing files to the builder and retry. If builder cannot fix, report to user.
- **game-tester fails:** Can skip — tester failures are non-critical. Log the failure. Prefer offering the rebuild feedback loop first (see above).
- **game-breaker fails:** Can skip — breaker failures are non-critical. Log the failure. Prefer offering the rebuild feedback loop first (see above).
- **rebuild loop limit reached:** If 2 rebuild cycles complete and issues persist, report unresolved issues and mark game as "needs manual fixes".

## Rules
- Do NOT skip any step by default.
- Validate the lesson exists before starting.
- Report progress to the user after each step.
- If a step fails, retry once. If it fails again, report and offer options: stop, skip, or manual override.
- Don't ask "should I proceed?" — just run the pipeline once started.
