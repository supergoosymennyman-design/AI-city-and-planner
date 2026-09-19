#!/usr/bin/env node
/**
 * library-audit.mjs — dead-asset + catalog integrity gate for the shared 3D model library.
 *
 * Reads `buddy-kit/client/city-common/library.js` and cross-checks it against the files
 * actually on disk under `buddy-kit/client/library/`. Emits:
 *   1. MISSING   — a LIBRARY entry points at a glb that does not exist on disk (FATAL).
 *   2. NO_THUMB  — a catalogued entry has no `library/thumbnails/<id>.png` (FATAL — the
 *                  picker renders a broken card).
 *   3. DUPLICATE — two entries point at the same glb file (WARNING — usually means a
 *                  cataloguing mistake, but is not a runtime break).
 * 4. ORPHANS   — glbs on disk with no LIBRARY entry (WARNING — deliberately kept for
 *                  future cataloguing, but should never grow silently without a review).
 * 5. PROVENANCE — every SHIPPED glb (shared library + runtime asset roots) must have a
 *                  license/provenance entry: an exact/brace-expanded token in
 *                  `library/CC0-MANIFEST.md` OR a line in `scripts/cc0-provenance.list`
 *                  (the generated snapshot). A shipped GLB with no entry FAILS — this is
 *                  the slip-catcher that stops a future CC-BY/NC asset reaching deploy.
 *                  `--write-provenance` regenerates the snapshot. Bootstrap rule: on the
 *                  FIRST run it snapshots the whole disk; afterwards it only KEEPS files
 *                  that are manifest-documented OR already in the snapshot, so a brand-new
 *                  undocumented GLB can never be silently blessed by a blind regenerate
 *                  (add its CC0-MANIFEST row first, then regenerate).
 *
 * Exit code: 0 = clean (orphans allowed), 1 = any MISSING/NO_THUMB/DUPLICATE/PROVENANCE failure.
 * Run from P5 Programme/. Optional `--orphan-limit N` makes orphan overage fail too.
 *
 * Usage:
 *   node scripts/library-audit.mjs                      # check only
 *   node scripts/library-audit.mjs --orphan-limit 5     # fail if >5 orphans
 *   node scripts/library-audit.mjs --write-report       # rewrite library/ORPHANED-GLBS.md
 *   node scripts/library-audit.mjs --write-provenance   # regenerate scripts/cc0-provenance.list
 */
import { readdirSync, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY } from '../buddy-kit/client/city-common/library.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CLIENT = join(ROOT, 'buddy-kit/client');
const LIB_DIR = join(CLIENT, 'library');
const THUMBS_DIR = join(LIB_DIR, 'thumbnails');
const REPORT_PATH = join(LIB_DIR, 'ORPHANED-GLBS.md');
const MANIFEST_PATH = join(CLIENT, 'library', 'CC0-MANIFEST.md');
const COMMERCIAL_VEHICLE_INTAKE_PATH = join(CLIENT, 'library', 'COMMERCIAL-VEHICLE-INTAKE.json');
const PROVENANCE_LIST = join(HERE, 'cc0-provenance.list');
const ENV_MANIFEST_PATH = join(CLIENT, 'city-builder', 'assets', 'environment-manifest.json');
// Roots whose GLBs SHIP with the apps (library + city-builder assets + champion
// runtime + the hub hero). Paths relative to buddy-kit/client/.
const PROVENANCE_ROOTS = [
  'library',
  'city-builder/assets/models',
  'champion-city/assets',
  'home',
];

const args = process.argv.slice(2);
const orphanLimit = (() => {
  const i = args.indexOf('--orphan-limit');
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();
const writeReport = args.includes('--write-report');
const writeProvenance = args.includes('--write-provenance');

/** Normalise a filesystem path to a client-relative, forward-slash string. */
function toPosix(p) { return String(p).split(sep).join('/'); }

/** Walk a dir, returning relative paths (forward-slash) matching a suffix filter. */
function walk(dir, suffix) {
  const out = [];
  const rec = (d, prefix = '') => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) rec(join(d, e.name), rel);
      else if (suffix && rel.endsWith(suffix)) out.push(rel);
    }
  };
  rec(dir);
  return out;
}

/** Resolve a LIBRARY glb path (relative to city-common/) to an absolute file path. */
function resolveGlb(glb) {
  const cleaned = String(glb).replace(/^\.\.\//, '');
  return join(CLIENT, cleaned);
}

// ── 1. Catalog-derived facts ──────────────────────────────────────────────────
const missing = [];
const noThumb = [];
const dupCount = new Map();
const refPaths = new Set();
const oversized = [];   // GLBs that risk breaking the Workers deploy (>24MiB) or hammer tablets (>15MiB)
const OVERFAIL_BYTES = 24 * 1024 * 1024;   // Cloudflare Workers assets reject >25MiB — fail before deploy
const OVERWARN_BYTES = 15 * 1024 * 1024;   // heavy tablet downloads — warn

for (const e of LIBRARY) {
  const abs = resolveGlb(e.glb);
  if (!existsSync(abs)) missing.push({ id: e.id, glb: e.glb });
  refPaths.add(e.glb);
  if (!existsSync(join(THUMBS_DIR, `${e.id}.png`))) noThumb.push(e.id);
  const key = e.glb.replace(/^\.\.\//, '');
  dupCount.set(key, (dupCount.get(key) || 0) + 1);
  if (existsSync(abs)) {
    const bytes = statSync(abs).size;
    if (bytes > OVERFAIL_BYTES) oversized.push({ id: e.id, glb: e.glb, bytes, fatal: true });
    else if (bytes > OVERWARN_BYTES) oversized.push({ id: e.id, glb: e.glb, bytes, fatal: false });
  }
}
const duplicates = [...dupCount.entries()].filter(([, n]) => n > 1);
const oversizedFatal = oversized.filter((o) => o.fatal);

// ── 2. Disk-derived facts ────────────────────────────────────────────────────
const diskGlbs = new Set(walk(LIB_DIR, '.glb'));
const referencedOnDisk = new Set(
  [...refPaths].map((g) => g.replace(/^\.\.\//, '').replace(/^library\//, ''))
);
const orphans = [...diskGlbs].filter((p) => !referencedOnDisk.has(p)).sort();

// ── 2.5 Provenance gate (shipped GLBs must have a license entry) ────────────
function braceExpand(tok) {
  const m = /^([^{]*)\{([^{}]*)\}(.*)$/.exec(tok);
  if (!m) return [tok];
  const out = [];
  for (const alt of m[2].split(',')) out.push(...braceExpand(m[1] + alt + m[3]));
  return out;
}
function manifestCoveredPaths() {
  const set = new Set();
  let txt = '';
  try { txt = readFileSync(MANIFEST_PATH, 'utf8'); } catch { return set; }
  for (const m of txt.matchAll(/`([^`]+)`/g)) {
    const tok = m[1].trim();
    if (!/\.glb$/i.test(tok)) continue;
    for (const p of braceExpand(tok)) {
      const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
      if (/\.glb$/i.test(norm)) set.add(norm);
    }
  }
  return set;
}
function shippedGlbs() {
  const out = new Set();
  for (const root of PROVENANCE_ROOTS) {
    const absRoot = join(CLIENT, root);
    if (!existsSync(absRoot)) continue;
    for (const rel of walk(absRoot, '.glb')) out.add(toPosix(root + '/' + rel));
  }
  return out;
}
function readProvenanceList() {
  try { return new Set(readFileSync(PROVENANCE_LIST, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)); }
  catch { return new Set(); }
}

const manifestCovered = manifestCoveredPaths();
const shipped = shippedGlbs();
if (writeProvenance) {
  // Bootstrap (no list yet) snapshots the whole disk. Afterwards the snapshot
  // only keeps manifest-documented files + files already in it — a brand-new
  // undocumented GLB cannot sneak in through a blind regenerate.
  const old = readProvenanceList();
  const allowed = new Set([...manifestCovered, ...old]);
  const next = [...shipped].filter((p) => old.size === 0 || allowed.has(p)).sort();
  writeFileSync(PROVENANCE_LIST, next.join('\n') + '\n');
  console.log(`[library-audit] provenance snapshot written: ${next.length} GLBs (${PROVENANCE_LIST})`);
}
const provenanceEntries = readProvenanceList();
const noProvenance = [...shipped].filter((p) => !manifestCovered.has(p) && !provenanceEntries.has(p)).sort();

// The catalogue is CC0-only except for the tightly scoped, owner-vetted road
// vehicle batch.  The JSON file is deliberately an allow-list: a record must
// be explicitly accepted and point at exactly one shipped library vehicle.
// This is not a generic commercial-use escape hatch.
const commercialVehicleProblems = [];
try {
  const intake = JSON.parse(readFileSync(COMMERCIAL_VEHICLE_INTAKE_PATH, 'utf8'));
  if (intake.version !== 1 || !Array.isArray(intake.records)) throw new Error('missing version 1 records array');
  const accepted = intake.records.filter((r) => r && r.status === 'accepted');
  const acceptedIds = new Set();
  for (const r of accepted) {
    if (!r.id || !r.glb || !r.license || r.license !== 'owner-vetted-commercial-use') {
      commercialVehicleProblems.push(`invalid accepted record: ${r.id || 'unknown'}`); continue;
    }
    if (!/^library\/vehicles\/[a-z0-9_-]+\.glb$/i.test(r.glb)) commercialVehicleProblems.push(`out-of-scope GLB: ${r.id}`);
    if (acceptedIds.has(r.id)) commercialVehicleProblems.push(`duplicate accepted id: ${r.id}`);
    acceptedIds.add(r.id);
    const item = LIBRARY.find((e) => e.id === r.id);
    if (!item || item.commercialVehicle !== true || item.glb.replace(/^\.\.\//, '') !== r.glb) commercialVehicleProblems.push(`catalogue mismatch: ${r.id}`);
  }
  for (const item of LIBRARY.filter((e) => e.commercialVehicle === true)) {
    if (!acceptedIds.has(item.id)) commercialVehicleProblems.push(`unapproved commercial vehicle: ${item.id}`);
  }
} catch (error) { commercialVehicleProblems.push(`invalid commercial vehicle intake: ${error.message}`); }

// Environment maps are not catalogued GLBs, so enforce their provenance and
// processed-file records separately. Reserved HDRI sources remain offline-safe.
const environmentProblems = [];
try {
  const env = JSON.parse(readFileSync(ENV_MANIFEST_PATH, 'utf8'));
  if (!Number.isInteger(env.version) || env.version < 1 || !Array.isArray(env.assets)) throw new Error('missing version/assets');
  for (const asset of env.assets) {
    if (asset.license !== 'CC0' || !asset.sourceUrl) environmentProblems.push(`bad provenance: ${asset.id || 'unknown'}`);
    for (const file of asset.processed || []) {
      const abs = join(CLIENT, 'city-builder', 'assets', file.file);
      if (!existsSync(abs)) environmentProblems.push(`missing processed file: ${file.file}`);
      else if (!Number.isInteger(file.bytes) || file.bytes !== statSync(abs).size) environmentProblems.push(`bad byte size: ${file.file}`);
      if (!file.role) environmentProblems.push(`missing role: ${file.file}`);
    }
  }
} catch (error) { environmentProblems.push(`invalid environment manifest: ${error.message}`); }

// ── 3. Report ────────────────────────────────────────────────────────────────
const lines = [];
lines.push('# Orphaned GLB Identification Report');
lines.push('');
lines.push(`Auto-generated by \`scripts/library-audit.mjs\` on ${new Date().toISOString().slice(0, 10)}.`);
lines.push('');
lines.push(`- **Catalogued entries:** ${LIBRARY.length}`);
lines.push(`- **GLBs on disk:** ${diskGlbs.size}`);
lines.push(`- **Referenced by library.js:** ${refPaths.size}`);
lines.push(`- **Orphaned (no entry):** ${orphans.length}`);
lines.push(`- **Missing on disk (referenced but absent):** ${missing.length}`);
lines.push(`- **Entries with no thumbnail:** ${noThumb.length}`);
lines.push(`- **Duplicate glb paths:** ${duplicates.length}`);
lines.push('');
lines.push('> Orphans are DELIBERATELY kept in the library so they can be catalogued later.');
lines.push('> This report fails CI when the count grows past the orphan limit set in CI.');
lines.push('');
lines.push('## Orphans');
lines.push('');
if (orphans.length) {
  for (const o of orphans) lines.push(`- \`${o}\``);
} else {
  lines.push('_None._');
}

const reportText = lines.join('\n') + '\n';
if (writeReport) writeFileSync(REPORT_PATH, reportText);

// ── 4. Verdict ───────────────────────────────────────────────────────────────
const fatal = missing.length + noThumb.length + duplicates.length + oversizedFatal.length + noProvenance.length + environmentProblems.length + commercialVehicleProblems.length;
const orphanFail = orphans.length > orphanLimit;
const status = fatal === 0 && !orphanFail ? 'PASS' : 'FAIL';

console.log(`[library-audit] entries=${LIBRARY.length} onDisk=${diskGlbs.size} orphans=${orphans.length} missing=${missing.length} noThumb=${noThumb.length} dup=${duplicates.length} oversized=${oversized.length}(fatal=${oversizedFatal.length}) shipped=${shipped.size} noProvenance=${noProvenance.length}`);
if (missing.length) {
  console.log(`[library-audit] MISSING (fatal):`);
  for (const m of missing) console.log(`  ✗ ${m.id} -> ${m.glb}`);
}
if (noThumb.length) {
  console.log(`[library-audit] NO_THUMB (fatal):`);
  for (const id of noThumb.slice(0, 20)) console.log(`  ✗ ${id}`);
}
if (duplicates.length) {
  console.log(`[library-audit] DUPLICATE (warning):`);
  for (const [p, n] of duplicates) console.log(`  ⚠ ${p} ×${n}`);
}
if (oversized.length) {
  console.log(`[library-audit] OVERSIZED GLB (${oversizedFatal.length ? 'fatal — >24MiB breaks the Workers deploy' : 'warnings — heavy tablet downloads'}):`);
  for (const o of oversized) console.log(`  ${o.fatal ? '✗' : '⚠'} ${o.id} ${o.glb} ${(o.bytes / 1048576).toFixed(1)}MiB`);
}
if (commercialVehicleProblems.length) {
  console.log('[library-audit] COMMERCIAL VEHICLE INTAKE (fatal):');
  for (const problem of commercialVehicleProblems) console.log(`  ✗ ${problem}`);
}
if (orphans.length) {
  console.log(`[library-audit] ORPHANS (warning):`);
  for (const o of orphans) console.log(`  ⚠ ${o}`);
  if (orphanFail) console.log(`[library-audit] ORPHAN LIMIT EXCEEDED (limit ${orphanLimit})`);
}
if (noProvenance.length) {
  console.log(`[library-audit] NO_PROVENANCE (fatal — add a CC0-MANIFEST row, then re-run --write-provenance):`);
  for (const p of noProvenance) console.log(`  ✗ ${p}`);
}
if (environmentProblems.length) {
  console.log(`[library-audit] ENVIRONMENT MANIFEST (fatal):`);
  for (const problem of environmentProblems) console.log(`  ✗ ${problem}`);
}
console.log(`[library-audit] ${status}`);
process.exit(fatal === 0 && !orphanFail ? 0 : 1);
