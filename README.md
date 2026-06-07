# AI-Education Games Platform

Web-app games that teach AI to **kindergarten (K2/K3)** and **primary (P1–P6)** children — one game
per lesson, **tablet-first, English-primary, offline-preferred**. Primary "AI City Architect" games
merge (lessons 18–20) into one authoritative simulated City.

A **React + TypeScript + Vite npm-workspace monorepo**. Conventions are tool-agnostic and
**CI-enforced**, so a 4-dev team on mixed coding agents/models stays consistent.

> **Status:** foundation in place — the **`@edu/contract`** spine, a **blueprint-first build pipeline**
> (specialist agents + `/build-game`), a **test + CI gate**, and a **complete reference game**
> (Color the Rainbow, KG Lesson 3). Ready to build games.

## Quick start
```bash
nvm use            # Node per .nvmrc
npm install
npm run validate   # typecheck + contract checks + tests — your green light
```
Then read [AGENTS.md](AGENTS.md) (the rules) and skim the reference game in
[`games/kindergarten/color-the-rainbow`](games/kindergarten/color-the-rainbow).

## Build a game — the blueprint-first pipeline
1. Put the course designer's lesson doc in `source/<track>/<NN-slug>/`.
2. Run **`/build-game <track> <lesson>`** → it drafts a **blueprint** (the buildable spec).
3. **Approve the blueprint** — human gate 1.
4. It builds the game bespoke from `@edu/*` blocks, runs the review agents
   (`contract-reviewer` · `kid-ux-reviewer` · `game-breaker` · `ux-breaker`) + `verifier`, and loops fixes.
5. **SME / playtest sign-off** — human gate 2 → open a PR → CI green → merge.

Never clone-and-tweak another game — build to the contract from shared blocks.

## Non-negotiables (CI-enforced)
Build to `@edu/contract` · `ctx`-only I/O (no `window`/globals) · all user-facing text externalized
(English-first) · accessibility is two-channel and **tap always works** · **no child PII** ·
crash-proof device I/O (golden rule #12) · logic + render tests. Full rules + Definition of Done:
[AGENTS.md](AGENTS.md).

## Layout
- `packages/` — shared core `@edu/*`: **`contract`** (the spine) · `debug` · `testing` · `ui` …
  (`city engine toolbox ai i18n audio teacher telemetry` to come)
- `apps/` — `host-standalone` · `host-city` (the merge) · `launcher`
- `games/` — `kindergarten/<id>/` · `primary/<id>/`
- `source/` — existing prototype we **salvage & port** from (R22), not the product
- `.ai/agents/` + `.ai/skills/` — canonical agents/skills, generated to `.claude/` + `.opencode/` (`npm run sync`)
- `docs/` — plan, progress, standards, curriculum

## Docs
- [AGENTS.md](AGENTS.md) — rules, stack, Definition of Done (`CLAUDE.md` imports it)
- [docs/PLAN.md](docs/PLAN.md) — full approved spec · [docs/PROGRESS.md](docs/PROGRESS.md) — live status
- [docs/standards/kid-ui-ux.md](docs/standards/kid-ui-ux.md) — the kid UI/UX standard
- Reference game: [`games/kindergarten/color-the-rainbow`](games/kindergarten/color-the-rainbow)

## Commands
| Command | What it does |
|---|---|
| `npm run validate` | typecheck + contracts + tests — **the gate** |
| `npm test` | Vitest (React Testing Library + jsdom); shared doubles in `@edu/testing` |
| `npm run sync` | regenerate `.claude/` + `.opencode/` agents & skills from `.ai/` |
