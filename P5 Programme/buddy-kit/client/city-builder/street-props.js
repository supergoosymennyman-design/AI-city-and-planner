// Shared opaque furniture batches; lamps use emissive caps, not hundreds of lights.
import * as THREE from 'three';
import {loadStreetFurnitureEntry} from './street-furniture.js';
import { streetlightPlacements } from '../city-common/roadside-placement.js';
export { streetlightPlacements } from '../city-common/roadside-placement.js';
export async function createStreetProps(scene,layout){
 const [light,bench]=await Promise.all([loadStreetFurnitureEntry({id:'prop_streetlight_k',scale:1}),layout.autoScenery===false?null:loadStreetFurnitureEntry({id:'prop_bench_k',scale:1.4})]);
 const lights=streetlightPlacements(layout),benches=[],batches=[];
 if(bench)for(const p of layout.parks||[]){const count=Math.min(20,Math.max(4,Math.round(p.radius/6)));for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=p.radius*.57;benches.push({x:p.cx+Math.cos(a)*r,z:p.cz+Math.sin(a)*r,yaw:-a-Math.PI/2});}}
 function batch(asset,places){if(!asset||!places.length)return;const b=new THREE.InstancedMesh(asset.geometry,asset.material,places.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);places.forEach((p,i)=>{q.setFromAxisAngle(up,p.yaw);m.compose(new THREE.Vector3(p.x,p.y||0,p.z),q,new THREE.Vector3(1,1,1));b.setMatrixAt(i,m);});b.instanceMatrix.needsUpdate=true;b.castShadow=false;scene.add(b);batches.push(b);}
 batch(light,lights);batch(bench,benches);
 const capGeo=new THREE.BoxGeometry(.32,.12,.32),capMat=new THREE.MeshStandardMaterial({color:0xffdb98,emissive:0xffcc75,emissiveIntensity:1.1,roughness:1});capMat.userData.timeLamp=true;
 batch({geometry:capGeo,material:capMat},lights.map(p=>({...p,y:3.8})));
 return {getCount:()=>({lights:light?lights.length:0,benches:bench?benches.length:0}),destroy(){for(const b of batches){b.removeFromParent();b.dispose();}capGeo.dispose();capMat.dispose();}};
}
