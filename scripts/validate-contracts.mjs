#!/usr/bin/env node
/**
 * validate-contracts (§8) — the portable, tool-agnostic gate.
 * Runs AFTER `tsc --build`, so it imports the COMPILED contract (robust ESM).
 *
 * Checks, per game:
 *  - manifest parses against the Zod GameManifest schema
 *  - a11y two-channel redundancy (R17): >=2 instruction + >=2 input channels, `tap` always present
 *  - aiRepresentation is present (truth-in-representation labeling, §5b)
 * Across primary subsystems:
 *  - dependsOn forms a DAG (no cycles, no dangling refs) — §4c
 *  - subsystem ids are unique
 *
 * With no games yet, it confirms the contract scaffolding loads and exits 0.
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

const contractDist = join(root, 'packages', 'contract', 'dist', 'index.js');
if (!existsSync(contractDist)) {
  console.error('validate-contracts: contract not built. Run `npm run typecheck` first.');
  process.exit(1);
}
const { GameManifest } = await import(pathToFileURL(contractDist).href);

/** Discover compiled game manifests under games/<track>/<id>/dist/manifest.js */
function findGameManifests() {
  const found = [];
  for (const track of ['kindergarten', 'primary']) {
    const trackDir = join(root, 'games', track);
    if (!existsSync(trackDir)) continue;
    for (const id of readdirSync(trackDir)) {
      const dir = join(trackDir, id);
      if (!statSync(dir).isDirectory()) continue;
      const built = join(dir, 'dist', 'manifest.js');
      if (existsSync(built)) found.push({ track, id, built });
    }
  }
  return found;
}

console.log('validate-contracts:');
const manifests = findGameManifests();

if (manifests.length === 0) {
  ok('contract loads; no games yet — scaffolding OK');
  process.exit(process.exitCode ?? 0);
}

const subsystems = new Map(); // id -> dependsOn[]
for (const { track, id, built } of manifests) {
  const mod = await import(pathToFileURL(built).href);
  const parsed = GameManifest.safeParse(mod.manifest);
  if (!parsed.success) {
    fail(`[${track}/${id}] manifest invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    continue;
  }
  const m = parsed.data;

  // a11y two-channel redundancy (R17): tap must always be present
  if (!m.a11y.inputChannels.includes('tap')) {
    fail(`[${track}/${id}] a11y.inputChannels must always include 'tap' (R17)`);
  }

  // subsystem registry for DAG check
  if (mod.subsystem?.id) {
    if (subsystems.has(mod.subsystem.id)) fail(`duplicate subsystem id '${mod.subsystem.id}'`);
    subsystems.set(mod.subsystem.id, mod.subsystem.dependsOn ?? []);
  }
  ok(`[${track}/${id}] ${m.id} — manifest + a11y OK`);
}

// dependsOn DAG check (§4c): no dangling refs, no cycles
for (const [id, deps] of subsystems) {
  for (const d of deps) if (!subsystems.has(d)) fail(`subsystem '${id}' dependsOn unknown '${d}'`);
}
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map([...subsystems.keys()].map((k) => [k, WHITE]));
const visit = (n, stack) => {
  if (color.get(n) === GRAY) return fail(`dependsOn cycle: ${[...stack, n].join(' -> ')}`);
  if (color.get(n) === BLACK) return;
  color.set(n, GRAY);
  for (const d of subsystems.get(n) ?? []) visit(d, [...stack, n]);
  color.set(n, BLACK);
};
for (const id of subsystems.keys()) visit(id, []);

if (!process.exitCode) ok(`${manifests.length} game(s), ${subsystems.size} subsystem(s) — all valid`);
