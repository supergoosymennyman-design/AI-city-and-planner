#!/usr/bin/env node
/**
 * minify-deploy.mjs — minify the static JS of a deploy bundle with esbuild
 * TRANSFORM (not bundle): each file is minified in place, imports/exports are
 * untouched, so the importmap + buildless-ESM architecture is unaffected.
 *
 * Runs on the deploy/ OUTPUT only — never on buddy-kit/client source.
 *
 * Excludes:
 *   - vendor/          vendored three.js + addons (large, third-party, already lean-ish)
 *   - buddy/           the Cloudflare Worker + its server/logic (live gateway — never minify)
 *
 * Usage (from P5 Programme/):
 *   node scripts/minify-deploy.mjs deploy/city-sim
 *   node scripts/minify-deploy.mjs deploy/planner
 *   node scripts/minify-deploy.mjs deploy/city-sim --dry-run
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { transform } from 'esbuild';

const EXCLUDE_DIRS = new Set(['vendor', 'buddy', 'library', 'assets', 'node_modules', '.wrangler', 'cloudflare']);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (!EXCLUDE_DIRS.has(e)) out.push(...walk(p));
    } else if (extname(p) === '.js' || extname(p) === '.mjs') {
      out.push(p);
    }
  }
  return out;
}

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/minify-deploy.mjs <deploy-dir> [--dry-run]');
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');
const root = resolve(target);
if (!readdirSync(root).length && !dryRun) {
  console.error(`not a directory: ${target}`);
  process.exit(1);
}

const files = walk(root);
let inBytes = 0;
let outBytes = 0;
let minified = 0;
let failed = 0;

  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    inBytes += Buffer.byteLength(src);
    try {
      // NO `format` option: esbuild must minify in place WITHOUT converting
      // module syntax. `format:'esm'` would rewrite CJS-dual files (logic/*.js,
      // buddy.js — loaded as CLASSIC scripts by buddy-boot.js) into `export`
      // statements → "Unexpected token 'export'" at runtime. Omitting format
      // preserves each file's own module system (ESM keeps `export`, CJS keeps
      // `module.exports`) and only minifies.
      const res = await transform(src, { minify: true, target: 'es2020' });
    // Only write if the transform actually shrank the file (skip no-ops).
    if (!dryRun && Buffer.byteLength(res.code) < Buffer.byteLength(src)) {
      writeFileSync(f, res.code);
      minified++;
    } else if (dryRun) {
      minified++;
    }
    outBytes += Buffer.byteLength(res.code);
  } catch (e) {
    failed++;
    console.error(`[minify] FAIL ${f}: ${e.message}`);
  }
}

console.log(`[minify] ${target}: ${files.length} js files, minified=${minified}, failed=${failed}`);
console.log(`[minify] ${(inBytes / 1024).toFixed(0)} KB -> ${(outBytes / 1024).toFixed(0)} KB (${((1 - outBytes / (inBytes || 1)) * 100).toFixed(0)}% smaller)`);
process.exit(failed ? 1 : 0);
