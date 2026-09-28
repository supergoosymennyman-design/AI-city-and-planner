import { publishRecyclingMachine } from '../city-common/recycling-machine-project.js';
import { mountSkillTabs, skillSimulationURL } from './skill-tabs.js';
import { flushWorkspaces } from '../city-common/workspace.js';
import { createProjectStore } from '../city-common/project-store.js';
import { SORTER_MAX_PHOTOS, readSorterSession, writeSorterSession } from '../city-common/sorter-session.js';
import { RECYCLING_DIMENSION } from '../city-common/recycling.js';
const t=(en,zh)=>localStorage.getItem('hk_ai_city_lang_v1')==='zh-Hant'?zh:en;
const store=createProjectStore(), panel=document.createElement('section');panel.hidden=true;
panel.innerHTML=`<p>${t('Train models using the Model blocks. Connect the intake, routing blocks and destination bins.','使用模型積木訓練模型。連接入口、分流積木及目的地回收箱。')}</p><label>${t('City exercise','城市練習')} <select data-exercise><option value="materials-v2">${t('Material practice — 12 objects','物料練習 — 12 件物品')}</option><option value="batch-1">${t('Earlier practice — 9 objects','舊版練習 — 9 件物品')}</option><option value="personal">${t('My sorting photos','我的待分類相片')}</option></select></label><label>${t('Add sorting photos (this session only)','加入待分類相片（只限本次使用）')}<input data-photos type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p data-count></p><button data-clear>${t('Clear photos','清除相片')}</button>`;
document.body.append(panel);
let tabs,session,projectId,busy=false,published=null,lastDraft='',savedCityName='';
const actions=document.createElement('div');actions.className='sorter-actions';actions.hidden=true;
actions.innerHTML=`<button data-save-sorter>${t('Save sorter','儲存分類機')}</button><button data-city>${t('Try in AI City','到 AI 城市試試')}</button><span role="status" data-save-status></span>`;
const status=message=>actions.querySelector('[data-save-status]').textContent=message;
const count=()=>panel.querySelector('[data-count]').textContent=t(`${session.batch.length} photos waiting`,`${session.batch.length} 張待分類相片`);
function write(patch){const result=writeSorterSession({...session,...patch});if(!result.ok)throw Error(result.error);session=result.data;count();}
async function save(){
  if(busy)return false;busy=true;tabs.lock(true);
  try {
    const game=window.WorkshopGame;lastDraft=JSON.stringify(game.recyclingDraft());
    const draft=await publishRecyclingMachine({store,game,runtime:window.WorkshopRecyclingMachine,flush:flushWorkspaces,projectId});
    published=JSON.stringify(draft);savedCityName=draft.name;status(t('Saved for City','已儲存到城市'));return true;
  }catch(e){status((published?t(`Not saved. City keeps the previous sorter (${savedCityName}). `,`未儲存。城市保留上一部分類機（${savedCityName}）。`):t('Not saved. No sorter is saved for City yet. ','未儲存。城市還沒有已儲存的分類機。'))+e.message);return false;}
  finally{busy=false;tabs.lock(false);}
}
actions.querySelector('[data-save-sorter]').onclick=save;
actions.querySelector('[data-city]').onclick=async()=>{if(await save()){const url=skillSimulationURL('recycling');url.searchParams.set('exercise',panel.querySelector('[data-exercise]').value);location.assign(url.href);}};
panel.querySelector('[data-exercise]').onchange=async()=>{const exercise=panel.querySelector('[data-exercise]').value;await store.mutate(p=>{p.projects.activityExercises||={};p.projects.activityExercises.recycling=exercise;return p;},{reason:'recycling-exercise',versioned:false});};
panel.querySelector('[data-clear]').onclick=()=>{try{write({batch:[]});}catch(e){status(e.message);}};
panel.querySelector('[data-photos]').onchange=async e=>{
  if(busy)return;const files=Array.from(e.target.files);e.target.value='';busy=true;tabs.lock(true);
  try{
    const ready=await window.EmbedderManager.init();if(!ready.ok)throw Error(ready.reason||'Photo features unavailable');
    for(const file of files.slice(0,SORTER_MAX_PHOTOS-session.batch.length)){
      const image=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=canvas.height=224;canvas.getContext('2d').drawImage(image,0,0,224,224);image.close();
      const raw=await window.EmbedderManager.embed(canvas);if(raw?.length!==RECYCLING_DIMENSION)throw Error('Invalid photo features');
      const vector=Array.from(raw),length=Math.hypot(...vector);if(!length||!vector.every(Number.isFinite))throw Error('Invalid photo');
      write({batch:[...session.batch,{id:crypto.randomUUID(),vector:vector.map(n=>n/length)}]});
    }
    panel.querySelector('[data-exercise]').value='personal';
  }catch(e){status(e.message);}finally{busy=false;tabs.lock(false);}
};
window.addEventListener('workshop-skill',e=>{actions.hidden=e.detail.id!=='recycling';});
(async()=>{
  try{
    projectId=(await store.openActiveProject()).id;session=readSorterSession(projectId);count();
    const saved=await store.readSection('recyclingMachine');
    savedCityName=saved.name||'';if(saved?.table)published=JSON.stringify({sourceMachineId:saved.sourceMachineId,name:saved.name,seed:saved.seed,table:saved.table});
    tabs=await mountSkillTabs(panel,()=>{});document.querySelector('.workshop-skills').append(actions);actions.hidden=panel.hidden;
    const exercise=new URLSearchParams(location.search).get('exercise')||(await store.readSection('activityExercises')).recycling||(await store.readSection('cityActivities')).recycling?.scenario;
    if(['personal','batch-1','materials-v2'].includes(exercise))panel.querySelector('[data-exercise]').value=exercise;
    lastDraft=JSON.stringify(window.WorkshopGame.recyclingDraft());status(lastDraft===published?t('Saved for City','已儲存到城市'):t('Changes need Save sorter','已更改，請儲存分類機'));setInterval(()=>{if(busy||actions.hidden)return;const draft=JSON.stringify(window.WorkshopGame.recyclingDraft());if(draft!==lastDraft){lastDraft=draft;status(draft===published?t('Saved for City','已儲存到城市'):t('Changes need Save sorter','已更改，請儲存分類機'));}},1000);
  }catch(e){status(e.message);document.body.append(actions);actions.hidden=false;}
})();
