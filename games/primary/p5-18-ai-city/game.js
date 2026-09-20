/**
 * game.js — AI City Architect core logic
 * P5-P6: 15×15, 6 systems, 20+ buildings, economics, HILT, cascading
 */
const Game = (() => {
  'use strict';

  const GRID = 15;
  const BUDGET = 150;
  const HAZARDS = 12;
  const DRILLS = 3;

  const SYSTEMS = ['power','water','transport','health','waste','governance'];

  const BUILDINGS = {
    solar:{sys:'power',label:'Solar Farm',emoji:'☀️',cost:8,provides:{energy:5}},
    wind:{sys:'power',label:'Wind Turbine',emoji:'🌬️',cost:6,provides:{energy:3}},
    hydro:{sys:'power',label:'Hydro Plant',emoji:'🌊',cost:12,provides:{energy:8}},
    battery:{sys:'power',label:'Battery Storage',emoji:'🔋',cost:10,storage:20,sliders:['Capacity']},
    water:{sys:'water',label:'Water Tower',emoji:'💧',cost:8,provides:{water:10}},
    datacenter:{sys:'power',label:'AI Data Center',emoji:'🖥️',cost:20,consumes:{energy:8},compute:100,sliders:['Cooling']},
    cooling:{sys:'power',label:'Cooling System',emoji:'❄️',cost:5,sliders:['CoolType']},
    bus:{sys:'transport',label:'Bus Stop',emoji:'🚏',cost:4,sliders:['Freq']},
    road:{sys:'transport',label:'Road',emoji:'🛣️',cost:2},
    depot:{sys:'transport',label:'Depot',emoji:'🏭',cost:6},
    drone:{sys:'transport',label:'Drone Pad',emoji:'🛸',cost:8,script:true},
    traffic:{sys:'transport',label:'Traffic Light',emoji:'🚦',cost:3,sliders:['Green']},
    bike:{sys:'transport',label:'Bike Lane',emoji:'🚲',cost:2},
    hospital:{sys:'health',label:'Hospital',emoji:'🏥',cost:20,capacity:50,sliders:['Staff'],buildTime:5},
    clinic:{sys:'health',label:'Clinic',emoji:'🩺',cost:8,capacity:10},
    green:{sys:'health',label:'Green Space',emoji:'🌳',cost:3,sentiment:5},
    air:{sys:'health',label:'Air Purifier',emoji:'💨',cost:5,pollution:10},
    recycling:{sys:'waste',label:'Recycling Ctr',emoji:'♻️',cost:6,sliders:['Route']},
    collection:{sys:'waste',label:'Collection Pt',emoji:'🗑️',cost:4},
    compost:{sys:'waste',label:'Compost',emoji:'🟫',cost:5},
    incinerator:{sys:'waste',label:'Incinerator',emoji:'🔥',cost:8,pollution:-5},
    town:{sys:'governance',label:'Town Hall',emoji:'🏛️',cost:12,sliders:['Tax']},
    auditor:{sys:'governance',label:'AI Auditor',emoji:'📋',cost:10},
    school:{sys:'governance',label:'School',emoji:'📚',cost:8},
    emergency:{sys:'governance',label:'Emergency Station',emoji:'🚒',cost:6},
  };

  const SLIDERS = {
    Freq:{label:'Frequency',min:5,max:30,default:15,unit:'min'},
    Green:{label:'Green Light',min:10,max:60,default:30,unit:'s'},
    Staff:{label:'Staff',min:1,max:5,default:3},
    Route:{label:'Route',min:3,max:10,default:5,unit:'stops'},
    Cooling:{label:'Cooling',options:['Air','Liquid','Green'],default:'Air'},
    CoolType:{label:'Type',options:['Air','Liquid','Green'],default:'Air'},
    Capacity:{label:'Capacity',min:10,max:50,default:20,unit:'MW'},
    Tax:{label:'Tax Rate',min:10,max:30,default:20,unit:'%'},
  };

  // Terrain
  const RIVER = [[0,2],[0,3],[1,3],[1,4],[2,4],[3,4],[4,4],[4,5],[5,5],[6,5],[7,5]];
  const MTN = [[0,0],[0,1],[0,2],[1,0],[1,1],[2,0]];

  let state, rand;

  function seed(s){let n=s||Date.now();return()=>{n=(n*1664525+1013904223)&0xFFFFFFFF;return(n>>>0)/0xFFFFFFFF;}}
  function clamp(v,l,h){return Math.max(l,Math.min(h,v))}
  function pick(a){return a[Math.floor(rand()*a.length)]}
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function isWater(r,c){return RIVER.some(([rr,cc])=>rr===r&&cc===c)}
  function isMtn(r,c){return MTN.some(([rr,cc])=>rr===r&&cc===c)}
  function ok(r,c){return r>=0&&r<GRID&&c>=0&&c<GRID}
  function bldById(i){return state.buildings.find(b=>b.id===i)}
  function bldAt(r,c){return state.buildings.find(b=>b.row===r&&b.col===c)}
  function countType(t){return state.buildings.filter(b=>b.type===t).length}
  function sysBlds(s){return state.buildings.filter(b=>BUILDINGS[b.type]?.sys===s)}

  function initState(){
    rand=seed(Date.now());
    state={
      phase:'design',activeLayer:'all',
      grid:Array.from({length:GRID},()=>Array(GRID).fill(null)),
      terrain:Array.from({length:GRID},(_,r)=>Array.from({length:GRID},(_,c)=>isWater(r,c)?'water':isMtn(r,c)?'mountain':'grass')),
      hazards:[],scanned:{},hazardResults:{},drills:DRILLS,
      buildings:[],connections:[],configs:{},scripts:{},idC:0,
      tokens:{budget:BUDGET,spent:0},
      graph:{nodes:[],edges:[],selectedSource:null,selectedTarget:null},
      hilt:{scenarios:[],completed:0},
      economics:{taxRate:20,infraBudget:30,gdp:100,inflation:2,debt:0,approval:75},
      sim:{speed:1,time:0,displayYear:2025,systems:{},agents:[],eventLog:[],cascadeChain:[],crisis:null,crisesEncountered:0,crisesHandled:0,population:1000,sentiment:70},
      score:{stars:0},
      sessionId:Date.now()
    };
    placeHazards();
    initHILT();
    return state;
  }

  function placeHazards(){
    const r2=seed(state.sessionId+1);
    const pos=[];
    for(let r=0;r<GRID;r++)for(let c=0;c<GRID;c++)if(!isWater(r,c)&&!isMtn(r,c))pos.push([r,c]);
    shuffle(pos);
    state.hazards=pos.slice(0,HAZARDS);
  }

  function initHILT(){
    state.hilt.scenarios=[
      {id:'clinic',done:false,title:'Close the Clinic?',
       desc:'AI proposes closing East District Clinic to save 15 tokens/tick. 200 residents affected.',
       choices:[
         {label:'✅ Accept — save tokens',effect:'tokens+15,sentiment-10'},
         {label:'🚫 Override — keep clinic',effect:'tokens-15,sentiment+5'},
         {label:'⚖️ Compromise — mobile clinic',effect:'tokens-7,sentiment-3'},
       ]},
      {id:'equity',done:false,title:'Routing Equity',
       desc:'AI routes 70% of buses through wealthy areas. Other districts wait 30% longer.',
       choices:[
         {label:'🤖 Let AI optimize',effect:'efficiency+10,equity-15'},
         {label:'⚖️ Force equal routing',effect:'efficiency-5,equity+10'},
         {label:'🔄 Partial rebalance',effect:'efficiency-2,equity+5'},
       ]},
      {id:'secondary',done:false,title:'Secondary Jams',
       desc:'AI cleared highway by diverting traffic to residential streets. Residents are angry.',
       choices:[
         {label:'🛣️ Maintain diversion',effect:'highway+20,sentiment-8'},
         {label:'↩️ Revert',effect:'highway-10,emergency+5'},
         {label:'🕐 Smart timing',effect:'highway+5,sentiment-3'},
       ]},
    ];
  }

  function canPlace(type,r,c){
    const d=BUILDINGS[type];
    if(!d)return'Unknown';
    if(!ok(r,c))return'Bounds';
    if(isWater(r,c)||isMtn(r,c))return'Terrain';
    if(bldAt(r,c))return'Occupied';
    if(state.tokens.spent+d.cost>state.tokens.budget)return'Tokens';
    return null;
  }

  function place(type,r,c){
    const e=canPlace(type,r,c);
    if(e)return{error:e};
    const id=state.idC++,d=BUILDINGS[type];
    const b={id,type,row:r,col:c,efficiency:1,config:{}};
    const key=r+','+c;
    if(state.hazardResults[key]==='hazard')b.efficiency=0.5;
    state.buildings.push(b);state.grid[r][c]='building';
    state.tokens.spent+=d.cost;
    if(d.sliders)d.sliders.forEach(s=>{const def=SLIDERS[s];b.config[s]=def.default!==undefined?def.default:def.options?def.options[0]:0;});
    Audio.place();
    return{ok:true,building:b};
  }

  function remove(id){
    const i=state.buildings.findIndex(b=>b.id===id);
    if(i<0)return;
    const b=state.buildings[i],d=BUILDINGS[b.type];
    state.tokens.spent-=d.cost-Math.floor(d.cost*0.6);
    state.grid[b.row][b.col]=null;
    state.buildings.splice(i,1);
    state.connections=state.connections.filter(c=>c.fromId!==id&&c.toId!==id);
    if(state.scripts[id])delete state.scripts[id];
    Audio.click();
  }

  function scanTile(r,c){
    const k=r+','+c;
    if(!ok(r,c)||isWater(r,c)||isMtn(r,c))return{result:'blocked'};
    if(state.scanned[k])return{result:state.hazardResults[k]};
    state.scanned[k]=true;
    const isHaz=state.hazards.some(([hr,hc])=>hr===r&&hc===c);
    if(state.scanTurbo){
      const flip=rand()<0.2;
      state.hazardResults[k]=flip?!isHaz:isHaz;
      Audio.scan();
      return{result:state.hazardResults[k],turbo:true,firstTime:true};
    }else{
      state.hazardResults[k]=isHaz?'hazard':'clear';
      Audio.scan();
      return{result:state.hazardResults[k],firstTime:true};
    }
  }

  function drillTile(r,c){
    if(state.drills<=0)return{error:'No drills'};
    const k=r+','+c;
    state.drills--;
    state.scanned.add(k);
    const isHaz=state.hazards.some(([hr,hc])=>hr===r&&hc===c);
    state.hazardResults[k]=isHaz?'hazard':'clear';
    Audio.correct();
    return{result:state.hazardResults[k]};
  }

  function updateConfig(id,slider,val){
    const b=bldById(id);
    if(b&&b.config)b.config[slider]=val;
  }

  function addConnection(fromId,toId,type){
    if(state.connections.some(c=>c.fromId===fromId&&c.toId===toId&&c.type===type))return false;
    state.connections.push({fromId,toId,type});
    return true;
  }

  function minMet(){
    return SYSTEMS.every(s=>sysBlds(s).length>0)&&state.tokens.spent>=40;
  }

  function setLayer(l){state.activeLayer=l;}

  // ── Graph ──
  function addGraphEdge(from,to,rel){
    if(state.graph.edges.some(e=>e.from===from&&e.to===to))return false;
    state.graph.edges.push({from,to,rel});
    return true;
  }

  function analyzeGraph(){
    const issues=[];
    const energy=sysBlds('power').reduce((s,b)=>(s+(BUILDINGS[b.type]?.provides?.energy||0)),0);
    const consumers=state.buildings.filter(b=>BUILDINGS[b.type]?.consumes?.energy).length;
    if(consumers>0&&energy<consumers*3)issues.push('Energy deficit: Data centers consume more than you generate.');
    const loops=findFeedbackLoops();
    if(loops.length===0)issues.push('No feedback loops found. Try creating a cycle in your graph.');
    if(state.tokens.spent<80)issues.push('Unspent tokens available for AI services.');
    if(issues.length===0)issues.push('City design looks robust. Proceed to simulation.');
    return issues;
  }

  function findFeedbackLoops(){
    const edges=state.graph.edges;
    const cycles=[];
    // Simple cycle detection: check 3-node cycles
    for(let i=0;i<edges.length;i++){
      for(let j=0;j<edges.length;j++){
        if(i===j)continue;
        for(let k=0;k<edges.length;k++){
          if(i===k||j===k)continue;
          if(edges[i].to===edges[j].from&&edges[j].to===edges[k].from&&edges[k].to===edges[i].from){
            cycles.push([edges[i],edges[j],edges[k]]);
          }
        }
      }
    }
    return cycles;
  }

  // ── Economics ──
  function updateEconomics(){
    const e=state.economics;
    // Simple model
    const bCount=state.buildings.length;
    e.gdp=Math.max(50,100+bCount*2-e.inflation);
    e.inflation=Math.max(0,2+Math.floor(bCount/5)-Math.floor(e.taxRate/10));
    e.debt+=Math.floor(e.taxRate*0.5-bCount*0.3);
    if(e.debt<0)e.debt=0;
    e.approval=clamp(75-bCount*1.5+e.inflation*3-e.taxRate*0.5,0,100);
  }

  // ── Sim ──
  function initSim(){
    state.sim.speed=1;state.sim.time=0;state.sim.displayYear=2025;
    state.sim.eventLog=[];state.sim.cascadeChain=[];
    state.sim.crisis=null;state.sim.crisesEncountered=0;state.sim.crisesHandled=0;
    state.sim.systems={};
    SYSTEMS.forEach(s=>{state.sim.systems[s]={health:100,demand:0,supply:0};});
    state.sim.population=1000;state.sim.sentiment=70;
    state.sim.agents.length=0;
    createAgents();
    logEvent('Simulation started');
  }

  function createAgents(){
    const roads=[];
    state.connections.forEach(c=>{
      const f=bldById(c.fromId),t=bldById(c.toId);
      if(f&&t)roads.push({r:f.row,c:f.col},{r:t.row,c:t.col});
    });
    if(roads.length>0){
      state.sim.agents.push({type:'bus',...roads[0],path:roads,progress:0});
    }
    const cits=state.buildings.filter(b=>['hospital','clinic','school','park','recycling'].includes(b.type));
    for(let i=0;i<Math.min(12,cits.length||8);i++){
      const s=cits[i%cits.length]||{row:2+i%10,col:2+i%10};
      state.sim.agents.push({type:'citizen',row:s.row,col:s.col,home:s,visible:false,color:['#fb923c','#60a5fa','#4ade80','#c084fc','#facc15','#f472b6','#34d399','#38bdf8','#f87171','#a78bfa','#fbbf24','#34d399'][i]});
    }
    // Drones
    const drones=sysBlds('transport').filter(b=>b.type==='drone');
    drones.forEach((d,i)=>{
      state.sim.agents.push({type:'drone',row:d.row,col:d.col,id:d.id,progress:0});
    });
  }

  let crisisPhase=0;

  function tickSim(dt){
    const sp=state.sim.speed;
    if(sp===1000000){
      // 1M×: skip agent rendering, advance time fast
      state.sim.time+=1000;
      state.sim.displayYear=2025+Math.floor(state.sim.time/86400);
      state.sim.population=Math.max(1000,Math.round(1000+state.sim.time*0.01));
    }else{
      const ticks=Math.floor(dt/16.67)*(sp===1000?10:sp);
      if(ticks<1)return;
      state.sim.time+=ticks;
      state.sim.displayYear=2025+Math.floor(state.sim.time/86400);
      // Agent movement
      state.sim.agents.forEach(a=>{
        if(a.type==='bus'&&a.path?.length>0){
          a.progress+=0.005*sp;
          if(a.progress>=a.path.length)a.progress=0;
          const idx=Math.floor(a.progress);
          if(idx<a.path.length){a.row=a.path[idx].r;a.col=a.path[idx].c;}
        }
        if(a.type==='citizen'&&rand()<0.003*sp)a.visible=!a.visible;
        if(a.type==='drone'&&state.buildings.length>0){
          a.progress+=0.003*sp;
          if(a.progress>=state.buildings.length)a.progress=0;
          const idx=Math.floor(a.progress);
          const target=state.buildings[idx];
          if(target){a.row=target.row;a.col=target.col;}
        }
      });
      // Population growth
      state.sim.population=Math.min(5000,Math.round(1000+state.sim.time*0.01));
    }

    // Systems update
    updateSimSystems();
    checkCrises();
    updateEconomics();
  }

  function updateSimSystems(){
    const sys=state.sim.systems;
    sys.power.supply=sysBlds('power').reduce((s,b)=>(s+(BUILDINGS[b.type]?.provides?.energy||0)*b.efficiency),0);
    sys.power.demand=state.buildings.length*0.5+(sysBlds('power').some(b=>b.type==='datacenter')?8:0);
    sys.power.health=clamp(100*sys.power.supply/(sys.power.demand||1),0,100);

    sys.water.supply=sysBlds('water').reduce((s,b)=>(s+(BUILDINGS[b.type]?.provides?.water||0)*b.efficiency),0);
    sys.water.demand=state.buildings.length*0.8;
    sys.water.health=clamp(100*sys.water.supply/(sys.water.demand||1),0,100);

    const trans=sysBlds('transport');
    sys.transport.health=trans.length>0?clamp(70-trans.length*2,30,100):20;

    const health=sysBlds('health');
    const cap=health.reduce((s,b)=>(s+(BUILDINGS[b.type]?.capacity||0)),0);
    sys.health.health=clamp(100*cap/(state.sim.population*0.05||1),0,100);

    const waste=sysBlds('waste');
    sys.waste.health=waste.length>0?clamp(80-waste.length*3,20,100):10;

    const gov=sysBlds('governance');
    sys.governance.health=gov.length>0?clamp(60+gov.length*5,0,100):20;

    // Sentiment
    state.sim.sentiment=Math.round(
      Object.values(sys).reduce((s,x)=>s+x.health,0)/SYSTEMS.length
    );
  }

  function checkCrises(){
    const t=state.sim.time;
    // Event 1: Heatwave + Cyber at tick 1800
    if(t>1800&&crisisPhase===0&&!state.sim.crisis){
      crisisPhase=1;
      triggerCrisis('heatwave_cyber');
    }
    // Event 2: Flood + Supply Chain at tick 5400
    if(t>5400&&crisisPhase===1&&!state.sim.crisis){
      crisisPhase=2;
      triggerCrisis('flood');
    }
    // Event 3: Economic at tick 10800
    if(t>10800&&crisisPhase===2&&!state.sim.crisis){
      crisisPhase=3;
      triggerCrisis('economic');
    }
    // Event 4: Population Surge at tick 18000
    if(t>18000&&crisisPhase===3&&!state.sim.crisis){
      crisisPhase=4;
      triggerCrisis('surge');
    }
  }

  function triggerCrisis(type){
    state.sim.crisis={type,startTime:state.sim.time,timeLimit:300,resolved:false};
    state.sim.crisesEncountered++;
    const msgs={heatwave_cyber:'🔥 Cyber Heatwave! Power+50%, choose load-shedding!',flood:'🌊 Flood+Supply Freeze! Roads blocked!',economic:'📉 Economic Shock! GDP dropping! Adjust policies!',surge:'👥 Population Surge! 5× influx! Build emergency facilities!'};
    logEvent(msgs[type]||'⚠️ Crisis!');
    Audio.crisis();
  }

  function resolveCrisis(type){
    if(!state.sim.crisis||state.sim.crisis.type!==type)return false;
    state.sim.crisis.resolved=true;
    state.sim.crisesHandled++;
    logEvent(`✅ ${type} resolved!`);
    state.sim.crisis=null;
    Audio.complete();
    return true;
  }

  function logEvent(msg){
    state.sim.eventLog.unshift({msg,time:state.sim.time});
    if(state.sim.eventLog.length>30)state.sim.eventLog.pop();
  }

  function endSim(){calcStars();}

  function calcStars(){
    let s=0;
    if(minMet())s++;
    if(state.graph.edges.length>=10)s++;
    if(state.hilt.completed>=3)s++;
    if(state.sim.crisesHandled>=4)s++;
    state.score.stars=s;
  }

  function save(){
    try{localStorage.setItem('aicity-p5',JSON.stringify({
      buildings:state.buildings.map(b=>({id:b.id,type:b.type,row:b.row,col:b.col,config:b.config,efficiency:b.efficiency})),
      connections:state.connections,spent:state.tokens.spent,drills:state.drills,
      scanned:[...state.scanned],hazardResults:state.hazardResults,
      graphEdges:state.graph.edges,scripts:state.scripts,
      phase:state.phase,hilt:state.hilt,
      timestamp:Date.now()
    }));}catch(e){}
  }

  function loadSave(){
    try{
      const d=JSON.parse(localStorage.getItem('aicity-p5'));
      if(!d||Date.now()-d.timestamp>7200000)return false;
      d.buildings.forEach(b=>{if(BUILDINGS[b.type]){state.buildings.push({...b,config:b.config||{}});state.grid[b.row][b.col]='building';}});
      state.idC=(d.buildings.reduce((m,b)=>Math.max(m,b.id),0)||0)+1;
      state.connections=d.connections||[];state.tokens.spent=d.spent||0;state.drills=d.drills??DRILLS;
      (d.scanned||[]).forEach(s=>state.scanned.add(s));state.hazardResults=d.hazardResults||{};
      state.graph.edges=d.graphEdges||[];state.scripts=d.scripts||{};
      state.phase=d.phase||'design';
      if(d.hilt)state.hilt=Object.assign(state.hilt,d.hilt);
      return true;
    }catch(e){return false;}
  }
  function clearSave(){try{localStorage.removeItem('aicity-p5');}catch(e){}}

  return {
    GRID,BUDGET,SYSTEMS,BUILDINGS,SLIDERS,
    get state() { return state; },initState,canPlace,place,remove,scanTile,drillTile,updateConfig,
    addConnection,minMet,setLayer,
    addGraphEdge,analyzeGraph,findFeedbackLoops,
    updateEconomics,
    initSim,tickSim,triggerCrisis,resolveCrisis,
    endSim,save,loadSave,clearSave,
    sysBlds,bldById,bldAt,countType,logEvent,
  };
})();
