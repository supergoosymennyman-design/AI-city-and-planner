#!/usr/bin/env node
/**
 * gdrive-fetch.mjs — download a Google Drive shared FOLDER as a zip via a real
 * browser (Playwright). Drive zips the whole folder server-side, so this avoids
 * the per-file "many accesses" throttle gdown hits.
 *
 * Usage (from P5 Programme/):
 *   node scripts/gdrive-fetch.mjs <folderId> <outName> [--out <dir>]
 *
 * Env:
 *   GD_OUT  output dir (default $TMPDIR/opencode/cc0-sprint/raw/gdrive)
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FOLDER = process.argv[2];
const NAME = process.argv[3] || FOLDER;
const OUT = process.env.GD_OUT || '/var/folders/wv/_sm4kzsx1wl7vvkh9bvk510r0000gn/T/opencode/cc0-sprint/raw/gdrive';
const TIMEOUT_MS = Number(process.env.GD_TIMEOUT || 240000);

if (!FOLDER) {
  console.error('usage: node scripts/gdrive-fetch.mjs <folderId> <outName>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
const dlLog = [];
page.on('download', (d) => dlLog.push(d));

await mkdir(OUT, { recursive: true });

try {
  await page.goto(`https://drive.google.com/drive/folders/${FOLDER}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
} catch (e) {
  console.log('goto failed:', e.message?.slice(0, 120));
}

// Wait for the file grid/list to render (Drive SPA — locale-independent check).
let rows = 0;
for (let i = 0; i < 20; i++) {
  rows = await page.evaluate(() =>
    document.querySelectorAll('div[role="row"], div[data-target="doc"], div[data-id]').length
  ).catch(() => 0);
  if (rows > 0) break;
  const hasName = await page.evaluate(() => /name|名稱|name/i.test(document.body.innerText || '')).catch(() => false);
  if (hasName) break;
  await page.waitForTimeout(1000);
}
if (rows === 0) {
  const txt = await page.evaluate(() => (document.body.innerText || '').slice(0, 400)).catch(() => '');
  console.log(`no rows found (${rows}); page says: ${txt.replace(/\n+/g, ' | ')}`);
  await browser.close();
  process.exit(1);
}
console.log(`folder loaded, ${rows} rows`);

// Focus the file list, then select all rows, then hit the toolbar Download button.
await page.evaluate(() => {
  const list = document.querySelector('div[role="row"]');
  if (list) list.focus();
  else (document.querySelector('[role="grid"]') || document.body).focus();
});
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
await page.waitForTimeout(1000);

const clicked = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[aria-label], [data-tooltip], [title], button')];
  const cand = els.filter((e) => {
    const s = ((e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('data-tooltip') || '') + ' ' + (e.getAttribute('title') || '')).toLowerCase();
    return s.includes('download') || s.includes('下載') || s.includes('ダウンロード');
  });
  if (cand.length) { cand[0].click(); return true; }
  return false;
});
console.log('download button clicked:', clicked);

// Wait for the download to begin (Drive may show a virus-scan interstitial for
// large zips — look for "Download anyway" if nothing arrives within 8s).
let dl = null;
for (let i = 0; i < Math.ceil(TIMEOUT_MS / 1000); i++) {
  if (dlLog.length) { dl = dlLog[0]; break; }
  if (i === 8) {
    const ok = await page.evaluate(() => {
      const el = [...document.querySelectorAll('a, button, span, div')].find((e) => /download anyway|仍要下載|とにかくダウンロード/i.test(e.textContent || ''));
      if (el) { el.click(); return true; }
      return false;
    });
    if (ok) console.log('clicked "Download anyway" interstitial');
  }
  await page.waitForTimeout(1000);
}

if (!dl) {
  console.log('NO download captured. Page text:', (await page.evaluate(() => (document.body.innerText || '').slice(0, 300)).catch(() => '')));
  await browser.close();
  process.exit(2);
}

const outFile = join(OUT, `${NAME}.zip`);
await dl.saveAs(outFile);
console.log(`saved ${outFile}`);
await browser.close();
