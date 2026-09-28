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
  const app=document.querySelector('.app'), main=app.querySelector('main');
  const nav=document.createElement('nav');nav.className='workshop-skills';nav.setAttribute('aria-label',t('Workshop skills','工作坊技能'));
  const details=document.createElement('details');details.className='workshop-skill-controls';details.open=false;
  const summary=document.createElement('summary');summary.textContent=t('Exercise','練習');details.append(summary);
  const content=document.createElement('div');details.append(content);content.append(recyclingPanel);
  const driving=document.createElement('section');driving.className='skill-driving';driving.hidden=true;
  const launch=document.createElement('button');launch.textContent=t('Try in AI City','到 AI 城市試試');launch.dataset.driveCity='';
  const message=document.createElement('p');message.setAttribute('role','status');driving.append(launch,message);content.append(driving);
  mountDrivingTeacher(driving,game);
  const status=document.createElement('p');status.className='skill-status';status.setAttribute('role','status');nav.append(status);
  app.querySelector('header').append(nav);nav.append(details);
  const style=document.createElement('style');style.textContent=`.workshop-skills{order:3;flex:1 1 100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.workshop-skills button{min-height:36px;padding:4px 10px;font-family:inherit;font-size:13px;font-weight:600;color:var(--armor-shade);background:none;border:1px solid transparent;border-radius:6px;box-shadow:none}.workshop-skills button:hover{color:var(--ice-bright);background:#ffffff0c}.workshop-skills button:focus-visible{outline:2px solid var(--ice);outline-offset:2px}.sorter-actions{margin-left:auto}.sorter-actions [data-save-status]{font-size:12px;max-width:30ch}.workshop-skills .sorter-actions button{border-color:#b9cbdb44}.workshop-skills button[aria-current="page"]{outline:2px solid currentColor;outline-offset:1px}.skill-status{margin:0;font-size:12px}.workshop-skill-controls{position:relative}.workshop-skill-controls>summary{cursor:pointer;padding:8px}.workshop-skill-controls>div{position:absolute;right:0;top:100%;z-index:60;width:min(360px,85vw);max-height:70vh;overflow:auto;background:var(--oil,#10141c);color:var(--armor,#dfe8ef);border:1px solid #aaa;padding:16px;box-shadow:0 4px 14px #0002}.workshop-skill-controls[hidden]{display:none}.skill-driving label{display:block}.skill-driving fieldset{min-width:0}.sorter-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.sorter-actions[hidden]{display:none}`;
  document.head.append(style);
  async function persist(patch) {
    if(stale)throw Error(t('Project changed. Reload Workshop.','專案已變更，請重新載入工作坊。'));
    const result=await store.mutate(p=>{p.projects.workshopSkills={...(p.projects.workshopSkills||{}),...patch};return p;},{reason:'workshop-skill-selection'});
    if(!result.ok)throw Error(result.error||'Could not save skill selection');
    skills={...skills,...patch};
  }
  function paint(){for(const b of nav.querySelectorAll('[data-skill]')){b.setAttribute('aria-current',b.dataset.skill===active?'page':'false');b.disabled=busy||stale;}details.hidden=active==='free';recyclingPanel.hidden=active!=='recycling';driving.hidden=active!=='driving';for(const panel of driving.querySelectorAll('.driving-teacher,[data-pair-correction]'))panel.hidden=legacy;}
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
      else if(!destination&&id==='driving'&&!legacy&&!game.publishDrivingPair?.())await game.newSkillMachine(id);
      await game.saveDrivingMachine();await flushWorkspaces();
      await persist(legacy&&initial?{active:id}:{active:id,[id]:{...skills[id],machineId:game.sourceMachineId()}});
      active=id;status.textContent=legacy?t('Earlier driving machine','舊版駕駛機器'):'';paint();if(id==='recycling')refresh();window.dispatchEvent(new CustomEvent('workshop-skill',{detail:{id}}));
    }catch(error){status.textContent=error.message;}finally{busy=false;paint();}
  }
  for(const skill of WORKSHOP_SKILLS){const b=document.createElement('button');b.textContent=t(skill.en,skill.zh);b.dataset.skill=skill.id;b.onclick=()=>switchTo(skill.id);nav.insertBefore(b,status);}
  launch.onclick=async()=>{if(busy||stale)return;busy=true;paint();launch.disabled=true;try{await game.saveDrivingMachine();await flushWorkspaces();if(!legacy&&!game.publishDrivingPair())throw Error(t('Teach both steering and speed models first.','請先教導轉向及車速模型。'));const result=await publishDriveModelToCity();if(!result.ok)throw Error(result.error);if(!legacy)await persist({driving:{machineId:game.sourceMachineId(),modelRef:result.key}});await flushWorkspaces();const back=skillSimulationURL('driving');if(legacy){back.searchParams.set('drivingMode','legacy');back.searchParams.set('exercise',entryParams.get('exercise')||'bend');}else if(entryParams.get('repeat')==='1')back.searchParams.set('repeat','1');location.assign(back);}catch(error){message.textContent=error.message;launch.disabled=false;}finally{busy=false;paint();}};
  const invalidate=()=>{stale=true;status.textContent=t('Project changed. Reload Workshop.','專案已變更，請重新載入工作坊。');paint();launch.disabled=true;recyclingPanel.inert=true;};
  window.addEventListener('storage',e=>{if(e.key===ACTIVE_PROJECT_KEY&&e.newValue!==project.id)invalidate();});
  window.addEventListener(PROJECT_EVENT,e=>{if(['switched','imported'].includes(e.detail?.type))invalidate();});
  // Preserve the machine already on the table as Free build on the first visit.
  if(!skills.free?.machineId){await game.saveDrivingMachine();await flushWorkspaces();await persist({free:{machineId:game.sourceMachineId()}});}
  const params=new URLSearchParams(location.search);
  if(!skills.driving?.machineId){const driving=await store.readSection('driving');const source=driving.bundles?.[driving.installed]?.machineId;if(source)await persist({driving:{machineId:source,modelRef:driving.installed}});}
  const publishedSorter=await store.readSection('recyclingMachine');if(!skills.recycling?.machineId&&publishedSorter.sourceMachineId)await persist({recycling:{machineId:publishedSorter.sourceMachineId}});
  if(!skills.recycling?.machineId&&params.get('skill')!=='drive'&&params.get('hostInstanceId')){const caps=await store.readCapabilities(),installs=await store.readInstallations();const cap=caps[Object.values(installs).find(i=>i.hostInstanceId===params.get('hostInstanceId'))?.capabilityRef];if(cap?.workshop?.sourceMachineId)await persist({recycling:{machineId:cap.workshop.sourceMachineId,modelRef:'table:'+cap.workshop.modelId}});}

  const drivingState=await store.readSection('driving'),correction=drivingState.correction;
  if(correction){
    const box=document.createElement('details'),title=document.createElement('summary');box.dataset.pairCorrection='';title.textContent=t('Improve the recorded decision','改進已記錄的決定');
    const readings=document.createElement('pre');readings.textContent=JSON.stringify(correction.readings,null,2);
    const role=document.createElement('select');role.setAttribute('aria-label',t('Model','模型'));role.add(new Option(t('Steering','轉向'),'steering'));role.add(new Option(t('Speed','車速'),'speed'));
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
