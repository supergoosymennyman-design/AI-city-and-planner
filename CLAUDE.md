@AGENTS.md

## Claude-specific notes
- Start every task from the contract in `packages/contract/src/`. The outer surfaces are frozen; propose inner-sim-schema changes as additive + versioned (core-guardian).
- When porting from `source/` (R22): import the existing `.js` as-is first (`allowJs`), wrap behind a typed boundary, then convert to `.ts` incrementally — keep the app green at every step.
- The hot sim path is a Canvas RAF loop **outside** React; never read/write the store from React render.
- Prefer the dedicated review skills/subagents (contract-reviewer, kid-ux-reviewer, core-guardian) before opening a PR; but remember CI is the gate, not the agent.
