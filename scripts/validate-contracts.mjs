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
 * Curriculum registry consistency (docs/curriculum/lessons.json, see docs/curriculum/README.md):
 *  - every game folder, source intake dir, and blueprint file follows {band}-{NN}-{slug}
 *  - and matches a registry entry (track/band/lesson -> slug; ageBand == band, lesson == NN)
 *  - tracks whose registry is not yet defined (e.g. primary's taxonomy is TBD) are SKIPPED
 *
 * With no games yet, it confirms the contract scaffolding loads and exits 0.
 */
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ---- curriculum naming/registry (docs/curriculum/README.md) ----
/** Which bands belong to which track. Lesson numbers reset per band, so band is required. */
const BAND_BY_TRACK = { kindergarten: ['k2', 'k3'], primary: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] };
/** The one slug shape, both tracks: {band}-{NN}-{slug}, NN zero-padded to 2 digits. */
const SLUG_RE = /^(k2|k3|p[1-6])-(\d{2})-(.+)$/;

/**
 * Load docs/curriculum/lessons.json into a lookup. Returns `{ byKey, hasTrack }` where
 * `byKey` maps `${track}/${band}/${lesson}` -> entry and `hasTrack(t)` is true only when the
 * registry actually defines lessons for that track (so an undefined track is skipped, not failed).
 */
function loadRegistry() {
  const p = join(root, 'docs', 'curriculum', 'lessons.json');
  if (!existsSync(p)) {
    fail('docs/curriculum/lessons.json missing (curriculum registry — see docs/curriculum/README.md)');
    return null;
  }
  let reg;
  try {
    reg = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`docs/curriculum/lessons.json is invalid JSON: ${e.message}`);
    return null;
  }
  const byKey = new Map();
  const tracks = new Set();
  for (const track of ['kindergarten', 'primary']) {
    const bands = reg[track];
    if (!bands || typeof bands !== 'object') continue;
    for (const [band, list] of Object.entries(bands)) {
      if (!Array.isArray(list)) continue; // skip metadata like primary._note
      tracks.add(track);
      for (const e of list) {
        if (typeof e.lesson !== 'number' || typeof e.slug !== 'string') {
          fail(`lessons.json ${track}/${band}: every entry needs a numeric 'lesson' + string 'slug'`);
          continue;
        }
        byKey.set(`${track}/${band}/${e.lesson}`, { ...e, track, band });
      }
    }
  }
  return { byKey, hasTrack: (t) => tracks.has(t) };
}

/**
 * Assert one slug (a game folder, source dir, or blueprint name) is well-formed AND present in
 * the registry for its track. `onMatch(entry, parsed)` runs extra checks when it resolves.
 */
function checkSlug(where, track, slug, registry, onMatch) {
  const m = SLUG_RE.exec(slug);
  const bands = (BAND_BY_TRACK[track] ?? []).join('/');
  if (!m) {
    fail(`${where}: '${slug}' must be {band}-{NN}-{slug} (band ${bands}; NN = 2 digits)`);
    return;
  }
  const [, band, nn, rest] = m;
  if (!(BAND_BY_TRACK[track] ?? []).includes(band)) {
    fail(`${where}: band '${band}' is not valid for track '${track}' (expected ${bands})`);
    return;
  }
  const lesson = parseInt(nn, 10);
  const entry = registry.byKey.get(`${track}/${band}/${lesson}`);
  if (!entry) {
    fail(`${where}: no '${track}/${band}' lesson ${lesson} in docs/curriculum/lessons.json`);
    return;
  }
  if (entry.slug !== rest) {
    fail(`${where}: slug '${rest}' != registry slug '${entry.slug}' (${track}/${band} L${lesson})`);
    return;
  }
  if (onMatch) onMatch(entry, { band, nn, lesson, slug: rest });
}

/**
 * Curriculum gate: built games, source intake dirs, game dirs, and blueprint files must all obey
 * the naming rule and match the registry. `parsedGames` are the manifests already parsed above.
 */
function validateCurriculum(parsedGames) {
  console.log('validate-curriculum:');
  const registry = loadRegistry();
  if (!registry) return;

  // Built games: folder name == manifest id, and ageBand/lesson agree with the slug + registry.
  for (const { track, id, m } of parsedGames) {
    if (!registry.hasTrack(track)) continue; // registry pending for this track
    checkSlug(`game ${track}/${id}`, track, id, registry, (_entry, parsed) => {
      if (id !== m.id) fail(`game ${track}/${id}: manifest id '${m.id}' must equal the folder name`);
      if (m.lesson !== parsed.lesson)
        fail(`game ${track}/${id}: manifest lesson ${m.lesson} != slug lesson ${parsed.lesson}`);
      if (m.ageBand !== parsed.band.toUpperCase())
        fail(`game ${track}/${id}: ageBand '${m.ageBand}' must be '${parsed.band.toUpperCase()}'`);
      if (m.track !== track) fail(`game ${track}/${id}: manifest track '${m.track}' != folder track`);
    });
  }

  // Every dir under source/<track>/ and games/<track>/ must follow the naming rule + be registered.
  for (const base of ['source', 'games']) {
    for (const track of ['kindergarten', 'primary']) {
      if (!registry.hasTrack(track)) continue;
      const dir = join(root, base, track);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!statSync(join(dir, name)).isDirectory()) continue; // skip loose source files (.pdf/.docx)
        checkSlug(`${base}/${track}/${name}`, track, name, registry);
      }
    }
  }

  // Blueprints: docs/curriculum/<track>-<band>-NN-<slug>.md (skip README.md + non-markdown).
  const curDir = join(root, 'docs', 'curriculum');
  for (const name of readdirSync(curDir)) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const tm = /^(kindergarten|primary)-(.+)\.md$/.exec(name);
    if (!tm) {
      fail(`curriculum '${name}': must be <track>-<band>-NN-<slug>.md`);
      continue;
    }
    if (!registry.hasTrack(tm[1])) continue;
    checkSlug(`curriculum ${name}`, tm[1], tm[2], registry);
  }

  if (!process.exitCode) ok('game/source/blueprint slugs match docs/curriculum/lessons.json');
}

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
const parsedGames = []; // {track, id, m} collected for the curriculum cross-check below

if (manifests.length === 0) {
  ok('contract loads; no games yet — scaffolding OK');
} else {
  const subsystems = new Map(); // id -> dependsOn[]
  for (const { track, id, built } of manifests) {
    const mod = await import(pathToFileURL(built).href);
    const parsed = GameManifest.safeParse(mod.manifest);
    if (!parsed.success) {
      fail(`[${track}/${id}] manifest invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    const m = parsed.data;
    parsedGames.push({ track, id, m });

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
}

// Curriculum registry consistency runs whether or not games exist (it also checks source/blueprints).
validateCurriculum(parsedGames);

process.exit(process.exitCode ?? 0);
