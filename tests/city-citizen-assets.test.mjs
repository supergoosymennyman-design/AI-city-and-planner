import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../P5 Programme/buddy-kit/client/city-builder/assets/models/citizens/',import.meta.url);
test('foreground citizen assets stay below the older-tablet transfer and geometry budgets',()=>{
 let total=0;
 for(const gender of ['male','female']){
  const bytes=readFileSync(new URL(`casual-${gender}.glb`,root));total+=bytes.length;
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  assert.deepEqual(doc.animations.map(a=>a.name).sort(),['Idle','Walk']);assert.equal(doc.materials.length,1);assert.equal(doc.images?.length||0,0);assert.equal(doc.skins.length,1);
  const triangles=doc.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);assert.ok(triangles<=3000);
  for(const m of doc.meshes)for(const p of m.primitives){assert.ok('COLOR_0' in p.attributes);assert.ok('JOINTS_0' in p.attributes);assert.ok('WEIGHTS_0' in p.attributes);}
 }
 assert.ok(total<=500*1024,`${total} bytes exceeds foreground budget`);
});
