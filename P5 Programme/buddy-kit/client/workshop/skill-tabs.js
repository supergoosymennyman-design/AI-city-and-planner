import { compileDrivingMachine, drivingBindings } from '../city-common/driving-machine.js';
import { prepareDrivingBundle } from '../city-common/driving-bundle.js';
import { createProjectStore, ACTIVE_PROJECT_KEY, PROJECT_EVENT } from '../city-common/project-store.js';
import { flushWorkspaces } from '../city-common/workspace.js';
import { publishDriveModelToCity } from './publish-capability.js';
import { mountDrivingTeacher } from './driving-teacher.js';

export const WORKSHOP_SKILLS = Object.freeze([
  {id:'recycling', en:'Recycling', zh:'回收', activity:'recycling'},
  {id:'driving', en:'Driving', zh:'駕駛', activity:'driving'},
  {id:'free', en:'Free build', zh:'自由建造'},
]);
export function skillSimulationURL(id,base=location.href) {
  const skill=WORKSHOP_SKILLS.find(skill=>skill.id===id);
  if(!skill?.activity)throw Error('This tab has no City simulation.');
  const url=new URL('../city-builder/',base);url.searchParams.set('activity',skill.activity);return url;
}
const t=(en,zh)=>localStorage.getItem('hk_ai_city_lang_v1')==='zh-Hant'?zh:en;
export async function mountSkillTabs(recyclingPanel, refresh) {
  while (!window.WorkshopGame?.newSkillMachine) await new Promise(resolve=>setTimeout(resolve,100));
  const game=window.WorkshopGame, store=createProjectStore();
  const entryParams=new URLSearchParams(location.search);let legacy=entryParams.get('drivingMode')==='legacy'||['bend','obstacle','light'].includes(entryParams.get('exercise'));
  const project=await store.openActiveProject();
  let skills=await store.readSection('workshopSkills'), active=skills.active||'free', busy=false, stale=false;
  const app=document.querySelector('.app');
  const nav=document.createElement('nav');nav.className='workshop-skills';nav.setAttribute('aria-label',t('Workshop skills','工作坊技能'));
  const details=document.createElement('details');details.className='workshop-skill-controls';details.open=false;
  const summary=document.createElement('summary');summary.textContent=t('Exercise','練習');details.append(summary);
  const content=document.createElement('div');details.append(content);content.append(recyclingPanel);
  const driving=document.createElement('section');driving.className='skill-driving';driving.hidden=true;
  const launch=document.createElement('button');launch.textContent=t('Try in AI City','到 AI 城市試試');launch.dataset.driveCity='';
  const message=document.createElement('p');message.setAttribute('role','status');driving.append(message);
  const overview=document.createElement('p');overview.className='driving-overview';overview.setAttribute('aria-live','polite');
  const tabs=document.createElement('nav');tabs.setAttribute('aria-label',t('Driving controllers','駕駛控制器'));
  let focus=(entryParams.get('controller') || skills.driving?.controller)==='speed'?'speed':'steering';
  const mode=document.createElement('select');mode.setAttribute('aria-label',t('Controller mode','控制器模式'));
  const sensorPreview=document.createElement('p');sensorPreview.dataset.drivingSensors='';
  const outputPreview=document.createElement('pre');outputPreview.dataset.drivingDecision='';
  const inspection=document.createElement('details');inspection.className='driving-inspection';const inspectionTitle=document.createElement('summary');inspectionTitle.textContent=t('Inspect sensors and decisions','查看感應器及決定');const inspectionBody=document.createElement('div');inspectionBody.append(sensorPreview,outputPreview);
  const controllerBinding=document.createElement('select'),outputBinding=document.createElement('select');
  for(const [labelText,control] of [[t('Bound controller','已連接控制器'),controllerBinding],[t('Car output','車輛輸出'),outputBinding]]){const label=document.createElement('label');label.textContent=labelText+' ';control.setAttribute('aria-label',labelText);label.append(control);inspectionBody.append(label);}
  const connectionNote=document.createElement('p');connectionNote.textContent=t('Connect the controller’s reading to the car output’s show port. The other equipment trains and tests your examples.','請把控制器的讀數連接到車輛輸出的顯示插口。其他設備用於訓練及測試例子。');inspectionBody.append(connectionNote);
  const rebind=async()=>{try{await game.setDrivingBinding(focus,controllerBinding.value,outputBinding.value);refreshDriving();}catch(error){message.textContent=error.message;}};controllerBinding.onchange=rebind;outputBinding.onchange=rebind;
  inspection.append(inspectionTitle,inspectionBody);
  const saveState=document.createElement('span');saveState.dataset.drivingSave='';
  const controls=document.createElement('div');controls.className='driving-controls';controls.append(tabs,mode,saveState,launch);
  driving.prepend(overview,controls,inspection);
  let previewReadings={laneOffset:0,headingError:0,roadDirection:0,speed:0,clearance:40,closingSpeed:0,signal:'none',signalDistance:40,crossing:'clear',bend:0,finishDistance:40};
  function refreshDriving(){
    if(active!=='driving'||legacy)return;
    const draft=game.drivingDraft(),built=compileDrivingMachine(draft,game.sourceMachineId());
    const prepared=built.ok?prepareDrivingBundle(built.bundle):built;
    const decision=prepared.ok?prepared.decide(previewReadings):null;
    const name=role=>role==='steering'?t('Steering','轉向'):t('Speed','車速');
    const action=value=>({straight:t('Straight ahead','直行'),go:t('Go','前進'),slow:t('Slow','減速'),stop:t('Stop','停車'),'gentle-left':t('Gentle left','輕微左轉'),'gentle-right':t('Gentle right','輕微右轉'),'sharp-left':t('Sharp left','較急左轉'),'sharp-right':t('Sharp right','較急右轉')}[value]||value||'—');
    overview.textContent=prepared.ok?t('Simulated sensors','模擬感應器')+' → '+['steering','speed'].map(role=>{const m=built.bundle.models[role];return name(role)+': '+(m.mode==='trained'?t('Trained model','已訓練模型'):m.mode==='default'?t('Default','預設'):t('Constant','固定'))+' → '+action(decision[role]?.decision)+(decision[role]?.abstained?t(' (unsure)','（不確定）'):'');}).join(' · ')+' → '+t('Car','車輛'):prepared.error;
    for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.controller===focus));
    for(const field of driving.querySelectorAll('[data-driving-role]'))field.hidden=field.dataset.drivingRole!==focus;
    sensorPreview.textContent=t('Simulated sensors: ','模擬感應器：')+game.Datasets.schema('drive-'+focus+'-v2').features.map(f=>f.name+': '+previewReadings[f.id]).join(' · ');
    outputPreview.textContent=prepared.ok?['steering','speed'].map(role=>{const d=decision[role],m=built.bundle.models[role];if(!d)return name(role)+t(': Fill in sensor readings',': 請填寫感應讀數');const units=role==='speed'?' m/s':' rad';return name(role)+': '+action(d.decision)+' → '+(built.bundle.controls[role][d.decision]??'—')+units+' · '+(m.mode==='trained'?t('Confidence','信心')+' '+Math.round(d.confidence*100)+'%':m.mode==='default'?t('Default output','預設輸出'):t('Constant output','固定輸出'))+(d.abstained?t(' (unsure)','（不確定）'):'')+'\n'+(d.evidence||[]).map(e=>t('Example','例子')+' '+e.id+': '+action(e.label)+' · '+t('Similarity','相似度')+' '+Math.round((1-e.distance*e.distance/2)*100)+'%').join('\n');}).join('\n'):prepared.error;
    const binding=drivingBindings(draft)[focus];
    for(const [control,selected,type] of [[controllerBinding,binding?.blockId,'sense'],[outputBinding,binding?.outputId,'sign']]){
      control.replaceChildren();control.add(new Option(t('Choose…','請選擇…'),''));
      for(const p of draft.pieces.filter(p=>p.type===type && (type==='sense'?p.senseId==='data'&&p.brainId==='knn'&&!p.libraryModel: p.mode==='label') && (!p.drivingBench||p.drivingBench===focus)))control.add(new Option(p.name||p.id,p.id));
      control.value=selected||'';
    }
    const p=draft.pieces.find(p=>p.id===binding?.blockId);mode.replaceChildren();
    if(focus==='steering')mode.add(new Option(t('Default: Straight ahead','預設：直行'),'default:straight'));
    else for(const a of ['go','slow','stop'])mode.add(new Option(t('Constant: ','固定：')+action(a),'constant:'+a));
    const trainedOption=new Option(t('Trained model','已訓練模型'),'trained:');trainedOption.disabled=!Object.values(p?.learning?.data?.brain?.shelves||{}).some(shelf=>shelf.length);mode.add(trainedOption);
    const effectiveMode=built.bundle?.models[focus]?.mode||p?.drivingMode||'trained';mode.value=effectiveMode+':'+(effectiveMode==='trained'?'':built.bundle?.models[focus]?.action||p?.drivingAction||'');
  }
  for(const role of ['steering','speed']){const b=document.createElement('button');b.type='button';b.dataset.controller=role;b.textContent=role==='steering'?t('Steering','轉向'):t('Speed','車速');b.onclick=async()=>{if(busy||stale)return;focus=role;game.setDrivingFocus(role);refreshDriving();teacher.preview(role);try{await persist({driving:{...skills.driving,controller:role}});}catch(error){message.textContent=error.message;}};tabs.append(b);}
  mode.onchange=async()=>{const [value,action]=mode.value.split(':');try{await game.setDrivingMode(focus,value,action||undefined);refreshDriving();}catch(error){message.textContent=error.message;}};
  window.addEventListener('driving-save',event=>{saveState.textContent=event.detail==='saving'?t('Saving…','儲存中…'):event.detail==='failed'?t('Save failed','儲存失敗'):t('Saved','已儲存');if(event.detail!=='saving')refreshDriving();});
  driving.addEventListener('driving-preview',event=>{previewReadings={...previewReadings,...event.detail};refreshDriving();});
  const teacher=mountDrivingTeacher(driving,game);

  const status=document.createElement('p');status.className='skill-status';status.setAttribute('role','status');nav.append(status);
  app.querySelector('header').append(nav);nav.append(details);
  const style=document.createElement('style');style.textContent=`.workshop-skills{order:3;flex:1 1 100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.workshop-skills button{min-height:36px;padding:4px 10px;font-family:inherit;font-size:13px;font-weight:600;color:var(--armor-shade);background:none;border:1px solid transparent;border-radius:6px;box-shadow:none}.workshop-skills button:hover{color:var(--ice-bright);background:#ffffff0c}.workshop-skills button:focus-visible{outline:2px solid var(--ice);outline-offset:2px}.sorter-actions{margin-left:auto}.sorter-actions [data-save-status]{font-size:12px;max-width:30ch}.workshop-skills .sorter-actions button{border-color:#b9cbdb44}.workshop-skills button[aria-current="page"]{outline:2px solid currentColor;outline-offset:1px}.skill-status{margin:0;font-size:12px}.workshop-skill-controls{position:relative}.workshop-skill-controls>summary{cursor:pointer;padding:8px}.workshop-skill-controls>div{position:absolute;right:0;top:100%;z-index:60;width:min(360px,85vw);max-height:70vh;overflow:auto;background:var(--oil,#10141c);color:var(--armor,#dfe8ef);border:1px solid #aaa;padding:16px;box-shadow:0 4px 14px #0002}.workshop-skill-controls[hidden]{display:none}.skill-driving{flex:1 1 100%;padding:8px 0;border-top:1px solid #b9cbdb44}.skill-driving[hidden]{display:none}.driving-overview{margin:0 0 6px;font-size:13px}.driving-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.driving-controls>nav{display:inline-flex;gap:6px}.driving-controls [data-drive-city]{margin-left:auto!important}.skill-driving>p:empty{display:none}.skill-driving>details{display:inline-block;vertical-align:top;margin:8px 16px 0 0;position:relative}.skill-driving summary{cursor:pointer;font-size:13px}.driving-inspection>div{position:absolute;z-index:60;top:100%;left:0;width:min(360px,85vw);max-height:55vh;overflow:auto;padding:12px;background:var(--oil,#10141c);border:1px solid #aaa}.skill-driving button[aria-pressed=true]{outline:2px solid currentColor}.skill-driving [data-drive-city]{background:#b8e7cb;color:#14291e;margin:0 8px}.driving-controls>select{min-height:40px;max-width:100%;margin:4px 8px}.skill-driving pre{font-size:12px;white-space:pre-wrap}.skill-driving label{display:block}.skill-driving fieldset{min-width:0}.sorter-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.sorter-actions[hidden]{display:none}`;
  document.head.append(style);
  async function persist(patch) {
    if(stale)throw Error(t('Project changed. Reload Workshop.','專案已變更，請重新載入工作坊。'));
    const result=await store.mutate(p=>{p.projects.workshopSkills={...(p.projects.workshopSkills||{}),...patch};return p;},{reason:'workshop-skill-selection'});
    if(!result.ok)throw Error(result.error||'Could not save skill selection');
    skills={...skills,...patch};
  }
  function paint(){for(const b of nav.querySelectorAll('[data-skill]')){b.setAttribute('aria-current',b.dataset.skill===active?'page':'false');b.disabled=busy||stale;}details.hidden=active!=='recycling';mode.disabled=busy||stale;for(const b of tabs.querySelectorAll('button'))b.disabled=busy||stale;driving.inert=busy||stale;recyclingPanel.hidden=active!=='recycling';driving.hidden=active!=='driving';for(const panel of driving.querySelectorAll('.driving-teacher,[data-pair-correction]'))panel.hidden=legacy;}
  async function switchTo(id,{initial=false}={}) {
    if(busy||stale)return;busy=true;paint();
    try {
      await game.saveDrivingMachine();await flushWorkspaces();
      const machine=game.sourceMachineId();
      if(!initial&&!legacy)await persist({[active]:{...skills[active],machineId:machine}});
      if(!initial)legacy=false;
      let destination=initial&&entryParams.get('machine')?entryParams.get('machine'):skills[id]?.machineId;
      if(initial&&legacy&&!destination){const caps=await store.readCapabilities(),installs=await store.readInstallations();const cap=caps[Object.values(installs).find(i=>i.hostInstanceId==='city-driving-school-v1')?.capabilityRef];destination=cap?.workshop?.sourceMachineId;}
      if(destination&&destination!==machine){if(!await game.openSavedMachine(destination))throw Error(t('Saved machine cannot be opened. Your current machine is kept.','無法開啟已儲存機器，已保留目前機器。'));}
      else if(!destination&&initial&&legacy&&!game.publishDriveModel?.()){const starter='drive-'+(['bend','obstacle','light'].includes(entryParams.get('exercise'))?entryParams.get('exercise'):'v1');if(!await game.openSavedMachine(starter))game.loadGalleryMachine(starter,{newMachine:true});}
      else if(!destination&&(!initial||id==='recycling'))await game.newSkillMachine(id);
      else if(!destination&&id==='driving'&&!legacy&&!game.drivingDraft?.().pieces.some(p=>p.drivingRole))await game.newSkillMachine(id);
      await game.saveDrivingMachine();await flushWorkspaces();
      await persist(legacy&&initial?{active:id}:{active:id,[id]:{...skills[id],machineId:game.sourceMachineId(),...(id==='driving'?{controller:focus}:{})}});
      active=id;paint();game.setDrivingFocus(id==='driving'&&!legacy?focus:null);refreshDriving();status.textContent=legacy?t('Earlier driving machine','舊版駕駛機器'):'';paint();if(id==='recycling')refresh();window.dispatchEvent(new CustomEvent('workshop-skill',{detail:{id}}));
    }catch(error){status.textContent=error.message;}finally{busy=false;paint();}
  }
  for(const skill of WORKSHOP_SKILLS){const b=document.createElement('button');b.textContent=t(skill.en,skill.zh);b.dataset.skill=skill.id;b.onclick=()=>switchTo(skill.id);nav.insertBefore(b,status);}
  nav.insertBefore(driving,details);
  launch.onclick=async()=>{if(busy||stale)return;busy=true;paint();launch.disabled=true;try{await game.saveDrivingMachine();await flushWorkspaces();const result=await publishDriveModelToCity();if(!result.ok)throw Error(result.error);if(!legacy)await persist({driving:{...skills.driving,machineId:game.sourceMachineId(),controller:focus,modelRef:result.key}});await flushWorkspaces();const back=skillSimulationURL('driving');if(legacy){back.searchParams.set('drivingMode','legacy');back.searchParams.set('exercise',entryParams.get('exercise')||'bend');}else if(entryParams.get('repeat')==='1')back.searchParams.set('repeat','1');location.assign(back);}catch(error){message.textContent=error.message;launch.disabled=false;}finally{busy=false;paint();}};
  const invalidate=()=>{stale=true;status.textContent=t('Project changed. Reload Workshop.','專案已變更，請重新載入工作坊。');paint();launch.disabled=true;recyclingPanel.inert=true;};
  window.addEventListener('storage',e=>{if(e.key===ACTIVE_PROJECT_KEY&&e.newValue!==project.id)invalidate();});
  window.addEventListener(PROJECT_EVENT,e=>{if(['switched','imported'].includes(e.detail?.type))invalidate();});
  // Preserve the machine already on the table as Free build on the first visit.
  if(!skills.free?.machineId){if(game.sourceMachineId()===skills.driving?.machineId)await game.newSkillMachine('free');await game.saveDrivingMachine();await flushWorkspaces();await persist({free:{machineId:game.sourceMachineId()}});}
  const params=new URLSearchParams(location.search);
  if(!skills.driving?.machineId){const driving=await store.readSection('driving');const source=driving.bundles?.[driving.installed]?.machineId;if(source)await persist({driving:{machineId:source,modelRef:driving.installed}});}
  const publishedSorter=await store.readSection('recyclingMachine');if(!skills.recycling?.machineId&&publishedSorter.sourceMachineId)await persist({recycling:{machineId:publishedSorter.sourceMachineId}});
  if(!skills.recycling?.machineId&&params.get('skill')!=='drive'&&params.get('hostInstanceId')){const caps=await store.readCapabilities(),installs=await store.readInstallations();const cap=caps[Object.values(installs).find(i=>i.hostInstanceId===params.get('hostInstanceId'))?.capabilityRef];if(cap?.workshop?.sourceMachineId)await persist({recycling:{machineId:cap.workshop.sourceMachineId,modelRef:'table:'+cap.workshop.modelId}});}

  const drivingState=await store.readSection('driving'),correction=drivingState.correction;
  if(correction){
    const box=document.createElement('details'),title=document.createElement('summary');box.dataset.pairCorrection='';title.textContent=t('Improve the recorded decision','改進已記錄的決定');
    const readings=document.createElement('pre');readings.textContent=JSON.stringify(correction.readings,null,2);
    const role=document.createElement('select');role.setAttribute('aria-label',t('Model','模型'));role.add(new Option(t('Steering','轉向'),'steering'));role.add(new Option(t('Speed','車速'),'speed'));role.value=entryParams.get('controller')==='speed'?'speed':'steering';
    const label=document.createElement('select');label.setAttribute('aria-label',t('Correct action','正確動作'));
    const fill=()=>{label.replaceChildren();for(const action of game.Datasets.schema('drive-'+role.value+'-v2').answer.labels)label.add(new Option(action,action));};role.onchange=fill;fill();
    const teach=document.createElement('button');teach.textContent=t('Teach my correction','教導我的更正');
    teach.onclick=async()=>{try{if(game.sourceMachineId()!==correction.machineId)throw Error(t('Open the original driving machine first.','請先開啟原本的駕駛機器。'));if(!await game.correctDrivingDecision(role.value,correction.readings,label.value))throw Error('Could not teach this model');const result=await store.mutate(p=>{p.projects.driving.practiced=[...new Set([...(p.projects.driving.practiced||[]),correction.scenario])].slice(-50);return p;},{reason:'driving-practice'});if(!result.ok)throw Error(result.error);message.textContent=t('Taught. Try in AI City to run the updated pair.','已教導。到 AI 城市試試更新後的模型組合。');}catch(error){message.textContent=error.message;}};
    box.append(title,readings,role,label,teach);driving.append(box);
  }
  const requested=params.get('skill')==='drive'?'driving':params.get('sorter')==='1'||params.get('skill')==='image'||params.get('publishTarget')==='city'?'recycling':params.get('tab')||active;
  await switchTo(WORKSHOP_SKILLS.some(s=>s.id===requested)?requested:'free',{initial:true});
  return {lock:value=>{busy=value;paint();},persistSelection:async reference=>persist({recycling:{...skills.recycling,machineId:game.sourceMachineId(),modelRef:reference}}),selection:()=>skills.recycling?.modelRef,open:()=>switchTo('recycling')};
}
