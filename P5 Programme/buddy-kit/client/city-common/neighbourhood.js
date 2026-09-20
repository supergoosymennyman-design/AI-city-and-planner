// Derived, deterministic visual environment. Never mutates or serializes layout.
export function seededRandom(seed = 731) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function distanceToSegment(p, a, b) {
  const dx = b.x-a.x, dz = b.z-a.z;
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
  return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
function intersectsBox(a,b,r,pad=0) {
  let lo=0,hi=1;
  for (const [v,d,min,max] of [[a.x,b.x-a.x,r.x0-pad,r.x1+pad],[a.z,b.z-a.z,r.z0-pad,r.z1+pad]]) {
    if (Math.abs(d)<1e-8) { if (v<min || v>max) return false; }
    else { const t1=(min-v)/d,t2=(max-v)/d; lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2)); if(lo>hi)return false; }
  }
  return true;
}
function segmentsTouch(a,b,c,d) {
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<=0 && cross(c,d,a)*cross(c,d,b)<=0 && Math.max(a.x,b.x)>=Math.min(c.x,d.x) && Math.max(c.x,d.x)>=Math.min(a.x,b.x) && Math.max(a.z,b.z)>=Math.min(c.z,d.z) && Math.max(c.z,d.z)>=Math.min(a.z,b.z);
}
function segmentDistance(a,b,c,d) {
  if(segmentsTouch(a,b,c,d))return 0;
  return Math.min(distanceToSegment(a,c,d),distanceToSegment(b,c,d),distanceToSegment(c,a,b),distanceToSegment(d,a,b));
}
export class SpatialIndex {
  constructor(size=24) { this.size=size; this.cells=new Map(); this.all=new Set(); this.overflow=new Set(); }
  insert(item, x0, z0, x1=x0, z1=z0) {
    this.all.add(item);
    if(![x0,z0,x1,z1].every(Number.isFinite) || Math.max(Math.abs(x0),Math.abs(x1),Math.abs(z0),Math.abs(z1))>1e6 || (Math.abs(x1-x0)/this.size+2)*(Math.abs(z1-z0)/this.size+2)>4096) { this.overflow.add(item); return; }
    for(let x=Math.floor(x0/this.size);x<=Math.floor(x1/this.size);x++)for(let z=Math.floor(z0/this.size);z<=Math.floor(z1/this.size);z++) {
      const key=x+','+z; if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);
    }
  }
  query(x0,z0,x1=x0,z1=z0) {
    if(![x0,z0,x1,z1].every(Number.isFinite) || (Math.abs(x1-x0)/this.size+2)*(Math.abs(z1-z0)/this.size+2)>4096)return new Set(this.all);
    const result=new Set(this.overflow);
    for(let x=Math.floor(x0/this.size);x<=Math.floor(x1/this.size);x++)for(let z=Math.floor(z0/this.size);z<=Math.floor(z1/this.size);z++)for(const item of this.cells.get(x+','+z)||[])result.add(item);
    return result;
  }
}
export function createNeighbourhood(layout, {mobile=false, roads=layout.roads || [], crossings=[], obstacles=[]}={}) {
  const buildings=(layout.buildings||[]).map(b=>({x0:b.pos[0]-(b.footprint?.[0]||20)/2,x1:b.pos[0]+(b.footprint?.[0]||20)/2,z0:b.pos[1]-(b.footprint?.[1]||20)/2,z1:b.pos[1]+(b.footprint?.[1]||20)/2,type:b.type}));
  const blocks=new SpatialIndex(), roadIndex=new SpatialIndex();
  for(const b of [...buildings,...obstacles])blocks.insert(b,b.x0,b.z0,b.x1,b.z1);
  const segments=[];
  roads.forEach((r,ri)=>{for(let i=1;i<(r.points||[]).length;i++) {
    const a={x:r.points[i-1][0],z:r.points[i-1][1]},b={x:r.points[i][0],z:r.points[i][1]},half=(r.width||9)/2;
    if(Math.hypot(b.x-a.x,b.z-a.z)<.01)continue;
    const seg={a,b,half,ri};segments.push(seg);roadIndex.insert(seg,Math.min(a.x,b.x)-half-3,Math.min(a.z,b.z)-half-3,Math.max(a.x,b.x)+half+3,Math.max(a.z,b.z)+half+3);
  }});
  const nearby=(index,a,b,pad)=>index.query(Math.min(a.x,b.x)-pad,Math.min(a.z,b.z)-pad,Math.max(a.x,b.x)+pad,Math.max(a.z,b.z)+pad);
  const clear=(a,b=a,pad=.45,allowRoad=-1)=>{
    for(const box of nearby(blocks,a,b,pad))if(intersectsBox(a,b,box,pad))return false;
    for(const seg of nearby(roadIndex,a,b,pad))if(seg.ri!==allowRoad && segmentDistance(a,b,seg.a,seg.b)<seg.half+pad)return false;
    return true;
  };
  const nodes=[],edges=[],grid=new SpatialIndex(12),spaces=[],crossingEdges=[];
  const addNode=(p,kind='pavement')=>{const node={...p,id:nodes.length,kind,edges:[],component:-1};nodes.push(node);grid.insert(node,node.x,node.z);return node;};
  const connect=(a,b,crossing=null)=>{
    if(a.id===b.id || a.edges.some(e=>e.to===b.id))return;
    const length=Math.hypot(a.x-b.x,a.z-b.z); if(length<.1)return;
    const edge={a:a.id,b:b.id,length,crossing};edges.push(edge);a.edges.push({to:b.id,edge});b.edges.push({to:a.id,edge});if(crossing)crossingEdges.push(edge);
  };
  // Sample every pavement. Entire edges, not only their endpoints, must clear.
  for(const seg of segments) {
    const len=Math.hypot(seg.b.x-seg.a.x,seg.b.z-seg.a.z),nx=-(seg.b.z-seg.a.z)/len,nz=(seg.b.x-seg.a.x)/len;
    for(const side of [-1,1]) { let previous=null;const n=Math.max(1,Math.ceil(len/8));
      for(let i=0;i<=n;i++) {
        const p={x:seg.a.x+(seg.b.x-seg.a.x)*i/n+nx*side*(seg.half+.95),z:seg.a.z+(seg.b.z-seg.a.z)*i/n+nz*side*(seg.half+.95),nx:nx*side,nz:nz*side};
        if(!clear(p)){previous=null;continue;}
        const node=addNode(p);
        if(previous && clear(previous,node))connect(previous,node);
        previous=node;
      }
    }
  }
  // Connect corners, but never cut diagonally through a road or building.
  for(const a of nodes)for(const b of grid.query(a.x-10,a.z-10,a.x+10,a.z+10)) {
    if(b.id<=a.id || Math.hypot(a.x-b.x,a.z-b.z)>10)continue;
    if(clear(a,b))connect(a,b);
  }
  for(const crossing of crossings) {
    const {a,b,road}=crossing;
    if(!clear(a,b,.45,road))continue;
    const ends=[a,b].map(p=>{
      const near=[...grid.query(p.x-12,p.z-12,p.x+12,p.z+12)].filter(n=>Math.hypot(n.x-p.x,n.z-p.z)<12 && clear(p,n)).sort((n,m)=>Math.hypot(n.x-p.x,n.z-p.z)-Math.hypot(m.x-p.x,m.z-p.z))[0];
      if(!near)return null;
      const node=addNode(p);connect(node,near);return node;
    });
    if(ends.every(Boolean))connect(ends[0],ends[1],{...crossing,id:crossingEdges.length,users:new Set()});
  }
  // Deterministic candidates, spread over the city rather than filling the first road.
  const rng=seededRandom(1893), candidates=nodes.filter(n=>n.nx!==undefined && n.edges.length).map(n=>({node:n,rank:rng()})).sort((a,b)=>a.rank-b.rank);
  for(const {node} of (layout.autoScenery===false?[]:candidates)) {
    if(spaces.length>=(mobile?6:12))break;
    const radius=6,center={x:node.x+node.nx*9,z:node.z+node.nz*9};
    if(!clear(center,center,radius+2) || !clear(node,center))continue;
    if(spaces.some(s=>Math.hypot(s.x-center.x,s.z-center.z)<70))continue;
    if((layout.parks||[]).some(p=>Math.hypot(p.cx-center.x,p.cz-center.z)<p.radius+radius+2))continue;
    const nearest=buildings.slice().sort((a,b)=>Math.hypot((a.x0+a.x1)/2-center.x,(a.z0+a.z1)/2-center.z)-Math.hypot((b.x0+b.x1)/2-center.x,(b.z0+b.z1)/2-center.z))[0];
    if(!nearest || Math.hypot((nearest.x0+nearest.x1)/2-center.x,(nearest.z0+nearest.z1)/2-center.z)>70)continue;
    const kind=/shop|office/.test(nearest.type)?'cafe':/housing/.test(nearest.type)?'garden':'court';
    const space={...center,radius,kind,id:spaces.length,entrance:{x:node.x,z:node.z},nx:node.nx,nz:node.nz};spaces.push(space);
    // Small conversation ring: real destinations separated from furniture at the rim.
    const hub=addNode(center,'junction');connect(node,hub);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;const end=addNode({x:center.x+Math.cos(a)*2.1,z:center.z+Math.sin(a)*2.1},'gather');connect(hub,end);end.face=center;}
  }
  const components=[];
  for(const node of nodes) {
    if(node.component!==-1)continue;
    const id=components.length,list=[],queue=[node];node.component=id;
    for(let k=0;k<queue.length;k++){const n=queue[k];list.push(n.id);for(const e of n.edges){const next=nodes[e.to];if(next.component<0){next.component=id;queue.push(next);}}}
    components.push(list);
  }
  const anchors=nodes.filter(n=>n.edges.length && ((n.kind==='gather' && n.id%2===0) || (n.kind==='pavement' && n.id%5===0)));
  for(const node of anchors) {
    const nearby=[...blocks.query(node.x-24,node.z-24,node.x+24,node.z+24)].filter(b=>b.type && !/housing|lib:/.test(b.type));
    if(nearby.length && node.kind==='pavement') {
      const b=nearby[0];node.service=b.type;node.face={x:(b.x0+b.x1)/2,z:(b.z0+b.z1)/2};
    }
  }
  function route(from,to) {
    if(!nodes[from] || !nodes[to] || nodes[from].component!==nodes[to].component)return [];
    const queue=[from],prev=new Map([[from,null]]);
    for(let k=0;k<queue.length;k++) {const id=queue[k];if(id===to)break;for(const e of nodes[id].edges)if(!prev.has(e.to)){prev.set(e.to,id);queue.push(e.to);}}
    if(!prev.has(to))return [];
    const path=[];for(let id=to;id!==from;id=prev.get(id))path.unshift(id);return path;
  }
  return {nodes,edges,spaces,anchors,components,crossings:crossingEdges,clear,route,revision:0};
}

// All populations share reservations and proximity checks. Fixed-step logic is
// independent of frame rate; renderers interpolate previous/current positions.
export function createStreetLife(environment, {mobile=false,seed=904,reducedMotion=false,previousActors=[]}={}) {
  const rng=seededRandom(seed),actors=[],reserved=new Map();let accumulator=0,time=0;
  const sharedCap=mobile?24:48;
  const humanCap=sharedCap,robotCap=sharedCap;
  const shuffled=environment.anchors.map(n=>({n,r:rng()})).sort((a,b)=>a.r-b.r).map(x=>x.n);
  const population=Math.min(humanCap+robotCap,Math.floor(shuffled.length*.65));
  const eachKind=Math.ceil(population/2);
  for(const [kind,cap] of [['human',Math.min(humanCap,eachKind)],['robot',Math.min(robotCap,population-eachKind)]]) {
    const candidates=shuffled.slice().sort((a,b)=>Number(kind==='human'?b.kind==='gather':!!b.service)-Number(kind==='human'?a.kind==='gather':!!a.service));
    let count=0;
    for(const n of candidates) {
      if(count>=cap)break;
      if(actors.some(a=>Math.hypot(a.x-n.x,a.z-n.z)<1.2))continue;
      // A few people start their route immediately so a freshly opened city
      // feels alive even before the camera happens to be near a pavement.
      const actor={id:actors.length,kind,type:count%2,x:n.x,z:n.z,px:n.x,pz:n.z,node:n.id,target:n.id,path:[],heading:n.face?Math.atan2(n.face.x-n.x,n.face.z-n.z):rng()*Math.PI*2,speed:kind==='human'?1.05+rng()*.35:1.3+rng()*.4,wait:kind==='human' && count<4 ? 0 : 2+rng()*8,state:'idle',crossing:null};
      actors.push(actor);reserved.set(n.id,actor.id);count++;
    }
  }
  // Rebuilding around one moved prop should not reset the rest of the crowd.
  const previousUsed=new Set();
  for(const actor of actors) {
    const previous=previousActors.filter(a=>a.kind===actor.kind && a.type===actor.type && !previousUsed.has(a))
      .sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z))[0];
    if(!previous || !environment.clear(previous) || Math.hypot(previous.x-actor.x,previous.z-actor.z)>30)continue;
    const near=environment.nodes.filter(n=>Math.hypot(n.x-previous.x,n.z-previous.z)<8 && environment.clear(previous,n))
      .sort((a,b)=>Math.hypot(a.x-previous.x,a.z-previous.z)-Math.hypot(b.x-previous.x,b.z-previous.z))[0];
    if(!near)continue;
    previousUsed.add(previous);actor.x=actor.px=previous.x;actor.z=actor.pz=previous.z;actor.heading=previous.heading;
    actor.node=near.id;actor.path=[near.id];actor.wait=0;
  }
  let cars=[];
  function setVehicles(value){cars=value;}
  function crossingSafe(c) {
    const mid={x:(c.a.x+c.b.x)/2,z:(c.a.z+c.b.z)/2};
    return !cars.some(v=>Number.isFinite(v.x) && Math.hypot(v.x-mid.x,v.z-mid.z)<Math.max(9,(v.currentSpeed??v.speed??0)*2.5));
  }
  function tick(dt) {
    time+=dt;
    const neighbours=new SpatialIndex(2);for(const a of actors)neighbours.insert(a,a.x,a.z);
    for(const a of actors){a.px=a.x;a.pz=a.z;if(reducedMotion || (a.kind==='human' && a.visualActive===false && !a.crossing))continue;
      if(a.wait>0){a.wait-=dt;a.state='idle';continue;}
      if(!a.path.length) {
        if(a.crossing){a.crossing.users.delete(a.id);a.crossing=null;}
        a.state='idle';
        const here=environment.nodes[a.node];
        const pool=environment.anchors.filter(n=>n.id!==a.node && !reserved.has(n.id) && n.component===here.component && Math.hypot(n.x-a.x,n.z-a.z)<120 && Math.hypot(n.x-a.x,n.z-a.z)>5);
        const social=pool.filter(n=>a.kind==='human'?n.kind==='gather':!!n.service);const choices=social.length && rng()<.7?social:pool;
        if(!choices.length){a.wait=2;continue;}
        const target=choices[Math.floor(rng()*choices.length)];a.path=environment.route(a.node,target.id);
        if(!a.path.length){a.wait=2;continue;}
        if(reserved.get(a.target)===a.id)reserved.delete(a.target);reserved.set(target.id,a.id);a.target=target.id;
      }
      const next=environment.nodes[a.path[0]],edge=next.id===a.node?{crossing:null}:environment.nodes[a.node].edges.find(e=>e.to===next.id)?.edge;
      if(!edge){a.path=[];a.wait=1;continue;}
      if(edge.crossing && a.crossing!==edge.crossing){if(!crossingSafe(edge.crossing)){a.state='waiting';continue;}a.crossing=edge.crossing;a.crossing.users.add(a.id);}
      const dx=next.x-a.x,dz=next.z-a.z,d=Math.hypot(dx,dz),step=Math.min(d,a.speed*dt);
      let nx=a.x+dx/(d||1)*step,nz=a.z+dz/(d||1)*step;
      const blocked=[...neighbours.query(nx-1,nz-1,nx+1,nz+1)].some(b=>b!==a && Math.hypot(b.x-nx,b.z-nz)<.8 && Math.hypot(b.x-nx,b.z-nz)<Math.hypot(b.x-a.x,b.z-a.z));
      if(blocked) {
        // Yield and take a small step to the right when the pavement has room.
        // The whole sidestep is clearance-tested; no wall/road shortcuts.
        const sx=a.x+dz/(d||1)*.12,sz=a.z-dx/(d||1)*.12;
        const room=environment.clear(a,{x:sx,z:sz},.45,edge.crossing?.road??-1) &&
          ![...neighbours.query(sx-1,sz-1,sx+1,sz+1)].some(b=>b!==a && Math.hypot(b.x-sx,b.z-sz)<.8);
        if(room){a.x=sx;a.z=sz;}
        a.state='waiting';continue;
      }
      a.x=nx;a.z=nz;a.state='walk';let turn=Math.atan2(dx,dz)-a.heading;turn=Math.atan2(Math.sin(turn),Math.cos(turn));a.heading+=turn*Math.min(1,dt/.25);
      if(d<=step+.001){a.node=next.id;a.path.shift();if(a.crossing){a.crossing.users.delete(a.id);a.crossing=null;}if(!a.path.length){a.state='idle';a.wait=a.kind==='human'?5+rng()*14:2+rng()*4;if(next.face)a.heading=Math.atan2(next.face.x-a.x,next.face.z-a.z);}}
    }
  }
  return {actors,environment,setVehicles,setReducedMotion(value){reducedMotion=value;},get time(){return time;},get alpha(){return accumulator/.1;},update(dt){accumulator+=Math.min(.25,dt);let steps=0;while(accumulator>=.1 && steps++<3){tick(.1);accumulator-=.1;}},
    shouldYield(x,z,vx,vz,speed){return environment.crossings.some(e=>{const c=e.crossing;if(!c.users.size)return false;const dx=(c.a.x+c.b.x)/2-x,dz=(c.a.z+c.b.z)/2-z;return dx*vx+dz*vz>0 && Math.hypot(dx,dz)<Math.max(7,speed*1.7);});},
    destroy(){for(const e of environment.crossings)e.crossing.users.clear();actors.length=0;reserved.clear();}
  };
}
