// Original procedural material fragments, dedicated to CC0. No packaging cues.
// Identity, never classifier output, determines an object's appearance.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export const WASTE = Object.freeze(['metal','plastic','cardboard','glass'].flatMap(label=>
 Array.from({length:8},(_,variant)=>Object.freeze({id:`city-v2-${label}-${variant}`,objectId:`city-v2-${label}-${variant}`,label,variant,split:variant<5?'train':'test'}))));
function seedOf(id){let n=2166136261;for(const ch of id)n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;}
export function createWaste(row){
 const group=new THREE.Group();group.name=row.id;let seed=seedOf(row.id);
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const label=row.label,variant=row.variant||0;
 const material=new THREE.MeshPhysicalMaterial({color:label==='plastic'?new THREE.Color().setHSL(.54,.3,.55+rand()*.12):label==='glass'?0xe4f0e9:label==='metal'?0xa5b2ba:label==='cardboard'?new THREE.Color().setHSL(.09,.38,.25+rand()*.08):0x96958d,
  roughness:label==='glass'?.08:label==='plastic'?.25:label==='metal'?.2+rand()*.15:.95,
  metalness:label==='metal'?.7:0,transmission:label==='glass'?.9:label==='plastic'?.28:0,thickness:.5,ior:1.48,clearcoat:label==='glass'||label==='plastic'?1:0,transparent:label==='glass',opacity:label==='glass'?.72:1,side:THREE.DoubleSide});
 if(label==='cardboard'){
  const pixels=new Uint8Array(64*64*4);for(let i=0;i<pixels.length;i+=4){const value=130+Math.floor(rand()*100);pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}const grain=new THREE.DataTexture(pixels,64,64);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(3,3);grain.needsUpdate=true;material.map=grain;material.bumpMap=grain;material.bumpScale=.025;
  const outline=[];for(let i=0;i<15;i++){const a=i/15*Math.PI*2,r=.46+rand()*.2;outline.push(new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r*.68));}
  const shape=new THREE.Shape(outline);
  for(let layer=0;layer<5;layer++){
   const geo=new THREE.ExtrudeGeometry(shape,{depth:.025,bevelEnabled:false});geo.rotateX(-Math.PI/2);
   const pos=geo.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,pos.getY(i)+.06*Math.sin(x*5+variant)+.035*Math.cos(z*7));}geo.computeVertexNormals();
   const m=material.clone();m.color.multiplyScalar(layer%2?.76:1);const mesh=new THREE.Mesh(geo,m);mesh.position.y=.15+layer*.035;mesh.rotation.y=variant*.29;group.add(mesh);
  }material.dispose();
 }else{
  const smooth=label==='plastic';let geo=new THREE.IcosahedronGeometry(.58,smooth?4:label==='metal'?2:0);const pos=geo.attributes.position;
  const phase=rand()*6.28,sx=.8+rand()*.4,sy=.65+rand()*.6,sz=.7+rand()*.4;
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
   const wave=1+.18*Math.sin(x*7+phase)*Math.cos(z*6-phase)+.13*Math.sin(y*8+phase);
   const fold=label==='metal'?1+.19*Math.sin(x*24+y*17+z*13+phase):1;
   pos.setXYZ(i,x*wave*fold*sx,y*wave*fold*sy,z*wave*fold*sz);
  }if(smooth){geo.deleteAttribute('normal');geo.deleteAttribute('uv');const merged=mergeVertices(geo);geo.dispose();geo=merged;}geo.computeVertexNormals();
  if(!smooth)material.flatShading=true;
  const mesh=new THREE.Mesh(geo,material);mesh.rotation.set(.17*variant,.47*variant,.1);group.add(mesh);
  if(label==='glass'){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0xf3fff5,transparent:true,opacity:.65}));edges.rotation.copy(mesh.rotation);group.add(edges);}
  const bounds=new THREE.Box3().setFromObject(group);for(const child of group.children)child.position.y-=bounds.min.y;
 }
 return group;
}
export function neutralWaste(id){return createWaste({id,label:'unknown',variant:seedOf(id)%8});}
export function scannerScene(row){
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xe7e7df);
 scene.add(new THREE.HemisphereLight(0xffffff,0x808080,2.4));
 const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);
 const rim=new THREE.DirectionalLight(0xe6f5ff,2);rim.position.set(-3,2,-2);scene.add(rim);
 const object=createWaste(row);scene.add(object);
 const camera=new THREE.PerspectiveCamera(38,1,.1,20);camera.position.set(2.4,2.1,3.4);camera.lookAt(0,.55,0);
 return {scene,camera,object};
}
