import * as THREE from 'three';
import { renderDrivingCourse, loadDrivingAudi } from '../city-common/driving-presentation.js';
import { currentLang } from './i18n.js';
import { createProjectStore, ACTIVE_PROJECT_KEY } from '../city-common/project-store.js';
import { installedDrivingPair, recordDrivingAttempt } from '../city-common/driving-project.js';
import { createDrivingSession, schoolScenario, worldAt, pointAt, PHYSICS_DT } from '../city-common/driving-simulation.js';
import { findDrivingRoutes, cityDrivingScenario } from '../city-common/driving-routes.js';
import { projectToTrack } from '../city-common/driving.js';

const txt = (en, zh) => currentLang() === 'zh-Hant' ? zh : en;
const actionName = value => ({straight:txt('straight','直行'),'gentle-left':txt('gentle left','輕微左轉'),'gentle-right':txt('gentle right','輕微右轉'),'sharp-left':txt('sharper left','較急左轉'),'sharp-right':txt('sharper right','較急右轉'),go:txt('go','前進'),slow:txt('slow','減速'),stop:txt('stop','停車'),green:txt('green','綠燈'),red:txt('red','紅燈'),amber:txt('amber','黃燈'),none:txt('none','沒有'),occupied:txt('occupied','有人'),clear:txt('clear','暢通')}[value] || value);
const outcomeName = value => ({arrived:txt('arrived and stopped','到達並停車'),'safe-stop':txt('safe stop before barrier','在障礙物前安全停車'),collision:txt('collision','碰撞'),'lane-departure':txt('left the driving lane','離開行車線'),'off-road':txt('left the road','離開道路'),'red-light':txt('crossed on red','衝紅燈'),'amber-light':txt('crossed on amber with room to stop','有足夠停車距離仍衝黃燈'),'uncertain-model':txt('safe refusal: model unsure','安全停止：模型不確定'),'missing-input':txt('stopped: missing sensor reading','已停車：缺少感應讀數'),'invalid-input':txt('stopped: invalid sensor reading','已停車：感應讀數無效'),'runtime-failure':txt('stopped: model could not run','已停車：模型無法運行'),timeout:txt('time limit reached','已達時間上限'),cancelled:txt('cancelled','已取消')}[value] || value);
function describeDecision(record, bundle) {
  const fields=[['laneOffset','Lane offset','偏離行車線','m'],['headingError','Heading error','車頭角度誤差','rad'],['roadDirection','Road ahead','前方道路方向','rad'],['speed','Speed','車速','m/s'],['clearance','Forward clearance','前方空間','m'],['closingSpeed','Closing speed','接近速度','m/s'],['signal','Signal','交通燈',''],['signalDistance','Stop-line distance','停車線距離','m'],['crossing','Crossing','行人過路處',''],['bend','Bend severity','彎度','rad'],['finishDistance','Finish distance','終點距離','m']];
  const lines=fields.map(([key,en,zh,unit])=>`${txt(en,zh)}: ${typeof record.readings[key]==='number'?record.readings[key].toFixed(2):actionName(record.readings[key])} ${unit}`);
  for(const role of ['steering','speed']) {
    lines.push(`${role==='steering'?txt('Steering','轉向'):txt('Speed choice','車速選擇')}: ${actionName(record.requested[role])}`);
    for(const voter of record.controls?.[role]?.evidence||[]){
      lines.push(`  ${txt('Example','例子')} ${voter.id}: ${actionName(voter.label)} (${txt('similarity','相似度')} ${Math.round((1-voter.distance*voter.distance/2)*100)}%)`);
      const example=bundle?.models?.[role]?.examples.find(e=>e.id===voter.id);
      for(const [key,en,zh,unit] of fields)if(example?.readings?.[key]!==undefined){const value=example.readings[key];lines.push(`    ${txt(en,zh)}: ${typeof value==='number'?value.toFixed(2):actionName(value)} ${unit}`);}
    }
  }
  return [txt(`Position: x ${record.pose.x.toFixed(1)}, z ${record.pose.z.toFixed(1)} · ${record.t.toFixed(1)} s`,`位置：x ${record.pose.x.toFixed(1)}，z ${record.pose.z.toFixed(1)} · ${record.t.toFixed(1)} 秒`),...lines].join('\n');
}
const drills = [['straight','Stay in lane','保持行車線'],['left','Left bend','左彎'],['right','Right bend','右彎'],['s-bend','S-bend','S 彎'],['barrier','Brake before a barrier','障礙物前停車'],['signal','Red → green','紅燈 → 綠燈'],['amber','Amber: enough room to stop','黃燈：有足夠停車距離'],['moving-car','Wait and restart','等待後再開車'],['lead-car','Braking lead car','前車煞車'],['pedestrian','Occupied crossing','行人過路'],['mixed','Mixed journey','綜合路程']];
const drillGoals = {
  straight:['Keep a steady lane and stop at the destination.','保持穩定行車線，在終點停車。'],
  left:['Steer through a left bend without leaving the lane.','轉過左彎，同時保持行車線。'],
  right:['Steer through a right bend without leaving the lane.','轉過右彎，同時保持行車線。'],
  's-bend':['Change steering direction through two bends.','通過兩個彎位時改變轉向。'],
  barrier:['Brake early enough to stop before the barrier.','及早煞車，在障礙物前停車。'],
  signal:['Wait at red, restart at green, then finish.','紅燈停車，綠燈再開車，然後到達終點。'],
  amber:['Stop on amber when there is room to brake safely.','黃燈時如有足夠距離，安全煞車。'],
  'moving-car':['Wait for the crossing car to clear, then restart.','等待橫過的車輛離開，然後再開車。'],
  'lead-car':['Notice the lead car braking and keep a safe gap.','留意前車煞車，保持安全距離。'],
  pedestrian:['Stop for a person crossing; move when clear.','停車讓行人過路，路面暢通後前進。'],
  mixed:['Combine bends, a signal and a crossing vehicle.','綜合測試彎位、交通燈及橫過的車輛。'],
};
function releaseObject(root) { const seen=new Set();root?.traverse(o => { if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose();} for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) { if(seen.has(m))continue;seen.add(m);for(const texture of Object.values(m))if(texture?.isTexture&&!seen.has(texture)){seen.add(texture);texture.dispose();}m.dispose(); } }); root?.removeFromParent(); }
function block(root, w, h, d, color, x=0, y=0, z=0) { const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));mesh.position.set(x,y,z);root.add(mesh);return mesh; }

export function mountDrivingArena({ renderer, cityScene, getRoads, getSolids, getTraffic, openLegacy, onOpen }) {
  const store=createProjectStore(), lifetime=new AbortController();
  let active=false, generation=0, projectId=null, section=null, prepared=null, scenario=null, session=null, running=false, accumulator=0, saved=false, group=null, arenaScene=null, car=null, lamp=null, actors=[], releaseTraffic=null, routePreview=null, replay=null, loaded=false, frameSamples=[];
  const camera=new THREE.PerspectiveCamera(48,1,.1,3000);
  const panel=document.createElement('section');panel.className='driving-arena-panel';panel.hidden=true;
  panel.setAttribute('aria-label',txt('Driving school','駕駛學校'));
  panel.innerHTML=`<header><h2>${txt('Teach my Audi','教我的 Audi 駕駛')}</h2><button data-run>${txt('Run','開始')}</button><button data-close aria-label="${txt('Leave driving','離開駕駛')}">×</button></header>
    <p>${txt('Your steering and speed models drive together. Readings are simulated sensors.','你的轉向及車速模型一起駕駛。讀數來自模擬感應器。')}</p>
    <p data-session></p><p data-status role="status"></p>
    <nav class="driving-actions"><button data-skill>${txt('Practise a skill','練習一項技能')}</button><button data-mixed>${txt('Mixed journey','綜合路程')}</button><button data-city>${txt('My City roads','我的城市道路')}</button></nav><p data-course></p><p data-comparison></p>
    <label>${txt('Exercise','練習')} <select data-drill></select></label>
    <details><summary>${txt('Advanced details','進階資料')}</summary><p>${txt('These trials do not test unrestricted traffic, overtaking, parking or camera vision.','這些試行不測試自由交通、超車、泊車或鏡頭視覺。')}</p><p data-machine></p><label>${txt('Scenario seed (same number = same conditions)','情境編號（相同編號 = 相同條件）')} <input data-seed type="number" min="1" max="999999" step="1" value="71"></label></details>
    <label>${txt('Camera','鏡頭')} <select data-camera><option value="chase">${txt('Chase','跟車')}</option><option value="overhead">${txt('Overhead','俯視')}</option><option value="route">${txt('Whole route','整條路線')}</option></select></label>
    <div class="driving-actions"><button data-pause>${txt('Pause','暫停')}</button><button data-step>${txt('Step 0.05 s','單步 0.05 秒')}</button><button data-repeat>${txt('Repeat these conditions','重複這些條件')}</button><button data-new>${txt('Try new conditions','試試新條件')}</button></div>
    <div class="driving-actions"><a data-workshop>${txt('Edit in Workshop','到工作坊編輯')}</a><button data-legacy>${txt('Earlier driving machine','舊版駕駛機器')}</button></div>
    <div data-routes></div>
    <details><summary>${txt('Compare with a saved trial','與已儲存試行比較')}</summary><label>${txt('Previous result','上次結果')} <select data-history></select></label><button data-repeat-saved>${txt('Repeat with installed revision','用已安裝版本重試')}</button></details>
    <label>${txt('Replay a decision','重看決定')} <input data-replay type="range" min="0" max="0" value="0"></label>
    <details><summary>${txt('Sensors and influencing examples','感應器及影響決定的例子')}</summary><pre data-readings></pre><button data-improve>${txt('Improve this decision','改進這個決定')}</button></details>`;
  document.body.append(panel);

  const q=s=>panel.querySelector(s), say=s=>{q('[data-status]').textContent=s;};
  const scenarioSeed=()=>{const seed=Math.max(1,Math.min(999999,Math.floor(Number(q('[data-seed]').value)||71)));q('[data-seed]').value=seed;return seed;};
  function paintHistory(){const select=q('[data-history]');select.replaceChildren();for(const [i,attempt] of (section?.attempts||[]).entries()){select.add(new Option(`${attempt.scenario?.kind==='city'?txt('City route','城市路線'):txt(drills.find(d=>d[0]===attempt.scenario?.kind)?.[1]||'',drills.find(d=>d[0]===attempt.scenario?.kind)?.[2]||'')} · ${txt('Seed','情境編號')} ${attempt.scenario?.seed} · ${txt('Revision','版本')} ${attempt.revision} · ${outcomeName(attempt.outcome)}`,String(i)));}if(select.options.length)select.value=String(select.options.length-1);q('[data-repeat-saved]').disabled=!select.options.length;}
  for(const [id,en,zh] of drills) q('[data-drill]').add(new Option(txt(en,zh),id));
  const listen=(target,event,fn)=>target.addEventListener(event,fn,{signal:lifetime.signal});
  function workshopURL(repeat=false) { const url=new URL('../workshop/',location.href);url.searchParams.set('publishTarget','city');url.searchParams.set('skill','drive');url.searchParams.set('paired','1');if(repeat)url.searchParams.set('repeat','1');url.searchParams.set('returnTo',new URL('?activity=driving'+(repeat?'&repeat=1':''),location.href).href);return url.href; }
  q('[data-workshop]').href=workshopURL();
  function finishReservation(){releaseTraffic?.();releaseTraffic=null;}
  function clearScene(){finishReservation();session?.dispose();session=null;releaseObject(group);group=null;releaseObject(arenaScene);arenaScene=null;car=null;actors=[];lamp=null;loaded=false;}
  function close(){generation++;active=false;running=false;panel.hidden=true;document.body.classList.remove('driving-arena-open');clearScene();}
  function paint(){if(!active)return;const state=session?.snapshot();q('[data-run]').disabled=!loaded||!prepared?.ok||!!state?.outcome;q('[data-step]').disabled=q('[data-run]').disabled;q('[data-repeat]').disabled=!scenario;q('[data-replay]').max=Math.max(0,(session?.recordCount()||1)-1);const index=replay??Math.max(0,(session?.recordCount()||1)-1),record=session?.recordAt(index);if(replay===null)q('[data-replay]').value=index;q('[data-readings]').textContent=record?describeDecision(record,prepared?.bundle):txt('Run to inspect a decision.','開始後查看決定。');q('[data-improve]').disabled=!record;}
  async function setup(next) {
    const own=++generation;running=false;panel.scrollTop=0;clearScene();paint();section=await store.readSection('driving');if(own!==generation||!active)return;prepared=installedDrivingPair(section);scenario=next;saved=false;replay=null;accumulator=0;frameSamples=[];
    const course=next.roads?txt(`City route · ${Math.round(next.track.length)} m`,`城市路線 · ${Math.round(next.track.length)} 米`):txt(drills.find(d=>d[0]===next.kind)?.[1]||next.kind,drills.find(d=>d[0]===next.kind)?.[2]||next.kind);
    q('[data-session]').textContent=`${course} · ${txt('Revision','版本')} ${prepared?.bundle?.revision??'—'}`;
    q('[data-camera]').value='route';q('[data-machine]').textContent=prepared?.bundle?.machineId||'';
    q('[data-drill]').value=next.kind==='city'?'':next.kind;
    const turnSigns=next.track.segments.map((seg,i,all)=>i&&Math.abs(seg.heading-all[i-1].heading)>.002?Math.sign(seg.heading-all[i-1].heading):0).filter(Boolean);const bends=turnSigns.filter((sign,i)=>!i||sign!==turnSigns[i-1]).length;
    const encounters=[next.track.obstacles.length?txt('barrier','障礙物'):null,next.track.light?txt('traffic signal','交通燈'):null,...(next.actors||[]).map(a=>a.kind==='pedestrian'?txt('pedestrian crossing','行人過路處'):txt('moving vehicle','行駛車輛'))].filter(Boolean);
    q('[data-course]').textContent=(drillGoals[next.kind]?txt(...drillGoals[next.kind])+' ':'')+txt(`Bends: ${bends} · ${encounters.join(', ')||'clear road'}. Stay in lane; ${next.kind==='barrier'?'stop safely before the barrier (not a completed journey)':'reach the green destination area and stop'}.`,`${bends} 個彎位 · ${encounters.join('、')||'暢通道路'}。保持行車線；${next.kind==='barrier'?'在障礙物前安全停車（並非完成路程）':'到達綠色終點區並停車'}。`);
    const previous=(section?.attempts||[]).filter(a=>JSON.stringify(a.scenario)===JSON.stringify(next)).at(-1);
    q('[data-comparison]').textContent=previous?txt(`Previous: revision ${previous.revision} — ${outcomeName(previous.outcome)}. Current: revision ${prepared?.bundle?.revision??'—'} — ready.`,`上次：版本 ${previous.revision} — ${outcomeName(previous.outcome)}。目前：版本 ${prepared?.bundle?.revision??'—'} — 準備好了。`):txt('New conditions: a separate check.','新條件：獨立測試。');
    group=new THREE.Group();group.name='bounded-driving-trial';
    if(next.roads) cityScene.add(group);
    else {
      arenaScene=new THREE.Scene();arenaScene.background=new THREE.Color(0xdde9e5);arenaScene.add(new THREE.HemisphereLight(0xffffff,0x6c8071,2.5));
      const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-30,70,40);arenaScene.add(sun,group);
      block(group,400,.2,400,0x9dab8c,0,-.2,40);
    }
    ({lamp,actors}=renderDrivingCourse(group,next));
    if(prepared?.ok)session=createDrivingSession(next,prepared,{practiceEvidence:section?.practiced?.includes(JSON.stringify(next))});
    say(prepared?.ok?txt(`Revision ${prepared.bundle.revision} · loading Audi…`,`版本 ${prepared.bundle.revision} · 載入 Audi…`):modelProblem());
    paint();
    try {
      const loadedCar=await loadDrivingAudi();
      if(own!==generation||!active){releaseObject(loadedCar);return;}
      car=loadedCar;group.add(car);loaded=true;
      say(prepared?.ok?txt(`Revision ${prepared.bundle.revision}. Preview the route, then Run.`,`版本 ${prepared.bundle.revision}。查看路線後開始。`):modelProblem());paint();
    }catch(error){if(own!==generation)return;say(txt('Audi could not load. Repeat to retry: ','Audi 無法載入，請按重複再試：')+error.message);loaded=false;paint();}
  }
  function modelProblem(){return !section?.installed?txt('Teach both models in Workshop first.','請先在工作坊教導兩個模型。'):txt('The installed pair is incompatible or damaged. Republish it from Workshop. ','已安裝的模型組合不相容或損壞，請從工作坊重新發佈。 ')+(prepared?.error||'');}
  async function open(){close();onOpen?.();active=true;panel.hidden=false;paint();document.body.classList.add('driving-arena-open');const own=++generation;say(txt('Opening your driving machine…','開啟你的駕駛機器…'));try{const project=await store.openActiveProject();section=await store.readSection('driving');if(own!==generation)return;projectId=project.id;prepared=installedDrivingPair(section);paintHistory();const requested=new URLSearchParams(location.search).get('exercise');let next=schoolScenario(drills.some(d=>d[0]===requested)?requested:'mixed',scenarioSeed());if(new URLSearchParams(location.search).get('repeat')==='1'&&section?.correction?.scenario){next=JSON.parse(section.correction.scenario);q('[data-seed]').value=next.seed;if(next.kind!=='city')q('[data-drill]').value=next.kind;}await setup(next);}catch(error){say(error.message);}}
  function reserve(){if(!scenario.roads||releaseTraffic)return;if(scenario.geometryFingerprint!==JSON.stringify([getRoads(),getSolids()])){throw new Error(txt('Roads changed. Find routes again.','道路已改動，請重新尋找路線。'));}releaseTraffic=getTraffic()?.reserveTrialRegion((x,z,pad)=>{const p=projectToTrack(scenario.track,x,z);return Math.hypot(x-p.x,z-p.z)<scenario.track.width+10+pad;})||(()=>{});}
  async function completed(){if(saved||!session?.snapshot().outcome)return;saved=true;running=false;panel.scrollTop=0;finishReservation();const evidence=session.evidence();const times=[...frameSamples].sort((a,b)=>a-b);evidence.displayPerformance={sampleCount:times.length,medianFrameMs:times[Math.floor(times.length*.5)]||null,p95FrameMs:times[Math.floor(times.length*.95)]||null,maxFrameMs:times.at(-1)||null};const own=projectId;const previous=(section?.attempts||[]).filter(a=>JSON.stringify(a.scenario)===JSON.stringify(scenario)).at(-1);q('[data-comparison]').textContent=(previous?txt(`Previous revision ${previous.revision}: ${outcomeName(previous.outcome)}. `,`上次版本 ${previous.revision}：${outcomeName(previous.outcome)}。 `):'')+txt(`Current revision ${evidence.revision}: ${outcomeName(evidence.outcome)}${evidence.practice?' (practice)':''}.`,`目前版本 ${evidence.revision}：${outcomeName(evidence.outcome)}${evidence.practice?'（練習）':''}。`);say(txt(`${evidence.practice?'Practice':'Result'}: ${outcomeName(evidence.outcome)} · ${evidence.violations.length} violations · ${evidence.interventions.length} interventions.`,`${evidence.practice?'練習':'結果'}：${outcomeName(evidence.outcome)} · ${evidence.violations.length} 次違規 · ${evidence.interventions.length} 次介入。`));const result=await store.mutate(project=>{if(project.id!==own)return null;return recordDrivingAttempt(project,evidence);},{reason:'driving-attempt',versioned:false});if(result.ok&&projectId===own){section.attempts=[...(section.attempts||[]).slice(-2),evidence];paintHistory();}if(!result.ok&&active)say(txt('Run finished, but its evidence could not be saved.','試行已完成，但無法儲存記錄。'));paint();}
  function step(){if(!session||!loaded)return;try{reserve();session.pause(false);session.step();completed().catch(error=>say(error.message));paint();}catch(error){running=false;finishReservation();say(error.message);}}
  listen(q('[data-close]'),'click',close);
  listen(q('[data-run]'),'click',()=>{replay=null;running=true;accumulator=0;say(txt('Driving…','駕駛中…'));});
  listen(q('[data-pause]'),'click',()=>{running=false;session?.pause();say(txt('Paused.','已暫停。'));});
  listen(q('[data-step]'),'click',()=>{running=false;replay=null;step();});
  listen(q('[data-skill]'),'click',()=>{q('[data-drill]').value='straight';q('[data-routes]').replaceChildren();setup(schoolScenario('straight',scenarioSeed()));});
  listen(q('[data-mixed]'),'click',()=>{q('[data-drill]').value='mixed';q('[data-routes]').replaceChildren();setup(schoolScenario('mixed',scenarioSeed()));});
  listen(q('[data-new]'),'click',()=>{q('[data-seed]').value=scenarioSeed()%999999+1;if(scenario?.roads){finishReservation();q('[data-city]').click();}else setup(schoolScenario(q('[data-drill]').value,scenarioSeed()));});
  listen(q('[data-repeat]'),'click',()=>setup(scenario));
  listen(q('[data-repeat-saved]'),'click',()=>{const attempt=section?.attempts?.[Number(q('[data-history]').value)];if(!attempt?.scenario)return;q('[data-seed]').value=attempt.scenario.seed;if(attempt.scenario.kind!=='city')q('[data-drill]').value=attempt.scenario.kind;setup(JSON.parse(JSON.stringify(attempt.scenario)));});
  listen(q('[data-drill]'),'change',()=>setup(schoolScenario(q('[data-drill]').value,scenarioSeed())));
  listen(q('[data-seed]'),'change',()=>{q('[data-routes]').replaceChildren();if(scenario?.roads)q('[data-city]').click();else setup(schoolScenario(q('[data-drill]').value||'straight',scenarioSeed()));});
  listen(q('[data-replay]'),'input',()=>{running=false;replay=Number(q('[data-replay]').value);paint();});
  listen(q('[data-legacy]'),'click',()=>{close();openLegacy?.();});
  listen(q('[data-city]'),'click',()=>{
    generation++;running=false;clearScene();scenario=null;q('[data-session]').textContent=txt('My City roads','我的城市道路');q('[data-course]').textContent='';q('[data-comparison]').textContent='';paint();routePreview=findDrivingRoutes(getRoads(),{solids:getSolids()});q('[data-routes]').replaceChildren();
    for(const [i,route] of routePreview.routes.entries()){const candidate=cityDrivingScenario({...route,geometryFingerprint:routePreview.fingerprint},scenarioSeed());const encounters=candidate.encounters.map(id=>({lane:txt('lane keeping','保持行車線'),finish:txt('finish braking','終點煞車'),signal:txt('signal','交通燈'),crossing:txt('crossing','行人過路')}[id])).join(' + ');const button=document.createElement('button');button.textContent=txt(`Route ${i+1}: ${Math.round(route.track.length)} m · ${encounters}`,`路線 ${i+1}：${Math.round(route.track.length)} 米 · ${encounters}`);button.onclick=()=>setup(candidate);q('[data-routes]').append(button);}
    if(!routePreview.routes.length){const message=document.createElement('p');const reasons={ 'malformed-roads':txt('Road data is invalid.','道路資料無效。'),'insufficient-length':txt('No connected route reaches 40 metres.','沒有達到 40 米的連接路線。'),'narrow-clearance':txt('The Audi needs more road clearance.','Audi 需要更闊的道路空間。'),'unsupported-turn':txt('The available turn is too tight or uses a roundabout.','彎位太窄或經過迴旋處。'),obstructed:txt('A building or solid prop obstructs the route.','建築物或物件阻擋路線。')};message.textContent=routePreview.reasons.map(r=>reasons[r]||r).join(' ');const link=document.createElement('a');link.href='../planner/';link.textContent=txt('Open Planner','開啟規劃器');q('[data-routes]').append(message,link);}
    say(routePreview.routes.length?txt('Choose a route below to preview its encounters.','選擇下方路線，預覽沿途情況。'):txt('No suitable City route. See the reasons below.','沒有合適的城市路線，請查看下方原因。'));q('[data-routes]').scrollIntoView({block:'nearest'});
  });
  listen(q('[data-improve]'),'click',async()=>{running=false;const index=replay??session.recordCount()-1,record=session.recordAt(index);if(!record)return;const correction={machineId:prepared.bundle.machineId,revision:prepared.bundle.revision,readings:record.readings,scenario:JSON.stringify(scenario)};const result=await store.mutate(project=>{if(project.id!==projectId)return null;project.projects.driving.correction=correction;return project;},{reason:'driving-correction',versioned:false});if(result.ok)location.href=workshopURL(true);else say(txt('Could not save this decision.','無法儲存這個決定。'));});
  listen(document,'visibilitychange',()=>{if(document.hidden){running=false;session?.pause();}});
  listen(renderer.domElement,'webglcontextlost',close);
  listen(window,'pagehide',close);
  listen(window,'keydown',event=>{if(active&&event.key==='Escape')close();});
  function render(dt){
    if(!active)return false;
    if(projectId&&localStorage.getItem(ACTIVE_PROJECT_KEY)!==projectId){close();return false;}
    if(scenario?.roads&&scenario.geometryFingerprint!==JSON.stringify([getRoads(),getSolids()])){generation++;running=false;clearScene();scenario=null;q('[data-city]').click();say(txt('Roads changed. Choose a freshly checked route.','道路已改動，請選擇重新檢查的路線。'));paint();}
    if(running&&!document.hidden){frameSamples.push(dt*1000);if(frameSamples.length>3600)frameSamples.shift();accumulator+=Math.min(.2,dt);let steps=0;while(accumulator>=PHYSICS_DT&&steps++<4){step();accumulator-=PHYSICS_DT;if(!running)break;}}
    const record=replay===null?session?.recordAt(Math.max(0,(session?.recordCount()||1)-1)):session?.recordAt(replay);
    const state=session?.snapshot();let pose=record?.pose||state?.car|| (scenario?{...pointAt(scenario.track,3),speed:0}:null);
    if(record&&running&&replay===null){const alpha=Math.min(1,accumulator/PHYSICS_DT),a=record.before,b=record.pose;pose={...b,x:a.x+(b.x-a.x)*alpha,z:a.z+(b.z-a.z)*alpha,heading:a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*alpha};}
    if(pose){if(car){car.position.set(pose.x,.15,pose.z);car.rotation.y=pose.heading;}
      const overhead=q('[data-camera]').value==='overhead';const target=new THREE.Vector3(pose.x,1,pose.z);
      if(q('[data-camera]').value==='route'){
        const xs=scenario.track.points.map(p=>p.x),zs=scenario.track.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
        const canvasWidth=renderer.domElement.clientWidth,canvasHeight=renderer.domElement.clientHeight;
        const aspect=(canvasWidth>760?Math.max(200,canvasWidth-panel.offsetWidth-54):canvasWidth)/canvasHeight;
        target.set((minX+maxX)/2,0,(minZ+maxZ)/2);
        const height=Math.max(45,Math.max((maxX-minX)/aspect,maxZ-minZ)*.75/Math.tan(camera.fov*Math.PI/360));
        camera.position.copy(target).add(new THREE.Vector3(0,height,.1));
      }else camera.position.copy(target).add(overhead?new THREE.Vector3(0,42,.1):new THREE.Vector3(-Math.sin(pose.heading)*13,8,-Math.cos(pose.heading)*13));camera.lookAt(target);
      const t=record?.t??state?.t??0,world=worldAt(scenario,t);if(lamp)lamp.material.color.setHex([0x62bc7a,0xe5b143,0xe15b47][world.signal]);
      for(const [actorId,{mesh}] of actors.entries()){const p=world.obstacles.find(o=>o.actorId===actorId);mesh.visible=!!p;if(p){mesh.position.set(p.x,.8,p.z);mesh.rotation.y=p.heading;}}
    }
    const canvasWidth=renderer.domElement.clientWidth,canvasHeight=renderer.domElement.clientHeight;
    camera.aspect=canvasWidth/canvasHeight;
    if(canvasWidth>760)camera.setViewOffset(canvasWidth,canvasHeight,-(panel.offsetWidth+36)/2,0,canvasWidth,canvasHeight);else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    try{renderer.render(arenaScene||cityScene,camera);}catch(error){close();throw error;}
    return true;
  }
  return {open,close,render,get state(){return {...session?.snapshot(),running,loaded,revision:prepared?.bundle?.revision};},get active(){return active;},destroy(){close();lifetime.abort();panel.remove();store.close();}};
}
