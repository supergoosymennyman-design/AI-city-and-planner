import * as THREE from 'three';
import { CITY_PALETTE as P } from './city-palette.js';
import { loadStreetFurnitureEntry } from './street-furniture.js';

// A few shared, opaque batches. No lights, render targets or extra textures.
export function createPublicSpaces(scene, environment, {treeVariants=[]}={}) {
  const group=new THREE.Group();group.name='Neighbourhood public spaces';scene.add(group);
  let alive=true;const owned=[],batches=[];
  const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  function batch(geometry,material,placements) {
    if(!alive || !placements.length)return;
    const inst=new THREE.InstancedMesh(geometry,material,placements.length);
    inst.castShadow=false;inst.receiveShadow=false;inst.userData.publicSpace=true;
    placements.forEach((p,i)=>{quaternion.setFromAxisAngle(up,p.yaw||0);matrix.compose(new THREE.Vector3(p.x,p.y||0,p.z),quaternion,new THREE.Vector3(...(p.scale||[1,1,1])));inst.setMatrixAt(i,matrix);});
    inst.instanceMatrix.needsUpdate=true;group.add(inst);batches.push(inst);
  }
  function flat(color) {const m=new THREE.MeshStandardMaterial({color,roughness:1,metalness:0});owned.push(m);return m;}
  const circle=new THREE.CircleGeometry(1,24).rotateX(-Math.PI/2),square=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);owned.push(circle,square);
  const lawn=[],stone=[],paths=[],treeSlots=[],benches=[],planters=[],parasols=[];
  for(const s of environment.spaces) {
    lawn.push({x:s.x,z:s.z,y:-.065,scale:[s.radius,1,s.radius]});
    stone.push({x:s.x,z:s.z,y:-.05,scale:[s.radius-1.1,1,s.radius-1.1]});
    const dx=s.x-s.entrance.x,dz=s.z-s.entrance.z;
    paths.push({x:(s.x+s.entrance.x)/2,z:(s.z+s.entrance.z)/2,y:-.045,yaw:Math.atan2(dx,dz),scale:[1.6,1,Math.hypot(dx,dz)]});
    // Furniture and trees stay outside the conversation ring and entrance.
    const angle=Math.atan2(s.nz,s.nx);
    for(const side of [-1,1]) {
      const a=angle+side*1.15;
      treeSlots.push({x:s.x+Math.cos(a)*4.8,z:s.z+Math.sin(a)*4.8});
      const b=angle+side*2.0;
      const x=s.x+Math.cos(b)*3.8,z=s.z+Math.sin(b)*3.8;
      benches.push({x,z,y:0,yaw:Math.atan2(s.x-x,s.z-z)});
    }
    planters.push({x:s.x+s.nx*4.2,z:s.z+s.nz*4.2});
    if(s.kind==='cafe')parasols.push({x:s.x-s.nz*3.7,z:s.z+s.nx*3.7});
  }
  batch(circle,flat(P.lawn),lawn);batch(circle,flat(P.stone),stone);batch(square,flat(P.stone),paths);
  const variants=treeVariants.slice(0,2);
  variants.forEach((v,i)=>batch(v.geo,v.materials,treeSlots.filter((_,j)=>j%variants.length===i).map(p=>({...p,scale:[3.8/v.height,3.8/v.height,3.8/v.height]}))));
  const ready=Promise.all([
    [{id:'prop_bench_k',scale:1.4},benches],
    [{id:'nat_planter',scale:1.8},planters],
    [{id:'prop_parasol_a',scale:.8},parasols],
  ].map(async([entry,slots])=>{if(!slots.length)return;const asset=await loadStreetFurnitureEntry(entry);if(asset)batch(asset.geometry,asset.material,slots);})).catch(e=>console.warn('[public-spaces] optional furniture unavailable',e));
  return {group,ready,get drawCalls(){return batches.reduce((n,b)=>n+(Array.isArray(b.material)?b.geometry.groups.length:1),0);},destroy(){alive=false;group.removeFromParent();for(const inst of batches)inst.dispose();for(const resource of owned)resource.dispose();batches.length=0;}};
}
