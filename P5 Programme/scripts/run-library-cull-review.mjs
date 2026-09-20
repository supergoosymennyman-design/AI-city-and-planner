#!/usr/bin/env node
/**
 * Render every browseable shared-library GLB through shared/gltf.js and write
 * printable contact sheets plus a machine-readable load report.  This is a
 * review aid only: it never changes LIBRARY, assets, manifests, or decisions.
 *
 * From P5 Programme/: node scripts/run-library-cull-review.mjs
 */
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { LIBRARY } from '../buddy-kit/client/city-common/library.js';

const ROOT = resolve('buddy-kit/client');
const OUTPUT = resolve('docs/library-cull-review');
const PORT = Number(process.env.PORT || 8413);
const PER_SHEET = Math.min(100, Math.max(1, Number(process.env.PER_SHEET || 25)));
const entries = LIBRARY.filter((entry) => entry.picker !== false);
const START = Math.min(entries.length, Math.max(0, Number(process.env.START || 0)));
const END = Math.min(entries.length, Math.max(START, Number(process.env.END || entries.length)));
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.ktx2':'image/ktx2' };
function server() { return createServer(async (req, res) => {
  try { let pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); if (pathname.endsWith('/')) pathname += 'index.html'; const file = resolve(join(ROOT, pathname));
    if (!file.startsWith(ROOT)) throw new Error('outside client'); const body = await readFile(file);
    if (!res.destroyed) { res.writeHead(200, {'Content-Type':MIME[extname(file)] || 'application/octet-stream'}); res.end(body); }
  } catch { if (!res.destroyed && !res.headersSent) { res.writeHead(404); res.end('Not found'); } }
}); }
const listen = (s) => new Promise((resolveListen) => s.listen(PORT, '127.0.0.1', resolveListen));
async function main() {
  await mkdir(OUTPUT, { recursive:true });
  if (process.argv.includes('--combine')) {
    const files = (await readdir(OUTPUT)).filter((name) => /^records-\d+-\d+\.json$/.test(name)).sort();
    const allRecords = (await Promise.all(files.map(async (name) => JSON.parse(await readFile(join(OUTPUT, name), 'utf8'))))).flat();
    const failures = allRecords.filter((item) => item.status !== 'loaded');
    const duplicateIds = [...new Set(allRecords.filter((record, index) => allRecords.findIndex((other) => other.id === record.id) !== index).map((record) => record.id))];
    await writeFile(join(OUTPUT, 'load-report.json'), JSON.stringify({ generatedAt:new Date().toISOString(), total:entries.length, reviewed:allRecords.length, loaded:allRecords.length-failures.length, failures, duplicateIds, records:allRecords }, null, 2) + '\n');
    console.log(`[cull-review] combined ${allRecords.length}/${entries.length}: ${failures.length} failed, ${duplicateIds.length} duplicate IDs`); return;
  }
  const s = server(); await listen(s);
  const browser = await chromium.launch({ args:['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const report = [];
  try { for (let start=START; start<END; start += PER_SHEET) {
    const page = await browser.newPage({ viewport:{width:1500, height:1200}, deviceScaleFactor:1 });
    await page.goto(`http://127.0.0.1:${PORT}/tools/library-cull-review.html?start=${start}&limit=${PER_SHEET}`, {waitUntil:'load'});
    const results = await page.evaluate(() => window.__libraryCullReview.done);
    report.push(...results); const number = String(start / PER_SHEET + 1).padStart(3, '0');
    await page.screenshot({path:join(OUTPUT, `contact-sheet-${number}.png`), fullPage:true}); await page.close();
    console.log(`[cull-review] ${Math.min(start + PER_SHEET, END)}/${END} (catalog ${entries.length})`);
  }} finally { await browser.close(); await new Promise((done) => s.close(done)); }
  const failures = report.filter((item) => item.status !== 'loaded');
  await writeFile(join(OUTPUT, `records-${START}-${END}.json`), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(OUTPUT, 'proposed-exclusions.txt'), '# Fill only after visual approval. One shared LIBRARY id per line.\n');
  await writeFile(join(OUTPUT, 'README.md'), `# Shared library cull review\n\n- Browseable records: ${entries.length}\n- Contact sheets: ${Math.ceil(entries.length / PER_SHEET)}\n\nEach sheet shows the existing picker thumbnail on the left and a fresh render using \`shared/gltf.js\` on the right. Run with \`--combine\` after all chunks to create the consolidated load report. Do not delete assets until the IDs in \`proposed-exclusions.txt\` have explicit approval.\n`);
  console.log(`[cull-review] chunk complete: ${report.length - failures.length} loaded, ${failures.length} failed; ${OUTPUT}`);
  process.exitCode = failures.length ? 2 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
