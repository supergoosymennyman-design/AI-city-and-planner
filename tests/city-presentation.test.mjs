import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {TIME_ORDER,TIME_PRESETS,validTime,nextTime} from '../P5 Programme/buddy-kit/client/city-common/time-of-day.js';
import {CITY_ESSENTIALS,essentialName,essentialSearch} from '../P5 Programme/buddy-kit/client/city-common/city-essentials.js';
import {libraryItem} from '../P5 Programme/buddy-kit/client/city-common/library.js';
import {sanitizeLayout,densifyLayout,occupiedBounds} from '../P5 Programme/buddy-kit/client/city-common/layout.js';
import {buildSampleCity} from '../P5 Programme/buddy-kit/client/city-common/sample-city.js';
import {createNeighbourhood} from '../P5 Programme/buddy-kit/client/city-common/neighbourhood.js';
import {PARK_VEGETATION_ASSETS,createParkVegetation,parkCentreClearance} from '../P5 Programme/buddy-kit/client/city-common/park-vegetation.js';
const client=new URL('../P5 Programme/buddy-kit/client/',import.meta.url);
test('time presets cycle, default to clear daytime, and retain readable ambient light',()=>{
 assert.deepEqual(TIME_ORDER,['morning','day','sunset','night']);assert.equal(validTime('bad'),'day');assert.equal(nextTime('night'),'morning');
 for(const p of Object.values(TIME_PRESETS)){assert.ok(p.ambient>=1.4);assert.ok(p.exposure<=1.2);assert.ok(p.bloom<=.3);assert.ok(p.en && p.zh);}
});
test('all 24 essentials resolve to placeable models, bilingual names and thumbnails',()=>{
 assert.equal(CITY_ESSENTIALS.length,24);assert.equal(new Set(CITY_ESSENTIALS.map(e=>e.id)).size,24);
 for(const e of CITY_ESSENTIALS){const item=libraryItem(e.id);assert.ok(item && item.picker!==false,e.id);assert.equal(essentialName(item,'zh-Hant'),e.zh);assert.ok(essentialSearch(item).includes(e.en));assert.ok(statSync(new URL(`library/thumbnails/${e.id}.png`,client)).size>0);}
});
test('automatic scenery remains a presentation preference through layout transforms',()=>{
 const raw=buildSampleCity(),on=sanitizeLayout(raw),off=sanitizeLayout({...raw,autoScenery:false});
 assert.equal(on.autoScenery,true);assert.equal(off.autoScenery,false);assert.deepEqual(off.buildings,on.buildings);assert.deepEqual(off.parks,on.parks);
 densifyLayout(off);assert.equal(off.autoScenery,false);assert.equal(createNeighbourhood(off).spaces.length,0);assert.ok(createNeighbourhood(on).spaces.length>0);
 assert.equal(sanitizeLayout({}).autoScenery,true);assert.equal(sanitizeLayout({autoScenery:'false'}).autoScenery,true);
});
test('initial 3D spawn and overview frame occupied bounds without transforming geometry',()=>{
 const raw=buildSampleCity(),layout=sanitizeLayout(raw),snapshot=JSON.stringify(layout),bounds=occupiedBounds(layout,{pad:0});
 assert.ok(bounds.maxX-bounds.minX>0&&bounds.maxZ-bounds.minZ>0);assert.equal(JSON.stringify(layout),snapshot);
 const source=readFileSync(new URL('city-builder/city-builder.js',client),'utf8');
 assert.match(source,/cityFocusBounds = occupiedBounds\(layout, \{ pad: 0 \}\)/);
 assert.match(source,/const focus = cityFocusBounds \|\| occupiedBounds/);
 assert.match(source,/orbit\.distOverview = Math\.max/);
 assert.match(source,/orbit\.target\.set\(focusX, 0, focusZ\)/);
 assert.match(source,/champion && !introOverview \? orbit\.distWalk : orbit\.distOverview/);
});
test('terrain grass keeps a quiet, colour-managed PBR treatment with restrained world-space variation',()=>{
 const source=readFileSync(new URL('city-builder/city-builder.js',client),'utf8');
 assert.match(source,/varying vec3 vGndWorld/);assert.match(source,/uFogColor/);assert.match(source,/uGrassNight/);assert.match(source,/uGrassTextureDetail/);
 assert.match(source,/uGrassMoss/);assert.match(source,/uGrassLeaf/);assert.match(source,/uGrassSun/);assert.match(source,/uGrassDry/);assert.match(source,/uParkLawn/);assert.match(source,/uGrassPbrSaturation/);assert.match(source,/uGrassPbrAlbedoMix/);assert.match(source,/uGrassParkLift/);assert.match(source,/grassFbm/);
 for(const color of ['#33502a','#4c7c3f','#6a8f4e','#9a9450'])assert.match(source,new RegExp(color));
 assert.match(source,/PARK_LAWN_PBR_TREATMENT/);assert.match(source,/saturation: 0\.92, albedoMix: 0\.36, tint: '#ffffff', tintStrength: 0/);assert.match(source,/park \? 0\.06 : 0\.22/);assert.match(source,/\.035/);assert.match(source,/park\?'grassTone=mix\(grassTone,uParkLawn,\.78\)/);assert.match(source,/grassDetail=mix\(vec3\(dot\(grassDetail/);assert.match(source,/diffuseColor\.rgb=mix\(grassTone,grassDetail,uGrassTextureDetail\*uGrassPbrAlbedoMix\)/);assert.match(source,/grasses:\(\)=>_grassMats/);assert.doesNotMatch(source,/diffuseColor\.rgb\*=grassTone/);assert.doesNotMatch(source,/groundTexture\.repeat/);assert.doesNotMatch(source,/vec3\(\.25,\.33,\.19\)/);
});
test('only Kenney grass batches replace turquoise materials with a height vertex palette and instance jitter',()=>{
 const source=readFileSync(new URL('city-builder/city-builder.js',client),'utf8');
 assert.match(source,/function applyGrassVertexPalette/);assert.match(source,/new THREE\.Color\('#a8c262'\)/);assert.match(source,/variant\.geo\.setAttribute\('color'/);assert.match(source,/material\.color\?\.set\(0xffffff\)/);assert.match(source,/material\.vertexColors=true/);assert.match(source,/material\.side=THREE\.DoubleSide/);assert.match(source,/inst\.setColorAt\(idx/);
 assert.doesNotMatch(source,/material\.color\?\.lerp\(new THREE\.Color\('#4d803f'\),\.52\)/);
});
test('park vegetation uses shipped CC0 grass variants with deterministic safe weighted placement',()=>{
 const grassWeight=PARK_VEGETATION_ASSETS.filter(a=>a.kind.includes('grass')).reduce((n,a)=>n+a.weight,0);
 assert.ok(grassWeight>=70);assert.ok(PARK_VEGETATION_ASSETS.some(a=>a.file.endsWith('kenney-grass.glb')));assert.ok(PARK_VEGETATION_ASSETS.some(a=>a.file.endsWith('kenney-grass_large.glb')));
 for(const asset of PARK_VEGETATION_ASSETS)assert.ok(statSync(new URL(asset.file.replace('../library/','library/'),client)).size>0,asset.file);
 const layout={autoScenery:true,roads:[{width:12,points:[[0,50],[100,50]]}],parks:[{cx:50,cz:50,radius:38}]};
 const a=createParkVegetation(layout,{mobile:true}),b=createParkVegetation(layout,{mobile:true});assert.deepEqual(a,b);assert.ok(a.length>=10);
 for(const p of a){const r=Math.hypot(p.x-50,p.z-50);assert.ok(r<35);assert.ok(r>=parkCentreClearance(38));assert.ok(Math.abs(r-38*.55)>=3.2);assert.ok(Math.abs(p.z-50)>=8.5);}
 assert.deepEqual(createParkVegetation({...layout,autoScenery:false},{mobile:true}),[]);
});
test('parks keep a modest open centre and never request the retired park diorama',()=>{
 assert.equal(parkCentreClearance(12),4.5);assert.equal(parkCentreClearance(38),4.56);assert.equal(parkCentreClearance(100),8);
 const source=readFileSync(new URL('city-builder/city-builder.js',client),'utf8');
 assert.doesNotMatch(source,/park\.glb|_parkModel|loadParkModel/);
 const streetDeco=readFileSync(new URL('city-builder/street-deco.js',client),'utf8');
 assert.doesNotMatch(streetDeco,/PLAYGROUND|street-deco\/(?:fountain|ferris-wheel|gazebo)\.glb/);
 const landscape=readFileSync(new URL('city-builder/park-landscape.js',client),'utf8');
 assert.doesNotMatch(landscape,/CircleGeometry|lawns|lawnMaterial/);
 assert.match(landscape,/const paving=\[\],links=\[\]/);
});
test('tablet park vegetation stays within the instance, draw-call and triangle budgets',()=>{
 const layout=buildSampleCity(),placements=createParkVegetation(layout,{mobile:true});
 assert.ok(new Set(placements.map(p=>p.kind)).size<=PARK_VEGETATION_ASSETS.length);assert.ok(placements.length<=6*34);
 let triangles=0;
 for(const asset of PARK_VEGETATION_ASSETS){const b=readFileSync(new URL(asset.file.replace('../library/','library/'),client));const json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));const per=(json.meshes||[]).flatMap(m=>m.primitives||[]).reduce((n,p)=>n+(json.accessors[p.indices]?.count||json.accessors[p.attributes.POSITION]?.count||0)/3,0);triangles+=per*placements.filter(p=>p.kind===asset.kind).length;}
 assert.ok(triangles<=20000,`${triangles} vegetation triangles`);
});
test('the automatic housing, office and tree selection stays below 1.5 MiB including external images',()=>{
 const paths=[...'abcegi'].map(c=>`library/buildings/kenney-suburban-${c}.glb`).concat([...'abc'].map(c=>`library/buildings/kenney-skyscraper-${c}.glb`),['library/nature/kenney-tree_oak.glb','library/nature/kenney-tree_default.glb']);
 const files=new Set();let total=0;
 for(const path of paths){const url=new URL(path,client);files.add(url.href);const b=readFileSync(url),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));for(const image of j.images||[])if(image.uri&&!image.uri.startsWith('data:'))files.add(new URL(image.uri,url).href);}
 for(const f of files)total+=statSync(new URL(f)).size;assert.ok(total<=1.5*1024*1024,`${total} bytes`);
});
