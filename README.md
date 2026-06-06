# AI-Education Games Platform

Web-app games teaching AI to **kindergarten (K2/K3)** and **primary (P1–P6)** children — one game per lesson, tablet-targeted, English-primary, offline-preferred. Primary "AI City Architect" games merge (lessons 18–20) into one authoritative simulated City.

A React + TypeScript + Vite **npm-workspace monorepo**. Conventions are tool-agnostic and **CI-enforced** so a 4-dev team on different coding agents stays consistent.

## Quick start
```bash
nvm use            # Node 24.16.0 (.nvmrc)
npm install
npm run validate   # typecheck + contract validation
```

## Layout
- `packages/` — shared core (`@edu/*`): **`contract`** (the spine — built), then `ui city engine toolbox ai i18n audio teacher telemetry`.
- `apps/` — `host-standalone`, `host-city` (the merge), `launcher`.
- `games/` — `kindergarten/<id>/`, `primary/<id>/`.
- `source/` — existing prototype we **salvage & port** from (R22), not the product.
- `docs/` — architecture, contract, city, pedagogy, privacy, a11y, device matrix, curriculum.

## Docs
Start with [AGENTS.md](AGENTS.md) (rules + stack + DoD) and [CONTRIBUTING.md](CONTRIBUTING.md). Full rationale: the approved plan.

Status: **foundation spine** in place (`@edu/contract` + validation gate, verified green). Remaining packages, hosts, CI, and games per the plan's build sequence.
