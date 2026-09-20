# Four-city traffic observation pass

Run: 2026-09-17T22:45:49.314Z  \
Browser window: 90s warm-up + 120s sampling per case.

| Design | Deterministic | Browser | Evidence |
| --- | --- | --- | --- |
| Short straight road | PASS | NOT RUN | — |
| Grid crossing | PASS | NOT RUN | — |
| Radial / roundabout | PASS | NOT RUN | — |
| Bundled example city | PASS | NOT RUN | — |

## Short straight road — SIMULATION PASS (browser not run)

Simulation: 360 frames; cap 42; max fleet 37; initial admitted 20; replacements 17; rejected candidates 343; min same-link body gap 3.00m; max junction wait 0.0s; peak per-road occupancy {"0":37}.

- Browser observation not run (TRAFFIC_BROWSER=0).

## Grid crossing — SIMULATION PASS (browser not run)

Simulation: 360 frames; cap 42; max fleet 42; initial admitted 11; replacements 31; rejected candidates 965; min same-link body gap 3.00m; max junction wait 0.1s; peak per-road occupancy {"0":21,"1":21}.

- Browser observation not run (TRAFFIC_BROWSER=0).

## Radial / roundabout — SIMULATION PASS (browser not run)

Simulation: 360 frames; cap 42; max fleet 42; initial admitted 18; replacements 24; rejected candidates 520; min same-link body gap 3.00m; max junction wait 0.0s; peak per-road occupancy {"0":34,"1":3,"2":3,"3":3,"4":3}.

- Browser observation not run (TRAFFIC_BROWSER=0).

## Bundled example city — SIMULATION PASS (browser not run)

Simulation: 360 frames; cap 42; max fleet 42; initial admitted 33; replacements 11; rejected candidates 340; min same-link body gap 3.00m; max junction wait 0.0s; peak per-road occupancy {"0":4,"1":2,"2":4,"3":3,"4":15,"5":4,"6":3,"7":3,"8":3,"9":10}.

- Browser observation not run (TRAFFIC_BROWSER=0).

Interpretation: a PASS means the observed window had no graph/body overlap, stale render state, scenery breach, or permanently stopped junction vehicle. This is a diagnostic snapshot, not a proof over arbitrary layouts.
