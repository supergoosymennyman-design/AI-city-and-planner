import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CITY_PALETTE as P} from './city-palette.js';
// Three merged surface batches, independent of park count. No downloaded maps.
export function createParkLandscape(scene,layout,environment,{mobile=false,lawnMaterial=null}={}){
 const group=new THREE.Group();group.name='Park landscape';scene.add(group);const paving=[],lawns=[],links=[];
 if(layout.autoScenery!==false)for(const park of (layout.parks||[]).slice(0,mobile?6:12)){
  const r=park.radius;if(r<12)continue;
  const ringR=r*.55;
  for(let i=0;i<48;i++){const a=i*Math.PI/24,b=(i+1)*Math.PI/24,start={x:park.cx+Math.cos(a)*ringR,z:park.cz-Math.sin(a)*ringR},end={x:park.cx+Math.cos(b)*ringR,z:park.cz-Math.sin(b)*ringR};if(!environment.clear(start,end,1.4))continue;paving.push(new THREE.RingGeometry(Math.max(1,ringR-1.25),ringR+1.25,1,1,a,Math.PI/24).rotateX(-Math.PI/2).translate(park.cx,.055,park.cz));}
  // Mown clearings inside the loop make open ground intentional, with no props to collide with.
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.4;const x=park.cx+Math.cos(a)*r*.26,z=park.cz+Math.sin(a)*r*.26;if(environment.clear({x,z},{x,z},r*.18))lawns.push(new THREE.CircleGeometry(r*.18,24).rotateX(-Math.PI/2).translate(x,.04,z));}
  const candidates=environment.nodes.filter(n=>n.kind==='pavement' && Math.hypot(n.x-park.cx,n.z-park.cz)<r+30).sort((a,b)=>Math.hypot(a.x-park.cx,a.z-park.cz)-Math.hypot(b.x-park.cx,b.z-park.cz));
  const chosen=[];
  for(const n of candidates){if(chosen.length===2)break;const a=Math.atan2(n.z-park.cz,n.x-park.cx);if(chosen.some(v=>Math.cos(a-v)>.15))continue;const start={x:park.cx+Math.cos(a)*ringR,z:park.cz+Math.sin(a)*ringR};if(!environment.clear(start,n,.7))continue;
   chosen.push(a);const dx=n.x-start.x,dz=n.z-start.z;links.push(new THREE.PlaneGeometry(1.4,Math.hypot(dx,dz)).rotateX(-Math.PI/2).rotateY(Math.atan2(dx,dz)).translate((start.x+n.x)/2,.06,(start.z+n.z)/2));
  }
 }
 for(const [pieces,color] of [[paving,P.stone],[lawns,P.lawn],[links,P.stone]]){if(!pieces.length)continue;const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());const material=color===P.lawn&&lawnMaterial?lawnMaterial():new THREE.MeshStandardMaterial({color,roughness:1});const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=false;group.add(mesh);}
 return {group,get drawCalls(){return group.children.length;},destroy(){group.removeFromParent();for(const m of group.children){m.geometry.dispose();m.material.dispose();}}};
}
