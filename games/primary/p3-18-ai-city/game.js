/**
 * game.js — AI City Architect core
 * 20×20 grid, 22 buildings, road graph, routes, quick-start
 */
const Game = (() => {
'use strict';

const G = 30, BUDGET = 500, HAZ = 3;

const SYS = ['power','water','transport','health','waste','safety'];

const BLD = {
  solar:{s:'power',l:'Solar Farm',c:8,p:{e:5},sl:['Eff']},
  wind:{s:'power',l:'Wind Turbine',c:6,p:{e:3}},
  water:{s:'water',l:'Water Tower',c:8,p:{w:10}},
  data:{s:'power',l:'Data Center',c:20,k:{e:8},sl:['Cool']},
  bat:{s:'power',l:'Battery',c:10,sl:['Cap']},
  bus:{s:'transport',l:'Bus Stop',c:4,sl:['Freq','Sched']},
  depot:{s:'transport',l:'Bus Depot',c:6},
  road:{s:'transport',l:'Road',c:2,sl:['Dir']},
  traffic:{s:'transport',l:'Traffic Light',c:3,sl:['Green','Flow']},
  drone:{s:'transport',l:'Drone Pad',c:8,sl:['Range']},
  hosp:{s:'health',l:'Hospital',c:20,cap:50,sl:['Staff']},
  clinic:{s:'health',l:'Clinic',c:8,cap:10},
  green:{s:'health',l:'Green Space',c:3,sen:5},
  recycle:{s:'waste',l:'Recycling Ctr',c:6,sl:['Route']},
  collect:{s:'waste',l:'Collection Pt',c:4},
  compost:{s:'waste',l:'Compost',c:5},
  cctv:{s:'safety',l:'CCTV Node',c:6,sl:['Sense','Anal']},
  emerg:{s:'safety',l:'Emergency Stn',c:8},
  flood:{s:'safety',l:'Flood Barrier',c:10},
  town:{s:'safety',l:'Town Hall',c:12,sl:['Tax']},
  auditor:{s:'safety',l:'AI Auditor',c:10},
  school:{s:'safety',l:'School',c:8},
};

const SLD = {
  Freq:{l:'Frequency',min:5,max:30,def:15,u:'min'},
  Green:{l:'Green Light',min:10,max:60,def:30,u:'s'},
  Staff:{l:'Staff',min:1,max:5,def:3},
  Route:{l:'Route Len',min:3,max:10,def:5,u:'stops'},
  Cap:{l:'Capacity',min:10,max:50,def:20,u:'MW'},
  Cool:{l:'Cooling',opts:['Air','Liquid (+3🪙)','Green (+5🪙)'],def:'Air'},
  Range:{l:'Range',min:2,max:10,def:5,u:'km'},
  Sense:{l:'Sensitivity',min:1,max:10,def:5},
  Tax:{l:'Tax Rate',min:10,max:30,def:20,u:'%'},
  Eff:{l:'Panel Upgrade',opts:['Standard','Efficient (+5🪙)'],def:'Standard'},
  Sched:{l:'AI Scheduling',opts:['Manual','AI Optimised (+3🪙)'],def:'Manual'},
  Flow:{l:'Sensor Upgrade',opts:['Standard','AI Flow (+4🪙)'],def:'Standard'},
  Anal:{l:'AI Analytics',opts:['Off','Track Mode (+3🪙)'],def:'Off'},
  Dir:{l:'Direction',opts:['↔️ Horz','↕️ Vert','✚ Cross'],def:'↔️ Horz'},
};

const WATER_TILES = [[0,3],[0,4],[1,4],[1,5],[2,5],[3,5],[4,5],[4,6],[5,6],[6,6],[6,7],[7,7],[8,7],[8,8],[8,9],[9,9],[10,9],[10,10],[11,10],[12,10],[12,11],[13,11],[14,11],[14,12],[15,12],[16,12],[16,13],[17,13],[18,13],[18,14],[19,14]];
const MTN_TILES = [[0,0],[0,1],[1,0]];

let state, rand;
function seed(n){let s=n||Date.now();return()=>{s=(s*1664525+1013904223)&0xFFFFFFFF;return(s>>>0)/0xFFFFFFFF;}}
function clamp(v,l,h){return Math.max(l,Math.min(h,v))}
function pick(a){return a[Math.floor(rand()*a.length)]}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function isW(r,c){return WATER_TILES.some(([rr,cc])=>rr===r&&cc===c)}
function isM(r,c){return MTN_TILES.some(([rr,cc])=>rr===r&&cc===c)}
function ok(r,c){return r>=0&&r<G&&c>=0&&c<G}
function bldById(i){return state.buildings.find(b=>b.id===i)}
function bldAt(r,c){return state.buildings.find(b=>b.row===r&&b.col===c)}
function cntType(t){return state.buildings.filter(b=>b.type===t).length}
function sysBlds(s){return state.buildings.filter(b=>BLD[b.type]?.s===s)}

function initState(){
  rand=seed(Date.now());
  state={
    phase:'design',layer:'all',
    grid:Array.from({length:G},()=>Array(G).fill(null)),
    terrain:Array.from({length:G},(_,r)=>Array.from({length:G},(_,c)=>isW(r,c)?'water':isM(r,c)?'mtn':'grass')),
    hazards:[],scanned:new Set(),hazardResults:{},hazFound:0,hazCleared:0,removingH:null,
    buildings:[],connections:[],configs:{},routes:[],idC:0,
    tokens:{budget:BUDGET,spent:0},
    graph:{edges:[]},routeMetrics:[],
    scenarios:{traffic:false,power:false,waste:false,bus:false,drone:false,water:false},
    hilt:{scenarios:[],completed:0},
    seeded:false,
    sim:{speed:1,time:0,systems:{},agents:[],eventLog:[],crisis:null,crisesDone:0,sentiment:70,pop:500,
      weather:'clear',weatherTime:0,hour:6,day:1},
    score:{stars:0},
    sessionId:Date.now()
  };
  placeHazards();
}
function placeHazards(){
  rand=seed(state.sessionId+1);
  let pos=[];
  for(let r=0;r<G;r++)for(let c=0;c<G;c++)if(!isW(r,c)&&!isM(r,c))pos.push([r,c]);
  shuffle(pos);
  state.hazards=pos.slice(0,HAZ);
  rand=seed(Date.now());
}

// ── Scan ──
function scanTile(r,c,turbo){
  const k=r+','+c;
  if(!ok(r,c)||isW(r,c)||isM(r,c))return{res:'blocked'};
  // Already scanned? Return cached result (turbo checks additional guard below)
  if(state.hazardResults[k]==='found')return{res:'found',c:state.hazFound};
  if(!turbo&&state.scanned.has(k))return{res:state.hazardResults[k]};
  if(turbo&&state.scanned.has(k))return{res:state.hazardResults[k]};
  const haz=state.hazards.some(([hr,hc])=>hr===r&&hc===c);
  if(turbo){
    state.scannedTurbo=state.scannedTurbo||new Set();
    state.scannedTurbo.add(k);
    const miss=rand()<0.33;
    if(haz&&!miss){state.hazardResults[k]='found';state.hazFound++;return{res:'found',c:state.hazFound};}
    else{state.hazardResults[k]=haz?'tmiss':'clear';return{res:haz?'tmiss':'clear'};}
  }else{
    if(state.hazardResults[k]==='tmiss'||!state.scanned.has(k))state.scanned.add(k);
    if(haz){state.hazardResults[k]='found';state.hazFound++;return{res:'found',c:state.hazFound};}
    else{state.hazardResults[k]='clear';return{res:'clear'};}
  }
}
// Scan a 4×4 block — used by normal tap (covers 16 tiles per click)
function scanArea(r,c,turbo){
  const results=[];
  for(let dr=0;dr<4;dr++)for(let dc=0;dc<4;dc++){
    const nr=r+dr,nc=c+dc;
    if(nr>=0&&nr<G&&nc>=0&&nc<G)results.push(scanTile(nr,nc,turbo));
  }
  return results;
}
function beginRem(r,c){
  const k=r+','+c;
  if(state.hazardResults[k]!=='found'||state.removingH)return false;
  state.removingH={row:r,col:c};return true;
}
function completeRem(r,c){
  const k=r+','+c;
  if(state.hazardResults[k]!=='found')return false;
  state.hazardResults[k]='cleared';state.hazCleared++;state.removingH=null;
  return{c:state.hazCleared};
}

// ── Build ──
function canPlace(type,r,c){
  const d=BLD[type];if(!d)return'Unknown';
  if(!ok(r,c))return'Bounds';if(isW(r,c))return'Water';if(isM(r,c))return'Mtn';
  if(bldAt(r,c))return'Oc';
  if(state.tokens.spent+d.c>state.tokens.budget)return'Tokens';
  return null;
}
function place(type,r,c){
  const e=canPlace(type,r,c);if(e)return{err:e};
  const id=state.idC++,d=BLD[type];
  const b={id,type,row:r,col:c,eff:1,cfg:{}};
  const key=r+','+c;
  if(state.hazardResults[key]==='found')b.eff=0.5;
  state.buildings.push(b);state.grid[r][c]='building';
  state.tokens.spent+=d.c;
  if(d.sl)d.sl.forEach(s=>{const df=SLD[s];b.cfg[s]=df.def!==undefined?df.def:df.opts?df.opts[0]:0;});
  return{ok:true,b};
}
function removeBld(id){
  const i=state.buildings.findIndex(b=>b.id===id);if(i<0)return;
  const b=state.buildings[i],d=BLD[b.type];if(!d)return;
  state.tokens.spent-=d.c-Math.floor(d.c*0.6);
  state.grid[b.row][b.col]=null;state.buildings.splice(i,1);
}

// ── Road Network ──
function buildRoadGraph(){
  const roads=state.buildings.filter(b=>b.type==='road'||b.type==='bus'||b.type==='depot'||b.type==='traffic'||b.type==='collect'||b.type==='recycle');
  const tiles=new Map(); // key → {r,c,type}
  roads.forEach(b=>{
    const k=b.row+','+b.col;
    tiles.set(k,{r:b.row,c:b.col,type:b.type});
    // Also include adjacent roads for pathfinding
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
      const nr=b.row+dr,nc=b.col+dc;
      if(!ok(nr,nc))return;
      const nk=nr+','+nc;
      const nb=bldAt(nr,nc);
      if(nb&&(nb.type==='road'||nb.type==='bus'||nb.type==='depot'||nb.type==='traffic')){
        tiles.set(nk,{r:nr,c:nc,type:nb.type});
      }
    });
  });
  // Build adjacency
  const adj=new Map();
  tiles.forEach((v,k)=>{
    const neighbors=[];
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
      const nk=(v.r+dr)+','+(v.c+dc);
      if(tiles.has(nk))neighbors.push(nk);
    });
    adj.set(k,neighbors);
  });
  return {tiles,adj};
}

function bfs(adj,from,to){
  if(from===to)return[from];
  const visited=new Set([from]),queue=[[from,[from]]];
  while(queue.length){
    const [cur,path]=queue.shift();
    for(const nb of (adj.get(cur)||[])){
      if(!visited.has(nb)){
        if(nb===to)return[...path,nb];
        visited.add(nb);queue.push([nb,[...path,nb]]);
      }
    }
  }
  return null;
}

function routeDistance(path){return path ? path.length : 0;}

// Find the shortest loop path visiting all waypoints and returning to start
function bestLoop(adj, start, waypoints){
  if(waypoints.length===0)return null;
  // Try original order and reversed, pick shortest
  let best=null,bestDist=Infinity;
  const orders=[waypoints, [...waypoints].reverse()];
  for(const order of orders){
    const path=[];
    let cur=start;
    let ok=true;
    for(const wp of order){
      const seg=bfs(adj,cur,wp);
      if(!seg||seg.length<2){ok=false;break;}
      path.push(...(cur===start?seg:seg.slice(1)));
      cur=wp;
    }
    if(!ok)continue;
    const back=bfs(adj,cur,start);
    if(!back||back.length<2)continue;
    path.push(...back.slice(1));
    const dist=routeDistance(path);
    if(dist<bestDist){best=path;bestDist=dist;}
  }
  return best;
}

// Find a partial route that visits as many waypoints as possible (if full loop is impossible)
function partialLoop(adj, start, waypoints){
  const path=[];
  let cur=start;
  for(const wp of waypoints){
    const seg=bfs(adj,cur,wp);
    if(!seg||seg.length<2)continue; // skip unreachable stop
    path.push(...(cur===start?seg:seg.slice(1)));
    cur=wp;
  }
  if(cur!==start){
    const back=bfs(adj,cur,start);
    if(back&&back.length>1)path.push(...back.slice(1));
  }
  return path.length>1?path:null;
}

function findRoutes(){
  const rg=buildRoadGraph();
  const routes=[];
  const stops=state.buildings.filter(b=>b.type==='bus');
  const depots=state.buildings.filter(b=>b.type==='depot');
  const collects=state.buildings.filter(b=>b.type==='collect');
  const recycles=state.buildings.filter(b=>b.type==='recycle');

  // Bus routes: connect stops via depot — try all orderings
  if(stops.length>0&&depots.length>0){
    const sks=stops.map(s=>s.row+','+s.col);
    const dk=depots[0].row+','+depots[0].col;
    let path=bestLoop(rg.adj,dk,sks);
    if(!path)path=partialLoop(rg.adj,dk,sks);
    if(path&&path.length>1){
      const dist=routeDistance(path);
      const coverage=Math.round((stops.length/depots.length)*100);
      const stopIdx=[];
      sks.forEach(sk=>{const idx=path.indexOf(sk);if(idx>=0)stopIdx.push(idx);});
      routes.push({id:'bus-1',type:'bus',label:'Bus Line A',color:'#a78bfa',path,vehicles:[{progress:0},{progress:0.5}],stopIdx,distance:dist,stops:stops.length,coverage});
    }
  }

  // Waste routes: connect collects → recycling → back
  if(collects.length>0&&recycles.length>0){
    const cks=collects.map(c=>c.row+','+c.col);
    const rk=recycles[0].row+','+recycles[0].col;
    const allWp=[rk];
    let path=bestLoop(rg.adj,cks[0],allWp);
    if(!path)path=partialLoop(rg.adj,cks[0],allWp);
    if(path&&path.length>1){
      const dist=routeDistance(path);
      const coverage=Math.min(100,Math.round((collects.length/recycles.length)*200));
      const wStopIdx=[];
      cks.forEach(ck=>{const idx=path.indexOf(ck);if(idx>=0)wStopIdx.push(idx);});
      routes.push({id:'waste-1',type:'waste',label:'Waste Route',color:'#4ade80',path,vehicles:[{progress:0}],stopIdx:wStopIdx,distance,stops:collects.length,coverage});
    }
  }

  // Fallback: if no specific routes found but roads exist, create a patrol route
  if(routes.length===0&&rg.adj.size>3){
    // Find the largest connected component of road tiles
    const allTiles=[...rg.adj.keys()];
    let largest=[];
    const visited=new Set();
    for(const tile of allTiles){
      if(visited.has(tile))continue;
      // BFS to find all tiles in this component
      const comp=[],q=[tile];
      visited.add(tile);
      while(q.length){
        const cur=q.shift();
        comp.push(cur);
        for(const nb of (rg.adj.get(cur)||[])){
          if(!visited.has(nb)){visited.add(nb);q.push(nb);}
        }
      }
      if(comp.length>largest.length)largest=comp;
    }
    // Create a simple patrol path along the largest component
    if(largest.length>=4){
      const start=largest[0];
      // Find the farthest tile from start (graph diameter end)
      const dists=new Map([[start,0]]),dq=[[start,0]];
      let farthest=start,farthestDist=0;
      const visited2=new Set([start]);
      while(dq.length){
        const [cur,dist]=dq.shift();
        if(dist>farthestDist){farthest=cur;farthestDist=dist;}
        for(const nb of (rg.adj.get(cur)||[])){
          if(!visited2.has(nb)){visited2.add(nb);dq.push([nb,dist+1]);dists.set(nb,dist+1);}
        }
      }
      // BFS from farthest to start to get a long connected path
      const patrolPath=bfs(rg.adj,farthest,start);
      if(patrolPath&&patrolPath.length>=4){
        routes.push({
          id:'patrol-1',type:'bus',label:'Patrol Route',color:'#a78bfa',
          path:patrolPath,vehicles:[{progress:0},{progress:0.5}],
          stopIdx:[],distance:patrolPath.length,stops:0,coverage:0
        });
        // Garbage truck patrol on same route, offset so they don't overlap
        routes.push({
          id:'patrol-2',type:'waste',label:'Waste Patrol',color:'#4ade80',
          path:patrolPath,vehicles:[{progress:0.3}],
          stopIdx:[],distance:patrolPath.length,stops:0,coverage:0
        });
      }
    }
  }

  // Add optimal route metrics — AI can reference these later
  state.routes=routes;
  state.routeMetrics=routes.map(r=>({id:r.id,type:r.type,label:r.label,distance:r.distance,stops:r.stops,coverage:r.coverage,efficient:r.distance<50}));
}

// ── Quick Start ──
  function quickStart(){
    clearSave();
    state.hazFound=HAZ;state.hazCleared=HAZ;
    state.tokens.budget=1500;
    state.hazards.forEach(([r,c])=>{
      const k=r+','+c;state.hazardResults[k]='cleared';state.scanned.add(k);
    });

    function roadH(row,c1,c2){for(let c=c1;c<=c2;c++)place('road',row,c);}
    function roadV(col,r1,r2){for(let r=r1;r<=r2;r++)place('road',r,col);}

    // ====== SPARSE ROAD GRID ======
    // Horizontal spines
    roadH(1,1,29);   // North edge
    roadH(4,1,29);   // Row 4
    roadH(8,1,29);   // Row 8
    roadH(12,1,29);  // Row 12
    roadH(16,1,29);  // Row 16
    roadH(20,1,29);  // Row 20
    roadH(24,1,29);  // Row 24
    roadH(28,1,29);  // South edge
    // Vertical spines
    roadV(1,1,28);   // West edge
    roadV(6,1,28);   // Col 6
    roadV(12,1,28);  // Col 12
    roadV(18,1,28);  // Col 18
    roadV(24,1,28);  // Col 24
    roadV(29,1,28);  // East edge

    // ====== ZONED CITY LAYOUT (60+ buildings in 6 districts) ======
    const blds=[
      // ── DISTRICT 1: POWER & WATER (NW block, rows 2-7, cols 2-11) ──
      ['solar',2,2],['solar',2,3],['solar',2,4],['solar',2,5],
      ['wind',3,2],['wind',3,3],
      ['bat',5,2],['data',6,2],
      ['water',5,5],['water',6,5],

      // ── DISTRICT 2: TRANSPORT HUB (NE, rows 2-7, cols 13-28) ──
      ['depot',2,14],      ['bus',3,13],['bus',3,19],['bus',3,25],['bus',13,19],['bus',21,13],
      ['drone',6,25],['drone',6,27],
      ['traffic',5,17],['traffic',5,23],
      ['solar',2,20],['solar',2,22],

      // ── DISTRICT 3: HEALTH DISTRICT (mid-west, rows 9-15, cols 2-11) ──
      ['hosp',9,3],['clinic',10,3],['clinic',14,5],
      ['green',10,5],['green',10,9],['green',14,3],
      ['school',13,3],

      // ── DISTRICT 4: WASTE MANAGEMENT (mid-east, rows 9-15, cols 13-28) ──
      ['recycle',9,14],['recycle',9,20],
      ['collect',9,13],['collect',9,25],['collect',5,20],['collect',17,13],
      ['compost',10,14],['compost',10,20],['recycle',5,13],['collect',5,20],['collect',17,14],
      ['water',13,19],['wind',14,25],

      // ── DISTRICT 5: GOVERNANCE & SAFETY (south, rows 17-27, cols 2-28) ──
      ['town',18,8],['school',18,14],['auditor',18,20],
      ['cctv',17,8],['cctv',17,14],['cctv',17,20],
      ['emerg',22,8],['emerg',22,20],
      ['flood',26,9],['flood',26,17],['flood',26,25],

      // ── EXTRA FILL — south district expansion (rows 17-27) ──
      // Row 17-19 blocks
      ['solar',18,2],['solar',18,4],['wind',18,7],
      ['recycle',18,9],['compost',18,11],
      ['clinic',18,16],['hosp',18,22],
      ['drone',18,26],['drone',18,28],
      // Row 21-23 blocks
      ['solar',22,2],['wind',22,7],
      ['green',22,9],['green',22,11],
      ['bat',22,16],['data',22,17],
      ['cctv',22,22],['cctv',22,26],
      // Row 25-27 blocks
      ['solar',26,2],['solar',26,4],['bat',26,7],
      ['water',26,9],['green',26,11],
      ['school',26,16],['auditor',26,22],
      ['emerg',26,26],['emerg',26,28],
      // Scattered extras
      ['solar',14,23],['solar',22,14],
      ['wind',10,7],['wind',22,26],
      ['clinic',17,27],['green',25,4],['green',25,10],
      ['bat',10,28],['bat',22,4],
      ['drone',25,22],['drone',25,26],
    ];
    blds.forEach(([t,r,c])=>place(t,r,c));

    // ====== ROUTES (cover most of the city) ======
    // Bus: NW → NE → SE → SW → back. Visits all 5 bus stops and traverses the full road grid.
    const busPath=[
      // Depot → stop A (3,13)
      '2,14','1,14','1,13','1,12','2,12','3,12','4,12','4,13','3,13',
      // Stop A → stop B (3,19) along row 4
      '4,13','4,14','4,15','4,16','4,17','4,18','4,19','3,19',
      // Stop B → stop C (3,25) along row 4
      '4,19','4,20','4,21','4,22','4,23','4,24','4,25','3,25',
      // Down east side via col 24 and 25
      '4,25','8,25','12,25','16,25','20,25','24,25',
      // West along row 24
      '24,24','24,23','24,22','24,21','24,20','24,19','24,18',
      // Stop D (13,19) via col 18
      '20,18','16,18','13,19',
      // South-west via row 20
      '16,18','20,18','20,17','20,16','20,15','20,14','20,13',
      // Stop E (21,13)
      '21,13',
      // Return to depot via col 12 south, row 8 west, col 2 north
      '20,13','20,12','16,12','12,12','8,12','8,11','8,10','8,9','8,8','8,7','8,6','8,5','8,4','8,3','8,2',
      '4,2','4,3','4,4','4,5','4,6','4,7','4,8','4,9','4,10','4,11','4,12',
      '3,12','2,12','1,12','1,13','1,14','2,14'];
    state.routes.push({id:'bus-1',type:'bus',label:'Bus Line A',color:'#a78bfa',path:busPath,vehicles:[{progress:0},{progress:0.5}],stopIdx:[8,15,20,30,39],distance:busPath.length,stops:5,coverage:100});

    // Waste Route A: collection(5,20)→road east→south to col 24→west to recycling→back
    const wastePath=[
      '5,20','4,20','4,21','4,22','4,23','4,24','4,25','8,25','12,25','12,24',
      '12,23','12,22','12,21','12,20','12,19','12,18','12,17','12,16','12,15','12,14',
      '12,13','12,12','12,11','12,10','12,9','12,8','12,7','12,6','12,5','12,4','12,3','12,2',
      '11,2','10,2','9,2','8,2','8,3','8,4','8,5','8,6','8,7','8,8','8,9','8,10','8,11','8,12','8,13',
      '8,14','9,14','9,13','9,12','9,11','9,10','9,9','9,8','9,7','9,6','9,5','9,4','9,3','9,2',
      '5,2','5,3','5,4','5,5','5,6','5,7','5,8','5,9','5,10','5,11','5,12','5,13',
      '4,13','4,14','4,15','4,16','4,17','4,18','4,19','4,20','5,20'];
    state.routes.push({id:'waste-1',type:'waste',label:'Waste Route A',color:'#4ade80',path:wastePath,vehicles:[{progress:0}],stopIdx:[0,68],distance:wastePath.length,stops:3,coverage:100});

    // Waste Route B: collection(17,13)→recycling(9,14)→south to 2nd collection→south to recycling→back
    const wastePath2=[
      '17,13','16,13','12,13','8,13','8,14','9,14',
      '8,14','8,13','12,13','16,13','17,13'];
    state.routes.push({id:'waste-2',type:'waste',label:'Waste Route B',color:'#34d399',path:wastePath2,vehicles:[{progress:0}],stopIdx:[0,5],distance:wastePath2.length,stops:2,coverage:80});

    state.routeMetrics=state.routes.map(r=>({id:r.id,type:r.type,label:r.label,distance:r.distance,stops:r.stops,coverage:r.coverage,efficient:true}));

    // Pre-populate knowledge graph (15+ meaningful relationships for AI learning)
    const byId={};
    state.buildings.forEach(b=>{
      const id='b'+b.id;
      byId[b.type]=byId[b.type]||[];byId[b.type].push(id);
    });
    function fi(type,idx){const arr=byId[type];return arr?arr[idx||0]:null;}
    const e=[];
    function add(f,t,r){if(f&&t)e.push({from:f,to:t,rel:r});}
    // Power system — solar/wind provides energy to critical infrastructure
    add(fi('solar'),fi('water'),'provides');add(fi('wind'),fi('water'),'provides');
    add(fi('solar'),fi('hosp'),'provides');add(fi('solar'),fi('town'),'provides');
    add(fi('wind'),fi('data'),'provides');
    // Data center — consumes power, needs battery backup
    add(fi('data'),fi('solar'),'consumes');add(fi('data'),fi('bat'),'needs');
    add(fi('bat'),fi('data'),'near');
    // Water — provides to health and schools
    add(fi('water'),fi('hosp'),'provides');add(fi('water'),fi('clinic'),'provides');
    add(fi('water'),fi('school'),'provides');
    // Transport — bus stops near key buildings
    add(fi('bus',0),fi('hosp'),'near');add(fi('bus',0),fi('school'),'near');
    add(fi('bus',1),fi('town'),'near');add(fi('depot'),fi('bus',0),'near');
    add(fi('depot'),fi('bus',1),'near');
    // Waste — recycling connected to collection and transport
    add(fi('recycle',0),fi('collect',0),'consumes');add(fi('collect',0),fi('bus',0),'near');
    add(fi('recycle',1),fi('collect',1),'consumes');add(fi('recycle',0),fi('depot'),'near');
    // Health — hospitals and clinics near green spaces for patient recovery
    add(fi('hosp'),fi('green',0),'near');add(fi('clinic'),fi('green',1),'near');
    add(fi('hosp'),fi('bus',0),'near');add(fi('clinic'),fi('bus',1),'near');
    // Safety — CCTV and emergency near civic buildings
    add(fi('cctv',0),fi('town'),'near');add(fi('cctv',1),fi('school'),'near');
    add(fi('cctv',0),fi('hosp'),'near');add(fi('emerg',0),fi('hosp'),'near');
    add(fi('emerg',0),fi('depot'),'near');add(fi('emerg',1),fi('town'),'near');
    // Power backup — battery supports critical facilities
    add(fi('bat'),fi('hosp'),'near');add(fi('bat'),fi('data'),'near');
    // Flood — barriers protect water and power infrastructure
    add(fi('flood',0),fi('water'),'near');add(fi('flood',1),fi('solar'),'near');
    // School ↔ bus connectivity
    add(fi('school'),fi('bus',0),'near');add(fi('school'),fi('depot'),'near');
    state.graph.edges=e;

    state.scenarios={traffic:false,power:false,waste:false,bus:false,drone:false,water:false};
    state.hilt.completed=0;
  }

// ── Tutorial / AI Suggestion helpers ──
function relocateBuilding(id, nr, nc){
  const b=bldById(id);if(!b)return false;
  if(bldAt(nr,nc)||Game.isW(nr,nc)||Game.isM(nr,nc))return false;
  state.grid[b.row][b.col]=null;
  b.row=nr;b.col=nc;
  state.grid[nr][nc]='building';
  return true;
}

function autoConnectBuilding(fromId, toId){
  if(state.connections.some(c=>c.fromId===fromId&&c.toId===toId))return false;
  state.connections.push({fromId,toId,type:'road'});
  return true;
}

function getNearestBuilding(type, r, c){
  let best=null,bestD=Infinity;
  const candidates=state.buildings.filter(b=>BLD[b.type]?.s===type||b.type===type);
  for(const b of candidates){
    const d=Math.abs(b.row-r)+Math.abs(b.col-c);
    if(d<bestD){bestD=d;best=b;}
  }
  return best;
}

function distanceBetween(a,b){
  return Math.abs(a.row-b.row)+Math.abs(a.col-b.col);
}

function findClosestRoadTile(r,c){
  for(let d=1;d<8;d++){
    for(let dr=-d;dr<=d;dr++)for(let dc=-d;dc<=d;dc++){
      const nr=r+dr,nc=c+dc;
      if(!ok(nr,nc))continue;
      const b=bldAt(nr,nc);
      if(b&&b.type==='road')return [nr,nc];
    }
  }
  return null;
}

// ── Sim helpers ──
function initSim(){
  // Keep existing routes (hardcoded in quickStart) if BFS fails
  const oldRoutes=state.routes;
  state.routes=[];
  findRoutes();
  if(state.routes.length===0&&oldRoutes.length>0)state.routes=oldRoutes;
  state.sim={speed:1,time:0,systems:{},agents:[],
    eventLog:[],crisis:null,crisesDone:0,sentiment:70,pop:500,
    weather:'clear',weatherTime:0,hour:6,day:1};
  SYS.forEach(s=>{state.sim.systems[s]={health:100};});
  state.sim.systems.power.supply=0;state.sim.systems.power.demand=0;
  state.sim.systems.power.mix={bat:50,fl:30,slow:20};
  state.sim.systems.water.supply=0;state.sim.systems.water.demand=0;
  state.sim.systems.water.leaks=[];
  createAgents();
  logEvt('Simulation started');
}
function createAgents(){
  // Buses from routes
  state.routes.forEach(r=>{
    if(r.type==='bus')r.vehicles.forEach(v=>{v.progress=0;});
  });
  // Citizens
  for(let i=0;i<12;i++){
    const b=state.buildings[i%state.buildings.length];
    state.sim.agents.push({type:'citizen',row:b?.row||2+i,col:b?.col||2+i,
      color:['#fb923c','#60a5fa','#4ade80','#c084fc','#facc15','#f472b6'][i%6],visible:false});
  }
}

function tickSim(dt){
  if(!state.sim)return;
  const sp=state.sim.speed;if(sp<1)return;
  const ticks=Math.min(Math.floor(dt/16.66)*sp,20);
  state.sim.time+=ticks;
  state.sim.hour=(6+Math.floor(state.sim.time/3600))%24;
  state.sim.day=1+Math.floor(state.sim.time/86400);
  updateWeather(ticks);
  updateAgents(ticks);
  updateSystems(ticks);
  checkCrises();
}

function updateWeather(ticks){
  state.sim.weatherTime+=ticks;
  if(state.sim.weatherTime>500 && state.sim.weather==='clear'){state.sim.weather='cloudy';state.sim.weatherTime=0;logEvt('☁️ Cloudy');}
  else if(state.sim.weatherTime>300 && state.sim.weather==='cloudy'){state.sim.weather='rain';state.sim.weatherTime=0;logEvt('🌧️ Rain');}
  else if(state.sim.weatherTime>200 && state.sim.weather==='rain'){state.sim.weather='storm';state.sim.weatherTime=0;logEvt('⛈️ Storm!');}
  else if(state.sim.weatherTime>300 && state.sim.weather==='storm'){state.sim.weather='clear';state.sim.weatherTime=0;logEvt('☀️ Clear');}
}

function updateAgents(ticks){
  const sp=ticks/10;
  // Buses on routes
  state.routes.forEach(r=>{
    r.vehicles.forEach(v=>{
      v.progress=(v.progress+0.002*sp)%1;
    });
  });
  // Citizens (teleport-fade)
  state.sim.agents.forEach(a=>{
    if(a.type==='citizen'&&rand()<0.005*sp)a.visible=!a.visible;
  });
}

function updateSystems(ticks){
  const s=state.sim.systems;
  s.power.supply=sysBlds('power').reduce((t,b)=>{
    let e=BLD[b.type]?.p?.e||0;
    if(b.type==='solar'&&b.cfg?.Eff==='Efficient (+5🪙)')e+=2;
    return t+e*b.eff;
  },0);
  s.power.demand=state.buildings.length*0.5;
  // Data Center cooling affects power consumption
  state.buildings.filter(b=>b.type==='data').forEach(dc=>{
    const cool=dc.cfg?.Cool||'Air';
    if(cool==='Liquid')s.power.demand-=2;
    if(cool==='Green')s.power.demand-=4;
  });
  if(state.sim.crisis?.type==='heatwave')s.power.demand*=1.4;
  s.power.health=clamp(100*s.power.supply/(s.power.demand||1),0,100);

  s.water.supply=sysBlds('water').reduce((t,b)=>(t+(BLD[b.type]?.p?.w||0)*b.eff),0);
  s.water.demand=state.buildings.length*0.8;
  if(state.sim.crisis?.type==='flood')s.water.supply*=0.6;
  s.water.health=clamp(100*s.water.supply/(s.water.demand||1),0,100);

  s.transport=s.transport||{health:70};
  const roads=state.buildings.filter(b=>b.type==='road');
  s.transport.health=roads.length>3?clamp(60+roads.length*2,30,100):20;
  const schedBus=state.buildings.some(b=>b.type==='bus'&&b.cfg?.Sched==='AI Optimised (+3🪙)');
  if(schedBus)s.transport.health=Math.min(100,s.transport.health+10);
  const flowTL=state.buildings.some(b=>b.type==='traffic'&&b.cfg?.Flow==='AI Flow (+4🪙)');
  if(flowTL)s.transport.health=Math.min(100,s.transport.health+8);

  s.health=s.health||{health:80};
  const cap=sysBlds('health').reduce((t,b)=>(t+(BLD[b.type]?.cap||0)),0);
  s.health.health=clamp(100*cap/(state.sim.pop*0.05||1),0,100);

  s.waste=s.waste||{health:60};
  const waste=sysBlds('waste');
  s.waste.health=waste.length>0?clamp(50+waste.length*8,20,100):10;

  s.safety=s.safety||{health:75};
  const safe=sysBlds('safety');
  s.safety.health=safe.length>0?clamp(50+safe.length*6,20,100):15;
  const analCCTV=state.buildings.some(b=>b.type==='cctv'&&b.cfg?.Anal==='Track Mode (+3🪙)');
  if(analCCTV)s.safety.health=Math.min(100,s.safety.health+5);

  const weights={power:0.2,water:0.2,transport:0.15,health:0.2,waste:0.1,safety:0.15};
  let sen=0;Object.entries(weights).forEach(([k,v])=>{sen+=((s[k]?.health||50)*v);});
  state.sim.sentiment=Math.round(sen);

  state.sim.pop=Math.min(2000,Math.round(500+state.sim.time*0.01));
}

let _crisisPhase=0;
function checkCrises(){
  const t=state.sim.time;
  if(t>1800&&_crisisPhase===0&&!state.sim.crisis){_crisisPhase=1;triggerCrisis('heatwave');}
  if(t>5400&&_crisisPhase===1&&!state.sim.crisis){_crisisPhase=2;triggerCrisis('flood');}
  if(t>10800&&_crisisPhase===2&&!state.sim.crisis){_crisisPhase=3;triggerCrisis('storm');}
}
function triggerCrisis(type){
  state.sim.crisis={type,time:state.sim.time,tl:300,resolved:false};
  const msgs={heatwave:'🔥 Heatwave! Power +40%!',flood:'🌊 Flood! Roads blocked!',storm:'⛈️ Storm! Drones grounded!'};
  logEvt(msgs[type]||'⚠️ Crisis!');
}
function resolveCrisis(type){
  if(!state.sim.crisis||state.sim.crisis.type!==type)return false;
  state.sim.crisis.resolved=true;state.sim.crisesDone++;state.sim.crisis=null;return true;
}
function logEvt(m){state.sim.eventLog.unshift({m,t:state.sim.time});if(state.sim.eventLog.length>30)state.sim.eventLog.pop();}

function endSim(){calcStars();}
function calcStars(){
  let s=0;
  if(state.buildings.length>=6)s++;
  if(state.graph.edges.length>=5)s++;
  if(state.hilt.completed>=3)s++;
  if(state.sim.crisesDone>=2)s++;
  state.score.stars=s;
}

function minMet(){
  return SYS.every(s=>sysBlds(s).length>0)&&cntType('road')>=3&&state.tokens.spent>=25;
}

function updateConfig(id,sl,k,v){
  const b=bldById(id);if(b&&b.cfg)b.cfg[sl]=v;
}

function addEdge(from,to,rel){
  if(state.graph.edges.some(e=>e.from===from&&e.to===to))return false;
  state.graph.edges.push({from,to,rel});return true;
}

// ── Save/Load ──
function save(){
  try{localStorage.setItem('aicity-p3',JSON.stringify({
    blds:state.buildings.map(b=>({id:b.id,type:b.type,row:b.row,col:b.col,cfg:b.cfg,eff:b.eff})),
    con:state.connections,sp:state.tokens.spent,
    sc:[...state.scanned],hr:state.hazardResults,
    hz:state.hazards,hf:state.hazFound,hc:state.hazCleared,
    ge:state.graph.edges,rm:state.routeMetrics,ph:state.phase,
    sn:state.scenarios,hc2:state.hilt.completed,
    ts:Date.now()
  }));}catch(e){}
}
function loadSave(){
  try{
    const d=JSON.parse(localStorage.getItem('aicity-p3'));
    if(!d||Date.now()-d.ts>7200000)return false;
    d.blds.forEach(b=>{if(BLD[b.type]){state.buildings.push({...b,cfg:b.cfg||{}});state.grid[b.row][b.col]='building';}});
    state.idC=(d.blds.reduce((m,b)=>Math.max(m,b.id),0)||0)+1;
    state.connections=d.con||[];state.tokens.spent=d.sp||0;
    (d.sc||[]).forEach(s=>state.scanned.add(s));state.hazardResults=d.hr||{};
    state.hazards=d.hz||[];if(state.hazards.length===0)placeHazards();
    state.hazFound=d.hf||0;state.hazCleared=d.hc||0;
    state.graph.edges=d.ge||[];state.routeMetrics=d.rm||[];state.phase=d.ph||'design';
    state.seeded=d.sd||false;
    state.scenarios=d.sn||{traffic:false,power:false,waste:false,bus:false,drone:false,water:false};
    state.hilt.completed=d.hc2||0;
    return true;
  }catch(e){return false;}
}
function clearSave(){try{localStorage.removeItem('aicity-p3');}catch(e){}}

return{
  G,BUDGET,SYS,BLD,SLD,HAZ,
    get state() { return state; },initState,canPlace,place,removeBld,
  scanTile,scanArea,beginRem,completeRem,
  buildRoadGraph,bfs,findRoutes,
  minMet,updateConfig,addEdge,
  initSim,tickSim,resolveCrisis,endSim,
  quickStart,
  relocateBuilding,autoConnectBuilding,getNearestBuilding,distanceBetween,findClosestRoadTile,
  save,loadSave,clearSave,
  sysBlds,bldById,bldAt,cntType,isW,isM,ok,logEvt,
};
})();
