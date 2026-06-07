# PROGRESS — AI-Education Platform

Living status of the build vs the approved plan ([PLAN.md](PLAN.md)). **Update this in every PR** that completes or starts a tracked item. Legend: ✓ done · ◐ in progress / partial · ☐ pending.

> Snapshot date: 2026-06-07 · Branch: `game/kindergarten-1-color-the-rainbow` (local, not pushed) · Latest: test infra (R1) + Color the Rainbow hardened (voice/UX/crash-proof) + breaker agents

## Where things live
- **Plan (source of truth):** [docs/PLAN.md](PLAN.md) (in-repo copy; original was authored in `~/.claude/plans/`).
- **Rules/DoD:** [AGENTS.md](../AGENTS.md) · [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md)
- **Done = git history; pending = this file.**

## Recently done (2026-06-07)
- ✓ **Test infra (R1) wired** — Vitest + RTL + jsdom; `npm test` chained into `validate`. New **`@edu/testing`** package: fake `ctx`/`AIServices`, a simulated `SpeechRecognition` (drives the real `listenOnce`), and a jsdom Canvas/`Path2D` stub. **28 tests** on Color the Rainbow.
- ✓ **Color the Rainbow hardened** (voice + UX + resilience):
  - Fixed a quiz **freeze** — round-advance was gated on `speechSynthesis.onend` (Chrome drops it after `cancel()`); now a TTS-independent timer + a `speak()` failsafe resolve.
  - **Crash-proof `ctx` I/O** — every `ctx.audio`/`ctx.ai` call try-caught; a rejecting `listenOnce` no longer dead-ends the mic. Promoted to **AGENTS.md golden rule #12** + a DoD checkpoint.
  - **Voice model:** continuous listening in teaching (auto-on after "Teach AI!"), push-to-talk in the quiz; dev voice-sim panel in the host (`npm run dev` → 5173).
  - **UX honesty:** unsupported colour (e.g. "green") gets an honest spoken reaction (not "I didn't catch that"); intro **scopes the promise** to the 3 colours; **tiered result** (0/5 teaches the mistraining lesson, never flat "Great job!").
- ✓ **Adversarial breaker agents** — **`game-breaker`** (crashes/freezes/leaks/dead-ends) + **`ux-breaker`** (OFF-RAIL play: silent no-ops, dead air, misleading feedback, premise-vs-implementation mismatches). Both dogfooded on the game → found + fixed 5 crash-family breaks and 2 headline UX gaps; kept as regression tests. Distinct from `kid-ux-reviewer` (static a11y).
- ✓ **Subagent roster + `/build-game` orchestrator built** (pipeline steps 1b–1c). New agents (`.ai/agents`, synced to `.claude`+`.opencode`): `blueprint-author`, `game-builder` (KG), `game-architect`+`game-implementer` (primary), `pedagogy-reviewer`, `verifier`. **Retired `game-scaffolder`** (no more template-cloning). Refined `contract-reviewer` to trace pedagogy fields to the approved blueprint. New orchestrator skill `.ai/skills/build-game` — one entry point: Gate 0 → blueprint → ★Gate 1 → build (track-aware) → parallel review → verify → bounded fix loop → ★Gate 2 (SME/playtest), with optional `--checkpoint` pauses.
- ✓ **Pipeline hygiene:** `source/<track>/` lowercased (`kindergarten`/`primary`) for Linux-CI-safe Gate-0 paths; `sync-agents.mjs` now also mirrors `.ai/skills/<name>/` → `.claude/skills/` (skips eval workspaces); added `npm run sync`.
- ✓ **`blueprint` skill built + benchmarked** (`.ai/skills/blueprint`, mirrored to `.claude/skills`): two-stage (faithful extract → build enrichment), KG + primary templates, valid-contract-values reference, Gate-0 precondition, self-check gate. Benchmarked on **Haiku** (with-skill vs no-skill ×3): with-skill more faithful, caught the `no-Math.random` determinism rule baselines missed, ~27% faster / ~10% fewer tokens. (Pipeline step 1a.)
- ✓ **Kid UI/UX standard consolidated** → `docs/standards/kid-ui-ux.md` (single named source of truth; was scattered across PLAN §6b + tokens.css + the reviewer prompt). `tokens.css` implements it, `kid-ux-reviewer` now enforces it as its source of truth, the `blueprint` skill references it.
- ✓ **Blueprint-first pipeline — design approved** ([spec](superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md)). Inverts the build flow from *clone-a-template* to *designer-source → skill-enriched blueprint (human-approved) → bespoke build from `@edu/*` blocks → autonomous review/fix → human SME sign-off*. Defines a shared **`blueprint` skill** (KG + primary, weak-model-followable), a **`/build-game`** orchestrator (2 human gates + optional `--checkpoint`, bounded fix loop), and a redesigned subagent roster (new: `blueprint-author`, `game-builder`, `game-architect`, `game-implementer`, `pedagogy-reviewer`, `verifier`; refined: `contract-reviewer`, `kid-ux-reviewer`, `core-guardian`; **retired: `game-scaffolder`**). Per-game source intake at `source/<track>/<NN-slug>/` (Gate 0). Supersedes [PLAN.md §7](PLAN.md). Implementation next.

## Recently done (2026-06-06)
- ✓ **First game — Color the Rainbow** (KG Lesson 3, `games/kindergarten/color-the-rainbow`): draw-to-fill teachable-machine colour game on the **crayon `@edu/ui` standard**; honest learning (AI learns the label as given — no correction); voice STT + tap/keyboard fallback; passes `validate`.
- ✓ **`@edu/ui` started** (crayon tokens + `Button`) · **`apps/host-standalone` skeleton** (Vite host + concrete `GameContext`: TTS/STT/audio/storage/teacher) · **`@edu/contract`** gained additive `reducedMotion`.
- ✓ **Reviewer subagents** (`kid-ux-reviewer`, `contract-reviewer`, `core-guardian`, `game-scaffolder`) + `scripts/sync-agents.mjs` → `.claude/agents` + `.opencode/agent`. Dogfooded on the game: captured + fixed ~15 issues (hi-DPI draw bug, crash-proofing/error boundary, honest feedback, a11y).
- ✓ Curriculum spec: `docs/curriculum/kindergarten-03-color-the-rainbow.md` (Lesson 3 extracted).
- ◐ This game (updated 2026-06-07): tests now cover voice + adversarial + UX (28 green); ☐ FSM-unit + render-smoke still nice-to-have for full DoD. `/new-game`+`/review-game` and `edu-frontend` **superseded** by `/build-game` + the `blueprint` skill + `docs/standards/kid-ui-ux.md`. Stray `docs/repo-overview.{html,pdf}` still untracked — decide keep/remove.

---

## Foundation (Plan §10)

### Day 0 — Prerequisites
- ✓ `git init` (root repo, remote `origin` → EdwardYCLui/AI-education, not pushed)
- ◐ Monorepo scaffold — ✓ workspaces/`package.json`/`tsconfig.base`(allowJs)/`.nvmrc`/`.gitignore`/`.gitattributes`; ☐ Vite shared config, ☐ ESLint config
- ☐ **Curriculum extraction** → `docs/curriculum/<lesson>.md` + `Lesson` enum (BLOCKS lesson cut / capability set) — R-blocker
- ◐ Day-0/1 decisions: ✓ package scope `@edu/*`; ☐ deployment topology, ☐ https vs http, ☐ tfjs 4.x confirm, ☐ minimum device spec (all *recommended* in plan, not finalized)

### Days 1–2 — Lock the spine (split freeze)
- ✓ `@edu/contract` — all outer surfaces + inner sim types as real TS (verified `tsc --build` green)
- ✓ Split-freeze structure (outer frozen; inner sim schema additive-only)
- ✓ First-pass `Capability` set
- ✓ `AGENTS.md` / `CLAUDE.md` + code-style standard
- ✓ `@edu/debug` (debug/assert/invariant) — supports debuggability-first style
- ◐ `validate-contracts` gate — ✓ manifest + a11y two-channel + `dependsOn` DAG; ☐ per-namespace `ext` schema registration, ☐ populated-state serializable/byte-identical harness
- ✓ **Portable gate:** CI (GitHub Actions `validate` job, pinned via `.nvmrc`), CODEOWNERS, `.coderabbit.yaml`, pre-push hook (`.githooks/` via `core.hooksPath`, no Husky dep), PR template (DoD) + new-game/bug issue forms — *CI activates once the repo is pushed*
- ☐ R8 ML perf measurement on real tablet + ratify perf budget

### Days 3–5 — Prove the hard paths
- ☐ `@edu/city` (store + fixed-timestep clock + topo runner + RNG + save/load + migration registry)
- ☐ `host-city` + `host-standalone` skeletons
- ☐ `@edu/ui` starter + shared skills (edu-frontend/frontend-design/work-log) + `logs/` convention
- ☐ scaffolder (`new-game`) + templates
- ☐ runtime structural harness (fast-check determinism, populated serializable round-trip)
- ☐ refactor one example (`nature_hunt`) → contract → clonable template
- ☐ **Gate centerpiece:** 1 KG reference game + TWO interacting primary subsystems (live 1×–1000× deterministic + fast-forward view)

---

## Packages (`@edu/*`)
- ✓ `contract` · ✓ `debug` · ✓ `testing` (test doubles) · ◐ `ui` (crayon tokens + `Button`)
- ☐ `city` · ☐ `engine` · ☐ `toolbox` · ☐ `ai` · ☐ `i18n` · ☐ `audio` · ☐ `teacher` · ☐ `telemetry`

## Apps
- ◐ `host-standalone` (Vite host + concrete `GameContext`: TTS/STT/audio/storage/teacher + dev voice-sim) · ☐ `host-city` (the merge) · ☐ `launcher` (R20)

---

## Cross-cutting requirements (Plan §9) — status
| R | Item | Status | Note |
|---|---|---|---|
| R1 | Testing infra | ◐ | Vitest + RTL + jsdom wired (`npm test` in `validate`); `@edu/testing` doubles; 28 tests on CtR. ☐ Playwright tablet-smoke + axe + fast-check |
| R2 | Privacy / telemetry stub | ◐ | `Telemetry` iface in contract; impl + PII CI check pending |
| R3 | Teacher controls | ◐ | `TeacherControls` iface in contract; impl pending |
| R4 | Audio pipeline (English-primary) | ◐ | `AudioBus` iface in contract; impl pending |
| R5 | Licensing | ☐ | per-asset LICENSE + check-licenses |
| R6 / R17–R19 | Accessibility | ◐ | `manifest.a11y` + tap-present check ✓; Canvas PDOM, flash/motion, AT audit pending |
| R7 | City art & layout | ☐ | owner + assets |
| R8 | Device matrix | ☐ | Day-1 tablet must-verify (WebGL backend, memory, STT existence) |
| R9 | Work logs | ◐ | convention documented; `logs/` dir + work-log skill usage pending |
| R10 | Determinism + migration | ◐ | `SeededRng` + fixed-point in contract ✓; migration registry + fast-check harness pending |
| R11 | Content pipeline (assets) | ☐ | owner + schedule |
| R12 | Host fault tolerance | ◐ | game-level crash-proofing ✓ (golden rule #12: best-effort `ctx` I/O + host error boundary); sim snapshot/quarantine/rollback (§4h) pending |
| R13 | Playtesting (kids+teacher, ~wk5) | ☐ | incl. SEN participant |
| R14 | Session persistence | ◐ | `SessionInfo` in contract ✓; impl pending |
| R15 | Consent / data governance | ☐ | DPA + parent notice + DPIA |
| R16 | Client security (CSP/SRI/self-host) | ☐ | |
| R20 | Classroom ops / launcher | ☐ | |
| R21 | Capability gating + min spec | ◐ | `AIServices.probe` in contract ✓; gating + spec pending |
| R22 | Salvage & port (`source/`) | ◐ | mapped + documented; porting pending |

---

## Verification gates (Plan §11) — foundation "done when"
- ◐ 1 (workspaces resolve, pinned Node) — workspaces ✓; Node pin via `.nvmrc` ✓
- ☐ 2 `new-game` → passes validate zero-edit
- ☐ 3 host-standalone on tablet viewport (Playwright)
- ☐ 4 two interacting subsystems (live + fast-forward, deterministic)
- ◐ 5 `validate` + build green; CI mirror — local validate ✓; CI workflow added (green once pushed)
- ☐ 6 sync-agents consistency
- ☐ 7 offline play + STT fallback
- ☐ 8 i18n layer proven (English complete)
- ☐ 9 device matrix + live-scale ceiling measured
- ☐ 10 fault tolerance test
- ☐ 11 pedagogy loop (spec → manifest)

---

## Open decisions (Plan §12)
☐ age band · ☐ hosting · ☐ lesson cut + 4-way split · ☐ second locale (post-v1) · ☐ CodeRabbit plan · ☐ evaluate PixiJS / XState / agent-ecosystem trim · ☐ Day-0/1: topology, https/http, tfjs version, min device spec

---

_Done 2026-06-06: **Portable gate** — CI workflow, CODEOWNERS, CodeRabbit, pre-push hook, PR/issue templates._

## Parked (designed, revisit after first games)
- **Generated SME progress board** (`docs/STATUS.md`) — design agreed 2026-06-06, **deferred** to prioritize shipping games (likely to change once real games/curriculum exist). Full design: [PLAN.md §6c](PLAN.md). In brief: a generative (never-hand-edited) board for the Education SME; sources = `docs/curriculum/lessons.json` registry + curriculum frontmatter + game manifests; `scripts/gen-status.mjs` (deterministic) + a `status:check` freshness gate in `validate`; doc-map nav headers + CLAUDE agent note.

## Next up (recommended order)
1. **Blueprint-first pipeline — remaining** ([spec](superpowers/specs/2026-06-07-blueprint-first-game-pipeline-design.md)): ✓1a `blueprint` skill · ✓1b roster + retire scaffolder · ✓1c `/build-game` orchestrator · ☐1d `lessons.json` registry (lesson cut + capability set) · ☐ wire Playwright tablet-smoke + axe so `verifier` reports real GREEN (today it honestly says "not wired") · ☐ end-to-end dry-run of `/build-game` on one KG lesson.
2. **`@edu/toolbox`/`@edu/ai` port** — port `source/toolbox/{conversation,joints,recognition}.js` into typed building blocks (dependency of bespoke builds, not template).
3. **`@edu/city`** — the riskiest core (store/clock/topo runner/RNG/save-load/migration).
4. **Curriculum extraction** — run the new `blueprint` skill across the 20 KG + primary lessons.
5. *(deferred) ESLint config* — wire sim-rule lint (no-`Math.random` / no `ctx.bus`-for-state / no persisted floats) into `validate` + CI once `@edu/city` exists; linting sim rules needs sim code to lint.
