/**
 * main.js — UI Controller for AI City Architect (P5-P6)
 * Handles design, optimize, simulate phases with full crisis management.
 */
(function() {
'use strict';

let $ = {};
function cacheDom() {
  const g = id => document.getElementById(id);
  $ = {
    intro:g('intro-overlay'), game:g('game'), grid:g('grid'), svg:g('grid-svg'), agents:g('agent-layer'),
    palette:g('palette'), tokenCount:g('token-count'), phaseName:g('phase-name'), phaseHint:g('phase-hint'),
    phaseSteps:document.querySelectorAll('#phase-bar .pstep'),
    infoBody:g('info-body'), infoActions:g('info-actions'), infoTitle:g('info-title'),
    configPanel:g('config-panel'), configBody:g('config-body'), configTitle:g('config-title'), configClose:g('config-close'),
    scanOverlay:g('scan-overlay'), scanModeLabel:g('scan-mode-label'), scanToggleBtn:g('scan-toggle-btn'),
    scanExitBtn:g('scan-exit-btn'), drillCount:g('drill-count'),
    designNextBtn:g('design-next-btn'), backToDesign:g('back-to-design'), simStartBtn:g('sim-start-btn'),
    scanBtn:g('scan-btn'), speedBar:g('speed-bar'), speedBtns:document.querySelectorAll('#speed-bar .speed-btn'),
    simClock:g('sim-clock'), simPop:g('sim-population'), simYear:g('sim-year'), endSimBtn:g('end-sim-btn'),
    designBtns:g('design-btns'), optimizeBtns:g('optimize-btns'), simBtns:g('sim-btns'),
    graphCanvas:g('graph-canvas'), graphEditor:g('graph-editor'), graphStatus:g('graph-status'),
    graphAnalyze:g('graph-analyze-btn'), graphDone:g('graph-done-btn'), graphRelBar:g('graph-relation-bar'),
    paletteSec:g('palette-section'), graphPalette:g('graph-palette'), miniDash:g('mini-dash'),
    dashFull:g('dash-full'), dashBars:g('dash-bars'), dashEvents:g('dash-events'), dashMetrics:g('dash-metrics'),
    dashEcon:g('dash-econ'), dashCrisis:g('dash-crisis'), crisisDesc:g('crisis-desc'), crisisActions:g('crisis-actions'),
    layerBtns:document.querySelectorAll('.layer-btn'),
    endScreen:g('end-screen'), endStars:g('end-stars'), endBadge:g('end-badge'), endStats:g('end-stats'),
    endNova:g('end-nova-msg'), endRestart:g('end-restart'), endExport:g('end-export'),
    toast:g('toast-container'), hiltModal:g('hilt-modal'), hiltTitle:g('hilt-title'), hiltDesc:g('hilt-desc'),
    hiltBody:g('hilt-body'), hiltResult:g('hilt-result'), hiltDone:g('hilt-done'), hiltBtn:g('hilt-btn'),
    novaAvatar:g('nova-avatar'), novaBubble:g('nova-bubble'), novaText:g('nova-text'),
    novaInputRow:g('nova-input-row'), novaInput:g('nova-input'), novaSend:g('nova-send'), novaDot:g('nova-dot'),
    settingsBtn:g('settings-btn'), settingsScreen:g('settings-screen'), sClose:g('s-close'),
    transcriptBtn:g('transcript-btn'), transcriptScreen:g('transcript-screen'), tClose:g('t-close'), tList:g('t-list'),
    clearLayerBtn:g('clear-layer-btn'),
  };
}

let palType = null, selBldId = null, scanActive = false;
let currentHilt = 0;

function init() {
  cacheDom();
  Settings.init();
  bindEvents();
  if (Game.loadSave()) {
    $.intro.style.display='none'; $.game.style.display='flex'; setPhase(Game.state.phase); toast('📂 Welcome back!');
  }
  setInterval(() => { if(Game.state.phase!=='intro') Game.save(); }, 15000);
}

function setPhase(phase) {
  const st = Game.state;
  st.phase = phase; Game.save();
  const order=['design','optimize','simulate'], idx=order.indexOf(phase);
  $.phaseSteps.forEach((el,i)=>{el.classList.toggle('active',i===idx);el.classList.toggle('done',i<idx);});
  $.designBtns.style.display=phase==='design'?'flex':'none';
  $.optimizeBtns.style.display=phase==='optimize'?'flex':'none';
  $.simBtns.style.display=phase==='simulate'?'flex':'none';
  $.speedBar.style.display=phase==='simulate'?'flex':'none';
  $.scanBtn.style.display=phase==='design'?'inline-flex':'none';
  $.clearLayerBtn.style.display=phase==='design'?'inline-flex':'none';
  $.paletteSec.style.display=phase==='design'?'block':'none';
  $.graphPalette.style.display=phase==='optimize'?'block':'none';
  $.graphCanvas.style.display=phase==='optimize'?'flex':'none';
  $.miniDash.style.display=phase==='simulate'?'block':'none';
  $.dashFull.style.display=phase==='simulate'?'block':'none';
  $.scanOverlay.style.display='none';
  $.hiltBtn.style.display=phase==='optimize'?'inline-flex':'none';

  const names={design:'🏗️ Design',optimize:'🔗 Optimize',simulate:'🎬 Simulate'};
  $.phaseName.textContent=names[phase]||'';
  $.phaseHint.textContent=phase==='design'?'Place buildings on 15×15 grid':phase==='optimize'?'Connect causal relationships, run HILT':'Watch city evolve';

  if(phase==='design')setupDesign();
  else if(phase==='optimize')setupOptimize();
  else if(phase==='simulate')setupSim();
}

function setupDesign() {
  renderGrid(); renderPalette(); updateTokens(); scanActive=false; palType=null; selBldId=null;
  updateNextBtn();
}

function renderGrid() {
  const st=Game.state, g=$.grid;
  g.innerHTML='';
  g.style.gridTemplateColumns=`repeat(${Game.GRID},1fr)`;
  for(let r=0;r<Game.GRID;r++) for(let c=0;c<Game.GRID;c++){
    const t=document.createElement('div');
    t.className='gtile '+(st.terrain[r][c]||'grass');
    t.dataset.r=r;t.dataset.c=c;
    const key=r+','+c;
    if(st.hazardResults[key]==='hazard') t.classList.add('hazard');
    else if(st.scanned[key]) t.classList.add('scanned-clear');
    const b=Game.bldAt(r,c);
    if(b){t.classList.add('has-bld');
      const e=document.createElement('span');e.className='bld-emoji';e.textContent=Game.BUILDINGS[b.type]?.emoji||'🏗️';t.appendChild(e);
      // Only show label if small enough
    }
    t.addEventListener('click',()=>onTile(r,c));
    g.appendChild(t);
  }
  renderConn();
}

function renderConn() {
  const svg=$.svg, rect=$.grid.getBoundingClientRect();
  if(!rect.width)return;
  const tw=rect.width/Game.GRID, th=rect.height/Game.GRID;
  svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
  svg.style.width=rect.width+'px';svg.style.height=rect.height+'px';
  let h='';
  Game.state.connections?.forEach(c=>{
    const f=Game.bldById(c.fromId),t=Game.bldById(c.toId);
    if(!f||!t)return;
    h+=`<line x1="${(f.col+0.5)*tw}" y1="${(f.row+0.5)*th}" x2="${(t.col+0.5)*tw}" y2="${(t.row+0.5)*th}" stroke="#475569" stroke-width="1.5"/>`;
  });
  svg.innerHTML=h;
}

function renderPalette() {
  const st=Game.state;
  $.palette.innerHTML='';
  Game.SYSTEMS.forEach(sys=>{
    const items=Object.entries(Game.BUILDINGS).filter(([_,d])=>d.sys===sys);
    if(!items.length)return;
    const lbl=document.createElement('div');lbl.className='pal-group';lbl.textContent=sys;$.palette.appendChild(lbl);
    items.forEach(([type,def])=>{
      const cnt=Game.countType(type), maxed=def.max!==undefined&&cnt>=def.max;
      const unaff=st.tokens.spent+def.cost>st.tokens.budget;
      const el=document.createElement('div');
      el.className='pal-item'+(maxed||unaff?' disabled':'')+(palType===type?' active':'');
      el.innerHTML=`<span class="emoji">${def.emoji}</span><span>${def.label}</span><span class="cost">🪙${def.cost}</span>`;
      el.addEventListener('click',()=>{if(maxed||unaff)return;palType=palType===type?null:type;renderPalette();Audio.click();});
      $.palette.appendChild(el);
    });
  });
}

function updateTokens(){$.tokenCount.textContent=Game.state.tokens.budget-Game.state.tokens.spent;}

function updateNextBtn(){
  if(Game.minMet()){$.designNextBtn.style.display='inline-flex';$.phaseHint.textContent='✅ Ready!';}
  else{$.designNextBtn.style.display='none';const m=Game.SYSTEMS.filter(s=>Game.sysBlds(s).length===0);$.phaseHint.textContent=m.length?'Need: '+m.join(', '):'Spend 40+ tokens';}
}

function onTile(r,c){
  const st=Game.state;
  if(scanActive&&st.phase==='design'){
    const res=Game.scanTile(r,c);
    if(res){toast(res.result==='hazard'?'⚠️ Hazard!':res.result==='clear'?'✅ Clear':res.result==='blocked'?'❌ Blocked':'');renderGrid();}
    return;
  }
  if(st.phase==='design'){
    const b=Game.bldAt(r,c);
    if(palType){
      const res=Game.place(palType,r,c);
      if(res.error){const msgs={Terrain:'Terrain!',Occupied:'Occupied!',Tokens:'No tokens!'};toast(msgs[res.error]||res.error,'err');}
      else{toast('✅ Placed!');if(st.hazardResults[r+','+c]==='hazard')setTimeout(()=>toast('⚠️ On hazard! 50% efficiency.','err'),500);
        renderGrid();renderPalette();updateTokens();updateNextBtn();Game.save();}
      return;
    }
    if(b){selBldId=b.id;showInfo(b);return;}
    selBldId=null;$.infoBody.innerHTML='<p class="muted">Tap a building.</p>';$.infoActions.style.display='none';
  }
}

function showInfo(b){
  const def=Game.BUILDINGS[b.type];
  if(!def)return;
  $.infoBody.innerHTML=`<div class="bld-detail"><div class="name">${def.emoji} ${def.label}</div><div class="sys">${def.sys}</div>
    <div class="status">${def.provides?Object.entries(def.provides).map(([k,v])=>`<span>→ ${k}: ${v}</span>`).join(''):''}
    ${def.consumes?Object.entries(def.consumes).map(([k,v])=>`<span>← ${k}: ${v}</span>`).join(''):''}
    ${b.efficiency<1?`<span class="stat-bad">⚠️ ${Math.round(b.efficiency*100)}%</span>`:''}</div></div>`;
  $.infoTitle.textContent='ℹ️ Info';$.infoActions.style.display='flex';
  let btns=`<button class="btn-sm" style="background:var(--danger);color:white" onclick="(function(){Game.remove(${b.id});setupDesign();Game.save();})()">Remove</button>`;
  if(def.sliders?.length>0)btns+=`<button class="btn-sm" style="background:var(--primary);color:#000" onclick="(function(){showConfig(${b.id})})()">⚙️ Configure</button>`;
  if(def.script)btns+=`<button class="btn-sm" style="background:var(--transport);color:#000" onclick="(function(){VisualScript.openEditor(${b.id},'${def.sys==='transport'?'drone':'bus'}');})()">📜 Script</button>`;
  $.infoActions.innerHTML=btns;
}

function showConfig(id){
  const b=Game.bldById(id), def=Game.BUILDINGS[b.type];
  if(!def?.sliders)return;
  $.configPanel.style.display='block';$.configTitle.textContent='⚙️ '+def.label;
  $.configBody.innerHTML=def.sliders.map(s=>{
    const sd=Game.SLIDERS[s]; if(!sd)return'';
    if(sd.options)return `<div class="config-row"><label>${sd.label}</label><select data-s="${s}" data-b="${id}">${sd.options.map(o=>`<option value="${o}" ${b.config[s]===o?'selected':''}>${o}</option>`).join('')}</select></div>`;
    const val=b.config[s]??sd.default??sd.min;
    return `<div class="config-row"><label>${sd.label}</label><input type="range" min="${sd.min}" max="${sd.max}" step="${sd.step||1}" value="${val}" data-s="${s}" data-b="${id}"><span class="val">${val}${sd.unit||''}</span></div>`;
  }).join('');
  $.configBody.querySelectorAll('input[type=range]').forEach(el=>{
    el.addEventListener('input',()=>{const val=parseInt(el.value);el.nextElementSibling.textContent=val+(Game.SLIDERS[el.dataset.s]?.unit||'');Game.updateConfig(parseInt(el.dataset.b),el.dataset.s,val);});
  });
  $.configBody.querySelectorAll('select').forEach(el=>{el.addEventListener('change',()=>Game.updateConfig(parseInt(el.dataset.b),el.dataset.s,el.value));});
}

// ── Optimize Phase ──
function setupOptimize(){
  Game.state.graph.selectedSource=null;
  Game.state.graph.selectedTarget=null;
  KnowledgeGraph.render($.graphEditor);
  document.querySelectorAll('.rel-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{KnowledgeGraph.addRelation(btn.dataset.rel);});
  });
  $.graphStatus.textContent=Game.state.graph.edges.length+'/10 edges';
  $.graphAnalyze.disabled=Game.state.graph.edges.length<10;
}

function runHILT(){
  const st=Game.state;
  const scenarios=st.hilt.scenarios;
  for(let i=0;i<scenarios.length;i++){
    if(!scenarios[i].done){showHILT(i);return;}
  }
  // All done
  $.hiltDone.style.display='none';
  $.simStartBtn.style.display='inline-flex';
  toast('🎉 All HILT scenarios complete!');
}

function showHILT(idx){
  const s=Game.state.hilt.scenarios[idx];
  if(!s||s.done)return;
  currentHilt=idx;
  $.hiltModal.style.display='flex';
  $.hiltTitle.textContent='👤 '+s.title;
  $.hiltDesc.textContent=s.desc;
  $.hiltBody.innerHTML=s.choices.map((c,i)=>`<button class="btn-secondary hilt-choice" data-idx="${i}" style="display:block;width:100%;margin:4px 0;text-align:left">${c.label}</button>`).join('');
  $.hiltResult.style.display='none';
  $.hiltDone.style.display='none';

  $.hiltBody.querySelectorAll('.hilt-choice').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const ci=parseInt(btn.dataset.idx), choice=s.choices[ci];
      s.done=true;
      Game.state.hilt.completed++;
      // Apply effects
      if(choice.effect.includes('tokens+'))Game.state.tokens.budget+=15;
      if(choice.effect.includes('sentiment-'))Game.state.sim.sentiment=Math.max(0,(Game.state.sim.sentiment||70)-10);
      if(choice.effect.includes('sentiment+'))Game.state.sim.sentiment=Math.min(100,(Game.state.sim.sentiment||70)+5);
      $.hiltResult.style.display='block';
      $.hiltResult.textContent='✅ Decision recorded. Effect: '+choice.effect;
      $.hiltDone.style.display='inline-block';
      Audio.click();
    },{once:true});
  });
  $.hiltDone.onclick=()=>{
    $.hiltModal.style.display='none';
    runHILT();
  };
}

// ── Sim Phase ──
function setupSim(){
  Simulation.init(()=>{
    const st=Game.state;
    if(st.sim?.time%1200<16)renderGrid();
  });
  Simulation.start();
}

// ── End ──
function showEnd(){
  Simulation.stop();
  Game.endSim();
  const st=Game.state;
  $.endScreen.style.display='flex';
  $.endStars.textContent='⭐'.repeat(st.score.stars)+'☆'.repeat(4-st.score.stars);
  const badges=['🆕 Apprentice','🏗️ Builder','🏆 Architect','🌟 Master','💎 Grand Master'];
  $.endBadge.textContent=badges[st.score.stars]||badges[0];
  $.endStats.innerHTML=`Buildings:${st.buildings.length} | Tokens:${st.tokens.spent}/${st.tokens.budget}<br>Graph edges:${st.graph.edges.length} | HILT:${st.hilt.completed}/3<br>Crises:${st.sim.crisesHandled}/4 | GDP:${Math.round(st.economics.gdp)} | Pop:${Math.round(st.sim.population)}`;
  $.endNova.textContent=st.score.stars>=3?'Outstanding city! Resilient, efficient, and well-governed!':'Good attempt! Try connecting more graph edges and handling all crises for a higher score.';
}

// ── Events ──
function bindEvents(){
  document.getElementById('intro-start').addEventListener('click',()=>{$.intro.style.display='none';$.game.style.display='flex';Game.initState();setPhase('design');Audio.click();});
  $.designNextBtn.addEventListener('click',()=>setPhase('optimize'));
  $.backToDesign.addEventListener('click',()=>setPhase('design'));
  $.simStartBtn.addEventListener('click',()=>setPhase('simulate'));

  // Scan
  $.scanBtn.addEventListener('click',()=>{scanActive=!scanActive;$.scanOverlay.style.display=scanActive?'flex':'none';Audio.click();});
  $.scanToggleBtn.addEventListener('click',()=>{Game.state.scanTurbo=!Game.state.scanTurbo;$.scanModeLabel.textContent=Game.state.scanTurbo?'⚡ Turbo':'🔍 Normal';Audio.click();});
  $.scanExitBtn.addEventListener('click',()=>{scanActive=false;$.scanOverlay.style.display='none';Audio.click();});
  // Drill (click grid tile while scan active and has drill)
  // Handled in onTile — but drill is separate from scan on the scan overlay
  // Add drill functionality: when scan is active, tapping a tile in scan mode does scan; we need a drill button
  // Actually, let's add drill as a button in the scan overlay
  const drillBtn = document.createElement('button');
  drillBtn.className = 'btn-sm';
  drillBtn.textContent = '🪜 Drill';
  drillBtn.addEventListener('click', () => {
    toast('Tap a tile to drill!');
    // Temporarily change tile click behavior
    const origHandler = onTile;
    // We'll handle it with a one-time override
    const drillHandler = (r,c) => {
      const res = Game.drillTile(r,c);
      if(res.error) toast(res.error,'err');
      else toast('✅ Drilled! Result: '+res.result);
      renderGrid();
      $.drillCount.textContent = '🪜 '+Game.state.drills+' drills';
      // Restore normal scan behavior after drill
      onTile = origHandler;
    };
    onTile = drillHandler;
    setTimeout(() => { onTile = origHandler; }, 5000); // timeout after 5s
  });
  $.scanOverlay.querySelector('.scan-info').appendChild(drillBtn);

  $.configClose.addEventListener('click',()=>{$.configPanel.style.display='none';Game.save();Audio.click();});

  // Layers
  $.layerBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      $.layerBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      Game.setLayer(btn.dataset.layer);
      Audio.click();
    });
  });

  // Graph
  $.graphAnalyze.addEventListener('click',()=>{
    const issues=Game.analyzeGraph();
    alert('🔍 AI Analysis:\n\n'+issues.map((s,i)=>(i+1)+'. '+s).join('\n'));
    Audio.click();
  });
  $.graphDone.addEventListener('click',()=>{
    if(Game.state.graph.edges.length<10){toast('Need 10+ edges!','err');return;}
    // Check if HILT needs running
    const hiltRemaining=Game.state.hilt.scenarios.filter(s=>!s.done).length;
    if(hiltRemaining>0){runHILT();}
    else{$.simStartBtn.style.display='inline-flex';toast('✅ Ready for simulation!');}
    Audio.click();
  });

  // HILT
  $.hiltBtn.addEventListener('click',runHILT);

  // Speed
  $.speedBtns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      Game.state.sim.speed=parseInt(btn.dataset.sp);
      $.speedBtns.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      Audio.click();
    });
  });
  $.endSimBtn.addEventListener('click',showEnd);

  // End screen
  $.endRestart.addEventListener('click',()=>{$.endScreen.style.display='none';Game.clearSave();Game.initState();setPhase('design');Audio.click();});
  $.endExport.addEventListener('click',()=>toast('📷 Screenshot your city!'));

  // Nova
  $.novaAvatar.addEventListener('click',()=>{$.novaInputRow.style.display='flex';$.novaInput.focus();});
  $.novaSend.addEventListener('click',processNova);
  $.novaInput.addEventListener('keydown',e=>{if(e.key==='Enter')processNova();});

  // Settings
  $.settingsBtn.addEventListener('click',()=>$.settingsScreen.style.display='flex');
  $.sClose.addEventListener('click',()=>$.settingsScreen.style.display='none');
  $.transcriptBtn.addEventListener('click',()=>{
    $.transcriptScreen.style.display='flex';
    if($.tList)$.tList.innerHTML=Transcript.getAll().map(e=>`<div class="t-entry"><span class="tw ${e.who}">${e.who==='nova'?'🤖 Nova':'🧑 You'}:</span> ${e.text}</div>`).join('');
  });
  $.tClose.addEventListener('click',()=>$.transcriptScreen.style.display='none');

  // Teacher
  document.addEventListener('keydown',e=>{
    if(e.key==='`'){
      const c=prompt('Teacher:\n1:Reset\n2:Design\n3:Optimize\n4:Sim\n5:+20 Tokens');
      if(c==='1'){Game.clearSave();Game.initState();setPhase('design');toast('Reset!');}
      if(c==='2')setPhase('design');
      if(c==='3')setPhase('optimize');
      if(c==='4')setPhase('simulate');
      if(c==='5'){Game.state.tokens.budget+=20;updateTokens();toast('+20 tokens!');}
    }
  });
}

function processNova(){
  const text=$.novaInput.value.trim();
  if(!text)return;
  $.novaInput.value='';$.novaInputRow.style.display='none';
  Transcript.add('you',text);
  const addressed=/nova/i.test(text)||/^(hey|hello|hi)\b/i.test(text);
  if(!addressed&&text.length<15)return;
  $.novaBubble.style.display='block';
  $.novaDot.className='dot thinking';
  setTimeout(()=>{
    const resp=Intents.match(text)||'I am Nova, your AI City co-pilot. Ask about buildings, graphs, economics, or crises.';
    $.novaText.textContent=resp;
    $.novaDot.className='dot speaking';
    Transcript.add('nova',resp);
    if(!Settings.get('muted')){const u=new SpeechSynthesisUtterance(resp);u.rate=Settings.get('rate');u.volume=Settings.get('volume');const vn=Settings.get('voice');if(vn){const v=speechSynthesis.getVoices().find(v=>v.name===vn);if(v)u.voice=v;}u.onend=()=>{$.novaDot.className='dot idle';setTimeout(()=>$.novaBubble.style.display='none',5000);};speechSynthesis.speak(u);}
    else{$.novaDot.className='dot idle';setTimeout(()=>$.novaBubble.style.display='none',5000);}
  },400);
}

function toast(msg,type){
  const el=document.createElement('div');
  el.className='toast'+(type==='err'?' err':'');
  el.textContent=msg;
  $.toast.appendChild(el);
  setTimeout(()=>el.remove(),2500);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
