#!/usr/bin/env node
/**
 * Diagnostic-only four-city traffic observation pass.
 *
 * Runs the renderer-free graph at a fixed timestep, then observes the same
 * layouts in Chromium. It never edits a stored student layout or application
 * source. Output is deliberately kept out of deploy/: docs/traffic-observations
 * contains the report and PNG evidence from the most recent run.
 *
 * Usage: node 'P5 Programme/scripts/traffic-observation-pass.mjs'
 * Optional: TRAFFIC_WARMUP_SECONDS=90 TRAFFIC_SAMPLE_SECONDS=120
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createTrafficFlow, initialTrafficPlacements, isRoadsideSceneryClear, trafficFleetPlan } from '../buddy-kit/client/city-common/traffic-network.js';
import { buildSampleCity } from '../buddy-kit/client/city-common/sample-city.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const P5 = resolve(HERE, '..');
const ROOT = resolve(P5, '..');
const OUT = resolve(P5, 'docs/traffic-observations');
const PORT = Number(process.env.TRAFFIC_PORT || 8399);
const WARMUP = Math.max(0, Number(process.env.TRAFFIC_WARMUP_SECONDS || 90));
const SAMPLE = Math.max(1, Number(process.env.TRAFFIC_SAMPLE_SECONDS || 120));
const BROWSER = process.env.TRAFFIC_BROWSER !== '0';
const DT = .1, FRAMES = 360;

const base = (roads, parks = [], buildings = []) => ({ version: 2, scaleMeters: 2000, autoScenery: true, roads, parks, buildings });
const ring = (cx, cz, r, n = 24) => Array.from({ length: n + 1 }, (_, i) => {
  const a = i * Math.PI * 2 / n; return [Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)];
});
const DESIGNS = [
  { id: 'short-straight', title: 'Short straight road', layout: base([{ width: 10, points: [[300, 1000], [1700, 1000]] }]) },
  { id: 'grid-crossing', title: 'Grid crossing', layout: base([
    { width: 12, points: [[300, 1000], [1700, 1000]] }, { width: 12, points: [[1000, 300], [1000, 1700]] },
  ]) },
  { id: 'radial-roundabout', title: 'Radial / roundabout', layout: base([
    { width: 12, points: ring(1000, 1000, 250) },
    { width: 11, points: [[1000, 200], [1000, 750]] }, { width: 11, points: [[1800, 1000], [1250, 1000]] },
    { width: 11, points: [[1000, 1800], [1000, 1250]] }, { width: 11, points: [[200, 1000], [750, 1000]] },
  ], [{ cx: 1000, cz: 1000, radius: 115 }]) },
  { id: 'bundled-example', title: 'Bundled example city', layout: buildSampleCity(), example: true },
];

function bodyGap(a, b) { return Math.abs(a.dist - b.dist) - (a.length + b.length) / 2; }
function bodyAt(v) {
  const l = v.link, t = Math.max(0, Math.min(1, v.dist / l.length)), offset = -Math.min(1.8, (l.width || 9) * .22);
  return { x: l.from.x + (l.to.x - l.from.x) * t - l.dz * offset, z: l.from.z + (l.to.z - l.from.z) * t + l.dx * offset };
}
function runSimulation(design, mobile = false) {
  const flow = createTrafficFlow(design.layout.roads, { seed: 0x4c495645 });
  const fleet = trafficFleetPlan(flow.network, { mobile, density: 1 });
  const placements = initialTrafficPlacements(flow.network, fleet.total, { x: 1000, z: 1000 });
  const result = { frames: FRAMES, cap: fleet.cap, target: fleet.total, initialAdmitted: 0, replacements: 0, rejectedSpawnCandidates: 0,
    minimumBodyGap: Infinity, maximumJunctionWaitSeconds: 0, maxVehicles: 0, occupancy: {}, failures: [] };
  const waiting = new Map();
  const add = (place, replacement = false) => {
    const vehicle = flow.addVehicle({ ...place, kind: replacement ? 'replacement' : 'car', length: 5, width: 2.05, speed: 8 });
    if (vehicle) { if (replacement) result.replacements++; else result.initialAdmitted++; return true; }
    result.rejectedSpawnCandidates++; return false;
  };
  for (const p of placements) add(p);
  for (let frame = 0; frame < FRAMES; frame++) {
    flow.update(DT);
    while (flow.vehicles.length < fleet.total) {
      let admitted = false;
      for (const p of flow.spawnCandidates(5)) { if (add(p, true)) { admitted = true; break; } }
      if (!admitted) break;
    }
    result.maxVehicles = Math.max(result.maxVehicles, flow.vehicles.length);
    if (flow.vehicles.length > fleet.cap) result.failures.push(`frame ${frame}: cap ${fleet.cap} exceeded (${flow.vehicles.length})`);
    for (const [road, count] of Object.entries(flow.vehicles.reduce((m, v) => (m[v.link.roadId] = (m[v.link.roadId] || 0) + 1, m), {}))) result.occupancy[road] = Math.max(result.occupancy[road] || 0, count);
    for (const link of flow.network.links) {
      const ordered = [...link.vehicles].sort((a, b) => a.dist - b.dist);
      for (let i = 1; i < ordered.length; i++) {
        const gap = bodyGap(ordered[i], ordered[i - 1]); result.minimumBodyGap = Math.min(result.minimumBodyGap, gap);
        if (gap < 3 - .001) result.failures.push(`frame ${frame}: following gap ${gap.toFixed(3)}m below 3m`);
      }
    }
    for (let a = 0; a < flow.vehicles.length; a++) for (let b = a + 1; b < flow.vehicles.length; b++) {
      if (flow.vehiclesOverlap(flow.vehicles[a], flow.vehicles[b])) result.failures.push(`frame ${frame}: vehicle body overlap ${a}/${b}`);
    }
    for (const j of flow.network.junctions) {
      if (j.owner && !flow.vehicles.includes(j.owner)) result.failures.push(`frame ${frame}: stale junction owner`);
      for (const v of j.queue) {
        const seconds = (waiting.get(v) || 0) + DT; waiting.set(v, seconds); result.maximumJunctionWaitSeconds = Math.max(result.maximumJunctionWaitSeconds, seconds);
      }
    }
    for (const [v] of waiting) if (!flow.vehicles.includes(v) || !flow.network.junctions.some(j => j.queue.includes(v))) waiting.delete(v);
  }
  if (!Number.isFinite(result.minimumBodyGap)) result.minimumBodyGap = null;
  result.failures = [...new Set(result.failures)].slice(0, 12);
  return result;
}

function server() {
  return spawn(process.execPath, ['P5 Programme/tests/e2e/static-server.mjs', String(PORT)], { cwd: ROOT, stdio: 'pipe' });
}
async function sleep(ms) { await new Promise(resolve => setTimeout(resolve, ms)); }
function liveSnapshot() {
  const city = window.__city, live = city?.traffic, network = live?.network;
  if (!live || !network) return null;
  let overlaps = 0, invalid = 0, missingInstance = 0, stopped = 0, sceneryUnsafe = 0;
  for (let i = 0; i < live.vehicles.length; i++) {
    const v = live.vehicles[i];
    if (![v.x, v.z, v.vx, v.vz, v.dist].every(Number.isFinite)) invalid++;
    if (!v.inst || !v.inst.parent) missingInstance++;
    if (v.currentSpeed === 0 && network.junctionByNode.has(v.link.to.id) && !v.done) stopped++;
    for (let j = i + 1; j < live.vehicles.length; j++) if (live.vehiclesOverlap(v, live.vehicles[j])) overlaps++;
  }
  for (const p of city.scenery?.treePlacements || []) if (!city.scenery.isTreePlacementSafe(p)) sceneryUnsafe++;
  const occupancy = {};
  for (const v of live.vehicles) occupancy[v.link.roadId] = (occupancy[v.link.roadId] || 0) + 1;
  return { count: live.vehicles.length, cap: live.fleet.cap, target: live.fleet.target, occupancy, overlaps, invalid, missingInstance, stopped,
    sceneryUnsafe, trees: city.scenery?.treePlacements?.length || 0, natureInstances: city.natureScenery?.instances || 0,
    robotPopulation: city.pedestrians || null, citizens: city.citizens?.getCount?.() || 0, animatedCitizens: city.citizens?.getStats?.().animated || 0 };
}
async function observe(browser, design, tablet = false) {
  const context = await browser.newContext({ viewport: tablet ? { width: 1024, height: 768 } : { width: 1280, height: 800 }, hasTouch: tablet, deviceScaleFactor: 1 });
  const page = await context.newPage(); const warnings = [];
  page.on('console', m => { if (m.type() === 'error' || /load failed|unknown library|traffic init failed/i.test(m.text())) warnings.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/city-builder/`);
  await page.evaluate((layout) => localStorage.setItem('p5_city_planner_layout_v1', JSON.stringify(layout)), design.layout);
  await page.reload(); await page.locator('#entry-local').click();
  await page.waitForFunction(() => window.__city?.traffic && document.querySelector('#loading.done'), null, { timeout: 60000 });
  await sleep(WARMUP * 1000);
  await page.screenshot({ path: resolve(OUT, `${design.id}-${tablet ? 'tablet-' : ''}opening.png`) });
  const samples = [], stoppedFor = new Map(); let longestStop = 0;
  const intervals = Math.max(1, Math.round(SAMPLE / 5));
  for (let i = 0; i < 5; i++) {
    await sleep(intervals * 1000); const snap = await page.evaluate(liveSnapshot); samples.push(snap);
    for (const v of await page.evaluate(() => (window.__city?.traffic?.vehicles || []).map(v => ({ id: v.id, stopped: v.currentSpeed === 0 && !v.done && window.__city.traffic.network.junctionByNode.has(v.link.to.id) })))) {
      const t = v.stopped ? (stoppedFor.get(v.id) || 0) + intervals : 0; stoppedFor.set(v.id, t); longestStop = Math.max(longestStop, t);
    }
  }
  await page.screenshot({ path: resolve(OUT, `${design.id}-${tablet ? 'tablet-' : ''}aerial.png`) });
  const latest = samples.at(-1); const totals = samples.reduce((acc, s) => { for (const k of ['overlaps','invalid','missingInstance','sceneryUnsafe']) acc[k] = Math.max(acc[k], s?.[k] || 0); return acc; }, {});
  const result = { device: tablet ? 'tablet' : 'desktop', warmupSeconds: WARMUP, sampleSeconds: SAMPLE, samples: samples.length, maximumStoppedSeconds: longestStop,
    maxCount: Math.max(...samples.map(s => s?.count || 0)), occupiedRoads: [...new Set(samples.flatMap(s => Object.keys(s?.occupancy || {})))], latest, ...totals, warnings: [...new Set(warnings)].slice(0, 8) };
  await context.close(); return result;
}

function status(sim, observations) {
  const browserFailures = observations.flatMap(o => [o.overlaps, o.invalid, o.missingInstance, o.sceneryUnsafe].some(Boolean) || o.maximumStoppedSeconds >= o.sampleSeconds ? [`${o.device}: live safety failure`] : []);
  return sim.failures.length || browserFailures.length ? { result: 'FAIL', notes: [...sim.failures, ...browserFailures] } : { result: 'PASS', notes: [] };
}
function report(rows) {
  const lines = ['# Four-city traffic observation pass', '', `Run: ${new Date().toISOString()}  \\`, `Browser window: ${WARMUP}s warm-up + ${SAMPLE}s sampling per case.`, '', '| Design | Deterministic | Browser | Evidence |', '| --- | --- | --- | --- |'];
  for (const row of rows) lines.push(`| ${row.design.title} | ${row.sim.failures.length ? 'FAIL' : 'PASS'} | ${row.observations.length ? row.status.result : 'NOT RUN'} | ${row.evidence.join(', ') || '—'} |`);
  for (const row of rows) {
    lines.push('', `## ${row.design.title} — ${row.observations.length ? row.status.result : 'SIMULATION ' + row.status.result + ' (browser not run)'}`, '', `Simulation: ${row.sim.frames} frames; cap ${row.sim.cap}; max fleet ${row.sim.maxVehicles}; initial admitted ${row.sim.initialAdmitted}; replacements ${row.sim.replacements}; rejected candidates ${row.sim.rejectedSpawnCandidates}; min same-link body gap ${row.sim.minimumBodyGap == null ? 'n/a' : row.sim.minimumBodyGap.toFixed(2) + 'm'}; max junction wait ${row.sim.maximumJunctionWaitSeconds.toFixed(1)}s; peak per-road occupancy ${JSON.stringify(row.sim.occupancy)}.`, '');
    if (!row.observations.length) lines.push('- Browser observation not run (TRAFFIC_BROWSER=0).');
    for (const o of row.observations) lines.push(`- ${o.device}: max fleet ${o.maxCount}/${o.latest.cap}; roads seen ${o.occupiedRoads.length}; overlaps ${o.overlaps}; invalid/missing renders ${o.invalid}/${o.missingInstance}; max stopped ${o.maximumStoppedSeconds}s; unsafe trees ${o.sceneryUnsafe}/${o.latest.trees}; robots ${o.latest.robotPopulation === null ? 'absent' : 'PRESENT'}; citizens ${o.latest.citizens} (${o.latest.animatedCitizens} animated).${o.warnings.length ? ` Warnings: ${o.warnings.join(' | ')}` : ''}`);
    if (row.status.notes.length) lines.push('', `Findings: ${row.status.notes.join('; ')}`);
  }
  lines.push('', 'Interpretation: a PASS means the observed window had no graph/body overlap, stale render state, scenery breach, or permanently stopped junction vehicle. This is a diagnostic snapshot, not a proof over arbitrary layouts.');
  return lines.join('\n') + '\n';
}

await rm(OUT, { recursive: true, force: true }); await mkdir(OUT, { recursive: true });
const sims = DESIGNS.map(d => ({ design: d, sim: runSimulation(d) }));
if (BROWSER) {
const child = server();
try {
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error('static server did not start')), 10000);
    const fail = (data) => { clearTimeout(timer); reject(new Error(`static server failed: ${String(data)}`)); };
    child.stdout.on('data', data => { if (String(data).includes('on :')) { clearTimeout(timer); resolveReady(); } });
    child.stderr.on('data', fail); child.once('error', fail); child.once('exit', code => { if (code) fail(`exit ${code}`); });
  });
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  for (const row of sims) {
    console.log(`[traffic-observation] ${row.design.id}: desktop`);
    row.observations = [await observe(browser, row.design)];
    if (row.design.example) { console.log(`[traffic-observation] ${row.design.id}: tablet`); row.observations.push(await observe(browser, row.design, true)); }
    row.status = status(row.sim, row.observations);
    row.evidence = row.observations.flatMap(o => [`${row.design.id}-${o.device === 'tablet' ? 'tablet-' : ''}opening.png`, `${row.design.id}-${o.device === 'tablet' ? 'tablet-' : ''}aerial.png`]);
  }
  await browser.close();
} finally { child.kill('SIGTERM'); }
} else {
  for (const row of sims) { row.observations = []; row.status = { result: row.sim.failures.length ? 'FAIL' : 'PASS', notes: row.sim.failures }; row.evidence = []; }
}
await writeFile(resolve(OUT, 'REPORT.md'), report(sims));
console.log(resolve(OUT, 'REPORT.md'));
