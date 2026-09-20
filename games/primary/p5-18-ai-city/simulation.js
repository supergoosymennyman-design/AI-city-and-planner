/**
 * simulation.js — Crisis engine, cascading failures, agent rendering for AI City Architect
 * Handles 4 crisis events with time limits and multi-choice resolutions.
 */
const Simulation = (() => {
  'use strict';

  let animId = null, lastT = 0, onUpdate = null;

  function init(cb) {
    onUpdate = cb || (() => {});
  }

  function start() {
    Game.initSim();
    lastT = performance.now();
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  function stop() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  function loop(ts) {
    const dt = ts - lastT;
    lastT = ts;
    Game.tickSim(dt);
    render();
    onUpdate();
    animId = requestAnimationFrame(loop);
  }

  function render() {
    const st = Game.state;
    if (!st.sim) return;

    renderAgents();
    renderConnections();
    renderDash();
    renderCrisis();
    updateClock();
  }

  function renderAgents() {
    const layer = document.getElementById('agent-layer');
    const grid = document.getElementById('grid');
    if (!layer || !grid || !st().sim?.agents) return;
    const rect = grid.getBoundingClientRect();
    if (!rect.width) return;
    const tw = rect.width / Game.GRID, th = rect.height / Game.GRID;
    layer.style.width = rect.width + 'px';
    layer.style.height = rect.height + 'px';
    const st = Game.state;

    let h = '';
    st.sim.agents.forEach(a => {
      const x = (a.col+0.5)*tw, y = (a.row+0.5)*th;
      if (a.type==='bus') h+=`<div class="agent" style="left:${x-10}px;top:${y-7}px;width:20px;height:14px;background:#facc15;border-radius:2px"></div>`;
      else if (a.type==='drone') h+=`<div class="agent" style="left:${x-6}px;top:${y-6}px;width:12px;height:12px;background:#fb923c;border-radius:2px;transform:rotate(45deg)"></div>`;
      else if (a.type==='citizen'&&a.visible) h+=`<div class="agent" style="left:${x-5}px;top:${y-5}px;width:10px;height:10px;background:${a.color};opacity:0.7"></div>`;
    });
    layer.innerHTML = h;
  }

  function renderConnections() {
    const svg = document.getElementById('grid-svg');
    const grid = document.getElementById('grid');
    if (!svg || !grid) return;
    const rect = grid.getBoundingClientRect();
    if (!rect.width) return;
    const tw = rect.width / Game.GRID, th = rect.height / Game.GRID;
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.width = rect.width+'px'; svg.style.height = rect.height+'px';

    const st = Game.state;
    const crisis = st.sim?.crisis && !st.sim.crisis.resolved;
    let h = '';
    st.connections?.forEach(c => {
      const f = Game.bldById(c.fromId), t = Game.bldById(c.toId);
      if (!f||!t) return;
      const color = crisis ? '#ef4444' : '#475569';
      h += `<line x1="${(f.col+0.5)*tw}" y1="${(f.row+0.5)*th}" x2="${(t.col+0.5)*tw}" y2="${(t.row+0.5)*th}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5"/>`;
    });
    svg.innerHTML = h;
  }

  function renderDash() {
    const st = Game.state;
    const sys = st.sim?.systems;
    const bars = document.getElementById('dash-bars');
    const events = document.getElementById('dash-events');
    const metrics = document.getElementById('dash-metrics');
    const econ = document.getElementById('dash-econ');

    if (bars && sys) {
      const names = {power:'⚡ Power',water:'💧 Water',transport:'🚌 Transport',health:'🏥 Health',waste:'♻️ Waste',governance:'🏛️ Governance'};
      bars.innerHTML = Object.entries(names).map(([k,n])=>{
        const h=Math.round(sys[k]?.health||0);
        const c=h>70?'var(--success)':h>30?'var(--warning)':'var(--danger)';
        return `<div class="dash-bar"><div class="dbl"><span>${n}</span><span>${h}%</span></div><div class="dbf"><div class="dbf-inner" style="width:${h}%;background:${c}"></div></div></div>`;
      }).join('');
    }

    if (metrics) {
      metrics.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);margin-bottom:6px">
        <span>😊 ${st.sim.sentiment||0}%</span>
        <span>👥 ${Math.round(st.sim.population)}</span>
      </div>`;
    }

    if (econ) {
      econ.innerHTML = `GDP:${Math.round(st.economics.gdp)} Inflation:${st.economics.inflation.toFixed(1)}% Debt:${Math.round(st.economics.debt)} Approval:${Math.round(st.economics.approval)}%`;
    }

    if (events && st.sim.eventLog) {
      events.innerHTML = st.sim.eventLog.slice(0,5).map(e =>
        `<div class="dash-event" style="font-size:var(--fs-xs);padding:2px 0;border-bottom:1px solid var(--bg3)">${e.msg}</div>`
      ).join('');
    }
  }

  function renderCrisis() {
    const st = Game.state;
    const box = document.getElementById('dash-crisis');
    const desc = document.getElementById('crisis-desc');
    const acts = document.getElementById('crisis-actions');
    if (!box || !desc || !acts) return;

    const c = st.sim?.crisis;
    if (!c || c.resolved) { box.style.display = 'none'; return; }
    box.style.display = 'block';

    if (c.type === 'heatwave_cyber') {
      desc.textContent = '🔥 Heatwave + Cyber Attack! Power demand +50%. Choose load-shedding:';
      acts.innerHTML = `
        <button class="btn-sm" data-cr="img">🖼️ Shutdown AI Image Gen</button>
        <button class="btn-sm" data-cr="game">🎮 Shutdown AI Gaming</button>
        <button class="btn-sm" data-cr="hospital">🏥 Reduce Hospital AI</button>
        <button class="btn-sm" data-cr="all">⚡ Emergency Load Shed</button>`;
      acts.querySelectorAll('[data-cr]').forEach(btn => {
        btn.addEventListener('click', () => {
          Game.resolveCrisis('heatwave_cyber');
          box.style.display = 'none';
          toast('✅ Crisis resolved!');
        }, {once:true});
      });
    } else if (c.type === 'flood') {
      desc.textContent = '🌊 Flood + Supply Freeze! 4 road tiles blocked. Crisis auto-resolves in 60s if no action. Tap to reroute.';
      acts.innerHTML = `<button class="btn-sm" data-cr="reroute">🔄 Reroute Traffic</button>`;
      acts.querySelector('[data-cr="reroute"]').addEventListener('click', () => {
        Game.resolveCrisis('flood');
        box.style.display = 'none';
        toast('✅ Rerouted!');
      }, {once:true});
    } else if (c.type === 'economic') {
      desc.textContent = '📉 Economic Shock! GDP -5%/tick. Adjust policies:';
      acts.innerHTML = `
        <button class="btn-sm" data-cr="cut">✂️ Cut Spending (-5% services)</button>
        <button class="btn-sm" data-cr="print">💰 Print Money (+10% inflation)</button>
        <button class="btn-sm" data-cr="stimulus">📊 Stimulus Package (-20 tokens)</button>`;
      acts.querySelectorAll('[data-cr]').forEach(btn => {
        btn.addEventListener('click', () => {
          Game.resolveCrisis('economic');
          box.style.display = 'none';
          toast('✅ Economy stabilized!');
        }, {once:true});
      });
    } else if (c.type === 'surge') {
      desc.textContent = '👥 Population surge! +50/tick. Build emergency facilities (3 slots):';
      acts.innerHTML = `<button class="btn-sm" data-cr="clinic">🩺 Emergency Clinic</button>
        <button class="btn-sm" data-cr="housing">🏠 Temp Housing</button>
        <button class="btn-sm" data-cr="water">💧 Mobile Water</button>`;
      let built = 0;
      acts.querySelectorAll('[data-cr]').forEach(btn => {
        btn.addEventListener('click', () => {
          built++;
          btn.disabled = true;
          btn.style.opacity = '0.5';
          toast('✅ Built! ('+built+'/3)');
          if (built >= 3) {
            Game.resolveCrisis('surge');
            box.style.display = 'none';
            toast('🎉 All emergency facilities built!');
          }
        }, {once:true});
      });
    }
  }

  function updateClock() {
    const st = Game.state;
    const clock = document.getElementById('sim-clock');
    const pop = document.getElementById('sim-population');
    const year = document.getElementById('sim-year');
    if (clock) clock.textContent = '⏱ ' + formatTime(st.sim?.time||0);
    if (pop) pop.textContent = '👥 ' + Math.round(st.sim?.population||0);
    if (year) year.textContent = st.sim?.displayYear || '2025';
  }

  function formatTime(t) {
    const s = Math.floor(t/60), m = Math.floor(s/60);
    return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  }

  function st() { return Game.state; }
  function toast(msg) {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  return { init, start, stop };
})();
