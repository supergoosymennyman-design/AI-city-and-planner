import { displayName } from '../city-common/display-names.js';
// Outdoor panel: reads existing saved sections; never awards or certifies work.
import { PURPOSES, purposeName } from '../city-common/building-purposes.js';
import { libraryItem } from '../city-common/library.js';
import { catalogType } from '../city-common/catalog.js';
import { QUESTS } from '../hong-kong-real/quests.js';
import { stage1Note } from '../city-common/cap-runtime.js';
import { buildWalkGraph } from '../city-common/walkability.js';
import { buildVisitorRoute, browserSpeechAvailable, speakRouteDirections } from '../city-common/route-guide.js';
import {
  DELIVERY_BATTERY_CAPACITY, DELIVERY_CHARGE_SECONDS, DELIVERY_GRAPH, DELIVERY_MAX_PAYLOAD_KG, DELIVERY_SPEED_MPS,
  advanceDelivery, deliveryRecordFromEnvelope, energyForEdge, startDelivery, withDeliveryRecord,
} from '../city-common/delivery-simulation.js';
import { CF_KEYS } from '../city-common/champion-file.js';
import { WORKSHOP_URL } from '../shared/links.js';
import { currentLang } from './i18n.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountMyWork(api) {
  const button = document.createElement('button');
  button.id = 'my-work-btn'; button.className = 'hud-chip';
  document.querySelector('.hud-right').prepend(button);
  // The HUD host differs between source versions; keep the panel discoverable.
  if (!button.isConnected) document.querySelector('.hud-right').prepend(button);
  const modal = document.createElement('div');
  modal.id = 'my-work-modal'; modal.className = 'modal hidden';
  modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','my-work-title');
  modal.innerHTML = '<div class="modal-backdrop" data-work-close></div><div class="modal-card"><div class="modal-head"><h2 id="my-work-title"></h2><button class="modal-close" data-work-close aria-label="Close">✕</button></div><div class="modal-body" id="my-work-body"></div></div>';
  document.body.appendChild(modal);
  const body = modal.querySelector('#my-work-body');
  const zh = () => currentLang() === 'zh-Hant';
  const tr = (en, cn) => zh() ? cn : en;
  const close = () => { modal.classList.add('hidden'); window.dispatchEvent(new CustomEvent('city:panel-close',{detail:{panel:'my-work'}})); };
  modal.querySelectorAll('[data-work-close]').forEach(el => el.onclick = close);
  const name = b => displayName(b.type,currentLang());
  const actionNames = {
    plan:['Full plan receipt','完整規劃收據'], exhibits:['Outdoor exhibits','戶外展品'], evidence:['Evidence','證據'],
    save:['Save my city','儲存我的城市'], restore:['Open my city file','開啟城市檔案'],
    routes:['Inspect road path','查看道路路徑'], guide:['Visitor route guide','遊客路線導覽'],
    delivery:['One-drone delivery test','單一無人機配送測試'], destinations:['Destinations','目的地'],
    appearance:['Champion appearance','Champion 外觀'],
  };
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  function evidence() {
    const caps = api.readPlantedCaps();
    body.querySelector('#work-content').innerHTML = `<p>${escape(stage1Note(zh()))}</p><p>${tr('Imported records below have not been newly verified by the City.','以下匯入紀錄未經城市重新驗證。')}</p>` +
      (caps.length ? caps.map(cap => `<article class="cap-card"><h3>${escape(cap?.name || cap?.id)}</h3><p>${escape(cap?.model?.algorithm || '—')}</p><p>${tr('Imported evidence records','匯入證據筆數')}: ${Array.isArray(cap?.evidence) ? cap.evidence.length : 0}</p><details><summary>${tr('Imported scores and evidence','匯入分數與證據')}</summary><pre>${escape(JSON.stringify({evaluation:cap?.evaluation ?? null,evidence:cap?.evidence ?? []},null,2))}</pre></details></article>`).join('') : `<p>${tr('No imported evidence yet.','尚未匯入證據。')}</p>`) +
      `<details><summary>${tr('Historical decision records (not reverified)','歷史決策紀錄（未重新驗證）')}</summary><pre>${escape(JSON.stringify(api.readLastDecisions(),null,2))}</pre></details>`;
  }
  function exhibits() {
    const saved = read(CF_KEYS.props); const props = Array.isArray(saved) ? saved : saved?.props;
    body.querySelector('#work-content').innerHTML = `<p>${tr('Saved outdoor props are exhibits, not evidence of an AI skill.','已存戶外道具是展品，並非 AI 技能證據。')}</p>` +
      (Array.isArray(props) && props.length ? `<ul>${props.map(p => `<li>${escape(p?.id ? displayName('lib:'+p.id,currentLang()) : '—')}</li>`).join('')}</ul>` : `<p>${tr('No saved outdoor props to show.','沒有可展示的已存戶外道具。')}</p>`);
  }
  function routeLine(step) {
    const heads = zh()
      ? {'north':'北','north-east':'東北','east':'東','south-east':'東南','south':'南','south-west':'西南','west':'西','north-west':'西北'}
      : {'north':'north','north-east':'north-east','east':'east','south-east':'south-east','south':'south','south-west':'south-west','west':'west','north-west':'north-west'};
    if (zh()) {
      if (step.action === 'start') return `向${heads[step.heading]}走 ${step.metres} 米。`;
      const action = {left:'左轉',right:'右轉','turn-around':'掉頭',continue:'繼續直行'}[step.action];
      return `${action}，向${heads[step.heading]}走 ${step.metres} 米。`;
    }
    if (step.action === 'start') return `Head ${heads[step.heading]} for ${step.metres} m.`;
    const action = {left:'Turn left',right:'Turn right','turn-around':'Turn around',continue:'Continue'}[step.action];
    return `${action}, then head ${heads[step.heading]} for ${step.metres} m.`;
  }
  function routeSvg(layout,result) {
    const graph = buildWalkGraph(layout);
    if (!graph || !result.sourcePath.length) return '';
    const xs=graph.nodes.map(n=>n.x), zs=graph.nodes.map(n=>n.z);
    const minX=Math.min(...xs)-20,minZ=Math.min(...zs)-20,w=Math.max(40,Math.max(...xs)-minX+20),h=Math.max(40,Math.max(...zs)-minZ+20);
    const colour=result.ok?'#39d98a':'#ff6b5f';
    return `<svg role="img" aria-label="${tr('Original-plan Dijkstra route','原始規劃 Dijkstra 路線')}" viewBox="${minX} ${minZ} ${w} ${h}" width="100%" height="200">${graph.edges.map(([a,b])=>`<path d="M${graph.nodes[a].x} ${graph.nodes[a].z} L${graph.nodes[b].x} ${graph.nodes[b].z}" fill="none" stroke="#778697" stroke-width="3" vector-effect="non-scaling-stroke"/>`).join('')}<polyline points="${result.sourcePath.map(n=>`${n.x},${n.z}`).join(' ')}" fill="none" stroke="${colour}" stroke-width="5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function routes(type) {
    const source = api.sourceLayout?.();
    const buildings = source?.buildings || api.layout.buildings || [];
    const options = buildings.map((b,i) => `<option value="${i}">${escape(name(b))} #${i+1}</option>`).join('');
    body.querySelector('#work-content').innerHTML = `<div class="work-route-controls"><label>${tr('Origin','起點')} <select id="work-from">${options}</select></label><label>${tr('Destination','終點')} <select id="work-to">${options}</select></label></div><p>${tr('This guide runs Dijkstra on your original saved plan first. The 400 m budget includes both entrance links and the road path. The 3D line is drawn only after the road transform is checked; separated buildings get new entrance links.','導覽先在你原本儲存的規劃上運行 Dijkstra。400 米預算包括兩端入口連線和道路路徑。道路轉換經核對後才繪畫 3D 路線；被分開的建築物會使用新的入口連線。')}</p><div id="work-route" aria-live="polite"></div>`;
    const from = body.querySelector('#work-from'), to = body.querySelector('#work-to');
    from.value = String(Math.max(0,buildings.findIndex(b => b.type === type)));
    to.value = String(buildings.length > 1 ? (Number(from.value)+1)%buildings.length : 0);
    function draw() {
      const out = body.querySelector('#work-route');
      const result = buildVisitorRoute(source, api.layout, Number(from.value), Number(to.value));
      out.dataset.routeStatus = result.status;
      api.clearVisitorRoute?.();
      if (result.status === 'no-road-access') { out.textContent=tr('Unavailable: this city has no usable road access.','無法使用：這座城市沒有可用的道路入口。'); return; }
      if (result.status === 'disconnected') { out.textContent=tr('Disconnected: no road path joins these two entrances.','道路不連通：兩個入口之間沒有道路路線。'); return; }
      if (result.status === 'unavailable-selection') { out.textContent=tr('Unavailable: choose two existing places.','無法使用：請選擇兩個現有地點。'); return; }
      const sourceMap = routeSvg(source,result);
      if (result.status === 'geometry-unverified') {
        out.innerHTML=`<p>${tr('Original-plan route found, but the source-road to rendered-road transform could not be verified. No 3D route was drawn.','已找到原始規劃路線，但無法核對來源道路至呈現道路的轉換，因此沒有繪畫 3D 路線。')}</p><p>${result.sourceDistance} m / ${result.budget} m</p>${sourceMap}`;
        return;
      }
      api.showVisitorRoute?.(result);
      const lines=result.directions.map(routeLine);
      const verdict=result.ok?tr('Within budget','預算內'):tr('Over budget','超出預算');
      out.innerHTML=`<p class="route-verdict ${result.ok?'ok':'over'}"><strong>${verdict}</strong> · ${tr('original-plan total route distance (entrance + road distance)','原始規劃總路程（入口連線 + 道路距離）')} ${result.sourceDistance} m / ${result.budget} m</p><p>${tr('Rendered City route','呈現城市路線')}: ${result.worldDistance} m · ${tr('entrance links','入口連線')} ${result.entranceLinks.start} m + ${result.entranceLinks.end} m</p>${sourceMap}<h3>${tr('Text directions','文字方向')}</h3><ol class="route-directions">${lines.map(line=>`<li>${escape(line)}</li>`).join('')}<li>${tr('Arrive at your destination.','到達目的地。')}</li></ol><p>${tr('The line and words come from route search, not a landmark classifier or Workshop Speaker.','線條和文字來自路線搜尋，並非地標分類器或 Workshop Speaker。')}</p>${browserSpeechAvailable()?`<button id="work-speak-route">${tr('Read aloud (browser voice)','朗讀（瀏覽器語音）')}</button>`:''}`;
      body.querySelector('#work-speak-route')?.addEventListener('click',()=>speakRouteDirections([...lines,tr('Arrive at your destination.','到達目的地。')],globalThis,zh()?'zh-HK':'en-HK'));
    }
    from.onchange=to.onchange=draw; draw();
  }

  function deliveryDemo() {
    const saved = deliveryRecordFromEnvelope(api.getPropsEnvelope?.());
    body.querySelector('#work-content').innerHTML=`<p><strong>${tr('Rule/search simulation — not trained AI and not a full delivery network.','規則／搜尋模擬——不是已訓練 AI，也不是完整配送網絡。')}</strong></p><ul class="delivery-rules"><li>${tr(`Battery: capacity ${DELIVERY_BATTERY_CAPACITY}; an edge costs distance × payload factor. Too little battery strands the drone part-way.`,`電量：容量 ${DELIVERY_BATTERY_CAPACITY}；每段耗電為距離乘載重系數。電量不足會令無人機中途滯留。`)}</li><li>${tr('No-fly: red edges are removed from the search when the rule is on.','禁飛區：規則開啟時，搜尋會排除紅色路段。')}</li><li>${tr(`Charging: reaching the blue pad resets battery to ${DELIVERY_BATTERY_CAPACITY} and adds ${DELIVERY_CHARGE_SECONDS} seconds.`,`充電：到達藍色充電台會把電量重設為 ${DELIVERY_BATTERY_CAPACITY}，並增加 ${DELIVERY_CHARGE_SECONDS} 秒。`)}</li><li>${tr(`Payload: 1 kg uses ×1 energy; 2 kg uses ×1.35; over ${DELIVERY_MAX_PAYLOAD_KG} kg is rejected.`,`載重：1 公斤耗電 ×1；2 公斤耗電 ×1.35；超過 ${DELIVERY_MAX_PAYLOAD_KG} 公斤會被拒絕。`)}</li><li>${tr(`Time: flight runs at ${DELIVERY_SPEED_MPS} m/s; charging delay is included in elapsed time.`,`時間：飛行速度為每秒 ${DELIVERY_SPEED_MPS} 米；總時間包括充電延誤。`)}</li></ul><div class="delivery-settings"><label>${tr('Customer','客戶')} <select id="delivery-target"><option value="harbour">${tr('Harbour customer','海旁客戶')}</option><option value="park">${tr('Park customer','公園客戶')}</option></select></label><label>${tr('Search rule','搜尋規則')} <select id="delivery-strategy"><option value="battery-aware">${tr('Battery-aware feasible route','考慮電量的可行路線')}</option><option value="shortest">${tr('Shortest allowed route (may strand)','最短許可路線（可能滯留）')}</option></select></label><label>${tr('Starting battery','起始電量')} <select id="delivery-battery"><option value="70">70</option><option value="65">65</option><option value="50">50</option><option value="35">35</option></select></label><label>${tr('Payload','載重')} <select id="delivery-payload"><option value="1">1 kg</option><option value="2">2 kg</option><option value="3">3 kg (${tr('rejected','拒絕')})</option></select></label><label class="work-check"><input id="delivery-nofly" type="checkbox" checked> ${tr('Respect no-fly zone','遵守禁飛區')}</label><label class="work-check"><input id="delivery-charge" type="checkbox" checked> ${tr('Allow charging stop','允許充電站')}</label></div><div class="delivery-buttons"><button id="delivery-new">${tr('Plan / replay from start','規劃／從頭重播')}</button><button id="delivery-next">${tr('Fly next leg','飛行下一段')}</button></div><div id="delivery-result" aria-live="polite"></div>`;
    let state=saved;
    const controls={target:body.querySelector('#delivery-target'),strategy:body.querySelector('#delivery-strategy'),battery:body.querySelector('#delivery-battery'),payload:body.querySelector('#delivery-payload'),noFly:body.querySelector('#delivery-nofly'),charge:body.querySelector('#delivery-charge')};
    if(state){controls.target.value=state.settings.target;controls.strategy.value=state.settings.strategy;controls.battery.value=String(state.settings.initialBattery);controls.payload.value=String(state.settings.payloadKg);controls.noFly.checked=state.settings.respectNoFly;controls.charge.checked=state.settings.allowCharging;}
    const result=body.querySelector('#delivery-result'),next=body.querySelector('#delivery-next');
    const persist=()=>{const envelope=withDeliveryRecord(api.getPropsEnvelope?.(),state);return !!envelope&&api.replacePropsEnvelope?.(envelope);};
    function render() {
      if(!state){result.innerHTML=`<p>${tr('Choose settings, then plan a route.','選擇設定，然後規劃路線。')}</p>`;next.disabled=true;return;}
      api.showDelivery?.(state,DELIVERY_GRAPH);
      const status={ready:tr('Ready at depot','在配送站準備'),paused:tr('Paused — resume with the next leg','已暫停——按下一段繼續'),delivered:tr('Delivered','已送達'),stranded:tr('Stranded: battery empty between stops','滯留：在站點之間耗盡電量'),infeasible:state.reason==='payload-policy'?tr('Infeasible: payload exceeds the 2 kg policy','不可行：載重超過 2 公斤規則'):tr('Infeasible: no route satisfies the chosen rules','不可行：沒有路線符合所選規則')}[state.status];
      const route=state.route.length?state.route.join(' → '):tr('none','沒有');
      const nextEdge=state.route[state.routeIndex+1]&&DELIVERY_GRAPH.edges.find(e=>(e.from===state.currentNode&&e.to===state.route[state.routeIndex+1])||(e.to===state.currentNode&&e.from===state.route[state.routeIndex+1]));
      const nextCost=nextEdge?energyForEdge(nextEdge.distance,state.settings.payloadKg):null;
      result.dataset.deliveryStatus=state.status;
      result.innerHTML=`<p><strong>${escape(status)}</strong></p><p>${tr('Planned route','規劃路線')}: ${escape(route)}</p><dl class="delivery-metrics"><div><dt>${tr('Deliveries completed','完成配送')}</dt><dd>${state.deliveries}</dd></div><div><dt>${tr('Battery remaining','剩餘電量')}</dt><dd>${Math.round(state.battery)}</dd></div><div><dt>${tr('Distance flown','飛行距離')}</dt><dd>${Math.round(state.distance)} m</dd></div><div><dt>${tr('Energy used','已用電量')}</dt><dd>${Math.round(state.energyUsed)}</dd></div><div><dt>${tr('Elapsed time','經過時間')}</dt><dd>${Math.round(state.elapsedSeconds)} s</dd></div><div><dt>${tr('Charging stops','充電次數')}</dt><dd>${state.chargeStops}</dd></div></dl>${nextCost!=null?`<p>${tr('Next leg cost','下一段耗電')}: ${nextCost}</p>`:''}<p class="delivery-save">${tr('Saved inside the existing City props section for Champion File restore.','已儲存在現有的城市道具區段，可透過 Champion File 還原。')}</p>`;
      next.disabled=!['ready','paused'].includes(state.status);
    }
    body.querySelector('#delivery-new').onclick=()=>{
      state=startDelivery({target:controls.target.value,strategy:controls.strategy.value,initialBattery:Number(controls.battery.value),payloadKg:Number(controls.payload.value),respectNoFly:controls.noFly.checked,allowCharging:controls.charge.checked});
      if(!persist())result.innerHTML=`<p role="alert">${tr('The test could not be saved. Your existing props were not replaced.','無法儲存測試；現有道具沒有被取代。')}</p>`;else render();
    };
    next.onclick=()=>{state=advanceDelivery(state);if(!persist())result.insertAdjacentHTML('afterbegin',`<p role="alert">${tr('This step could not be saved.','無法儲存這一步。')}</p>`);render();};
    render();
  }
  function destinations() {
    const buildings = api.layout.buildings || [];
    body.querySelector('#work-content').innerHTML = buildings.map((b,i)=>`<div class="work-destination"><span>${escape(name(b))} #${i+1}</span><button data-walk="${i}">${tr('Walk','步行')}</button><button data-fly="${i}">${tr('Taxi','飛行的士')}</button></div>`).join('');
    body.querySelectorAll('[data-walk], [data-fly]').forEach(el => el.onclick=()=>{ const moved = api.navigate(buildings[Number(el.dataset.walk ?? el.dataset.fly)],el.hasAttribute('data-fly')); if (moved) close(); else { let status = body.querySelector('#work-nav-status'); if (!status) { status = document.createElement('p'); status.id = 'work-nav-status'; status.setAttribute('role','status'); body.querySelector('#work-content').prepend(status); } status.textContent = tr('Navigation is unavailable right now. Leave the taxi to walk, or try again once your Champion is ready.','暫時無法導航。請先離開的士再步行，或待 Champion 準備好後再試。'); } });
  }
  function action(id,type) {
    if (id==='evidence') evidence();
    if (id==='exhibits') exhibits();
    if (id==='routes') routes(type);
    if (id==='guide') routes(type);
    if (id==='delivery') deliveryDemo();
    if (id==='destinations') destinations();
    if (id==='plan') {
      if (api.hasPlan()) { close(); api.openPlan(); }
      else body.querySelector('#work-content').textContent=tr('No saved plan receipt yet. Open the Planner and save a plan.','尚無已存規劃收據。請開啟規劃器並儲存規劃。');
    }
    if (id==='save') { close(); document.getElementById('btn-save-hud').click(); }
    if (id==='restore') { close(); document.getElementById('file-input').click(); }
    if (id==='appearance') { close(); document.getElementById('skin-toggle')?.click(); }
  }
  function open(type='city_central',initial=null) {
    const p=Object.hasOwn(PURPOSES,type) ? PURPOSES[type] : null; if(!p) return;
    modal.querySelector('h2').textContent=purposeName(type,zh());
    body.innerHTML=`<p>${escape(zh()?p.descriptionZh:p.description)}</p><p>${tr('Outdoor My Work · all purposes are available','戶外我的作品 · 所有用途均可使用')}</p><div class="work-actions">${[...new Set(['appearance','save','restore',...p.actions,'destinations'])].map(id=>`<button data-work-action="${id}">${escape(actionNames[id][zh()?1:0])}</button>`).join('')}</div><div id="work-content" aria-live="polite"></div><details id="work-optional"><summary>${tr('Optional historical games & tools','自選歷史遊戲與工具')}</summary><p>${tr('These links may be unavailable. Done records activity only, never a skill or lesson completion.','連結可能無法使用。「完成」只記錄活動，不認證技能或課堂完成。')}</p><button id="work-game">${tr('Open historical game','開啟歷史遊戲')}</button><button id="work-workshop">Workshop</button><p id="work-link-status" role="status"></p><details><summary>${tr('Saved activity history','已存活動紀錄')}</summary><pre>${escape(JSON.stringify(read(CF_KEYS.quests),null,2))}</pre></details></details>`;
    body.querySelectorAll('[data-work-action]').forEach(el=>el.onclick=()=>action(el.dataset.workAction,type));
    const legacy=QUESTS.find(q=>q.id===catalogType(type)?.questId);
    body.querySelector('#work-game').onclick=()=>{
      if (!legacy?.gameUrl) { body.querySelector('#work-link-status').textContent=tr('No historical game link is available for this landmark.','這座地標沒有可用的歷史遊戲連結。'); return; }
      close(); api.openGame({questId:legacy.id,name:legacy.name,gameUrl:legacy.gameUrl});
    };
    body.querySelector('#work-workshop').onclick=()=>{ close(); api.openGame({name:'Workshop',gameUrl:WORKSHOP_URL}); };
    window.dispatchEvent(new CustomEvent('city:panel-open',{detail:{panel:'my-work'}}));
    modal.classList.remove('hidden'); modal.querySelector('[data-work-close].modal-close').focus();
    if (initial) action(initial,type);
  }
  const localize=()=>{modal.querySelector('.modal-close').setAttribute('aria-label',tr('Close','關閉'));button.textContent=tr('My Work','我的作品');if(!modal.classList.contains('hidden'))close();};
  localize(); button.onclick=()=>open();
  window.addEventListener('i18n:change',localize);
  return {open,close,isOpen:()=>!modal.classList.contains('hidden'),dispose(){window.removeEventListener('i18n:change',localize);button.remove();modal.remove();}};
}
