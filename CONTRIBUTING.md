# Contributing

## Getting started (4 devs, 4 machines, deterministic bring-up)
1. Install the pinned Node (`.nvmrc` → 24.16.0): `nvm use` (or install that version).
2. `npm install` (root — installs all workspaces).
3. `npm run validate` — must be green before you start.

> **Determinism note:** sim determinism is asserted on **CI's pinned engine only**. Local floating-point differences across machines are expected and are *not* a bug — don't chase them (§4c).

## Workflow
- One branch per game: `game/<track>-<lesson>-<slug>`; one PR per game.
- Conventional commits. PR must pass `validate` + CI (CodeRabbit reviews every PR).
- `main` is protected; shared `packages/**` changes need core-guardian (CODEOWNERS).

## Adding a game
- (Planned) `npm run new-game` scaffolds a contract-conformant game that passes `validate` with zero edits.
- Build to `@edu/contract` only; touch the platform through `ctx`.
- Meet the Definition of Done in `AGENTS.md`.

## Porting from `source/` (R22)
Salvage, don't rebuild: `ConversationManager`, MobileNet+knn-classifier teachable, MediaPipe Hands gesture, IndexedDB store, Web Audio chimes, and the three sim engines. Cut every CDN → self-host; unify on one tfjs 4.x.

## Never commit
Student/playtest data, secrets/API keys, `node_modules`, build output, or large ML model binaries (see `.gitignore`).
