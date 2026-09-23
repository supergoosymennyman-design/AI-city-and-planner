# Local live-demo runbook

The current Workshop–Studio demo is documented in
[Workshop–Studio demo](workshop-studio-demo/README.md), including the twelve steps,
teacher PIN setup, Save/Open, recovery and verification results.

From the repo root run `npm run demo:prepare`, then
`PASSIONA_DEMO_PORT=8378 npm run demo:start`. Open http://localhost:8378/ and keep
that exact origin. Workshop and Studio now run locally on the same origin as the
City. The configured Buddy provider still needs internet access and the existing
gitignored server `.env` settings. Never put provider keys in browser content.

The Hub's **Run demo check** probes the configured live provider. City, Planner and
Academy remain available. Their City project format is separate from the new
Workshop–Studio `ai-champion` file. The original City–Studio GLB editing integration
remains queued; do not demonstrate it as complete.

The verification server may already be running on 8378. Do not stop unrelated
servers on other ports. `npm run demo:reset` only clears local cloud-code saves;
it is not a recovery command for browser IndexedDB or Champion Files.
