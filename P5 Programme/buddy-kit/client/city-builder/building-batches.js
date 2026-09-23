import * as THREE from 'three';
// Preserve mesh transforms and materials while merging only repeated draws.
export function batchBuildings(clones){
 const batches=new Map(),group=new THREE.Group();group.name='Shared building batches';
 for(const root of clones){root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;const key=o.geometry.uuid+'|'+(Array.isArray(o.material)?o.material.map(m=>m.uuid).join(','):o.material.uuid);if(!batches.has(key))batches.set(key,{geometry:o.geometry,material:o.material,matrices:[]});batches.get(key).matrices.push(o.matrixWorld.clone());});root.removeFromParent();}
 for(const b of batches.values()){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 return group;
}
// One small emissive mask per shared source atlas, generated once on load.
const masks=new WeakMap();
export function prepareBuildingMaterials(root, makeWindowMasks=true){root.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
 if(!m.isMeshStandardMaterial || m.userData.cityPrepared)continue;m.userData.cityPrepared=true;m.roughness=Math.max(.65,m.roughness);m.metalness=Math.min(.15,m.metalness);
 if(!makeWindowMasks || !m.map?.image || m.emissiveMap)continue;
 let mask=masks.get(m.map);
 if(!mask){try{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(m.map.image,0,0,256,256);const data=ctx.getImageData(0,0,256,256);for(let i=0;i<data.data.length;i+=4){const [r,g,b]=data.data.slice(i,i+3),lit=b-r>32 && b>g*1.08 && r<160;data.data[i]=lit?255:0;data.data[i+1]=lit?211:0;data.data[i+2]=lit?145:0;data.data[i+3]=255;}ctx.putImageData(data,0,0);mask=new THREE.CanvasTexture(canvas);mask.colorSpace=THREE.SRGBColorSpace;mask.flipY=m.map.flipY;mask.magFilter=m.map.magFilter;mask.minFilter=m.map.minFilter;mask.offset.copy(m.map.offset);mask.repeat.copy(m.map.repeat);mask.rotation=m.map.rotation;mask.channel=m.map.channel;mask.wrapS=m.map.wrapS;mask.wrapT=m.map.wrapT;masks.set(m.map,mask);}catch{continue;}}
 m.emissiveMap=mask;m.emissive.setHex(0xffffff);m.emissiveIntensity=.7;
 // The time controller only adjusts deliberate facade-window masks, never
 // arbitrary emissive GLB materials such as signs or vehicle lights.
 m.userData.timeWindow=true;m.needsUpdate=true;
 }});}
