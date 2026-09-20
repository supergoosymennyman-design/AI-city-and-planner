/**
 * visual-script.js — Visual scripting editor for drones and buses
 * Drag command blocks to build logic flows.
 */
const VisualScript = (() => {
  'use strict';

  const BLOCKS = {
    triggers: [
      { id:'obstacle', label:'Obstacle Detected', emoji:'🚧' },
      { id:'destination', label:'At Destination', emoji:'📍' },
      { id:'battery_low', label:'Battery < 20%', emoji:'🔋' },
      { id:'rush_hour', label:'Time = Rush Hour', emoji:'⏰' },
    ],
    actions: [
      { id:'fly_up', label:'Fly Up', emoji:'⬆️', params:[{key:'meters',label:'Meters',type:'range',min:2,max:20,default:5}] },
      { id:'turn_left', label:'Turn Left', emoji:'↩️' },
      { id:'turn_right', label:'Turn Right', emoji:'↪️' },
      { id:'open_door', label:'Open Door', emoji:'🚪' },
      { id:'close_door', label:'Close Door', emoji:'🚪' },
      { id:'wait', label:'Wait', emoji:'⏸️', params:[{key:'seconds',label:'Seconds',type:'range',min:1,max:10,default:3}] },
      { id:'resume', label:'Resume Path', emoji:'▶️' },
      { id:'return_base', label:'Return to Base', emoji:'🏠' },
      { id:'deploy_extra', label:'Deploy Extra', emoji:'➕' },
    ],
    conditions: [
      { id:'if_clear', label:'If Clear', emoji:'✅', children:true },
      { id:'if_obstacle', label:'If Obstacle', emoji:'⚠️', children:true },
      { id:'if_passengers', label:'If Passengers > N', emoji:'👥', params:[{key:'count',label:'Count',type:'range',min:1,max:20,default:5}] },
    ],
    loops: [
      { id:'repeat', label:'Repeat N Times', emoji:'🔄', params:[{key:'count',label:'Times',type:'range',min:1,max:10,default:3}], children:true },
    ],
  };

  function openEditor(buildingId, type) {
    const panel = document.getElementById('script-editor');
    const body = document.getElementById('script-body');
    panel.style.display = 'block';

    const script = Game.state.scripts[buildingId] || [];
    body.innerHTML = `
      <div style="font-size:var(--fs-sm);margin-bottom:8px">Editing: ${type === 'drone' ? '🛸 Drone' : '🚏 Bus'} #${buildingId}</div>
      <div id="script-palette" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        <div style="font-size:var(--fs-xs);color:var(--text2);width:100%">Blocks:</div>
        ${Object.entries(BLOCKS).flatMap(([cat, blocks]) =>
          blocks.map(b => `<button class="btn-sm script-add-btn" data-cat="${cat}" data-id="${b.id}" style="background:var(--bg3);font-size:10px">${b.emoji||''} ${b.label}</button>`)
        ).join('')}
      </div>
      <div id="script-list" style="min-height:100px;border:1px dashed var(--border);border-radius:var(--r-sm);padding:8px">
        ${script.length === 0 ? '<div style="font-size:var(--fs-xs);color:var(--text3);text-align:center;padding:20px">Drag blocks below to build your script</div>' :
          '<div style="font-size:var(--fs-xs);color:var(--text2);margin-bottom:4px)">Current script:</div>' +
          script.map((s, i) => `<div style="display:flex;gap:4px;align-items:center;padding:4px;background:var(--bg3);border-radius:var(--r-sm);margin:2px 0;font-size:10px">
            <span>${i+1}.</span>
            <span>${s.label}</span>
            <button class="script-remove-btn" data-idx="${i}" style="margin-left:auto;background:var(--danger);color:white;border:none;border-radius:2px;padding:1px 6px;font-size:9px">✕</button>
          </div>`).join('')}
      </div>
    `;

    // Add block event
    body.querySelectorAll('.script-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat, id = btn.dataset.id;
        const block = BLOCKS[cat]?.find(b => b.id === id);
        if (!block) return;
        const entry = { id, label: block.label, params: {} };
        if (block.params) block.params.forEach(p => { entry.params[p.key] = p.default; });
        script.push(entry);
        Game.state.scripts[buildingId] = script;
        openEditor(buildingId, type); // Re-render
        Audio.click();
      });
    });

    // Remove block event
    body.querySelectorAll('.script-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        script.splice(idx, 1);
        if (script.length === 0) delete Game.state.scripts[buildingId];
        openEditor(buildingId, type);
        Audio.click();
      });
    });

    document.getElementById('script-save').onclick = () => {
      panel.style.display = 'none';
      Game.save();
      Audio.click();
      toast('✅ Script saved!');
    };
    document.getElementById('script-close').onclick = () => {
      panel.style.display = 'none';
    };
  }

  function toast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  return { openEditor, BLOCKS };
})();
