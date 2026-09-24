# Local live-demo runbook

The current Workshop–Studio demo is documented in
[Workshop–Studio demo](workshop-studio-demo/README.md), including the twelve steps,
teacher PIN setup, Save/Open, recovery and verification results.

From the repo root run `npm run demo:prepare`, then
`PASSIONA_DEMO_PORT=8378 npm run demo:start`. Open http://localhost:8378/ and keep
that exact origin throughout the presentation. If 8378 is in use, choose another
free port for `PASSIONA_DEMO_PORT` and set the same `DEMO_ORIGIN` when running
browser checks. The Hub, Academy, Planner, City, Workshop and Studio all run on
that origin. The configured Buddy provider still needs internet access and the
existing gitignored server `.env` settings. Never put provider keys in browser
content.

The localhost server serves Workshop from its canonical source and Studio from
its local build. A later City bundle rebuild cannot replace those pages with
the City-only bundle's older tool pages. If either tool is missing at startup, run
`npm run demo:prepare`; the server will report the missing app.

For a full rehearsal, use a fresh browser profile: open the Hub, run **Run demo
check**, visit Academy and Planner, then use **View my city** to confirm the plan
appears in 3D. Open the example City as a separate visit and wait for its models
to finish streaming before presenting the full skyline and gateways. Visit
Workshop, run and inspect a machine with Buddy, save its Champion File, open
Studio, buy and fit gear, save, and return to Workshop. Studio's **Export for AI
City** downloads a GLB that can be uploaded at the City's entrance; the
[Milo fixture and verification](workshop-studio-demo/FIT-CITY-VERIFICATION.md)
show the supported manual handoff. The City project file and the shared
Workshop–Studio `ai-champion` file are separate. Direct round-trip editing of a
City model inside Studio is still queued.

With the server running, set `DEMO_ORIGIN=http://localhost:8378` and run
`npm run test:demo` for the Workshop–Studio journey and Hub navigation. Run
`node tests/workshop-live-demo.mjs` for a real provider reply. City browser
coverage is in `npm run test:e2e`; the example reliability test checks all 119
modeled lots, gateways, and missing-model fallbacks. Use browser Back to return
from Workshop to the City, or the City's Workspaces menu to reach the Hub.

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
