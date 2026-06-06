@AGENTS.md

## Claude-specific notes
- Start every task from the contract in `packages/contract/src/`. The outer surfaces are frozen; propose inner-sim-schema changes as additive + versioned (core-guardian).
- When porting from `source/` (R22): import the existing `.js` as-is first (`allowJs`), wrap behind a typed boundary, then convert to `.ts` incrementally — keep the app green at every step.
- The hot sim path is a Canvas RAF loop **outside** React; never read/write the store from React render.
- Prefer the dedicated review skills/subagents (contract-reviewer, kid-ux-reviewer, core-guardian) before opening a PR; but remember CI is the gate, not the agent.

## Build gotchas (this repo)
- `validate-contracts` reads the **compiled** contract from `packages/contract/dist/` — run `npm run typecheck` (`tsc --build`) before `npm run contracts`. `npm run validate` already chains them in order.
- `@edu/contract` has **no runtime React dep** — components are type-only `import type { FC }` (erased by `verbatimModuleSyntax`). Keep `react` a peer/dev dep there; don't add it as a runtime dependency to pure-types packages.
- Before claiming work is done, run `npm run validate` and show the output — CI is the source of truth, including for sim determinism (asserted on CI's pinned engine only).
