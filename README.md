# AI-Education Games Platform

Web-app games that teach **AI literacy** to **kindergarten (K2/K3)** and **primary (P1–P6)** children —
one game per lesson, **tablet-first, offline-preferred**. Primary "AI City Architect"
games merge (lessons 18–20) into one authoritative simulated City running live (1×–1000×) with
cross-subsystem cascades.

A **React 18 + TypeScript + Vite npm-workspace monorepo**. Four devs build in parallel on *different*
coding agents/models, so every convention is **tool-agnostic and CI-enforced** — the gate is the source
of truth, not any one agent's prompt.

> **Status (2026-06-07):** Foundation in place — the **`@edu/contract`** spine, a **test + CI gate**,
> and one **complete, hardened game** (Color the Rainbow, K2 Lesson 3), hand-built before the pipeline
> existed. A **blueprint-first build pipeline** (specialist agents + `/build-game`) is **designed and
> scaffolded but never run end-to-end** — see the caveat below. `main` is live (private).
> Live status: [docs/PROGRESS.md](docs/PROGRESS.md).

---

## Quick start

```bash
nvm use            # Node 24.16.0 per .nvmrc
npm install        # installs all workspaces
npm run validate   # sync-check + typecheck + contracts + tests — your green light
```

Run the game in the host:

```bash
cd apps/host-standalone
npm run dev        # http://localhost:5173  (includes a dev voice-sim panel for STT)
```

Then read **[AGENTS.md](AGENTS.md)** (the rules) and skim Color the Rainbow in
[`games/kindergarten/k2-03-color-the-rainbow`](games/kindergarten/k2-03-color-the-rainbow).

---

## How we intend to build games — the blueprint-first pipeline

> ⚠️ **Unproven.** This pipeline is designed and scaffolded (agents, `/build-game`, the `blueprint`
> skill) but has **never been run end-to-end on a real lesson** — it is blocked on the
> `@edu/toolbox`/`@edu/ai` port. The first dry-run (`/build-game kindergarten k2 1`) is the test of
> whether the orchestrator + agents actually interlock. Color the Rainbow was **hand-built before this
> existed** and is not a product of it. Treat the flow below as the intended process, not a paved road.

The goal: **never clone-and-tweak** another game. Each game is built bespoke from the contract + shared
`@edu/*` blocks, driven by one orchestrator with two human gates:

1. Drop the course designer's lesson doc in `source/<track>/<band>-<NN>-<slug>/` (Gate 0 — intake exists).
2. Run **`/build-game <track> <band> <lesson>`** (e.g. `/build-game kindergarten k2 3`) → it drafts a
   **blueprint** (`docs/curriculum/<track>-<band>-NN-<slug>.md`), the buildable spec.
3. **★ Gate 1 — approve the blueprint** (human).
4. It builds the game from `@edu/*` blocks, runs the review agents in parallel
   (`contract-reviewer` · `kid-ux-reviewer` · `pedagogy-reviewer` · `game-breaker` · `ux-breaker`) +
   `verifier`, and loops fixes until green.
5. **★ Gate 2 — SME / playtest sign-off** (human) → open a PR → CI green → merge.

Curriculum taxonomy is keyed by **`(band, lesson)`** — lesson numbers reset per band (K2 #3 ≠ K3 #3).
The naming rule `{band}-{NN}-{slug}` is enforced by CI for every game folder, source dir, and blueprint.
See [docs/curriculum/README.md](docs/curriculum/README.md) and the [lessons.json](docs/curriculum/lessons.json) registry.

---

## Non-negotiables

Build to **`@edu/contract`** · **`ctx`-only I/O** (no `window.*`/globals) · accessibility is
**two-channel** and **`tap` always works** · all user-facing text **externalized** · **no child PII**;
camera frames memory-only · **crash-proof device I/O** (golden rule #12 — a throwing/rejecting/hanging
mic/TTS degrades to tap, never crashes or dead-ends) · **determinism in the sim** (fixed-point, seeded
`rng`, no `Math.random` in `@edu/city`/`games/primary/**`) · offline-first, no runtime third-party CDN ·
logic + render tests.

**What the gate actually enforces today** (everything else is a rule, not yet automated): manifest
validity against the contract · a11y two-channel + `tap` present · `dependsOn` DAG · curriculum
`{band}-{NN}-{slug}` naming · `.claude`/`.opencode` not drifted from `.ai/` (`sync:check`). The
i18n-externalization, PII, no-CDN, and no-`Math.random` (ESLint) gates are **planned, not wired yet**.

Full rules, stack, and **Definition of Done**: **[AGENTS.md](AGENTS.md)** · [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md).

---

## Repo layout

```
packages/   shared core @edu/*  (CODEOWNERS-gated)
apps/       host-standalone · host-city (the merge) · launcher
games/      kindergarten/<id>/ · primary/<id>/
source/     existing prototype we SALVAGE & PORT from (R22) — not the product
docs/       PLAN · PROGRESS · standards/ · curriculum/
.ai/        canonical agents + skills (source of truth) → generated to .claude/ + .opencode/
scripts/    validate-contracts.mjs · sync-agents.mjs · setup-hooks.mjs
```

> `.ai/**` is canonical; `.claude/**` and `.opencode/**` are **generated** by `npm run sync`. A
> `sync:check` gate runs **first** in `validate`, so editing a generated dir (or forgetting to sync)
> fails CI/pre-push with the exact paths.

---

## What's built vs. pending

| Area | State | Notes |
|---|---|---|
| `@edu/contract` | ✓ | The spine — frozen outer surfaces; inner sim schema additive-only + versioned (core-guardian) |
| `@edu/debug` | ✓ | debug/assert/invariant — debuggability-first style |
| `@edu/testing` | ✓ | Test doubles: fake `ctx`/`AIServices`, simulated `SpeechRecognition`, jsdom Canvas/`Path2D` stub |
| `@edu/toolbox` | ◐ | **Ported** ConversationManager (STT+VAD+TTS), joints, ai, audio, engine; tfjs 4.x + MediaPipe as **optional** peer deps |
| `@edu/city · engine · ai · i18n · audio · teacher · telemetry` | ☐ | Interfaces live in the contract; implementations pending |
| `apps/host-standalone` | ◐ | Vite host + concrete `GameContext` (TTS/STT/audio/storage/teacher) + dev voice-sim |
| `apps/host-city · launcher` | ☐ | The merge + teacher portal — later |
| Games | 1 ✓ | **Color the Rainbow** (K2 L3) — hardened (voice + UX + resilience), ~37 tests |
| Tests / CI | ◐ | Vitest + RTL + jsdom (~50 cases) chained into `validate`; Playwright e2e wired (`e2e/*.spec.ts`); CI runs on PRs; pre-push hook enforces the gate. ☐ axe + fast-check determinism harness |
| Curriculum | ◐ | `lessons.json` (K2+K3, 40 lessons); 19/20 K2 teacher scripts extracted & Gate-0-ready. ☐ K2 #10 (designer conflict), K3 scripts, primary lesson cut |

**▶ Resume point:** end-to-end pipeline dry-run (`/build-game kindergarten k2 1`) is **blocked on the
`@edu/toolbox`/`@edu/ai` port** finishing (parallel session). Next core risk after that is `@edu/city`
(store/clock/topo-runner/RNG/save-load/migration). Full next-up list: [docs/PROGRESS.md](docs/PROGRESS.md).

---

## Workflow conventions

- **One branch per game:** `game/<track>-<band>-<lesson>-<slug>`; **one PR per game**.
- **Conventional commits.** Every PR must pass `npm run validate` + CI; **CodeRabbit** reviews each PR.
- **`main` is protected.** Shared `packages/**` changes need **core-guardian** (CODEOWNERS).
- **Salvage, don't rebuild (R22):** port from `source/` (ConversationManager, MobileNet+KNN teachable,
  MediaPipe Hands, IndexedDB store, Web Audio, the three sim engines). Cut every CDN → self-host.
- **Never commit:** student/playtest data, secrets, `node_modules`, build output, large ML binaries.

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Commands

| Command | What it does |
|---|---|
| `npm run validate` | sync-check + typecheck + contracts + tests — **the gate** |
| `npm test` / `npm run test:watch` | Vitest (RTL + jsdom); shared doubles in `@edu/testing` |
| `npm run test:e2e` | Playwright tablet-viewport smoke (`e2e/`) |
| `npm run typecheck` | `tsc --build` |
| `npm run contracts` | manifest + a11y two-channel + `dependsOn` DAG + curriculum-naming gate |
| `npm run sync` / `npm run sync:check` | regenerate / verify `.claude/` + `.opencode/` from `.ai/` |

> `validate-contracts` reads the **compiled** contract from `packages/contract/dist/` — run `typecheck`
> before `contracts`. `npm run validate` already chains them in order.

---

## Docs

- **[AGENTS.md](AGENTS.md)** — rules, stack, golden rules, Definition of Done (`CLAUDE.md` imports it)
- [docs/PLAN.md](docs/PLAN.md) — full approved spec · [docs/PROGRESS.md](docs/PROGRESS.md) — live status
- **Curriculum:** [docs/curriculum/README.md](docs/curriculum/README.md) (taxonomy + naming) · [lessons.json](docs/curriculum/lessons.json)
- **UI/UX standard:** [ui-ux-common.md](docs/standards/ui-ux-common.md) (shared, both tracks) +
  [kindergarten-ui-ux.md](docs/standards/kindergarten-ui-ux.md) ("Sticker Lab + Bo", locked) +
  [primary-ui-ux.md](docs/standards/primary-ui-ux.md) ("Command Deck" / "Architect's Table", **draft**)
- **First game:** [`games/kindergarten/k2-03-color-the-rainbow`](games/kindergarten/k2-03-color-the-rainbow)
