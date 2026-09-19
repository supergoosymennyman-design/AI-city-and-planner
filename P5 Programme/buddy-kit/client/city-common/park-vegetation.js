// Deterministic, presentation-only park ground cover. Keeping this pure makes
// placement reproducible and lets tests enforce the same safety/budget rules as
// the renderer without loading three.js or any GLBs.
import { buildTrafficNetwork, isRoadsideSceneryClear } from './traffic-network.js';
export const PARK_VEGETATION_ASSETS = Object.freeze([
  {kind:'grass',file:'../library/nature/kenney-grass.glb',weight:46},
  {kind:'tall-grass',file:'../library/nature/kenney-grass_large.glb',weight:28},
  {kind:'bush',file:'../library/nature/kenney-plant_bushSmall.glb',weight:10},
  {kind:'flower-red',file:'../library/nature/kenney-flower_redA.glb',weight:6},
  {kind:'flower-yellow',file:'../library/nature/kenney-flower_yellowA.glb',weight:6},
  {kind:'rock',file:'../library/nature/kenney-rock_smallA.glb',weight:4},
]);

function hash(value) {
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function unit(seed){return hash(seed)/4294967296;}
function distanceToSegment(p,a,b){
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
export function parkVegetationAsset(seed,assets=PARK_VEGETATION_ASSETS){
  const total=assets.reduce((n,a)=>n+a.weight,0);let pick=unit(`${seed}|kind`)*total;
  for(const asset of assets){pick-=asset.weight;if(pick<0)return asset;}
  return assets[assets.length-1];
}

export function createParkVegetation(layout,{mobile=false}={}){
  if(layout.autoScenery===false)return [];
  const roadNetwork=buildTrafficNetwork(layout.roads||[]);
  const result=[];
  for(const [pi,park] of (layout.parks||[]).slice(0,mobile?6:12).entries()){
    const radius=Number(park.radius)||0;if(radius<12)continue;
    // Central furniture, the .55r loop path, a generous outer/entrance band,
    // roads, and four radial access corridors remain free for children to use.
    const centreClear=Math.min(14,Math.max(7,radius*.19));
    const desired=Math.min(mobile?34:52,Math.max(10,Math.round(radius*(mobile?.42:.58))));
    const attempts=desired*9;
    for(let i=0;i<attempts && result.filter(p=>p.park===pi).length<desired;i++){
      const seed=`${Math.round(park.cx*10)}|${Math.round(park.cz*10)}|${Math.round(radius*10)}|${i}`;
      const angle=unit(`${seed}|a`)*Math.PI*2;
      const r=Math.sqrt(unit(`${seed}|r`))*(radius-3);
      if(r<centreClear || Math.abs(r-radius*.55)<3.2)continue;
      // These narrow axes line up with the common park entry directions. The
      // loop still leaves broad planted quadrants even when entrances vary.
      const axis=Math.min(Math.abs(Math.sin(angle)),Math.abs(Math.cos(angle)));
      if(axis*r<1.8)continue;
      const asset=parkVegetationAsset(seed);
      const x=park.cx+Math.cos(angle)*r,z=park.cz+Math.sin(angle)*r;
      const footprint={grass:.45,'tall-grass':.7,bush:1.35,'flower-red':.45,'flower-yellow':.45,rock:.55}[asset.kind]||.7;
      if(!isRoadsideSceneryClear(roadNetwork,x,z,footprint,5))continue;
      result.push({park:pi,x,z,kind:asset.kind,file:asset.file,
        rotation:unit(`${seed}|rotation`)*Math.PI*2,
        scale:.82+unit(`${seed}|scale`)*.34});
    }
  }
  return result;
}
