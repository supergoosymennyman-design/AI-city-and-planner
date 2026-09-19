// main.js — UI controller for AI City Architect 3D.
// Builds the palette, wires tile clicks (place/remove/walk), HUD, checklist,
// phase flow (design → simulate), dashboard + crisis panel, main render loop.
import * as THREE from 'three';
import { G, TILE, BLD, SYS_COLOR, SYSTEMS, worldToTile, tileToWorld, isWater, isMtn } from './city-logic.js';
import { placementComment, computeDesignScore, DESIGN_CODE_QUESTIONS } from './island-feedback.js';

export function mountUI(renderer, champion, sim, Game) {
  const game = Game;
  const el = {
    tokens: document.getElementById('hud-tokens'),
    phase: document.getElementById('hud-phase'),
    checkBtn: document.getElementById('hud-check'),
    checkPanel: document.getElementById('check-panel'),
    checkList: document.getElementById('check-list'),
    checkClose: document.getElementById('check-close'),
    paletteList: document.getElementById('palette-list'),
    toolWalk: document.getElementById('tool-walk'),
    toolBuild: document.getElementById('tool-build'),
    toolRemove: document.getElementById('tool-remove'),
    hint: document.getElementById('hint'),
    btnCam: document.getElementById('btn-cam'),
    btnSim: document.getElementById('btn-sim'),
    dashboard: document.getElementById('dashboard'),
    dashSystems: document.getElementById('dash-systems'),
    dashWeather: document.getElementById('dash-weather'),
    dashClock: document.getElementById('dash-clock'),
    dashEvents: document.getElementById('dash-events'),
    crisisPanel: document.getElementById('crisis-panel'),
    crisisTitle: document.getElementById('crisis-title'),
    crisisText: document.getElementById('crisis-text'),
    crisisOptions: document.getElementById('crisis-options'),
  };

  // ---- Palette ----
  function buildPalette() {
    el.paletteList.innerHTML = '';
    for (const sys of SYSTEMS) {
      const header = document.createElement('div');
      header.className = 'palette-sys';
      header.textContent = sysLabel(sys);
      header.style.color = '#' + SYS_COLOR[sys].toString(16).padStart(6, '0');
      el.paletteList.appendChild(header);
      for (const [type, def] of Object.entries(BLD)) {
        if (def.s !== sys) continue;
        const card = document.createElement('div');
        card.className = 'bld-card';
        card.dataset.type = type;
        card.innerHTML = `
          <div class="bld-icon">${def.icon}</div>
          <div class="bld-info">
            <div class="bld-name">${def.l}</div>
            <div class="bld-cost">🪙 ${def.c}</div>
          </div>
          <div class="bld-sys" style="background:#${SYS_COLOR[sys].toString(16).padStart(6,'0')}"></div>`;
        card.addEventListener('click', () => selectBuilding(type));
        el.paletteList.appendChild(card);
      }
    }
  }
  function sysLabel(s) {
    return { power: '⚡ Power', water: '💧 Water', transport: '🚗 Transport', health: '🏥 Health', waste: '♻️ Waste', safety: '🔒 Safety' }[s] || s;
  }

  // ---- Building selection ----
  let selected = null;
  function selectBuilding(type) {
    if (game.state.tool === 'remove') setTool('build');
    game.state.selected = type;
    selected = type;
    document.querySelectorAll('.bld-card').forEach(c => c.classList.toggle('selected', c.dataset.type === type));
    const def = BLD[type];
    el.hint.textContent = `Tap the ground to place ${def.l} (🪙 ${def.c}). Tap again for another.`;
  }

  // ---- Tools ----
  function setTool(t) {
    game.state.tool = t;
    el.toolWalk.classList.toggle('active', t === 'walk');
    el.toolBuild.classList.toggle('active', t === 'build');
    el.toolRemove.classList.toggle('active', t === 'remove');
    document.querySelectorAll('.bld-card').forEach(c => c.classList.remove('selected'));
    if (t === 'walk') el.hint.textContent = 'Tap the ground to walk your champion there. 🚶';
    if (t === 'build') el.hint.textContent = 'Tap a building above, then tap the ground to place it. 🏗️';
    if (t === 'remove') el.hint.textContent = 'Tap a building to remove it (refund). 🗑️';
  }
  el.toolWalk.addEventListener('click', () => setTool('walk'));
  el.toolBuild.addEventListener('click', () => setTool('build'));
  el.toolRemove.addEventListener('click', () => setTool('remove'));

  // ---- Tile picking via raycast ----
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const groundPickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function pickTile(e) {
    const rect = renderer.renderer.domElement.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    mouse.x = (px / rect.width) * 2 - 1;
    mouse.y = -(py / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, renderer.camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPickPlane, hit)) return null;
    return worldToTile(hit.x, hit.z);
  }

  function onCanvasClick(e) {
    const t = pickTile(e);
    if (!t) return;
    if (!Game.ok(t.r, t.c)) return;
    const tool = game.state.tool;

    if (tool === 'walk') {
      if (champion.walkTo(t.r, t.c, game)) {
        champion.setRing('executing');
        el.hint.textContent = 'Champion is walking there…';
      } else {
        toast('Can’t walk there — water or mountains!', 'err');
      }
      return;
    }
    if (tool === 'remove') {
      const idAt = findIdAt(t.r, t.c);
      if (game.remove(t.r, t.c)) {
        renderer.removeBuildingMesh(idAt, t.r, t.c);
        toast('Building removed.', 'ok');
        refreshHUD();
      }
      return;
    }
    // build tool
    const type = game.state.selected;
    if (!type) { toast('Pick a building from the palette first.', 'err'); return; }
    const res = game.place(type, t.r, t.c);
    if (res.ok) {
      renderer.addBuildingMesh(res.id, type, t.r, t.c);
      renderer.showSelection(t.r, t.c);
      // Reclaimed-island narrative: the city reacts to every placement choice.
      const comment = placementComment(game, type, t.r, t.c);
      if (comment) toast(comment, 'ok', 5200);
      else toast(`${BLD[type].icon} ${BLD[type].l} placed!`, 'ok');
      refreshHUD();
      checkRequirements();
    } else {
      const reason = res.reason === 'tokens' ? 'Not enough tokens! 🪙' : 'Can’t build there — water, mountains or occupied!';
      toast(reason, 'err');
    }
  }

  function findIdAt(r, c) {
    return game.state.grid[r][c];
  }

  renderer.renderer.domElement.addEventListener('pointerdown', onCanvasClick);

  // ---- HUD refresh ----
  function refreshHUD() {
    el.tokens.textContent = (game.state.tokens.budget - game.state.tokens.spent).toLocaleString();
    updateChecklist();
  }
  function updateChecklist() {
    const r = game.state.req;
    el.checkList.innerHTML = '';
    const items = [
      { label: 'At least 1 building per system', done: SYSTEMS.every(s => r.systems[s] >= 1) },
      { label: 'At least 3 roads', done: r.roads >= 3 },
      { label: 'Spend 25+ tokens', done: r.spent >= 25 },
    ];
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'check-item' + (it.done ? ' done' : '');
      row.innerHTML = `<div class="dot"></div><div>${it.label}</div>`;
      el.checkList.appendChild(row);
    }
    if (game.requirementsMet()) {
      el.btnSim.disabled = false;
      el.hint.textContent = '✅ Requirements met! Press ▶ Simulate to bring your city to life!';
    } else {
      el.btnSim.disabled = true;
    }
  }
  function checkRequirements() { updateChecklist(); }

  el.checkBtn.addEventListener('click', () => el.checkPanel.classList.toggle('hidden'));
  el.checkClose.addEventListener('click', () => el.checkPanel.classList.add('hidden'));

  // ---- Phase flow ----
  function startSimulation() {
    if (!game.requirementsMet()) { toast('Finish the checklist first!', 'err'); return; }
    game.state.phase = 'simulate';
    el.phase.textContent = 'Simulate';
    el.dashboard.classList.remove('hidden');
    el.btnSim.textContent = '⏸ Stop';
    sim.bind(game);
    sim.start(game);
    toast('🎉 Your city is alive!', 'ok');
    el.hint.textContent = 'Watch your city work. Respond to crises when they come!';
  }
  function stopSimulation() {
    sim.stop();
    game.state.phase = 'design';
    el.phase.textContent = 'Design';
    el.dashboard.classList.add('hidden');
    el.btnSim.textContent = '▶ Simulate';
    el.hint.textContent = 'Design mode — keep building!';
    // Reclaimed-island report: the city has been tested — show the design score.
    showDesignReport();
  }
  // Single toggle handler — no competing one-shot listeners.
  el.btnSim.addEventListener('click', () => {
    if (game.state.phase === 'simulate') stopSimulation();
    else startSimulation();
  });

  // ---- Camera toggle ----
  function toggleCam() {
    const active = el.btnCam.classList.toggle('active');
    // follow champion / overview
    if (active) {
      el.hint.textContent = 'Following your champion. Drag to orbit.';
      camFollow = true;
    } else {
      camFollow = false;
      renderer.orbit.target.set(0, 0, 0);
      el.hint.textContent = 'Overview camera. Drag to orbit, scroll to zoom.';
    }
  }
  el.btnCam.addEventListener('click', toggleCam);
  let camFollow = false;

  // ---- Crisis panel ----
  function showCrisis(crisis) {
    if (!crisis) return;
    el.crisisTitle.textContent = crisis.def.title;
    el.crisisText.textContent = crisis.def.text;
    el.crisisOptions.innerHTML = '';
    crisis.def.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'crisis-opt';
      b.textContent = opt.label;
      b.addEventListener('click', () => {
        el.crisisPanel.classList.add('hidden');
        sim.resolveCrisis(opt);
        toast(opt.good ? '✅ Good choice!' : '😬 That made it worse…', opt.good ? 'ok' : 'err');
        refreshDashboard();
      });
      el.crisisOptions.appendChild(b);
    });
    el.crisisPanel.classList.remove('hidden');
  }

  // ---- Reclaimed island report + City Design Code ----
  function showDesignReport() {
    const { score, notes } = computeDesignScore(game);
    const panel = document.getElementById('report-panel');
    const val = document.getElementById('report-score-val');
    const notesEl = document.getElementById('report-notes');
    val.textContent = score;
    notesEl.innerHTML = '';
    notes.forEach(n => {
      const d = document.createElement('div');
      d.textContent = n;
      notesEl.appendChild(d);
    });
    panel.classList.remove('hidden');
  }
  document.getElementById('report-close').addEventListener('click', () => {
    document.getElementById('report-panel').classList.add('hidden');
  });
  document.getElementById('report-advice').addEventListener('click', () => {
    document.getElementById('report-panel').classList.add('hidden');
    showAdviceFlow();
  });

  // Fisher-Yates so the correct advice option changes position every time.
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // The main city asks the player 5 general questions. Answers become rules.
  function showAdviceFlow() {
    const panel = document.getElementById('advice-panel');
    const qEl = document.getElementById('advice-question');
    const optsEl = document.getElementById('advice-options');
    const fbEl = document.getElementById('advice-feedback');
    const nextEl = document.getElementById('advice-next');
    const titleEl = document.getElementById('advice-title');
    let idx = 0;
    const total = DESIGN_CODE_QUESTIONS.length;
    const chosen = [];

    function showQuestion() {
      optsEl.innerHTML = '';
      fbEl.classList.add('hidden');
      nextEl.classList.add('hidden');
      if (idx >= total) {
        titleEl.textContent = '📜 City Design Code Saved!';
        qEl.textContent = `The main city will follow your ${total} rules when it builds the next reclaimed island. Well done, city planner!`;
        nextEl.textContent = '✅ Done';
        nextEl.classList.remove('hidden');
        nextEl.onclick = () => { panel.classList.add('hidden'); };
        return;
      }
      const q = DESIGN_CODE_QUESTIONS[idx];
      titleEl.textContent = `Rule ${idx + 1} of ${total}`;
      qEl.textContent = q.question;
      const btns = [];
      shuffle(q.options).forEach((opt, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'advice-opt';
        b.textContent = `${i + 1}. ${opt.label}`;
        b.addEventListener('click', () => {
          if (b.disabled) return;
          btns.forEach(x => { x.disabled = true; });
          b.classList.add(opt.correct ? 'correct' : 'wrong');
          fbEl.textContent = opt.explanation;
          fbEl.classList.remove('hidden');
          nextEl.classList.remove('hidden');
          nextEl.focus();
        });
        btns.push(b);
        optsEl.appendChild(b);
      });
      nextEl.textContent = idx === total - 1 ? 'Finish' : 'Next →';
      nextEl.onclick = () => { idx++; showQuestion(); };
    }
    panel.classList.remove('hidden');
    showQuestion();
  }

  // ---- Dashboard ----
  function refreshDashboard() {
    const sys = game.state.sim.systems;
    if (!sys || !el.dashboard.classList.contains('hidden')) {
      el.dashSystems.innerHTML = '';
      for (const s of SYSTEMS) {
        const v = sys[s] || 0;
        const row = document.createElement('div');
        row.className = 'sys-row';
        const color = '#' + SYS_COLOR[s].toString(16).padStart(6, '0');
        row.innerHTML = `
          <div class="sys-label" style="color:${color}">${sysLabel(s)}</div>
          <div class="sys-bar"><div class="sys-fill" style="width:${v}%;background:${color}"></div></div>
          <div class="sys-pct">${v}</div>`;
        el.dashSystems.appendChild(row);
      }
    }
    const sim = game.state.sim;
    el.dashWeather.textContent = '🌤 ' + (sim.weather || 'clear');
    el.dashClock.textContent = `⏱ Day ${sim.day} · ${String(Math.floor(sim.hour)).padStart(2, '0')}:${String(Math.floor((sim.hour % 1) * 60)).padStart(2, '0')}`;
    el.dashEvents.innerHTML = '';
    (sim.eventLog || []).slice(0, 5).forEach(ev => {
      const d = document.createElement('div');
      d.className = 'ev';
      d.textContent = ev;
      el.dashEvents.appendChild(d);
    });
  }

  // ---- Main loop ----
  let last = performance.now();
  function loop(now) {
    // Don't accumulate delta while the tab is hidden — the browser may have
    // throttled RAF, and returning should not teleport the champion or
    // jump the simulation clock.
    if (document.hidden) { last = now; requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    champion.update(dt);
    if (game.state.phase === 'simulate') {
      sim.update(dt, game);
      refreshDashboard();
      // auto-show crisis panel
      if (sim.crisis && !sim.crisis.shown) {
        sim.crisis.shown = true;
        showCrisis(sim.crisis);
      }
    }
    renderer.updateWeather(dt);
    if (camFollow && !champion.isWalking()) {
      // ease camera to follow champion
      const p = champion.group.position;
      renderer.orbit.target.lerp(p, Math.min(1, dt * 3));
      const off = new THREE.Vector3(4, 4, 6).add(p);
      renderer.camera.position.lerp(off, Math.min(1, dt * 3));
      renderer.orbit.update();
    }
    renderer.orbit.update();
    renderer.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---- Toast ----
  function toast(msg, type, duration) {
    const stack = document.getElementById('toast-stack');
    const e = document.createElement('div');
    e.className = 'toast' + (type ? ' ' + type : '');
    e.textContent = msg;
    stack.appendChild(e);
    setTimeout(() => e.remove(), duration || 2600);
  }

  // ---- Init ----
  buildPalette();
  refreshHUD();
  setTool('build');
  // Load saved game if present
  if (game.load()) {
    // rebuild meshes from saved state
    for (const b of game.state.buildings) {
      renderer.addBuildingMesh(b.id, b.type, b.row, b.col);
    }
    refreshHUD();
  }

  return { toast, refreshHUD, setTool };
}
