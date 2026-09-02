#!/usr/bin/env node
/**
 * review-removal-server.mjs — tiny local WRITE endpoint for the model-review page.
 *
 * The review page (tools/library-review.html on :8377) POSTs selections here when the
 * user confirms a removal. This server:
 *   1. MOVES each GLB + thumbnail into a timestamped trash folder (recoverable —
 *      nothing is hard-deleted; trash lives under os.tmpdir()/opencode/cc0-sprint/removed-*)
 *   2. Removes the matching entry line from city-common/library.js (backing it up first)
 *   3. Greps buddy-kit/client for lingering references and returns them as warnings
 *
 * CORS enabled for the review page. Binds 127.0.0.1 only. Port 8390.
 *
 * Usage (from P5 Programme/):
 *   node scripts/review-removal-server.mjs            # :8390
 *   PORT=8391 node scripts/review-removal-server.mjs
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(HERE, '../buddy-kit/client'));
const PORT = Number(process.env.PORT || 8390);
const LIBRARY_JS = join(ROOT, 'city-common/library.js');
const TRASH_BASE = join(os.tmpdir(), 'opencode/cc0-sprint', 'removed-' + new Date().toISOString().replace(/[:.]/g, '-'));
const SCAN_EXCLUDES = new Set(['tools', 'thumbnails', 'vendor', 'node_modules']);

const log = (...a) => console.log('[remove]', ...a);

function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(obj));
}

/** Move a FILE into the trash, preserving its client-relative path.
 *  Hard guards: refuses empty relPath, refuses directories (only files may be removed),
 *  refuses paths that escape ROOT. Returns {moved, skipped, error?}. */
async function moveToTrash(absPath, relPath) {
  if (!relPath) return { moved: false, error: 'empty relPath — refusing to move' };
  if (!existsSync(absPath)) return { moved: false, skipped: true }; // legitimately absent
  const st = await stat(absPath);
  if (st.isDirectory()) return { moved: false, error: `refusing to move a DIRECTORY: ${relPath}` };
  const dest = join(TRASH_BASE, relPath);
  await mkdir(dirname(dest), { recursive: true });
  await rename(absPath, dest);
  log('moved →', relPath);
  return { moved: true };
}

/** Safety: resolve a client-relative path under ROOT and refuse anything that lands on ROOT
 * itself or escapes it. Returns the resolved absolute path, or null when unsafe. */
function safeClientPath(rel) {
  if (!rel) return null;
  const p = join(ROOT, rel);
  if (p === ROOT || !p.startsWith(ROOT + sep)) return null;
  return p;
}

/** Remove the library.js entry line for an id. Returns {removed:boolean, error?}. */
async function removeLibraryEntry(id) {
  if (!existsSync(LIBRARY_JS)) return { removed: false, error: 'library.js missing' };
  const text = await readFile(LIBRARY_JS, 'utf8');
  const lines = text.split('\n');
  const needle = `id: '${id}'`;
  const matches = lines.map((ln, i) => (ln.includes(needle) ? i : -1)).filter((i) => i >= 0);
  if (matches.length === 0) return { removed: false, error: `library.js: no entry with id '${id}'` };
  if (matches.length > 1) return { removed: false, error: `library.js: id '${id}' matches ${matches.length} lines (ambiguous)` };
  // Back up once per server run so repeated batches can still recover.
  const backup = join(TRASH_BASE, 'city-common/library.js.bak');
  if (!existsSync(backup)) {
    await mkdir(dirname(backup), { recursive: true });
    await writeFile(backup, text);
    log('backed up library.js');
  }
  const next = lines.filter((_, i) => i !== matches[0]).join('\n');
  await writeFile(LIBRARY_JS, next);
  log('removed library.js entry', id);
  return { removed: true };
}

/** Prune a generated JSON list (review-manifest.json / review-library.json) so removed
 * items stop appearing on the review page. Regenerable files — no backup needed. */
async function pruneJson(relPath, predicate) {
  const p = join(ROOT, relPath);
  if (!existsSync(p)) return;
  try {
    const arr = JSON.parse(await readFile(p, 'utf8'));
    const next = arr.filter((x) => !predicate(x));
    if (next.length !== arr.length) {
      await writeFile(p, JSON.stringify(next, null, 1));
      log('pruned', relPath, arr.length - next.length, 'entries');
    }
  } catch (e) {
    log('prune failed', relPath, e.message);
  }
}

/** Grep buddy-kit/client (excluding tools/, thumbnails/) for a string. Returns file:line snippets. */
async function findReferences(needle) {
  const hits = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        if (SCAN_EXCLUDES.has(e.name)) continue;
        await walk(p);
        continue;
      }
      const ext = extname(e.name);
      if (!['.js', '.json', '.html'].includes(ext)) continue;
      let txt;
      try { txt = await readFile(p, 'utf8'); } catch { continue; }
      if (!txt.includes(needle)) continue;
      const rel = relative(ROOT, p);
      const line = txt.split('\n').findIndex((l) => l.includes(needle));
      hits.push(`${rel}:${line + 1}`);
      if (hits.length >= 8) return;
    }
  }
  await walk(ROOT);
  return hits;
}

/** After an entry is removed from library.js, find any SURVIVING entries that reference the
 * same GLB file (shared-file collisions — removing the file breaks them too). */
async function libraryIdsUsingGlb(glbRel) {
  const text = await readFile(LIBRARY_JS, 'utf8');
  const ids = [];
  for (const line of text.split('\n')) {
    const idM = line.match(/id: '([^']+)'/);
    const glbM = line.match(/glb: '([^']+)'/);
    if (idM && glbM && glbM[1].replace(/^\.\.\//, '') === glbRel) ids.push(idM[1]);
  }
  return ids;
}

async function handleRemove(items) {
  const removed = [], warnings = [], errors = [];
  for (const it of items || []) {
    if (!it || typeof it !== 'object') { errors.push('bad item'); continue; }
    try {
      if (it.kind === 'lib') {
        // glb: '../library/<cat>/<file>.glb' (relative to app root) → ROOT/library/...
        // (the page sends `glb`; accept `path` as a fallback so a field drift can't recur)
        const glbRel = String(it.glb || it.path || '').replace(/^\.\.\//, '');
        const glbPath = safeClientPath(glbRel);
        if (!glbPath) { errors.push(`${it.id}: refusing unsafe glb path '${glbRel}'`); continue; }
        const thumbPath = join(ROOT, 'library/thumbnails', (it.id || '') + '.png');
        const r1 = await moveToTrash(glbPath, glbRel);
        if (r1.error) errors.push(`${it.id}: ${r1.error}`);
        const r2 = await moveToTrash(thumbPath, 'library/thumbnails/' + (it.id || '') + '.png');
        if (r2.error) errors.push(`${it.id}: ${r2.error}`);
        const r3 = await removeLibraryEntry(it.id);
        if (r3.error) errors.push(`${it.id}: ${r3.error}`);
        if (r1.moved || r2.moved || r3.removed) {
          removed.push({ kind: 'lib', id: it.id, name: it.name, files: [r1.moved, r2.moved, r3.removed] });
        }
        if (r3.removed) await pruneJson('tools/review-library.json', (x) => x.id === it.id);
        if (r3.removed && r1.moved) {
          const sharers = await libraryIdsUsingGlb(glbRel);
          if (sharers.length) warnings.push(`lib '${it.id}': GLB ${glbRel} is ALSO used by ${sharers.join(', ')} — those entries now point at a missing file`);
        }
        if (it.id) {
          for (const h of await findReferences(it.id)) warnings.push(`lib '${it.id}' → ${h}`);
        }
      } else if (it.kind === 'city') {
        const p = String(it.path || '').replace(/^\/+/, '');
        if (!p) { errors.push('city item missing path'); continue; }
        const glbPath = safeClientPath(p);
        if (!glbPath) { errors.push(`city '${p}': refusing unsafe path`); continue; }
        const thumbPath = join(ROOT, 'tools', (it.thumb || '').replace(/^tools\//, ''));
        const r1 = await moveToTrash(glbPath, p);
        if (r1.error) errors.push(`${it.name || p}: ${r1.error}`);
        const r2 = await moveToTrash(thumbPath, it.thumb || 'tools/unknown.png');
        if (r2.error) errors.push(`${it.name || p}: ${r2.error}`);
        if (r1.moved || r2.moved) {
          removed.push({ kind: 'city', path: p, name: it.name, files: [r1.moved, r2.moved] });
          if (r1.moved) await pruneJson('tools/review-manifest.json', (x) => x.path === p);
        }
        const needle = p.split('/').pop().replace(/\.glb$/i, '');
        if (needle) {
          for (const h of await findReferences(needle)) warnings.push(`city '${needle}' → ${h}`);
        }
      } else {
        errors.push(`unknown kind '${it.kind}'`);
      }
    } catch (e) {
      errors.push(`${it.id || it.path}: ${e.message}`);
    }
  }
  return { removed, warnings, errors };
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/remove') {
    json(res, 404, { error: 'not found' });
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  let payload;
  try { payload = JSON.parse(body); } catch { json(res, 400, { error: 'bad JSON' }); return; }
  log('request:', (payload.items || []).length, 'items');
  const result = await handleRemove(payload.items || []);
  json(res, 200, result);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[remove] review-removal-server on http://127.0.0.1:${PORT}`);
  console.log(`[remove] root=${ROOT}`);
  console.log(`[remove] trash=${TRASH_BASE}`);
});
