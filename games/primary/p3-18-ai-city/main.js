/** main.js — UI Controller for AI City Architect */
(function(){
'use strict';

let $={};
function q(id){return document.getElementById(id)}
function cache(){
  $={
    intro:q('intro'),game:q('game'),grid:q('grid'),svg:q('grid-svg'),agents:q('agents'),
    palette:q('palette'),token:q('token-num'),
    gridWrap:q('grid-wrap'),
    phaseName:q('phase-name'),phaseHint:q('phase-hint'),phaseDots:document.querySelectorAll('#phase-dots .pd'),
    left:q('left'),right:q('right'),
    infoSec:q('info-sec'),infoBody:q('info-body'),infoActs:q('info-actions'),infoTitle:q('info-title'),
    scenarioSec:q('scenario-sec'),
    reqSec:q('req-sec'),reqBody:q('req-body'),
    cfgPanel:q('cfg-panel'),cfgBody:q('cfg-body'),cfgTitle:q('cfg-title'),cfgClose:q('cfg-close'),
    scanOl:q('scan-ol'),scanLabel:q('scan-label'),scanHaz:q('scan-haz'),
    btnOptimise:q('btn-optimise'),btnBack:q('btn-back-design'),
    btnSim:q('btn-sim'),
    btnTurbo:q('btn-turbo'),btnRemove:q('btn-remove'),btnScanDone:q('btn-scan-done'),
    btnsDesign:q('btns-design'),btnsOptimise:q('btns-optimise'),btnsSim:q('btns-sim'),
    speedBtns:document.querySelectorAll('#speed-btns .spd'),
    simClock:q('sim-clock'),simWeather:q('sim-weather'),btnEndSim:q('btn-end-sim'),
    dashSec:q('dash-sec'),dashCrisis:q('dash-crisis'),crisisDesc:q('crisis-desc'),crisisActs:q('crisis-acts'),
    graphNodes:q('graph-nodes'),graphTray:q('graph-tray'),
    scModal:q('scenario-modal'),scTitle:q('sc-title'),scDesc:q('sc-desc'),scBody:q('sc-body'),scDone:q('sc-done'),
    hiltModal:q('hilt-modal'),hiltTitle:q('hilt-title'),hiltDesc:q('hilt-desc'),hiltBody:q('hilt-body'),hiltDone:q('hilt-done'),
    endScr:q('end-screen'),endStars:q('end-stars'),endBadge:q('end-badge'),endStats:q('end-stats'),endNova:q('end-nova-msg'),
    endRestart:q('end-restart'),endExport:q('end-export'),
    toast:q('toast'),
    novaAv:q('nova-av'),novaBub:q('nova-bub'),novaTxt:q('nova-txt'),novaInp:q('nova-inp'),novaInput:q('nova-input'),novaSend:q('nova-send'),novaDot:q('nova-dot'),
    settingsBtn:q('btn-settings'),settingsScr:q('settings-scr'),sClose:q('s-close'),
    palTitle:q('palette-title'),
    lyrBtns:document.querySelectorAll('.lyr-btn'),
  };
}

// ── State ──
let palType=null,selBldId=null,scanActive=false;
let zoomLevel=1;
let dragRoad=false,dragStart=null,dragLast=null;
let scanTurbo=false;
let roadOrientation='↔️ Horz';

// ── Scenario Targeting Mode (Part 3) ──
let scenarioTargeting=null; // {types:[string], stepIdx:number}

// ── Init ──
function init(){
  cache();
  Settings.init();
  bindEvents();
  // If there's a recent save, show a quick-resume option on the intro instead
  // For now, always show the intro and let the user choose
  setInterval(()=>{try{if(Game.state?.phase&&Game.state.phase!=='intro')Game.save();}catch(e){}},15000);
}

// ── Phase Mgmt ──
function setPhase(ph){
  const st=Game.state;st.phase=ph;Game.save();
  const order=['scan','design','optimise','simulate','scenarios','exam'],idx=order.indexOf(ph);
  $.phaseDots.forEach((el,i)=>{el.classList.toggle('active',i===idx);el.classList.toggle('done',i<idx);});
  $.btnsDesign.style.display=(ph==='design'||ph==='scan')?'flex':'none';
  $.btnsOptimise.style.display=ph==='optimise'?'flex':'none';
  $.btnsSim.style.display=ph==='simulate'?'flex':'none';
  $.scanOl.style.display=ph==='scan'?'flex':'none';
  $.dashSec.style.display=ph==='simulate'?'block':'none';
  $.graphTray.style.display=ph==='optimise'?'block':'none';
  $.reqSec.style.display=ph==='design'?'block':'none';
  if(ph==='simulate')$.dashSec.style.display='block';
  $.scenarioSec.style.display=ph==='scenarios'?'block':'none';
  $.infoSec.style.display=(ph==='scenarios'||ph==='exam')?'none':'';
  if(ph!=='scenarios'&&ph!=='exam'){
    $.palTitle.parentElement.style.display='';
    $.palette.style.display='';
  }
  if(ph==='exam'){$.palTitle.parentElement.style.display='none';$.palette.style.display='none';}
  if($.grid)$.grid.style.display='grid';
  const names={scan:'🔍 Scan Phase',design:'🏗️ Design Phase',optimise:'🔗 Optimise Phase',simulate:'🎬 Simulate Phase',scenarios:'🎯 Scenario Challenges',exam:'📝 AI Concepts Exam'};
  $.phaseName.textContent=names[ph]||'';

  if(ph==='scan'){setupScan();
    phaseIntro('scan','Let us scan the land! Click on tiles to find 3 underground hazards. This is SIGNAL PROCESSING — like using an x-ray to see underground. 📡')}
  else if(ph==='design'){setupDesign();
    phaseIntro('design','Now we build! Place roads, power plants, and schools. This is RESOURCE ALLOCATION — spending tokens wisely to build the best city. 🏗️')}
  else if(ph==='optimise'){setupOptimise();
    phaseIntro('optimise','Time to connect systems! Drag lines between buildings to show how they relate. This is CAUSAL REASONING — understanding what causes what. 🔗')}
  else if(ph==='simulate'){setupSim();
    phaseIntro('simulate','Your city is alive! Watch buses, trucks, and drones move around. This is AI SIMULATION — testing how things work before building them for real. 🎬')}
  else if(ph==='scenarios'){setupScenarios();
    phaseIntro('scenarios','Now for the final challenge! Each scenario tests a different AI skill. Crises will hit your city — use what you learned to solve them. You got this! 💪')}
  else if(ph==='exam'){setupExam();
    phaseIntro('exam','Time for the AI Concepts Exam! Answer questions about all the AI methods you have used. Let us see what you have learned! 📝')}
}

// ── Phase 0: Scan ──
function setupScan(){
  scanActive=true;palType=null;selBldId=null;
  renderGrid();
  renderPalette();
  $.palTitle.textContent='Buildings (locked)';
  $.phaseHint.innerHTML='🔍 Click green tiles to scan for <b>3 hidden hazards</b>! Enable Turbo then <b>drag</b> across tiles to scan fast.';
  if($.reqSec)$.reqSec.style.display='none';
  if($.btnOptimise)$.btnOptimise.style.display='none';
}

// Extend the tile click handling to include scan phase
// onTile function's first check already handles scanActive
// We just need to make sure scanActive is true during scan phase


// ── Phase 1: Design ──
function setupDesign(){
  scanActive=false;palType=null;selBldId=null;
  // Ensure scan overlay is hidden when entering design phase
  $.scanOl.style.display='none';
  // Auto-seed starter buildings if entering design fresh (non-Quick-Start path)
  const st=Game.state;
  if(!st.seeded&&st.hazCleared>=Game.HAZ){
    seedDesign();
    st.seeded=true;
  }
  renderGrid();renderPalette();updTokens();updReqs();
  // Hide any leftover overlays from other phases
  const tutOl=document.getElementById('tut-ol');
  if(tutOl)tutOl.style.display='none';
  $.palTitle.textContent='Buildings';
  if($.btnsDesign)$.btnsDesign.style.display='flex';
}
function seedDesign(){
  const st=Game.state;
  // Place a starter road network
  const r=(row,col)=>Game.place('road',row,col);
  const b=(type,row,col)=>Game.place(type,row,col);
  // Small intersection
  r(2,2);r(2,3);r(2,4);r(2,5);r(2,6);
  r(3,2);r(3,3);r(3,4);r(3,5);
  r(4,2);r(4,3);r(4,4);
  // One building per system (covers scenario check() requirements)
  b('solar',2,7);    // power → heatwave
  b('water',4,6);    // water → flood, spill
  b('bus',3,7);      // transport → strike, bias
  b('traffic',3,6);  // transport → cyber, bias
  b('green',2,9);    // health → outbreak (also covers health)
  b('clinic',4,8);   // health → outbreak
  b('collect',4,9);  // waste → recycling
  b('cctv',3,9);     // safety → bias
  b('flood',6,4);    // safety → flood
  b('recycle',6,6);  // waste → recycling
  b('depot',6,8);    // transport → strike
  // Update UI
  renderGrid();updTokens();updReqs();
  toast('🏗️ Starter infrastructure placed! All scenarios are available.');
}
function renderGrid(){
  const st=Game.state,g=$.grid;
  g.innerHTML='';g.style.gridTemplateColumns=`repeat(${Game.G},1fr)`;
  const lyr=st.layer||'all';

  for(let r=0;r<Game.G;r++)for(let c=0;c<Game.G;c++){
    const t=document.createElement('div');t.className='gtile '+(st.terrain[r][c]||'grass');
    t.dataset.r=r;t.dataset.c=c;

    const key=r+','+c;
    if(st.hazardResults[key]==='found')t.classList.add('hazard');
    else if(st.hazardResults[key]==='cleared')t.classList.add('hazard-clear');
    else if(st.hazardResults[key]==='tmiss')t.classList.add('turbo-miss');
    else if(st.removingH&&st.removingH.row===r&&st.removingH.col===c)t.classList.add('hazard-removing');

    const b=Game.bldAt(r,c);
    if(b){
      const def=Game.BLD[b.type];
      // Layer filtering
      if(lyr!=='all'){
        const sl=def?.s||'';
        if(lyr==='power'&&!['power','water'].includes(sl))continue;
        if(lyr==='logistics'&&!['transport','waste'].includes(sl))continue;
        if(lyr==='social'&&!['health','safety'].includes(sl))continue;
      }
      t.classList.add('build');
      if(b.type==='road'){
        const dir=b.cfg?.Dir||'↔️ Horz';
        if(dir==='↕️ Vert'){
          t.innerHTML='<div style="width:100%;height:100%;background:#3a3a3a;border-radius:1px;display:flex;align-items:center;justify-content:center"><div style="width:2px;height:80%;background:#f8fafc;border-radius:1px;opacity:0.6"></div></div>';
        }else if(dir==='✚ Cross'){
          t.innerHTML='<div style="width:100%;height:100%;background:#3a3a3a;border-radius:1px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0"><div style="width:80%;height:2px;background:#f8fafc;border-radius:1px;opacity:0.6;position:absolute"></div><div style="width:2px;height:80%;background:#f8fafc;border-radius:1px;opacity:0.6"></div></div>';
        }else{
          t.innerHTML='<div style="width:100%;height:100%;background:#3a3a3a;border-radius:1px;display:flex;align-items:center;justify-content:center"><div style="width:80%;height:2px;background:#f8fafc;border-radius:1px;opacity:0.6"></div></div>';
        }
      }else{
        const svg=Game.BLD[b.type]?Icons[b.type]?.():'';
        if(svg){const w=document.createElement('div');w.className='bld-icon';w.innerHTML=svg;t.appendChild(w);}
        // Upgrade indicator badge
        if(b.cfg){
          const up=b.cfg.Cool&&b.cfg.Cool!=='Air'?b.cfg.Cool:null;
          const up2=b.cfg.Eff&&b.cfg.Eff!=='Standard'?'⚡':null;
          const up3=b.cfg.Sched&&b.cfg.Sched!=='Manual'?'🤖':null;
          const up4=b.cfg.Flow&&b.cfg.Flow!=='Standard'?'🔄':null;
          const up5=b.cfg.Anal&&b.cfg.Anal!=='Off'?'📊':null;
          const badge=up||up2||up3||up4||up5;
          if(badge){
            const bd=document.createElement('span');bd.className='upgrade-badge';
            bd.textContent=badge;bd.style.cssText='position:absolute;top:-2px;right:-2px;font-size:9px;z-index:2';
            t.appendChild(bd);
          }
        }
      }
    }

    // Crosshair on unscanned during scan
    if(scanActive&&!b&&!Game.isW(r,c)&&!Game.isM(r,c)&&!st.hazardResults[key]){
      const uk=key;
      if(!st.scanned.has(uk)&&!(st.scannedTurbo?.has(uk)))t.style.cursor='crosshair';
    }

    t.addEventListener('click',()=>onTile(r,c));
    g.appendChild(t);
  }
  renderRoutes();
}

function renderRoutes(){
  // Clear any leftover route lines from the SVG in design phase
  // Route paths are drawn during simulation by simulation.js
  const svg=$.svg;
  if(svg){
    const existing=svg.querySelectorAll('.route-path');
    existing.forEach(el=>el.remove());
  }
}

function renderPalette(){
  const st=Game.state;$.palette.innerHTML='';
  const groups={};
  Object.entries(Game.BLD).forEach(([t,d])=>{if(!groups[d.s])groups[d.s]=[];groups[d.s].push({t,d});});
  Game.SYS.forEach(sys=>{
    const items=groups[sys]||[];if(!items.length)return;
    const lbl=document.createElement('div');lbl.className='pal-group';lbl.textContent=sys;$.palette.appendChild(lbl);
    items.forEach(({t,d})=>{
      // For roads, show 3 orientation options inline
      if(t==='road'){
        const opts=['↔️ Horz','↕️ Vert','✚ Cross'];
        const icons=['=','‖','✚'];
        opts.forEach((o,i)=>{
          const maxed=d.mx!==undefined&&Game.cntType(t)>=d.mx;
          const unaff=st.tokens.spent+d.c>st.tokens.budget;
          const el=document.createElement('div');
          el.className='pal-item'+(maxed||unaff?' disabled':'')+(palType==='road'&&roadOrientation===o?' active':'');
          el.innerHTML='<span class="pi" style="font-size:14px;font-weight:700">'+icons[i]+'</span><span>'+o+'</span><span class="cost">🪙'+d.c+'</span>';
          el.addEventListener('click',()=>{if(maxed||unaff)return;palType='road';roadOrientation=o;renderPalette();Audio.click();});
          $.palette.appendChild(el);
        });
        return;
      }
      const maxed=d.mx!==undefined&&Game.cntType(t)>=d.mx;
      const unaff=st.tokens.spent+d.c>st.tokens.budget;
      const el=document.createElement('div');
      el.className='pal-item'+(maxed||unaff?' disabled':'')+(palType===t?' active':'');
      const svg=Icons[t]?.()||'';
      el.innerHTML=`<span class="pi">${svg}</span><span>${d.l}</span><span class="cost">🪙${d.c}</span>`;
      el.addEventListener('click',()=>{if(maxed||unaff)return;palType=palType===t?null:t;if(t!=='road')roadOrientation=null;renderPalette();Audio.click();});
      $.palette.appendChild(el);
    });
  });
}

function updTokens(){$.token.textContent=Game.state.tokens.budget-Game.state.tokens.spent;}

function updReqs(){
  const st=Game.state;
  // During scan phase, scanning is always active and hazards auto-track
  if(st.phase==='scan'){
    const scannedCount=(st.scanned?.size||0)+(st.scannedTurbo?.size||0);
    const totalTiles=Game.G*Game.G;
    $.phaseHint.innerHTML=st.hazFound+'/'+Game.HAZ+' hazards found'+(st.hazFound>0?'. Click Remove Hazard to clear them.':'')+
      ' | '+scannedCount+'/'+totalTiles+' tiles scanned';
    if(st.hazCleared<Game.HAZ&&scannedCount>=totalTiles-20){
      $.phaseHint.innerHTML+='<br>🔍 Almost all tiles scanned! Switch to <b>Normal mode</b> and click individual unscanned tiles to find remaining hazards.';
    }
    // Check for turbo-missed hazards that need re-scanning in Normal mode
    if(st.hazCleared<Game.HAZ){
      const tmissCount=st.hazards.filter(([r,c])=>st.hazardResults[r+','+c]==='tmiss').length;
      if(tmissCount>0){
        $.phaseHint.innerHTML+='<br>⚡ <b>'+tmissCount+' hazard(s)</b> were missed by Turbo! Switch to <b>Normal ⚡ Drag Turbo OFF</b> and click the tan tile(s) to confirm them.';
      }
    }
    if(st.hazCleared>=Game.HAZ){
      $.phaseHint.innerHTML='✅ All '+Game.HAZ+' hazards cleared!';
      $.btnOptimise.textContent='🏗️ Build →';
      $.btnOptimise.style.display='inline-flex';
    }
    return;
  }
  const allHazCleared=st.hazCleared>=Game.HAZ;
  if(!allHazCleared){
    if(st.hazFound===0&&st.hazCleared===0)
      $.phaseHint.innerHTML='🔍 Press <b>Scan</b> button, then click green tiles to find 3 hazards!';
    else
      $.phaseHint.innerHTML='⚠️ Hazards: '+st.hazFound+' found, '+st.hazCleared+' cleared ('+(Game.HAZ-st.hazCleared)+' left)';
    $.btnOptimise.style.display='none';
    $.reqSec.style.display='none';
    return;
  }
  $.phaseHint.innerHTML='✅ All '+Game.HAZ+' hazards cleared';

  // Show requirements
  let rh='<div style="font-weight:600;margin-bottom:4px;font-size:var(--fs-sm)">🏗️ Place:</div>';
  Game.SYS.forEach(sys=>{
    const cnt=Game.sysBlds(sys).length;
    rh+=`<div class="req-item" style="color:${cnt>0?'var(--success)':'var(--text2)'};font-size:var(--fs-xs)">${cnt>0?'✅':'☐'} ${sys}: ${cnt}</div>`;
  });
  const rc=Game.cntType('road');
  rh+=`<div class="req-item" style="color:${rc>=3?'var(--success)':'var(--text2)'};font-size:var(--fs-xs);border-top:1px solid var(--bg3);padding-top:4px;margin-top:4px">${rc>=3?'✅':'☐'} Roads: ${rc}/3</div>`;
  const tk=st.tokens.spent;
  rh+=`<div class="req-item" style="color:${tk>=25?'var(--success)':'var(--text2)'};font-size:var(--fs-xs)">${tk>=25?'✅':'☐'} Tokens: ${tk}/25</div>`;
  $.reqBody.innerHTML=rh;$.reqSec.style.display='block';

  if(Game.minMet()){
    $.btnOptimise.style.display='inline-flex';
    $.btnOptimise.style.animation='pulse-btn 1.5s infinite';
  }else $.btnOptimise.style.display='none';
}

// ── Tile click ──
function onTile(r,c){
  const st=Game.state;

  // Scan mode (during scan phase or manually activated design phase)
  if(scanActive&&(st.phase==='scan'||st.phase==='design')){
    const turbo=scanTurbo;
    if(turbo){
      // Turbo drag already scans via pointermove; for tap, scan area
      scanOneArea(r,c);
    }else{
      // Normal tap: scan nearest 4 cells at once
      Game.scanArea(r,c,false);
    }
    const st2=Game.state;
    if(st2.hazFound>st.hazFound){
      toast('⚠️ Hazard! ('+st2.hazFound+'/'+Game.HAZ+') Remove it!','err');
      if(!Audio._ctx)Audio.init();
      Audio.crisis();
      $.btnRemove.style.display='inline-flex';
    }
    const scannedTotal=(st.scanned?.size||0)+(st.scannedTurbo?.size||0);
    $.scanHaz.textContent='Hazards: '+st2.hazFound+'/'+Game.HAZ+' | '+scannedTotal+'/'+(Game.G*Game.G)+' scanned';
    renderGrid();
    updReqs();
    return;
  }

  // Road drag drawing — only in design phase
  if(palType==='road'&&st.phase==='design'){
    const res=Game.place('road',r,c);
    if(!res.err){
      const b=Game.bldAt(r,c);
      if(b&&!b.cfg)b.cfg={};
      if(b)b.cfg.Dir=roadOrientation;
      Audio.place();renderGrid();renderPalette();updTokens();updReqs();Game.save();
    }else toast(res.err,'err');
    return;
  }

  // Building placement — only in design phase
  if(st.phase==='design'){
    // Enforce hazard clearance
    if(palType&&st.hazCleared<Game.HAZ){
      toast('🔍 Find and remove all '+Game.HAZ+' hazards first!','err');
      palType=null;renderPalette();return;
    }
    const b=Game.bldAt(r,c);
    if(palType){
      const res=Game.place(palType,r,c);
      if(res.err){toast(res.err,'err');}else{
        Audio.place();renderGrid();renderPalette();updTokens();updReqs();Game.save();
      }
      return;
    }
    if(b){selBldId=b.id;showInfo(b);return;}
    selBldId=null;$.infoBody.innerHTML='<p class="muted">Tap a building.</p>';$.infoActs.style.display='none';
  }
}

function showInfo(b){
  const def=Game.BLD[b.type];if(!def)return;
  $.infoBody.innerHTML='<div style="font-size:var(--fs-sm)"><b>'+def.l+'</b></div>'+
    '<div style="font-size:var(--fs-xs);color:var(--text2)">'+def.s+' system</div>'+
    (b.eff<1?'<div style="color:var(--danger);font-size:var(--fs-xs)">⚠️ '+Math.round(b.eff*100)+'% efficiency</div>':'');
  $.infoActs.style.display='flex';
  let btns='<button class="btn-sm" style="background:var(--danger);color:white" onclick="Game.removeBld('+b.id+');setupDesign();Game.save();">Remove</button>';
  if(def.sl&&def.sl.length>0)
    btns+='<button class="btn-sm" style="background:var(--primary);color:#000" onclick="showConfig('+b.id+')">⚙️ Configure</button>';
  $.infoActs.innerHTML=btns;
}

function showConfig(id){
  const b=Game.bldById(id),def=Game.BLD[b.type];if(!def?.sl)return;
  $.cfgPanel.style.display='block';$.cfgTitle.textContent='⚙️ '+def.l;
  $.cfgBody.innerHTML=def.sl.map(s=>{
    const sd=Game.SLD[s];if(!sd)return'';
    if(sd.opts)return`<div class="cfg-r"><label>${sd.l}</label><select data-s="${s}" data-b="${id}">${sd.opts.map(o=>`<option value="${o}" ${b.cfg[s]===o?'selected':''}>${o}</option>`).join('')}</select></div>`;
    const val=b.cfg[s]??sd.def??sd.min;
    return`<div class="cfg-r"><label>${sd.l}</label><input type="range" min="${sd.min}" max="${sd.max}" step="${sd.step||1}" value="${val}" data-s="${s}" data-b="${id}"><span class="val">${val}${sd.u||''}</span></div>`;
  }).join('');
  $.cfgBody.querySelectorAll('input[type=range]').forEach(el=>{
    el.addEventListener('input',()=>{const v=parseInt(el.value);el.nextElementSibling.textContent=v+(Game.SLD[el.dataset.s]?.u||'');Game.updateConfig(parseInt(el.dataset.b),el.dataset.s,v);});
  });
  $.cfgBody.querySelectorAll('select').forEach(el=>{el.addEventListener('change',()=>Game.updateConfig(parseInt(el.dataset.b),el.dataset.s,el.value));});
}

// ── Phase 2: Optimise ──
function setupOptimise(){
  const tut=KnowledgeGraph.getTutorial();
  if(!tut.done){
    KnowledgeGraph.startTutorial();
    showTutorial();
  } else {
    showOptimiseUI();
  }
}

function showTutorial(){
  const tut=KnowledgeGraph.getTutorial();
  const ol=document.getElementById('tut-ol')||createTutOverlay();
  ol.style.display='flex';
  renderTutStep();
}

function createTutOverlay(){
  const ol=document.createElement('div');ol.id='tut-ol';
  const gw=document.getElementById('grid-wrap');
  if(gw)gw.appendChild(ol);else document.body.appendChild(ol);
  return ol;
}

function renderTutStep(){
  const tut=KnowledgeGraph.getTutorial();
  const ol=document.getElementById('tut-ol');
  if(!ol)return;
  const step=KnowledgeGraph.getStep(tut.step);

  if(tut.step===0){
    ol.innerHTML='<div id="tut-card"><h2>'+step.label+'</h2><p>'+step.msg+'</p><div id="tut-nav"><button class="btn-primary" onclick="KnowledgeGraph.advanceStep();renderTutStep();">Next →</button></div></div>';
  }
  // Step 1: Graph popup
  else if(tut.step===1){
    const ge=Game.state.graph.edges;
    const rows=ge.slice(0,15).map(e=>{
      const fm=Game.state.buildings.find(b=>'b'+b.id===e.from);
      const to=Game.state.buildings.find(b=>'b'+b.id===e.to);
      if(!fm||!to)return '';
      const fc='#'+(Game.BLD[fm.type]?.s==='power'?'facc15':Game.BLD[fm.type]?.s==='water'?'38bdf8':Game.BLD[fm.type]?.s==='transport'?'a78bfa':Game.BLD[fm.type]?.s==='health'?'f87171':Game.BLD[fm.type]?.s==='waste'?'4ade80':'c084fc');
      const tc='#'+(Game.BLD[to.type]?.s==='power'?'facc15':Game.BLD[to.type]?.s==='water'?'38bdf8':Game.BLD[to.type]?.s==='transport'?'a78bfa':Game.BLD[to.type]?.s==='health'?'f87171':Game.BLD[to.type]?.s==='waste'?'4ade80':'c084fc');
      return '<div class="graph-c"><span class="gn" style="color:'+fc+'">'+(Game.BLD[fm.type]?.emoji||Game.BLD[fm.type]?.l||fm.type)+' '+(Game.BLD[fm.type]?.l||fm.type)+'</span><span class="ga">→ '+e.rel+' →</span><span class="gn" style="color:'+tc+'">'+(Game.BLD[to.type]?.emoji||Game.BLD[to.type]?.l||to.type)+' '+(Game.BLD[to.type]?.l||to.type)+'</span></div>';
    }).join('');
    ol.innerHTML='<div id="tut-card" style="max-width:620px"><h2>'+step.label+'</h2><p style="margin-bottom:8px;font-size:13px">The AI found <b>'+ge.length+' relationships</b> between buildings in your city:</p><div style="max-height:350px;overflow-y:auto;margin:6px 0">'+rows+'</div><div style="text-align:center;margin-top:8px;padding:8px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text2)">'+ge.length+' connections across 6 city systems</div><div id="tut-nav"><button class="btn-primary" onclick="KnowledgeGraph.advanceStep();renderTutStep();">Close</button></div></div>';
  }
  // Step 2: AI learned patterns
  else if(tut.step===2){
    const dis=KnowledgeGraph.getDiscoveries();
    ol.innerHTML='<div id="tut-card"><h2>'+step.label+'</h2><p>'+step.msg+'</p><div style="margin:8px 0">'+dis.map(d=>'<div style="padding:6px 0;font-size:13px;border-bottom:1px solid var(--bg3)">'+d+'</div>').join('')+'</div><div id="tut-nav"><button class="btn-primary" onclick="KnowledgeGraph.advanceStep();renderTutStep();">Next →</button></div></div>';
  }
  // Step 3: Build your graph
  else if(tut.step===3){
    const blds=Game.state.buildings.filter(b=>b.type!=='road');
    const nodes=blds.map(b=>'<div class="tut-node" data-bid="'+b.id+'" onclick="tutNodeClick(this,'+b.id+')"><span style="display:inline-block;width:20px;height:20px;vertical-align:middle">'+(Icons[b.type]?.().replace('viewBox','style="width:100%;height:100%" viewBox')||'🏗️')+'</span> '+(Game.BLD[b.type]?.l||b.type)+'</div>').join('');
    const etxt=tut.edges.map(e=>{
      const f=blds.find(b=>'b'+b.id===e.from);const t=blds.find(b=>'b'+b.id===e.to);
      return (f?Game.BLD[f.type]?.l||'':'')+' →'+e.rel+'→ '+(t?Game.BLD[t.type]?.l||'':'');
    }).join('<br>');
    ol.innerHTML='<div id="tut-card" style="max-width:620px"><h2>'+step.label+'</h2><p>'+step.msg+'</p><div style="max-height:200px;overflow-y:auto" id="tut-build">'+nodes+'</div><div class="tut-edges" style="margin-top:6px">'+tut.edges.length+'/'+KnowledgeGraph.MIN_EDGES+'<br>'+etxt+'</div><div id="tut-nav"><span style="font-size:12px;color:var(--text3)">Tap two buildings, then pick a relationship ('+(tut.edges.length||0)+'/'+KnowledgeGraph.MIN_EDGES+')</span></div></div>';
    renderRelBtns(tut);
  }
  // Step 4: Knowledge Graph Complete — before recommendations
  else if(tut.step===4){
    const total=Game.state.graph.edges.length;
    const user=tut.edges.length;
    ol.innerHTML='<div id="tut-card"><div class="tut-fin"><div class="tf-icon">✅</div><h2>Knowledge Graph Complete!</h2><p>The knowledge graph has <b>'+total+' connections</b> total — you created <b>'+user+'</b> and the AI inferred <b>'+(total-user)+'</b> more.</p><p style="font-size:13px;color:var(--text2);margin-top:8px">The AI can now use this graph to find improvements in your city.</p><button class="btn-primary" onclick="KnowledgeGraph.advanceStep();renderTutStep();" style="margin-top:12px">💡 Show AI Recommendations</button></div></div>';
  }
  // Step 5: AI Recommendations
  else if(tut.step===5){
    tut.suggests=KnowledgeGraph.generateSuggests();
    tut.sugIdx=0;
    renderSug();
  }
  // Step 6: Complete
  else if(tut.step>=6){
    const step6=KnowledgeGraph.getStep(6);
    ol.innerHTML='<div id="tut-card"><div class="tut-fin"><div class="tf-icon">🎉</div><h2>'+step6.label+'</h2><p>'+step6.msg+'</p><p style="font-size:13px;color:var(--text2)">Accepted '+(tut.accepted||0)+' AI recommendations.</p><button class="btn-primary" onclick="finishTutorial()">🎬 Start Simulation!</button></div></div>';
  }
}

function tutNodeClick(el,bid){
  const id='b'+bid;
  const res=KnowledgeGraph.handleNodeClick(id);
  document.querySelectorAll('.tut-node').forEach(n=>n.classList.remove('sel'));
  const tut=KnowledgeGraph.getTutorial();
  if(tut.selSrc){
    const el2=document.querySelector('.tut-node[data-bid="'+tut.selSrc.replace('b','')+'"]');
    if(el2)el2.classList.add('sel');
  }
  if(tut.selTgt){
    const el2=document.querySelector('.tut-node[data-bid="'+tut.selTgt.replace('b','')+'"]');
    if(el2)el2.classList.add('sel');
  }
  renderRelBtns(tut);
}

function renderRelBtns(tut){
  const nav=document.getElementById('tut-nav');
  if(!nav)return;
  if(!tut.selSrc||!tut.selTgt){
    nav.innerHTML='<span style="font-size:12px;color:var(--text3)">Tap a building to start</span>';
    return;
  }
  const btns=KnowledgeGraph.RELS.map(r=>'<button class="btn-sm" onclick="relPick(\''+r.id+'\')" style="margin:2px">'+r.l+'</button>').join('');
  nav.innerHTML=btns;
}

function relPick(rel){
  const ok=KnowledgeGraph.relClick(rel);
  if(!ok)return;
  toast('✅ Relationship added!');
  // Update connections display in-place instead of full re-render
  const tut=KnowledgeGraph.getTutorial();
  const count=tut.edges.length;
  const ediv=document.querySelector('.tut-edges');
  if(ediv)ediv.innerHTML='Connections: '+count+'/'+KnowledgeGraph.MIN_EDGES+(count>0?('<br>'+tut.edges.map((e,i)=>{
    const f=Game.state.buildings.find(b=>'b'+b.id===e.from);
    const t=Game.state.buildings.find(b=>'b'+b.id===e.to);
    return (f?Game.BLD[f.type]?.l||'':'')+' →'+e.rel+'→ '+(t?Game.BLD[t.type]?.l||'':'');
  }).join('<br>')):'');
  // Update nav: show Next button if MIN_EDGES connections reached
  const nav=document.getElementById('tut-nav');
  if(nav){
    if(count>=KnowledgeGraph.MIN_EDGES)nav.innerHTML='<button class="btn-primary" onclick="KnowledgeGraph.advanceStep();renderTutStep();">🤖 Let AI Learn →</button>';
    else nav.innerHTML='<span style="font-size:12px;color:var(--text3)">Tap two buildings, then pick a relationship ('+count+'/'+KnowledgeGraph.MIN_EDGES+')</span>';
  }
  // Reset selected node highlights
  document.querySelectorAll('.tut-node').forEach(n=>n.classList.remove('sel'));
}

function renderSug(){
  const tut=KnowledgeGraph.getTutorial();
  const ol=document.getElementById('tut-ol');
  const sug=tut.suggests;
  tut.sugIdx=tut.sugIdx||0;
  const s=sug[tut.sugIdx];
  if(!s||tut.sugIdx>=sug.length){
    KnowledgeGraph.advanceStep();renderTutStep();return;
  }
  ol.innerHTML='<div id="tut-card" style="max-width:620px"><h2>💡 AI Recommendation '+(tut.sugIdx+1)+'/'+sug.length+'</h2><div class="sug-card"><div class="sgt">'+s.t+'</div><div class="sgd">'+s.d+'</div><div class="sgd" style="margin-top:4px;font-size:11px;color:var(--text3);border-top:1px solid var(--bg3);padding-top:4px">📘 '+s.l+'</div><div class="sga"><button class="sg-ok" onclick="applySug('+tut.sugIdx+')">✅ Apply Change</button><button class="sg-no" onclick="skipSug()">Skip</button></div></div></div>';
}

function applySug(idx){
  const tut=KnowledgeGraph.getTutorial();
  const s=tut.suggests?.[idx];
  if(s&&s.a()){
    tut.accepted++;
    Game.save();toast('✅ '+s.t+' applied!');
    renderGrid();renderPalette();
  }
  // Auto-advance to next recommendation
  tut.sugIdx=(tut.sugIdx||0)+1;
  renderSug();
}

function skipSug(){
  const tut=KnowledgeGraph.getTutorial();
  tut.sugIdx=(tut.sugIdx||0)+1;
  renderSug();
}

function finishTutorial(){
  const tut=KnowledgeGraph.getTutorial();
  tut.done=true;
  const ol=document.getElementById('tut-ol');
  if(ol)ol.style.display='none';
  toast('🎉 Knowledge graph learned! '+(tut.accepted||0)+' changes applied to your city.');
  // Go straight to simulation — optimisation is complete
  setPhase('simulate');
}

function showOptimiseUI(){
  KnowledgeGraph.render($.graphNodes);
  $.palTitle.textContent='🔗 Graph';
  Game.state.scored=false;
}



// ── Phase 3: Simulate ──
function setupSim(){
  Game.findRoutes();
  Simulation.start();
  $.phaseHint.textContent='City running!';
}

// ── Phase 5: Scenarios ──
let scenarioActive=null;
const scenarioState={};
let stepTimer=null;
let scenarioOverlayElements=[];

// ── Nova Speak — inject narrative voice into scenarios ──
function novaSpeak(text,opts={}){
  if(!text)return;
  const bub=$.novaBub,txt=$.novaTxt,dot=$.novaDot;
  bub.style.display='block';
  txt.textContent=text;
  dot.className='dot '+(opts.urgent?'warning':'speaking');
  if(!Settings.get('muted')){
    const u=new SpeechSynthesisUtterance(text);
    u.rate=opts.urgent?1.1:Settings.get('rate');
    u.volume=Settings.get('vol');
    const vn=Settings.get('voice');if(vn){const v=speechSynthesis.getVoices().find(v=>v.name===vn);if(v)u.voice=v;}
    speechSynthesis.speak(u);
  }
  clearTimeout(bub._st);
  bub._st=setTimeout(()=>{dot.className='dot idle';setTimeout(()=>{bub.style.display='none';},5000);},opts.duration||4000);
}

// ── Nova Teaching Voice: speaks educational content directly to the child ──
let _novaTeachTimer=null;
function novaTeach(conceptName, explanation, opts={}){
  // Build a friendly, conversational teaching message
  const msg='🧠 '+conceptName+'. '+(opts.prefix||'Here is how it works: ')+explanation+(opts.suffix||'');
  novaSpeak(msg,{duration:opts.duration||12000,...opts});
}
function novaAnnounce(text,opts={}){
  novaSpeak('🤖 '+text,{duration:opts.duration||5000,...opts});
}

// Phase intro speeches (spoken once per phase per session)
let _phSpoken={};
function phaseIntro(phaseKey,text){
  if(_phSpoken[phaseKey])return;_phSpoken[phaseKey]=true;
  setTimeout(()=>novaAnnounce(text,{duration:7000}),800);
}

// ── Celebration Effects ──
function triggerCelebration(stars){
  if(stars===3){
    const box=document.createElement('div');box.className='confetti-box';
    for(let i=0;i<40;i++){
      const p=document.createElement('div');p.className='confetti';
      p.style.cssText=`left:${Math.random()*100}%;width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;background:hsl(${Math.random()*360},80%,55%);animation-delay:${Math.random()*1.5}s;animation-duration:${1.5+Math.random()*2}s`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(()=>box.remove(),4000);
  }else if(stars===2){
    document.querySelectorAll('.crisis-affect').forEach(el=>{
      el.classList.add('resolve-flash');
      setTimeout(()=>el.classList.remove('resolve-flash'),1000);
    });
  }
}

function setupScenarios(){
  $.phaseHint.textContent='Select a challenge scenario — each uses AI to solve a city crisis';
  // Show scenario section in right sidebar, hide info section and palette
  $.scenarioSec.style.display='block';
  $.infoSec.style.display='none';
  $.palTitle.parentElement.style.display='none'; // hide palette header
  $.palette.style.display='none';
  // Ensure grid is visible
  $.grid.style.display='grid';
  // Clear any leftover crisis effects from previous scenario run
  clearCrisisEffects();
  scenarioActive=null;
  renderConceptTracker();
  renderScenarioMetrics();
  renderScenarioMenu();
}

function setupExam(){
  $.phaseHint.textContent='📝 AI Concepts Exam — answer 10 questions about what you have learned!';
  $.scenarioSec.style.display='none';
  $.infoSec.style.display='none';
  $.palTitle.parentElement.style.display='none';
  $.palette.style.display='none';
  $.grid.style.display='grid';
  // Remove the sidebar exam button if it exists (we use the phase dot now)
  const btn=document.getElementById('btn-exam');
  if(btn)btn.style.display='none';
  setTimeout(()=>startExam(), 600);
}

// ── Crisis Visual Effects ──
const CRISIS_EFFECTS={
  heatwave:{class:'crisis-heat',types:['solar','wind','hydro','bat'],label:'Heatwave'},
  flood:{class:'crisis-flood',types:['water','flood'],label:'Flood'},
  cyber:{class:'crisis-cyber',types:['traffic','cctv','data'],label:'Cyber'},
  recycling:{class:'crisis-waste',types:['recycle','collect','compost'],label:'Waste'},
  evacuation:{class:'crisis-evac',types:['town','school','hosp','emerg'],label:'Evacuation'},
  economic:{class:'crisis-econ',types:['town','auditor','school'],label:'Economic'},
  outbreak:{class:'crisis-health',types:['hosp','clinic','green'],label:'Outbreak'},
  strike:{class:'crisis-strike',types:['bus','depot'],label:'Strike'},
  spill:{class:'crisis-spill',types:['water'],label:'Spill'},
  wildfire:{class:'crisis-fire',types:['town','emerg','flood'],label:'Wildfire'},
  bias:{class:'crisis-bias',types:['cctv','traffic','bus'],label:'Bias'},
  migration:{class:'crisis-migrate',types:['town','school','hosp'],label:'Migration'},
};

function applyCrisisEffect(idx){
  const s=Scenarios[idx];
  if(!s||!CRISIS_EFFECTS[s.id])return;
  const effect=CRISIS_EFFECTS[s.id];
  // Add crisis class to grid-wrap for overall styling
  $.grid.classList.add('crisis-active',effect.class);
  // Highlight individual affected buildings
  const st=Game.state;
  st.buildings.forEach(b=>{
    if(effect.types.includes(b.type)){
      const tile=document.querySelector(`.gtile[data-r="${b.row}"][data-c="${b.col}"]`);
      if(tile)tile.classList.add('crisis-bld','crisis-affect',effect.class);
    }
  });
  applyScenarioVisuals(idx);
}

// ── Grid Targeting Mode (building-click interactions) ──
function enterTargetingMode(target,stepIdx){
  scenarioTargeting={types:target.types||[],stepIdx};
  $.gridWrap.classList.add('grid-targeting');
  const st=Game.state;
  st.buildings.forEach(b=>{
    if(target.types.includes(b.type)){
      const tile=document.querySelector(`.gtile[data-r="${b.row}"][data-c="${b.col}"]`);
      if(tile)tile.classList.add('targetable');
    }
  });
}

function clearTargetingMode(){
  scenarioTargeting=null;
  $.gridWrap.classList.remove('grid-targeting');
  document.querySelectorAll('.targetable').forEach(el=>el.classList.remove('targetable'));
}

function clearCrisisEffects(){
  clearTargetingMode();
  clearScenarioVisuals();
  $.grid.classList.remove('crisis-active','crisis-heat','crisis-flood','crisis-cyber','crisis-waste',
    'crisis-evac','crisis-econ','crisis-health','crisis-strike','crisis-spill','crisis-fire',
    'crisis-bias','crisis-migrate');
  document.querySelectorAll('.crisis-bld,.crisis-affect,.grid-targeting').forEach(el=>{
    el.classList.remove('crisis-bld','crisis-affect','crisis-heat','crisis-flood','crisis-cyber','crisis-waste',
      'crisis-evac','crisis-econ','crisis-health','crisis-strike','crisis-spill','crisis-fire',
      'crisis-bias','crisis-migrate');
  });
  const gw=document.getElementById('grid-wrap');
  if(gw)gw.classList.remove('flood-wave-active','crisis-stage-critical','crisis-stage-worsening','crisis-stage-recovering','crisis-stage-resolved');
}

// ── Scenario Visual Overlays ──
function clearScenarioVisuals(){
  const gw=document.getElementById('grid-wrap');
  if(gw)gw.classList.remove('flood-wave-active','crisis-heat-active','crisis-cyber-active',
    'crisis-econ-active','crisis-health-active','crisis-fire-active');
  scenarioOverlayElements.forEach(el=>el.remove());
  scenarioOverlayElements=[];
}

function applyScenarioVisuals(idx){
  const s=Scenarios[idx];
  if(!s)return;
  const id=s.id;
  const st=Game.state;
  const gw=document.getElementById('grid-wrap');
  if(!gw)return;

  // ── Fire / Evacuation: smoke particles on burning buildings ──
  if(id==='evacuation'){
    const affected=['town','school','hosp','emerg'];
    st.buildings.forEach(b=>{
      if(!affected.includes(b.type))return;
      const tile=document.querySelector(`.gtile[data-r="${b.row}"][data-c="${b.col}"]`);
      if(!tile)return;
      for(let i=0;i<3;i++){
        const p=document.createElement('span');
        p.className='smoke-particle scenario-overlay';
        p.style.cssText=`left:${15+Math.random()*70}%;animation-delay:${i*0.6+Math.random()*0.4}s`;
        tile.appendChild(p);
        scenarioOverlayElements.push(p);
      }
    });
  }

  // ── Flood: animated water wave overlay ──
  if(id==='flood') gw.classList.add('flood-wave-active');

  // ── Heatwave: orange haze shimmer ──
  if(id==='heatwave') gw.classList.add('crisis-heat-active');

  // ── Cyber: glitch scanlines ──
  if(id==='cyber') gw.classList.add('crisis-cyber-active');

  // ── Economic: downward red gradient ──
  if(id==='economic') gw.classList.add('crisis-econ-active');

  // ── Outbreak: contamination spread ──
  if(id==='outbreak') gw.classList.add('crisis-health-active');

  // ── Wildfire: orange glow from bottom ──
  if(id==='wildfire') gw.classList.add('crisis-fire-active');

  // ── Migration: people walking in from grid edges ──
  if(id==='migration'){
    const colors=['#fb923c','#60a5fa','#4ade80','#c084fc','#facc15','#f472b6'];
    const rect=gw.getBoundingClientRect();
    const w=rect.width,h=rect.height;
    for(let i=0;i<8;i++){
      const p=document.createElement('div');
      p.className='migrant-person scenario-overlay';
      const edge=Math.floor(Math.random()*4);
      const delay=i*1.2+Math.random()*0.5;
      let sx,sy,ex,ey;
      if(edge===0){sx=Math.random()*w;sy=-16;ex=30+Math.random()*(w-60);ey=15+Math.random()*(h*0.5);}
      else if(edge===1){sx=w+16;sy=Math.random()*h;ex=w*0.2+Math.random()*(w*0.5);ey=15+Math.random()*(h*0.6);}
      else if(edge===2){sx=Math.random()*w;sy=h+16;ex=30+Math.random()*(w-60);ey=h*0.3+Math.random()*(h*0.4);}
      else{sx=-16;sy=Math.random()*h;ex=w*0.2+Math.random()*(w*0.5);ey=15+Math.random()*(h*0.6);}
      p.style.cssText=`left:${sx}px;top:${sy}px;background:${colors[i%colors.length]};
        --walk-end-x:${ex}px;--walk-end-y:${ey}px;
        animation:migrant-walk ${3.5+Math.random()*3}s ease-in-out ${delay}s forwards`;
      gw.appendChild(p);
      scenarioOverlayElements.push(p);
    }
  }
}

function renderScenarioMenu(){
  const panel=document.getElementById('scenario-panel');
  if(!panel)return;
  const st=Game.state;
  let html='<div class="sc-grid">';
  Scenarios.forEach((s,i)=>{
    const avail=s.check(st);
    const name=typeof s.name==='function'?s.name(st):s.name;
    const desc=typeof s.desc==='function'?s.desc(st):s.desc;
    const missing=s.missing||'Requirements not met';
    html+=`<div class="sc-card${avail?'':' locked'}" onclick="${avail?'startScenario('+i+')':''}">
      <div class="sci">${s.icon}</div>
      <div class="scn">${name}</div>
      <div class="scd">${avail?desc:missing}</div>
    </div>`;
  });
  html+='</div>';
  panel.innerHTML=html;
}

// ── AI Concept Tracker Data ──
const AI_CONCEPTS=[
  {id:'heatwave',emoji:'🔥',label:'Optimization'},
  {id:'flood',emoji:'🌊',label:'Prediction'},
  {id:'cyber',emoji:'💻',label:'Anomaly Detect'},
  {id:'recycling',emoji:'♻️',label:'Image Classify'},
  {id:'evacuation',emoji:'🚨',label:'Pathfinding'},
  {id:'economic',emoji:'📉',label:'Forecasting'},
  {id:'outbreak',emoji:'🦠',label:'Clustering'},
  {id:'strike',emoji:'🚌',label:'Route Optimize'},
  {id:'spill',emoji:'☣️',label:'Simulation'},
  {id:'wildfire',emoji:'🔥',label:'Sensor Fusion'},
  {id:'bias',emoji:'⚖️',label:'Fairness Audit'},
  {id:'migration',emoji:'👥',label:'Resource Plan'},
];
function getDoneScenarios(){const d={};try{for(const c of AI_CONCEPTS){if(localStorage.getItem('p3l18_'+c.id+'_done'))d[c.id]=1}}catch(e){}return d}
function countDone(){let n=0;try{for(const c of AI_CONCEPTS){if(localStorage.getItem('p3l18_'+c.id+'_done'))n++}}catch(e){}return n}
function renderConceptTracker(){
  const grid=document.getElementById('actGrid');if(!grid)return;
  const done=getDoneScenarios();let h='';let cnt=0;
  const activeId=(scenarioActive!==null&&Scenarios[scenarioActive])?Scenarios[scenarioActive].id:null;
  for(const c of AI_CONCEPTS){
    const d=!!done[c.id];if(d)cnt++;
    const active=(activeId===c.id)?' act-active':'';
    h+='<div class="act-cell'+(d?' done':'')+active+'" data-id="'+c.id+'"><span class="ac-icon">'+c.emoji+'</span><span class="ac-name">'+c.label+'</span></div>';
  }
  grid.innerHTML=h;
      const ct=document.getElementById('actCount');
  if(ct){
    ct.textContent=cnt+'/12 concepts mastered';
    if(cnt>=8)ct.innerHTML+=' · <span style="color:#fbbf24;cursor:pointer" onclick="showMasterCert18()">🏆 View Certificate</span>';
    else if(cnt>0)ct.innerHTML+=' · <span style="color:var(--text3);font-size:7px">'+cnt+' done</span>';
  }
  return cnt;
}
function showMasterCert18(){
  const cnt=countDone();
  document.getElementById('certScenariosDone').textContent=cnt;
  const grid=document.getElementById('certGrid18');if(!grid)return;
  const done=getDoneScenarios();
  grid.innerHTML=AI_CONCEPTS.map(c=>{
    const d=!!done[c.id];
    return '<div class="cert-item" style="'+(d?'':'opacity:.35')+'"><span class="cert-ci">'+c.emoji+'</span><span class="cert-cn">'+c.label+'</span><span class="cert-cd">'+(d?'Solved':'Not yet')+'</span></div>';
  }).join('');
  const st=document.getElementById('certStats18');
  if(st)st.innerHTML='⭐ '+cnt+'/12 scenarios completed · 🏆 '+renderScenarioStars()+' stars';
  document.getElementById('masterCert18').style.display='flex';
  // Nova congratulates
  setTimeout(()=>novaAnnounce(cnt>=8?'🎉 Amazing work! You practiced '+cnt+' AI concepts! Your city is truly AI-powered! I am so proud of you! 🏆':'You practiced '+cnt+' AI concepts so far. Keep solving scenarios to master them all!',{duration:8000}),500);
}
function renderScenarioStars(){try{const st=Game.state;let s=0;if(st?.score?.stars)s=st.score.stars;return'⭐'.repeat(Math.min(3,s))+'☆'.repeat(Math.max(0,3-s))}catch(e){return'☆☆☆'}}

// ── AI Concepts Exam ──
const EXAM_QUESTIONS=[
  {concept:'Optimization',emoji:'⚡',
    question:'A heatwave strains the power grid. Hospitals, homes, and AI data centers all need electricity. Nova tests thousands of plans in seconds to find the best balance. What AI method is this?',
    choices:[
      {text:'Prediction — forecasting when the heatwave will end',correct:false},
      {text:'Anomaly detection — spotting unusual grid patterns',correct:false},
      {text:'Optimization — trying many combinations to find the best one',correct:true},
      {text:'Sensor fusion — combining temperature sensors',correct:false},
    ],explanation:'Optimization is like trying every seat on a bus to find the most comfortable one, but a million times faster. AI tests thousands of power distribution plans in seconds to keep hospitals running while minimizing blackouts.'},
  {concept:'Prediction',emoji:'🌊',
    question:'River levels are rising. Nova uses past rainfall data and current water speed to estimate when flooding will happen. What AI method is this?',
    choices:[
      {text:'Pathfinding — finding evacuation routes',correct:false},
      {text:'Prediction — using past and current data to forecast the future',correct:true},
      {text:'Image classification — sorting satellite images',correct:false},
      {text:'Resource planning — allocating sandbags',correct:false},
    ],explanation:'Prediction is like knowing a glass will overflow before you pour too much. AI uses past data (rainfall records) and real-time data (river speed) to forecast what will happen next — giving people time to prepare.'},
  {concept:'Anomaly Detection',emoji:'💻',
    question:'Traffic lights suddenly all turn green at once at a major intersection during rush hour. Nova flags this as suspicious. What AI method is she using?',
    choices:[
      {text:'Route optimization — finding the fastest path',correct:false},
      {text:'Simulation — modeling traffic patterns',correct:false},
      {text:'Forecasting — predicting traffic flow',correct:false},
      {text:'Anomaly detection — spotting patterns that don\'t fit',correct:true},
    ],explanation:'Anomaly detection spots things that don\'t belong — like one kid in class suddenly wearing pyjamas. All-green lights at rush hour is so unusual that it\'s likely a problem (like a hack), not a coincidence.'},
  {concept:'Image Classification',emoji:'♻️',
    question:'A recycling robot needs to sort waste into plastic, metal, and paper. Each item looks different. Nova uses camera images to decide which bin each item goes into. What AI method is this?',
    choices:[
      {text:'Image classification — identifying what\'s in a picture',correct:true},
      {text:'Clustering — grouping similar items together',correct:false},
      {text:'Pathfinding — finding the path to the bin',correct:false},
      {text:'Fairness audit — checking if sorting is fair',correct:false},
    ],explanation:'Image classification teaches AI to recognize what\'s in a picture — like teaching a toddler to tell apart apples and oranges by showing them many examples. The AI learns: "if it looks like this, it goes in this bin."'},
  {concept:'Pathfinding',emoji:'🚨',
    question:'A wildfire is spreading. Nova needs to find the fastest escape route for every citizen while avoiding blocked roads. What AI method is this?',
    choices:[
      {text:'Simulation — modeling the fire spread',correct:false},
      {text:'Pathfinding — calculating the safest and fastest route',correct:true},
      {text:'Forecasting — predicting where the fire will go',correct:false},
      {text:'Resource planning — allocating fire trucks',correct:false},
    ],explanation:'Pathfinding is like GPS navigation — you tell it where you want to go, and it finds the best route avoiding traffic (or in this case, fire). Nova calculates escape routes for every citizen at once.'},
  {concept:'Sensor Fusion',emoji:'🔥',
    question:'A wildfire approaches. Satellite images show smoke, weather stations measure wind direction, and drones detect heat signatures. Each sensor gives different data. Nova combines them to get a complete picture. What AI method is this?',
    choices:[
      {text:'Prediction — forecasting fire spread',correct:false},
      {text:'Optimization — allocating firefighting resources',correct:false},
      {text:'Clustering — grouping hot spots',correct:false},
      {text:'Sensor fusion — combining multiple data sources',correct:true},
    ],explanation:'Sensor fusion is like asking 3 friends if they saw a lost cat. One says "under the bed," another says "I see it too," the third says "in the closet." You trust the two who agree. Nova combines all sensor data to make better decisions.'},
  {concept:'Fairness Audit',emoji:'⚖️',
    question:'Nova\'s AI recommends fewer bus stops in low-income neighborhoods because those routes have lower historical ridership. Is this decision fair?',
    choices:[
      {text:'Yes — the AI is just following the data',correct:false},
      {text:'No — the AI is amplifying existing inequality',correct:true},
      {text:'Yes — efficiency is more important than fairness',correct:false},
      {text:'No — but it\'s the most cost-effective solution',correct:false},
    ],explanation:'AI can learn and amplify historical biases. If low-income neighborhoods had fewer bus stops in the past, the AI might recommend even fewer — making inequality worse. Fairness auditing means checking: is this decision treating everyone fairly?'},
  {concept:'Clustering',emoji:'🦠',
    question:'During a disease outbreak, Nova groups infected patients by location and symptoms to find where the outbreak started and how it\'s spreading. What AI method is this?',
    choices:[
      {text:'Clustering — grouping similar data points together',correct:true},
      {text:'Pathfinding — tracing how the disease traveled',correct:false},
      {text:'Prediction — forecasting case numbers',correct:false},
      {text:'Simulation — modeling disease spread',correct:false},
    ],explanation:'Clustering finds natural groups in data — like sorting a pile of mixed LEGO bricks by color. Nova groups sick patients by location and symptoms to find the outbreak\'s source, like detectives connecting clues on a map.'},
  {concept:'Route Optimization',emoji:'🚌',
    question:'Bus drivers go on strike. Nova must redesign all bus routes with fewer drivers while still serving every neighborhood. She tests hundreds of route combinations. What AI method is this?',
    choices:[
      {text:'Prediction — forecasting bus demand',correct:false},
      {text:'Clustering — grouping similar neighborhoods',correct:false},
      {text:'Simulation — modeling traffic patterns',correct:false},
      {text:'Route optimization — finding the best route layout',correct:true},
    ],explanation:'Route optimization is like planning the most efficient way to visit 10 stores in one trip. AI tests many different route combinations and picks the one that serves the most people with the least resources.'},
  {concept:'Resource Planning',emoji:'👥',
    question:'A new wave of migrants arrives. Nova must decide how to allocate housing, schools, and hospitals across the city with limited budget. What AI method is this?',
    choices:[
      {text:'Anomaly detection — spotting unusual population patterns',correct:false},
      {text:'Image classification — sorting immigration photos',correct:false},
      {text:'Resource planning — allocating limited resources optimally',correct:true},
      {text:'Pathfinding — finding routes to new homes',correct:false},
    ],explanation:'Resource planning helps allocate limited resources where they\'re needed most — like a school principal deciding how to spend the annual budget across classrooms, teachers, and supplies. AI helps city planners make fair, data-driven decisions.'},
];

let examState=null; const examLetters=['A','B','C','D'];

function startExam(){
  document.getElementById('scenario-panel').style.display='none';
  document.getElementById('exam-scr').style.display='flex';
  document.getElementById('exam-complete').style.display='none';
  document.getElementById('exam-q-area').style.display='block';
  examState={q:0,correct:0,results:[]};
  showExamQ(0);
}
function showExamQ(idx){
  const q=EXAM_QUESTIONS[idx];
  if(!q){finishExam();return;}
  document.getElementById('exam-badge').textContent=q.emoji+' '+q.concept;
  document.getElementById('exam-count').textContent=(idx+1)+'/'+EXAM_QUESTIONS.length;
  document.getElementById('exam-question').textContent=q.question;
  document.getElementById('exam-feedback').style.display='none';
  document.getElementById('exam-progress-fill').style.width=((idx/EXAM_QUESTIONS.length)*100)+'%';
  const cEl=document.getElementById('exam-choices');
  cEl.innerHTML='';
  q.choices.forEach((c,i)=>{
    const btn=document.createElement('button');
    btn.className='exam-choice';
    btn.innerHTML='<span class="exam-letter">'+examLetters[i]+'</span>'+c.text;
    btn.onclick=()=>handleExam(idx,i);
    cEl.appendChild(btn);
  });
}
function handleExam(qIdx,cIdx){
  const q=EXAM_QUESTIONS[qIdx];
  const isCorrect=q.choices[cIdx].correct;
  if(isCorrect)examState.correct++;
  examState.results[qIdx]=isCorrect;
  document.querySelectorAll('#exam-choices .exam-choice').forEach((b,i)=>{
    b.disabled=true;
    b.classList.toggle('correct',q.choices[i].correct);
    if(i===cIdx&&!isCorrect)b.classList.add('wrong');
  });
  document.getElementById('exam-result').textContent=isCorrect?'✅ Correct!':'❌ Wrong';
  document.getElementById('exam-result').style.color=isCorrect?'#39FF14':'#FF6B35';
  document.getElementById('exam-concept-name').textContent='🧠 AI Concept: '+q.concept;
  document.getElementById('exam-explanation').textContent=q.explanation;
  document.getElementById('exam-feedback').style.display='block';
  const nb=document.getElementById('exam-next-btn');
  if(qIdx+1<EXAM_QUESTIONS.length){nb.textContent='Next →';nb.onclick=()=>showExamQ(qIdx+1);}
  else{nb.textContent='🎓 Results';nb.onclick=finishExam;}
}
function finishExam(){
  const total=EXAM_QUESTIONS.length,correct=examState.correct,pct=correct/total;
  const stars=pct>=0.9?3:pct>=0.7?2:pct>0?1:0;
  const titles={3:'🏆 City AI Master!',2:'👷 Senior Planner',1:'📖 AI Apprentice'};
  const msgs={3:'Perfect! You understand all 10 AI concepts. Your city is truly AI-powered!',
    2:'Great knowledge! You know most AI concepts. Try the exam again to master them all!',
    1:'Keep learning! Each question teaches an AI concept. Solving more scenarios will help!'};
  document.getElementById('exam-q-area').style.display='none';
  document.getElementById('exam-progress-fill').style.width='100%';
  document.getElementById('exam-stars').textContent='⭐'.repeat(stars)+'☆'.repeat(3-stars);
  document.getElementById('exam-score').textContent=correct+'/'+total+' Concepts Mastered';
  document.getElementById('exam-msg').innerHTML='<b>'+(titles[stars]||'📚 Keep Trying')+'</b><br>'+(msgs[stars]||'');
  document.getElementById('exam-recap').innerHTML=EXAM_QUESTIONS.map((q,i)=>{
    const ok=examState.results[i];
    return '<div style="display:flex;align-items:center;gap:4px;padding:3px 4px;background:rgba(255,255,255,0.03);border-radius:4px;font-size:10px">'+
      '<span>'+(ok?'✅':'❌')+'</span><span>'+q.emoji+'</span><span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+q.concept+'</span></div>';
  }).join('');
  document.getElementById('exam-complete').style.display='block';
}

// Wire exam button
document.addEventListener('DOMContentLoaded',()=>{
  const eb=document.getElementById('btn-exam');
  if(eb)eb.addEventListener('click',()=>{document.getElementById('scenario-panel').innerHTML='';startExam();});
  const ec=document.getElementById('exam-close-btn');
  if(ec)ec.addEventListener('click',()=>{
    document.getElementById('exam-scr').style.display='none';
    document.getElementById('exam-q-area').style.display='block';
    document.getElementById('exam-complete').style.display='none';
    document.getElementById('exam-scr').style.display='none';
    setPhase('scenarios');
  });
});

function startScenario(idx){
  const st=Game.state;
  Object.assign(scenarioState,{
    battery:100,supply:st.buildings.filter(b=>Game.BLD[b.type]?.p?.e).reduce((t,b)=>t+(Game.BLD[b.type].p.e||0),0),
    demand:st.buildings.length*0.7+8,sentiment:st.sim?.sentiment||70,power:100,water:80,cost:0,
    gridlock:50,emergency:0,spread:50,health:50,eff:90,equity:40,congestion:50,fires:50,debt:0,gdp:100,
    coverage:50,capacity:50,housing:0,fire:50,
    scr_crisis:50,
  });
  scenarioActive=idx;
  document.getElementById('scenario-panel').style.display='none';
  const dec=document.getElementById('scenario-decision');
  dec.style.display='block';
  applyCrisisEffect(idx);
  // Nova intro — includes AI concept name
  const s=Scenarios[idx];
  if(s.conceptCard)novaTeach(s.conceptCard.title,s.conceptCard.body,{duration:8000,prefix:'Scenario starting! This is about ',suffix:'. Listen closely and make good choices! 🎯'});
  else if(s.aiIntroNova)novaSpeak(typeof s.aiIntroNova==='function'?s.aiIntroNova(st):s.aiIntroNova,{duration:5000});
  renderStep(0);
  renderConceptTracker();
}

// ── Crisis Meter ──
function renderCrisisMeter(){
  if(scenarioActive===null)return'';
  const s=Scenarios[scenarioActive];
  if(!s||!s.meter)return'';
  const m=s.meter(scenarioState);
  if(!m)return'';
  const pct=Math.min(100,Math.max(0,Math.round(m.value/m.max*100)));
  const color=pct<40?'var(--success)':pct<70?'var(--warn)':'var(--danger)';
  return`<div class="crisis-meter"><div class="cm-label">${m.label}</div>
    <div class="cm-bar"><div class="cm-fill" style="width:${pct}%;background:${color};transition:width .5s"></div></div>
    <div class="cm-pct" style="color:${color}">${pct}%</div></div>`;
}

// ── Impact Bar Renderer ──
function renderImpacts(impacts){
  if(!impacts||!impacts.length)return'';
  return impacts.map(imp=>{
    const absVal=Math.abs(imp.val);
    const pct=Math.min(100,Math.round(absVal/imp.max*100));
    const color=imp.val>=0?'var(--success)':'var(--danger)';
    const sign=imp.val>=0?'+':'';
    return`<div class="impact-row"><span class="im-icon">${imp.icon||''}</span>
      <span class="im-label">${imp.label}</span>
      <span class="im-bar"><span class="im-fill" style="width:${pct}%;background:${color}"></span></span>
      <span class="im-val" style="color:${color}">${sign}${imp.val}</span></div>`;
  }).join('');
}

// ── Scenario Gauge Renderer ──
function renderGauge(){
  if(scenarioActive===null)return'';
  const s=Scenarios[scenarioActive];
  if(!s||!s.gauge)return'';
  const st=Game.state;
  const g=s.gauge(scenarioState,st);
  if(!g)return'';
  const pct=Math.min(100,Math.max(0,Math.round((g.value||0)/g.max*100)));
  const color=pct<40?'var(--success)':pct<70?'var(--warn)':'var(--danger)';
  return`<div class="sc-gauge"><span class="sg-label">${g.label}</span>
    <span class="sg-bar"><span class="sg-fill" style="width:${pct}%;background:${color}"></span></span>
    <span class="sg-val" style="color:${color}">${g.value}${g.unit||''}</span></div>`;
}

// ── Slider Renderer ──
function renderSlider(slider){
  if(!slider)return'';
  const val=scenarioState[slider.key]!==undefined?scenarioState[slider.key]:slider.default||slider.min;
  scenarioState[slider.key]=val;
  const ticks=[];
  for(let i=slider.min;i<=slider.max;i+=slider.step)ticks.push(i);
  return`<div class="sc-slider"><div class="ss-label">${slider.label}: <strong id="slider-val">${val}</strong> ${slider.unit||''}</div>
    <input type="range" min="${slider.min}" max="${slider.max}" step="${slider.step}" value="${val}"
      data-slider-key="${slider.key}" class="ss-range" oninput="window.updateSlider(this)">
    <div class="ss-ticks">${ticks.map(t=>`<span>${t}</span>`).join('')}</div></div>`;
}

// ── Data View Renderer ──
function renderDataView(items){
  if(!items||!items.length)return'';
  return`<div class="dv-panel">`+items.map(d=>{
    const pct=Math.min(100,Math.max(0,Math.round(d.value/d.max*100)));
    const color=pct<25?'var(--danger)':pct<50?'var(--warn)':'var(--success)';
    return`<div class="dv-row"><span class="dv-icon">${d.icon||''}</span>
      <span class="dv-label">${d.label}</span>
      <span class="dv-bar"><span class="dv-fill" style="width:${pct}%;background:${color}"></span></span>
      <span class="dv-val" style="color:${color}">${d.value}${d.unit||''}</span></div>`;
  }).join('')+`</div>`;
}

// ── Metrics Panel ──
function renderScenarioMetrics(){
  const sec=document.getElementById('sc-metrics');
  if(!sec)return;
  const st=Game.state;
  if(!st||!st.sim||scenarioActive===null){
    sec.style.display='none';return;
  }
  sec.style.display='block';
  const bars=document.getElementById('sm-bars');
  const stats=document.getElementById('sm-stats');
  if(!bars||!stats)return;
  const sys=['power','water','transport','health','waste','safety'];
  const lb={power:'⚡ Power',water:'💧 Water',transport:'🚚 Transport',health:'🏥 Health',waste:'🗑️ Waste',safety:'🛡️ Safety'};
  bars.innerHTML=sys.map(s=>{
    const h=st.sim.systems?.[s]?.health||0;
    const c=h>70?'var(--success)':h>40?'var(--warn)':'var(--danger)';
    return`<div class="sm-bar"><span class="smb-label">${lb[s]}</span>
      <span class="smb-track"><span class="smb-fill" style="width:${Math.round(h)}%;background:${c}"></span></span>
      <span class="smb-val">${Math.round(h)}%</span></div>`;
  }).join('');
  stats.innerHTML=`<span class="sm-stat">😊 <strong>${Math.round(st.sim.sentiment||0)}%</strong></span>
    <span class="sm-stat">🪙 <strong>${st.tokens.budget-st.tokens.spent}</strong>/<strong>${st.tokens.budget}</strong></span>`;
}

// ── Character Card Renderer ──
function renderCharacterCard(char){
  if(!char)return'';
  return`<div class="char-card"><div class="char-emoji">${char.emoji}</div><div class="char-body">
    <div class="char-name">${char.name}</div><div class="char-title">${char.title||''}</div>
    <div class="char-msg">"${char.message}"</div></div></div>`;
}

// ── Step Renderer ──
function renderStep(stepIdx){
  // Clear any running timer
  if(stepTimer){clearTimeout(stepTimer);stepTimer=null;}
  // Abandon scenario check — if negative, treat as outcome trigger
  if(stepIdx<0){showOutcome();return;}
  const s=Scenarios[scenarioActive];
  if(!s||!s.steps[stepIdx]){showOutcome();return;}
  const step=s.steps[stepIdx];
  const ss=scenarioState;
  const st=Game.state;
  // Update metrics & crisis stage
  renderScenarioMetrics();
  // Crisis stage progression based on scr_crisis
  const crisis=ss.scr_crisis||50;
  const stage=crisis>75?'critical':crisis>50?'worsening':crisis>25?'recovering':'resolved';
  if(s.id){
    $.grid.classList.remove('crisis-stage-critical','crisis-stage-worsening','crisis-stage-recovering','crisis-stage-resolved');
    const gw=document.getElementById('grid-wrap');
    if(gw)gw.classList.remove('crisis-stage-critical','crisis-stage-worsening','crisis-stage-recovering','crisis-stage-resolved');
    if(stage!=='resolved'){
      $.grid.classList.add('crisis-stage-'+stage);
      if(gw)gw.classList.add('crisis-stage-'+stage);
    }else{
      document.querySelectorAll('.crisis-affect').forEach(el=>{
        el.classList.add('resolve-flash');
        setTimeout(()=>el.classList.remove('resolve-flash','crisis-affect','crisis-bld'),800);
      });
      setTimeout(()=>$.grid.classList.remove('crisis-active','crisis-heat','crisis-flood','crisis-cyber','crisis-waste','crisis-evac','crisis-econ','crisis-health','crisis-strike','crisis-spill','crisis-fire','crisis-bias','crisis-migrate'),900);
    }
  }
  // Handle targeting mode
  if(step.target&&step.target.types&&step.target.types.length){
    enterTargetingMode(step.target,stepIdx);
  } else clearTargetingMode();
  // Dynamic ai text
  let aiText=typeof step.ai==='function'?step.ai(ss):step.ai;
  let hint='';
  if(step.target) hint=`<div style="font-size:10px;color:var(--warn);margin-bottom:4px">👆 Tap matching buildings on the grid, or use the button below</div>`;
  // Stage/progress badge
  const badge=step.stage?`<span class="stage-pill">${step.stage}</span>`:'';
  // Character card (replaces AI text for storytelling steps, shown above AI for regular steps)
  const charCard=renderCharacterCard(step.character);
  // Data view
  const dataView=renderDataView(step.dataView);
  // Gauge + Meter
  const gauge=renderGauge();
  const meter=renderCrisisMeter();
  // Countdown timer
  let timerHtml='';
  if(step.timer&&!step.slider){
    const sec=step.timer;
    timerHtml=`<div class="countdown-bar" data-seconds="${sec}"><div class="countdown-fill" style="animation-duration:${sec}s"></div><span class="countdown-label">⏱ ${sec}s</span></div>`;
    stepTimer=setTimeout(()=>{
      if(scenarioActive===null)return;
      const defaultIdx=step.defaultChoice!==undefined?step.defaultChoice:step.choices.length-1;
      applyChoice(stepIdx,defaultIdx);
    },sec*1000);
  }
  // Storytelling step or decision step
  let content='';
  if(step.storytelling){
    // Story beat — single Continue button
    content=`<div class="story-beat"><button class="sc-choice" onclick="applyChoice(${stepIdx},0)">▶ Continue</button></div>`;
  } else if(step.slider){
    content=renderSlider(step.slider);
    content+=`<div class="ss-confirm"><button class="sc-choice" onclick="applyChoice(${stepIdx},0)">✅ Confirm</button></div>`;
    if(step.choices[0]?.impacts)content+=renderImpacts(step.choices[0].impacts);
  } else {
    content=step.choices.map((c,i)=>{
      const imp=renderImpacts(c.impacts);
      return`<div><button class="sc-choice" onclick="applyChoice(${stepIdx},${i})">${c.text}</button>${imp}</div>`;
    }).join('');
  }
  // Fade transition
  const dec=document.getElementById('scenario-decision');
  dec.classList.add('out');
  setTimeout(()=>{
    if(step.storytelling){
      dec.innerHTML=`${badge}${gauge}${meter}${timerHtml}${dataView}${charCard}<div class="sc-decision"><div class="ai">🤖 ${aiText}</div></div>${content}`;
    } else {
      dec.innerHTML=`${badge}${charCard}${gauge}${meter}${timerHtml}${dataView}<div class="sc-decision"><div class="ai">🤖 ${aiText}</div>${hint}${content}</div>`;
    }
    dec.classList.remove('out');
  },150);
}

function applyChoice(stepIdx,choiceIdx){
  if(stepTimer){clearTimeout(stepTimer);stepTimer=null;}
  const s=Scenarios[scenarioActive];
  const step=s.steps[stepIdx];
  const choice=step.choices[choiceIdx];
  if(choice.apply)choice.apply(scenarioState);
  // Nova reaction
  if(choice.novaReact)novaSpeak(choice.novaReact,{duration:3000});
  // Choice flash
  const dec=document.getElementById('scenario-decision');
  const allBtns=dec.querySelectorAll('.sc-choice');
  allBtns.forEach(b=>{if(b.textContent.includes(choice.text.replace(/^[^ ]+ /,'')))b.classList.add('choice-clicked');});
  renderStep(choice.next!==undefined?choice.next:stepIdx+1);
  renderScenarioMetrics();
}

function showOutcome(){
  const s=Scenarios[scenarioActive];
  const out=s.outcome(scenarioState);
  const stars='⭐'.repeat(out.stars)+'☆'.repeat(3-out.stars);
  // Track scenario completion in localStorage for concept tracker
  if(s&&s.id){try{localStorage.setItem('p3l18_'+s.id+'_done','1')}catch(e){}}
  // Nova final verdict
  if(s.outcomeNova)novaSpeak(typeof s.outcomeNova==='function'?s.outcomeNova(out.stars):s.outcomeNova,{duration:6000});
  // Celebration
  triggerCelebration(out.stars);
  // Character reaction
  let charHtml='';
  if(s.outcomeCharacter){
    const cr=typeof s.outcomeCharacter==='function'?s.outcomeCharacter(out.stars):s.outcomeCharacter;
    if(cr)charHtml=`<div class="sc-char-reaction"><span class="char-emoji-sm">${cr.emoji}</span><div><b>${cr.name}:</b> ${cr.msg}</div></div>`;
  }
  // Render outcome
  const dec=document.getElementById('scenario-decision');
  dec.classList.add('out');
  setTimeout(()=>{
    dec.innerHTML=`<div class="sc-out"><div class="so-stars">${stars}</div>
    <div class="so-msg">${out.msg}</div>
    ${charHtml}
    <div class="so-lesson">📘 <b>${s.lesson}</b><br>${s.lg||''}</div>
    ${s.conceptCard?`<div class="sc-concept-card"><div class="sc-cc-title">🧠 AI Concept: ${s.conceptCard.title}</div><div class="sc-cc-body">${s.conceptCard.body}</div></div>`:''}
    <button class="btn-primary" onclick="backToMenu()">🔙 Back to Scenarios</button></div>`;
    dec.classList.remove('out');
    // Nova speaks the concept card aloud
    if(s.conceptCard)novaTeach(s.conceptCard.title,s.conceptCard.body,{duration:9000,prefix:'You just learned: ',suffix:'. Great job! 🎉'});
  },150);
}

let pendingPhase=null; // for abandon-check during phase dot transitions

function showAbandonModal(target){
  pendingPhase=target;
  q('aban-modal').style.display='flex';
}

function hideAbandonModal(){
  pendingPhase=null;
  q('aban-modal').style.display='none';
}

function doAbandon(){
  hideAbandonModal();
  // Hard reset scenario state
  scenarioActive=null;
  clearCrisisEffects();
  clearTargetingMode();
  document.getElementById('scenario-decision').style.display='none';
  document.getElementById('scenario-decision').innerHTML='';
  document.getElementById('scenario-panel').style.display='block';
  // If there's a pending phase transition, go there
  if(pendingPhase&&pendingPhase!=='scenarios'){
    const ph=pendingPhase;
    pendingPhase=null;
    setPhase(ph);
    return;
  }
  pendingPhase=null;
  renderScenarioMenu();
}

function backToMenu(){
  // If scenario is active (in progress or showing outcome), return to menu directly
  if(scenarioActive!==null){
    scenarioActive=null;
    clearCrisisEffects();
    document.getElementById('sc-metrics').style.display='none';
    document.getElementById('scenario-decision').style.display='none';
    document.getElementById('scenario-panel').style.display='block';
    renderConceptTracker();
    renderScenarioMenu();
    return;
  }
  scenarioActive=null;
  clearCrisisEffects();
  document.getElementById('sc-metrics').style.display='none';
  document.getElementById('scenario-decision').style.display='none';
  document.getElementById('scenario-panel').style.display='block';
  renderScenarioMenu();
}

// ── End ──
function showEnd(){
  Simulation.stop();Game.endSim();
  const st=Game.state;
  const doneCnt=countDone();
  $.endScr.style.display='flex';
  $.endStars.textContent='⭐'.repeat(st.score.stars)+'☆'.repeat(4-st.score.stars);
  const badges=['🆕 Apprentice','🏗️ Builder','🏆 Architect','🌟 Master','💎 Grand Master'];
  $.endBadge.textContent=badges[st.score.stars]||badges[0];
  $.endStats.innerHTML=`Buildings:${st.buildings.length} | Tokens:${st.tokens.spent}/${st.tokens.budget}<br>Graph edges:${st.graph.edges.length} | Crises:${st.sim.crisesDone}/3<br>Population:${Math.round(st.sim.pop)} | Sentiment:${st.sim.sentiment}%<br>🧠 AI concepts practiced: ${doneCnt}/12`;
  $.endNova.textContent=doneCnt>=8?'🏆 Outstanding! You practiced '+doneCnt+' AI concepts by solving city crises. Your city is AI-ready!':'Try more scenarios to practice more AI concepts. '+doneCnt+'/12 done so far.';
}

// ── Events ──
function bindEvents(){
  q('btn-start').addEventListener('click',()=>{
    $.intro.style.display='none';$.game.style.display='flex';Game.initState();setPhase('scan');Audio.click();
  });
  q('btn-quick').addEventListener('click',()=>{
    $.intro.style.display='none';$.game.style.display='flex';Game.initState();Game.quickStart();setPhase('design');Audio.click();
  });
  $.btnOptimise.addEventListener('click',()=>{
    // If we're coming from scan phase with hazards cleared, go to design
    if(Game.state.phase==='scan'){setPhase('design');return;}
    setPhase('optimise');
  });
  $.btnBack.addEventListener('click',()=>setPhase('design'));
  $.btnSim.addEventListener('click',()=>setPhase('simulate'));

  // Scan
  // Zoom controls
  function setZoom(z){
    zoomLevel=Math.max(0.25,Math.min(3,z));
    $.grid.style.transform='scale('+zoomLevel+')';
    const lbl=document.getElementById('zoom-label');
    if(lbl)lbl.textContent=Math.round(zoomLevel*100)+'%';
  }
  q('btn-zoom-in').addEventListener('click',()=>setZoom(zoomLevel+0.25));
  q('btn-zoom-out').addEventListener('click',()=>setZoom(zoomLevel-0.25));
  // Scroll-wheel zoom on the grid
  document.getElementById('grid-wrap').addEventListener('wheel',(e)=>{
    if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(zoomLevel-Math.sign(e.deltaY)*0.15);}
  },{passive:false});

  $.btnTurbo.addEventListener('click',()=>{
    scanTurbo=!scanTurbo;
    $.btnTurbo.textContent=scanTurbo?'⚡ Turbo ON':'⚡ Drag Turbo';
    $.btnTurbo.style.background=scanTurbo?'var(--warn)':'var(--bg3)';
    Audio.click();
  });
  $.btnScanDone.addEventListener('click',()=>{
    const s=Game.state;
    if(s.hazCleared<Game.HAZ){
      toast('⚠️ Find and remove all '+Game.HAZ+' hazards before building!','err');
      return;
    }
    scanActive=false;$.scanOl.style.display='none';Audio.click();
  });

  // ── Turbo drag-to-scan (simplified) ──
  let dragActive=false,lastKey='';
  const gEl=document.getElementById('grid');
  function tileFromPt(e){
    const cx=e.clientX||(e.touches?.[0]?.clientX);
    const cy=e.clientY||(e.touches?.[0]?.clientY);
    if(!cx||!cy)return null;
    const r=gEl.getBoundingClientRect();
    if(!r.width)return null;
    const c=Math.floor((cx-r.left)/r.width*Game.G);
    const ro=Math.floor((cy-r.top)/r.height*Game.G);
    if(c<0||c>=Game.G||ro<0||ro>=Game.G)return null;
    return{row:ro,col:c};
  }
  function scanOne(r,c){
    const k=r+','+c;
    if(k===lastKey)return;
    lastKey=k;
    const s=Game.state;
    if(!Game.ok(r,c)||Game.isW(r,c)||Game.isM(r,c)||s.scanned.has(k)||(s.scannedTurbo&&s.scannedTurbo.has(k)))return;
    const res=Game.scanTile(r,c,true);
    if(res&&res.res==='found'){
      toast('⚡ Hazard! ('+s.hazFound+'/'+Game.HAZ+')','err');
      document.getElementById('btn-remove').style.display='inline-flex';
    }
    document.getElementById('scan-haz').textContent='Hazards: '+s.hazFound+'/'+Game.HAZ+' | '+((s.scanned?.size||0)+(s.scannedTurbo?.size||0))+' scanned';
    renderGrid();updReqs();
  }
  // Scan a 4×4 area around a tile (for turbo tap and drag)
  function scanOneArea(r,c){
    for(let dr=0;dr<4;dr++)for(let dc=0;dc<4;dc++)scanOne(r+dr,c+dc);
  }
  gEl.addEventListener('pointerdown',(e)=>{if(!scanTurbo)return;dragActive=true;lastKey='';const p=tileFromPt(e);if(p)scanOneArea(p.row,p.col);e.preventDefault();});
  gEl.addEventListener('pointermove',(e)=>{if(!dragActive||!scanTurbo)return;const p=tileFromPt(e);if(p)scanOneArea(p.row,p.col);e.preventDefault();});
  document.addEventListener('pointerup',()=>{dragActive=false;lastKey='';});

  // Remove hazard
  $.btnRemove.addEventListener('click',()=>{
    const st=Game.state;if(st.removingH)return;
    const haz=st.hazards.find(([r,c])=>st.hazardResults[r+','+c]==='found');
    if(!haz){
      // Check if any hazard was missed by Turbo (tmiss status)
      const tmiss=st.hazards.find(([r,c])=>st.hazardResults[r+','+c]==='tmiss');
      if(tmiss){
        toast('⚡ Turbo missed this hazard! Switch to Normal mode and click the tile to confirm it.','warn');
        // Highlight the missed hazard tile
        const el=document.querySelector(`.gtile[data-r="${tmiss[0]}"][data-c="${tmiss[1]}"]`);
        if(el){el.style.outline='3px solid #fbbf24';el.style.outlineOffset='-2px';setTimeout(()=>{el.style.outline='';},3000);}
      } else {
        toast('No hazards to remove!','err');
      }
      return;
    }
    if(!Game.beginRem(haz[0],haz[1]))return;
    toast('⏳ Removing hazard...');$.btnRemove.disabled=true;renderGrid();
    setTimeout(()=>{
      const res=Game.completeRem(haz[0],haz[1]);
      if(res){
        toast('✅ Hazard removed! ('+res.c+'/'+Game.HAZ+')');
        Audio.complete();$.btnRemove.disabled=false;
        if(Game.state.hazCleared>=Game.HAZ){
          toast('🎉 All hazards cleared! Start building!');
          scanActive=false;$.scanOl.style.display='none';$.btnRemove.style.display='none';
          Game.findRoutes();
        }else $.btnRemove.style.display=Game.state.hazards.some(([r,c])=>Game.state.hazardResults[r+','+c]==='found'||Game.state.hazardResults[r+','+c]==='tmiss')?'inline-flex':'none';
        renderGrid();updReqs();
      }
    },1500);
  });

  // Layer toggles
  $.lyrBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      $.lyrBtns.forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      Game.state.layer=btn.dataset.l;renderGrid();Audio.click();
    });
  });

  // Config
  $.cfgClose.addEventListener('click',()=>{$.cfgPanel.style.display='none';Game.save();Audio.click();});

  // Sim speed
  $.speedBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      Game.state.sim.speed=parseInt(btn.dataset.sp);
      $.speedBtns.forEach(b=>b.classList.remove('active'));btn.classList.add('active');
      Audio.click();
    });
  });
  $.btnEndSim.addEventListener('click',showEnd);

  // Route trigger buttons
  q('btn-run-bus').addEventListener('click',()=>{Simulation.triggerRoute('bus');Audio.click();});
  q('btn-run-truck').addEventListener('click',()=>{Simulation.triggerRoute('waste');Audio.click();});

  // Grid click for scenario targeting mode
  $.gridWrap.addEventListener('click',function(e){
    if(!scenarioTargeting)return;
    const tile=e.target.closest('.gtile');
    if(!tile)return;
    const r=parseInt(tile.dataset.r);
    const c=parseInt(tile.dataset.c);
    if(isNaN(r)||isNaN(c))return;
    const bld=Game.bldAt(r,c);
    if(bld&&scenarioTargeting.types.includes(bld.type)){
      // Valid target clicked — trigger choice 0
      const idx=scenarioTargeting.stepIdx;
      clearTargetingMode();
      applyChoice(idx,0);
    } else {
      // Wrong tile — flash feedback
      tile.classList.add('target-miss');
      setTimeout(()=>tile.classList.remove('target-miss'),400);
    }
  });

  // End screen
  $.endRestart.addEventListener('click',()=>{$.endScr.style.display='none';Game.clearSave();Game.initState();setPhase('design');Audio.click();});
  $.endExport.addEventListener('click',()=>toast('📷 Screenshot your city!'));

  // Nova
  $.novaAv.addEventListener('click',()=>{$.novaInp.style.display='flex';$.novaInput.focus();});
  $.novaSend.addEventListener('click',processNova);
  $.novaInput.addEventListener('keydown',e=>{if(e.key==='Enter')processNova();});

  // Phase dots — clickable navigation
  document.querySelectorAll('.pd').forEach(dot=>{
    dot.addEventListener('click',()=>{
      const p=dot.dataset.p;
      // If a scenario is active, warn before leaving
      if(scenarioActive!==null&&p!=='scenarios'){
        showAbandonModal(p);
        return;
      }
      if(p==='scan'){setPhase('scan');return;}
      if(p==='design'&&Game.state.hazCleared<Game.HAZ){toast('Scan and clear all 3 hazards first!','err');return;}
      if(p==='optimise'&&!Game.minMet()){toast('Complete the design requirements first!','err');return;}
      if(p==='simulate'&&Game.state.phase!=='optimise'&&Game.state.phase!=='simulate'){toast('Complete the optimisation phase first!','err');return;}
      if(p==='design'){setPhase('design');return;}
      if(p==='optimise'){setPhase('optimise');return;}
      if(p==='simulate'){setPhase('simulate');return;}
      if(p==='scenarios'){setPhase('scenarios');return;}
      if(p==='exam'){setPhase('exam');return;}
    });
  });

  // Abandon modal buttons
  q('aban-continue').addEventListener('click',hideAbandonModal);
  q('aban-confirm').addEventListener('click',doAbandon);

  // Settings
  $.settingsBtn.addEventListener('click',()=>$.settingsScr.style.display='flex');
  $.sClose.addEventListener('click',()=>$.settingsScr.style.display='none');

  // Master certification back button
  document.getElementById('certBack18').addEventListener('click',()=>{document.getElementById('masterCert18').style.display='none'});

  // Teacher
  document.addEventListener('keydown',e=>{
    if(e.key==='`'){
      const c=prompt('Teacher:\n1:Reset\n2:Design\n3:Optimise\n4:Simulate\n5:+20 Tokens');
      if(c==='1'){Game.clearSave();Game.initState();setPhase('design');toast('Reset!');}
      if(c==='2')setPhase('design');
      if(c==='3')setPhase('optimise');
      if(c==='4')setPhase('simulate');
      if(c==='5'){Game.state.tokens.budget+=20;updTokens();toast('+20 tokens!');}
    }
  });
}

function processNova(){
  const text=$.novaInput.value.trim();if(!text)return;
  $.novaInput.value='';$.novaInp.style.display='none';
  Transcript.add('you',text);
  const addressed=/nova/i.test(text)||/^(hey|hello|hi)\b/i.test(text);
  if(!addressed&&text.length<15)return;
  $.novaBub.style.display='block';$.novaDot.className='dot thinking';
  setTimeout(()=>{
    const resp=Intents.match(text)||'I am Nova. Try asking about scanning, building, the knowledge graph, or simulation.';
    $.novaTxt.textContent=resp;$.novaDot.className='dot speaking';
    Transcript.add('nova',resp);
    if(!Settings.get('muted')){
      const u=new SpeechSynthesisUtterance(resp);u.rate=Settings.get('rate');u.volume=Settings.get('vol');
      const vn=Settings.get('voice');if(vn){const v=speechSynthesis.getVoices().find(v=>v.name===vn);if(v)u.voice=v;}
      u.onend=()=>{$.novaDot.className='dot idle';setTimeout(()=>$.novaBub.style.display='none',5000);};
      speechSynthesis.speak(u);
    }else{$.novaDot.className='dot idle';setTimeout(()=>$.novaBub.style.display='none',5000);}
  },400);
}

function toast(msg,type){
  const el=document.createElement('div');
  el.className='toast'+(type==='err'?' err':'');el.textContent=msg;
  $.toast.appendChild(el);setTimeout(()=>el.remove(),2500);
}

// Expose tutorial functions to global scope for onclick handlers in innerHTML
window.renderTutStep=renderTutStep;
window.tutNodeClick=tutNodeClick;
window.relPick=relPick;
window.startScenario=startScenario;
window.showConfig=showConfig;
window.tutNodeClick=tutNodeClick;
window.relPick=relPick;
window.applySug=applySug;
window.skipSug=skipSug;
window.finishTutorial=finishTutorial;
window.applyChoice=applyChoice;
window.backToMenu=backToMenu;
window.doAbandon=doAbandon;
window.hideAbandonModal=hideAbandonModal;
window.updateSlider=function(el){
  const key=el.dataset.sliderKey;
  if(key)scenarioState[key]=parseFloat(el.value);
  const l=document.getElementById('slider-val');
  if(l)l.textContent=el.value;
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
