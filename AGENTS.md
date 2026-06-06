# AGENTS.md — AI-Education Games Platform

Single source of truth for every contributor and coding agent (Claude Code, opencode, …).
`CLAUDE.md` imports this file. **CI is the real enforcer** — nothing here depends on an agent having read it.

## What we build
Web-app games teaching AI to **kindergarten (K2/K3)** and **primary (P1–P6)** children, one game per lesson, on **tablets**, **English-primary**, **offline-preferred**.
- **Kindergarten:** teacher-led "teachable-machine" voice/camera games.
- **Primary "AI City Architect":** 2D sim games; lessons 18–20 **merge** earlier games into one authoritative simulated City (live 1×–1000×, precomputed fast-forward beyond).

## Golden rules (CI-enforced where ★)
1. **The contract is law.** Build games to `@edu/contract`; never hand-edit central/generated files. ★ `validate-contracts`
2. **`ctx`-only I/O.** Games touch the platform only through `GameContext` — no `window.*`, no globals.
3. **English-primary; strings externalized.** No hardcoded user-facing text (i18n layer); a locale can be added later. ★
4. **Offline-first** with documented exceptions; **no third-party CDN at runtime** — self-host + SRI. ★
5. **Privacy (children):** no PII; camera frames memory-only; cloud STT off unless consented; never commit student data. ★ (see §5c of the plan)
6. **Accessibility is contract law:** every core instruction/feedback/action reachable via ≥2 channels; `tap` always present. ★ `manifest.a11y`
7. **Determinism in the sim:** fixed-point milli-units, seeded `rng`, **no `Math.random`** in `@edu/city`/`games/primary/**`. ★ lint
8. **No `ctx.bus` for state** — cross-subsystem state flows through namespaced `CityState.ext` only. ★ lint
9. **Tablet budgets:** lazy-load per game; one ML runtime per game + teardown; honor the size/perf budget. ★ size budget
10. **Never break `@edu/*`** without core-guardian (CODEOWNERS). Inner sim schema is additive-only + versioned.
11. **Salvage & port** existing capabilities (R22) — don't rebuild what works in `source/`.

## Stack
React 18 + TypeScript + Vite · Zustand (sim state outside React) · Zod (schema+types) · react-i18next ·
Canvas 2D (hand-rolled, RAF outside React) · Vitest + RTL + Playwright + fast-check + axe ·
npm workspaces. ML/UX OSS: port MobileNet+knn-classifier (tfjs 4.x) + MediaPipe Hands; React Aria, dnd-kit, Howler, idb, vite-plugin-pwa. See plan §1/§12.

## Repo map
```
packages/   contract ui city engine toolbox ai i18n audio teacher telemetry   (@edu/*, CODEOWNERS-gated)
apps/       host-standalone  host-city  launcher
games/      kindergarten/<id>/  primary/<id>/
scripts/    validate-contracts.mjs  new-game.mjs  ...
docs/       curriculum/<lesson>.md  game-contract.md  city-architecture.md  ...
source/     existing prototype — salvage/port source (R22), not the product
```

## Commands
- `npm install` — install workspaces
- `npm run typecheck` — `tsc --build`
- `npm run contracts` — manifest + a11y + DAG validation gate
- `npm run validate` — typecheck + contracts (lint/test added as tooling lands)
- `npm run new-game` — scaffold a contract-conformant game (planned)

## Contract & City
- Contract: `packages/contract/src/` (`module.ts`, `manifest.ts`, `context.ts`, `city.ts`, `rng.ts`, `services.ts`, `capability.ts`).
- **Split freeze:** outer surfaces (GameModule/Manifest/Context) are frozen; inner sim schema (CityState/Capability/tick) is additive-only + versioned via core-guardian.

## Definition of Done (per game)
`validate` green · English complete + strings externalized · standalone (+ city for primary) · logic + render tests · tablet-viewport tested · a11y two-channel · no new heavy deps · no PII · pedagogy gates (objective, age-appropriate, teaches concept, `aiRepresentation` recorded, SME review).

> Full rationale lives in the approved plan: `~/.claude/plans/i-am-setting-up-drifting-token.md`.
