#!/usr/bin/env node
/**
 * check-imports.mjs — import-graph-vs-bundle checker for the P5 apps.
 *
 * Walks each app's ENTRY HTML → module-script → ES-module import graph and
 * verifies every referenced file exists BOTH:
 *   1. in the SOURCE tree  (buddy-kit/client/<app>) — a broken source ref, and
 *   2. in the BUILT bundle (deploy/<worker>/<app>)  — the "referenced but not
 *      shipped" class of bug that took down planner/i18n.js (the module existed
 *      in source but the deploy copy-list omitted it → live 404).
 *
 * The app-dir FLATTEN is handled by mapping each app's source dir to its
 * deployed location under the shared city-sim worker:
 *     city-planner/ → deploy/city-sim/planner/
 *     city-pregame/ → deploy/city-sim/pregame/
 *     city-builder/ → deploy/city-sim/city-builder/
 *     home/         → deploy/home/  (separate worker)
 * Shared dirs (city-common/, shared/, champion-city/, ...) sit at the worker
 * root in both trees, so relative '../city-common/x.js' resolves identically.
 *
 * Only RELATIVE module specifiers ('./x.js', '../y/z.js') and root-absolute
 * ('/x.js') are followed. Bare specifiers ('three', 'three/addons/...') are
 * importmap aliases resolved by the browser and are skipped here.
 *
 * Exit code: 0 = every referenced file exists; 1 = any missing source OR bundle
 * file (or an unresolvable module graph).
 *
 * Usage (from P5 Programme/):
 *   node scripts/check-imports.mjs                    # source + both bundles (if built)
 *   node scripts/check-imports.mjs --deploy-dir city-sim   # only the city-sim worker
 *   node scripts/check-imports.mjs --deploy-dir home       # only the home worker
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');                    // P5 Programme/
const CLIENT = join(ROOT, 'buddy-kit', 'client');
const DEPLOY = join(ROOT, 'deploy');

const args = process.argv.slice(2);
const deployDirArg = (() => {
  const i = args.indexOf('--deploy-dir');
  return i >= 0 ? args[i + 1] : null;
})();

// id -> { source dir under CLIENT, worker bundle dir under DEPLOY, sub path in bundle }
const APPS = [
  { id: 'city-builder', source: 'city-builder', worker: 'city-sim',  sub: 'city-builder' },
  { id: 'planner',      source: 'city-planner', worker: 'city-sim',  sub: 'planner' },
  { id: 'pregame',      source: 'city-pregame', worker: 'city-sim',  sub: 'pregame' },
  { id: 'home',         source: 'home',         worker: 'home',      sub: '' },
];

// city-sim deploy dir-name → source dir-name (the FLATTEN: planner/pregame).
const CITY_SIM_FLATTEN = { planner: 'city-planner', pregame: 'city-pregame' };

const errors = [];
let checkedFiles = 0;

const SPEC_RE = /\bfrom\s*['"]([^'"]+)['"]/g;                        // static import/export
const SIDE_IMPORT_RE = /\bimport\s*['"]([^'"]+)['"]/g;               // side-effect import
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;  // dynamic import()

/** Extract the relative specifiers an ES module references. */
function specifiersOf(js) {
  const out = new Set();
  for (const re of [SPEC_RE, SIDE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    for (const m of js.matchAll(re)) {
      const s = m[1];
      if (s.startsWith('./') || s.startsWith('../') || s.startsWith('/')) out.add(s);
      // bare ('three', 'three/addons/...') → importmap alias → skip
    }
  }
  return out;
}

/** Extract `<script type="module" src="...">` sources from an HTML file. */
function moduleScriptsOf(html) {
  const out = [];
  for (const tag of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = tag[1];
    if (!/\btype\s*=\s*["']module["']/.test(attrs)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/.exec(attrs);
    if (src) out.push(src[1]);
  }
  return out;
}

function posix(p) { return p.split(sep).join('/'); }

/** Source-tree path for a built-bundle file under a worker root. */
function sourceForDeploy(worker, deployAbs) {
  const workerAbs = join(DEPLOY, worker);
  const rel = posix(deployAbs).replace(posix(workerAbs) + '/', '').replace(/^\//, '');
  if (!rel) return join(CLIENT, worker === 'home' ? 'home' : '');
  const parts = rel.split('/');
  if (worker === 'city-sim' && CITY_SIM_FLATTEN[parts[0]]) parts[0] = CITY_SIM_FLATTEN[parts[0]];
  // city-sim worker root maps to CLIENT/ (planner→city-planner etc.); the home
  // worker root maps to CLIENT/home/.
  const base = worker === 'home' ? join(CLIENT, 'home') : CLIENT;
  return join(base, ...parts);
}

/**
 * Resolve a specifier to an absolute path. `rootAbs` is the worker's bundle
 * root for absolute ('/…') specifiers; relative ones resolve from the importer.
 * Returns null when the result escapes the worker/source root (can't ship it).
 */
function resolveSpec(spec, importerAbs, rootAbs) {
  if (spec.startsWith('/')) {
    return normalize(join(rootAbs, ...spec.split('/').filter(Boolean)));
  }
  const abs = normalize(join(dirname(importerAbs), spec));
  const root = posix(rootAbs) + '/';
  if (!posix(abs).startsWith(root)) return null;   // walked out of the bundle
  return abs;
}

/**
 * Strip JS comments (line // and block /star..star/) WITHOUT mangling strings
 * that contain '//' (e.g. https URLs) — otherwise usage-comment examples can be
 * mistaken for real import specifiers.
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 'code';          // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += c; i += 1; continue; }
      if (c === '"') { mode = 'dq'; out += c; i += 1; continue; }
      if (c === '`') { mode = 'tpl'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out += c; }
      i += 1; continue;
    }
    if (mode === 'block') {
      if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; }
      i += 1; continue;
    }
    // In a string, honour backslash escapes and don't treat '//' as a comment.
    if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
    out += c;
    const close = (mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`');
    if (close) mode = 'code';
    i += 1;
  }
  return out;
}

function scanFile(deployAbs, worker, visited, sourceMissing, bundleMissing) {
  const key = posix(deployAbs);
  if (visited.has(key)) return;
  visited.add(key);
  const sourceAbs = sourceForDeploy(worker, deployAbs);
  const isHtml = deployAbs.endsWith('.html');
  let text = '';
  try { text = readFileSync(deployAbs, 'utf8'); } catch { bundleMissing.push(deployAbs); return; }
  if (!existsSync(sourceAbs)) sourceMissing.push({ file: deployAbs, source: sourceAbs });
  checkedFiles++;

  const refs = isHtml ? moduleScriptsOf(text) : specifiersOf(stripJsComments(text));
  for (const spec of refs) {
    const childDeploy = resolveSpec(spec, deployAbs, join(DEPLOY, worker));
    if (!childDeploy) continue;   // outside the worker root — not a bundle file
    if (isHtml || /\.(js|mjs)$/.test(childDeploy)) {
      if (!existsSync(childDeploy)) bundleMissing.push(childDeploy);
      else scanFile(childDeploy, worker, visited, sourceMissing, bundleMissing);
    } else if (!existsSync(childDeploy)) {
      bundleMissing.push(childDeploy);   // non-module asset referenced from JS/HTML
    }
  }
}

function checkApp(app) {
  const indexSource = join(CLIENT, app.source, 'index.html');
  const indexDeploy = join(DEPLOY, app.worker, app.sub, 'index.html');
  if (!existsSync(indexSource)) {
    errors.push(`[${app.id}] source entry missing: ${indexSource}`);
    return;
  }
  if (!existsSync(indexDeploy)) {
    errors.push(`[${app.id}] bundle entry missing (run the deploy build first): ${indexDeploy}`);
    return;
  }
  const sourceMissing = [];
  const bundleMissing = [];
  const visited = new Set();
  scanFile(indexDeploy, app.worker, visited, sourceMissing, bundleMissing);
  for (const s of sourceMissing) errors.push(`[${app.id}] MISSING IN SOURCE: ${posix(s.file)}  (source path ${s.source} absent)`);
  for (const b of bundleMissing) errors.push(`[${app.id}] MISSING IN BUNDLE: ${posix(b)}`);
}

const workersToCheck = deployDirArg ? [deployDirArg] : ['city-sim', 'home'].filter((w) => existsSync(join(DEPLOY, w)));
const apps = APPS.filter((a) => workersToCheck.includes(a.worker));
if (!apps.length) {
  console.log('[check-imports] no bundles built — run a deploy build first (deploy/city-sim + deploy/home). Source-only check not performed.');
  process.exit(0);
}
for (const app of apps) checkApp(app);

if (errors.length) {
  console.log(`[check-imports] ${errors.length} problem(s) across ${apps.map((a) => a.id).join(', ')} (${checkedFiles} files scanned):`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(1);
}
console.log(`[check-imports] OK — ${apps.map((a) => a.id).join(', ')} import graphs resolve in source AND bundle (${checkedFiles} files scanned).`);
