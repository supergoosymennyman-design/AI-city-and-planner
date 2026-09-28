import { buildTrafficNetwork, pointInRoadCarriageway } from './traffic-network.js';
import { buildTrack } from './driving.js';
import { AUDI, footprint, pointAt } from './driving-simulation.js';

// Tile the whole rectangle with covering discs. Each disc must fit within a
// road ribbon, so corners on separate ribbons cannot hide a gap under the car.
let footprintCells;
function roadFootprintCells() {
  if(footprintCells)return footprintCells;
  const rows=Math.ceil(AUDI.length/.5),cols=Math.ceil(AUDI.width/.5);
  const length=AUDI.length/rows,width=AUDI.width/cols,radius=Math.hypot(length,width)/2;
  return footprintCells=Array.from({length:rows*cols},(_,i)=>({forward:-AUDI.length/2+(Math.floor(i/cols)+.5)*length,side:-AUDI.width/2+(i%cols+.5)*width,radius}));
}
export function footprintFitsRoad(car, network, margin=0) {
  const sin=Math.sin(car.heading),cos=Math.cos(car.heading);
  return roadFootprintCells().every(p=>pointInRoadCarriageway(network,car.x+sin*p.forward+cos*p.side,car.z+cos*p.forward-sin*p.side,-p.radius-margin));
}

export function intersectsSolid(car, solid) {
  const points = footprint(car);
  const corners = [{ x: solid.minX, z: solid.minZ }, { x: solid.minX, z: solid.maxZ }, { x: solid.maxX, z: solid.minZ }, { x: solid.maxX, z: solid.maxZ }];
  for (const axis of [[1,0],[0,1],[Math.cos(car.heading),-Math.sin(car.heading)],[Math.sin(car.heading),Math.cos(car.heading)]]) {
    const a = points.map(p => p.x*axis[0]+p.z*axis[1]), b = corners.map(p => p.x*axis[0]+p.z*axis[1]);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}

function leftPoint(link, t) {
  const offset = link.width / 4;
  return [link.from.x + link.dx*link.length*t - link.dz*offset, link.from.z + link.dz*link.length*t + link.dx*offset];
}
function smooth(points) {
  const out = [points[0]];
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1], b=points[i], c=points[i+1], before=Math.hypot(b[0]-a[0],b[1]-a[1]), after=Math.hypot(c[0]-b[0],c[1]-b[1]);
    if (before < .01 || after < .01) continue;
    const trim=Math.min(20,before*.45,after*.45);
    const p=[b[0]+(a[0]-b[0])*trim/before,b[1]+(a[1]-b[1])*trim/before], q=[b[0]+(c[0]-b[0])*trim/after,b[1]+(c[1]-b[1])*trim/after];
    out.push(p);
    for(let n=1;n<=40;n++){const t=n/40,u=1-t;out.push([u*u*p[0]+2*u*t*b[0]+t*t*q[0],u*u*p[1]+2*u*t*b[1]+t*t*q[1]]);}
  }
  out.push(points.at(-1));
  return out.filter((p,i)=>!i||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>.001);
}

export function validateDrivingRoute(track, network, solids = []) {
  for(let s=3;s<track.length-3;s+=.5){
    const pose=pointAt(track,s), next=pointAt(track,s+.5);
    const turn=Math.abs(Math.atan2(Math.sin(next.heading-pose.heading),Math.cos(next.heading-pose.heading)))/.5;
    if(turn > Math.tan(.25)/AUDI.wheelbase + .005) return 'unsupported-turn';
    if(!footprintFitsRoad(pose,network,.2)) return 'narrow-clearance';
    if(solids.some(solid=>intersectsSolid(pose,solid))) return 'obstructed';
  }
  return null;
}

export function findDrivingRoutes(roads, { solids = [], minLength = 40, maxLength = 200 } = {}) {
  const reasons = new Set(), routes = [];
  if(!Array.isArray(roads)||roads.some(r=>!Array.isArray(r?.points)||r.points.length<2||!Number.isFinite(r.width)||r.width<=0||r.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))return { routes, reasons:['malformed-roads'] };
  const network=buildTrafficNetwork(roads);
  let budget=5000;
  const visit=(path, seen, length)=>{
    if(--budget<0||routes.length>=3||path.length>60)return;
    const last=path.at(-1);
    if(length>=minLength){
      // Offset each directed link into its Hong Kong left lane, then smooth
      // the joins and validate the full Audi, not just connected centre points.
      const points=[leftPoint(path[0],0)];
      for(let i=0;i<path.length;i++) {
        if(i){const a=leftPoint(path[i-1],1),b=leftPoint(path[i],0);points.push([(a[0]+b[0])/2,(a[1]+b[1])/2]);}
      }
      points.push(leftPoint(last,Math.min(1,(maxLength-(length-last.length))/last.length)));
      const track=buildTrack({id:'city-'+routes.length,points:smooth(points),width:Math.min(...path.map(l=>l.width))/2});
      const reason=track.length<minLength?'insufficient-length':validateDrivingRoute(track,network,solids);
      if(reason)reasons.add(reason);
      else if(track.length<=maxLength+.1){routes.push({track,roads:JSON.parse(JSON.stringify(roads)),solids:JSON.parse(JSON.stringify(solids)),linkIds:path.map(l=>l.id),encounters:['lane','finish'],seed:1});return;}
    }
    if(length>=maxLength)return;
    for(const next of last.to.links){
      if(seen.has(next.to.id))continue;
      if(network.junctionByNode.get(next.from.id)?.roundabout||network.closedRoadIds.has(next.roadId)){reasons.add('unsupported-turn');continue;}
      if(last.dx*next.dx+last.dz*next.dz < -.1){reasons.add('unsupported-turn');continue;}
      visit([...path,next],new Set([...seen,next.to.id]),length+next.length);
    }
  };
  for(const link of network.links){
    if(link.width<AUDI.width*2+.8){reasons.add('narrow-clearance');continue;}
    if(network.closedRoadIds.has(link.roadId)){reasons.add('unsupported-turn');continue;}
    visit([link],new Set([link.from.id,link.to.id]),link.length);
    if(routes.length===3||budget<0)break;
  }
  if(!routes.length&&!reasons.size)reasons.add('insufficient-length');
  return {routes,reasons:[...reasons],fingerprint:JSON.stringify([roads,solids])};
}

export function cityDrivingScenario(route, seed = 1) {
  const scenario = JSON.parse(JSON.stringify({ ...route, kind: 'city', seed, actors: [] }));
  // Admit encounters only on long, straight stretches with braking room on
  // both sides. The preview lists exactly the encounters the session runs.
  const sites=[];
  for(let s=30;s<scenario.track.length-25;s+=25){
    const a=pointAt(scenario.track,s-12),b=pointAt(scenario.track,s+12);
    if(Math.abs(Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)))<.06)sites.push(s);
  }
  if(sites.length){
    const s=sites[0];scenario.track.light={s,cycle:218+seed%4,phases:[{state:'red',seconds:18+seed%4},{state:'green',seconds:200}]};scenario.encounters.push('signal');
  }
  if(sites.length>1){scenario.actors.push({s:sites.at(-1),kind:'pedestrian',r:.6,from:0,until:58+seed%5});scenario.encounters.push('crossing');}
  return scenario;
}
