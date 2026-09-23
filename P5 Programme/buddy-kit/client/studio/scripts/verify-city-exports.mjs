import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildCityChampion, buildCityPlacement, faceCityFront } from '../src/io/city-champion.js';
import { championMetadataFromGLTF, collectRigInfo, validateStudioChampion } from '../../city-common/champion-contract.js';
globalThis.FileReader ||= class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(b => { this.result=b; this.onloadend?.(); }); } };
const folder=fileURLToPath(new URL('../../../../docs/workshop-studio-demo/city-export-fixtures/',import.meta.url));
await mkdir(folder,{recursive:true});
const parse=data=>new GLTFLoader().parseAsync(data,'');
const verify=(test,message)=>{if(!test)throw Error(message)};
const direction = new T.Group();
faceCityFront(direction, '+x');
verify(new T.Vector3(1, 0, 0).applyQuaternion(direction.quaternion).distanceTo(new T.Vector3(0, 0, 1)) < 1e-6, 'front +X must face City +Z');
function make(count){
  const group=new T.Group();group.name=`Creature${count}`;
  if(count===null){const m=new T.Mesh(new T.SphereGeometry(.5,12,8),new T.MeshStandardMaterial({color:0xf28e42}));m.position.y=.5;group.add(m);const helper=new T.Object3D();helper.name='__outline';helper.userData.circular=helper.userData;group.add(helper);return {group,rig:null};}
  const geo=new T.BoxGeometry(1,.8,1);geo.translate(0,1.2,0);
  const n=geo.attributes.position.count, weights=new Float32Array(n*4);
  for(let i=0;i<n;i++)weights[i*4]=1;
  geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(n*4),4));
  geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  geo.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(n*3).fill(.6),3));
  const mesh=new T.SkinnedMesh(geo,new T.MeshStandardMaterial({vertexColors:true}));mesh.name='Painted body';group.add(mesh);
  const joints=[],bones=new Map(),points=new Map();
  function add(id,p,parent=null){const b=new T.Bone();b.name=id;b.position.fromArray(p);if(parent)b.position.sub(new T.Vector3(...points.get(parent)));(parent?bones.get(parent):group).add(b);joints.push({id,parent});bones.set(id,b);points.set(id,p);return id;}
  add('root',[0,1.05,0]);add('head',[0,1.75,.2],'root');
  const legs=[],knees={};
  for(let i=0;i<count;i++){
    const theta=2*Math.PI*i/count,x=.42*Math.cos(theta),z=.42*Math.sin(theta);
    const k=add(`k${i}`,[x,.65,z],'root'),f=add(`f${i}`,[x,.18,z+.07],k);add(`t${i}`,[x,.07,z+.16],f);
    legs.push(k);knees[k]={foot:f,bend:1,minFlex:8,maxFlex:120};
    const limb=new T.Mesh(new T.CylinderGeometry(.07,.1,.55,8),new T.MeshStandardMaterial({color:0x35877f}));limb.position.set(x,.35,z);group.add(limb);
  }
  const gear=new T.Mesh(new T.ConeGeometry(.2,.3,8),new T.MeshStandardMaterial({color:0xffb83f}));gear.name='Fitted gear';gear.position.y=.35;bones.get('head').add(gear);
  group.updateMatrixWorld(true);mesh.bind(new T.Skeleton([...bones.values()]));
  const children=id=>joints.filter(j=>j.parent===id).map(j=>j.id),subtree=id=>[id,...children(id).flatMap(subtree)];
  const settings={legs,knees,roles:{head:'head'},gait:count?'step':'waddle',softness:.55,stride:20,duration:1.2,forward:'+x'};
  const graph={joints,motion:{key:'fixture',settings},structureKey:()=> 'fixture',roots:()=>['root'],get:id=>joints.find(j=>j.id===id),has:id=>bones.has(id),children,subtree,toJSON:()=>({joints,motion:{key:'fixture',settings}})};
  return {group,rig:{graph,bones,skinBones:[...bones.values()],worldOf:id=>points.get(id),studio:{group}}};
}
const results=[];
for(const [name,count] of [['four-legged',4],['six-legged',6],['legless-rig',0],['unrigged',null]]){
  const {group,rig}=make(count);
  if(rig)rig.bones.get('head').rotation.z=.18;
  const pose=rig?.bones.get('head').quaternion.clone();
  const placement=await buildCityPlacement(group,{forward:'+x'}), placed=await parse(placement);
  verify(!placed.animations.length && !championMetadataFromGLTF(placed),`${name}: placement metadata or clips`);
  let meshes=0,skins=0,colours=0,gear=0;
  placed.scene.traverse(o=>{if(o.isMesh){meshes++;skins+=!!o.isSkinnedMesh;colours+=!!o.geometry.attributes.color;gear+=o.name==='Fitted_gear' || o.name==='Fitted gear';}});
  verify(meshes>0 && !skins && (count===null || (colours && gear)),`${name}: placement appearance`);
  const {data}=await buildCityChampion(group,rig,{championId:name,animationMode:rig?'studio':'static',forward:'+x'});
  const champion=await parse(data),meta=championMetadataFromGLTF(champion),info=collectRigInfo(champion.scene);
  const check=validateStudioChampion({metadata:meta,animations:champion.animations,boneNames:info.boneNames,nodeNames:info.nodeNames,rootName:champion.scene.name});
  verify(check.ok,`${name}: ${check.error}`);
  verify(champion.animations.length===(rig?4:0) && meta.groundContacts.length===(count||0),`${name}: clips or contacts`);
  if(rig)verify(rig.bones.get('head').quaternion.equals(pose),`${name}: source pose changed`);
  if(count===null)verify(group.getObjectByName('__outline')===group.children[1],`${name}: editor helper moved or removed`);
  if(name==='four-legged'){
    const old={...meta,formatVersion:1,footBones:meta.groundContacts.map(contact=>contact.node)};
    delete old.animationMode;delete old.groundContacts;
    champion.scene.userData.passionaChampion=old;
    const legacy=await new GLTFExporter().parseAsync(champion.scene,{binary:true,animations:champion.animations});
    const legacyReload=await parse(legacy), legacyRig=collectRigInfo(legacyReload.scene);
    const legacyCheck=validateStudioChampion({metadata:championMetadataFromGLTF(legacyReload),animations:legacyReload.animations,boneNames:legacyRig.boneNames,nodeNames:legacyRig.nodeNames,rootName:legacyReload.scene.name});
    verify(legacyCheck.ok,`legacy v1: ${legacyCheck.error}`);
    await writeFile(`${folder}/legacy-v1-champion.glb`,Buffer.from(legacy));
  }
  await writeFile(`${folder}/${name}-placement.glb`,Buffer.from(placement));
  await writeFile(`${folder}/${name}-champion.glb`,Buffer.from(data));
  results.push({name,animationMode:meta.animationMode,contacts:meta.groundContacts.length,placementBytes:placement.byteLength,championBytes:data.byteLength});
}
await writeFile(`${folder}/verification.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
