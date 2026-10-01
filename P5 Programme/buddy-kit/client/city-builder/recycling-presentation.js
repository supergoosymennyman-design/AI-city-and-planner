import * as THREE from 'three';
import { RECYCLING_LAYOUT as L, queuePosition, collectedPosition, recyclingItemPosition, worldEquipmentRect } from '../city-common/recycling-layout.js';
import { BINS } from '../city-common/recycling.js';
import { createGLTFLoader } from '../shared/gltf.js';

const COLORS={frame:0x344349,panel:0xeeeade,belt:0x263438,roller:0x839294,teal:0x3dafa3,concrete:0xc4c7bd,joint:0xa5aaa2,amber:0xe4aa45};
const LABELS=[['CARDBOARD','紙皮'],['GLASS','玻璃'],['METAL','金屬'],['PAPER','紙張'],['PLASTIC','塑膠'],['TRASH','垃圾'],['HUMAN CHECK','人手檢查']];
function release(root){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();
}
/** Owns only presentation resources. No classifier meshes or saved data are changed. */
export function createRecyclingPresentation(root,{site,truckURL,onTruckCollider}={}){
 const group=new THREE.Group();group.name='recycling-facility';root.add(group);
 const materials=new Map(),batches=new Map(),meters=[],gates=[],items=new Map();let rows=[],factory=null,dead=false,lastStamp='',itemSize=L.itemSize;
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.85}));return materials.get(color);};
 function block(w,h,d,color,x,y,z){const key=String(color);if(!batches.has(key))batches.set(key,[]);batches.get(key).push([w,h,d,x,y,z]);}
 function label(width,height,x,y,z,draw,tilt=0){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=384;const ctx=canvas.getContext('2d');draw(ctx,canvas);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.x=tilt;group.add(mesh);return {canvas,texture};
 }
 const f=L.forecourt;block(f.w,.12,f.d,COLORS.concrete,0,.06,0);
 for(let x=-10;x<14;x+=6)block(.025,.006,18,COLORS.joint,x,.124,0);
 for(let z=-6;z<9;z+=6)block(28,.006,.025,COLORS.joint,0,.124,z);
 // Docking bay and a continuous clear apron behind the machine.
 for(const z of [-2.8,.8])block(7.5,.012,.08,COLORS.panel,-9.9,.135,z);
 block(.08,.012,3.6,COLORS.amber,-6.35,.135,-1);
 for(let x=-12;x<=-7;x+=1)block(.3,.015,.1,COLORS.amber,x,.14,.95);
 for(const x of [-10,0,10]){block(.09,.01,1.1,COLORS.panel,x,.135,7.2);for(const side of [-1,1]){const dash=new THREE.Mesh(new THREE.BoxGeometry(.07,.01,.5),material(COLORS.panel));dash.rotation.y=side*.65;dash.position.set(x+side*.14,.14,6.55);group.add(dash);}}
 // Every belt shares its deck elevation, side panels, rollers and feet.
 const rollerMatrices=[];
 function belt(r,alongX=true){
  block(r.w,.26,r.d,COLORS.frame,r.x,L.deck-.2,r.z);block(r.w-.12,.06,r.d-.12,COLORS.belt,r.x,L.deck-.03,r.z);
  for(const side of [-1,1]){
   block(alongX?r.w:.12,.3,alongX?.12:r.d,COLORS.panel,r.x+(alongX?0:side*(r.w/2-.06)),L.deck-.18,r.z+(alongX?side*(r.d/2-.06):0));
   for(const end of [-1,1]){const x=r.x+(alongX?end*(r.w/2-.35):side*(r.w/2-.2)),z=r.z+(alongX?side*(r.d/2-.2):end*(r.d/2-.35));block(.18,L.deck-.5,.18,COLORS.frame,x,(L.deck-.5)/2+.14,z);block(.45,.08,.4,COLORS.frame,x,.18,z);}
  }
  const length=alongX?r.w:r.d;
  for(let p=-length/2+.2;p<length/2;p+=.5){const o=new THREE.Object3D();o.position.set(r.x+(alongX?p:0),L.deck-.095,r.z+(alongX?0:p));o.rotation.set(alongX?Math.PI/2:0,0,alongX?0:Math.PI/2);o.scale.set(.075,(alongX?r.d:r.w)-.18,.075);o.updateMatrix();rollerMatrices.push(o.matrix.clone());}
 }
 belt(L.main);belt(L.transfer,false);belt(L.distribution);
 block(.8,.65,.65,COLORS.frame,L.motor.x,1.35,L.motor.z);block(.55,.4,.12,COLORS.teal,L.motor.x,1.35,L.motor.z-.36);
 const h=L.hopper;block(h.w,.22,h.d,COLORS.frame,h.x,L.deck-.13,h.z);
 for(const side of [-1,1]){block(h.w,.65,.12,COLORS.panel,h.x,L.deck+.24,h.z+side*(h.d/2-.06));block(.18,L.deck,.18,COLORS.frame,h.x+side*.85,L.deck/2,h.z+1);}
 block(.12,.65,h.d,COLORS.panel,h.x-h.w/2+.06,L.deck+.24,h.z);
 // Open scanner portal, chamfered shoulders, dark optical head, small indicators.
 const scanner=L.scanner;
 const portal=new THREE.Shape();[[-.8,0],[.8,0],[.8,2.8],[.5,3.2],[-.5,3.2],[-.8,2.8]].forEach(([x,y],i)=>i?portal.lineTo(x,y):portal.moveTo(x,y));portal.closePath();
 for(const z of [scanner.z-1.35,scanner.z+1.35]){const geo=new THREE.ExtrudeGeometry(portal,{depth:.32,bevelEnabled:true,bevelSize:.09,bevelThickness:.08,bevelSegments:1,steps:1});const m=new THREE.Mesh(geo,material(COLORS.panel));m.position.set(scanner.x,.15,z-.16);group.add(m);block(.22,1.15,.035,COLORS.teal,scanner.x,2.25,z+.23);}
 block(1.75,.62,3.15,COLORS.frame,scanner.x,3.52,scanner.z);block(1.6,.17,3.2,COLORS.panel,scanner.x,3.91,scanner.z);
 const indicator=new THREE.Mesh(new THREE.BoxGeometry(.04,.1,2.5),new THREE.MeshStandardMaterial({color:COLORS.teal,emissive:COLORS.teal,emissiveIntensity:.2,roughness:.6}));indicator.position.set(scanner.x+.895,3.48,scanner.z);group.add(indicator);
 const sensor=new THREE.Mesh(new THREE.BoxGeometry(.12,.38,.5),material(COLORS.belt));sensor.position.set(scanner.x+.94,2.8,scanner.z);group.add(sensor);
 for(const x of [-1.7,-.3])for(const z of [-2.8,.8])block(.25,.02,.25,COLORS.amber,x,.15,z);
 label(5.6,1.3,L.sign.x,2.9,L.sign.z,(ctx)=>{ctx.fillStyle='#344349';ctx.fillRect(0,0,768,384);ctx.fillStyle='#55b9aa';ctx.fillRect(0,0,14,384);ctx.textAlign='left';ctx.fillStyle='#f7f1df';ctx.font='bold 90px sans-serif';ctx.fillText('MATERIALS LAB',40,130,690);ctx.font='80px sans-serif';ctx.fillText('物料分類站   /   01',40,245,690);ctx.font='45px sans-serif';ctx.fillText('SCAN   →   SORT   →   COLLECT',40,335,690);});
 for(const dx of [-2.3,2.3])block(.12,2.8,.15,COLORS.frame,L.sign.x+dx,1.5,L.sign.z);
 for(const [i,b] of L.bins.entries()){
  const color=Number(BINS[i].color.replace('#','0x'));
  block(b.w,.15,b.d,COLORS.frame,b.x,.22,b.z);
  for(const side of [-1,1]){block(.12,1.22,b.d,COLORS.panel,b.x+side*(b.w/2-.06),.88,b.z);for(const end of [-1,1])block(.16,1.48,.16,COLORS.frame,b.x+side*(b.w/2-.08),.88,b.z+end*(b.d/2-.08));}
  block(b.w,.95,.1,color,b.x,.77,b.z+1.2);block(b.w,.7,.1,COLORS.panel,b.x,.64,b.z-1.2);
  // A tray continues the distributor to each open bin. The final drop
  // is inside its walls; the hinged stop is the only moving gate.
  block(2.12,.09,1.6,COLORS.frame,b.x,L.deck-.08,3.05);
  for(const side of [-1,1])block(.065,.24,1.6,COLORS.panel,b.x+side*1.06,L.deck+.03,3.05);
  const gate=new THREE.Group();gate.position.set(b.x,L.deck,2.83);group.add(gate);const leaf=new THREE.Mesh(new THREE.BoxGeometry(1.98,.3,.07),material(color));leaf.position.y=.15;gate.add(leaf);gate.name='gate-'+BINS[i].id;gates.push(gate);
  const face=L.binLabel,meter=label(face.width,face.height,b.x,face.y,b.z+face.offsetZ,()=>{},face.tilt);meters.push({...meter,last:null});
 }
 // Batch repeated static parts into one draw per finish.
 const unit=new THREE.BoxGeometry(1,1,1),o=new THREE.Object3D();
 for(const [color,parts] of batches){const mesh=new THREE.InstancedMesh(unit,material(Number(color)),parts.length);parts.forEach(([w,h,d,x,y,z],i)=>{o.position.set(x,y,z);o.scale.set(w,h,d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);}
 const rollers=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),material(COLORS.roller),rollerMatrices.length);rollerMatrices.forEach((m,i)=>rollers.setMatrixAt(i,m));group.add(rollers);
 const slats=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.018,1.45),material(COLORS.roller),17);group.add(slats);
 const distributionSlats=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.018,1.02),material(COLORS.roller),38);group.add(distributionSlats);
 const transferSlats=new THREE.InstancedMesh(new THREE.BoxGeometry(1.4,.018,.035),material(COLORS.roller),6);group.add(transferSlats);
 function item(index){
  if(items.has(index))return items.get(index);
  const source=factory(rows[index]),wrapper=new THREE.Group();wrapper.userData.recyclingItem=true;wrapper.userData.objectId=rows[index].id;source.userData.objectId=rows[index].id;wrapper.add(source);
  const bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());source.position.add(new THREE.Vector3(-center.x,-bounds.min.y,-center.z));wrapper.scale.setScalar(itemSize/Math.max(size.x,size.y,size.z));wrapper.userData.height=size.y*wrapper.scale.x;group.add(wrapper);const entry={wrapper,source};items.set(index,entry);return entry;
 }
 function place(index,p,state){const {wrapper,source}=item(index);wrapper.visible=true;wrapper.position.set(p.x,p.y,p.z);wrapper.userData.stage=state;source.name=(state==='collected'?'sorted-':state==='waiting'?'waiting-':'')+rows[index].id;}
 function update(trial){
  if(dead)return;const counts=Array(7).fill(0),heights=Array.from({length:7},()=>Array(9).fill(.3)),results=trial?.results||[],index=trial?.index||0,phase=trial?.phase||0;
  const stamp=`${trial?.state}:${index}:${phase}:${results.length}`;if(stamp===lastStamp)return;lastStamp=stamp;
  for(const e of items.values())e.wrapper.visible=false;
  results.forEach((r,i)=>{const b=Math.max(0,BINS.findIndex(b=>b.id===r.bin));const n=counts[b]++,p=collectedPosition(b,n,itemSize+.02);p.y=heights[b][n%9];place(i,p,'collected');heights[b][n%9]+=item(i).wrapper.userData.height;});
  const moving=trial&&index<rows.length&&trial.state!=='ready'&&(phase>0||index>0);
  if(moving){const destination=phase>=13?BINS.findIndex(b=>b.id===trial.current?.bin):6,b=destination<0?6:destination;place(index,recyclingItemPosition(phase,b,counts[b],itemSize+.02,heights[b][counts[b]%9]),'travelling');}
  const first=index+(moving?1:0),reserved=moving&&phase<4?1:0;
  for(let i=first;i<Math.min(rows.length,first+L.queueCapacity-reserved);i++)place(i,queuePosition(i-first+reserved),'waiting');
  const destination=phase>=25&&phase<30?trial?.current?.bin:null;
  gates.forEach((gate,i)=>{gate.rotation.x=BINS[i].id===destination?-Math.PI/2:0;});
  indicator.material.emissiveIntensity=phase>=10&&phase<=14?.7:.12;
  const tick=index*30+phase;
  for(let i=0;i<17;i++){o.position.set(-4.9+((i*.5+tick*.09)%8.5),L.deck+.008,-1);o.rotation.set(0,0,0);o.scale.set(1,1,1);o.updateMatrix();slats.setMatrixAt(i,o.matrix);}slats.instanceMatrix.needsUpdate=true;
  const sign=(L.bins[BINS.findIndex(b=>b.id===trial?.current?.bin)]?.x??8.4)<3?-1:1;
  for(let i=0;i<38;i++){o.position.set(-9.4+((i*.5+sign*tick*.09%19+19)%19),L.deck+.008,2.2);o.updateMatrix();distributionSlats.setMatrixAt(i,o.matrix);}distributionSlats.instanceMatrix.needsUpdate=true;
  for(let i=0;i<6;i++){o.position.set(3,L.deck+.008,-.8+((i*.5+tick*.09)%3));o.updateMatrix();transferSlats.setMatrixAt(i,o.matrix);}transferSlats.instanceMatrix.needsUpdate=true;
  counts.forEach((count,i)=>{const m=meters[i],value=`${count}  /  ${rows.length?Math.round(count/rows.length*100):0}%`;if(value===m.last)return;m.last=value;const ctx=m.canvas.getContext('2d');ctx.fillStyle='#344349';ctx.fillRect(0,0,768,384);ctx.fillStyle=BINS[i].color;ctx.fillRect(0,0,768,22);ctx.fillStyle='#faf4df';ctx.textAlign='center';ctx.font='bold 120px sans-serif';ctx.fillText(LABELS[i][0],384,125,730);ctx.font='100px sans-serif';ctx.fillText(LABELS[i][1],384,240,730);ctx.font='bold 110px sans-serif';ctx.fillText(value,435,365,560);
   // Restrained geometric material symbols, independent of emoji fonts.
   ctx.save();ctx.translate(-290,0);ctx.strokeStyle=BINS[i].color;ctx.lineWidth=8;ctx.beginPath();
   if(i===1||i===4){ctx.moveTo(368,310);ctx.lineTo(400,310);ctx.lineTo(400,324);ctx.lineTo(418,337);ctx.lineTo(418,372);ctx.lineTo(350,372);ctx.lineTo(350,337);ctx.lineTo(368,324);ctx.closePath();}
   else if(i===2){ctx.ellipse(384,319,40,9,0,0,Math.PI*2);ctx.moveTo(344,319);ctx.lineTo(344,361);ctx.quadraticCurveTo(384,382,424,361);ctx.lineTo(424,319);}
   else if(i===3){ctx.rect(346,317,76,52);ctx.moveTo(359,331);ctx.lineTo(409,331);ctx.moveTo(359,347);ctx.lineTo(401,347);}
   else if(i===5){ctx.rect(354,325,60,46);ctx.moveTo(342,316);ctx.lineTo(426,316);ctx.moveTo(372,307);ctx.lineTo(396,307);}
   else if(i===0){ctx.rect(340,315,88,53);ctx.moveTo(340,315);ctx.lineTo(428,368);ctx.moveTo(384,315);ctx.lineTo(384,340);}
   else{ctx.arc(384,342,29,0,Math.PI*2);ctx.font='bold 45px sans-serif';ctx.fillText('?',384,358);}
   ctx.stroke();ctx.restore();m.texture.needsUpdate=true;});
 }
 function reset(nextRows,objectFactory){items.forEach(e=>release(e.wrapper));items.clear();rows=nextRows;itemSize=Math.min(L.itemSize,1.4/Math.max(1,Math.ceil(rows.length/9))-.02);factory=objectFactory;lastStamp='';update(null);}
 if(truckURL)createGLTFLoader().loadAsync(truckURL).then(gltf=>{
  const model=gltf.scene;if(dead){release(model);return;}
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());model.scale.setScalar(L.truck.w/Math.max(size.x,size.z));
  // Kenney garbage truck: named front wheels are +Z, rear wheels -Z.
  model.rotation.y=-Math.PI/2;bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.set(L.truck.rearX-bounds.max.x,.13-bounds.min.y,L.truck.z-center.z);model.name='recycling-lab-truck';group.add(model);
  const scaled=bounds.getSize(new THREE.Vector3()),rect={x:L.truck.rearX-scaled.x/2,z:L.truck.z,w:scaled.x,d:scaled.z};model.userData.docking={...rect,rearX:L.truck.rearX,gap:L.truck.gap};onTruckCollider?.(worldEquipmentRect(rect,site));
 }).catch(()=>{});
 update(null);
 return {group,reset,update,dispose(){if(dead)return;dead=true;release(group);items.clear();}};
}
