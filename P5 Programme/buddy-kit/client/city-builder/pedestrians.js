// Street-life rendering: shared static batches, with a small reusable foreground
// animation pool. All movement/occupancy lives in city-common/neighbourhood.js.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../shared/gltf.js';
import { createNeighbourhood, createStreetLife } from '../city-common/neighbourhood.js';

// Clone only bones/skeleton state; immutable meshes and materials stay shared.
// The vendor bundle does not ship SkeletonUtils, so keep this small operation
// local instead of adding a runtime dependency or cloning full model resources.
function cloneSkeleton(source) {
  const copy=source.clone(true),pairs=new Map();
  const match=(a,b)=>{pairs.set(a,b);a.children.forEach((child,i)=>match(child,b.children[i]));};
  match(source,copy);
  source.traverse(object=>{
    if(!object.isSkinnedMesh)return;
    const mesh=pairs.get(object),skeleton=object.skeleton.clone();
    skeleton.bones=object.skeleton.bones.map(bone=>pairs.get(bone));
    mesh.bind(skeleton,object.bindMatrix);
  });
  return copy;
}
// Asset fronts are not uniform. Keep each correction beside its source so the
// visible face always follows the neighbourhood movement heading. Robot Buddy
// (the green Polygonal Mind model) is authored along -Z; the others are +Z.
const ROBOTS=[
  {url:'../library/characters/polypizza-robot.glb',forwardYaw:0},
  {url:'assets/models/robots/robot-pm.glb',forwardYaw:Math.PI},
  {url:'assets/models/robots/robot-enemy.glb',forwardYaw:0},
  {url:'assets/models/robots/mech-a.glb',forwardYaw:0},
  {url:'assets/models/robots/robot-enemy-large.glb',forwardYaw:0},
  {url:'assets/models/robots/android-bot.glb',forwardYaw:0},
  {url:'assets/models/robots/rolie.glb',forwardYaw:0},
];
const STATIC_PEOPLE=[
  '../library/characters/quaternius-posed-male-standing.glb',
  '../library/characters/quaternius-posed-male-sitting.glb',
  '../library/characters/quaternius-posed-male-waving.glb',
  '../library/characters/quaternius-posed-male-cheering.glb',
  '../library/characters/quaternius-posed-female-standing.glb',
  '../library/characters/quaternius-posed-female-sitting.glb',
  '../library/characters/quaternius-posed-woman-waving.glb',
  '../library/characters/quaternius-posed-female-cheering.glb',
  '../library/characters/quaternius-animchar-chef-male.glb',
  '../library/characters/quaternius-animchar-doctor-male.glb',
  '../library/characters/quaternius-animchar-worker-male.glb',
  '../library/characters/quaternius-animchar-casual-male.glb',
  '../library/characters/quaternius-animchar-casual-female.glb',
];
const ANIMATED_PEOPLE=['assets/models/citizens/casual-male.glb','assets/models/citizens/casual-female.glb'];
const templates=new Map();
function load(url) {
  if(!templates.has(url))templates.set(url,createGLTFLoader().loadAsync(url).catch(e=>{templates.delete(url);console.warn('[street-life] optional model unavailable',url,e);return null;}));
  return templates.get(url);
}
function vectorAttribute(attribute, size) {
  const values=new Float32Array(attribute.count*size);
  for(let i=0;i<attribute.count;i++)for(let k=0;k<size;k++)values[i*size+k]=attribute[['getX','getY','getZ','getW'][k]](i);
  return new THREE.BufferAttribute(values,size);
}
// Bake a world-space idle pose. Keep translations and vertex colours; dropping
// mesh translations used to collapse multi-part robots onto a single origin.
function bakeModel(gltf,height,kind) {
  const root=gltf.scene;const mixer=new THREE.AnimationMixer(root);
  const idle=gltf.animations?.find(a=>a.name==='Idle');if(idle){mixer.clipAction(idle).play();mixer.update(0);}
  root.updateMatrixWorld(true);root.traverse(o=>o.skeleton?.update());
  const pieces=[],materials=new Set();const vertex=new THREE.Vector3();
  root.traverse(o=>{
    if(!o.isMesh)return;
    const geo=o.geometry.clone();
    if(o.isSkinnedMesh){const p=geo.getAttribute('position');for(let i=0;i<p.count;i++){o.getVertexPosition(i,vertex);p.setXYZ(i,vertex.x,vertex.y,vertex.z);}}
    geo.applyMatrix4(o.matrixWorld);
    const g=geo.index?geo.toNonIndexed():geo;
    if(g!==geo)geo.dispose();
    if(!g.getAttribute('normal'))g.computeVertexNormals();
    const p=g.getAttribute('position'),uv=g.getAttribute('uv'),existing=g.getAttribute('color');
    const colors=new Float32Array(p.count*3),mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>materials.add(m));
    const groups=g.groups.length?g.groups:[{start:0,count:p.count,materialIndex:0}];
    for(const group of groups){const m=mats[group.materialIndex]||mats[0],c=m?.color||new THREE.Color(1,1,1);for(let i=group.start;i<group.start+group.count;i++){colors[i*3]=c.r*(existing?existing.getX(i):1);colors[i*3+1]=c.g*(existing?existing.getY(i):1);colors[i*3+2]=c.b*(existing?existing.getZ(i):1);}}
    const out=new THREE.BufferGeometry();out.setAttribute('position',vectorAttribute(p,3));out.setAttribute('normal',vectorAttribute(g.getAttribute('normal'),3));
    out.setAttribute('uv',uv?vectorAttribute(uv,2):new THREE.BufferAttribute(new Float32Array(p.count*2),2));out.setAttribute('color',new THREE.BufferAttribute(colors,3));g.dispose();pieces.push(out);
  });
  mixer.stopAllAction();mixer.uncacheRoot(root);
  const geometry=BufferGeometryUtils.mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());
  if(!geometry)return null;
  geometry.computeBoundingBox();const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=height/Math.max(.01,size.y),minY=box.min.y;
  geometry.translate(-center.x,-minY,-center.z);geometry.scale(scale,scale,scale);geometry.computeBoundingSphere();
  const single=materials.size===1?[...materials][0]:null;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.9,metalness:0,map:single?.map||null});
  if(kind==='robot'){material.emissive.setHex(0x30494e);material.emissiveIntensity=.08;}
  return {geometry,material,scale,center,minY};
}
function animatedFit(gltf,height) {
  const root=gltf.scene;root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=height/Math.max(.01,size.y);
  return {scale,offset:new THREE.Vector3(-center.x*scale,-box.min.y*scale,-center.z*scale)};
}
export async function createPedestrians(scene,layout,opts={}) {
  const human=opts.kind==='human',kind=human?'human':'robot';
  const ownLife=opts.getLife?null:createStreetLife(createNeighbourhood(layout),{mobile:!!opts.mobile});
  const getLife=opts.getLife||(()=>ownLife),camera=opts.camera;
  const maxCount=opts.count ?? (opts.mobile?24:48),height=human?2.1:2.5;
  let alive=true,batches=[],models=[],animationTemplates=[],animationFits=[],loadTimer=null;
  let budget=human?(opts.lowEnd?3:opts.mobile?6:12):0,initialBudget=budget;
  const slots=[];
  function releaseBatches(){for(const b of batches){b.removeFromParent();b.dispose();b.geometry.dispose();b.material.dispose();}batches=[];}
  function replaceModels(gltfs) {
    releaseBatches();models=[];
    gltfs.forEach(gltf=>{if(!gltf)return;const model=bakeModel(gltf,height,kind);if(!model)return;models.push(model);const inst=new THREE.InstancedMesh(model.geometry,model.material,maxCount);inst.count=0;inst.castShadow=false;inst.receiveShadow=false;inst.frustumCulled=false;inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);inst.userData.streetLife=kind;scene.add(inst);batches.push(inst);});
  }
  const sourceList=human?STATIC_PEOPLE:ROBOTS.map(item=>item.url);
  const loaded=await Promise.all(sourceList.map(load));
  if(!alive)return null;
  replaceModels(loaded);
  if(!human) models.forEach((model,index)=>{model.forwardYaw=ROBOTS[index]?.forwardYaw||0;});
  function makeSlot(type) {
    const source=animationTemplates[type];if(!source)return null;
    const fit=animationFits[type];if(!fit)return null;
    const root=cloneSkeleton(source.scene),wrapper=new THREE.Group();
    wrapper.add(root);root.scale.setScalar(fit.scale);root.position.copy(fit.offset);
    root.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
    const idleClip=source.animations.find(c=>c.name==='Idle'),walkClip=source.animations.find(c=>c.name==='Walk');
    if(!idleClip||!walkClip){root.traverse(o=>o.skeleton?.dispose());return null;}
    const mixer=new THREE.AnimationMixer(root),idle=mixer.clipAction(idleClip),walk=mixer.clipAction(walkClip);
    idle.play();scene.add(wrapper);wrapper.visible=false;
    return {type,wrapper,root,mixer,idle,walk,actor:null,state:'idle'};
  }
  // Compact CC0 derivatives contain genuine Idle + Walk clips. Only nearby
  // humans receive skeleton instances; the distant city remains instanced.
  if(human&&!opts.reducedMotion?.()) {
    const animated=await Promise.all(ANIMATED_PEOPLE.map(load));
    if(!alive)return null;
    animationTemplates=animated;animationFits=animated.map(gltf=>gltf?animatedFit(gltf,height):null);
    for(let i=0;i<budget;i++){const slot=makeSlot(i%animationTemplates.length);if(slot)slots.push(slot);}
  }
  const M=new THREE.Matrix4(),P=new THREE.Vector3(),Q=new THREE.Quaternion(),S=new THREE.Vector3(1,1,1),UP=new THREE.Vector3(0,1,0);
  function update(dt) {
    if(!alive || document.hidden)return;
    if(ownLife)ownLife.update(dt);
    const life=getLife();if(!life)return;
    const actors=life.actors.filter(a=>a.kind===kind),distance=a=>camera?Math.hypot(a.x-camera.position.x,a.z-camera.position.z,camera.position.y):Infinity;
    const motion=!(opts.stationary||opts.reducedMotion?.());
    const assigned=new Set();
    for(let i=0;i<slots.length;i++) {
      const slot=slots[i];
      if(slot.actor && (!actors.includes(slot.actor)||distance(slot.actor)>115||!motion||i>=budget)){slot.actor.visualActive=false;slot.actor=null;slot.wrapper.visible=false;}
      if(slot.actor)assigned.add(slot.actor);
    }
    // Keep a couple of moving people promoted even from the overview. It
    // avoids a silent-looking fresh city while preserving the tablet budget.
    const nearby=motion?actors.filter(a=>distance(a)<95 && !assigned.has(a)).sort((a,b)=>distance(a)-distance(b)):[];
    const reserved=motion?actors.filter(a=>a.state==='walk' && !assigned.has(a) && !nearby.includes(a)).sort((a,b)=>distance(a)-distance(b)):[];
    for(let i=0;i<Math.min(budget,slots.length);i++) {
      const slot=slots[i];if(!slot.actor){let index=nearby.findIndex(a=>a.type%models.length===slot.type);let source=nearby;if(index<0 && i<Math.min(2,budget)){index=reserved.findIndex(a=>a.type%models.length===slot.type);source=reserved;}if(index>=0){slot.actor=source.splice(index,1)[0];assigned.add(slot.actor);}}
    }
    const written=models.map(()=>0),alpha=life.alpha;
    for(const actor of actors) {
      actor.visualActive=assigned.has(actor);
      const x=actor.px+(actor.x-actor.px)*alpha,z=actor.pz+(actor.z-actor.pz)*alpha;
      const y=opts.groundHeightAt?.(x,z)??0;
      const slot=actor.visualActive?slots.find(s=>s.actor===actor):null;
      if(slot){slot.wrapper.visible=true;slot.wrapper.position.set(x,y,z);slot.wrapper.rotation.y=actor.heading;
        const state=actor.state==='walk'?'walk':'idle';
        if(slot.state!==state){slot[slot.state].fadeOut(.2);slot[state].reset().fadeIn(.2).play();slot.state=state;}
        slot.walk.timeScale=actor.speed/1.2;slot.mixer.update(Math.min(dt,.05));
      } else if(models.length) {
        const type=actor.type%models.length;Q.setFromAxisAngle(UP,actor.heading+(models[type].forwardYaw||0));P.set(x,y,z);M.compose(P,Q,S);batches[type].setMatrixAt(written[type]++,M);
      }
    }
    batches.forEach((b,i)=>{b.count=written[i];b.instanceMatrix.needsUpdate=true;});
  }
  return {update,getCount:()=>getLife()?.actors.filter(a=>a.kind===kind).length||0,
    getStats:()=>({kind,budget,animated:slots.filter(s=>s.wrapper.visible).length,walkers:slots.filter(s=>s.wrapper.visible && s.state==='walk').length,instances:batches.reduce((n,b)=>n+b.count,0),models:models.length}),
    reduceAnimationBudget(){if(budget>Math.ceil(initialBudget/2)){budget=Math.ceil(initialBudget/2);return true;}return false;},
    destroy(){alive=false;clearTimeout(loadTimer);releaseBatches();for(const slot of slots){slot.mixer.stopAllAction();slot.mixer.uncacheRoot(slot.root);slot.wrapper.removeFromParent();slot.root.traverse(o=>o.skeleton?.dispose());}slots.length=0;ownLife?.destroy();}
  };
}
