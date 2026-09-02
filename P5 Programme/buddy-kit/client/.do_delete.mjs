import fs from 'node:fs';
import { execSync } from 'node:child_process';
function readGLB(p){const b=fs.readFileSync(p);const j=b.readUInt32LE(12);return JSON.parse(b.subarray(20,20+j).toString('utf8').replace(/\0+$/,''));}
function emb(p){try{const ex=readGLB(p).asset?.extras;return ex&&ex.license?ex:null;}catch(e){return null;}}
const CC0_PREFIX = /^(kenney-|quaternius-|kaykit-|objcar-|planets-)/;

// 1. Delete non-CC0 GLB files from library/ (and city-builder/champion-city assets)
const dirs = ['library', 'city-builder/assets/models', 'champion-city/assets/models'];
let delFiles = 0, keepFiles = 0;
for (const d of dirs) {
  const files = execSync(`find ${d} -name "*.glb" 2>/dev/null`).toString().trim().split('\n').filter(Boolean);
  for (const p of files) {
    const fn = p.split('/').pop();
    const e = emb(p);
    let keep = false;
    if (e) {
      const l = e.license.toLowerCase();
      keep = l.includes('cc0') || l.includes('public domain');
    } else {
      keep = CC0_PREFIX.test(fn);
    }
    if (keep) keepFiles++;
    else { fs.unlinkSync(p); delFiles++; }
  }
}
console.log('GLB files deleted:', delFiles, '| kept:', keepFiles);

// 2. Filter library.js to entries whose GLB survives
let lib = fs.readFileSync('city-common/library.js','utf8');
// We removed the files; now remove entries referencing deleted GLBs by re-running
// the same verdict on each entry's glb path (the file may already be gone — treat
// "file exists" as keep, else drop).
const survived = new Set();
for (const d of dirs) {
  const files = execSync(`find ${d} -name "*.glb" 2>/dev/null`).toString().trim().split('\n').filter(Boolean);
  for (const p of files) survived.add(p.replace(/^\.\//,''));
}
// Parse entries via regex on the export array is fragile; instead mark lines whose
// glb path resolves to a surviving file. We'll do a targeted filter below in JS by
// evaluating the array, but simplest: build keep-id set from LIBRARY evaluation.
