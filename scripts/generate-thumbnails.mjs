// generate-thumbnails.mjs — render 256px thumbnails for every model in the
// shared library (client/library/thumbnails/<id>.png). Reusable as the library
// grows: `node scripts/generate-thumbnails.mjs [id1 id2 ...]` (no args = all).
//
// Uses the in-repo thumbnailer page (tools/thumbnailer.html) driven headlessly
// by Playwright — so thumbnails always match what the runtime renderer shows.
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../P5 Programme/buddy-kit/client');
const outDir = path.join(clientDir, 'library/thumbnails');
fs.mkdirSync(outDir, { recursive: true });

const PORT = 8123;
const ids = process.argv.slice(2);
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: clientDir, stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/tools/thumbnailer.html`);
  await page.waitForFunction(() => window.__THUMBS && window.__THUMBS.renderAll, { timeout: 20000 });

  const results = ids.length
    ? await page.evaluate((list) => window.__THUMBS.renderAll(list), ids)
    : await page.evaluate(() => window.__THUMBS.renderAll());

  let wrote = 0, failed = 0;
  for (const r of results) {
    if (r.dataUrl) {
      fs.writeFileSync(path.join(outDir, r.id + '.png'), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      wrote++;
    } else {
      failed++;
      console.error('FAILED', r.id, r.error);
    }
  }
  await browser.close();
  console.log(`wrote ${wrote}/${results.length} thumbnails${failed ? ` (${failed} failed)` : ''}`);
} finally {
  server.kill();
}
