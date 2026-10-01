// Metres in facility-local coordinates. Rendering, routing and City collisions
// share these shapes; yaw follows THREE's Y rotation (local +X turns toward -Z).
export const RECYCLING_LAYOUT = Object.freeze({
  forecourt: {x:0,z:0,w:28,d:18},
  hopper: {x:-5.1,z:-1,w:2.2,d:2.8},
  main: {x:-.8,z:-1,w:8.6,d:2.2},
  scanner: {x:-1,z:-1,w:1.8,d:3.2},
  transfer: {x:3,z:.6,w:1.6,d:3.2},
  distribution: {x:0,z:2.2,w:19.2,d:1.2},
  bins: Array.from({length:7},(_,i)=>({x:-8.4+i*2.8,z:4.2,w:2.4,d:2.5})),
  truck: {x:-9.95,z:-1,w:7,d:3.4,rearX:-6.45,gap:.25},
  sign: {x:2,z:-3.9,w:5.6,d:.3},
  motor: {x:2.7,z:-2.25,w:.8,d:.8},
  binLabel: {width:2.3,height:1.35,y:1.2,offsetZ:1.5,tilt:-.65},
  deck:2.05, queueCapacity:8, itemSize:.56,
});
export function worldEquipmentRect(rect,site){
  const c=Math.cos(site.yaw||0),s=Math.sin(site.yaw||0);
  return {x:site.x+c*rect.x+s*rect.z,z:site.z-s*rect.x+c*rect.z,w:Math.abs(c)*rect.w+Math.abs(s)*rect.d,d:Math.abs(s)*rect.w+Math.abs(c)*rect.d};
}
export function collectionFootprint(bin){
  const label=RECYCLING_LAYOUT.binLabel,minZ=2.25,maxZ=bin.z+label.offsetZ+Math.abs(Math.sin(label.tilt))*label.height/2;
  return {x:bin.x,z:(minZ+maxZ)/2,w:bin.w,d:maxZ-minZ};
}
export function recyclingEquipmentSolids(site){
  const l=RECYCLING_LAYOUT;
  // The truck is registered from actual loaded bounds; a failed load is empty.
  return [l.main,l.hopper,l.scanner,l.transfer,l.distribution,...l.bins.map(collectionFootprint),l.sign,l.motor].map(r=>worldEquipmentRect(r,site));
}
export function queuePosition(slot){return {x:-4.65-(slot%2)*.75,y:RECYCLING_LAYOUT.deck,z:-1.7+Math.floor(slot/2)*.6};}
export function collectedPosition(binIndex,n,layerHeight=.58){const b=RECYCLING_LAYOUT.bins[binIndex];return {x:b.x+(n%3-1)*.65,y:.3+Math.floor(n/9)*layerHeight,z:b.z+(Math.floor(n/3)%3-1)*.65};}
export function recyclingItemPosition(phase,binIndex=6,n=0,layerHeight=.58,landingY=null){
  const l=RECYCLING_LAYOUT,end=collectedPosition(binIndex,n,layerHeight),start=queuePosition(0);
  if(landingY!==null)end.y=landingY;
  if(phase>=30)return end;
  const points=[[0,start],[2,{x:-4,y:l.deck,z:-1.7}],[4,{x:-3.6,y:l.deck,z:-1}],[12,{x:-1,y:l.deck,z:-1}],[17,{x:3,y:l.deck,z:-1}],[20,{x:3,y:l.deck,z:2.2}],[25,{x:l.bins[binIndex].x,y:l.deck,z:2.2}],[28,{x:end.x,y:l.deck,z:3.85}],[30,end]];
  for(let i=1;i<points.length;i++)if(phase<=points[i][0]){const [a,p]=points[i-1],[b,q]=points[i],t=Math.max(0,(phase-a)/(b-a));return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t};}
  return end;
}

export function recyclingViewBounds(){
  const r=[RECYCLING_LAYOUT.truck,RECYCLING_LAYOUT.sign,...RECYCLING_LAYOUT.bins.map(collectionFootprint)];
  return {minX:Math.min(...r.map(b=>b.x-b.w/2))-.15,maxX:Math.max(...r.map(b=>b.x+b.w/2))+.2,minZ:Math.min(...r.map(b=>b.z-b.d/2))-.2,maxZ:Math.max(...r.map(b=>b.z+b.d/2))+.55,maxY:4.2};
}
