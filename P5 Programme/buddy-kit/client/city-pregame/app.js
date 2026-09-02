/**
 * city-pregame/app.js — City Planning Academy.
 *
 * A self-contained teaching game that introduces the four algorithms the 2D
 * city planner uses, then hands the student a "Planner's License" JSON file
 * whose key unlocks the planner. No server, no AI — pure client-side.
 *
 * Rooms:
 *   1. Weighted Score   (report card — weighted sum)
 *   2. Coverage Radius  (leash garden — 150m/400m distance rules)
 *   3. Shortest Path    (ant trail — shortest walk along a road network)
 *   4. Hill-Climbing    (foggy mountain — greedy local search)
 * Each room teaches the concept with a visual, then CHECKS understanding with
 * a multi-step challenge. All four must be completed before the download
 * unlocks.
 */

// ── The Planner's License ───────────────────────────────
// Shared with the 2D planner's lock gate (soft gate, not security).
const LICENSE_KEY = 'CITYSMART-P5-2026';
const LICENSE_FILENAME = 'planner-license.json';
const PROGRESS_KEY = 'p5_pregame_progress';
// Same-origin unlock flag the 2D planner checks (planner.js UNLOCK_STORAGE_KEY).
const UNLOCK_STORAGE_KEY = 'p5_planner_unlocked';

// ── Room content (story / maths / why) ──────────────────
const ROOMS = {
  1: {
    title: 'Report Card Room',
    emoji: '📋',
    story: 'Welcome to the Report Card Room! A city is like a school report: not every subject counts the same. Our planner uses a weighted report card.',
    math: [
      'Each part gets a sub-score from 0 to 100. Multiply it by its weight, then add everything together.',
      'The weights are fixed: <code>near roads 30%</code>, <code>services 25%</code>, <code>quiet 15%</code>, <code>spread 10%</code>, <code>mix 10%</code>, <code>utilities 10%</code>.',
    ],
    whyTitle: 'Why these weights?',
    why: [
      'Near roads (30%) is the biggest because roads are the city\u2019s skeleton — a school or shop nobody can reach is useless, however good it is.',
      'Services near homes (25%) comes next: a home is only a home if school, shop, hospital, fire and police are within reach.',
      'Quiet (15%) matters because living beside a noisy factory is unpleasant, but it doesn\u2019t stop a city from working.',
      'Spread, mix and utilities (10% each) make a city nicer to live in, but the city still works even if they aren\u2019t perfect.',
    ],
  },
  2: {
    title: 'Leash Garden',
    emoji: '🦮',
    story: 'Step into the Leash Garden. Imagine a dog tied to a post — it can only reach a circle around it. Homes work the same way: a school, shop or hospital is only useful if you can walk there easily. If something is too far, people just won\u2019t use it — so the planner only counts it within a convenient walking distance.',
    math: [
      'Services — school, shop, hospital, fire, police — count for a home if they are within <code>150m</code>. Utilities — water, power, bus — count within <code>400m</code>.',
      'On our map, <code>1 square = 50m</code>. So 150m = 3 squares, and 400m = 8 squares.',
    ],
    whyTitle: 'Why two distances?',
    why: [
      'You use a school or shop every day, so it must be really close — 150m.',
      'Water, power and buses you need less often (or they reach you through pipes and wires), so 400m is fine.',
    ],
  },
  3: {
    title: 'Ant Trail Room',
    emoji: '🐜',
    story: 'In the Ant Trail Room, remember: ants cannot fly. They follow paths. Our planner walks along roads, not through buildings.',
    math: [
      'Roads form a network. Add only the road pieces you use. If a route uses 120m + 100m + 180m, the walk is 400m.',
      'A straight line is not enough if there is no road. The walk budget is <code>400m</code>; the shortest legal route wins.',
    ],
    whyTitle: null,
    why: null,
  },
  4: {
    title: 'Foggy Mountain Room',
    emoji: '⛰️',
    story: 'Last is the Foggy Mountain. You cannot see the top, only the next step. Climb carefully!',
    math: [
      'The algorithm tries one small change. If the city score goes <strong>up</strong>, it keeps the change. If the score goes down or stays the same, it undoes the change. Repeat.',
      'Example: 63 → 65, keep; 65 → 61, undo. It is greedy and only looks one step ahead, so it can get stuck on a local optimum — a small hill.',
    ],
    whyTitle: null,
    why: null,
  },
};

const ROOM_ORDER = [1, 2, 3, 4];

// ── State ───────────────────────────────────────────────
const state = {
  completed: {},
  currentRoom: null,
  hintLevel: {},
};

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.completed)); } catch { /* ignore */ }
}

// ── DOM helpers ─────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const screenIntro = document.getElementById('screen-intro');
const screenRooms = document.getElementById('screen-rooms');
const screenFinale = document.getElementById('screen-finale');
const roomWrap = document.getElementById('room-wrap');
const downloadBtn = document.getElementById('btn-download');
const downloadHint = document.getElementById('download-hint');
const unlockBtn = document.getElementById('btn-unlock');

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function updateNav() {
  $$('.nav-dot').forEach((dot) => {
    const room = Number(dot.dataset.room);
    dot.classList.toggle('done', !!state.completed[room]);
    dot.classList.toggle('current', state.currentRoom === room);
  });
}

function showScreen(which) {
  screenIntro.classList.toggle('active', which === 'intro');
  screenRooms.classList.toggle('active', which === 'rooms');
  screenFinale.classList.toggle('active', which === 'finale');
  if (which === 'rooms') renderRoom(state.currentRoom || ROOM_ORDER[0]);
}

function feedback(container, msg, good) {
  let f = Array.from(container.children).find((c) => c.classList && c.classList.contains('feedback'));
  if (!f) {
    f = document.createElement('div');
    f.className = 'feedback';
    f.setAttribute('aria-live', 'polite');
    container.appendChild(f);
  }
  f.className = 'feedback ' + (good ? 'ok' : 'err');
  f.innerHTML = `<span class="icon" aria-hidden="true">${good ? '✓' : '✗'}</span> ${msg}`;
}

function parseTotal(raw) {
  if (typeof raw !== 'string') return NaN;
  const v = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

function hintButton(room, container) {
  const wrap = document.createElement('div');
  wrap.className = 'hint-row';
  const btn = document.createElement('button');
  btn.className = 'btn-hint';
  btn.textContent = '💡 Hint';
  btn.addEventListener('click', () => {
    state.hintLevel[room] = Math.min(2, (state.hintLevel[room] || 0) + 1);
    const level = state.hintLevel[room];
    const t = ROOMS[room].hints && ROOMS[room].hints[level];
    let f = Array.from(container.children).find((c) => c.classList && c.classList.contains('feedback'));
    if (!f) { f = document.createElement('div'); f.className = 'feedback'; container.appendChild(f); }
    if (t) {
      f.className = 'feedback';
      f.innerHTML = `<span class="icon" aria-hidden="true">💡</span> ${t}`;
    }
    if (!ROOMS[room].hints[level + 1]) btn.disabled = true;
  });
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

function completeRoom(room) {
  state.completed[room] = true;
  state.currentRoom = null;
  saveProgress();
  updateNav();
  toast(`✅ ${ROOMS[room].title} complete!`);
  const nav = document.getElementById('room-next-nav');
  if (nav) {
    nav.innerHTML = '';
    const next = document.createElement('button');
    next.className = 'btn-primary';
    next.textContent = room === 4 ? '🎓 Graduate' : '➡️ Next room';
    next.addEventListener('click', () => {
      if (room === 4) graduate();
      else { state.currentRoom = room + 1; showScreen('rooms'); window.scrollTo({ top: 0 }); }
    });
    nav.appendChild(next);
  }
}

// ── Room renderer ───────────────────────────────────────
function renderRoom(room) {
  state.currentRoom = room;
  updateNav();
  const r = ROOMS[room];
  const el = document.createElement('div');
  el.className = 'room';
  el.innerHTML = `
    <div class="room-header">
      <span class="room-tag">Training Room ${room} of 4</span>
      <h2>${r.emoji} ${r.title}</h2>
      <p class="room-intro">${r.story}</p>
    </div>
    <div class="room-body">
      ${r.math.map((m) => `<div class="math-block">${m}</div>`).join('')}
      ${r.why ? `<div class="why-box"><strong>${r.whyTitle || 'Why?'}</strong><ul>${r.why.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
      <div id="challenge-${room}" class="challenge-box"></div>
      <div id="room-next-nav" class="room-nav-slot"></div>
    </div>
  `;
  roomWrap.innerHTML = '';
  roomWrap.appendChild(el);
  const target = document.getElementById(`challenge-${room}`);
  CHALLENGES[room](target, room);
  hintButton(room, target);
  window.scrollTo({ top: 0 });
}

// ════════════════════════════════════════════════════════════
// ROOM 1 — Weighted Score
// ════════════════════════════════════════════════════════════
function challenge1(container) {
  const rows = [
    { label: 'Near roads', score: 90, w: '30%', ans: 27 },
    { label: 'Services', score: 70, w: '25%', ans: 17.5 },
    { label: 'Quiet', score: 80, w: '15%', ans: 12 },
    { label: 'Spread', score: 60, w: '10%', ans: 6 },
    { label: 'Mix', score: 70, w: '10%', ans: 7 },
    { label: 'Utilities', score: 90, w: '10%', ans: 9 },
  ];
  const TOTAL = 78.5;
  const MAX_PRODUCT = 27;
  // Shuffle the tile tray so the answers are NOT aligned with the boxes in
  // order — the student has to actually compute each product, not match order.
  const tiles = ['27', '17.5', '12', '6', '7', '9', '13.5', '18', '10'];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const fills = Array(rows.length).fill(null);

  container.innerHTML = `
    <p><strong>Challenge:</strong> Complete the city report card. Tap a number tile, then tap the box for the part it belongs to. Then type the total.</p>
    <div class="report-card" id="rc-rows"></div>
    <div class="tile-tray" id="rc-tiles" aria-label="Number tiles"></div>
    <div class="stacked-total" id="rc-stacked" aria-hidden="true"></div>
    <div class="total-caption" id="rc-caption">Total so far: 0</div>
    <div class="section-label">Total score (add them all up)</div>
    <div class="input-row">
      <label class="sr-only" for="rc-total">Total score</label>
      <input type="text" inputmode="decimal" id="rc-total" placeholder="Type the total, e.g. 78.5">
      <button class="btn-primary" id="rc-check">✅ Check</button>
    </div>
  `;

  const rowsEl = document.getElementById('rc-rows');
  const barColors = ['#00f2fe', '#00e0a0', '#00c060', '#40a040', '#80b040', '#ffb84c'];

  // Build the report-card rows with empty product boxes + bars.
  rows.forEach((row, i) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'rc-row';
    rowEl.innerHTML = `
      <span class="rc-label">${row.label}</span>
      <span class="rc-score">${row.score}</span>
      <span class="rc-weight">× ${row.w}</span>
      <span class="rc-box" data-i="${i}" role="button" tabindex="0" aria-label="${row.label} product box">?</span>
      <div class="rc-bar" data-bar="${i}" style="--bar-c:${barColors[i % barColors.length]}"></div>
    `;
    rowsEl.appendChild(rowEl);
  });

  // Tiles.
  const tilesEl = document.getElementById('rc-tiles');
  let selectedTile = null;
  tiles.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.textContent = t;
    b.dataset.val = t;
    b.addEventListener('click', () => {
      if (b.classList.contains('used')) return;
      tilesEl.querySelectorAll('.tile').forEach((x) => x.classList.remove('selected'));
      b.classList.add('selected');
      selectedTile = b;
    });
    tilesEl.appendChild(b);
  });

  // Tap a box with a tile selected to place (or replace) it; tap a filled box
  // with no tile selected to take the tile back.
  const boxes = () => $$('.rc-box', rowsEl);
  boxes().forEach((box) => {
    const fillBox = () => {
      const i = Number(box.dataset.i);
      const bar = document.querySelector(`.rc-bar[data-bar="${i}"]`);
      if (selectedTile) {
        // Replace any old tile in this box first.
        if (fills[i] !== null) {
          const oldVal = String(fills[i]);
          const oldTile = [...tilesEl.querySelectorAll('.tile.used')].find((t) => t.dataset.val === oldVal);
          if (oldTile) oldTile.classList.remove('used');
        }
        fills[i] = parseFloat(selectedTile.dataset.val);
        box.textContent = selectedTile.dataset.val;
        box.classList.add('filled');
        selectedTile.classList.add('used');
        selectedTile.classList.remove('selected');
        selectedTile = null;
        bar.style.width = Math.min(100, (fills[i] / MAX_PRODUCT) * 100) + '%';
        updateStacked();
        return;
      }
      if (fills[i] !== null) {
        // No tile selected: take the tile back.
        const val = String(fills[i]);
        const tile = [...tilesEl.querySelectorAll('.tile.used')].find((t) => t.dataset.val === val);
        if (tile) tile.classList.remove('used');
        fills[i] = null;
        box.textContent = '?';
        box.classList.remove('filled');
        bar.style.width = '4px';
        updateStacked();
        return;
      }
      feedback(container, 'Tap a number tile first!', false);
    };
    box.addEventListener('click', fillBox);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fillBox(); } });
  });

  // Stacked total bar (segments proportional to the TOTAL = full bar at 78.5).
  function updateStacked() {
    const stacked = document.getElementById('rc-stacked');
    stacked.innerHTML = rows.map((row, i) => {
      if (fills[i] === null) return '';
      return `<div class="st-seg" style="flex-grow:${fills[i]};--seg-c:${barColors[i % barColors.length]}">${fills[i]}</div>`;
    }).join('');
    const sum = fills.reduce((a, b) => a + (b || 0), 0);
    document.getElementById('rc-caption').textContent = `Total so far: ${(Math.round(sum * 10) / 10)}`;
  }

  document.getElementById('rc-check').addEventListener('click', () => {
    if (!fills.every((f) => f !== null)) { feedback(container, 'Fill every box with a number tile first.', false); return; }
    const rowOk = rows.every((r, i) => Math.abs(fills[i] - r.ans) < 0.01);
    const totalInput = document.getElementById('rc-total').value.trim();
    const totalOk = Math.abs(parseTotal(totalInput) - TOTAL) < 0.01;
    if (!rowOk) { feedback(container, 'Some multiplications are wrong. Hint: find 10% first, then multiply.', false); return; }
    if (!totalOk) { feedback(container, 'The sub-scores are right — now add them all together for the total!', false); return; }
    feedback(container, '🎉 Perfect! 27 + 17.5 + 12 + 6 + 7 + 9 = 78.5.', true);
    completeRoom(1);
  });
}

// ════════════════════════════════════════════════════════════
// ROOM 2 — Coverage Radius
// ════════════════════════════════════════════════════════════
// Map scale: 1 square = 50m, drawn at 40px per square → 0.8px per metre.
const PX_PER_M = 0.8;

function buildCoverageTask(container, task) {
  const { limit, spots, best, emoji, title } = task;
  const limPx = Math.round(limit * PX_PER_M);
  const maxExtent = Math.max(...spots.map((s) => Math.max(s.d1, s.d2) * PX_PER_M));
  const cx = Math.ceil(maxExtent + 34);
  const width = Math.ceil(cx + maxExtent + 20);
  const y0 = 58, rowH = 78;
  const height = y0 + spots.length * rowH + 14;

  const svgRows = spots.map((s, i) => {
    const y = y0 + i * rowH;
    const x1 = Math.round(cx - s.d1 * PX_PER_M);
    const x2 = Math.round(cx + s.d2 * PX_PER_M);
    const d1In = s.d1 <= limit;
    const d2In = s.d2 <= limit;
    return `
      <g class="spot-row" data-spot="${s.id}" tabindex="0" role="button"
         aria-label="${s.name}: home one ${s.d1}m, home two ${s.d2}m. Tap to see the ${limit}m reach.">
        <circle class="reach" cx="${cx}" cy="${y}" r="${limPx}" fill="#00ff9d"/>
        <line x1="${cx - limPx}" y1="${y}" x2="${cx + limPx}" y2="${y}" stroke="#00ff9d" stroke-dasharray="4 4" opacity="0.35"/>
        <circle cx="${cx}" cy="${y}" r="10" fill="#ffb84c" stroke="#0b132b" stroke-width="2"/>
        <text x="${cx}" y="${y - 18}" text-anchor="middle" fill="#ffb84c" font-size="13" font-weight="bold">${s.name}</text>
        <rect class="home ${d1In ? 'in' : 'out'}" x="${x1 - 8}" y="${y - 8}" width="16" height="16" rx="2"/>
        <text x="${x1}" y="${y + 26}" text-anchor="middle" fill="#8899cc" font-size="11">${s.d1}m</text>
        <rect class="home ${d2In ? 'in' : 'out'}" x="${x2 - 8}" y="${y - 8}" width="16" height="16" rx="2"/>
        <text x="${x2}" y="${y + 26}" text-anchor="middle" fill="#8899cc" font-size="11">${s.d2}m</text>
      </g>`;
  }).join('');

  const card = document.createElement('div');
  card.className = 'task-card';
  card.innerHTML = `
    <h3>${emoji} ${title} — ${limit}m leash (${limit / 50} squares)</h3>
    <p>Tap a spot to see its reach circle. Then mark each spot <strong>OK</strong> (both homes inside) or <strong>TOO FAR</strong>.</p>
    <div class="cover-map" aria-hidden="true">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title} coverage map">
        ${svgRows}
      </svg>
    </div>
    <div class="legend-line">1 square = 50 m · the dashed ring shows the ${limit}m reach</div>
    <table class="mark-table" role="group" aria-label="Mark each ${title} OK or TOO FAR">
      <tr><th>Spot</th><th>Home 1</th><th>Home 2</th><th>OK</th><th>Too far</th></tr>
      ${spots.map((s) => `
        <tr data-mark="${s.id}">
          <td>${s.name}</td><td>${s.d1}m</td><td>${s.d2}m</td>
          <td><button class="mark-btn ok" data-mark-val="ok">OK</button></td>
          <td><button class="mark-btn toofar" data-mark-val="toofar">TOO FAR</button></td>
        </tr>`).join('')}
    </table>
    <p>Now pick the best spot (both homes inside the ${limit}m leash).</p>
    <div class="best-row" role="radiogroup" aria-label="Best ${title}">
      ${spots.map((s) => `<button class="btn-best" data-best="${s.id}">${s.name}</button>`).join('')}
    </div>
  `;
  container.appendChild(card);

  // Tap a spot row → show its reach circle + colour the homes.
  $$('.spot-row', card).forEach((row) => {
    const show = () => {
      $$('.spot-row', card).forEach((x) => x.classList.remove('active'));
      row.classList.add('active');
    };
    row.addEventListener('click', show);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  });

  // OK / TOO FAR marking.
  $$('.mark-table tr[data-mark]', card).forEach((tr) => {
    $$('.mark-btn', tr).forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.mark-btn', tr).forEach((b) => b.classList.remove('on'));
        btn.classList.add('on');
      });
    });
  });

  // Best-spot pick.
  const bestPick = { val: null };
  $$('.btn-best', card).forEach((btn) => {
    btn.setAttribute('role', 'radio');
    btn.addEventListener('click', () => {
      bestPick.val = btn.dataset.best;
      $$('.btn-best', card).forEach((b) => {
        const on = b === btn;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-checked', String(on));
      });
    });
  });

  return { spots, limit, best, bestPick, card };
}

function challenge2(container) {
  const shop = buildCoverageTask(container, {
    emoji: '🛍️', title: 'Shop — service',
    limit: 150, best: 'B',
    spots: [
      { id: 'A', name: 'Spot A', d1: 100, d2: 200 },
      { id: 'B', name: 'Spot B', d1: 150, d2: 150 },
      { id: 'C', name: 'Spot C', d1: 50, d2: 250 },
    ],
  });
  const bus = buildCoverageTask(container, {
    emoji: '🚌', title: 'Bus stop — utility',
    limit: 400, best: 'Y',
    spots: [
      { id: 'X', name: 'Stop X', d1: 300, d2: 500 },
      { id: 'Y', name: 'Stop Y', d1: 350, d2: 400 },
      { id: 'Z', name: 'Stop Z', d1: 100, d2: 450 },
    ],
  });

  const check = document.createElement('div');
  check.className = 'input-row';
  check.innerHTML = '<button class="btn-primary" id="rc2-check">✅ Check</button>';
  container.appendChild(check);

  const markOk = (task) => task.spots.every((s) => {
    const tr = task.card.querySelector(`tr[data-mark="${s.id}"]`);
    const on = tr.querySelector('.mark-btn.on');
    const correct = s.d1 <= task.limit && s.d2 <= task.limit ? 'ok' : 'toofar';
    return on && on.dataset.markVal === correct;
  });

  document.getElementById('rc2-check').addEventListener('click', () => {
    if (!markOk(shop)) { feedback(container, 'Some shop OK / TOO FAR marks are wrong. A shop counts only if BOTH homes are within 150m.', false); return; }
    if (!markOk(bus)) { feedback(container, 'Some bus OK / TOO FAR marks are wrong. A bus stop counts only if BOTH homes are within 400m.', false); return; }
    if (shop.bestPick.val !== 'B') { feedback(container, 'The shop marks are right, but the best shop spot is wrong. Pick the spot where BOTH homes are within 150m.', false); return; }
    if (bus.bestPick.val !== 'Y') { feedback(container, 'The bus marks are right, but the best bus spot is wrong. Pick the stop where BOTH homes are within 400m.', false); return; }
    feedback(container, '🎉 Shop = Spot B, Bus stop = Stop Y. Both homes are within range!', true);
    completeRoom(2);
  });
}

// ════════════════════════════════════════════════════════════
// ROOM 3 — Shortest Path
// ════════════════════════════════════════════════════════════
function challenge3(container) {
  const routes = [
    { id: 'A', total: 350, segs: [150, 100, 100], pts: [[90, 62], [240, 62], [240, 152], [392, 152]] },
    { id: 'B', total: 450, segs: [200, 250], pts: [[90, 62], [90, 232], [392, 232]] },
    { id: 'C', total: 420, segs: [120, 180, 120], pts: [[90, 62], [210, 62], [210, 112], [392, 112]] },
  ];
  const BUDGET = 400;
  let pick = null, within = null;

  const svgRoutes = routes.map((r) => {
    const d = r.pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    const labels = r.segs.map((seg, i) => {
      const a = r.pts[i], b = r.pts[i + 1];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const horiz = a[1] === b[1];
      return `<text x="${mx}" y="${horiz ? my - 8 : my + 4}" text-anchor="middle" fill="#ffb84c" font-size="12" font-weight="bold">${seg}m</text>`;
    }).join('');
    return `
      <g class="route-path" data-route="${r.id}" tabindex="0" role="button" aria-label="Route ${r.id}: ${r.segs.join(' + ')} metres">
        <path class="road-base" d="${d}" fill="none" stroke="#445588" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="road-walk" d="${d}" fill="none" stroke="#00ff9d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${labels}
      </g>`;
  }).join('');

  container.innerHTML = `
    <p><strong>Challenge:</strong> Help the ant reach the bus stop. Tap a route to see the ant walk it. Add the road pieces, type the route total, and tell us if it fits the 400m budget.</p>
    <div class="road-map" aria-hidden="true">
      <svg viewBox="0 0 480 270" role="img" aria-label="Road network with three routes from HOME to BUS STOP">
        <rect x="20" y="42" width="58" height="40" fill="#1a2448" stroke="#334478" stroke-width="2" rx="4"/>
        <text x="49" y="67" text-anchor="middle" fill="#8899cc" font-size="11">HOME</text>
        <rect x="402" y="132" width="62" height="42" fill="#1a2448" stroke="#334478" stroke-width="2" rx="4"/>
        <text x="433" y="159" text-anchor="middle" fill="#8899cc" font-size="10">BUS</text>
        ${svgRoutes}
        <g class="ant" id="ant" transform="translate(90, 62)" opacity="0">
          <circle r="11" fill="#0b132b" stroke="#00ff9d" stroke-width="2"/>
          <text y="4" text-anchor="middle" font-size="13">🐜</text>
        </g>
      </svg>
    </div>
    <div class="budget-meter">
      <div class="bm-label">Walk budget</div>
      <div class="bm-bar"><div class="bm-fill" id="bm-fill"></div></div>
      <div class="bm-value" id="bm-value">0 m / 400 m</div>
    </div>
    <div class="route-buttons" role="radiogroup" aria-label="Choose a route">
      ${routes.map((r) => `<button class="btn-route" data-route="${r.id}">Route ${r.id}</button>`).join('')}
    </div>
    <div class="section-label">Chosen route total</div>
    <div class="input-row">
      <label class="sr-only" for="route-total">Route total</label>
      <input type="text" inputmode="decimal" id="route-total" placeholder="Type the total, e.g. 350 or 350m">
    </div>
    <div class="section-label">Is it within 400m?</div>
    <div class="route-buttons" role="radiogroup" aria-label="Within budget">
      <button class="btn-route" data-within="yes">Yes</button>
      <button class="btn-route" data-within="no">No</button>
    </div>
    <div class="input-row"><button class="btn-primary" id="rc3-check">✅ Check</button></div>
  `;

  // Route selection + ant animation + running total + budget meter.
  const fill = document.getElementById('bm-fill');
  const value = document.getElementById('bm-value');
  const ant = document.getElementById('ant');
  let animCancel = false;

  function animateRoute(route, total) {
    $$('.route-path').forEach((g) => g.classList.remove('selected'));
    const g = document.querySelector(`.route-path[data-route="${route}"]`);
    g.classList.add('selected');
    const walk = g.querySelector('.road-walk');
    const len = walk.getTotalLength();
    walk.style.strokeDasharray = '0';
    walk.style.strokeDashoffset = '0';
    walk.style.transition = 'none';
    ant.setAttribute('opacity', '1');

    const steps = 90;
    let i = 0;
    const animate = () => {
      if (animCancel) return;
      if (i > steps) { ant.setAttribute('opacity', '0'); return; }
      const pt = walk.getPointAtLength((len * i) / steps);
      ant.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);
      // Running total: count up with the ant.
      const frac = i / steps;
      const shown = Math.round(total * frac * 10) / 10;
      value.textContent = `${shown} m / 400 m`;
      fill.style.width = Math.min(100, (shown / BUDGET) * 100) + '%';
      fill.classList.toggle('over', shown > BUDGET);
      i++;
      requestAnimationFrame(animate);
    };
    animate();
    // Final total.
    setTimeout(() => {
      value.textContent = `${total} m / 400 m`;
      fill.style.width = Math.min(100, (total / BUDGET) * 100) + '%';
      fill.classList.toggle('over', total > BUDGET);
    }, steps * 16 + 60);
  }

  $$('.route-path').forEach((g) => {
    g.addEventListener('click', () => {
      const btn = document.querySelector(`.btn-route[data-route="${g.dataset.route}"]`);
      if (btn) btn.click();
    });
  });

  $$('.btn-route[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pick = btn.dataset.route;
      $$('.btn-route[data-route]').forEach((b) => b.classList.toggle('selected', b === btn));
      const r = routes.find((x) => x.id === pick);
      animateRoute(r.id, r.total);
    });
  });

  $$('.btn-route[data-within]').forEach((btn) => {
    btn.addEventListener('click', () => {
      within = btn.dataset.within;
      $$('.btn-route[data-within]').forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });

  document.getElementById('rc3-check').addEventListener('click', () => {
    const total = parseTotal(document.getElementById('route-total').value);
    if (pick !== 'A') { feedback(container, 'Check each route: which is shortest AND within 400m?', false); return; }
    if (!Number.isFinite(total) || Math.abs(total - 350) > 0.01) { feedback(container, 'Add the three pieces: 150 + 100 + 100 = 350. You can type 350 or 350m.', false); return; }
    if (within !== 'yes') { feedback(container, 'Is 350m within the 400m budget?', false); return; }
    feedback(container, '🎉 Route A = 350m, within 400m. The shortest legal route wins!', true);
    completeRoom(3);
  });
}

// ════════════════════════════════════════════════════════════
// ROOM 4 — Hill-Climbing
// ════════════════════════════════════════════════════════════
function challenge4(container) {
  const rounds = [
    { current: 58, opts: [
      { id: 'A', label: 'A: add tree → 60', to: 60 },
      { id: 'B', label: 'B: move school → 57', to: 57 },
      { id: 'C', label: 'C: add road → 59', to: 59 },
    ], keep: 'A', next: 60 },
    { current: 60, opts: [
      { id: 'D', label: 'D: add shop → 62', to: 62 },
      { id: 'E', label: 'E: remove lamp → 59', to: 59 },
      { id: 'F', label: 'F: move bin → 60', to: 60 },
    ], keep: 'D', next: 62 },
  ];
  const picks = { 1: null, 2: null };
  const steps = [
    { x: 95, y: 208, v: 58 },
    { x: 185, y: 168, v: 60 },
    { x: 270, y: 142, v: 62 },
  ];

  container.innerHTML = `
    <p><strong>Challenge:</strong> You are the optimiser. The planner tested a few small changes — tap the one it KEEPS: the change whose score went UP the most. If the score goes down or stays the same, it undoes it.</p>
    <div class="mountain" aria-hidden="true">
      <svg viewBox="0 0 500 250" role="img" aria-label="Foggy mountain with a local hill and a distant higher peak">
        <defs>
          <linearGradient id="m-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1a2448"/><stop offset="1" stop-color="#0b132b"/>
          </linearGradient>
          <linearGradient id="m-hill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#334478"/><stop offset="1" stop-color="#131f44"/>
          </linearGradient>
        </defs>
        <rect width="500" height="250" fill="url(#m-sky)"/>
        <path d="M370 250 L395 185 L420 120 L440 62 L460 40 L480 62 L500 130 L500 250 Z" fill="#334478" opacity="0.45"/>
        <text x="442" y="30" text-anchor="middle" fill="#ffb84c" font-size="14" font-weight="bold">80 ★</text>
        <path d="M0 250 L60 224 L120 200 L180 176 L240 156 L300 150 L360 160 L420 250 Z" fill="url(#m-hill)"/>
        ${steps.map((s, i) => `
          <g>
            <circle class="climb-step" data-step="${i}" cx="${s.x}" cy="${s.y}" r="15" fill="#0b132b" stroke="#00f2fe" stroke-width="2"/>
            <text x="${s.x}" y="${s.y + 4}" text-anchor="middle" fill="#00f2fe" font-size="11" font-weight="bold">${s.v}</text>
          </g>`).join('')}
        <g id="hiker" transform="translate(95, 208)">
          <circle r="12" fill="#ffb84c"/>
          <text y="4" text-anchor="middle" fill="#0b132b" font-size="12" font-weight="bold">🧗</text>
        </g>
      </svg>
    </div>
    <div class="score-display" aria-live="polite">
      <div class="sd-label">Current score</div>
      <div class="sd-value" id="hc-score">58</div>
    </div>
    <div id="hc-rounds"></div>
    <div class="hc-stuck" id="hc-stuck" hidden>
      <h3>The foggy peak</h3>
      <p>The hiker is at <strong>62</strong> on a small hill. Every nearby change gives 61, 61 or 60 — all lower. A distant plan would score <strong>80</strong>, but reaching it needs a drop to <strong>55</strong> first.</p>
      <p><strong>Will the algorithm move to the distant 80 plan?</strong></p>
      <div class="hc-options">
        <button class="btn-stuck" data-answer="yes">Yes — 80 is bigger</button>
        <button class="btn-stuck" data-answer="no">No — it only accepts upward steps</button>
      </div>
    </div>
    <div class="input-row"><button class="btn-primary" id="rc4-check">✅ Check</button></div>
  `;

  const scoreEl = document.getElementById('hc-score');
  const hiker = document.getElementById('hiker');
  const roundsWrap = document.getElementById('hc-rounds');

  function moveHiker(stepIndex) {
    const s = steps[stepIndex];
    hiker.style.transition = 'transform 0.8s ease';
    hiker.setAttribute('transform', `translate(${s.x}, ${s.y})`);
    if (scoreEl) scoreEl.textContent = s.v;
    const circle = document.querySelector(`.climb-step[data-step="${stepIndex}"]`);
    if (circle) circle.style.opacity = '1';
  }

  rounds.forEach((round, ri) => {
    const wrap = document.createElement('div');
    wrap.className = 'hc-round';
    wrap.innerHTML = `
      <h3>Round ${ri + 1} — score is ${round.current}. Which change does the planner keep?</h3>
      <div class="hc-options">
        ${round.opts.map((o) => `<button class="btn-hc" data-round="${ri + 1}" data-choice="${o.id}" data-to="${o.to}">${o.label}</button>`).join('')}
      </div>
      <div class="feedback" data-rf="${ri + 1}" aria-live="polite"></div>
    `;
    roundsWrap.appendChild(wrap);

    $$('.btn-hc', wrap).forEach((btn) => {
      btn.addEventListener('click', () => {
        if (picks[ri + 1]) return;
        const f = wrap.querySelector('.feedback');
        const choice = btn.dataset.choice;
        if (choice === round.keep) {
          picks[ri + 1] = choice;
          btn.classList.add('kept');
          $$('.btn-hc', wrap).forEach((b) => { if (b !== btn) b.classList.add('rejected'); });
          f.className = 'feedback ok';
          f.innerHTML = `<span class="icon" aria-hidden="true">✓</span> Keep it! ${round.next} > ${round.current} — the score went up, so the hiker climbs.`;
          moveHiker(ri + 1);
          if (ri + 1 < rounds.length) {
            setTimeout(() => { const nxt = roundsWrap.children[ri + 1]; if (nxt) nxt.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 900);
          } else {
            setTimeout(() => {
              const stuck = document.getElementById('hc-stuck');
              stuck.hidden = false;
              stuck.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 900);
          }
        } else {
          f.className = 'feedback err';
          const up = Number(btn.dataset.to) > round.current;
          f.innerHTML = `<span class="icon" aria-hidden="true">✗</span> ${up ? 'That score went up but not the most — the planner keeps the best improvement.' : 'That score went DOWN — the planner undoes it. Tap the one that goes up the most.'}`;
        }
      });
    });
  });

  let last = null;
  $$('.btn-stuck').forEach((btn) => {
    btn.addEventListener('click', () => {
      last = btn.dataset.answer;
      $$('.btn-stuck').forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });

  document.getElementById('rc4-check').addEventListener('click', () => {
    if (picks[1] !== 'A' || picks[2] !== 'D') { feedback(container, 'Keep the change whose score goes UP the most. Round 1: 58 → ? Round 2: 60 → ?', false); return; }
    if (last !== 'no') { feedback(container, 'Remember the rule: the algorithm never accepts a downhill step, so it cannot reach that distant plan.', false); return; }
    feedback(container, '🎉 You climbed: 58 → 60 → 62. And from 62, every step down is rejected — that is a local optimum.', true);
    completeRoom(4);
  });
}

// ── Challenge dispatch ──────────────────────────────────
const CHALLENGES = { 1: challenge1, 2: challenge2, 3: challenge3, 4: challenge4 };

// ── Hints (2 levels per room) ───────────────────────────
ROOMS[1].hints = {
  1: 'Find 10% first: 10% of 90 is 9, so 30% of 90 is 27. 25% of 70 is 70 ÷ 4 = 17.5.',
  2: '15% = 10% + 5%: 10% of 80 = 8, 5% of 80 = 4, so 15% of 80 = 12. Then add: 27 + 17.5 + 12 + 6 + 7 + 9 = 78.5.',
};
ROOMS[2].hints = {
  1: 'Use the dashed ring: a spot works only if BOTH homes are inside it. For the shop, 150m is 3 squares; for the bus, 400m is 8 squares.',
  2: 'Shop: Spot A has a 200m home (too far), Spot C has a 250m home (too far) — only Spot B fits. Bus: Stop X has a 500m home, Stop Z has a 450m home — only Stop Y fits.',
};
ROOMS[3].hints = {
  1: 'Only add road pieces the ant actually uses. Ignore the straight-line distance across the map.',
  2: 'Route A: 150 + 100 = 250, then + 100 = 350. Compare with 400. Routes B (450) and C (420) are over the budget.',
};
ROOMS[4].hints = {
  1: 'Ask: is the new score BIGGER than the old score? If yes, keep. If no, undo.',
  2: 'For the last question, remember the rule: no downhill step is accepted — so the planner is stuck at 62 and cannot reach 80.',
};

// ── Graduation / download ───────────────────────────────
function graduate() {
  state.currentRoom = null;
  showScreen('finale');
  updateNav();
  const allDone = ROOM_ORDER.every((r) => state.completed[r]);
  unlockBtn.disabled = !allDone;
  downloadBtn.disabled = !allDone;
  downloadHint.textContent = allDone
    ? 'Your planner is ready! Hit "Unlock the planner" to open it — or download the file as a backup.'
    : 'Finish all four rooms to unlock your file.';
}

/** Same-origin unlock: set the flag the 2D planner checks, then open it. */
function unlockPlanner() {
  try { localStorage.setItem(UNLOCK_STORAGE_KEY, '1'); }
  catch (e) {
    toast('⚠️ Could not save the unlock on this browser — use the download instead.');
    return;
  }
  toast('🔓 Unlocked! Opening the planner…');
  window.location.href = '/planner/';
}

function downloadLicense() {
  const file = {
    title: "City Planner's License",
    algorithms: ['weighted_score', 'coverage_radius', 'shortest_path', 'hill_climbing'],
    key: LICENSE_KEY,
  };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = LICENSE_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('💾 Downloaded planner-license.json! Now upload it in the 2D city planner.');
}

// ── Restart (custom modal, no confirm()) ────────────────
function openRestartModal() {
  const modal = document.getElementById('modal');
  modal.hidden = false;
  document.getElementById('modal-ok').focus();
}
function closeRestartModal() { document.getElementById('modal').hidden = true; }
function restart() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
  state.completed = {};
  state.currentRoom = null;
  state.hintLevel = {};
  updateNav();
  showScreen('intro');
  toast('Progress reset. Let\u2019s start fresh!');
}

// ── Init ────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  state.currentRoom = ROOM_ORDER[0];
  showScreen('rooms');
  window.scrollTo({ top: 0 });
});
downloadBtn.addEventListener('click', downloadLicense);
if (unlockBtn) unlockBtn.addEventListener('click', unlockPlanner);
document.getElementById('btn-restart').addEventListener('click', openRestartModal);
document.getElementById('modal-cancel').addEventListener('click', closeRestartModal);
document.getElementById('modal-ok').addEventListener('click', () => { closeRestartModal(); restart(); });
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeRestartModal(); });

// Nav dots: allow revisiting completed rooms or the next unlocked room.
$$('.nav-dot').forEach((dot) => {
  const go = () => {
    const room = Number(dot.dataset.room);
    const prevDone = room === 1 || state.completed[room - 1];
    if (state.completed[room] || prevDone) {
      state.currentRoom = room;
      showScreen('rooms');
      window.scrollTo({ top: 0 });
    }
  };
  dot.addEventListener('click', go);
  dot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});

// Restore completion from localStorage so a refresh keeps progress.
Object.assign(state.completed, loadProgress());
updateNav();
if (ROOM_ORDER.every((r) => state.completed[r])) graduate();
