/**
 * city-planner/planner.js — 2D AI City Planner
 *
 * A continuous ~2km top-down planning canvas. Tools:
 *  - Place buildings (open catalog: 18 special mission buildings + generic)
 *  - Draw roads (freeform polyline strokes)
 *  - Paint parks (circles)
 *  - Move/delete buildings
 *
 * Live metrics (client-side) + an optional LLM advisor via the buddy gateway
 * (/api/turn) with graceful offline fallback to rule-based tips.
 *
 * Layout export: JSON (version 2) → localStorage + download + copy. The 3D
 * template (city-builder) consumes this exact schema.
 */

import { CATALOG, CATALOG_ORDER, catalogType, isSpecial } from '../city-common/catalog.js';
import { defaultLayout, sanitizeLayout, validateLayout, ROAD_WIDTH } from '../city-common/layout.js';
import { computeMetrics } from '../city-common/metrics.js';
import { optimizeLayout } from '../city-common/optimize.js';

const SCALE = 2000;                  // plan meters per side
const STORAGE_KEY = 'p5_city_planner_layout_v1';
const MAX_UNDO = 60;

// ─── State ──────────────────────────────────────────────
const state = {
  layout: defaultLayout(),
  tool: 'place',          // 'place' | 'road' | 'park' | 'select'
  selectedType: 'housing',
  selectedIdx: -1,
  view: { px: 0.18, ox: 0, oy: 0 },   // px/meter; screen offset of plan (0,0)
  undoStack: [],
  gesture: null,
  aiBusy: false,
};

// ─── DOM ────────────────────────────────────────────────
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const catalogList = document.getElementById('catalog-list');
const hintBar = document.getElementById('hint-bar');
const scoreEl = document.getElementById('score');
const problemsEl = document.getElementById('problems');
const aiOutput = document.getElementById('ai-output');
const toastEl = document.getElementById('toast');

let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}
window.addEventListener('resize', resize);
// Keep the drawing buffer locked to the CSS size. The old window.resize-only
// path let the buffer drift (e.g. the iPad dynamic URL bar, or the drawer
// settling after fonts load), so the browser stretched the canvas bitmap and
// taps landed offset from the drawn content.
if (typeof ResizeObserver !== 'undefined') {
  try {
    new ResizeObserver(() => resize()).observe(canvas);
  } catch (e) { /* ResizeObserver unavailable — window.resize still covers most */ }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
}

// ─── Coordinate transforms ──────────────────────────────
function planToScreen(x, y) {
  return { x: state.view.ox + x * state.view.px, y: state.view.oy - y * state.view.px };
}
function screenToPlan(sx, sy) {
  return { x: (sx - state.view.ox) / state.view.px, y: (state.view.oy - sy) / state.view.px };
}
function clampPlan(p) {
  return { x: Math.max(0, Math.min(SCALE, p.x)), y: Math.max(0, Math.min(SCALE, p.y)) };
}
function zoomAt(sx, sy, factor) {
  const p = screenToPlan(sx, sy);
  state.view.px = Math.max(0.05, Math.min(8, state.view.px * factor));
  state.view.ox = sx - p.x * state.view.px;
  state.view.oy = sy + p.y * state.view.px;
  requestRender();
}

// ─── Rendering ──────────────────────────────────────────
// All render() calls are coalesced through requestAnimationFrame so pointermove
// storms (which can fire many times per frame on tablets) produce at most one
// paint per frame. The draw functions themselves cull off-screen content and
// drop detail at low zoom, so a single frame stays cheap even on big cities.
let _rafPending = false;
function requestRender() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => { _rafPending = false; render(); });
}

function render() {
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, 0, w, h);

  drawGrid(w, h);
  drawParks(w, h);
  drawRoads(w, h);
  drawBuildings(w, h);
  drawGesture(w, h);
}

function drawGrid(w, h) {
  const s = state.view;
  const minP = screenToPlan(0, h);
  const maxP = screenToPlan(w, 0);
  const step = 50;
  const startX = Math.max(0, Math.floor(minP.x / step) * step);
  const endX = Math.min(SCALE, Math.ceil(maxP.x / step) * step);
  const startY = Math.max(0, Math.floor(minP.y / step) * step);
  const endY = Math.min(SCALE, Math.ceil(maxP.y / step) * step);

  for (let gx = startX; gx <= endX; gx += step) {
    const major = gx % 250 === 0;
    ctx.strokeStyle = major ? 'rgba(0,242,254,0.16)' : 'rgba(255,255,255,0.045)';
    ctx.lineWidth = major ? 1.5 : 1;
    ctx.beginPath();
    const a = planToScreen(gx, minP.y);
    const b = planToScreen(gx, maxP.y);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let gy = startY; gy <= endY; gy += step) {
    const major = gy % 250 === 0;
    ctx.strokeStyle = major ? 'rgba(0,242,254,0.16)' : 'rgba(255,255,255,0.045)';
    ctx.lineWidth = major ? 1.5 : 1;
    ctx.beginPath();
    const a = planToScreen(minP.x, gy);
    const b = planToScreen(maxP.x, gy);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function drawParks(w, h) {
  for (const p of state.layout.parks) {
    const c = planToScreen(p.cx, p.cz);
    const r = p.radius * state.view.px;
    ctx.fillStyle = 'rgba(76,190,106,0.28)';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4cbe6a';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#9fe8b0';
    ctx.font = `${Math.max(12, r * 0.3)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌳', c.x, c.y);
  }
}

function drawRoads(w, h) {
  const minP = screenToPlan(0, h), maxP = screenToPlan(w, 0);
  const x0 = Math.min(minP.x, maxP.x) - 60, x1 = Math.max(minP.x, maxP.x) + 60;
  const z0 = Math.min(minP.y, maxP.y) - 60, z1 = Math.max(minP.y, maxP.y) + 60;
  for (const r of state.layout.roads) {
    const pts = r.points;
    // Cheap bounding-box cull: skip roads entirely outside the viewport.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of pts) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
    }
    if (maxX < x0 || minX > x1 || maxZ < z0 || minZ > z1) continue;

    const width = (r.width || ROAD_WIDTH[r.class] || ROAD_WIDTH.residential) * state.view.px;
    ctx.strokeStyle = '#232c44';
    ctx.lineWidth = Math.max(2, width);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const s = planToScreen(pt[0], pt[1]);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    // cyan centerline (skip at far zoom-out — too thin to read)
    if (width * 0.12 >= 1.2) {
      ctx.strokeStyle = 'rgba(0,242,254,0.5)';
      ctx.lineWidth = Math.max(1, Math.min(3, width * 0.12));
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const s = planToScreen(pt[0], pt[1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

function buildingFootprint(b) {
  return b.footprint || catalogType(b.type)?.footprint || [20, 20];
}

function drawBuildings(w, h) {
  const layout = state.layout;
  // Cull: only draw buildings intersecting the viewport (+margin).
  const minP = screenToPlan(0, h), maxP = screenToPlan(w, 0);
  const x0 = Math.min(minP.x, maxP.x) - 40, x1 = Math.max(minP.x, maxP.x) + 40;
  const z0 = Math.min(minP.y, maxP.y) - 40, z1 = Math.max(minP.y, maxP.y) + 40;
  for (let i = 0; i < layout.buildings.length; i++) {
    const b = layout.buildings[i];
    const spec = catalogType(b.type);
    const fp = buildingFootprint(b);
    if (b.pos[0] < x0 || b.pos[0] > x1 || b.pos[1] < z0 || b.pos[1] > z1) continue;
    const c = planToScreen(b.pos[0], b.pos[1]);
    const bw = fp[0] * state.view.px;
    const bh = fp[1] * state.view.px;
    // Skip truly sub-pixel slivers (still countable, invisible anyway).
    if (bw < 1 && bh < 1) continue;
    const x = c.x - bw / 2;
    const y = c.y - bh / 2;

    ctx.fillStyle = spec?.color || '#8caaba';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, bw, bh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = i === state.selectedIdx ? '#ffffff' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = i === state.selectedIdx ? 3 : 1;
    ctx.strokeRect(x, y, bw, bh);

    // Icon: ALWAYS draw the building's emoji (same icon as its catalog
    // button) so the student can identify what's what at any zoom. Sized from
    // the on-screen footprint but clamped to a readable floor; at the default
    // zoom a 20m building (~3.6px) still shows an ~11px icon.
    const emojiSize = Math.max(11, Math.min(28, Math.min(bw, bh) * 0.5));
    ctx.font = `${emojiSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(spec?.emoji || '🏢', c.x, c.y - emojiSize * 0.28);

    // Short label — only when the building is big enough to hold it (zoomed in).
    if (bw > 34) {
      ctx.font = '700 11px Nunito, sans-serif';
      ctx.fillStyle = '#eaf2f8';
      ctx.fillText(shortName(spec?.name || b.type), c.x, c.y + emojiSize * 0.55);
    }
  }
}

function shortName(name) {
  return name.length > 16 ? name.slice(0, 15) + '…' : name;
}

function drawGesture(w, h) {
  const g = state.gesture;
  if (!g) return;
  if (g.mode === 'road' && g.roadPts && g.roadPts.length >= 2) {
    ctx.strokeStyle = 'rgba(0,242,254,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    g.roadPts.forEach((pt, i) => {
      const s = planToScreen(pt.x, pt.y);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (g.mode === 'park' && g.parkStart) {
    const cur = g.parkCur || g.parkStart;
    const c = planToScreen(g.parkStart.x, g.parkStart.y);
    const r = Math.hypot(cur.x - g.parkStart.x, cur.y - g.parkStart.y) * state.view.px;
    ctx.strokeStyle = 'rgba(76,190,106,0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ─── Catalog drawer ─────────────────────────────────────
function buildDrawer() {
  catalogList.innerHTML = '';
  const groups = [
    { label: 'Mission buildings', keys: CATALOG_ORDER.filter((k) => isSpecial(k)) },
    { label: 'Facilities', keys: CATALOG_ORDER.filter((k) => !isSpecial(k)) },
  ];
  for (const grp of groups) {
    const label = document.createElement('div');
    label.className = 'drawer-title';
    label.textContent = grp.label;
    catalogList.appendChild(label);
    for (const key of grp.keys) {
      const spec = CATALOG[key];
      const btn = document.createElement('button');
      btn.className = 'cat-btn' + (isSpecial(key) ? ' special' : '');
      btn.dataset.type = key;
      btn.innerHTML = `<span class="emoji">${spec.emoji}</span><span class="name">${spec.name}</span>`;
      btn.addEventListener('click', () => {
        state.selectedType = key;
        state.selectedIdx = -1;
        setTool('place');
        selectCatalogBtn(key);
        hint('Tap the map to place the ' + spec.name + '.');
      });
      catalogList.appendChild(btn);
    }
  }
  selectCatalogBtn(state.selectedType);
}

function selectCatalogBtn(key) {
  catalogList.querySelectorAll('.cat-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === key);
  });
}

// ─── Tools ──────────────────────────────────────────────
function setTool(tool) {
  state.tool = tool;
  state.selectedIdx = -1;
  document.querySelectorAll('.tool-btn').forEach((b) => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  hint(TIPS[tool]);
  render();
}

const TIPS = {
  place: 'Tap the map to place a building. Drag empty space to pan. Use the scroll wheel or pinch to zoom.',
  road: 'Drag on the map to draw a road — release to finish. Roads improve accessibility!',
  park: 'Drag on the map to paint a park circle — release to finish. Homes love parks!',
  select: 'Tap a building to select it, then drag to move it. Drag empty space to pan. 🗑️ removes it.',
};

function hint(msg) {
  hintBar.textContent = msg;
}

// ─── Pointer interaction ────────────────────────────────
function rectOf(canvas) { return canvas.getBoundingClientRect(); }

/**
 * Pointer position in CANVAS-LOCAL CSS pixels. Uses clientX−rect.left — the
 * proven approach for iOS WebKit (Safari/Chrome on iPad): offsetX/offsetY are
 * unreliable there (offsetY can come back undefined), which placed buildings
 * at NaN and made them invisible. The rightward-tap drift the offsetX branch
 * was meant to defend against is actually fixed by the ResizeObserver keeping
 * the canvas buffer in sync with its CSS size.
 */
function pointerPos(e) {
  const r = rectOf(canvas);
  return { sx: e.clientX - r.left, sy: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const { sx, sy } = pointerPos(e);
  const p = clampPlan(screenToPlan(sx, sy));
  if (!state.gesture) {
    state.gesture = { pointers: new Map(), mode: null, moved: 0, roadPts: [], parkStart: null, parkCur: null, movingIdx: -1, startX: sx, startY: sy };
  }
  state.gesture.pointers.set(e.pointerId, { sx, sy });

  if (state.gesture.pointers.size === 2) {
    state.gesture.mode = 'pinch';
    updatePinch();
    return;
  }

  if (state.gesture.mode === 'pinch') return; // already pinching

  switch (state.tool) {
    case 'road':
      state.gesture.mode = 'road';
      state.gesture.roadPts = [p];
      break;
    case 'park':
      state.gesture.mode = 'park';
      state.gesture.parkStart = p;
      state.gesture.parkCur = p;
      break;
    case 'select': {
      const hit = hitBuilding(sx, sy);
      if (hit >= 0) {
        state.gesture.mode = 'move';
        state.gesture.movingIdx = hit;
        state.selectedIdx = hit;
        render();
      } else {
        state.gesture.mode = 'pan';
      }
      break;
    }
    case 'place':
    default:
      state.gesture.mode = 'maybe-place';
      break;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const g = state.gesture;
  if (!g) return;
  const { sx, sy } = pointerPos(e);

  const existing = g.pointers.get(e.pointerId);
  const dx = existing ? sx - existing.sx : 0;
  const dy = existing ? sy - existing.sy : 0;
  g.pointers.set(e.pointerId, { sx, sy });
  if (existing) { g.moved += Math.abs(dx) + Math.abs(dy); }

  if (g.mode === 'pinch') { updatePinch(); requestRender(); return; }

  switch (g.mode) {
    case 'pan':
      state.view.ox += dx;
      state.view.oy += dy;
      requestRender();
      break;
    case 'maybe-place':
      if (g.moved > 8) {
        g.mode = 'pan';
        state.view.ox += dx;
        state.view.oy += dy;
        requestRender();
      }
      break;
    case 'road': {
      const p = clampPlan(screenToPlan(sx, sy));
      const last = g.roadPts[g.roadPts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 4) g.roadPts.push(p);
      requestRender();
      break;
    }
    case 'park': {
      g.parkCur = clampPlan(screenToPlan(sx, sy));
      requestRender();
      break;
    }
    case 'move': {
      const b = state.layout.buildings[g.movingIdx];
      if (b) {
        const p = clampPlan(screenToPlan(sx, sy));
        b.pos = [Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2];
        requestRender();
      }
      break;
    }
  }
});

function endPointer(e) {
  const g = state.gesture;
  if (!g) return;
  const { sx, sy } = pointerPos(e);
  g.pointers.delete(e.pointerId);

  if (g.pointers.size > 0) {
    // Still another pointer active (pinch → single): restart single gesture fresh.
    const [id, pt] = g.pointers.entries().next().value;
    g.mode = 'pan';
    g.startX = pt.sx; g.startY = pt.sy; g.moved = 0;
    return;
  }

  const mode = g.mode;
  switch (mode) {
    case 'road': {
      if (g.roadPts.length >= 2) {
        const pts = g.roadPts.map((p) => [Math.round(p.x), Math.round(p.y)]);
        let len = 0;
        for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]);
        if (len >= 20) {
          pushUndo();
          state.layout.roads.push({ points: pts, width: ROAD_WIDTH.residential, class: 'residential' });
          updateMetrics();
        }
      }
      break;
    }
    case 'park': {
      const rad = g.parkStart ? Math.hypot(g.parkCur.x - g.parkStart.x, g.parkCur.y - g.parkStart.y) : 0;
      if (rad >= 10) {
        pushUndo();
        state.layout.parks.push({ cx: Math.round(g.parkStart.x), cz: Math.round(g.parkStart.y), radius: Math.round(rad) });
        updateMetrics();
      }
      break;
    }
    case 'move': {
      if (g.moved > 4) {
        pushUndo();
        updateMetrics();   // computed once at gesture end, not per pointermove
      }
      break;
    }
    case 'maybe-place': {
      if (g.moved <= 8) {
        const p = clampPlan(screenToPlan(sx, sy));
        placeBuilding(p.x, p.y);
      }
      break;
    }
  }
  state.gesture = null;
  render();
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { /* keep drawing on pointerleave thanks to capture */ });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { sx, sy } = pointerPos(e);
  zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0016));
}, { passive: false });

function updatePinch() {
  const g = state.gesture;
  if (!g || g.pointers.size < 2) return;
  const pts = [...g.pointers.values()];
  const [a, b] = pts;
  const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy);
  const midX = (a.sx + b.sx) / 2;
  const midY = (a.sy + b.sy) / 2;
  if (g.prevPinch) {
    const prevDist = g.prevPinch.dist;
    if (prevDist > 0) {
      const p = screenToPlan(midX, midY);
      state.view.px = Math.max(0.05, Math.min(8, state.view.px * (dist / prevDist)));
      state.view.ox = midX - p.x * state.view.px;
      state.view.oy = midY + p.y * state.view.px;
    }
    state.view.ox += midX - g.prevPinch.midX;
    state.view.oy += midY - g.prevPinch.midY;
  }
  g.prevPinch = { dist, midX, midY };
}

function hitBuilding(sx, sy) {
  const p = screenToPlan(sx, sy);
  const layout = state.layout;
  for (let i = layout.buildings.length - 1; i >= 0; i--) {
    const b = layout.buildings[i];
    const fp = buildingFootprint(b);
    if (Math.abs(p.x - b.pos[0]) <= fp[0] / 2 && Math.abs(p.y - b.pos[1]) <= fp[1] / 2) return i;
  }
  return -1;
}

function placeBuilding(x, y) {
  const spec = catalogType(state.selectedType);
  if (!spec) return;
  pushUndo();
  state.layout.buildings.push({
    type: state.selectedType,
    pos: [Math.round(x * 2) / 2, Math.round(y * 2) / 2],
    footprint: spec.footprint,
    height: spec.height,
  });
  updateMetrics();
  render();
}

// ─── Undo / clear ───────────────────────────────────────
function pushUndo() {
  state.undoStack.push(JSON.stringify(state.layout));
  if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
}
function undo() {
  const snap = state.undoStack.pop();
  if (snap) {
    state.layout = JSON.parse(snap);
    state.selectedIdx = -1;
    updateMetrics();
    render();
    toast('↩️ Undone');
  } else {
    toast('Nothing to undo');
  }
}
function clearAll() {
  pushUndo();
  state.layout = defaultLayout();
  state.selectedIdx = -1;
  updateMetrics();
  render();
  toast('🗑️ City cleared');
}

// ─── Road templates ────────────────────────────────────
// Premade road networks for students who don't want to draw roads freeform
// (it can look messy). Picking one clears the city and loads ONLY the roads
// (plus maybe a central park) so the student fills in the buildings.
const ROAD_TEMPLATES = {
  grid: {
    name: 'City Grid',
    roads: [
      // 3 horizontal + 3 vertical primary roads forming a classic grid
      { points: [[150, 500], [1850, 500]], width: 14, class: 'primary' },
      { points: [[150, 1000], [1850, 1000]], width: 14, class: 'primary' },
      { points: [[150, 1500], [1850, 1500]], width: 14, class: 'primary' },
      { points: [[500, 150], [500, 1850]], width: 14, class: 'primary' },
      { points: [[1000, 150], [1000, 1850]], width: 14, class: 'primary' },
      { points: [[1500, 150], [1500, 1850]], width: 14, class: 'primary' },
      // a couple of quieter secondary roads for variety
      { points: [[150, 750], [1850, 750]], width: 10, class: 'secondary' },
      { points: [[150, 1250], [1850, 1250]], width: 10, class: 'secondary' },
    ],
    parks: [{ cx: 1000, cz: 1000, radius: 70 }],
  },
  radial: {
    name: 'Radial Ring',
    roads: [
      // a central ring
      (() => {
        const ring = [];
        const cx = 1000, cz = 1000, r = 380, n = 24;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          ring.push([Math.round(cx + Math.cos(a) * r), Math.round(cz + Math.sin(a) * r)]);
        }
        return { points: ring, width: 12, class: 'primary' };
      })(),
      // 6 spokes from the centre out to the ring
      { points: [[1000, 1000], [1000, 160]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1000, 1840]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [160, 1000]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1840, 1000]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [406, 406]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1594, 1594]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [406, 1594]], width: 10, class: 'secondary' },
      { points: [[1000, 1000], [1594, 406]], width: 10, class: 'secondary' },
    ],
    parks: [{ cx: 1000, cz: 1000, radius: 55 }],
  },
};

function loadRoadTemplate(key) {
  const tpl = ROAD_TEMPLATES[key];
  if (!tpl) return;
  pushUndo();
  state.layout = defaultLayout();
  state.layout.roads = tpl.roads.map((r) => ({
    points: r.points.map(([x, z]) => [Math.round(x), Math.round(z)]),
    width: r.width,
    class: r.class,
  }));
  state.layout.parks = (tpl.parks || []).map((p) => ({ cx: p.cx, cz: p.cz, radius: p.radius }));
  state.selectedIdx = -1;
  updateMetrics();
  render();
  toast(`🛤️ Loaded the ${tpl.name} roads — now place your buildings!`);
}

// ─── Metrics panel ──────────────────────────────────────
function updateMetrics() {
  const m = computeMetrics(state.layout);
  scoreEl.textContent = m.score;
  scoreEl.style.setProperty('--pct', String(m.score));

  problemsEl.innerHTML = '';
  for (const p of m.problems) {
    const el = document.createElement('p');
    el.textContent = '⚠️ ' + p;
    problemsEl.appendChild(el);
  }
}

// ─── Export ─────────────────────────────────────────────
function serializeLayout() {
  return {
    version: 2,
    scaleMeters: SCALE,
    roads: state.layout.roads,
    parks: state.layout.parks,
    buildings: state.layout.buildings.map((b) => ({
      type: b.type,
      pos: b.pos,
      footprint: b.footprint,
      height: b.height,
    })),
  };
}

function exportCity() {
  const layout = serializeLayout();
  const v = validateLayout(layout);
  if (!v.ok) {
    toast('⚠️ ' + v.errors[0]);
    return;
  }
  const json = JSON.stringify(layout, null, 2);
  // localStorage (for the 3D template in the same browser)
  let savedToStorage = false;
  try { localStorage.setItem(STORAGE_KEY, json); savedToStorage = true; } catch (e) { /* quota — warn below */ }
  // download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-ai-city.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  // copy (non-fatal — swallow the rejection so we don't get noisy unhandled errors)
  try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).catch(() => {}); } catch (e) { /* ignore */ }
  toast(savedToStorage
    ? `💾 Saved! ${state.layout.buildings.length} buildings, ${state.layout.roads.length} roads, ${state.layout.parks.length} parks.`
    : '⚠️ Could not save to this browser (storage full) — use the downloaded my-ai-city.json instead.');
}

/**
 * Open a saved city from JSON and drop it into the editor, REPLACING the
 * current city. The previous city is pushed onto the undo stack, so ↩️ Undo
 * restores it. Validation + sanitize happen before anything is replaced.
 */
function importCity(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    toast('⚠️ That file is not valid JSON.');
    return false;
  }
  const v = validateLayout(parsed);
  if (!v.ok) {
    toast('⚠️ ' + v.errors[0]);
    return false;
  }
  const next = sanitizeLayout(parsed);
  pushUndo();
  state.layout = next;
  state.selectedIdx = -1;
  updateMetrics();
  render();
  // Close the open menu so the student sees the city, not the menu.
  if (importMenu) importMenu.classList.add('hidden');
  toast(`📂 Opened your saved city — ${next.buildings.length} buildings, ${next.roads.length} roads, ${next.parks.length} parks.`);
  return true;
}

// Pending plan (optimise → review → Apply / Keep). Stored so Apply/Keep
// buttons can commit or discard without re-running the optimizer.
let _pendingPlan = null;

const THEME_LABEL = {
  add: '🏠 Homes & facilities',
  move: '↔️ Better placement',
  remove: '🧹 Less clutter',
  add_park: '🌳 Parks',
};
const METRIC_LABEL = {
  accessibility: 'closer to a road',
  coverage: 'nearer schools/shops/help',
  utilities: 'water, power & buses',
  spread: 'mission buildings spread out',
  zoning: 'quieter for homes',
  balance: 'better building mix',
};
const METRIC_ICON = {
  accessibility: '🛣️', coverage: '🏘️', utilities: '💧', spread: '🧩', zoning: '🤫', balance: '⚖️',
};

function metricBadges(improved) {
  if (!improved || !improved.length) return '';
  return ' <span class="metric-badges">' +
    improved.map((m) => `<span class="metric-badge">${METRIC_ICON[m] || ''} ${METRIC_LABEL[m] || m} ↑</span>`).join('') +
    '</span>';
}

/**
 * Optimise the city right now: the buddy proposes a measured plan (score-gated
 * hill-climb). The student reviews the reasons and taps Apply or Keep; the
 * previous layout is pushed onto the undo stack only when Apply is chosen.
 */
async function askAdvisor() {
  if (state.aiBusy) return;
  state.aiBusy = true;
  const btn = document.getElementById('btn-ai');
  btn.disabled = true;
  btn.textContent = '🤖 Checking…';
  try {
    // Yield once so the browser can paint the busy state.
    await new Promise((r) => setTimeout(r, 0));
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const before = computeMetrics(state.layout);

    const { layout: optimized, diff, after } = optimizeLayout(state.layout, {}, seed);
    _pendingPlan = { layout: optimized, diff, before, after };

    renderPlan(before, after, diff);

    if (!diff.length) {
      toast('✅ Your city is already well balanced — nothing to change!');
    } else {
      const addN = diff.filter((d) => d.action === 'add').length;
      const moveN = diff.filter((d) => d.action === 'move').length;
      const remN = diff.filter((d) => d.action === 'remove').length;
      const parkN = diff.filter((d) => d.action === 'add_park').length;
      const parts = [];
      if (addN) parts.push(`${addN} added`);
      if (moveN) parts.push(`${moveN} moved`);
      if (remN) parts.push(`${remN} removed`);
      if (parkN) parts.push(`${parkN} park${parkN > 1 ? 's' : ''}`);
      toast(`🤖 I found ${parts.length ? parts.join(', ') : 'a few small tweaks'} — review and apply!`);
    }
  } catch (e) {
    console.error('[planner] optimize failed:', e);
    aiOutput.innerHTML = '<span class="ai-buddy">Your coding buddy</span> Hmm, I couldn\u2019t check your city right now — try again!';
    _pendingPlan = null;
  } finally {
    state.aiBusy = false;
    btn.disabled = false;
    btn.textContent = '🤖 Optimize';
  }
}

function renderPlan(before, after, diff) {
  // Group reasons by theme, preserving order.
  const order = ['add', 'move', 'remove', 'add_park'];
  const groups = order
    .map((action) => ({
      action,
      label: THEME_LABEL[action] || action,
      items: diff.filter((d) => d.action === action),
    }))
    .filter((g) => g.items.length);

  const gain = after.score - before.score;
  const scoreLine = gain > 0
    ? `<strong>${before.score}</strong> → <strong>${after.score}</strong> <span class="score-gain">(+${gain})</span>`
    : `stays <strong>${before.score}</strong>`;

  const groupsHtml = groups.map((g) => `
    <div class="plan-group">
      <div class="plan-group-title">${g.label}</div>
      <ul class="plan-list">
        ${g.items.map((d) => `<li>${d.reason}${metricBadges(d.improved)}</li>`).join('')}
      </ul>
    </div>`).join('');

  const body = document.getElementById('plan-modal-body');
  body.innerHTML = `
    <div class="plan-intro">I checked your city and here's what I found.</div>
    <div class="plan-score">City Score: ${scoreLine}</div>
    ${groupsHtml || '<div class="plan-note">Nothing to change — your city is already well balanced! 🌟</div>'}
    ${diff.length ? `
      <div class="plan-actions">
        <button class="plan-apply" id="plan-apply">✅ Apply changes</button>
        <button class="plan-keep" id="plan-keep">🙅 Keep my city</button>
      </div>` : '<div class="plan-actions"><button class="plan-keep" id="plan-keep">👍 Got it</button></div>'}`;

  const modal = document.getElementById('plan-modal');
  modal.classList.remove('hidden');
  // Focus the primary action so the student can Apply with one tap.
  const applyBtn = document.getElementById('plan-apply');
  if (applyBtn) applyBtn.focus();

  // Close on backdrop / X / Esc — but NOT on Apply (that commits the plan).
  modal.querySelectorAll('[data-plan-close]').forEach((el) => {
    el.addEventListener('click', () => closePlanModal());
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { closePlanModal(); document.removeEventListener('keydown', esc); }
  });

  if (applyBtn) applyBtn.addEventListener('click', applyPlan);
  const keepBtn = document.getElementById('plan-keep');
  if (keepBtn) keepBtn.addEventListener('click', () => {
    _pendingPlan = null;
    closePlanModal();
    aiOutput.innerHTML = '<span class="ai-buddy">Your coding buddy</span> No problem — your city stays exactly as you built it! 🌟';
    toast('👍 Kept your city as-is');
  });
}

function closePlanModal() {
  const modal = document.getElementById('plan-modal');
  if (modal) modal.classList.add('hidden');
}

function applyPlan() {
  if (!_pendingPlan) return;
  const { layout, diff } = _pendingPlan;
  const oldLayout = state.layout;
  pushUndo();
  state.layout = layout;
  state.selectedIdx = -1;
  updateMetrics();
  render();
  flashChanges(oldLayout, diff);
  closePlanModal();
  const addN = diff.filter((d) => d.action === 'add').length;
  const moveN = diff.filter((d) => d.action === 'move').length;
  const remN = diff.filter((d) => d.action === 'remove').length;
  const parkN = diff.filter((d) => d.action === 'add_park').length;
  const parts = [];
  if (addN) parts.push(`${addN} building${addN > 1 ? 's' : ''} added`);
  if (moveN) parts.push(`${moveN} moved`);
  if (remN) parts.push(`${remN} removed`);
  if (parkN) parts.push(`${parkN} park${parkN > 1 ? 's' : ''}`);
  toast(`✅ Applied — ${parts.join(', ')}! ↩️ Undo to revert.`);
  aiOutput.innerHTML = '<span class="ai-buddy">Your coding buddy</span> Done! Your city is smarter now. 🌟';
  _pendingPlan = null;
}

// Briefly outline the buildings the plan changed (green=added, blue=moved,
// red=removed) so the student sees exactly what changed on the map.
function flashChanges(oldLayout, diff) {
  const FLASH_MS = 2200;
  const marks = [];   // {x, z, w, h, color}
  for (const d of diff) {
    if (d.action === 'remove' && d.from) {
      marks.push({ x: d.from[0], z: d.from[1], w: 22, h: 22, color: '#ff5c5c' });
    } else if (d.action === 'add' && d.to) {
      marks.push({ x: d.to[0], z: d.to[1], w: 26, h: 26, color: '#3ddc84' });
    } else if (d.action === 'move' && d.to) {
      marks.push({ x: d.to[0], z: d.to[1], w: 26, h: 26, color: '#00b7ff' });
    }
  }
  if (!marks.length) return;
  const end = Date.now() + FLASH_MS;
  function drawFlash() {
    render();   // repaint the base map
    for (const mk of marks) {
      const c = planToScreen(mk.x, mk.z);
      const s = Math.max(8, mk.w * state.view.px);
      ctx.save();
      ctx.strokeStyle = mk.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = mk.color;
      ctx.shadowBlur = 8;
      ctx.strokeRect(c.x - s / 2, c.y - s / 2, s, s);
      ctx.restore();
    }
    if (Date.now() < end) requestAnimationFrame(drawFlash);
  }
  drawFlash();
}
// ─── Wire up UI ─────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-clear').addEventListener('click', clearAll);
document.getElementById('btn-ai').addEventListener('click', askAdvisor);
document.getElementById('btn-export').addEventListener('click', exportCity);
document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// Road template menu
const templateBtn = document.getElementById('btn-template');
const templateMenu = document.getElementById('template-menu');
templateBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  templateMenu.classList.toggle('hidden');
});
document.querySelectorAll('.template-item').forEach((item) => {
  item.addEventListener('click', () => {
    loadRoadTemplate(item.dataset.template);
    templateMenu.classList.add('hidden');
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.template-wrap')) templateMenu.classList.add('hidden');
});

// Open / import menu
const importWrap = document.getElementById('import-wrap');
const importMenu = document.getElementById('import-menu');
const importFileInput = document.getElementById('import-file');
const importFileBtn = document.getElementById('import-file-btn');
const importPasteToggle = document.getElementById('import-paste-toggle');
const importPasteWrap = document.getElementById('import-paste-wrap');
const importPasteGo = document.getElementById('import-paste-go');
const importPasteBox = document.getElementById('import-paste');

document.getElementById('btn-import').addEventListener('click', (e) => {
  e.stopPropagation();
  importMenu.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.import-wrap')) importMenu.classList.add('hidden');
});
// File open — label-for pattern: the <button> click falls through to the
// hidden <input type="file">, which opens the picker reliably on tablets.
importFileBtn.addEventListener('click', (e) => {
  if (e.defaultPrevented) return;   // a native label already handled it
  e.preventDefault();
  importFileInput.click();
});
importFileInput.addEventListener('change', () => {
  const f = importFileInput.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    importCity(reader.result);
    importFileInput.value = '';   // allow re-selecting the same file later
  };
  reader.readAsText(f);
});
importPasteToggle.addEventListener('click', () => {
  importPasteWrap.classList.toggle('hidden');
});
importPasteGo.addEventListener('click', () => {
  if (importCity(importPasteBox.value)) {
    importMenu.classList.add('hidden');
    importPasteWrap.classList.add('hidden');
  }
});

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// Restore a saved layout if present, else center the view.
(function init() {
  buildDrawer();
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const v = validateLayout(parsed);
      if (v.ok) state.layout = sanitizeLayout(parsed);
    } catch (e) { /* corrupted — start fresh */ }
  }
  // Center the plan viewport on first open
  const r = canvas.getBoundingClientRect();
  const cx = r.width / 2, cy = r.height / 2;
  state.view.ox = cx - (SCALE / 2) * state.view.px;
  state.view.oy = cy + (SCALE / 2) * state.view.px;
  setTool('place');
  updateMetrics();
  resize();
})();
