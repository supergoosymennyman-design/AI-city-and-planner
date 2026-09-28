(function () {
  'use strict';
  const req = typeof require === 'function' ? require : null;
  const G = req ? req('../game.js') : window.WorkshopGame;
  const Batch = req ? req('./batch-run.js') : window.WorkshopBatchRun;
  const Learned = req ? req('./learned-state.js') : window.WorkshopLearnedState;
  const Library=req?req('./model-library.js'):window.WorkshopModelLibrary;
  const Models=req?req('../assets/library/models.js'):window.WorkshopLibraryModels;
  const destinations = ['cardboard','glass','metal','paper','plastic','trash','human-check'];
  const clone = x => JSON.parse(JSON.stringify(x));
  function starter() {
    const pieces = [
      {id:'intake',type:'feeder',name:'City intake',cityIntake:'city',items:[],once:true,rate:30,x:40,y:120},
      {id:'scan',type:'track',x:310,y:120},
      {id:'model',type:'sense',name:'Photo model',recyclingModel:true,senseId:'cam',mode:'spot',watchPiece:'scan',brainId:'knn',k:3,sure:.2,learning:{},x:310,y:340},
      {id:'gate',type:'gate',mode:'sorter',exits:5,decisionMode:'item',fallbackExit:5,x:600,y:120},
    ];
    const snaps = [{from:{piece:'intake',end:'out'},to:{piece:'scan',end:'in'}},{from:{piece:'scan',end:'out'},to:{piece:'gate',end:'in'}}], wires=[];
    ['cardboard','metal','plastic','glass','human-check'].forEach((material,i)=>{
      pieces.push({id:'bin-'+material,type:'bin',name:material,cityDestination:material,x:930,y:40+i*180});
      snaps.push({from:{piece:'gate',end:'exit'+(i+1)},to:{piece:'bin-'+material,end:'in'}});
      if(i<4){pieces.push({id:'filter-'+material,type:'filter',mode:'is',label:material,x:600,y:400+i*130});
        wires.push({from:{block:'model',port:'result'},to:{block:'filter-'+material,port:'in'}},{from:{block:'filter-'+material,port:'out'},to:{block:'gate',port:'switch'+(i+1)}});}
    });
    const positions={intake:[.08,.55],scan:[.25,.55],model:[.25,.28],gate:[.58,.55]};
    pieces.forEach(p=>{const i=['cardboard','metal','plastic','glass','human-check'].indexOf(p.cityDestination);const pos=positions[p.id]||(i>=0?[.86,.12+i*.18]:[.42,.12+['cardboard','metal','plastic','glass'].indexOf(p.label)*.20]);[p.fx,p.fy]=pos;});
    return {pieces,snaps,wires};
  }
  function validate(draft) {
    const errors=[], table=draft?.table;
    if(!table?.pieces) return {ok:false,errors:['Missing machine graph.']};
    let flat;
    try { flat=G.RunSession.compile(table,draft.seed,G.compileHooks()); } catch(e){return {ok:false,errors:[e.message]};}
    const inputs=flat.pieces.filter(p=>p.cityIntake===true||p.cityIntake==='city'), outputs={};
    if(inputs.length!==1||inputs[0].type!=='feeder')errors.push('Mark exactly one Feeder as the City intake.');
    const unsupported=new Set(['camera','microphone','pose','cloud','send','speaker','noisemaker','timer','splitter','button']);
    for(const p of flat.pieces){
      const title=p.name||p.id;
      if(unsupported.has(p.type)&&!/__lever[12]$/.test(p.id))errors.push(`${title}: live devices, interactive triggers and external services cannot run in City.`);
      if(p.privateData||p.privateDependency)errors.push(`${title}: session-only learning is unavailable in City. Reteach using public library examples.`);
      if(p.type==='feeder'&&!p.cityIntake&&p.contents?.length&&!p.once)errors.push(`${title}: make this additional input finite before saving.`);
      if(p.libraryData)errors.push(`${title}: place the saved model in a Model block; library file feeds are not supported in City.`);
      if(p.type==='sense'){
        if((p.mode||'room')==='room')errors.push(`${title}: use a belt Model, not a live room Model.`);
        if(p.libraryModel){try{Library.validate(p.libraryModel,G.BRAIN_REGISTRY,Models.versions);}catch(e){errors.push(`${title}: ${e.message}`);}if(!p.libraryModel.state)errors.push(`${title}: model data is unavailable.`);}
        else if(G.SENSE_REGISTRY[p.senseId]?.trainable) {
          const bank=p.learning?.[p.senseId]?.brain;
          if(!bank||!Object.values(bank.shelves||{}).some(a=>a.length))errors.push(`${title}: teach this Model before saving the sorter.`);
          if(bank&&Object.values(bank.shelves||{}).some(a=>a.some(ex=>!Array.isArray(ex.vec)||!ex.vec.length||!ex.vec.every(Number.isFinite))))errors.push(`${title}: model examples are unavailable. Reopen its teaching controls.`);
          if(bank?.waiting?.length)errors.push(`${title}: wait for the public examples to load.`);
        }
      }
      if(p.type==='bin'){
        if(!destinations.includes(p.cityDestination))errors.push(`${title}: choose a City material destination.`);
        else outputs[p.id]=p.cityDestination;
      }
    }
    if(!Object.keys(outputs).length)errors.push('Connect at least one destination Bin.');
    try {const s=G.RunSession.createSession({authoredTable:table,seed:draft.seed,adapters:G.RUN_ADAPTERS});G.RunSession.layoutFor(s,G.compileHooks());G.RunSession.begin(s);G.RunSession.cancel(s);}catch(e){errors.push(e.message);}
    if(inputs[0]&&!flat.snaps.some(s=>s.from.piece===inputs[0].id))errors.push('Connect the City intake to the machine.');
    return {ok:!errors.length,errors,input:inputs[0]?.id,outputs};
  }
  function snapshot(draft) {
    const safe=G.privateProject(clone(draft)), check=validate(safe);
    if(!check.ok)throw Error(check.errors.join('\n'));
    return {...safe,version:1,kind:'recycling-machine',id:'recycling:'+safe.sourceMachineId,input:check.input,outputs:check.outputs};
  }
  async function run(machine, items, {yieldTask=()=>new Promise(r=>setTimeout(r,0)),limits}={}) {
    const frozen=clone(machine), rows=clone(items);
    const check=validate(frozen);if(!check.ok)throw Error(check.errors.join('\n'));
    const mark=pieces=>pieces.forEach(p=>{if(p.cityIntake===true||p.cityIntake==='city'){p.once=true;delete p.dataset;delete p.table;}if(p.def)mark(p.def.pieces);});mark(frozen.table.pieces);
    const hooks=G.compileHooks();
    const original=hooks.feederContents;
    hooks.feederContents=p=>p.id===frozen.input?rows.map((row,i)=>({label:'',value:1,data:{kind:'image',preprocessing:Library.PHOTO_FEATURES,vec:Array.isArray(row.vector)?G.unitVec(row.vector):null,source:{collection:'city-observations',item:String(i)}}})):original(p);
    const batch=Batch.create({table:frozen.table,seed:frozen.seed,adapters:G.RUN_ADAPTERS,hooks,assetsReady:()=>true,limits});
    try {
      let status;
      do {
        status=batch.chunk();
        for(const request of status.requests||[]){
          try{if(request.kind!=='train')throw Error('Unavailable dependency');await Learned.prepare(request.payload.brain,request.payload.learner,request.payload.dials);batch.settle(request.id,{ok:true});}
          catch(e){batch.settle(request.id,{ok:false,code:'model-unavailable'});}
        }
        if(['running','waiting','preparing'].includes(status.status))await yieldTask();
      }while(['running','waiting','preparing'].includes(status.status));
      const evidence=batch.results.snapshot().results;
      return rows.map((row,i)=>{
        const arrivals=evidence.filter(r=>r.itemId===String(i)&&batch.sourceBinding(r)?.blockId===frozen.input);
        const bins=new Set(arrivals.filter(r=>r.terminal==='landed').map(r=>frozen.outputs[r.terminalId]));
        const valid=arrivals.length>0&&arrivals.every(r=>r.terminal==='landed')&&bins.size===1&&!![...bins][0];
        const material=valid?[...bins][0]:'human-check';
        const readings=arrivals.flatMap(r=>(r.evidence?.trail||[]).filter(step=>step.type==='sense'));
        const prediction=arrivals.find(r=>r.outcome?.guess!=null)?.outcome?.guess;
        return {id:row.id,itemId:row.id,truth:row.label||null,decision:prediction||'__abstain',prediction:prediction||null,
          bin:material==='human-check'?material:'bin-'+material,abstained:material==='human-check',confidence:readings.filter(s=>Number.isFinite(s.value)).at(-1)?.value||0,predictions:readings.map(s=>({blockId:s.block,label:s.label||null,unsure:!!s.unsure})),
          routedBy:'machine',abstainReason:valid?(material==='human-check'?'human-check-bin':null):bins.size>1?'conflicting-outputs':status.reason||'missing-destination',evidence:arrivals};
      });
    }finally{batch.clear();}
  }
  const api={starter,validate,snapshot,run,destinations};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.WorkshopRecyclingMachine=api;
})();
