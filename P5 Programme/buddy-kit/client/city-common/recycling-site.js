import { RECYCLING_LAYOUT, recyclingEquipmentSolids } from './recycling-layout.js';
// The mission Lab is rendered without yaw. Its double doors and awning face -Z.
// Reservation bounds include a walking strip; collision bounds never do.
export const LAB_FOOTPRINT = [24, 20];
export function overlaps(a,b,pad=0) { return Math.abs(a.x-b.x)<(a.w+b.w)/2+pad && Math.abs(a.z-b.z)<(a.d+b.d)/2+pad; }
export function footprintRect(b) {
  const fp=b.footprint||[24,24], yaw=b.rotation||b.yaw||0,c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw));
  return {x:b.pos?.[0]??b.x,z:b.pos?.[1]??b.z,w:c*fp[0]+s*fp[1],d:s*fp[0]+c*fp[1]};
}
function segmentHitsRect(a,b,rect,pad){
  let lo=0,hi=1;
  for(const [start,delta,min,max] of [[a[0],b[0]-a[0],rect.x-rect.w/2-pad,rect.x+rect.w/2+pad],
    [a[1],b[1]-a[1],rect.z-rect.d/2-pad,rect.z+rect.d/2+pad]]){
    if(!delta){if(start<min||start>max)return false;continue;}
    const first=(min-start)/delta,last=(max-start)/delta;
    lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
    if(lo>hi)return false;
  }
  return true;
}
export function clearSite(rect,{scale=2000,buildings=[],props=[],roads=[]},ignore=null) {
  if(rect.x-rect.w/2<3||rect.z-rect.d/2<3||rect.x+rect.w/2>scale-3||rect.z+rect.d/2>scale-3)return false;
  if([...buildings,...props].some(b=>b!==ignore&&overlaps(rect,footprintRect(b),2)))return false;
  for(const road of roads)for(let i=1;i<(road.points?.length||0);i++)
    if(segmentHitsRect(road.points[i-1],road.points[i],rect,(road.width||10)/2+2))return false;
  return true;
}
function compose(lab,offset=0,generated=false){
  const fp=lab.footprint||LAB_FOOTPRINT,x=lab.pos[0]+offset,z=lab.pos[1]-fp[1]/2-9;
  const {w,d}=RECYCLING_LAYOUT.forecourt;
  const forecourt={x,z,w,d};
  const reservations=[forecourt,...(generated?[footprintRect(lab)]:[])];
  return {kind:'recycling',id:'city-recycling-school-v1',x,z,w,d,pos:[x,z],footprint:[w,d],lab,generated,reservations,
    yaw:Math.PI,arrival:{x:lab.pos[0],z:lab.pos[1]-fp[1]/2-3},entrance:{x:lab.pos[0],z:lab.pos[1]-fp[1]/2},
    solids:[...recyclingEquipmentSolids({x,z,yaw:Math.PI}),...(generated?[footprintRect(lab)]:[])]};
}
export function resolveRecyclingSite(options={}){
  const {focus=[1000,1000],buildings=[],scale=2000}=options;
  const labs=buildings.filter(b=>b.type==='recycling').slice().sort((a,b)=>Math.hypot(a.pos[0]-focus[0],a.pos[1]-focus[1])-Math.hypot(b.pos[0]-focus[0],b.pos[1]-focus[1])||a.pos[0]-b.pos[0]||a.pos[1]-b.pos[1]);
  for(const lab of labs)for(const offset of [0,-6,6,-12,12]){const site=compose(lab,offset);if(clearSite(site,options,lab))return site;}
  // Existing blocked Labs must not cause a second permanent Lab to appear.
  if(labs.length)return null;
  for(let ring=0;ring<=Math.ceil(scale/8);ring++)for(let i=0;i<Math.max(1,ring*8);i++){
    const angle=i/Math.max(1,ring*8)*Math.PI*2;
    const lab={type:'recycling',pos:[focus[0]+Math.cos(angle)*ring*8,focus[1]+Math.sin(angle)*ring*8],footprint:[...LAB_FOOTPRINT],height:36};
    const site=compose(lab,0,true);
    // Runtime scenery must not materialise over the Champion's starting spot.
    if(site.solids.some(r=>overlaps(r,{x:focus[0],z:focus[1],w:2,d:2},1)))continue;
    if(site.reservations.every(r=>clearSite(r,options)))return site;
  }
  return null;
}
export function practiceRecyclingSite(scale){return compose({type:'recycling',pos:[scale+120,scale+120],footprint:[...LAB_FOOTPRINT],height:36},0,true);}
export function findSafeArrival(point,isSafe){
  if(isSafe(point))return {...point};
  for(let r=1;r<=8;r++)for(let i=0;i<16;i++){const p={x:point.x+Math.cos(i*Math.PI/8)*r,z:point.z+Math.sin(i*Math.PI/8)*r};if(isSafe(p))return p;}
  return null;
}
