#!/usr/bin/env node
/**
 * generate-review-thumbs.mjs — render 512px thumbnails for the CITY-ONLY models
 * (the GLBs in city-builder/assets/models + champion assets that aren't in the
 * library catalog), plus write tools/review-manifest.json so the review page
 * can show name / path / size / group.
 *
 * Usage (from P5 Programme/):
 *   node scripts/generate-review-thumbs.mjs
 *
 * Env: PORT (default 8399), OUT (default <client>/tools/review-thumbs)
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(HERE, '../buddy-kit/client'));
const OUT = resolve(process.env.OUT || join(ROOT, 'tools/review-thumbs'));
const PORT = Number(process.env.PORT || 8399);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.wasm': 'application/wasm',
};

function serve() {
  return createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = resolve(join(ROOT, pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
  });
}

function groupOf(p) {
  const rel = relative(ROOT, p);
  const parts = rel.split('/');
  if (parts[0] === 'champion-city') return parts[2] === 'accessories' ? 'champion-accessories' : 'champion-models';
  // city-builder/assets/models/<maybe-sub>/file.glb
  if (parts.length >= 5) return parts[3];            // e.g. mission, housing-variants, robots, street, street-deco, vehicles, nature, nature-filler
  return 'root';                                     // cloud-*, fire-station, etc.
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const glbs = [];
  for await (const p of glob(join(ROOT, 'city-builder/assets/models/**/*.glb'))) glbs.push(p);
  for await (const p of glob(join(ROOT, 'champion-city/assets/models/*.glb'))) glbs.push(p);
  for await (const p of glob(join(ROOT, 'champion-city/assets/accessories/*.glb'))) glbs.push(p);
  glbs.sort();

  const server = serve();
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  await page.goto(`http://localhost:${PORT}/tools/review-thumb.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__REVIEW_THUMB && window.__REVIEW_THUMB.renderOne, { timeout: 15000 });

  const manifest = [];
  let ok = 0, fail = 0;
  for (const p of glbs) {
    const rel = relative(ROOT, p).replace(/\\/g, '/');
    const name = rel.split('/').pop().replace(/\.glb$/i, '');
    const group = groupOf(p);
    const size = (await stat(p)).size;
    const thumbName = `${group}__${name}.png`;
    try {
      const res = await page.evaluate(async (path) => await window.__REVIEW_THUMB.renderOne(path), '/' + rel);
      if (res.error) throw new Error(res.error);
      await writeFile(join(OUT, thumbName), Buffer.from(res.dataUrl.split(',')[1], 'base64'));
      manifest.push({ name, group, path: rel, size, thumb: `review-thumbs/${thumbName}` });
      ok++;
    } catch (e) {
      fail++;
      console.error('[review-thumbs] FAIL', rel, e.message);
    }
    await sleep(30);
  }
  await browser.close();
  server.close();
  await writeFile(join(ROOT, 'tools/review-manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`[review-thumbs] done. wrote=${ok} failed=${fail}; manifest=${manifest.length}`);
  process.exit(fail ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
