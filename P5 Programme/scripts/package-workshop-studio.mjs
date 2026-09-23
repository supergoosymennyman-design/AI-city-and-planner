/** Build local demo apps from canonical sources. No deployment. */
import { cp, mkdir, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root,'buddy-kit/client');
function run(args, cwd) {
 const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {cwd,stdio:'inherit'});
 if (result.error) throw result.error;
 if (result.status !== 0) process.exit(result.status || 1);
}
for (const [folder, dependency] of [['studio','three'], ['workshop/buddy','ai']]) {
 const cwd = path.join(source,folder);
 try { await access(path.join(cwd,'node_modules',dependency,'package.json')); }
 catch { run(['ci','--no-audit','--no-fund'],cwd); }
}
run(['run','build'],path.join(source,'studio'));
for (const [name,from] of [['workshop','workshop'],['studio','studio/dist']]) {
 const dest=path.join(root,'deploy/city-sim',name);
 await rm(dest,{recursive:true,force:true}); await mkdir(dest,{recursive:true});
 await cp(path.join(source,from),dest,{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')});
}
console.log('Workshop and Studio packaged locally. Nothing deployed.');
