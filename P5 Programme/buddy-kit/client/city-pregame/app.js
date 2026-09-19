/**
 * city-pregame/app.js — City Planning Academy.
 *
 * A self-contained teaching game that introduces the four algorithms the 2D
 * city planner uses as an optional Lesson 1 companion. No server, no AI —
 * pure client-side. Progress travels in the existing Champion File.
 *
 * Rooms:
 *   1. Weighted Score   (report card — weighted sum + a draggable weight lab)
 *   2. Coverage Radius  (leash garden — 150m/400m distance rules)
 *   3. Shortest Path    (ant trail — Dijkstra shown expanding, then shortest walk)
 *   4. Hill-Climbing    (foggy mountain — greedy local search + Explore restart)
 * Each room teaches the concept with a visual, then checks understanding with
 * a multi-step challenge. Completion is recognition, never a gate.
 *
 * Algorithm maths lives in lesson-core.js (pure + unit-tested); app.js only
 * renders it.
 */

import { WEIGHT_LAB, weightLabTotal, DIJKSTRA_LESSON, DIJKSTRA_BUS_DIST, dijkstraReveal, dijkstraWinner } from './lesson-core.js';
import { initI18n, currentLang, t, tf, applyStatic, mountLangToggle } from './i18n.js';
import { collectState, composeChampionFile, championFilename } from '../city-common/champion-file.js';
import { parseProgress, mergeProgress } from '../city-common/pregame-progress.js';

initI18n();

const PROGRESS_KEY = 'p5_pregame_progress';

// ── Room content (localized at render time) ─────────────
// The teaching copy lives in i18n.js keyed per room; buildRooms() assembles it
// for the active language and is rebuilt on `i18n:change`.
const ROOM_EMOJI = { 1: '📋', 2: '🦮', 3: '🐜', 4: '⛰️' };
const ROOM_WHY_COUNT = { 1: 4, 2: 2, 3: 0, 4: 0 };
const ROOM_ORDER = [1, 2, 3, 4];

function buildRooms() {
  const out = {};
  for (const n of ROOM_ORDER) {
    const whyCount = ROOM_WHY_COUNT[n];
    out[n] = {
      title: t(`room.${n}.title`),
      emoji: ROOM_EMOJI[n],
      story: t(`room.${n}.story`),
      math: [0, 1].map((i) => t(`room.${n}.math.${i}`)),
      whyTitle: whyCount ? t(`room.${n}.whyTitle`) : null,
      why: whyCount ? Array.from({ length: whyCount }, (_, i) => t(`room.${n}.why.${i}`)) : null,
      bridge: t(`room.${n}.bridge`),
      hints: { 1: t(`hint.${n}.1`), 2: t(`hint.${n}.2`) },
    };
  }
  return out;
}
let ROOMS = buildRooms();

// ── State ───────────────────────────────────────────────
const state = {
  completed: {},
  currentRoom: null,
  hintLevel: {},
};

function readStored() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch { return {}; }
}
function saveProgress() {
  // Merge with what's already stored instead of blind-overwriting: two
  // same-origin tabs finishing different rooms must not lose each other's
  // progress (a refresh/tab that completed Room 2 earlier still has Room 2
  // marked after this tab completes Room 4). mergeProgress also refreshes the
  // versioned checkpoint (resumable room + hint levels) under a reserved,
  // non-room key — legacy flat saves stay readable.
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(
      mergeProgress(readStored(), state.completed, {
        currentRoom: state.currentRoom,
        hintLevel: state.hintLevel,
      })
    ));
  } catch { /* ignore */ }
}

// ── DOM helpers ─────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const screenIntro = document.getElementById('screen-intro');
const screenRooms = document.getElementById('screen-rooms');
const screenFinale = document.getElementById('screen-finale');
const roomWrap = document.getElementById('room-wrap');
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
  // Accept both dot-decimal ("78.5") and comma-decimal ("78,5") input without
  // misreading thousands separators: a comma is only a decimal point when the
  // string has NO dot (so "1,000" stays one thousand, and "78,5" → 78.5).
  let s = raw.replace(/[^0-9.,]/g, '');
  const hasDot = s.indexOf('.') !== -1;
  const hasComma = s.indexOf(',') !== -1;
  if (hasComma && hasDot) s = s.replace(/,/g, '');        // "1,000.5" → 1000.5
  else if (hasComma) s = s.replace(',', '.');             // "78,5" → 78.5
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

function hintButton(room, container) {
  const wrap = document.createElement('div');
  wrap.className = 'hint-row';
  const btn = document.createElement('button');
  btn.className = 'btn-hint';
  btn.textContent = t('pg.room.hint');
  btn.addEventListener('click', () => {
    state.hintLevel[room] = Math.min(2, (state.hintLevel[room] || 0) + 1);
    const level = state.hintLevel[room];
    const hint = ROOMS[room].hints && ROOMS[room].hints[level];
    let f = Array.from(container.children).find((c) => c.classList && c.classList.contains('feedback'));
    if (!f) { f = document.createElement('div'); f.className = 'feedback'; container.appendChild(f); }
    if (hint) {
      f.className = 'feedback';
      f.innerHTML = `<span class="icon" aria-hidden="true">💡</span> ${hint}`;
    }
    if (!ROOMS[room].hints[level + 1]) btn.disabled = true;
    saveProgress();   // persist the hint level in the checkpoint
  });
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

function completeRoom(room) {
  state.completed[room] = true;
  state.currentRoom = null;
  saveProgress();
  updateNav();
  toast(tf('pg.room.complete', { title: ROOMS[room].title }));
  const nav = document.getElementById('room-next-nav');
  if (nav) {
    nav.innerHTML = '';
    const next = document.createElement('button');
    next.className = 'btn-primary';
    next.textContent = room === 4 ? t('pg.room.graduate') : t('pg.room.next');
    next.addEventListener('click', () => {
      if (room === 4) graduate();
      else { state.currentRoom = room + 1; showScreen('rooms'); window.scrollTo({ top: 0 }); }
    });
    nav.appendChild(next);
  }
}

// ── Room renderer ───────────────────────────────────────
function roomPathHTML(current) {
  // A visual journey strip: 4 rooms in order, marked done/current/next.
  return `<div class="room-path" role="list" aria-label="${t('pg.room.pathAria')}">
    ${ROOM_ORDER.map((r) => {
    const rinfo = ROOMS[r];
    const done = !!state.completed[r];
    const cur = r === current;
    // Reachable = completed, current, OR the next room after a completed one
    // (same gating as the bottom nav dots — a child can always go back to a
    // finished room or forward to the next unlocked one).
    const prevDone = r === 1 || !!state.completed[r - 1];
    const reachable = done || cur || prevDone;
    return `<button class="path-step ${done ? 'done' : ''} ${cur ? 'current' : ''}"
        data-room="${r}" role="listitem" aria-label="${tf('pg.room.pathStepAria', { n: r, title: rinfo.title })}" ${reachable ? '' : 'aria-disabled="true" disabled'}>
        <span class="path-emoji">${rinfo.emoji}</span>
        <span class="path-name">${rinfo.title}</span>
        <span class="path-flag">${done ? '✓' : cur ? '▶' : ''}</span>
      </button>`;
  }).join('')}
  </div>`;
}

function renderRoom(room) {
  state.currentRoom = room;
  updateNav();
  saveProgress();   // checkpoint the resumable room
  const r = ROOMS[room];
  const el = document.createElement('div');
  el.className = 'room';
  el.innerHTML = `
    <div class="room-path-wrap">${roomPathHTML(room)}</div>
    <div class="room-header">
      <span class="room-tag">${tf('pg.room.tag', { n: room })}</span>
      <h2>${r.emoji} ${r.title}</h2>
      <p class="room-intro">${r.story}</p>
    </div>
    <div class="room-body">
      ${r.bridge ? `<div class="bridge-box">🔗 <strong>${t('pg.room.bridgeLabel')}</strong> ${r.bridge}</div>` : ''}
      ${r.math.map((m) => `<div class="math-block">${m}</div>`).join('')}
      ${r.why ? `<div class="why-box"><strong>${r.whyTitle || t('pg.room.whyFallback')}</strong><ul>${r.why.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
      <div id="challenge-${room}" class="challenge-box"></div>
      <div id="room-next-nav" class="room-nav-slot"></div>
    </div>
  `;
  roomWrap.innerHTML = '';
  roomWrap.appendChild(el);
  // Journey strip taps: allow revisiting a completed room OR the next unlocked one.
  $$('.path-step', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = Number(btn.dataset.room);
      if (state.completed[target] || target === state.currentRoom) {
        renderRoom(target);
        window.scrollTo({ top: 0 });
      }
    });
  });
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
    { label: t('c1.row.nearRoads'), score: 90, w: '30%', ans: 27 },
    { label: t('c1.row.services'), score: 70, w: '25%', ans: 17.5 },
    { label: t('c1.row.quiet'), score: 80, w: '15%', ans: 12 },
    { label: t('c1.row.spread'), score: 60, w: '10%', ans: 6 },
    { label: t('c1.row.mix'), score: 70, w: '10%', ans: 7 },
    { label: t('c1.row.utilities'), score: 90, w: '10%', ans: 9 },
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

  const leftName = t('c1.lab.left');
  const rightName = t('c1.lab.right');
  container.innerHTML = `
    <div class="lab-card" id="rc-lab">
      <h3>${t('c1.lab.title')}</h3>
      <p>${tf('c1.lab.intro', { left: leftName })}</p>
      <div class="lab-track" id="lab-track">
        <div class="lab-half lab-left">
          <div class="lab-name">${leftName}</div>
          <div class="lab-score">${tf('c1.lab.score', { n: WEIGHT_LAB.left.score })}</div>
          <div class="lab-share" id="lab-left-share">50%</div>
        </div>
        <input type="range" class="lab-slider" id="lab-slider" min="0" max="100" value="50" step="1"
          aria-label="${tf('c1.lab.sliderAria', { left: leftName, right: rightName })}">
        <div class="lab-half lab-right">
          <div class="lab-name">${rightName}</div>
          <div class="lab-score">${tf('c1.lab.score', { n: WEIGHT_LAB.right.score })}</div>
          <div class="lab-share" id="lab-right-share">50%</div>
        </div>
      </div>
      <div class="lab-total"><span>${t('c1.lab.total')}</span><strong id="lab-total">${weightLabTotal(0.5, [WEIGHT_LAB.left.score, WEIGHT_LAB.right.score])}</strong></div>
      <p class="lab-note">${tf('c1.lab.note', { left: leftName, ls: WEIGHT_LAB.left.score, right: rightName, rs: WEIGHT_LAB.right.score })}</p>
    </div>
    <p>${t('c1.challenge')}</p>
    <div class="report-card" id="rc-rows"></div>
    <div class="tile-tray" id="rc-tiles" aria-label="${t('c1.tilesAria')}"></div>
    <div class="stacked-total" id="rc-stacked" aria-hidden="true"></div>
    <div class="total-caption" id="rc-caption">${tf('c1.totalCaption', { n: 0 })}</div>
    <div class="section-label">${t('c1.totalLabel')}</div>
    <div class="input-row">
      <label class="sr-only" for="rc-total">${t('c1.totalLabel')}</label>
      <input type="text" inputmode="decimal" id="rc-total" placeholder="${t('c1.totalPlaceholder')}">
      <button class="btn-primary" id="rc-check">${t('c1.check')}</button>
    </div>
  `;

  // Weight lab: the slider divides 100% between the two subjects.
  const slider = document.getElementById('lab-slider');
  const labTotal = document.getElementById('lab-total');
  const leftShare = document.getElementById('lab-left-share');
  const rightShare = document.getElementById('lab-right-share');
  const setSplit = (val) => {
    const split = Number(val) / 100;
    leftShare.textContent = Math.round(split * 100) + '%';
    rightShare.textContent = Math.round((1 - split) * 100) + '%';
    labTotal.textContent = weightLabTotal(split, [WEIGHT_LAB.left.score, WEIGHT_LAB.right.score]);
  };
  if (slider) {
    slider.addEventListener('input', () => setSplit(slider.value));
    setSplit(50);
  }

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
      <span class="rc-box" data-i="${i}" role="button" tabindex="0" aria-label="${tf('c1.boxAria', { label: row.label })}">?</span>
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
      feedback(container, t('c1.fb.tileFirst'), false);
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
    document.getElementById('rc-caption').textContent = tf('c1.totalCaption', { n: (Math.round(sum * 10) / 10) });
  }

  document.getElementById('rc-check').addEventListener('click', () => {
    if (!fills.every((f) => f !== null)) { feedback(container, t('c1.fb.fillAll'), false); return; }
    const rowOk = rows.every((r, i) => Math.abs(fills[i] - r.ans) < 0.01);
    const totalInput = document.getElementById('rc-total').value.trim();
    const totalOk = Math.abs(parseTotal(totalInput) - TOTAL) < 0.01;
    if (!rowOk) { feedback(container, t('c1.fb.rowsWrong'), false); return; }
    if (!totalOk) { feedback(container, t('c1.fb.totalWrong'), false); return; }
    feedback(container, t('c1.fb.perfect'), true);
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
         aria-label="${tf('c2.spotAria', { name: s.name, d1: s.d1, d2: s.d2, limit })}">
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
    <h3>${tf('c2.cardTitle', { emoji, title, limit, squares: limit / 50 })}</h3>
    <p>${t('c2.intro')}</p>
    <div class="cover-map" aria-hidden="true">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${tf('c2.svgAria', { title })}">
        ${svgRows}
      </svg>
    </div>
    <div class="legend-line">${tf('c2.legend', { limit })}</div>
    <table class="mark-table" role="group" aria-label="${tf('c2.tableAria', { title })}">
      <tr><th>${t('c2.th.spot')}</th><th>${t('c2.th.home1')}</th><th>${t('c2.th.home2')}</th><th>${t('c2.th.ok')}</th><th>${t('c2.th.toofar')}</th></tr>
      ${spots.map((s) => `
        <tr data-mark="${s.id}">
          <td>${s.name}</td><td>${s.d1}m</td><td>${s.d2}m</td>
          <td><button class="mark-btn ok" data-mark-val="ok">${t('c2.markOk')}</button></td>
          <td><button class="mark-btn toofar" data-mark-val="toofar">${t('c2.markTooFar')}</button></td>
        </tr>`).join('')}
    </table>
    <p>${tf('c2.bestIntro', { limit })}</p>
    <div class="best-row" role="radiogroup" aria-label="${tf('c2.bestAria', { title })}">
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
    emoji: '🛍️', title: t('c2.shopTitle'),
    limit: 150, best: 'B',
    spots: [
      { id: 'A', name: t('c2.spotA'), d1: 100, d2: 200 },
      { id: 'B', name: t('c2.spotB'), d1: 150, d2: 150 },
      { id: 'C', name: t('c2.spotC'), d1: 50, d2: 250 },
    ],
  });
  const bus = buildCoverageTask(container, {
    emoji: '🚌', title: t('c2.busTitle'),
    limit: 400, best: 'Y',
    spots: [
      { id: 'X', name: t('c2.stopX'), d1: 300, d2: 500 },
      { id: 'Y', name: t('c2.stopY'), d1: 350, d2: 400 },
      { id: 'Z', name: t('c2.stopZ'), d1: 100, d2: 450 },
    ],
  });

  const check = document.createElement('div');
  check.className = 'input-row';
  check.innerHTML = `<button class="btn-primary" id="rc2-check">${t('c2.check')}</button>`;
  container.appendChild(check);

  const markOk = (task) => task.spots.every((s) => {
    const tr = task.card.querySelector(`tr[data-mark="${s.id}"]`);
    const on = tr.querySelector('.mark-btn.on');
    const correct = s.d1 <= task.limit && s.d2 <= task.limit ? 'ok' : 'toofar';
    return on && on.dataset.markVal === correct;
  });

  document.getElementById('rc2-check').addEventListener('click', () => {
    if (!markOk(shop)) { feedback(container, t('c2.fb.shopMarks'), false); return; }
    if (!markOk(bus)) { feedback(container, t('c2.fb.busMarks'), false); return; }
    if (shop.bestPick.val !== 'B') { feedback(container, t('c2.fb.shopBest'), false); return; }
    if (bus.bestPick.val !== 'Y') { feedback(container, t('c2.fb.busBest'), false); return; }
    feedback(container, t('c2.fb.perfect'), true);
    completeRoom(2);
  });
}

// ════════════════════════════════════════════════════════════
// ROOM 3 — Shortest Path
// ════════════════════════════════════════════════════════════

// Search-schematic node positions (self-contained SVG, clean layout). The three
// corridors are Route A (top), Route C (middle) and Route B (bottom), all
// running HOME → BUS — same graph as lesson-core DIJKSTRA_LESSON.
const SEARCH_POS = {
  H: { x: 70, y: 120 },
  A1: { x: 190, y: 55 },
  A2: { x: 310, y: 55 },
  C1: { x: 190, y: 135 },
  C2: { x: 310, y: 135 },
  B1: { x: 190, y: 220 },
  BUS: { x: 440, y: 120 },
};

/** Draw the search schematic skeleton into `svg` (edges + node circles). */
function buildSearchSvg(svg, graph) {
  svg.setAttribute('viewBox', '0 0 520 260');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('c3.searchSvgAria'));
  let inner = '<rect width="520" height="260" fill="#0b132b" rx="10"/>';
  for (const [a, b, len] of graph.edges) {
    const pa = SEARCH_POS[a], pb = SEARCH_POS[b];
    inner += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#334478" stroke-width="6" stroke-linecap="round"/>`;
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    inner += `<text x="${mx}" y="${my - 8}" text-anchor="middle" fill="#8899cc" font-size="11" paint-order="stroke" stroke="#0b132b" stroke-width="4">${len}m</text>`;
  }
  for (const id of Object.keys(graph.nodes)) {
    const p = SEARCH_POS[id];
    const isBus = id === 'BUS';
    inner += `<g class="dj-node" data-node="${id}" transform="translate(${p.x}, ${p.y})">
      <circle r="16" fill="#0b132b" stroke="#334478" stroke-width="2"/>
      <circle class="dj-ring" r="21" fill="none" stroke="#ffb84c" stroke-width="2" opacity="0" style="transform-origin:0 0"/>
      <text class="dj-name" y="4" text-anchor="middle" fill="#8899cc" font-size="10">${isBus ? '🏁' : ''}${graph.nodes[id].label}</text>
      <text class="dj-dist" y="-24" text-anchor="middle" fill="#ffb84c" font-size="13" font-weight="bold"></text>
    </g>`;
  }
  svg.innerHTML = inner;
}

/**
 * Run the Room 3 "watch the planner search" stage inside `container`.
 * Animates dijkstraReveal() from lesson-core so the child SEES the algorithm:
 * mark neighbours with tentative distances, confirm the closest crossing, and
 * keep going until BUS is reached — honest, deterministic, replayable.
 */
function runSearchStage(container, onDone) {
  const stage = document.createElement('div');
  stage.className = 'search-stage';
  stage.innerHTML = `
    <h3>${t('c3.searchTitle')}</h3>
    <p>${t('c3.searchIntro')}</p>
    <div class="search-map" aria-hidden="true"><svg id="c3-search-svg"></svg></div>
    <div class="search-status" id="c3-search-status" aria-live="polite">${t('c3.searchStatusStart')}</div>
    <div class="search-actions">
      <button class="btn-secondary" id="c3-search-replay">${t('c3.replay')}</button>
      <button class="btn-secondary" id="c3-search-skip">${t('c3.skip')}</button>
    </div>
  `;
  container.prepend(stage);

  const svg = stage.querySelector('#c3-search-svg');
  const status = stage.querySelector('#c3-search-status');
  buildSearchSvg(svg, DIJKSTRA_LESSON);

  const { reveals } = dijkstraReveal(DIJKSTRA_LESSON, 'H');
  const tentative = {};
  let gen = 0;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function distText(node, d) {
    const el = svg.querySelector(`.dj-node[data-node="${node}"] .dj-dist`);
    if (el) el.textContent = d === Infinity ? '—' : `${d}m`;
  }
  function nodeState(id, kind) {
    const g = svg.querySelector(`.dj-node[data-node="${id}"]`);
    if (!g) return;
    g.classList.remove('settled', 'marked', 'bus-final');
    if (kind) g.classList.add(kind);
    if (kind === 'settled') {
      const c = g.querySelector('circle');
      if (c) c.setAttribute('fill', '#00e0a0');
    } else {
      const c = g.querySelector('circle');
      if (c) c.setAttribute('fill', '#0b132b');
    }
  }
  let done = false;

  function play() {
    const my = ++gen;
    let i = 0;
    status.textContent = t('c3.searchStatusStart');

    // Instant-complete under prefers-reduced-motion.
    if (reduceMotion) { finish(my); return; }

    const step = () => {
      if (my !== gen || !stage.isConnected) return;
      if (i >= reveals.length) { finish(my); return; }
      const ev = reveals[i];
      i++;
      if (ev.kind === 'mark') {
        const had = ev.node in tentative;
        const old = tentative[ev.node];
        tentative[ev.node] = ev.dist;
        distText(ev.node, ev.dist);
        nodeState(ev.node, 'marked');
        status.textContent = had && Number.isFinite(old)
          ? tf('c3.markFound', { node: ev.node, old, dist: ev.dist })
          : tf('c3.markReach', { node: ev.node, dist: ev.dist });
      } else {
        nodeState(ev.node, 'settled');
        status.textContent = ev.node === 'H'
          ? t('c3.settleHome')
          : tf('c3.settleNode', { node: ev.node, dist: ev.dist });
      }
      setTimeout(step, 720);
    };
    setTimeout(step, 300);
  }

  function finish(my) {
    if (my !== gen || !stage.isConnected) return;
    done = true;
    const winner = dijkstraWinner({ BUS: DIJKSTRA_BUS_DIST });
    distText('BUS', DIJKSTRA_BUS_DIST);
    nodeState('BUS', 'settled');
    const busG = svg.querySelector('.dj-node[data-node="BUS"]');
    if (busG) busG.classList.add('bus-final');
    status.innerHTML = tf('c3.busReached', { dist: DIJKSTRA_BUS_DIST, winner });
    stage.querySelector('#c3-search-replay').disabled = false;
    if (onDone) onDone();
  }

  stage.querySelector('#c3-search-replay').addEventListener('click', () => {
    gen++;
    svg.querySelectorAll('.dj-node').forEach((g) => {
      g.classList.remove('settled', 'marked', 'bus-final');
      const c = g.querySelector('circle');
      if (c) c.setAttribute('fill', '#0b132b');
      const d = g.querySelector('.dj-dist');
      if (d) d.textContent = '';
    });
    play();
  });
  stage.querySelector('#c3-search-skip').addEventListener('click', () => { gen++; finish(gen); });

  play();
  return stage;
}

function challenge3(container) {
  const routes = [
    { id: 'A', total: 350, segs: [150, 100, 100], pts: [[90, 62], [240, 62], [240, 152], [392, 152]] },
    { id: 'B', total: 450, segs: [200, 250], pts: [[90, 62], [90, 232], [392, 232]] },
    { id: 'C', total: 420, segs: [120, 180, 120], pts: [[90, 62], [210, 62], [210, 112], [392, 112]] },
  ];
  const BUDGET = 400;
  let pick = null, within = null;

  // Lane each label so overlapping text never collides ACROSS routes (they all
  // share the same HOME origin, so e.g. A's "150m" and C's "120m" used to sit
  // on top of each other). Horizontal segments stagger UP by lane; a dark
  // stroke behind the text keeps it readable where a route crosses another.
  const hLanes = {};
  const svgRoutes = routes.map((r) => {
    const d = r.pts.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
    const segLabel = (x, y, seg) => `<text x="${x}" y="${y}" text-anchor="middle" fill="#ffb84c" font-size="12" font-weight="bold" paint-order="stroke" stroke="#0b132b" stroke-width="4" stroke-linejoin="round">${seg}m</text>`;
    const labels = r.segs.map((seg, i) => {
      const a = r.pts[i], b = r.pts[i + 1];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const horiz = a[1] === b[1];
      if (horiz) {
        const key = Math.round(my);
        const lane = (hLanes[key] = (hLanes[key] || 0) + 1);
        return segLabel(mx, my - 8 - (lane - 1) * 15, seg);
      }
      return segLabel(mx, my + 4, seg);
    }).join('');
    return `
      <g class="route-path" data-route="${r.id}" tabindex="0" role="button" aria-label="${tf('c3.routeAria', { id: r.id, segs: r.segs.join(' + ') })}">
        <path class="road-base" d="${d}" fill="none" stroke="#445588" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="road-walk" d="${d}" fill="none" stroke="#00ff9d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        ${labels}
      </g>`;
  }).join('');

  container.innerHTML = `
    <p>${t('c3.challenge')}</p>
    <div class="road-map" aria-hidden="true">
      <svg viewBox="0 0 480 270" role="img" aria-label="${t('c3.svgAria')}">
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
      <div class="bm-label">${t('c3.budgetLabel')}</div>
      <div class="bm-bar"><div class="bm-fill" id="bm-fill"></div></div>
      <div class="bm-value" id="bm-value">${tf('c3.budgetValue', { shown: 0 })}</div>
    </div>
    <div class="route-buttons" role="radiogroup" aria-label="${t('c3.chooseRouteAria')}">
      ${routes.map((r) => `<button class="btn-route" data-route="${r.id}">${tf('c3.route', { id: r.id })}</button>`).join('')}
    </div>
    <div class="section-label">${t('c3.chosenTotal')}</div>
    <div class="input-row">
      <label class="sr-only" for="route-total">${t('c3.chosenTotal')}</label>
      <input type="text" inputmode="decimal" id="route-total" placeholder="${t('c3.totalPlaceholder')}">
    </div>
    <div class="section-label">${t('c3.withinLabel')}</div>
    <div class="route-buttons" role="radiogroup" aria-label="${t('c3.withinAria')}">
      <button class="btn-route" data-within="yes">${t('c3.yes')}</button>
      <button class="btn-route" data-within="no">${t('c3.no')}</button>
    </div>
    <div class="input-row"><button class="btn-primary" id="rc3-check">${t('c3.check')}</button></div>
  `;

  // "Watch the planner SEARCH" beat — prepended above the ant challenge. Its
  // Skip button reveals the challenge; it never blocks room completion.
  runSearchStage(container, () => {
    const hint = document.querySelector('.room-tag');
    if (hint) hint.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Route selection + ant animation + running total + budget meter.
  const fill = document.getElementById('bm-fill');
  const value = document.getElementById('bm-value');
  const ant = document.getElementById('ant');
  // Generation token + stored timeout: each animateRoute() cancels any previous
  // loop's frames and its final-total timeout, so mashing route buttons can
  // never leave concurrent requestAnimationFrame loops fighting over the ant /
  // running-total / budget meter (the old `animCancel` was never set true).
  let animGen = 0;
  let animTimeout = 0;

  function animateRoute(route, total) {
    const gen = ++animGen;
    clearTimeout(animTimeout);
    $$('.route-path').forEach((g) => g.classList.remove('selected'));
    const g = document.querySelector(`.route-path[data-route="${route}"]`);
    if (!g) return;
    g.classList.add('selected');
    const walk = g.querySelector('.road-walk');
    const len = walk.getTotalLength();
    walk.style.strokeDasharray = '0';
    walk.style.strokeDashoffset = '0';
    walk.style.transition = 'none';
    ant.setAttribute('opacity', '1');

    // Reduced motion: show the chosen route + final total instantly — no ant
    // race, no count-up loop (the numbers are the feedback).
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ant.setAttribute('opacity', '0');
      value.textContent = tf('c3.budgetValue', { shown: total });
      fill.style.width = Math.min(100, (total / BUDGET) * 100) + '%';
      fill.classList.toggle('over', total > BUDGET);
      return;
    }

    const steps = 90;
    let i = 0;
    const animate = () => {
      if (gen !== animGen) return;   // superseded by a newer route selection
      if (i > steps) { ant.setAttribute('opacity', '0'); return; }
      const pt = walk.getPointAtLength((len * i) / steps);
      ant.setAttribute('transform', `translate(${pt.x}, ${pt.y})`);
      // Running total: count up with the ant.
      const frac = i / steps;
      const shown = Math.round(total * frac * 10) / 10;
      value.textContent = tf('c3.budgetValue', { shown });
      fill.style.width = Math.min(100, (shown / BUDGET) * 100) + '%';
      fill.classList.toggle('over', shown > BUDGET);
      i++;
      requestAnimationFrame(animate);
    };
    animate();
    // Final total.
    animTimeout = setTimeout(() => {
      if (gen !== animGen) return;   // superseded by a newer route selection
      value.textContent = tf('c3.budgetValue', { shown: total });
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
    if (pick !== 'A') { feedback(container, t('c3.fb.pick'), false); return; }
    if (!Number.isFinite(total) || Math.abs(total - 350) > 0.01) { feedback(container, t('c3.fb.total'), false); return; }
    if (within !== 'yes') { feedback(container, t('c3.fb.within'), false); return; }
    feedback(container, t('c3.fb.perfect'), true);
    completeRoom(3);
  });
}

// ════════════════════════════════════════════════════════════
// ROOM 4 — Hill-Climbing
// ════════════════════════════════════════════════════════════
function challenge4(container) {
  const rounds = [
    { current: 58, opts: [
      { id: 'A', label: t('c4.r1.a'), to: 60 },
      { id: 'B', label: t('c4.r1.b'), to: 57 },
      { id: 'C', label: t('c4.r1.c'), to: 59 },
    ], keep: 'A', next: 60 },
    { current: 60, opts: [
      { id: 'D', label: t('c4.r2.d'), to: 62 },
      { id: 'E', label: t('c4.r2.e'), to: 59 },
      { id: 'F', label: t('c4.r2.f'), to: 60 },
    ], keep: 'D', next: 62 },
  ];
  const picks = { 1: null, 2: null };
  const steps = [
    { x: 95, y: 208, v: 58 },
    { x: 185, y: 168, v: 60 },
    { x: 270, y: 142, v: 62 },
  ];

  container.innerHTML = `
    <p>${t('c4.challenge')}</p>
    <div class="mountain" aria-hidden="true">
      <svg viewBox="0 0 500 250" role="img" aria-label="${t('c4.mountainAria')}">
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
      <div class="sd-label">${t('c4.currentScore')}</div>
      <div class="sd-value" id="hc-score">58</div>
    </div>
    <div id="hc-rounds"></div>
    <div class="hc-stuck" id="hc-stuck" hidden>
      <h3>${t('c4.stuck.title')}</h3>
      <p>${t('c4.stuck.body')}</p>
      <p>${t('c4.stuck.q')}</p>
      <div class="hc-options">
        <button class="btn-stuck" data-answer="yes">${t('c4.stuck.yes')}</button>
        <button class="btn-stuck" data-answer="no">${t('c4.stuck.no')}</button>
      </div>
      <div class="hc-escape" id="hc-escape" hidden>
        <p>${t('c4.escape.body')}</p>
        <p>${t('c4.escape.q')}</p>
        <div class="hc-options">
          <button class="btn-stuck escape" data-escape="restart">${t('c4.escape.restart')}</button>
          <button class="btn-stuck escape" data-escape="tryagain">${t('c4.escape.tryagain')}</button>
        </div>
        <p class="escape-reveal" id="hc-escape-reveal" hidden>${t('c4.escape.reveal')}</p>
      </div>
    </div>
    <div class="input-row"><button class="btn-primary" id="rc4-check">${t('c4.check')}</button></div>
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
      <h3>${tf('c4.round', { n: ri + 1, cur: round.current })}</h3>
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
          f.innerHTML = `<span class="icon" aria-hidden="true">✓</span> ${tf('c4.keepIt', { next: round.next, cur: round.current })}`;
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
          f.innerHTML = `<span class="icon" aria-hidden="true">✗</span> ${up ? t('c4.rejectUp') : t('c4.rejectDown')}`;
        }
      });
    });
  });

  let last = null;
  $$('.btn-stuck').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.answer) {
        last = btn.dataset.answer;
        $$('.btn-stuck').forEach((b) => b.classList.toggle('selected', b === btn));
        // Reveal the escape question only after the child answers the greedy question.
        const escape = document.getElementById('hc-escape');
        if (escape) escape.hidden = false;
        if (last === 'no') {
          const r = document.getElementById('hc-escape-reveal');
          if (r) r.hidden = true;
        }
      }
    });
  });

  let escapePick = null;
  $$('.btn-stuck.escape').forEach((btn) => {
    btn.addEventListener('click', () => {
      escapePick = btn.dataset.escape;
      $$('.btn-stuck.escape').forEach((b) => b.classList.toggle('selected', b === btn));
      if (escapePick === 'restart') {
        const reveal = document.getElementById('hc-escape-reveal');
        if (reveal) reveal.hidden = false;
      } else {
        const reveal = document.getElementById('hc-escape-reveal');
        if (reveal) reveal.hidden = true;
      }
    });
  });

  document.getElementById('rc4-check').addEventListener('click', () => {
    if (picks[1] !== 'A' || picks[2] !== 'D') { feedback(container, t('c4.fb.rounds'), false); return; }
    if (last !== 'no') { feedback(container, t('c4.fb.rule'), false); return; }
    if (escapePick !== 'restart') { feedback(container, t('c4.fb.escape'), false); return; }
    feedback(container, t('c4.fb.perfect'), true);
    completeRoom(4);
  });
}

// ── Challenge dispatch ──────────────────────────────────
const CHALLENGES = { 1: challenge1, 2: challenge2, 3: challenge3, 4: challenge4 };

// ── Hints (2 levels per room) come from i18n.js (hint.N.1 / hint.N.2) ──
// buildRooms() attaches them to each room.

// ── Graduation / download ───────────────────────────────
function graduate() {
  state.currentRoom = null;
  showScreen('finale');
  updateNav();
  if (unlockBtn) unlockBtn.disabled = false;
  if (downloadHint) downloadHint.textContent = t('pg.downloadHint.ready');
}

/** The Planner is always available; Academy is a Lesson 1 companion. */
function unlockPlanner() {
  window.location.href = '/planner/';
}

/**
 * Save the child's Academy progress as a portable Champion File. The Academy's
 * progress key is owned by the Champion File, so this is the child's backup even
 * if they never open the planner or 3D city on this device.
 */
function saveProgressFile() {
  try {
    const file = composeChampionFile(collectState(), 'My Academy progress');
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = championFilename(file.label);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(t('pg.toast.progressSaved'));
  } catch (e) {
    toast(t('pg.toast.progressFail'));
  }
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
  toast(t('pg.toast.reset'));
}

// ── Language ────────────────────────────────────────────
function applyNavAria() {
  $$('.nav-dot').forEach((dot) => {
    dot.setAttribute('aria-label', tf('pg.nav.room', { n: Number(dot.dataset.room) }));
  });
}
applyStatic();
mountLangToggle('#lang-slot');
applyNavAria();

// Re-localize dynamic surfaces when the language flips (static chrome is
// handled by applyStatic inside setLang).
window.addEventListener('i18n:change', () => {
  ROOMS = buildRooms();
  applyNavAria();
  if (screenFinale.classList.contains('active')) graduate();
  else if (screenRooms.classList.contains('active') && state.currentRoom) renderRoom(state.currentRoom);
});

// ── Init ────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  // Resume returning students: prefer the saved checkpoint room, else the first
  // room they haven't finished (a refresh/tab that completed earlier rooms
  // shouldn't redo Room 1).
  const resume = state.currentRoom;
  state.currentRoom = (Number.isInteger(resume) && !state.completed[resume])
    ? resume
    : (ROOM_ORDER.find((r) => !state.completed[r]) || ROOM_ORDER[0]);
  showScreen('rooms');
  window.scrollTo({ top: 0 });
});
if (unlockBtn) unlockBtn.addEventListener('click', unlockPlanner);
const saveProgressBtn = document.getElementById('btn-save-progress');
if (saveProgressBtn) saveProgressBtn.addEventListener('click', saveProgressFile);
document.getElementById('btn-restart').addEventListener('click', openRestartModal);
document.getElementById('modal-cancel').addEventListener('click', closeRestartModal);
document.getElementById('modal-ok').addEventListener('click', () => { closeRestartModal(); restart(); });
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeRestartModal(); });

// Data-loss safety: flush the checkpoint when the tab is hidden or closed.
// iOS Safari can evict localStorage, so the last reliable moment is pagehide /
// visibilitychange, not the next room completion.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveProgress();
});
window.addEventListener('pagehide', saveProgress);

// Nav dots: allow revisiting completed rooms or the next unlocked room.
$$('.nav-dot').forEach((dot) => {
  const go = () => {
    const room = Number(dot.dataset.room);
    const prevDone = room === 1 || state.completed[room - 1];
    if (state.completed[room] || prevDone) {
      state.currentRoom = room;
      showScreen('rooms');
      window.scrollTo({ top: 0 });
      saveProgress();
    }
  };
  dot.addEventListener('click', go);
  dot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});

// Restore completion + the room-level checkpoint so a refresh keeps progress.
const restored = parseProgress(readStored(), ROOM_ORDER.length);
Object.assign(state.completed, restored.completed);
if (restored.checkpoint) {
  Object.assign(state.hintLevel, restored.checkpoint.hintLevel || {});
  const cr = restored.checkpoint.currentRoom;
  // Only resume an unfinished room whose predecessor is done (never skip ahead).
  if (cr && !state.completed[cr] && (cr === 1 || state.completed[cr - 1])) {
    state.currentRoom = cr;
  }
}
updateNav();
if (ROOM_ORDER.every((r) => state.completed[r])) graduate();
