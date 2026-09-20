/** knowledge-graph.js — Tutorial, inference, numbered recommendations */
const KnowledgeGraph = (() => {
'use strict';

const RELS = [
  {id:'needs',l:'→ needs →',c:'#38bdf8'},{id:'provides',l:'→ provides →',c:'#22c55e'},
  {id:'consumes',l:'→ consumes →',c:'#ef4444'},{id:'near',l:'→ is near →',c:'#a78bfa'},
  {id:'produces',l:'→ produces →',c:'#eab308'},{id:'reduces',l:'→ reduces →',c:'#f87171'},
  {id:'depends_on',l:'→ depends on →',c:'#c084fc'},
];
const MIN_EDGES = 10;
const TUT = {step:0,edges:[],inferredEdges:[],suggests:[],accepted:0,selSrc:null,selTgt:null,done:false,sugIdx:0};

function getStep(n){
  const S=[
    {label:'🧠 AI Found Connections',msg:'The AI has analysed your city and discovered how some buildings are connected.'},
    {label:'🗺️ City Knowledge Graph',msg:'Here are all the relationships the AI found between your buildings.'},
    {label:'🤖 AI Learned Patterns',msg:'The AI studied '+(TUT.edges.length||15)+' relationships and discovered patterns across 6 city systems.'},
    {label:'🔗 Build Your Own Graph',msg:'Tap two buildings, then pick a relationship. Create <b>'+MIN_EDGES+' connections</b> so the AI can learn more!'},
    {label:'✅ Knowledge Graph Complete!',msg:'Your knowledge graph is complete. The AI will now use it to find improvements.'},
    {label:'💡 AI Recommendations',msg:'Based on the knowledge graph, here are my suggestions for your city:'},
    {label:'🎉 Finished!',msg:'You taught the AI about your city! The knowledge graph helps optimise everything.'},
  ];
  return S[n]||{label:'',msg:''};
}

function startTutorial(){Object.assign(TUT,{step:0,edges:[],inferredEdges:[],suggests:[],accepted:0,selSrc:null,selTgt:null,done:false,sugIdx:0});}
function advanceStep(){TUT.step++;}
function addEdge(f,t,r){if(TUT.edges.some(e=>e.from===f&&e.to===t))return false;TUT.edges.push({from:f,to:t,rel:r});return true;}

// ── Recommendation Generator (guarded against already-done suggestions) ──
function generateSuggests(){
  const st=Game.state;const bld=st.buildings;const s=[];
  function first(type){return bld.filter(x=>x.type===type)[0];}
  function count(type){return bld.filter(x=>x.type===type).length;}
  function near(t1,t2,dist){return bld.some(x=>x.type===t1&&bld.some(y=>y.type===t2&&Math.abs(x.row-y.row)+Math.abs(x.col-y.col)<=dist));}
  function at(row,col){return bld.some(b=>b.row===row&&b.col===col);}
  function placeIfFree(type,row,col){if(!at(row,col))return Game.place(type,row,col);return null;}
  function adjRoad(row,col){return bld.some(r=>r.type==='road'&&Math.abs(r.row-row)+Math.abs(r.col-col)<=1);}

  const dc=first('data');

  // 1. Battery backup: only if Data Center exists AND no battery within 2 tiles
  if(dc&&!near('bat','data',2)){
    const eG=bld.filter(x=>Game.BLD[x.type]?.p?.e).reduce((t,x)=>t+(Game.BLD[x.type].p.e||0),0);
    const need=8;const cloudy=Math.round(eG*0.6);
    if(cloudy<need){
      s.push({t:'🔋 Add Battery Backup',d:'Solar generates '+eG+' energy/tick. Data Center: '+need+'/tick. Cloudy days: '+cloudy+' vs '+need+' needed = deficit of '+(need-cloudy)+'. A Battery stores 10 extra energy for cloudy days.',l:'Power Grid (L10)',a:()=>{const r=Game.findClosestRoadTile(dc.row+2,dc.col);if(r){placeIfFree('bat',r[0],r[1]);return true;}return false;}});
    }
  }

  // 2. Cooling: only if Data Center still on Air cooling
  if(dc&&(!dc.cfg||dc.cfg.Cool==='Air')){
    s.push({t:'❄️ Upgrade Data Center Cooling',d:'Current: Air cooling uses full 8 energy/tick. Switch to <b>Liquid (+3🪙)</b>: uses 6 energy/tick (saves 2). <b>Green (+5🪙)</b>: uses 4 energy/tick (saves 4). Go to the Data Center config panel to upgrade.',l:'Power Grid (L10)',a:()=>{dc.cfg.Cool='Liquid';Game.save();return true;}});
  }

  // 3. Solar panel upgrade
  const solarB=first('solar');
  if(solarB&&(!solarB.cfg||solarB.cfg.Eff==='Standard')){
    s.push({t:'☀️ Upgrade Solar Panels',d:'Current: Standard panels generate 5 energy/tick. <b>Efficient (+5🪙)</b> panels: 7 energy/tick (+40% output). Upgrade in the Solar Farm config panel.',l:'Power Grid (L10)',a:()=>{solarB.cfg.Eff='Efficient (+5🪙)';Game.save();return true;}});
  }

  // 4. Bus stop distance + AI scheduling
  const buses=bld.filter(x=>x.type==='bus');
  const smartBus=buses.some(b=>b.cfg?.Sched==='AI Optimised (+3🪙)');
  if(buses.length>0&&!smartBus){
    s.push({t:'🚌 Install AI Bus Scheduling',d:'Manual scheduling: avg wait 15 min. <b>AI Optimised (+3🪙)</b>: 12 min (-20% wait time). Upgrade in any Bus Stop config panel.',l:'Bus Scheduling (L7)',a:()=>{buses[0].cfg.Sched='AI Optimised (+3🪙)';Game.save();return true;}});
  }
  if(buses.length>=2){
    const d=Math.abs(buses[0].row-buses[1].row)+Math.abs(buses[0].col-buses[1].col);
    if(d>6){
      const saved=Math.round((d-5)*1.8);
      s.push({t:'🚏 Optimize Bus Stops',d:'Current distance: '+d+' tiles. Optimal: 5 tiles. Moving stop #2 reduces avg commute time by ~'+saved+'%. Wait times improve from '+(10+d)+'min to '+(10+5)+'min.',l:'Bus Scheduling (L7)',a:()=>{const nr=Math.min(Math.max(buses[1].row-2,2),28);const nc=Math.min(Math.max(buses[1].col-2,2),28);return Game.relocateBuilding(buses[1].id,nr,nc);}});
    }
  }

  // 4. Green space near Data Center: only if no green space within 3 tiles
  if(dc&&!near('green','data',3)){
    s.push({t:'🌳 Add Green Space near Data Center',d:'Nearest Green Space: >3 tiles away. Citizens within 3 tiles of Data Center: 65% sentiment (vs 80% baseline). Adding Green Space within 2 tiles: +8% → 73%.',l:'Sentiment Analysis (L16)',a:()=>{const r=Game.findClosestRoadTile(dc.row+2,dc.col-2);if(r){placeIfFree('green',r[0],r[1]);return true;}return false;}});
  }

  // 5. Recycling road access: only if a recycling center lacks adjacent road
  const recOff=bld.filter(x=>x.type==='recycle'&&!adjRoad(x.row,x.col));
  if(recOff.length>0){
    const rr=recOff[0];
    s.push({t:'♻️ Connect Recycling to Roads',d:'Without road access: waste trucks can\'t collect — 40% overflow during peak days. Adding 1 road tile: restores 100% collection. Cost: 2 tokens.',l:'Delivery Loops (L6)',a:()=>{const rt=Game.findClosestRoadTile(rr.row,rr.col);if(rt){placeIfFree('road',rr.row,rr.col);return true;}return false;}});
  }

  // 6. Water near hospital: only if hospital exists AND nearest water is far
  const hosp=first('hosp');
  const waters=bld.filter(x=>x.type==='water');
  if(hosp&&waters.length>0){
    const dist=Math.min(...waters.map(w=>Math.abs(hosp.row-w.row)+Math.abs(hosp.col-w.col)));
    if(dist>5){
      const pressure=Math.round(100-dist*3);
      s.push({t:'💧 Add Water Tower near Hospital',d:'Nearest Water Tower: '+dist+' tiles away. Water pressure at Hospital: ~'+pressure+'%. Ideal: >90% at ≤4 tiles. Adding a closer tower restores pressure to 90% (+'+(90-pressure)+'%).',l:'Water Supply (L9)',a:()=>{const r=Game.findClosestRoadTile(hosp.row+1,hosp.col-1);if(r){placeIfFree('water',r[0],r[1]);return true;}return false;}});
    }
  }

  // 7. CCTV near school: only if no CCTV within 5 tiles
  const school=first('school');
  if(school&&!near('cctv','school',5)){
    s.push({t:'📹 Add CCTV near School',d:'Current CCTV coverage: no camera within 5 tiles of School. Adding 1 CCTV covers a 5-tile radius. Estimated 25% reduction in safety incidents in the school zone.',l:'AI Monitoring (L11)',a:()=>{const r=Game.findClosestRoadTile(school.row-2,school.col+2);if(r){placeIfFree('cctv',r[0],r[1]);return true;}return false;}});
  }

  // 8. Bus stop distance optimization (still relevant if stops are far apart)
  if(buses.length>=2){
    const d=Math.abs(buses[0].row-buses[1].row)+Math.abs(buses[0].col-buses[1].col);
    if(d>6){
      const saved=Math.round((d-5)*1.8);
      s.push({t:'🚏 Re-route Bus Stops',d:'Current distance: '+d+' tiles between stops. Optimal: 5 tiles. Moving a stop reduces avg commute by ~'+saved+'%. Wait times: '+(10+d)+'min → '+(10+5)+'min.',l:'Bus Scheduling (L7)',a:()=>{return true;}});
    }
  }

  // 9. Traffic light sensor upgrade
  const tls=bld.filter(x=>x.type==='traffic');
  if(tls.length>0&&!tls.some(t=>t.cfg?.Flow==='AI Flow (+4🪙)')){
    s.push({t:'🚦 AI Traffic Sensors',d:'Standard sensors manage fixed timing. <b>AI Flow (+4🪙)</b>: adaptive signals reduce congestion by 20%. Upgrade in any Traffic Light config panel.',l:'Traffic Optimisation (L12)',a:()=>{tls[0].cfg.Flow='AI Flow (+4🪙)';Game.save();return true;}});
  }

  // 10. CCTV AI analytics upgrade
  const cctvs=bld.filter(x=>x.type==='cctv');
  if(cctvs.length>0&&!cctvs.some(c=>c.cfg?.Anal==='Track Mode (+3🪙)')){
    s.push({t:'📹 AI CCTV Analytics',d:'Standard CCTV: monitors 1-tile radius. <b>Track Mode (+3🪙)</b>: expands range to 3 tiles and adds person re-identification. Upgrade in any CCTV config panel.',l:'AI Monitoring (L11)',a:()=>{cctvs[0].cfg.Anal='Track Mode (+3🪙)';Game.save();return true;}});
  }

  // 11. Waste route: only if 3+ collection points
  const cols=bld.filter(x=>x.type==='collect');
  if(cols.length>2){
    s.push({t:'🚛 Optimise Waste Route',d:'Current route: '+cols.length+' stops. AI proposes '+(cols.length-1)+' optimized stops: same coverage, 12% shorter path, -4 token/tick fuel cost.',l:'Delivery Loops (L6)',a:()=>true});
  }

  return s;
}

// ── Pre-computed discoveries ──
function getDiscoveries(){
  return [
    '💡 Solar Farm → provides → Water Tower + Hospital: Solar powers the entire water system and medical centre.',
    '💡 Water Tower → provides → Hospital + School: Hospitals consume 60% of water during operations.',
    '💡 Data Center → consumes → Solar: The Data Center uses 8 energy/tick — over half of solar\'s 15 output.',
    '💡 Bus Stop → near → Hospital + School: Transit corridor connects the two most-visited buildings.',
    '💡 Recycling Center → consumes → Collection Points: Waste flows from collection through recycling.',
    '💡 Battery → near → Hospital + Data Center: Backup power for both critical infrastructure.',
    '💡 CCTV → near → Town Hall + School: Surveillance covers civic and educational zones.',
    '💡 Emergency Station → near → Hospital + Depot: Emergency response within 3 minutes of all zones.',
    '💡 Water → 7 buildings total: Most connected resource in the city — 45% of all utility relationships.'
  ];
}

function getTutorial(){return TUT;}
function handleNodeClick(nid){
  if(TUT.step<3)return false;
  if(!TUT.selSrc){TUT.selSrc=nid;return true;}
  if(!TUT.selTgt&&nid!==TUT.selSrc){TUT.selTgt=nid;return true;}
  TUT.selSrc=null;TUT.selTgt=null;return false;}
function relClick(rel){
  if(!TUT.selSrc||!TUT.selTgt)return false;
  const ok=addEdge(TUT.selSrc,TUT.selTgt,rel);TUT.selSrc=null;TUT.selTgt=null;return ok;}

return{getStep,startTutorial,advanceStep,addEdge,generateSuggests,getDiscoveries,
  handleNodeClick,relClick,getTutorial,RELS,MIN_EDGES};
})();
