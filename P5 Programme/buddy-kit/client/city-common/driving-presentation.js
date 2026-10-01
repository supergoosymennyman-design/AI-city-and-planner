import * as THREE from 'three';
import { createGLTFLoader } from '../shared/gltf.js';
import { pointAt, worldAt } from './driving-simulation.js';

const PALETTE={road:0x343b40,white:0xecebe2,concrete:0xbcbeb5,steel:0x78858a,blue:0x42677b,grass:0x87927a,gravel:0xa2a398,orange:0xd98243};
// Resources belong to the returned scene graph, never to a module-level cache.
// All repeated cuboids sharing a finish are submitted in a single draw call.
function construction(root){
 const batches=new Map();
 return {
  box(w,h,d,color,x=0,y=0,z=0,yaw=0){let batch=batches.get(color);if(!batch)batches.set(color,batch=[]);batch.push({w,h,d,x,y,z,yaw});},
  finish(){const geometry=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();for(const [color,items]of batches){const material=new THREE.MeshStandardMaterial({color,roughness:.88});if(items.every(p=>p.h<.05)){material.polygonOffset=true;material.polygonOffsetFactor=-6;material.polygonOffsetUnits=-6;}if(color===PALETTE.grass){material.map=surfaceTexture(235);material.map.repeat.set(24,32);}
 const mesh=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.receiveShadow=true;root.add(mesh);}}
 };
}
function surfaceTexture(base=215){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);let seed=71;
 for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=base+(seed%21)-10;data.data.set([v,v,v,255],i);}ctx.putImageData(data,0,0);
 const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
function ribbon(root,track,left,right,y,material,name){
 const positions=[],uv=[],indices=[];let distance=0;
 track.points.forEach((p,i)=>{
  const before=track.segments[Math.max(0,i-1)].heading,after=track.segments[Math.min(i,track.segments.length-1)].heading;
  const turn=Math.atan2(Math.sin(after-before),Math.cos(after-before)),heading=before+turn/2,miter=1/Math.max(.3,Math.cos(turn/2));
  if(i)distance+=Math.hypot(p.x-track.points[i-1].x,p.z-track.points[i-1].z);
  for(const side of [left,right]){positions.push(p.x+side*Math.cos(heading)*miter,y,p.z-side*Math.sin(heading)*miter);uv.push(side/3,distance/3);}
  if(i){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
 });
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 material.polygonOffset=true;material.polygonOffsetFactor=material.polygonOffsetUnits=({
 'course-gravel':-1,'course-shoulders':-2,'permanent-course-road':-3,'course-edge-line':-4
 })[name]||-1;
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.userData.segments=track.segments.length;mesh.receiveShadow=true;root.add(mesh);return mesh;
}
// Positive route heading changes turn toward the driver's left.
function bendDirection(track,from,to){const delta=pointAt(track,to).heading-pointAt(track,from).heading;return Math.atan2(Math.sin(delta),Math.cos(delta))>0?'left':'right';}
function board(root,build,label,x,y,z,width=3,height=1,yaw=Math.PI,backLabel=label){
 const faces=[];
 for(const [index,text]of [label,backLabel].entries()){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*height/width);const ctx=canvas.getContext('2d');ctx.fillStyle='#293e4b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#d7e3e5';ctx.fillRect(20,20,8,canvas.height-40);ctx.font=`600 ${Math.min(canvas.height*.4,canvas.width/(text.length*.65))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f2f1e9';ctx.fillText(text,canvas.width/2+8,canvas.height/2,canvas.width-65);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide}));face.name='course-sign';face.userData={label:text,face:index?'back':'front'};const rotation=yaw+index*Math.PI;face.position.set(x+Math.sin(rotation)*.006,y,z+Math.cos(rotation)*.006);face.rotation.y=rotation;root.add(face);faces.push(face);
 }
 for(const side of [-1,1])build.box(.09,y-height/2,.09,PALETTE.steel,x+side*width*.4*Math.cos(yaw),(y-height/2)/2,z-side*width*.4*Math.sin(yaw));return faces;
}
function permanentCourse(root,next,language){
 const track=next.courseTrack||next.track,half=track.width/2,build=construction(root),mat=color=>new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide});
 const asphalt=mat(PALETTE.road);asphalt.map=surfaceTexture();
 ribbon(root,track,-half-1.4,half+1.4,.025,mat(PALETTE.gravel),'course-gravel');
 ribbon(root,track,-half-.65,half+.65,.055,mat(PALETTE.concrete),'course-shoulders');
 ribbon(root,track,-half,half,.08,asphalt,'permanent-course-road');
 const paint=mat(PALETTE.white);for(const side of [-1,1])ribbon(root,track,side*(half-.18),side*(half-.06),.092,paint,'course-edge-line');
 // Archived courses keep their own geometry; the facility is exclusive to v1.
 if(next.courseVersion!==1){build.finish();return;}
 const xs=track.points.map(p=>p.x),zs=track.points.map(p=>p.z),minX=Math.min(...xs)-10,maxX=Math.max(...xs)+10,minZ=Math.min(...zs)-10,maxZ=Math.max(...zs)+10;
 build.box(maxX-minX,.12,maxZ-minZ,PALETTE.grass,(minX+maxX)/2,-.07,(minZ+maxZ)/2);
 // Sparse repair seams are decorative and stay clear of the route guide.
 for(const s of [24,55,105,173]){const p=pointAt(track,s);build.box(.035,.012,2,0x42494b,p.x+Math.cos(p.heading)*1.9,.095,p.z-Math.sin(p.heading)*1.9,p.heading);}
 const offset=(s,l)=>{const p=pointAt(track,s);return {...p,x:p.x+Math.cos(p.heading)*l,z:p.z-Math.sin(p.heading)*l};};
 for(let s=5;s<track.length-2;s+=6){for(const side of [-1,1]){if((s>=34&&s<=56)||(s>=100&&s<=119))continue;const p=offset(s,side*(half+1.05));build.box(.12,.85,.16,PALETTE.white,p.x,.46,p.z,p.heading);build.box(.13,.15,.17,PALETTE.blue,p.x,.72,p.z,p.heading);}
  const p=offset(s,half+.38);build.box(.28,.015,.55,0x566061,p.x,.068,p.z,p.heading);for(let i=-2;i<=2;i++)build.box(.3,.018,.025,PALETTE.steel,p.x+Math.sin(p.heading)*i*.09,.08,p.z+Math.cos(p.heading)*i*.09,p.heading);
 }
 for(const [from,to,side]of [[62,99,1],[123,159,-1]]){
  for(let s=from;s<to;s+=2){const p=offset(s,side*(half+.3));build.box(.46,.13,1.8,(s-from)%4===0?PALETTE.white:PALETTE.blue,p.x,.12,p.z,p.heading);}
  for(let s=from+2;s<to-2;s+=3){const p=offset(s,side*(half+2));build.box(.12,.85,.12,PALETTE.steel,p.x,.45,p.z);build.box(.14,.28,3.15,PALETTE.steel,p.x,.77,p.z,p.heading);}
  for(let s=from+5;s<to;s+=12){const p=offset(s,side*(half+2.6)),left=bendDirection(track,from,to)==='left';const faces=board(root,build,left?'‹ ‹':'› ›',p.x,1.6,p.z,1.4,.65,p.heading+Math.PI,left?'› ›':'‹ ‹');for(const face of faces)face.userData.bend=bendDirection(track,from,to);}
 }
 // Perimeter rails sit one metre inside the existing reserved rectangle.
 function fence(x,z,length,yaw){for(let s=0;s<length;s+=4){const span=Math.min(4,length-s),px=x+Math.sin(yaw)*s,pz=z+Math.cos(yaw)*s;build.box(.1,1.15,.1,PALETTE.steel,px,.575,pz);for(const y of [.4,.95])build.box(.06,.055,span,PALETTE.steel,px+Math.sin(yaw)*span/2,y,pz+Math.cos(yaw)*span/2,yaw);}}
 fence(minX+1,minZ+1,maxZ-minZ-2,0);fence(maxX-1,minZ+1,maxZ-minZ-2,0);fence(minX+1,maxZ-1,maxX-minX-2,Math.PI/2);
 fence(minX+1,minZ+1,-5-(minX+1),Math.PI/2);fence(5,minZ+1,maxX-6,Math.PI/2);
 // Compact control pavilion and preparation apron alongside the start straight.
 build.box(4.5,.1,15,PALETTE.concrete,-7,.01,5);build.box(3.8,2.7,5,0xd9dbd2,-7,1.4,7);
 build.box(.035,1.3,4.3,0x304c5a,-5.08,1.85,7);build.box(3.2,1.3,.035,0x304c5a,-7,1.85,4.48);
 build.box(4.6,.18,6,PALETTE.blue,-6.8,2.85,6.8);build.box(4.5,.13,3.5,PALETTE.blue,-7,2.85,2.5);
 for(const x of [-8.8,-5.2])build.box(.1,2.8,.1,PALETTE.steel,x,1.4,1);
 board(root,build,language==='zh-Hant'?'AI 駕駛學校':'AI Driving School',-6.5,3.3,-3,6,1.05);
 board(root,build,language==='zh-Hant'?'控制室':'CONTROL',-7,2,4.44,2.9,.45);
 const bendLabels=[ [57,62,99,'02'],[119,123,159,'03'] ].map(([s,from,to,n])=>{
  const left=bendDirection(track,from,to)==='left';
  return [s,`${n}  ${left?'LEFT':'RIGHT'} BEND`,`${n}  ${left?'左':'右'}彎`,`${n}  ${left?'RIGHT':'LEFT'} BEND`,`${n}  ${left?'右':'左'}彎`];
 });
 for(const [s,en,zh,backEn=en,backZh=zh]of [[18,'01  STRAIGHT','01  直路'],...bendLabels,[183,'04  FINISH','04  終點']]){const p=offset(s,-6.6);board(root,build,language==='zh-Hant'?zh:en,p.x,2,p.z,2.8,.85,p.heading+Math.PI,language==='zh-Hant'?backZh:backEn);}
 const shrubs=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x65765d,roughness:1}),9),shrub=new THREE.Object3D();let shrubIndex=0;root.add(shrubs);
 for(const s of [27,92,167]){const p=offset(s,-8);build.box(.13,5,.13,PALETTE.steel,p.x,2.5,p.z);build.box(1,.16,.55,PALETTE.white,p.x,5,p.z);for(let i=0;i<3;i++){shrub.position.set(p.x+.65,.35,p.z+i*1.1);shrub.scale.set(.55,.45,.6);shrub.rotation.y=i;shrub.updateMatrix();shrubs.setMatrixAt(shrubIndex++,shrub.matrix);}}
 build.finish();
}
function actorModel(kind){
 const root=new THREE.Group(),build=construction(root);
 // Actor origins retain the simulation's historical y=.8 anchor.
 if(kind==='pedestrian'){
  build.box(.45,.65,.3,PALETTE.blue,0,.17,0);for(const x of [-.14,.14])build.box(.14,.7,.18,0x303b44,x,-.43,0);
  for(const x of [-.31,.31])build.box(.13,.6,.15,0xc69977,x,.12,0);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshStandardMaterial({color:0xc69977}));head.position.y=.72;root.add(head);
 }else{
  build.box(1.8,.55,3.4,PALETTE.blue,0,-.17,0);build.box(1.5,.55,1.7,0x233d4c,0,.37,-.15);build.box(1.55,.1,1.8,PALETTE.blue,0,.69,-.15);
  for(const x of [-.91,.91])for(const z of [-1.05,1.05]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.2,12),new THREE.MeshStandardMaterial({color:0x252b2d}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,-.45,z);root.add(wheel);}
  for(const x of [-.6,.6]){build.box(.38,.18,.05,PALETTE.white,x,-.1,1.72);build.box(.35,.15,.05,0xb45242,x,-.1,-1.72);}
 }build.finish();return root;
}
export function updateDrivingSignal(lamp,state){
 if(!lamp)return;const colors=[0x62bc7a,0xe5b143,0xe15b47];
 lamp.userData.lenses.forEach((lens,i)=>{lens.material.color.setHex(i===state?colors[i]:0x435052);lens.material.emissive.setHex(i===state?colors[i]:0);lens.material.emissiveIntensity=i===state?.6:0;});
}
export function renderDrivingCourse(group,next,{geometry=true,trial=true,language=globalThis.localStorage?.getItem('hk_ai_city_lang_v1')||'en'}={}){
 if(geometry&&!next.roads)permanentCourse(group,next,language);
 if(!trial)return {lamp:null,actors:[]};
 const build=construction(group),mark=(s,w,d,color,y=.14,lateral=0)=>{const p=pointAt(next.track,s);build.box(w,.025,d,color,p.x+Math.cos(p.heading)*lateral,y,p.z-Math.sin(p.heading)*lateral,p.heading);};
 mark(3,next.track.width,.4,0x78c6df,.16);
 for(let s=3;s<next.track.length;s+=5)mark(s,.12,1.4,0xffe6a1);
 const end=next.track.length-5.5;mark(end,next.track.width,9,0x5a9d7b,.12);for(const s of [end-4.5,end+4.5])mark(s,next.track.width,.16,PALETTE.white,.16);for(const side of [-1,1])mark(end,.16,9,PALETTE.white,.16,side*(next.track.width/2-.12));
 for(const obstacle of next.track.obstacles){const p=pointAt(next.track,obstacle.s??0),yaw=obstacle.heading??p.heading;const barrier=new THREE.Group();barrier.position.set(obstacle.x,0,obstacle.z);barrier.rotation.y=yaw;group.add(barrier);const b=construction(barrier);b.box(3,.65,.4,PALETTE.white,0,.85,0);for(let x=-1.25;x<1.5;x+=.5)b.box(.22,.65,.415,PALETTE.orange,x,.85,0);for(const x of [-1,1]){b.box(.12,.8,.12,PALETTE.steel,x,.4,0);b.box(.45,.12,1,0x39434a,x,.06,0);}b.finish();}
 let lamp=null;
 if(next.track.light){const p=pointAt(next.track,next.track.light.s),x=p.x+Math.cos(p.heading)*(next.track.width/2+.9),z=p.z-Math.sin(p.heading)*(next.track.width/2+.9);mark(next.track.light.s,next.track.width,.25,PALETTE.white,.18);lamp=new THREE.Group();lamp.name='trial-signal';lamp.position.set(x,0,z);lamp.rotation.y=p.heading+Math.PI;group.add(lamp);const b=construction(lamp);b.box(.12,2.5,.12,PALETTE.steel,0,1.25,0);b.box(.55,1.55,.4,0x222c31,0,2.9,0);b.finish();lamp.userData.lenses=[0,1,2].map(i=>{const lens=new THREE.Mesh(new THREE.CircleGeometry(.17,16),new THREE.MeshStandardMaterial({color:0x435052}));lens.position.set(0,2.43+i*.47,.211);lamp.add(lens);return lens;});updateDrivingSignal(lamp,worldAt(next,0).signal);}
 for(const actor of next.actors||[])if(actor.crossing||actor.kind==='pedestrian'){
  // Mark the exact encounter station, including pedestrian actors without crossing:true.
  for(let lateral=-next.track.width/2+.5;lateral<next.track.width/2;lateral+=.85)mark(actor.s,.42,3,PALETTE.white,.155,lateral);
 }
 const actors=(next.actors||[]).map((actor,i)=>{const mesh=actorModel(actor.kind);mesh.name='trial-actor-'+i;group.add(mesh);return {actor,mesh};});
 const world=worldAt(next,0);for(const [id,{mesh}]of actors.entries()){const p=world.obstacles.find(o=>o.actorId===id);mesh.visible=!!p;if(p){mesh.position.set(p.x,.8,p.z);mesh.rotation.y=p.heading;}}
 build.finish();return {lamp,actors};
}
export async function loadDrivingAudi(){
 const {scene:model}=await createGLTFLoader().loadAsync(new URL('../library/vehicles/audi-a7.glb',import.meta.url).href);
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
 if(!size.x||!size.y||!size.z)throw Error('Audi geometry is missing');
 model.scale.set(2.05/size.x,1.43/size.y,5/size.z);bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 const car=new THREE.Group();car.name='driving-audi';car.add(model);return car;
}
