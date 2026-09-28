import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { pointAt, worldAt } from './driving-simulation.js';
function block(root,w,h,d,color,x=0,y=0,z=0){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));mesh.position.set(x,y,z);root.add(mesh);return mesh;}
export function renderDrivingCourse(group,next){
 let lamp=null;
      if(!next.roads)for(const seg of next.track.segments){const road=block(group,next.track.width,.12,seg.len+.08,0x475756,(seg.a.x+seg.b.x)/2,.02,(seg.a.z+seg.b.z)/2);road.rotation.y=seg.heading;}
    for(let s=3;s<next.track.length;s+=5){const p=pointAt(next.track,s),mark=block(group,.12,.02,1.4,0xffe6a1,p.x,.14,p.z);mark.rotation.y=p.heading;}
    const end=pointAt(next.track,next.track.length-5.5),finish=block(group,next.track.width,.03,9,0x5a9d7b,end.x,.15,end.z);finish.rotation.y=end.heading;
    for(const obstacle of next.track.obstacles)block(group,3,1.2,1.2,0xde9d42,obstacle.x,.6,obstacle.z);
    if(next.track.light){const p=pointAt(next.track,next.track.light.s);const line=block(group,next.track.width,.04,.25,0xffefd0,p.x,.18,p.z);line.rotation.y=p.heading;const x=p.x+Math.cos(p.heading)*4,z=p.z-Math.sin(p.heading)*4;block(group,.15,3,.15,0x263d37,x,1.5,z);lamp=block(group,.5,.5,.5,0xe96249,x,3,z);}
    const actors=(next.actors||[]).map(actor=>({actor,mesh:block(group,actor.kind==='pedestrian'?.6:1.8,actor.kind==='pedestrian'?1.6:1.2,actor.kind==='pedestrian'?.6:3,0xdbaa55)}));

 for(const actor of next.actors||[])if(actor.crossing){const p=pointAt(next.track,actor.s);const area=block(group,16,.02,4,0x748582,p.x,.13,p.z);area.rotation.y=p.heading;}
 const world=worldAt(next,0);for(const [id,{mesh}] of actors.entries()){const p=world.obstacles.find(o=>o.actorId===id);mesh.visible=!!p;if(p){mesh.position.set(p.x,.8,p.z);mesh.rotation.y=p.heading;}}
 return {lamp,actors};
}
export async function loadDrivingAudi(){
 const {scene:model}=await createGLTFLoader().loadAsync(new URL('../library/vehicles/audi-a7.glb',import.meta.url).href);
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 if(!size.x||!size.y||!size.z)throw Error('Audi geometry is missing');
 model.scale.set(2.05/size.x,1.43/size.y,5/size.z);bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);
 const car=new THREE.Group();car.name='driving-audi';car.add(model);return car;
}
