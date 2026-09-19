import { chromium } from 'playwright';
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const logs=[];
p.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await p.goto('http://localhost:8377/city-builder/',{waitUntil:'load'});
await p.waitForTimeout(2500);
await p.evaluate(()=>{const el=[...document.querySelectorAll('button')].find(b=>/empty sample/i.test(b.textContent||''));if(el)el.click();});
await p.waitForSelector('canvas',{timeout:30000}).catch(()=>{});
await p.waitForTimeout(18000);
// Count instanced meshes by instance count + dump a few
const info = await p.evaluate(() => {
  const scene = window.__scene;
  if (!scene) return {error:'no scene'};
  const ims=[];
  scene.traverse(o=>{ if(o.isInstancedMesh) ims.push({count:o.count, matName:(o.material&&o.material.name)||'', hasEmissive: !!(o.material&&o.material.emissive)}); });
  const sorted=[...ims].sort((a,b)=>b.count-a.count);
  return { totalIM: ims.length, top: sorted.slice(0,12), pedestriansCount: window.__city && window.__city.pedestrians ? window.__city.pedestrians.getCount() : 'n/a' };
});
console.log('INFO:', JSON.stringify(info));
console.log('LOGS:');
for (const l of logs.slice(-15)) console.log(' ', l.slice(0,200));
await b.close();
