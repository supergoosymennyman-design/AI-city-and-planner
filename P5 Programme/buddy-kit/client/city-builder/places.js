export function createDestinationRegistry(){
  const entries=new Map();
  return {register(entry){if(!entry.id||!entry.labels||!entry.enter)throw Error('Invalid destination');entries.set(entry.id,entry);return ()=>entries.delete(entry.id);},all:()=>[...entries.values()],clear:()=>entries.clear(),
    nearest(point){return [...entries.values()].filter(e=>e.available&&e.arrival).map(e=>({e,d:Math.hypot(e.arrival.x-point.x,e.arrival.z-point.z)})).filter(v=>v.d<=12).sort((a,b)=>a.d-b.d||a.e.id.localeCompare(b.e.id))[0]?.e||null;}};
}
export function mountPlaces({registry,travel,language}){
  const el=document.getElementById('city-workspaces'),summary=el.querySelector('summary'),nav=el.querySelector('nav'),links=[...nav.querySelectorAll('a')];
  const lifetime=new AbortController(),listen=(target,event,fn)=>target.addEventListener(event,fn,{signal:lifetime.signal});
  const t=(en,zh)=>language()==='zh-Hant'?zh:en;
  function close(focus=true){if(!el.open)return;el.open=false;if(focus)summary.focus();}
  function render(){summary.textContent=t('Places','地點');nav.setAttribute('aria-label',summary.textContent);nav.replaceChildren();
    const title=document.createElement('strong');title.textContent=t('In this city','城市裡');nav.append(title);
    for(const entry of registry.all()){
      const button=document.createElement('button');button.dataset.destination=entry.id;
      button.textContent=`${entry.labels[language()==='zh-Hant'?'zh':'en']} · ${entry.available?t('Go to site','前往地點'):t('Open practice venue','開啟練習場地')}`;
      button.onclick=()=>{close();if(entry.available)travel(entry);else entry.enter();};nav.append(button);
    }
    const heading=document.createElement('strong');heading.textContent=t('Workspaces','工作空間');
    const names=[['Hub','主頁'],['Academy','學院'],['Planner','規劃器'],['Studio','造型工作室'],['Workshop','AI 工坊']];
    links.forEach((link,i)=>{if(names[i])link.textContent=t(...names[i]);});nav.append(heading,...links);
  }
  listen(nav,'click',event=>{if(event.target.closest('a'))close();});
  listen(el,'toggle',()=>{if(el.open)render();});listen(document,'pointerdown',e=>{if(!el.contains(e.target))close();});
  listen(document,'keydown',e=>{if(e.key==='Escape')close();});
  for(const event of ['city:panel-open','city:mode-change','modal:change'])listen(window,event,()=>close());
  listen(window,'i18n:change',render);
  render();return {render,close,destroy(){close(false);lifetime.abort();nav.replaceChildren(...links);}};
}
