#!/usr/bin/env node
import { writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const ROOT = resolve('buddy-kit/client');
const { LIBRARY } = await import('file://' + resolve(join(ROOT, 'city-common/library.js')));
const out = [];
for (const e of LIBRARY) {
  let size = 0;
  try { size = (await stat(resolve(join(ROOT, e.glb.replace(/^\.\.\//, ''))))).size; } catch {}
  out.push({ id: e.id, name: e.name, category: e.category, glb: e.glb, size });
}
await writeFile(join(ROOT, 'tools/review-library.json'), JSON.stringify(out, null, 1));
console.log('wrote', out.length, 'entries');
