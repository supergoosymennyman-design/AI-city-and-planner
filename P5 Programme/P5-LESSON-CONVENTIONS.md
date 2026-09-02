# P5 Lesson Conventions — Robustness + UX Checklist (ALL P5 games)

Every P5 lesson bundle MUST pass every item before it is considered done. Items marked
`SHARED` are enforced by the champion runtime / buddy kit (copied verbatim from p5-01);
items marked `LESSON` are the lesson-author's responsibility.

## 1. Architecture (SHARED + LESSON)

- [ ] Shared champion runtime copied verbatim: `parts.js`, `registry.js`, `builder-logic.js`,
      `gear3d.js`, `mirror3d.js` — never forked, never rewritten.
- [ ] Buddy kit copied verbatim into `buddy/`; game mounts it via ONE script tag + manifest.
- [ ] Pure simulation core in `logic/` (no DOM access), thin renderer in `game.js`.
- [ ] Script load order in `index.html` is LAW (logic first, game shell, then champion runtime).
- [ ] Champion File `.json` is the single source of truth; `championFile.js` validates on import
      (kind/version/name/projects), never crashes on a corrupt file.

## 2. Determinism (LESSON)

- [ ] No `Math.random` / `Date.now` in game logic. Every rng comes from a seeded `createRng`.
- [ ] Seed stored in the save file so any scenario replays exactly (debug + Prove auditable).
- [ ] Fixed-timestep simulation for any real-time coupled system (L9/L10/L13) — never
      frame-rate-dependent.

## 3. Robustness (LESSON)

- [ ] `window.onerror` + `unhandledrejection` → friendly crash screen with Reload
      (child's state is safe in localStorage autosave). A child must NEVER see a white screen.
- [ ] Autosave on every scene change / meaningful beat (strategy pick, round end, earn, gear).
- [ ] `visibilitychange` handler pauses any timer-based round; clamp delta-time on resume
      (a teacher interruption must not let a 30s round elapse).
- [ ] Clamp every metric at its degenerate case: sliders hard min/max, empty dataset → disable
      Train, denominators default to 0 (never NaN in the UI), allocation total can be < budget
      (under-spending is a real decision, only OVER-budget blocks).
- [ ] Error boundary per beat: no uncaught error can leave the DOM in a broken state.
- [ ] Champion File import validated structurally; wrong version → friendly message + retry.

## 4. Pedagogy — "the concept IS the thing manipulated" (LESSON)

- [ ] The child manipulates the AI concept itself (slider = threshold, labels = classes,
      allocation = cost tradeoff). A lesson that can be won by mashing teaches nothing.
- [ ] Model internals visible in kid-language: live accuracy, miss/false-alarm counters,
      learned rule restated as a sentence, prediction-vs-actual gap shown.
- [ ] Failure is the lesson: on a wrong answer show WHY (the misclassified item, the
      prediction gap, the jammed lane) — never just "try again".
- [ ] Prove beat uses a held-out set fixed at lesson start — never train on it.
- [ ] Guaranteed completion for every child: no hard fail states, unlimited retries, adaptive
      hints after N failures. Epic/Legendary are STRETCH goals (cosmetic only).
- [ ] One reflection micro-prompt before the final beat ("What did the threshold teach you?").
- [ ] i18n-ready: all strings externalised from day one (zh-Hant / EN), never inlined in logic.

## 5. UX for 10-year-olds on school hardware (LESSON)

- [ ] Touch-first (Pointer Events, ≥44px targets), mouse/keyboard also work.
- [ ] Short sentences, icon + text; TTS for instructions where available.
- [ ] Rounds 30s–2min; autosave mid-lesson; resume after interruption.
- [ ] Colour-blind-safe: meaning never carried by colour alone (use text key, shape, or pattern
      alongside colour).
- [ ] `prefers-reduced-motion`: no flashing >3×/sec, animations disabled under the media query.
- [ ] One control vocabulary across all games: drag = place, slider = tune, tap = select.
- [ ] Lazy-load per-lesson assets; dispose listeners/workers on unmount (memory across 20
      lessons on a shared tablet).
- [ ] Privacy by construction: no accounts, no PII, everything client-side, Champion File is the
      source of truth. Prompt exports regularly; make import bulletproof.

## 6. Level generation self-validates (LESSON — puzzle/optimisation games)

- [ ] Ship a solver with the generator; test EVERY generated level at generation time
      (full coverage exists; feasible loop under weight/battery; no impossible puzzle).
- [ ] Reject + reseed invalid levels deterministically.
- [ ] Unit-test the validator itself.

## 7. Rarity & record integrity (SHARED)

- [ ] Tier award is a pure monotonic function (ratchet — `parts.js earnPart`), tier only rises.
- [ ] Reason string stored with the part (`evidence`) so rarity is auditable.
- [ ] Idempotent saves: double-tap Save never corrupts the file (immutable `writeProject`).

## 8. Self-red-team before shipping (LESSON)

Run a breaker pass with this prompt as input, executed in Playwright with CPU throttling:

> "List 10 ways a 10-year-old on a slow tablet could break this screen: double-taps, tab
> switches mid-round, slider extremes, empty datasets/allocations, corrupted champion file
> imports, rapid button mashing, quiz answer spam, download spam, localStorage full, browser
> back button. Then verify each is handled."

Then run Playwright E2E for the six-beat happy path + the abuse paths, with CPU throttling
(4×) to simulate school hardware.
