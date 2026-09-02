#!/usr/bin/env node
/**
 * generate-thumbnails.mjs — headless thumbnail renderer for the shared model
 * library. Drives `tools/thumbnail-raw.html` (the REAL loader path with
 * DRACOLoader + MeshoptDecoder) via Playwright and writes
 * `library/thumbnails/<id>.png` for every catalog entry.
 *
 * Usage (from P5 Programme/):
 *   node scripts/generate-thumbnails.mjs             # render all catalog ids
 *   node scripts/generate-thumbnails.mjs bld_a nat_tree veh_sedan   # subset
 *
 * Env:
 *   THUMBS_OUT  output dir (default <client>/library/thumbnails)
 *   PORT        static server port (default 8399)
 *   BASE        app root to serve (default <client>)
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LIBRARY } from '../buddy-kit/client/city-common/library.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.BASE || join(HERE, '../buddy-kit/client'));
const OUT = resolve(process.env.THUMBS_OUT || join(ROOT, 'library/thumbnails'));
const PORT = Number(process.env.PORT || 8399);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function serve() {
  return createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(join(ROOT, pathname));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(404); res.end('not found');
    }
  });
}

function args() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (ids.length) return ids;
  return LIBRARY.map((i) => i.id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const only = args();
  const items = only.map((id) => LIBRARY.find((i) => i.id === id)).filter(Boolean);
  if (!items.length) {
    console.error('No matching ids in LIBRARY.');
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  const server = serve();
  await new Promise((r) => server.listen(PORT, r));
  const base = `http://localhost:${PORT}`;
  console.log(`[thumbs] serving ${ROOT} on :${PORT}; rendering ${items.length} models → ${OUT}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
  const warnings = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error' || /fail|error|warn/i.test(t)) warnings.push(t);
  });
  page.on('pageerror', (e) => warnings.push(`pageerror: ${e.message}`));

  await page.goto(`${base}/tools/thumbnail-raw.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__THUMBS_RAW && window.__THUMBS_RAW.renderOne, { timeout: 15000 });

  let ok = 0, fail = 0;
  for (const item of items) {
    const outFile = join(OUT, `${item.id}.png`);
    try {
      const res = await page.evaluate(async (glb) => await window.__THUMBS_RAW.renderOne(glb), item.glb);
      if (res.error) throw new Error(res.error);
      const buf = Buffer.from(res.dataUrl.split(',')[1], 'base64');
      await writeFile(outFile, buf);
      ok++;
    } catch (e) {
      fail++;
      console.error(`[thumbs] FAIL ${item.id} (${item.glb}): ${e.message}`);
    }
    await sleep(40);
  }

  await browser.close();
  server.close();
  console.log(`[thumbs] done. wrote=${ok} failed=${fail}`);
  const bad = warnings.filter((w) => /load failed|unknown library|No DRACOLoader|setMeshoptDecoder/i.test(w));
  if (bad.length) {
    console.log(`[thumbs] flagged console warnings (${bad.length}):`);
    for (const w of bad.slice(0, 20)) console.log('  ', w.slice(0, 200));
  }
  process.exit(fail ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
