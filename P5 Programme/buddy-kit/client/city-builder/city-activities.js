import { renderDrivingCourse, loadDrivingAudi } from '../city-common/driving-presentation.js';
import { SCHOOL_PREVIEW, SCHOOL_BOUNDS } from '../city-common/driving-school-site.js';
import { pointAt } from '../city-common/driving-simulation.js';
import { resolveExercise, resultDataset } from '../city-common/recycling-exercises.js';
import { recyclingEditsPending } from '../city-common/recycling-machine-project.js';
import { runRecyclingMachine } from '../city-common/recycling-machine-host.js';
import { LIBRARY } from '../city-common/library.js';
import { itemTargetBounds, uniformScaleForBounds } from '../city-common/model-scale.js';
import { vehicleTargetLength } from '../city-common/vehicle-scale.js';
import { commitReward, flushRewardSaves } from '../city-common/reward-persistence.js';
import { registerWorkspaceAdapter } from '../city-common/workspace.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createWaste as createMaterial, WASTE as MATERIALS, neutralWaste } from '../city-common/city-waste-v2.js';
import { createWaste, WASTE } from '../city-common/city-waste.js';
import { ActivityTrial, ACTIVITY_SITES, siteSkill, placeActivitySites } from '../city-common/activity-trial.js';
import { SCHOOL_TRACKS, checkDriveCompatibility, lightStateAt } from '../city-common/driving.js';
import { checkCompatibility, selectItems, BINS, materialLabel } from '../city-common/recycling.js';
import { readSorterSession, resolveSorterSelection, binCounts, binFullness } from '../city-common/sorter-session.js';
import { createProjectStore, PROJECT_EVENT, ACTIVE_PROJECT_KEY } from '../city-common/project-store.js';
import { currentLang } from './i18n.js';
import { createGLTFLoader } from '../shared/gltf.js';

const text = (en,zh) => currentLang()==='zh-Hant'?zh:en;
const mat = color => new THREE.MeshStandardMaterial({color,roughness:.75});
function box(g,w,h,d,color,x=0,y=0,z=0) { const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.receiveShadow=true;g.add(m);return m; }
function dispose(root) {root.traverse(o=>{o.geometry?.dispose();if(o.material?.map)o.material.map.dispose();o.material?.dispose();o.element?.remove();});root.removeFromParent();}
function sign(g,label,x,y,z,width=9) {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#21453f';ctx.fillRect(0,0,768,128);ctx.fillStyle='#faf4df';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,384,64,730);
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),side:THREE.DoubleSide}));mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
function station(root) {
  for(const [x,z,w,d] of [[-.5,-1,10,5],[0,4,21,4],[-8.3,-1,7.2,4],[3,-6.75,14.5,8.5]])box(root,w,.12,d,0xb6b9a5,x,.06,z);
  box(root,9,.35,2,0x334345,-.5,1.8,-1);
  for(let x=-4.8;x<=3;x+=.55)box(root,.045,.03,1.9,0x738580,x,2,-1);
  for(const x of [-4,2])for(const z of [-1.6,-.4])box(root,.2,1.8,.2,0x354b48,x,.9,z);
  for(const z of [-2.25,.25])box(root,.35,3,.35,0xe9c768,-1,2,z);
  box(root,.5,.35,3,0xe9c768,-1,3.5,-1);
  const diverter=box(root,2,.18,.35,0xd8e6d9,3,2,-1);
  const bins={};
  const meters={},contents={};
  for(const [i,entry] of BINS.entries()) {
    const label=entry.label,x=-8.4+i*2.8,z=4,color=Number(entry.color.replace('#','0x'));
    box(root,2.4,.15,2.5,color,x,.18,z);
    for(const dx of [-1.15,1.15])box(root,.15,1.45,2.5,color,x+dx,.85,z);
    box(root,2.4,1.45,.15,color,x,.85,z+1.2);box(root,2.4,.8,.15,color,x,.48,z-1.2);
    bins[entry.id]=new THREE.Vector3(x,.8,z);
    contents[entry.id]=new THREE.Group();root.add(contents[entry.id]);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const texture=new THREE.CanvasTexture(canvas);
    const meter=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.3),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));meter.position.set(x,2.1,z+1.9);meter.rotation.x=-Math.PI/4;root.add(meter);
    meters[entry.id]={canvas,texture,last:null};
  }
  sign(root,text('CITY RECYCLING','城市回收站'),3,10.5,-2.4,11);
  const waiting=new THREE.Group();root.add(waiting);
  const loader=createGLTFLoader();
  for(const [id,x,z,rotation] of [['veh_garbage_kc',-8.4,-1,-Math.PI/2],['bld_kenney_industrial_a',3,-6.75,0]]) {
    const item=LIBRARY.find(item=>item.id===id);
    loader.loadAsync(item.glb).then(gltf=>{const model=gltf.scene;const bounds=new THREE.Box3().setFromObject(model);const size=bounds.getSize(new THREE.Vector3());
      model.scale.setScalar(item.category==='vehicles'?vehicleTargetLength(item)/Math.max(size.x,size.y,size.z):uniformScaleForBounds(size,itemTargetBounds(item)));
      model.rotation.y=rotation;bounds.setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.set(x-center.x,-bounds.min.y,z-center.z);root.add(model);
    }).catch(()=>{});
  }
  return {diverter,bins,meters,waiting,contents};
}
function previewSchool(root){
 const group=new THREE.Group();group.name='mixed-driving-school';group.position.set(-SCHOOL_BOUNDS.cx,0,-SCHOOL_BOUNDS.cz);root.add(group);
 box(group,SCHOOL_BOUNDS.w,.16,SCHOOL_BOUNDS.d,0xadb7a0,SCHOOL_BOUNDS.cx,-.1,SCHOOL_BOUNDS.cz);
 renderDrivingCourse(group,SCHOOL_PREVIEW);sign(group,text('DRIVING SCHOOL','AI 駕駛學校'),0,3.8,-5,12);
 let cancelled=false;const retry=document.createElement('button');retry.textContent=text('Audi loading…','載入 Audi…');retry.disabled=true;const label=new CSS2DObject(retry);label.position.set(0,3,3);group.add(label);
 async function load(){retry.disabled=true;try{const car=await loadDrivingAudi();if(cancelled){dispose(car);return;}const p=pointAt(SCHOOL_PREVIEW.track,3);car.position.set(p.x,.15,p.z);car.rotation.y=p.heading;group.add(car);label.removeFromParent();retry.remove();}catch{if(cancelled)return;retry.disabled=false;retry.textContent=text('Audi unavailable · Retry','Audi 無法載入 · 重試');}}
 retry.onclick=load;load();return {group,cancel(){cancelled=true;}};
}
function school(root,track) {
  const group=new THREE.Group();group.position.z=-15;root.add(group);
  box(group,24,.16,42,0xadb7a0,-2,.05,15);
  for(const s of track.segments) {
    const road=box(group,track.width,.08,s.len+.12,0x465658,(s.a.x+s.b.x)/2,.18,(s.a.z+s.b.z)/2);road.rotation.y=s.heading;
    for(let d=1;d<s.len;d+=3){const f=d/s.len;const dash=box(group,.12,.03,.9,0xf2e6bc,s.a.x+s.dx*f,.24,s.a.z+s.dz*f);dash.rotation.y=s.heading;}
  }
  for(const o of track.obstacles) {
    box(group,track.width-1,1.2,.8,0xd49145,o.x,.8,o.z);
    for(const dx of [-2,-1,0,1,2])box(group,.3,1.15,.83,0xf2ead7,o.x+dx,.8,o.z);
  }
  for(let z=0;z<30;z+=4)for(const x of [-4.2,4.2]){
    const cone=new THREE.Mesh(new THREE.ConeGeometry(.28,.65,8),mat(0xdc9048));cone.position.set(x,.55,z);group.add(cone);
  }
  let lamp=null;
  if(track.light){box(group,track.width,.03,.35,0xf7f1d4,0,.25,track.light.s);box(group,.16,3,.16,0x354744,4,1.5,track.light.s);box(group,.7,1.4,.6,0x263631,4,3.2,track.light.s);
    lamp=new THREE.Mesh(new THREE.SphereGeometry(.23,12,8),new THREE.MeshBasicMaterial({color:0xe85b45}));lamp.position.set(4,3.35,track.light.s+.32);group.add(lamp);}
  sign(group,text('DRIVING SCHOOL','AI 駕駛學校'),-2,3.8,-5,12);
  const car=new THREE.Group();group.add(car);box(car,1.5,.55,2.2,0xeee3b9,0,.65);box(car,1.2,.55,1.1,0x397d80,0,1.1,-.1);
  for(const x of [-.76,.76])for(const z of [-.7,.7]) {const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.2,12),mat(0x243432));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.42,z);car.add(wheel);}
  const rays=[];
  for(const a of [-.5,0,.5]){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.7,0),new THREE.Vector3(Math.sin(a)*10,.7,Math.cos(a)*10)]),new THREE.LineBasicMaterial({color:0xf3c55b}));car.add(line);rays.push(line);}
  return {group,car,lamp,rays};
}

export function mountCityActivities({scene,camera,renderer,layout,focus,props=[],trees=[],onDrivingEntry,onOpen}) {
  const roots=new Map(), sites=placeActivitySites({scale:layout.scaleMeters,focus,buildings:layout.buildings,roads:layout.roads,props,trees});
  const priorTouchAction=renderer.domElement.style.touchAction;
  const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=false;renderer.domElement.style.touchAction=priorTouchAction;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=10;controls.maxDistance=80;
  const lifetime=new AbortController(), listen=(target,event,fn)=>target.addEventListener(event,fn,{signal:lifetime.signal});
  let active=null,trial=null,skill=null,practiceSkill=null,store=null,projectId=null,generation=0,loading=false,loadError=null,inspection=null,disposed=false,contextLost=false,reported=null,scanner=null,driver=null,waste=null,restored={},savedCamera=null,sorterSession=null,savedModels={},skillSelection=null,machine=null,newerEdits=false,resetGeneration=0,framedTablet=null;
  const panel=document.createElement('section');panel.className='city-activity-panel';panel.hidden=true;panel.setAttribute('aria-label',text('City activity','城市活動'));
  panel.innerHTML=`<header><h2></h2><button data-act="close" aria-label="${text('Leave activity','離開活動')}">×</button></header><label>${text('Exercise','練習')} <select data-act="scenario"></select></label><div data-personal hidden><p data-sorter-name></p><p data-waiting></p></div><p data-status role="status"></p><div class="activity-actions"><button data-act="run">${text('Start','開始')}</button><button data-act="pause">${text('Pause','暫停')}</button><button data-act="step">${text('Step','單步')}</button><button data-act="reset">${text('Reset','重設')}</button><a data-improve>${text('Edit in Workshop','到工作坊編輯')}</a></div><details data-bin-details open><summary>${text('Bin counts and fullness','回收箱數量和容量')}</summary><div data-bin-readouts aria-label="${text('Bin counts and fullness','回收箱數量和容量')}"></div></details><details><summary>${text('Inspect the decision','查看模型決定')}</summary><img data-scanner width="112" height="112" alt="${text('Scanned object','已掃描物件')}"><label data-history-label>${text('Review a decision','重看決定')} <select data-history></select></label><pre data-evidence></pre></details><p data-result></p>`;
  document.body.append(panel);
  const q=s=>panel.querySelector(s);
  if(renderer.domElement.clientWidth<=1000)q('[data-bin-details]').open=false;
  const dock=document.createElement('nav');dock.className='city-activity-dock';dock.setAttribute('aria-label',text('Learning sites','學習地點'));document.body.append(dock);
  for(const site of sites){const root=new THREE.Group();root.position.set(site.x,.05,site.z);scene.add(root);roots.set(site.kind,root);
    if(site.kind==='recycling')scanner=station(root);else driver=previewSchool(root);
    const button=document.createElement('button');button.textContent=site.kind==='recycling'?text('♻ Recycling','♻ 回收站'):text('▣ Driving school','▣ 駕駛學校');button.onclick=()=>open(site.kind);dock.append(button);
    const entry=button.cloneNode(true);entry.onclick=()=>open(site.kind);entry.className='activity-entry';const label=new CSS2DObject(entry);label.position.set(0,5,site.kind==='driving'?-20:-3);root.add(label);
  }
  if(!roots.has('driving')){const note=document.createElement('span');note.textContent=text('Driving School needs more clear ground. Open it from here.','駕駛學校需要更多空地，可從這裡開啟。');dock.append(note);const button=document.createElement('button');button.textContent=text('▣ Driving school','▣ 駕駛學校');button.onclick=()=>open('driving');dock.append(button);}
  for(const kind of Object.keys(ACTIVITY_SITES))if(!roots.has(kind)&&kind!=='driving'){const note=document.createElement('span');note.textContent=text('No clear ground for '+kind+'. Keep a space in the planner.','沒有足夠空地，請在規劃器預留位置。');dock.append(note);}
  function pause(){trial?.pause();paint();}
  function close(){if(active==='driving'&&driver){driver.cancel?.();dispose(driver.group);if(sites.some(s=>s.kind==='driving'))driver=previewSchool(roots.get('driving'));else{dispose(roots.get('driving'));roots.delete('driving');driver=null;}}document.body.classList.remove('city-activity-open');generation++;loading=false;pause();active=null;framedTablet=null;panel.hidden=true;controls.enabled=false;camera.clearViewOffset();renderer.domElement.style.touchAction=priorTouchAction;if(savedCamera){camera.position.copy(savedCamera.position);camera.quaternion.copy(savedCamera.quaternion);savedCamera=null;}}
  function objectFor(row){const v2=MATERIALS.find(r=>r.id===row.id),v1=WASTE.find(r=>r.id===row.id);return personal()?neutralWaste(row.id):v2?createMaterial(v2):v1?createWaste(v1):neutralWaste(row.id);}
  const personal=()=>active==='recycling'&&q('select').value==='personal';
  function chosenSkill(){if(active==='recycling')return machine?.version===1?{cap:structuredClone(machine),installationId:null}:practiceSkill;return practiceSkill;}
  async function reset(){if(!active)return;const own=++resetGeneration, activityGeneration=generation;inspection=null;loadError=null;if(personal())sorterSession=readSorterSession(projectId);const scenario=q('select').value;skill=chosenSkill();const rows=active==='recycling'?(scenario==='personal'?(sorterSession?.batch||[]).map(row=>({id:row.id,vector:row.vector})):selectItems(window.WorkshopLibraryData[scenario==='materials-v2'?'cityRecyclingV2':'cityRecycling'].photos,{seed:1,count:scenario==='materials-v2'?12:9})):[];trial=null;reported=null;loading=true;paint();let machineResults=null;try{if(active==='recycling'&&skill)machineResults=await runRecyclingMachine(skill.cap,rows);}catch(e){if(own===resetGeneration&&activityGeneration===generation){loading=false;loadError=e.message;paint();}return;}if(own!==resetGeneration||activityGeneration!==generation)return;loading=false;trial=active==='recycling'||skill?new ActivityTrial(active,skill?.cap||null,scenario,rows,machineResults):null;
    if(active==='recycling'&&scanner){for(const group of Object.values(scanner.contents))while(group.children.length)dispose(group.children[0]);while(scanner.waiting.children.length)dispose(scanner.waiting.children[0]);for(let i=0;i<Math.min(rows.length,12);i++){const item=objectFor(rows[i]);item.userData.objectId=rows[i].id;item.name='waiting-'+rows[i].id;item.position.set(-8+(i%4)*.75,.1,1+Math.floor(i/4)*.8);scanner.waiting.add(item);}}
    if(active==='driving'){driver.cancel?.();dispose(driver.group);driver=school(roots.get('driving'),SCHOOL_TRACKS[scenario]);} if(waste){dispose(waste);waste=null;}paint();}
  function improveURL(){const url=new URL('../workshop/',location.href),back=new URL('../city-builder/',location.href);if(active==='recycling'){url.searchParams.set('tab','recycling');if(machine?.sourceMachineId)url.searchParams.set('machine',machine.sourceMachineId);}back.searchParams.set('activity',active);back.searchParams.set('exercise',q('select').value);if(active==='driving'){back.searchParams.set('drivingMode','legacy');url.searchParams.set('drivingMode','legacy');if(skill?.cap.workshop?.sourceMachineId)url.searchParams.set('machine',skill.cap.workshop.sourceMachineId);}
    if(personal()){url.searchParams.set('sorter','1');url.searchParams.set('returnTo',back.href);return url.href;}url.searchParams.set('publishTarget','city');url.searchParams.set('hostInstanceId',ACTIVITY_SITES[active]);url.searchParams.set('returnTo',back.href);url.searchParams.set('exercise',q('select').value);
    url.searchParams.set('skill',active==='driving'?'drive':'image');if(active==='recycling')url.searchParams.set('collection',q('select').value==='batch-1'?'city-recycling-v1':'city-recycling-v2');if(skill?.cap.workshop?.modelId)url.searchParams.set('model',skill.cap.workshop.modelId);return url.href;}
  function open(kind){if(kind==='driving'&&onDrivingEntry)return onDrivingEntry();return openActivity(kind);}
  async function openActivity(kind,selectedCapability=null){
    onOpen?.();
    if(kind==='driving'&&!roots.has(kind)){const root=new THREE.Group();root.position.set(layout.scaleMeters+120,0,layout.scaleMeters+120);scene.add(root);roots.set(kind,root);driver=previewSchool(root);}
    if(disposed||!roots.has(kind))return;close();document.body.classList.add('city-activity-open');active=kind;const own=++generation;loading=true;loadError=null;inspection=null;skill=null;trial=null;panel.hidden=false;
    savedCamera={position:camera.position.clone(),quaternion:camera.quaternion.clone()};const root=roots.get(kind),tablet=renderer.domElement.clientWidth<=1000;controls.target.copy(root.position).add(new THREE.Vector3(kind==='driving'?-2:0,1,0));framedTablet=tablet;camera.position.copy(controls.target).add(new THREE.Vector3(22,26,kind==='driving'?32:22).multiplyScalar(tablet?1.25:1));controls.enabled=true;renderer.domElement.style.touchAction='none';controls.update();
    q('h2').textContent=kind==='driving'?text('Driving school','駕駛學校'):text('Recycling station','回收站');
    q('select').replaceChildren();for(const [value,en,zh] of kind==='driving'?[['bend','Gentle bend','緩彎'],['obstacle','Stop before a barrier','障礙物前停車'],['light','Red → green','紅燈 → 綠燈']]:[['materials-v2','Material practice — 12 objects','物料練習 — 12 件物品'],['personal','My photos','我的相片'],['batch-1','Earlier practice — 9 objects','舊版練習 — 9 件物品']]){const o=document.createElement('option');o.value=value;o.textContent=text(en,zh);q('select').append(o);}paint();q('[data-improve]').href=improveURL();
    try{
      panel.dataset.loadingStage='project';store ||= createProjectStore();const project=await store.openActiveProject();panel.dataset.loadingStage='installation';const [caps,installs,section,models,selections,publishedMachine]=await Promise.all([store.readCapabilities(),store.readInstallations(),store.readSection('cityActivities'),store.readSection('sorterModels'),store.readSection('workshopSkills'),store.readSection('recyclingMachine')]);
      if(own!==generation||disposed)return;projectId=project.id;restored=section;machine=publishedMachine;newerEdits=await recyclingEditsPending(await store.readSection('workshop'),machine);savedModels=models;skillSelection=selections.recycling;sorterSession=readSorterSession(projectId);
      practiceSkill=siteSkill(caps,installs,ACTIVITY_SITES[kind],cap=>kind==='driving'?checkDriveCompatibility(cap).ok:checkCompatibility(cap).ok);
      if(kind==='driving'&&selectedCapability)practiceSkill=checkDriveCompatibility(selectedCapability).ok?{cap:structuredClone(selectedCapability),installationId:null}:null;
      const choices=await store.readSection('activityExercises');const requested=kind==='recycling'?resolveExercise(new URLSearchParams(location.search).get('exercise'),choices.recycling,section.recycling,!!sorterSession.batch.length):new URLSearchParams(location.search).get('exercise')||section[kind]?.scenario;
      panel.dataset.loadingStage='scanner';if(kind==='recycling'&&requested!=='personal')await loadScannerData();if(own!==generation||disposed)return;
      if([...q('select').options].some(o=>o.value===requested))q('select').value=requested;
      loading=false;await reset();paint();q('[data-improve]').href=improveURL();
    }catch(e){if(own!==generation)return;loading=false;loadError=e.message;q('[data-status]').textContent=text('Could not load. Close and try again. ','無法載入，請關閉後重試。 ')+e.message;panel.dataset.state='error';}
  }
  function paint(){if(!active)return;const state=loading?'loading':loadError?'error':trial?.state||'ready';panel.dataset.state=state;
    const names={loading:text('Loading…','載入中…'),ready:text('Ready','準備好了'),running:text('Running','運行中'),paused:text('Paused','已暫停'),finished:text('Finished','已完成'),error:text('Could not run this model. Reset to retry.','模型無法運行，請重設後重試。')};
    q('[data-personal]').hidden=active!=='recycling';const waitingCount=Math.max(0,(trial?.rows.length||sorterSession?.batch.length||0)-(trial?.results.length||0));q('[data-sorter-name]').textContent=skill?.cap.name||'';q('[data-waiting]').textContent=personal()?text(`${waitingCount} ${waitingCount===1?'photo':'photos'} waiting · ${trial?.results.length||0} sorted`,`${waitingCount} 張相片等待中 · ${trial?.results.length||0} 張已分類`):'';
    q('[data-status]').textContent=loading?names.loading:loadError?loadError:personal()&&!trial?.rows.length?text('No photos are waiting in this session. Add photos in Workshop.','本次使用沒有等待分類的相片，請在工作坊加入。'):active==='recycling'&&!skill?text('No saved machine — save your sorter in Workshop','沒有已儲存機器——請在工作坊儲存分類機'):!skill?text('Choose and train a model in Workshop.','請在工作坊選擇及訓練模型。'):`${names[state]} · ${skill.cap.name||skill.cap.id}${active==='driving'?' · r'+(skill.cap.revision||1):''}${active==='recycling'&&newerEdits?' · '+text('Newer edits need Save sorter','新更改需要儲存分類機'):''}`;
    for(const action of ['run','pause','step','reset'])q(`[data-act="${action}"]`).disabled=loading||(!trial&&action!=='reset')||(!skill&&active!=='recycling')||(['run','step'].includes(action)&&((active==='recycling'&&!trial.rows.length)||['finished','error'].includes(state)));
    q('select').disabled=loading;q('[data-improve]').href=improveURL();
    const history=active==='driving'?trial?.steps||[]:trial?.results||[];
    const historySelect=q('[data-history]');historySelect.replaceChildren();const latest=document.createElement('option');latest.value='';latest.textContent=text('Latest','最新');historySelect.append(latest);
    for(let i=Math.max(0,history.length-100);i<history.length;i++){const o=document.createElement('option');o.value=String(i);const row=history[i];o.textContent=active==='driving'?`${row.t}s · ${actionName(row.decision)}`:personal()?`${i+1} · ${materialName(row.decision)} → ${materialName(row.bin.replace('bin-',''))}`:`${i+1} · ${materialName(row.truth)} → ${materialName(row.bin.replace('bin-',''))}`;historySelect.append(o);}
    historySelect.value=inspection===null?'':String(inspection);q('[data-history-label]').hidden=!history.length;
    const last=inspection!==null&&active==='driving'?history[inspection]:trial?.steps.at(-1),r=inspection!==null&&active==='recycling'?history[inspection]:trial?.current;q('[data-scanner]').hidden=active!=='recycling'||personal()||!r;
    if(active==='recycling'&&!personal()&&r){const row=trial.rows.find(row=>row.id===r.id);if(row?.src)q('[data-scanner]').src=`../workshop/${row.src}`;}
    q('[data-evidence]').textContent=last?`${text('Action','動作')}: ${actionName(last.decision)}\n${Object.entries(last.observation||{}).map(([k,v])=>`${sensorName(k)}: ${v}`).join('\n')}`:r?.routedBy==='human-review'?`${text('Decision','決定')}: ${text('Human review — no model connected','人手檢查——沒有連接模型')}\n${text('Destination','目的地')}: ${materialName(r.bin.replace('bin-',''))}`:r?`${text('Model','模型')}: ${materialName(r.decision)}\n${text('Confidence','信心')}: ${Math.round(r.confidence*100)}%\n${personal()?'':`${text('Answer key','答案')}: ${materialName(r.truth)}\n`}${text('Destination','目的地')}: ${materialName(r.bin.replace('bin-',''))}${r.abstainReason?'\n'+text('Reason','原因')+': '+recyclingReason(r.abstainReason):''}`:'';
    q('[data-bin-details]').hidden=active!=='recycling';
    if(active==='recycling'&&scanner){const counts=binCounts(trial?.results||[]),size=trial?.rows.length||0,lines=[];for(const entry of BINS){const count=counts[entry.id]||0,value=`${count} · ${binFullness(count,size)}%`,label=materialName(entry.id.replace('bin-',''));const pile=scanner.contents[entry.id];while(pile.children.length<count){const n=pile.children.length,item=objectFor(trial.rows.find(row=>row.id===trial.results.filter(r=>r.bin===entry.id)[n].id));item.userData.objectId=item.name;item.name='sorted-'+item.name;item.scale.setScalar(.6);item.position.copy(scanner.bins[entry.id]);item.position.x+=((n%3)-1)*.6;item.position.z+=(Math.floor(n/3)%3-1)*.6;item.position.y=.2+Math.floor(n/9)*.45;pile.add(item);}const meter=scanner.meters[entry.id];if(meter.last!==value){const ctx=meter.canvas.getContext('2d');ctx.fillStyle='#173a31';ctx.fillRect(0,0,512,256);ctx.fillStyle='#fff6d6';ctx.font='bold 64px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,65,490);ctx.font='bold 68px system-ui';ctx.fillText(value,256,180,490);meter.texture.needsUpdate=true;meter.last=value;}lines.push(`<span>${label}</span><strong>${value}</strong>`);}q('[data-bin-readouts]').innerHTML=lines.join('');const taken=trial?.state==='ready'?0:Math.min(size,(trial?.index||0)+1);scanner.waiting.children.forEach((item,i)=>{item.visible=i>=taken;});}
    const result=trial?.state==='finished'?trial.summary():(personal()?null:restored[active]);q('[data-result]').textContent=result?resultText(result):'';
  }
  function recyclingReason(code){return ({'human-check-bin':text('The machine sent this item to human check.','機器把這件物品送往人手檢查。'),'conflicting-outputs':text('Copies reached different destinations.','複本到達不同目的地。'),'missing-destination':text('The item did not reach a mapped bin.','物品未到達已設定的回收箱。'),'tick-limit':text('The machine reached its time limit.','機器已達到運行時間上限。'),'work-limit':text('The machine reached its work limit.','機器已達到工作量上限。'),'unsettled':text('The item was dropped or did not finish.','物品掉落或未完成分類。')})[code]||text('The machine could not finish this item.','機器未能完成這件物品的分類。');}
  function resultText(r){const body=resultTextBody(r);return active==='recycling'&&r.scenario!=='personal'?(resultDataset(r)==='city-recycling-v2'?text('Material practice — 12 objects','物料練習 — 12 件物品'):text('Earlier practice — 9 objects','舊版練習 — 9 件物品'))+' · '+body:body;}
  function resultTextBody(r){if(active==='recycling'){if(!r.capabilityId)return text(`${r.score.humanChecked} ${r.score.humanChecked===1?'item':'items'} sent to human check · no model connected${personal()?' · no answer key for personal photos':''}`,`${r.score.humanChecked} 件物品送往人手檢查 · 沒有連接模型${personal()?' · 個人相片沒有答案表':''}`);if(personal())return text(`${r.results.length} destinations shown · no answer key for personal photos`,`${r.results.length} 個分類結果 · 個人相片沒有答案表`);const s=r.score;return s?`${text('Correct / incorrect / human checks','正確／錯誤／人手檢查')}: ${s.correct} / ${s.wrong} / ${s.humanChecked}`:'';}return outcomeName(r.outcome);}
  let persistence = Promise.resolve();
  function persist(){
    const ownTrial=trial,ownStore=store,ownSkill=skill,kind=active;
    if(personal()||!ownSkill||reported===trial||!trial||trial.state!=='finished')return persistence;
    reported=trial;const summary=trial.summary();restored[kind]=summary;
    if(!ownSkill.installationId&&ownSkill.cap.kind!=='recycling-machine'){persistence=ownStore.mutate(p=>{p.projects.cityActivities||={};p.projects.cityActivities[kind]=summary;return p;},{reason:'activity-result'});return persistence;}
    const driving=kind==='driving', challengeId=driving?'driver':'image-sorter';
    const abstained=driving?summary.steps.filter(step=>step.abstained).length:summary.score.abstained;
    const counts=driving?{steps:summary.steps.length,trackId:summary.scenario}:{total:summary.score.total,batch:summary.scenario,seed:1};
    const correctCount=driving?(summary.outcome==='goal'?1:0):summary.score.correct;
    const outcome={machineId:ownSkill.cap.sourceMachineId,revision:summary.revision,scenario:{kind:`city-${kind}`,seed:summary.scenario},abstained,correctCount,
      ...(driving?{gradedIds:['goal'],wrongIds:correctCount?[]:['goal']}:{results:summary.results,gradedIds:summary.results.filter(r=>!r.abstained&&r.truth).map(r=>r.id),wrongIds:summary.results.filter(r=>!r.abstained&&r.truth&&r.bin!=='bin-'+r.truth).map(r=>r.id)})};
    const events=[{type:'held-out-eval',evidence:{challengeId,...counts,abstained}}];
    if(ownSkill.installationId||ownSkill.cap.kind==='recycling-machine')events.push({type:'city-install',evidence:{challengeId,installationId:ownSkill.installationId,...counts}});
    if(abstained>0)events.push({type:'abstain-demo',evidence:{challengeId,source:kind,...counts,abstained}});
    persistence=commitReward(async()=>{
      const saved=await ownStore.mutate(p=>{p.projects.cityActivities||={};p.projects.cityActivities[kind]=summary;return p;},{reason:'activity-result'});
      if(!saved.ok)return saved;
      return ownStore.recordChallengeOutcome(challengeId,outcome,events);
    });
    persistence.then(result=>{if(!result.ok&&trial===ownTrial)q('[data-status]').textContent=text('Result could not be saved. Press Retry before leaving.','無法儲存結果，離開前請按重試。');});
    return persistence;
  }
  const unregisterWorkspace=registerWorkspaceAdapter({flush:async()=>{if(trial?.state==='finished')await persist();else await persistence;await flushRewardSaves();},capture:()=>({}),restore:async()=>{},suspend:value=>{if(value)close();}});
  function update(dt){if(disposed)return;if(document.hidden||contextLost){pause();return;}trial?.update(dt);
    if(active==='driving'&&trial){const alpha=trial.state==='running'?trial.accumulator/.1:1;const a=trial.previous||trial.car,b=trial.car;driver.car.position.set(THREE.MathUtils.lerp(a.x,b.x,alpha),0,THREE.MathUtils.lerp(a.z,b.z,alpha));driver.car.rotation.y=THREE.MathUtils.lerp(a.heading,b.heading,alpha);if(driver.lamp)driver.lamp.material.color.setHex(lightStateAt(trial.track,trial.steps.length*.1)===2?0xe65c46:0x50b388);driver.rays.forEach((r,i)=>{r.visible=q('details').open;const obs=trial.steps.at(-1)?.observation;r.scale.setScalar(Math.min(10,obs?.[['left','center','right'][i]]??10)/10);});}
    if(active==='recycling'&&trial?.rows.length){const row=trial.rows[Math.min(trial.index,trial.rows.length-1)];if(waste?.name!==row.id){if(waste)dispose(waste);waste=objectFor(row);roots.get('recycling').add(waste);}const p=trial.phase/30,target=scanner.bins[trial.current?.bin]||scanner.bins['human-check'];
      if(p<.4)waste.position.set(-5+p/.4*4,2,-1);else if(p<.6)waste.position.set(-1+(p-.4)/.2*4,2,-1);else {const f=(p-.6)/.4;waste.position.set(3+(target.x-3)*f,2+(target.y-2)*f*f,-1+(target.z+1)*f);}scanner.diverter.rotation.y=(target.x-3)*.1;waste.visible=trial.state!=='finished';}
    for(const root of roots.values())root.traverse(o=>{if(o.isCSS2DObject)o.visible=!active&&renderer.domElement.clientWidth>1000&&camera.position.distanceTo(root.position)<120;});
    if(active&&trial){const stamp=`${trial.state}:${trial.steps.length}:${trial.index}:${trial.phase===1||trial.phase===13}`;if(panel.dataset.stamp!==stamp){panel.dataset.stamp=stamp;paint();}if(trial.state==='finished')persist();}
  }
  async function refreshRun(){const own=generation;pause();loading=true;paint();try{const [models,selections,publishedMachine]=await Promise.all([store.readSection('sorterModels'),store.readSection('workshopSkills'),store.readSection('recyclingMachine')]);if(own!==generation)return;savedModels=models;skillSelection=selections.recycling;machine=publishedMachine;newerEdits=await recyclingEditsPending(await store.readSection('workshop'),machine);loading=false;await reset();}catch(error){loading=false;loadError=error.message;q('[data-status]').textContent=error.message;}}
  listen(panel,'click',e=>{const action=e.target.closest('[data-act]')?.dataset.act;if(action==='close')close();if(action==='run'){inspection=null;trial?.run();}if(action==='pause')pause();if(action==='step'){inspection=null;trial?.step();}if(action==='reset'){refreshRun();return;}paint();if(trial?.state==='finished')persist();});
  listen(q('select'),'change',async()=>{if(active==='recycling'){const exercise=q('select').value;await store.mutate(p=>{p.projects.activityExercises||={};p.projects.activityExercises.recycling=exercise;return p;},{reason:'recycling-exercise',versioned:false});}if(active==='recycling'&&!personal()&&(!window.WorkshopLibraryData?.cityRecycling||!window.WorkshopLibraryData?.cityRecyclingV2)){const own=generation;loading=true;paint();try{await loadScannerData();}catch(error){if(own===generation){loadError=String(error.message||error);q('[data-status]').textContent=loadError;}loading=false;return;}if(own!==generation)return;loading=false;}await reset();});listen(q('[data-history]'),'change',e=>{inspection=e.target.value===''?null:Number(e.target.value);paint();});listen(document,'visibilitychange',()=>{if(document.hidden)pause();});listen(renderer.domElement,'webglcontextlost',()=>{contextLost=true;pause();});listen(renderer.domElement,'webglcontextrestored',()=>{contextLost=false;});
  listen(window,'pagehide',close);listen(window,'keydown',e=>{if(e.key==='Escape')close();});listen(window,PROJECT_EVENT,e=>{if(['switched','imported'].includes(e.detail?.type)||(projectId&&e.detail?.projectId&&projectId!==e.detail.projectId))close();});listen(window,'storage',e=>{if(e.key===ACTIVE_PROJECT_KEY&&e.newValue!==projectId)close();});
  const api={sites,open,openLegacyDriving:cap=>openActivity('driving',cap),close,update,get isOpen(){return !!active;},get trial(){return trial;},get state(){return loading?'loading':loadError?'error':trial?.state||'ready';},camera(){if(!active)return false;const w=renderer.domElement.clientWidth,h=renderer.domElement.clientHeight,tablet=w<=1000;if(framedTablet!==tablet){framedTablet=tablet;q('[data-bin-details]').open=!tablet;}if(tablet)camera.setViewOffset(w,h,0,h*.16,w,h);else camera.setViewOffset(w,h,w*.14,0,w,h);controls.update();return true;},destroy(){unregisterWorkspace();disposed=true;close();lifetime.abort();store?.close?.();controls.dispose();driver?.cancel?.();roots.forEach(dispose);panel.remove();dock.remove();}};
  return api;
}
const cataloguePromises=new Map();
function loadScannerData(){return Promise.all([['city-recycling','cityRecycling'],['city-recycling-v2','cityRecyclingV2']].map(([path,key])=>{
 if(window.WorkshopLibraryData?.[key])return Promise.resolve();
 if(!cataloguePromises.has(key))cataloguePromises.set(key,new Promise((resolve,reject)=>{const script=document.createElement('script');let done=false;const finish=e=>{if(done)return;done=true;clearTimeout(timeout);script.remove();e?reject(e):resolve();};const timeout=setTimeout(()=>finish(Error('Scanner data timed out')),15000);script.src=`../workshop/assets/${path}/catalogue.js`;script.onload=()=>finish(window.WorkshopLibraryData?.[key]?null:Error('Missing scanner data'));script.onerror=()=>finish(Error('Missing scanner data'));document.head.append(script);}).catch(e=>{cataloguePromises.delete(key);throw e;}));
 return cataloguePromises.get(key);
}));}
const actionName=a=>text(a||'—',({forward:'前進',left:'左轉',right:'右轉',slow:'減速',stop:'停車'})[materialLabel(a)||a]||a||'不確定');
const materialName=a=>{const key=a==='__abstain'?'human-check':materialLabel(a)||a;return text(key||'unsure',({metal:'金屬',plastic:'塑膠',cardboard:'紙板',glass:'玻璃',paper:'紙張',trash:'垃圾','human-check':'人手檢查'})[key]||a||'不確定');};
const sensorName=a=>text(a,({left:'左方',center:'前方',right:'右方',laneOffset:'車道偏移',headingError:'車頭角度',speed:'速度',trafficLight:'交通燈 0綠/1黃/2紅',turnIntent:'轉彎方向'})[a]||a);
const outcomeName=a=>({goal:text('Success — exercise complete.','成功完成練習。'),'red-light':text('Crossed the stop line on red. Teach red-light examples.','衝紅燈了，請增加紅燈訓練例子。'),collision:text('Hit the barrier. Teach earlier braking.','撞到障礙物，請教模型提早煞車。'),'off-road':text('Left the road. Review steering examples.','駛離道路，請檢查轉向例子。'),'emergency-stop':text('Stopped with a clear road, or was unsure. Inspect the decision.','前方暢通卻停車，或模型不確定，請查看決定。'),timeout:text('Time ran out. Review stop and go examples.','時間已到，請檢查停車與前進例子。')})[a]||a||'';
