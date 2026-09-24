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

For the clearly labelled, populated example demo, open
http://localhost:8378/demo/ (use your server's port), or share
https://p5-city-sim.clover-marquis.workers.dev/demo/. Both open the existing
example city automatically with `example=1&demoPerf=1`, even when a saved planner
city is empty. The localhost root also directs visitors to this demo.
For a saved planner city, use `/city-builder/?demoPerf=1`. This optional mode
targets 30 FPS, uses slightly smaller shadow and bloom buffers, and limits
adaptive resolution reduction to 10% per dimension. Models, textures, sky assets,
population and lighting colours are preserved. Remove `demoPerf=1` to return
to normal rendering; the option is not part of the student's save file.

Rebuild with `npm run demo:prepare` and restart your demo server after updating.
Visit the city once and wait for streaming to finish before presenting. Static
assets now revalidate against the local server, so unchanged files can be reused
on later visits while changed files are fetched again. HTML and API/save replies
remain uncached. This helps repeat loading; rendering still runs on each device.
For diagnostics, `window.__city.performance` reports measured FPS, resolution
scale and canvas/composer pixel ratios. Verify on a slower computer before the
demo; a 30 FPS cap cannot make a machine already below 30 FPS reach that target.
