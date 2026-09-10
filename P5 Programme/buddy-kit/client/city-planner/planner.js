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

import { CATALOG, CATALOG_ORDER, isSpecial } from '../city-common/catalog.js';
import { defaultLayout, sanitizeLayout, validateLayout, ROAD_WIDTH, typeSpec } from '../city-common/layout.js';
import { LIBRARY_CATEGORIES, libraryItem, libraryByCategory } from '../city-common/library.js';
import { computeMetrics, METRIC_PARAMS, GOAL_KEYS, stars, normalizeWeights, defaultMetricWeights } from '../city-common/metrics.js';
import { optimizeLayout, proposeMoves, applyMove } from '../city-common/optimize.js';
import { computeWalkReach, walkPath, homeReachRoutes, WALK_BUDGET } from '../city-common/walkability.js';
import { ROAD_TEMPLATES, getRoadTemplate } from '../city-common/road-templates.js';
import { collectState, composeChampionFile, championFilename, sanitizeChampionFile, writeState, rememberSavedAt } from '../city-common/champion-file.js';
import { initI18n, currentLang, t, mountLangToggle, applyStatic } from './i18n.js';

// Language must be resolved BEFORE the first module-scope render: renderTemplates()
// (below) reads currentLang() to pick the template names, and initI18n() lives at
// module scope so a saved/browser zh-Hant choice applies from the very first paint
// (previously it ran in the bottom init IIFE, after this first render).
initI18n();

// ─── i18n helpers ────────────────────────────────────────
// L() interpolates {placeholders} in a dictionary value.
function L(key, vars) {
  let s = t(key);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : ''));
  return s;
}
function goalDisplayName(key) { return t('planner.goalMeta.' + key); }
function mayorName(id) { return t('planner.mayor.' + id + '.name'); }
function mayorBrief(id) { return t('planner.mayor.' + id + '.brief'); }
function receiptName(key) { return t('planner.receiptMeta.' + key + '.name'); }
function receiptHint(key) { return t('planner.receiptMeta.' + key + '.hint'); }
function templateName(id) {
  if (currentLang() !== 'zh-Hant') {
    const tpl = getRoadTemplate(id);
    return tpl ? tpl.name : id;
  }
  return t('planner.template.' + id);
}
const GOOD_FOR_KEY = {
  'any mayor': 'any',
  'the Busy Mayor': 'busy',
  'the Quiet Mayor': 'quiet',
  'the Healthy Mayor': 'healthy',
  'the Walkable Mayor': 'walkable',
  'the Green Mayor': 'green',
};
function templateGoodFor(raw) {
  if (currentLang() !== 'zh-Hant') return 'for ' + raw;   // byte-for-byte today
  const k = GOOD_FOR_KEY[raw];
  return t('planner.template.forPrefix') + (k ? t('planner.template.goodFor.' + k) : raw);
}
function planThemeLabel(action) {
  if (currentLang() !== 'zh-Hant') return THEME_LABEL[action] || action;
  return t('planner.planTheme.' + action);
}
function metricLabelFor(m) {
  if (currentLang() !== 'zh-Hant') return METRIC_LABEL[m] || m;
  return t('planner.metric.' + m);
}
function buddyMsg(nameKey, msgKey) {
  return '<span class="ai-buddy">' + t(nameKey) + '</span> ' + t(msgKey);
}

const SCALE = 2000;                  // plan meters per side
const STORAGE_KEY = 'p5_city_planner_layout_v1';
const MAX_UNDO = 60;
// Planner's License gate: shared with the City Planning Academy pregame.
const LICENSE_KEY = 'CITYSMART-P5-2026';
const UNLOCK_STORAGE_KEY = 'p5_planner_unlocked';

// ─── Goal model (display) ─────────────────────────────
const GOAL_META = {
  happy: { name: 'Happy Homes', emoji: '🏘️' },
  walkable: { name: 'Easy to get around', emoji: '🚶' },
  peaceful: { name: 'Peaceful', emoji: '🤫' },
  spread: { name: 'Balanced & spread out', emoji: '🧩' },
};

// Mayor personas: each is a fixed set of goal weights + a one-line brief.
const MAYORS = {
  green: { name: 'Green Mayor', emoji: '🌳', brief: 'Parks, walking, fresh air', weights: { happy: 0.45, walkable: 0.30, peaceful: 0.15, spread: 0.10 } },
  healthy: { name: 'Healthy Mayor', emoji: '🚑', brief: 'Hospitals, fire, quiet homes', weights: { happy: 0.50, peaceful: 0.25, walkable: 0.15, spread: 0.10 } },
  busy: { name: 'Busy Mayor', emoji: '🛍️', brief: 'Shops, offices, everywhere reachable', weights: { happy: 0.30, walkable: 0.30, spread: 0.25, peaceful: 0.15 } },
  quiet: { name: 'Quiet Mayor', emoji: '🤫', brief: 'Peace and calm, spread out', weights: { peaceful: 0.40, spread: 0.30, happy: 0.15, walkable: 0.15 } },
};

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
  // Goals: null weights = Balanced (default fixed blend).
  goalWeights: null,      // {happy, walkable, peaceful, spread} | null
  goalMode: 'mayor',      // 'mayor' | 'custom'
  mayorId: null,          // null = balanced, else MAYORS key
  sliderVals: { happy: 30, walkable: 30, peaceful: 20, spread: 20 },
  viewMode: 'normal',     // 'normal' | 'happy' | 'walk' | 'ranges'
  walkCache: null,
  homeRoutes: [],         // homeReachRoutes for the selected home (drawn in Walk view)
  homeHappy: [],          // per-building index: 0..1 served share (null = not housing)
  homeWalk: [],           // per-building index: walk reach 0..1 (null = not housing)
  lastMetrics: null,      // most recent computeMetrics result (for receipt + deltas)
  mymove: null,           // active "My move" state (moves + student picks)
  lastPlans: null,        // { greedy:{...}, explore:{...}, active:'greedy'|'explore' }
  activeStrategy: 'greedy',
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
const goalList = document.getElementById('goal-list');
const selectedInfo = document.getElementById('selected-info');
const goalsModal = document.getElementById('goals-modal');
const mayorGrid = document.getElementById('mayor-grid');
const sliderList = document.getElementById('slider-list');
const templateMenu = document.getElementById('template-menu');

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
  // Soft radial wash instead of a flat fill (visual only).
  const bg = ctx.createRadialGradient(w * 0.4, h * 0.25, 40, w * 0.5, h * 0.5, Math.max(w, h));
  bg.addColorStop(0, '#111b38');
  bg.addColorStop(1, '#0a1124');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawGrid(w, h);
  drawParks(w, h);
  drawRoads(w, h);
  if (state.viewMode === 'ranges') drawRanges(w, h);
  drawWalkRoutes(w, h);
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

/**
 * Draw the selected home's real walking routes (the VISIBLE Dijkstra). In Walk
 * view, when a home is selected, show each need's actual road path: green when
 * it is within the walk budget, red when the nearest instance is too far — so a
 * child sees WHY a home is unserved instead of just a red square. Roads that
 * lead nowhere or cities without a selected home draw nothing.
 */
function drawWalkRoutes(w, h) {
  if (state.viewMode !== 'walk') return;
  const routes = state.homeRoutes;
  if (!routes.length) return;

  const colorFor = (r) => (r.ok ? 'rgba(0,255,157,0.9)' : 'rgba(255,92,122,0.9)');
  const nameFor = (type) => {
    if (type === 'park') return t('planner.type.park') || 'Park';
    const spec = typeSpec(type);
    return spec?.name || type;
  };

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of routes) {
    if (r.path.length < 2) continue;
    // Path glow (readability over dark roads) + solid line.
    ctx.strokeStyle = colorFor(r);
    ctx.lineWidth = Math.max(3, 7 * state.view.px) + 4;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    r.path.forEach((pt, i) => {
      const s = planToScreen(pt.x, pt.z);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colorFor(r);
    ctx.lineWidth = Math.max(2.5, 5 * state.view.px);
    ctx.setLineDash(r.ok ? [] : [6, 6]);
    ctx.beginPath();
    r.path.forEach((pt, i) => {
      const s = planToScreen(pt.x, pt.z);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Distance label at the route midpoint.
    const mid = r.path[Math.floor(r.path.length / 2)];
    const ms = planToScreen(mid.x, mid.z);
    ctx.font = '800 13px Nunito, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = `${nameFor(r.type)} ${r.dist}m`;
    ctx.fillStyle = 'rgba(7,13,32,0.85)';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(ms.x - tw / 2 - 5, ms.y - 10, tw + 10, 20);
    ctx.fillStyle = r.ok ? '#0f3a28' : '#5a1622';
    ctx.fillText(label, ms.x, ms.y + 0.5);
  }
}

function buildingFootprint(b) {
  return b.footprint || typeSpec(b.type)?.footprint || [20, 20];
}

function drawRanges(w, h) {
  const layout = state.layout;
  const serviceSet = new Set([...METRIC_PARAMS.serviceTypes, ...METRIC_PARAMS.utilityTypes]);
  const isUtility = new Set(METRIC_PARAMS.utilityTypes);
  const minP = screenToPlan(0, h), maxP = screenToPlan(w, 0);
  const x0 = Math.min(minP.x, maxP.x), x1 = Math.max(minP.x, maxP.x);
  const z0 = Math.min(minP.y, maxP.y), z1 = Math.max(minP.y, maxP.y);
  const R = METRIC_PARAMS.coverageDist;          // 150m services/park
  const RU = METRIC_PARAMS.utilityDist;          // 400m utilities

  const drawCircle = (px, pz, r, color, label) => {
    const c = planToScreen(px, pz);
    const cr = r * state.view.px;
    // Cull circles fully off-screen.
    if (c.x + cr < 0 || c.x - cr > w || c.y + cr < 0 || c.y - cr > h) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(c.x, c.y, cr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '700 11px Nunito, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(label, c.x, c.y - cr - 14);
    }
  };

  for (const b of layout.buildings) {
    if (!serviceSet.has(b.type)) continue;
    const r = isUtility.has(b.type) ? RU : R;
    drawCircle(b.pos[0], b.pos[1], r, isUtility.has(b.type) ? 'rgba(0,183,255,0.8)' : 'rgba(0,255,157,0.8)', typeSpec(b.type)?.emoji || '');
  }
  for (const p of layout.parks) {
    drawCircle(p.cx, p.cz, R, 'rgba(0,255,157,0.8)', '🌳');
  }

  // Legend hint (top-left of the canvas).
  ctx.font = '700 12px Nunito, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#9fe8b0';
  ctx.fillText(t('planner.legend'), 14, 14);
}

function drawBuildings(w, h) {
  const layout = state.layout;
  // Cull: only draw buildings intersecting the viewport (+margin).
  const minP = screenToPlan(0, h), maxP = screenToPlan(w, 0);
  const x0 = Math.min(minP.x, maxP.x) - 40, x1 = Math.max(minP.x, maxP.x) + 40;
  const z0 = Math.min(minP.y, maxP.y) - 40, z1 = Math.max(minP.y, maxP.y) + 40;
  for (let i = 0; i < layout.buildings.length; i++) {
    const b = layout.buildings[i];
    const spec = typeSpec(b.type);
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
    // Selection ring: cyan glow so the active building reads clearly.
    const selected = i === state.selectedIdx;
    ctx.strokeStyle = selected ? '#00f2fe' : 'rgba(0,0,0,0.4)';
    ctx.lineWidth = selected ? 3 : 1;
    if (selected) { ctx.shadowColor = '#00f2fe'; ctx.shadowBlur = 10; }
    ctx.strokeRect(x, y, bw, bh);
    ctx.shadowBlur = 0;

    // Icon: ALWAYS draw the building's emoji (same icon as its catalog
    // button) so the student can identify what's what at any zoom. Sized from
    // the on-screen footprint but clamped to a readable floor; at the default
    // zoom a 20m building (~3.6px) still shows an ~11px icon.
    const emojiSize = Math.max(11, Math.min(28, Math.min(bw, bh) * 0.5));
    ctx.font = `${emojiSize}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(spec?.emoji || '🏢', c.x, c.y - emojiSize * 0.28);

    // Lock badge — a small 🔒 in the corner so pinned buildings read clearly.
    if (b.locked) {
      ctx.font = `${Math.max(10, Math.min(16, emojiSize * 0.7))}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('🔒', x + 2, y + 2);
    }

    // Happiness / walk overlays — colour every home by how well it's served.
    if (state.viewMode !== 'normal' && b.type === 'housing') {
      const val = state.viewMode === 'happy' ? state.homeHappy[i] : state.homeWalk[i];
      if (typeof val === 'number') {
        const col = val >= 0.7 ? 'rgba(0,255,157,0.35)' : val >= 0.45 ? 'rgba(255,184,76,0.4)' : 'rgba(255,92,122,0.45)';
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(3, Math.min(8, Math.min(bw, bh) * 0.22));
        ctx.strokeRect(x + 2, y + 2, Math.max(1, bw - 4), Math.max(1, bh - 4));
      }
    }

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
const LIB_DRAWER_CATEGORIES = ['nature', 'props', 'vehicles', 'scenarios'];
const LIB_CATEGORY_LABEL = { nature: 'Nature', props: 'Props', vehicles: 'Vehicles', scenarios: 'Themed' };

function drawerCatLabel(cat) {
  if (currentLang() !== 'zh-Hant') return LIB_CATEGORY_LABEL[cat] || cat;
  return t('planner.drawer.cat' + cat.charAt(0).toUpperCase() + cat.slice(1));
}

function buildDrawer() {
  catalogList.innerHTML = '';
  const groups = [
    { label: t('planner.drawer.mission'), keys: CATALOG_ORDER.filter((k) => isSpecial(k)) },
    { label: t('planner.drawer.facilities'), keys: CATALOG_ORDER.filter((k) => !isSpecial(k)) },
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
        hint(L('planner.hint.placeItem', { name: spec.name }));
      });
      catalogList.appendChild(btn);
    }
  }
  // Shared library items (nature / props / vehicles / themed) — placed as
  // 'lib:<id>' types so the layout + 3D builder know they're library models.
  for (const cat of LIB_DRAWER_CATEGORIES) {
    const items = libraryByCategory(cat);
    if (!items.length) continue;
    const label = document.createElement('div');
    label.className = 'drawer-title';
    label.textContent = drawerCatLabel(cat);
    catalogList.appendChild(label);
    for (const item of items) {
      const btn = document.createElement('button');
      btn.className = 'cat-btn lib';
      btn.dataset.type = 'lib:' + item.id;
      btn.innerHTML = `<span class="emoji">${item.emoji}</span><span class="name">${item.name}</span>`;
      btn.addEventListener('click', () => {
        state.selectedType = 'lib:' + item.id;
        state.selectedIdx = -1;
        setTool('place');
        selectCatalogBtn('lib:' + item.id);
        hint(L('planner.hint.placeItem', { name: item.name }));
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
const TOOL_HINT_KEY = {
  place: 'planner.hint.place',
  road: 'planner.hint.road',
  park: 'planner.hint.park',
  select: 'planner.hint.select',
};

function setTool(tool) {
  state.tool = tool;
  state.selectedIdx = -1;
  renderSelectedInfo();
  document.querySelectorAll('.tool-btn').forEach((b) => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  hint(t(TOOL_HINT_KEY[tool] || 'planner.hint.place'));
  render();
}

function hint(msg) {
  hintBar.textContent = msg;
}

// Live language toggle: refresh the parts the static pass can't reach.
window.addEventListener('i18n:change', () => {
  if (state.viewMode === 'normal') hint(t(TOOL_HINT_KEY[state.tool] || 'planner.hint.place'));
  buildDrawer();
  renderTemplates();   // template names + good-for blurbs switch language live
  updateMetrics();
});

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
        renderSelectedInfo();
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
        } else {
          // Non-blocking feedback: a road that's too short is dropped silently
          // otherwise, and a child may think it saved (leading to roadless
          // cities in the 3D view). Warn, never block.
          toast(t('planner.toast.roadShort'));
        }
      } else {
        toast(t('planner.toast.roadDrag'));
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
  const spec = typeSpec(state.selectedType);
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
  _walkDirty = true;   // the layout changed — recompute walk on next metrics pass
}
function undo() {
  const snap = state.undoStack.pop();
  if (snap) {
    state.layout = JSON.parse(snap);
    state.selectedIdx = -1;
    updateMetrics();
    render();
    toast(t('planner.toast.undo'));
  } else {
    toast(t('planner.toast.nothingUndo'));
  }
}
function clearAll() {
  pushUndo();
  state.layout = defaultLayout();
  state.selectedIdx = -1;
  updateMetrics();
  render();
  toast(t('planner.toast.cleared'));
}

// Delete the currently SELECTED building (or the whole city when none is
// selected). The 👆 Move tool selects; 🗑️ then removes just that building —
// the hint says "🗑️ removes it", so it must actually remove the selection,
// not nuke the whole city.
function deleteSelectedOrClear() {
  const idx = state.selectedIdx;
  if (idx >= 0 && idx < state.layout.buildings.length) {
    const b = state.layout.buildings[idx];
    pushUndo();
    state.layout.buildings.splice(idx, 1);
    state.selectedIdx = -1;
    updateMetrics();
    render();
    const name = typeSpec(b.type)?.name || b.type;
    toast(L('planner.toast.removed', { name }));
    return;
  }
  if (cityIsEmpty()) {
    clearAll();
  } else {
    confirmCityAction({
      title: t('planner.confirm.clearTitle'),
      message: t('planner.confirm.clearMsg'),
      yesLabel: t('planner.confirm.clearYes'),
      onYes: clearAll,
    });
  }
}

function cityIsEmpty() {
  const l = state.layout;
  return !l.buildings.length && !l.roads.length && !l.parks.length;
}

// Lightweight confirm sheet for destructive actions. Built on demand (no
// permanent markup), reuses the app's modal styling, and always leaves a safe
// "keep" path focused by default.
function confirmCityAction({ title, message, yesLabel, onYes }) {
  const old = document.getElementById('confirm-modal');
  if (old) old.remove();
  const m = document.createElement('div');
  m.className = 'modal confirm-modal';
  m.id = 'confirm-modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', title);
  m.innerHTML = `
    <div class="modal-backdrop confirm-backdrop"></div>
    <div class="modal-card confirm-card">
      <div class="modal-head"><span class="modal-title">${title}</span></div>
      <div class="modal-body">
        <p class="confirm-text">${message}</p>
        <div class="goals-actions confirm-actions">
          <button class="confirm-cancel" id="confirm-no" type="button">${t('planner.confirm.keep')}</button>
          <button class="plan-apply" id="confirm-yes" type="button">${yesLabel}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.querySelector('.confirm-backdrop').addEventListener('click', close);
  m.querySelector('#confirm-no').addEventListener('click', close);
  m.querySelector('#confirm-yes').addEventListener('click', () => { close(); onYes(); });
  m.querySelector('#confirm-no').focus();
}

// ─── Road templates ────────────────────────────────────
// Premade road networks for students who don't want to draw roads freeform
// (it can look messy). The 8 templates live in city-common/road-templates.js.
// Picking one clears the city and loads ONLY the roads (plus maybe a central
// park) so the student fills in the buildings.
function renderTemplates() {
  const list = document.getElementById('template-list');
  if (!list) return;
  list.innerHTML = '';
  for (const t of ROAD_TEMPLATES) {
    const item = document.createElement('button');
    item.className = 'template-item';
    item.dataset.template = t.id;
    item.innerHTML = `<span class="tpl-emoji">${t.emoji}</span> <span class="tpl-name">${templateName(t.id)}</span><span class="tpl-good">${templateGoodFor(t.goodFor)}</span>`;
    item.addEventListener('click', () => {
      const apply = () => {
        loadRoadTemplate(t.id);
        templateMenu.classList.add('hidden');
      };
      if (cityIsEmpty()) {
        apply();
      } else {
        templateMenu.classList.add('hidden');
        confirmCityAction({
          title: L('planner.template.confirmTitle', { name: templateName(t.id) }),
          message: t('planner.template.confirmMsg'),
          yesLabel: t('planner.template.replaceYes'),
          onYes: apply,
        });
      }
    });
    list.appendChild(item);
  }
}

function loadRoadTemplate(key) {
  const tpl = getRoadTemplate(key);
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
  toast(L('planner.toast.templateLoaded', { name: templateName(key) }));
}

// ─── Metrics panel ──────────────────────────────────────
let _walkDirty = true;
function computeWalkState() {
  if (!_walkDirty && state.walkCache) return state.walkCache;
  _walkDirty = false;
  state.walkCache = computeWalkReach(state.layout);
  return state.walkCache;
}

/** Refresh the selected home's real walking routes (Walk view visual). Reads
 * the walk cache if present; computes it when stale WITHOUT recursion. */
function refreshHomeRoutes() {
  const idx = state.selectedIdx;
  const b = idx >= 0 ? state.layout.buildings[idx] : null;
  if (!b || b.type !== 'housing') { state.homeRoutes = []; return; }
  let walk = state.walkCache;
  if (!walk || _walkDirty) {
    _walkDirty = false;
    walk = state.walkCache = computeWalkReach(state.layout);
  }
  if (!walk) { state.homeRoutes = []; return; }
  state.homeRoutes = homeReachRoutes(state.layout, walk, idx);
}

function effectiveWeights() {
  return state.goalWeights;   // null = Balanced (default fixed blend)
}

// ─── Milestones (recognition, NEVER gates) ──────────────
// Small retroactive "you did this" toasts, consistent with docs/badges-and-tiers.md:
// they celebrate a demonstrated state of the city, never gate anything, and
// never repeat (a ratchet in localStorage, like a badge that can't be lost).
const MILESTONE_KEY = 'p5_city_milestones_v1';
const MILESTONES = [
  { id: 'first_home', test: (m) => state.layout.buildings.some((b) => b.type === 'housing'), msg: '🏠 First home placed — a city needs somewhere to live!' },
  { id: 'served', test: (m) => m.coverage >= 0.999, msg: '🏘️ Every home can reach a school, shop, hospital, fire & police station!' },
  { id: 'walkable', test: (m, w) => w && w.reach >= 0.999, msg: '🚶 Every home can walk to everything it needs along real roads!' },
  { id: 'quiet', test: (m) => m.zoning >= 0.999, msg: '🤫 Peaceful — every home is away from the noise!' },
  { id: 'spread', test: (m) => m.spread >= 0.999, msg: '🧩 Mission buildings are spread across the city!' },
  { id: 'great_city', test: (m) => m.score >= 80, msg: '🌟 A great city — score 80+!' },
  { id: 'brilliant_city', test: (m) => m.score >= 95, msg: '💎 Brilliant! Score 95+ — a masterpiece of planning.' },
];
function loadMilestones() {
  try { return new Set(JSON.parse(localStorage.getItem(MILESTONE_KEY) || '[]')); } catch { return new Set(); }
}
function checkMilestones(m, walk) {
  const won = loadMilestones();
  for (const ms of MILESTONES) {
    if (won.has(ms.id)) continue;
    let pass = false;
    try { pass = ms.test(m, walk); } catch { pass = false; }
    if (!pass) continue;
    won.add(ms.id);
    toast(ms.msg);
  }
  try { localStorage.setItem(MILESTONE_KEY, JSON.stringify([...won])); } catch { /* ignore */ }
}

function updateMetrics() {
  const weights = effectiveWeights();
  const walk = computeWalkState();
  const m = computeMetrics(state.layout, undefined, weights, walk, currentLang());
  state.lastMetrics = m;
  const scoreNum = scoreEl.querySelector('.score-num');
  if (scoreNum) scoreNum.textContent = m.score;
  scoreEl.style.setProperty('--pct', String(m.score));
  updateGoalsLive(m);
  checkMilestones(m, walk);

  // Per-home happiness (services + utilities + park within straight range).
  state.homeHappy = state.layout.buildings.map((b) => {
    if (b.type !== 'housing') return null;
    let served = 0;
    for (const o of state.layout.buildings) {
      if (o === b) continue;
      const d = Math.hypot(b.pos[0] - o.pos[0], b.pos[1] - o.pos[1]);
      if (METRIC_PARAMS.serviceTypes.includes(o.type) && d <= METRIC_PARAMS.coverageDist) served++;
      if (METRIC_PARAMS.utilityTypes.includes(o.type) && d <= METRIC_PARAMS.utilityDist) served++;
    }
    const park = state.layout.parks.some((p) =>
      Math.hypot(b.pos[0] - p.cx, b.pos[1] - p.cz) <= METRIC_PARAMS.coverageDist);
    if (park) served++;
    return served / 9;
  });
  // Per-home walk reach (indexes align: homes iterate in order).
  state.homeWalk = state.layout.buildings.map(() => null);
  let hi = 0;
  state.layout.buildings.forEach((b, idx) => {
    if (b.type === 'housing' && walk.homes[hi] != null) {
      state.homeWalk[idx] = walk.homes[hi].reach;
      hi++;
    } else if (b.type === 'housing') {
      hi++;
    }
  });

  renderGoalList(m);
  problemsEl.innerHTML = '';
  for (const p of m.problems) {
    const el = document.createElement('p');
    el.textContent = '⚠️ ' + p;
    problemsEl.appendChild(el);
  }
  renderSelectedInfo();
  requestRender();
}

function starHTML(n) {
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= n ? '★' : '☆';
  return out;
}

function renderGoalList(m) {
  goalList.innerHTML = '';
  for (const g of GOAL_KEYS) {
    const meta = GOAL_META[g];
    const val = m.goals[g] || 0;
    const s = stars(val);
    const hint = m.goalHints[g];
    // Happy-goal chips: one per missing service, showing how many homes need
    // it. Rendered from the structured counts metrics provides.
    const missing = (g === 'happy' && m.missingServices) ? m.missingServices : null;
    const missingKeys = missing ? Object.keys(missing).filter((k) => missing[k] > 0) : [];
    const chips = (missingKeys.length && s < 3) ? missingKeys.map((k) => {
      const spec = CATALOG[k];
      return `<button class="goal-chip" type="button" data-type="${k}" title="${L('planner.chipPlace', { name: spec?.name || k })}">${spec?.emoji || '🏗️'} <b>${missing[k]}</b></button>`;
    }).join('') : '';
    const row = document.createElement('div');
    row.className = 'goal-row';
    row.innerHTML = `
      <div class="goal-line">
        <span class="goal-emoji">${meta.emoji}</span>
        <span class="goal-name">${goalDisplayName(g)}</span>
        <span class="goal-stars" title="${Math.round(val * 100)}%">${starHTML(s)}</span>
      </div>
      ${hint && s < 3 && !chips ? `<div class="goal-hint">💡 ${hint}</div>` : ''}
      ${chips ? `<div class="goal-chips"><span class="goal-chips-label">${t('planner.homesNeed')}</span>${chips}</div>` : ''}
    `;
    // Tap a chip → select that facility by clicking the drawer's own button
    // (single source of truth — the same handler the child uses on the
    // catalog, so selection + tool + hint stay consistent forever).
    row.querySelectorAll('.goal-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const type = b.dataset.type;
        const drawerBtn = catalogList.querySelector(`.cat-btn[data-type="${CSS.escape(type)}"]`);
        if (drawerBtn) drawerBtn.click();
      });
    });
    goalList.appendChild(row);
  }
}

// ─── Selected building: lock / remove ───────────────────
function renderSelectedInfo() {
  const idx = state.selectedIdx;
  const b = idx >= 0 ? state.layout.buildings[idx] : null;
  if (!b) { selectedInfo.innerHTML = ''; state.homeRoutes = []; return; }
  refreshHomeRoutes();
  const spec = typeSpec(b.type);
  const name = spec?.name || b.type;
  const locked = !!b.locked;
  selectedInfo.innerHTML = `
    <div class="sel-title">${spec?.emoji || ''} ${name}${locked ? ' 🔒' : ''}</div>
    <div class="sel-actions">
      <button id="sel-lock" class="sel-btn ${locked ? 'locked' : ''}">${locked ? t('planner.selected.unlock') : t('planner.selected.lock')}</button>
      <button id="sel-delete" class="sel-btn">${t('planner.selected.remove')}</button>
    </div>`;
  document.getElementById('sel-lock').addEventListener('click', toggleLock);
  document.getElementById('sel-delete').addEventListener('click', () => deleteSelectedOrClear());
}

function toggleLock() {
  const b = state.layout.buildings[state.selectedIdx];
  if (!b) return;
  pushUndo();
  b.locked = !b.locked;
  _walkDirty = true;
  updateMetrics();
  render();
  toast(b.locked
    ? L('planner.toast.locked', { name: typeSpec(b.type)?.name || t('planner.name.thisBuilding') })
    : t('planner.toast.unlocked'));
}

// ─── Goals modal (mayor personas + custom sliders) ─────
function openGoalsModal() {
  renderMayorCards();
  renderSliders();
  updateGoalsTabs();
  goalsModal.classList.remove('hidden');
  updateGoalsLive(state.lastMetrics);
}

/**
 * Live re-weighting feedback inside the Goals modal: as the child drags a
 * slider or picks a mayor, show the City Score they would get right now (not
 * after closing the modal). A short pulse on change makes the consequence
 * visible — this is "changing the weight changes the judgement" made tangible.
 */
function updateGoalsLive(m) {
  const liveValue = document.getElementById('goals-live-value');
  if (!liveValue) return;
  const metric = m || state.lastMetrics;
  if (!metric) { liveValue.textContent = '—'; return; }
  const prev = liveValue.dataset.score;
  const score = String(metric.score);
  liveValue.textContent = score;
  if (prev && prev !== score) {
    liveValue.classList.remove('pulse');
    // force reflow so the animation restarts on consecutive changes
    void liveValue.offsetWidth;
    liveValue.classList.add('pulse');
  }
  liveValue.dataset.score = score;
}

function updateGoalsTabs() {
  document.getElementById('goals-tab-mayor').classList.toggle('active', state.goalMode === 'mayor');
  document.getElementById('goals-tab-custom').classList.toggle('active', state.goalMode === 'custom');
  document.getElementById('goals-mayor-pane').classList.toggle('hidden', state.goalMode !== 'mayor');
  document.getElementById('goals-custom-pane').classList.toggle('hidden', state.goalMode !== 'custom');
}

function renderMayorCards() {
  mayorGrid.innerHTML = '';
  for (const id of Object.keys(MAYORS)) {
    const m = MAYORS[id];
    const card = document.createElement('button');
    card.className = 'mayor-card' + (state.mayorId === id ? ' selected' : '');
    card.dataset.mayor = id;
    card.innerHTML = `
      <div class="mayor-emoji">${m.emoji}</div>
      <div class="mayor-name">${mayorName(id)}</div>
      <div class="mayor-brief">${mayorBrief(id)}</div>`;
    card.addEventListener('click', () => {
      state.goalMode = 'mayor';
      state.mayorId = id;
      state.goalWeights = { ...m.weights };
      renderMayorCards();
      updateGoalsTabs();
      updateMetrics();
    });
    mayorGrid.appendChild(card);
  }
  const balanced = document.getElementById('btn-mayor-balanced');
  if (balanced) balanced.classList.toggle('selected', state.mayorId === null);
}

// Sliders are RELATIVE importance, not four independent 0–100% toggles: the
// goal weights are re-normalised before scoring (normalizeWeights), so only the
// proportions matter. Showing the raw 0–100 value next to each slider misleads
// a child into thinking "Happy = 100" means the whole score is Happy, when it
// is really Happy ≈ 100/total. We therefore display each goal's live SHARE of
// the total (they always add up to 100%), while the slider position keeps its
// familiar 0–100 "how much this matters" range.
function sliderShares() {
  const sum = GOAL_KEYS.reduce((s, g) => s + (state.sliderVals[g] || 0), 0);
  if (!(sum > 0)) return GOAL_KEYS.reduce((o, g) => { o[g] = 0; return o; }, {});
  const out = {};
  for (const g of GOAL_KEYS) out[g] = Math.round(((state.sliderVals[g] || 0) / sum) * 100);
  return out;
}

function updateSliderShareLabels() {
  const shares = sliderShares();
  sliderList.querySelectorAll('.slider-val').forEach((el) => {
    const g = el.dataset.val;
    el.textContent = (shares[g] || 0) + '%';
  });
}

function renderSliders() {
  sliderList.innerHTML = '';
  const base = state.goalWeights || state.sliderVals;
  const vals = {};
  for (const g of GOAL_KEYS) {
    vals[g] = Math.round((base[g] != null ? base[g] : 0.25) * 100);
  }
  for (const g of GOAL_KEYS) {
    const meta = GOAL_META[g];
    const wrap = document.createElement('div');
    wrap.className = 'slider-row';
    wrap.innerHTML = `
      <div class="slider-label"><span class="slider-emoji">${meta.emoji}</span> ${goalDisplayName(g)}</div>
      <input type="range" min="0" max="100" value="${vals[g]}" class="goal-slider" data-goal="${g}" aria-label="${L('planner.goals.sliderAria', { name: goalDisplayName(g) })}">
      <span class="slider-val" data-val="${g}">…</span>`;
    wrap.querySelector('.goal-slider').addEventListener('input', (e) => {
      const goal = e.target.dataset.goal;
      state.sliderVals[goal] = Number(e.target.value);
      state.goalMode = 'custom';
      state.goalWeights = { ...state.sliderVals };
      updateSliderShareLabels();
      updateGoalsTabs();
      updateMetrics();
    });
    sliderList.appendChild(wrap);
  }
  updateSliderShareLabels();
}

function closeGoalsModal() {
  goalsModal.classList.add('hidden');
}

// ─── Score receipt (weighted-sum breakdown) ─────────────
const RECEIPT_META = [
  { key: 'accessibility', emoji: '🛣️', name: 'Easy to get around', hint: 'Buildings within 60m of a road.' },
  { key: 'coverage', emoji: '🏘️', name: 'Homes have services', hint: 'Homes within 150m of school/shop/hospital/fire/police.' },
  { key: 'utilities', emoji: '💧', name: 'Water, power & buses', hint: 'Homes within 400m of water/power/bus.' },
  { key: 'zoning', emoji: '🤫', name: 'Quiet & safe', hint: 'Noisy buildings kept away from homes.' },
  { key: 'spread', emoji: '🧩', name: 'Spread out', hint: 'Mission buildings not clustered together.' },
  { key: 'balance', emoji: '⚖️', name: 'Good mix', hint: 'A sensible mix of different buildings.' },
];

function openReceipt() {
  const m = state.lastMetrics || computeMetrics(state.layout, undefined, effectiveWeights(), computeWalkState(), currentLang());
  const weights = effectiveWeights();
  // Resolve the metric-level weights actually used (default blend or mayor/custom).
  const mw = weights ? normalizeWeights(weights) : defaultMetricWeights();
  const rows = RECEIPT_META.map((r) => {
    const raw = m[r.key] || 0;
    const w = mw[r.key] || 0;
    const points = raw * w * 100;
    return `<button class="receipt-row" data-metric="${r.key}">
      <span class="receipt-emoji">${r.emoji}</span>
      <span class="receipt-name">${receiptName(r.key)}</span>
      <span class="receipt-math">${Math.round(raw * 100)}% × ${Math.round(w * 100)}%</span>
      <span class="receipt-points">${points.toFixed(1)}</span>
    </button>`;
  }).join('');
  document.getElementById('receipt-total').textContent = m.score;
  document.getElementById('receipt-list').innerHTML = rows;
  const note = weights
    ? t('planner.receipt.noteCustom')
    : t('planner.receipt.noteDefault');
  document.getElementById('receipt-note').innerHTML = note;
  // "What raises my score fastest?" — the same greedy single-move search behind
  // My move, surfaced in the receipt so the score breakdown becomes a plan.
  renderReceiptFastest(weights);
  const modal = document.getElementById('receipt-modal');
  modal.classList.remove('hidden');
  modal.querySelectorAll('[data-receipt-close]').forEach((el) => el.addEventListener('click', closeReceipt));
  modal.querySelectorAll('.receipt-row').forEach((row) => {
    row.addEventListener('click', () => {
      const metric = row.dataset.metric;
      // Jump to the view that visualises this part.
      if (metric === 'coverage' || metric === 'utilities') setViewMode('ranges');
      else if (metric === 'accessibility') setViewMode('ranges');
      else setViewMode('happy');
      toast(`💡 ${receiptHint(metric)}`);
    });
  });
}

function closeReceipt() {
  document.getElementById('receipt-modal').classList.add('hidden');
}

/**
 * Receipt → predictor: run the SAME greedy proposeMoves search that powers
 * "My move", take the single best move, and offer it. If nothing improves the
 * score, say so honestly (the city may already be at a good place for these
 * goals — or stuck, which the Optimise/Explore step in Sprint 3 handles).
 */
function renderReceiptFastest(weights) {
  const host = document.getElementById('receipt-fastest');
  if (!host) return;
  host.innerHTML = '';
  if (!state.layout.buildings.length) return;
  let best = null;
  try {
    const seed = 7;   // deterministic — the exact move is illustrative, not unique
    const moves = proposeMoves(state.layout, { weights }, 1, seed);
    best = moves[0] || null;
  } catch (e) { best = null; }
  if (!best) {
    host.classList.remove('hidden');
    host.innerHTML = `<div class="ff-line">${t('planner.receipt.fastestNone')}</div>`;
    return;
  }
  const delta = best.deltaScore > 0 ? `+${best.deltaScore}` : String(best.deltaScore);
  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="ff-line"><span>🚀 ${t('planner.receipt.fastestLabel')}</span></div>
    <button class="ff-move" id="receipt-fastest-btn" type="button">
      <span class="ff-emoji">${moveEmoji(best)}</span>
      <span class="ff-text">${localizedReason(best)}</span>
      <span class="ff-delta">${delta}</span>
    </button>`;
  const btn = document.getElementById('receipt-fastest-btn');
  if (btn) btn.addEventListener('click', () => {
    closeReceipt();
    runMyMove();
  });
}

/** Emoji hint for a proposed move (add/move/remove/add_park). */
function moveEmoji(m) {
  if (m.action === 'add_park') return '🌳';
  if (m.action === 'remove') return '🗑️';
  if (m.action === 'move') return '🚚';
  return '🏗️';
}

// ─── First-run coach ────────────────────────────────────
const COACH_KEY = 'p5_city_planner_coach_v1';
function maybeShowCoach() {
  let seen = false;
  try { seen = localStorage.getItem(COACH_KEY) === '1'; } catch (e) { /* ignore */ }
  if (seen) return;
  const modal = document.getElementById('coach-modal');
  modal.classList.remove('hidden');
  modal.querySelectorAll('[data-coach-close]').forEach((el) => el.addEventListener('click', dismissCoach));
  document.getElementById('coach-done').addEventListener('click', dismissCoach);
}
function dismissCoach() {
  document.getElementById('coach-modal').classList.add('hidden');
  try { localStorage.setItem(COACH_KEY, '1'); } catch (e) { /* ignore */ }
}

// ─── Optimise flow (full auto) ──────────────────────────
/**
 * Localize an optimizer "reason" sentence (diff row or proposed move). These
 * originate in shared city-common/optimize.js as English templates; we map each
 * one back to its category and re-render it in zh-Hant at display time, falling
 * back to the original English text for anything unrecognised (so EN is always
 * byte-for-byte the string the app shows today).
 */
function localizedReason(item) {
  if (currentLang() !== 'zh-Hant') return item.reason;
  const what = item.what;
  const name = what === 'housing' ? t('planner.type.housing') : (typeSpec(what)?.name || what);
  const useName = (k) => L(k, { name });
  if (item.action === 'add_park') return t('planner.reason.addPark');
  if (item.action === 'add') {
    if (what === 'housing') return t('planner.reason.addHousing');
    if (METRIC_PARAMS.utilityTypes.includes(what)) return useName('planner.reason.addUtility');
    return useName('planner.reason.addService');
  }
  if (item.action === 'remove') {
    return isSpecial(what) ? useName('planner.reason.removeSpecial') : useName('planner.reason.removeExtra');
  }
  if (item.action === 'move') {
    if (what === 'power') return t('planner.reason.movePower');
    const metric = item.reasonMetric || (Array.isArray(item.improved) && item.improved.length ? item.improved[0] : null);
    if (metric === 'accessibility' || metric === 'coverage') return useName('planner.reason.moveAccess');
    if (metric === 'zoning') return useName('planner.reason.moveZoning');
    if (metric === 'spread') return useName('planner.reason.moveSpread');
    if (metric === 'utilities') return useName('planner.reason.moveUtility');
  }
  return item.reason;
}

/**
 * Run the full optimizer. It proposes a complete plan; the student reviews and
 * applies. This is the "check my work" assistant — never auto-applies.
 */
async function askOptimise() {
  if (state.aiBusy) return;
  state.aiBusy = true;
  const btn = document.getElementById('btn-ai');
  btn.disabled = true;
  btn.textContent = t('planner.opt.checking');
  try {
    await new Promise((r) => setTimeout(r, 0));
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const weights = effectiveWeights();
    // Run BOTH strategies so the child can compare the plans side by side via
    // the strategy chips. Greedy is fast; Explore adds fresh-start restarts.
    const greedyRes = optimizeLayout(state.layout, { weights }, seed);
    const exploreRes = optimizeLayout(state.layout, { weights, strategy: 'explore' }, seed);
    state.lastPlans = {
      greedy: { layout: greedyRes.layout, diff: greedyRes.diff, before: greedyRes.before, after: greedyRes.after, strategy: 'greedy' },
      explore: { layout: exploreRes.layout, diff: exploreRes.diff, before: exploreRes.before, after: exploreRes.after, strategy: 'explore' },
    };
    state.activeStrategy = 'greedy';   // show the familiar plan first
    _pendingPlan = state.lastPlans.greedy;
    renderPlan(state.lastPlans.greedy.before, state.lastPlans.greedy.after, state.lastPlans.greedy.diff, 'greedy');

    if (!greedyRes.diff.length && !exploreRes.diff.length) {
      toast(t('planner.opt.nothing'));
    } else {
      const active = state.lastPlans[state.activeStrategy];
      const addN = active.diff.filter((d) => d.action === 'add').length;
      const moveN = active.diff.filter((d) => d.action === 'move').length;
      const remN = active.diff.filter((d) => d.action === 'remove').length;
      const parkN = active.diff.filter((d) => d.action === 'add_park').length;
      const parts = [];
      if (addN) parts.push(L('planner.opt.countAdd', { n: addN }));
      if (moveN) parts.push(L('planner.opt.countMove', { n: moveN }));
      if (remN) parts.push(L('planner.opt.countRemove', { n: remN }));
      if (parkN) parts.push(L(parkN > 1 ? 'planner.opt.countPark' : 'planner.opt.countPark1', { n: parkN }));
      toast(L('planner.opt.found', { parts: parts.length ? parts.join(', ') : t('planner.opt.few') }));
    }
  } catch (e) {
    console.error('[planner] optimise failed:', e);
    aiOutput.innerHTML = buddyMsg('planner.buddy.optimiser', 'planner.opt.error');
    _pendingPlan = null;
  } finally {
    state.aiBusy = false;
    btn.disabled = false;
    btn.textContent = t('planner.optimise');
  }
}

/** Child picks Greedy or Explore from the plan modal chips — re-show that plan. */
function showStrategy(strategy) {
  if (!state.lastPlans || !state.lastPlans[strategy]) return;
  state.activeStrategy = strategy;
  _pendingPlan = state.lastPlans[strategy];
  const p = state.lastPlans[strategy];
  renderPlan(p.before, p.after, p.diff, strategy);
}

// ─── My move flow (be the planner) ──────────────────────
const REASON_CHIPS = [
  { id: 'coverage', label: 'More homes within 150m of a service' },
  { id: 'accessibility', label: 'Shorter walk to a road' },
  { id: 'zoning', label: 'Quieter for homes' },
  { id: 'spread', label: 'Buildings more spread out' },
  { id: 'utilities', label: 'Water / power / bus closer' },
  { id: 'balance', label: 'Better mix of buildings' },
  { id: 'green', label: 'More green space near homes' },
];
const REASON_METRIC = { coverage: 'coverage', accessibility: 'accessibility', zoning: 'zoning', spread: 'spread', utilities: 'utilities', balance: 'balance', green: 'green' };

/**
 * "My move": the planner proposes up to 3 candidate moves. The student must
 * predict which will raise the score most AND why (reason chip), then Reveal
 * shows the actual maths and the greedy choice. This is the learning core.
 */
async function runMyMove() {
  if (state.aiBusy) return;
  state.aiBusy = true;
  const btn = document.getElementById('btn-step');
  btn.disabled = true;
  btn.textContent = t('planner.mymove.thinking');
  try {
    await new Promise((r) => setTimeout(r, 0));
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const weights = effectiveWeights();
    const moves = proposeMoves(state.layout, { weights }, 3, seed);
    if (!moves.length) {
      toast(t('planner.mymove.nothing'));
      return;
    }
    state.mymove = { moves, chosenMove: -1, chosenReason: null, revealed: false, weights };
    renderMyMovePredict();
  } catch (e) {
    console.error('[planner] my move failed:', e);
    toast(t('planner.mymove.error'));
  } finally {
    state.aiBusy = false;
    btn.disabled = false;
    btn.textContent = t('planner.mymove');
  }
}

function renderMyMovePredict() {
  const body = document.getElementById('mymove-body');
  const { moves } = state.mymove;
  const goalKey = topGoalKey();
  body.innerHTML = `
    <div class="mymove-intro">${t('planner.mymove.introPre')}<strong>${t('planner.mymove.introStrong')}</strong>${t('planner.mymove.introPost')}</div>
    <div class="mymove-question">${t('planner.mymove.questionPre')}<strong>${goalDisplayName(goalKey)}</strong>${t('planner.mymove.questionPost')}</div>
    ${moves.map((m, i) => `
      <button class="move-card" data-move="${i}">
        <div>${moveLabel(m)}</div>
        <div class="move-reason">${localizedReason(m)}</div>
      </button>`).join('')}
    <div class="reason-label">${t('planner.mymove.reasonLabel')}</div>
    <div class="reason-chips">
      ${REASON_CHIPS.map((r) => `<button class="reason-chip" data-reason="${r.id}">${reasonChipLabel(r.id)}</button>`).join('')}
    </div>
    <div class="goals-actions">
      <button id="mymove-reveal" class="plan-apply" disabled>${t('planner.mymove.reveal')}</button>
      <button id="mymove-cancel" class="plan-keep">${t('planner.mymove.cancel')}</button>
    </div>`;
  body.querySelectorAll('.move-card').forEach((el) => {
    el.addEventListener('click', () => {
      state.mymove.chosenMove = Number(el.dataset.move);
      body.querySelectorAll('.move-card').forEach((c) => c.classList.toggle('selected', c === el));
      updateRevealEnabled();
    });
  });
  body.querySelectorAll('.reason-chip').forEach((el) => {
    el.addEventListener('click', () => {
      state.mymove.chosenReason = el.dataset.reason;
      body.querySelectorAll('.reason-chip').forEach((c) => c.classList.toggle('selected', c === el));
      updateRevealEnabled();
    });
  });
  document.getElementById('mymove-reveal').addEventListener('click', renderMyMoveReveal);
  document.getElementById('mymove-cancel').addEventListener('click', () => {
    state.mymove = null;
    closeMyMove();
    toast(t('planner.toast.keptAsIs'));
  });
  const modal = document.getElementById('mymove-modal');
  modal.classList.remove('hidden');
}

function updateRevealEnabled() {
  const reveal = document.getElementById('mymove-reveal');
  if (reveal) reveal.disabled = !(state.mymove.chosenMove >= 0 && state.mymove.chosenReason);
}

function renderMyMoveReveal() {
  const body = document.getElementById('mymove-body');
  const { moves, chosenMove, chosenReason } = state.mymove;
  const chosen = moves[chosenMove];
  const best = moves[0];   // sorted by deltaScore desc = greedy pick
  const strictBest = chosenMove === 0;
  // Near-tie tolerance: a move within a small band of the greedy best is still
  // a correct prediction. Hybrid band so tiny deltas (0.3) don't get an
  // absurdly tight band and big deltas (20) don't get an overly generous one.
  const tieBand = Math.max(0.5, 0.10 * best.deltaScore);
  const nearBest = chosen.deltaScore >= best.deltaScore - tieBand;
  // The reason is correct when the picked chip matches ANY metric that rose —
  // or, if nothing measurable rose (defensive), the metric this move's own
  // reason narrates. Every proposed move carries `reasonMetric`, so the reason
  // question always has an answerable path.
  const reasonTarget = chosen.improved.length ? chosen.improved : (chosen.reasonMetric ? [chosen.reasonMetric] : []);
  const reasonCorrect = reasonTarget.includes(REASON_METRIC[chosenReason]);

  let banner, bannerCls;
  if (strictBest && reasonCorrect) { banner = t('planner.mymove.goodSpot'); bannerCls = 'good'; }
  else if (strictBest) { banner = t('planner.mymove.mehBest'); bannerCls = 'meh'; }
  else if (nearBest && reasonCorrect) { banner = t('planner.mymove.goodNear'); bannerCls = 'good'; }
  else if (nearBest) { banner = t('planner.mymove.mehNear'); bannerCls = 'meh'; }
  else if (reasonCorrect) { banner = t('planner.mymove.mehReason'); bannerCls = 'meh'; }
  else { banner = t('planner.mymove.mehNone'); bannerCls = 'meh'; }

  body.innerHTML = `
    <div class="reveal-correct ${bannerCls}">
      ${banner}
    </div>
    <div class="mymove-question">${t('planner.mymove.changedFor')}<strong>${moveLabel(chosen)}</strong>${t('planner.mymove.changedForPost')}</div>
    <div class="reveal-receipt">${receiptDeltaHTML(chosen, chosenReason, reasonCorrect)}</div>
    ${chosenMove !== 0 ? `<div class="reveal-greedy">
      <strong>${t('planner.mymove.greedyPick')}</strong> ${moveLabel(best)} (${L('planner.scoreDelta', { n: (best.deltaScore > 0 ? '+' : '') + best.deltaScore })}).${t('planner.mymove.greedyWhy')}
    </div>` : ''}
    <div class="reveal-greedy">
      <strong>${t('planner.mymove.ruleTitle')}</strong> ${t('planner.mymove.ruleBody')}
    </div>
    <div class="goals-actions">
      <button id="mymove-apply" class="plan-apply">${t('planner.mymove.apply')}</button>
      <button id="mymove-skip" class="plan-keep">${t('planner.mymove.skip')}</button>
      <button id="mymove-finish" class="plan-finish">${t('planner.mymove.finish')}</button>
    </div>`;
  document.getElementById('mymove-apply').addEventListener('click', applyMyMove);
  document.getElementById('mymove-skip').addEventListener('click', () => {
    state.mymove = null;
    closeMyMove();
    toast(t('planner.toast.skipped'));
  });
  document.getElementById('mymove-finish').addEventListener('click', () => {
    state.mymove = null;
    closeMyMove();
    askOptimise();
  });
  // Highlight the selected move on the map.
  flashOneMove(chosen);
}

function applyMyMove() {
  const { moves, chosenMove } = state.mymove;
  const move = moves[chosenMove];
  const oldLayout = state.layout;
  pushUndo();
  state.layout = applyMove(state.layout, move);
  state.selectedIdx = -1;
  updateMetrics();
  render();
  flashOneMove(move);
  closeMyMove();
  toast(L('planner.toast.applied', {
    label: moveLabel(move),
    before: move.beforeScore,
    after: move.afterScore,
  }));
  state.mymove = null;
}

function flashOneMove(move) {
  const marks = [];
  if (move.action === 'remove' && move.from) marks.push({ x: move.from[0], z: move.from[1], color: '#ff5c5c' });
  else if (move.action === 'add' && move.to) marks.push({ x: move.to[0], z: move.to[1], color: '#3ddc84' });
  else if (move.action === 'move' && move.to) marks.push({ x: move.to[0], z: move.to[1], color: '#00b7ff' });
  if (!marks.length) { render(); return; }
  const end = Date.now() + 1600;
  function drawFlash() {
    render();
    for (const mk of marks) {
      const c = planToScreen(mk.x, mk.z);
      const s = 24;
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

function moveLabel(m) {
  const name = m.what === 'housing' ? t('planner.movelabel.homeName') : (typeSpec(m.what)?.name || m.what);
  if (m.action === 'add') return L('planner.movelabel.add', { name });
  if (m.action === 'move') return L('planner.movelabel.move', { name });
  if (m.action === 'remove') return L('planner.movelabel.remove', { name });
  if (m.action === 'add_park') return t('planner.movelabel.addPark');
  return t('planner.movelabel.other');
}

function receiptDeltaHTML(move, chosenReason, reasonCorrect) {
  const metricLabelEn = { accessibility: 'walk to a road', coverage: 'schools/shops/help nearby', utilities: 'water/power/bus', zoning: 'quiet for homes', spread: 'spread out', balance: 'building mix', green: 'parks' };
  const metricEmoji = { accessibility: '🛣️', coverage: '🏘️', utilities: '💧', zoning: '🤫', spread: '🧩', balance: '⚖️', green: '🌳' };
  const metricLabel = (m) => (currentLang() !== 'zh-Hant' ? (metricLabelEn[m] || m) : t('planner.mm.metric.' + m));
  const lines = move.improved.length ? move.improved.map((m) => {
    return `<div class="rr-line"><span>${metricEmoji[m] || ''} ${metricLabel(m)}</span><span class="rr-up">${t('planner.mm.improved')}</span></div>`;
  }) : [];
  // The ✓/✗ badge must use the SAME correctness answer as the banner above
  // (which falls back to reasonMetric when `improved` is empty).
  const reasonBadge = chosenReason
    ? `<div class="rr-line"><span>${L('planner.mm.yourReason', { label: reasonChipLabel(chosenReason) })}</span><span class="${reasonCorrect ? 'rr-up' : 'rr-down'}">${reasonCorrect ? t('planner.mm.right') : t('planner.mm.wrong')}</span></div>`
    : '';
  return `
    <div class="rr-line"><strong>${t('planner.score.label')}</strong><strong>${move.beforeScore} → ${move.afterScore} (+${move.deltaScore})</strong></div>
    ${reasonBadge}
    ${lines.join('')}`;
}

function topGoalKey() {
  // The student's most-weighted goal is the "target" for the prediction question.
  const w = state.goalWeights || null;
  if (w) {
    const top = GOAL_KEYS.slice().sort((a, b) => (w[b] || 0) - (w[a] || 0))[0];
    return top || 'happy';
  }
  return 'happy';
}

function reasonChipLabel(id) {
  if (currentLang() !== 'zh-Hant') {
    const found = REASON_CHIPS.find((r) => r.id === id);
    return found ? found.label : id;
  }
  return t('planner.reason.' + id);
}

function closeMyMove() {
  document.getElementById('mymove-modal').classList.add('hidden');
}

// ─── Export ─────────────────────────────────────────────
function serializeLayout() {
  // The 3D city used to receive only static geometry. Since the planner is the
  // place the child actually "does AI" (weighs goals, picks a mayor, watches the
  // optimiser), we now carry that context forward so the 3D city and the Coding
  // Buddy can talk about the child's own AI choices. Extra keys are ignored by
  // older sanitizers — fully backward compatible.
  let goals = null;
  if (state.goalWeights) {
    const persona = state.goalMode === 'mayor' && state.mayorId && MAYORS[state.mayorId]
      ? MAYORS[state.mayorId]
      : null;
    goals = {
      weights: normalizeWeights(state.goalWeights),
      label: persona ? persona.name : 'Custom goals',
      emoji: persona ? persona.emoji : '⚖️',
    };
  }
  const plannerScore =
    state.lastMetrics && Number.isFinite(state.lastMetrics.score)
      ? Math.round(state.lastMetrics.score)
      : null;

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
      ...(b.locked ? { locked: true } : {}),
    })),
    ...(goals ? { goals } : {}),
    ...(plannerScore !== null ? { plannerScore } : {}),
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
  // Save to localStorage — the SAME origin now serves the 3D city, so this IS
  // the handoff (no file download/upload round-trip). Then walk into it.
  let savedToStorage = false;
  try { localStorage.setItem(STORAGE_KEY, json); savedToStorage = true; } catch (e) { /* quota — fall back below */ }
  if (!savedToStorage) {
    // Storage full / blocked — fall back to a download so the student can still
    // reach the 3D city by uploading the file there.
    downloadLayout(json);
    toast(t('planner.export.storageFull'));
    return;
  }
  const roadsCount = state.layout.roads.length;
  const noRoadsNote = roadsCount === 0
    ? t('planner.export.noRoads')
    : '';
  toast(L('planner.export.saved', {
    b: state.layout.buildings.length,
    r: roadsCount,
    p: state.layout.parks.length,
    note: noRoadsNote,
  }));
  // Primary CTA: the 3D city auto-loads the saved layout (?from=planner).
  window.location.href = '/city-builder/?from=planner';
}

/** Optional backup download (separate from the save-and-view flow). */
function downloadLayout(json) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-ai-city.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Champion File save (named download — the cross-device backup) ───────────
// "💾 Save my city" bundles EVERYTHING (layout + quests + props + skin + flags)
// into one file the student names, so they can restore it on any device next
// lesson. This restores the old forced-download safety net, but named + complete.
function downloadChampionFile(label) {
  const file = composeChampionFile(collectState(), label);
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = championFilename(label);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  rememberSavedAt();   // resume surface: "last saved …"
  toast(L('planner.save.champion', { label }));
}

function wireSaveModal() {
  const modal = document.getElementById('save-modal');
  const nameInput = document.getElementById('save-name');
  const saveBtn = document.getElementById('btn-save');
  const goBtn = document.getElementById('save-go');
  if (!modal || !nameInput || !saveBtn || !goBtn) return;
  const open = () => {
    // Prefill from the last-used name, else a friendly default.
    try {
      const last = localStorage.getItem('p5_city_save_name_v1');
      if (last) nameInput.value = last;
    } catch { /* ignore */ }
    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  };
  const close = () => modal.classList.add('hidden');
  const doSave = () => {
    const name = nameInput.value.trim() || 'my-ai-city';
    try { localStorage.setItem('p5_city_save_name_v1', name); } catch { /* ignore */ }
    downloadChampionFile(name);
    close();
  };
  saveBtn.addEventListener('click', open);
  goBtn.addEventListener('click', doSave);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
  modal.querySelectorAll('[data-save-close]').forEach((el) => el.addEventListener('click', close));
}

/** Import a Champion File (restore everything) or a legacy layout JSON. Returns true if handled. */
function importAny(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  const champ = sanitizeChampionFile(parsed);
  if (champ.ok) {
    const n = writeState(champ.file.state);
    const labelSuffix = champ.file.label ? ' — ' + champ.file.label : '';
    toast(L('planner.import.restored', { label: labelSuffix, n }));
    setTimeout(() => window.location.reload(), 600);
    return true;
  }
  return false;
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
    toast(t('planner.import.notJson'));
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
  toast(L('planner.import.opened', { b: next.buildings.length, r: next.roads.length, p: next.parks.length }));
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
  green: 'parks & green space',
};
const METRIC_ICON = {
  accessibility: '🛣️', coverage: '🏘️', utilities: '💧', spread: '🧩', zoning: '🤫', balance: '⚖️', green: '🌳',
};

function metricBadges(improved) {
  if (!improved || !improved.length) return '';
  return ' <span class="metric-badges">' +
    improved.map((m) => `<span class="metric-badge">${METRIC_ICON[m] || ''} ${metricLabelFor(m)} ↑</span>`).join('') +
    '</span>';
}

function renderPlan(before, after, diff, strategy = 'greedy') {
  // Group reasons by theme, preserving order.
  const order = ['add', 'move', 'remove', 'add_park'];
  const groups = order
    .map((action) => ({
      action,
      label: planThemeLabel(action),
      items: diff.filter((d) => d.action === action),
    }))
    .filter((g) => g.items.length);

  const gain = after.score - before.score;
  const scoreLine = gain > 0
    ? `<strong>${before.score}</strong> → <strong>${after.score}</strong> <span class="score-gain">(+${gain})</span>`
    : `${t('planner.plan.stays')}<strong>${before.score}</strong>`;

  const chips = (state.lastPlans ? `
    <div class="strategy-chips" role="radiogroup" aria-label="${t('planner.strategy.aria')}">
      <button class="strategy-chip ${strategy === 'greedy' ? 'active' : ''}" data-strategy="greedy" type="button">
        <span class="sc-emoji">⚡</span>
        <span class="sc-name">${t('planner.strategy.greedy')}</span>
        <span class="sc-desc">${t('planner.strategy.greedyDesc')}</span>
        <span class="sc-score">${state.lastPlans.greedy.after.score}</span>
      </button>
      <button class="strategy-chip ${strategy === 'explore' ? 'active' : ''}" data-strategy="explore" type="button">
        <span class="sc-emoji">🔍</span>
        <span class="sc-name">${t('planner.strategy.explore')}</span>
        <span class="sc-desc">${t('planner.strategy.exploreDesc')}</span>
        <span class="sc-score">${state.lastPlans.explore.after.score}</span>
      </button>
    </div>` : '');

  const groupsHtml = groups.map((g) => `
    <div class="plan-group">
      <div class="plan-group-title">${g.label}</div>
      <ul class="plan-list">
        ${g.items.map((d) => `<li>${localizedReason(d)}${metricBadges(d.improved)}</li>`).join('')}
      </ul>
    </div>`).join('');

  const body = document.getElementById('plan-modal-body');
  body.innerHTML = `
    ${chips}
    <div class="plan-intro">${t('planner.plan.intro')} ${strategy === 'explore' ? t('planner.plan.introExplore') : ''}</div>
    <div class="plan-score">${t('planner.plan.scorePrefix')}${scoreLine}</div>
    ${groupsHtml || `<div class="plan-note">${t('planner.plan.nothing')}</div>`}
    ${diff.length ? `
      <div class="plan-actions">
        <button class="plan-apply" id="plan-apply">${t('planner.plan.apply')}</button>
        <button class="plan-keep" id="plan-keep">${t('planner.mymove.cancel')}</button>
      </div>` : `<div class="plan-actions"><button class="plan-keep" id="plan-keep">${t('planner.receipt.done')}</button></div>`}`;

  const modal = document.getElementById('plan-modal');
  modal.classList.remove('hidden');
  // Strategy chips: switch which plan is shown (Apply always commits the ACTIVE one).
  modal.querySelectorAll('.strategy-chip').forEach((chip) => {
    chip.addEventListener('click', () => showStrategy(chip.dataset.strategy));
  });
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
    aiOutput.innerHTML = buddyMsg('planner.buddy.optimiser', 'planner.plan.aiKept');
    toast(t('planner.toast.keptAsIs'));
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
  if (addN) parts.push(L(addN > 1 ? 'planner.plan.ctAddN' : 'planner.plan.ctAdd1', { n: addN }));
  if (moveN) parts.push(L('planner.plan.ctMove', { n: moveN }));
  if (remN) parts.push(L('planner.plan.ctRemove', { n: remN }));
  if (parkN) parts.push(L(parkN > 1 ? 'planner.plan.ctParkN' : 'planner.plan.ctPark1', { n: parkN }));
  toast(L('planner.plan.applied', { parts: parts.join(', ') }));
  aiOutput.innerHTML = buddyMsg('planner.buddy.optimiser', 'planner.plan.aiDone');
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
document.getElementById('btn-clear').addEventListener('click', deleteSelectedOrClear);
// Delete/Backspace removes the selected building (or clears when none), but
// never while the child is typing in a text field.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  e.preventDefault();
  deleteSelectedOrClear();
});
document.getElementById('btn-ai').addEventListener('click', askOptimise);
document.getElementById('btn-step').addEventListener('click', runMyMove);
document.getElementById('btn-export').addEventListener('click', exportCity);
document.querySelectorAll('.tool-btn').forEach((btn) => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// Goals modal
document.getElementById('btn-goals').addEventListener('click', openGoalsModal);
document.getElementById('goals-done').addEventListener('click', closeGoalsModal);
goalsModal.querySelectorAll('[data-goals-close]').forEach((el) => {
  el.addEventListener('click', closeGoalsModal);
});
document.getElementById('goals-tab-mayor').addEventListener('click', () => {
  state.goalMode = 'mayor';
  updateGoalsTabs();
});
document.getElementById('goals-tab-custom').addEventListener('click', () => {
  state.goalMode = 'custom';
  updateGoalsTabs();
});
document.getElementById('btn-mayor-balanced').addEventListener('click', () => {
  state.goalMode = 'mayor';
  state.mayorId = null;
  state.goalWeights = null;   // Balanced — default fixed blend
  renderMayorCards();
  updateGoalsTabs();
  updateMetrics();
});

// Happiness / walk / ranges views
const viewHappy = document.getElementById('btn-view-happy');
const viewWalk = document.getElementById('btn-view-walk');
const viewRanges = document.getElementById('btn-view-ranges');
function setViewMode(mode) {
  if (state.viewMode === mode) mode = 'normal';   // toggle off
  state.viewMode = mode;
  viewHappy.classList.toggle('active', mode === 'happy');
  viewWalk.classList.toggle('active', mode === 'walk');
  viewRanges.classList.toggle('active', mode === 'ranges');
  if (mode === 'happy') {
    hint(t('planner.hint.happy'));
  } else if (mode === 'walk') {
    const w = computeWalkState();
    hint(L('planner.hint.walk', { budget: WALK_BUDGET, pct: Math.round((w.reach || 0) * 100) }));
  } else if (mode === 'ranges') {    hint(t('planner.hint.ranges'));
  } else {
    hint(t('planner.hint.normal'));
  }
  render();
}
viewHappy.addEventListener('click', () => setViewMode('happy'));
viewWalk.addEventListener('click', () => setViewMode('walk'));
viewRanges.addEventListener('click', () => setViewMode('ranges'));

// Road template menu
const templateBtn = document.getElementById('btn-template');
renderTemplates();
templateBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  templateMenu.classList.toggle('hidden');
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
     // Champion File (restore everything) OR legacy layout JSON.
     if (!importAny(reader.result)) importCity(reader.result);
     importFileInput.value = '';   // allow re-selecting the same file later
   };
   reader.readAsText(f);
 });
 importPasteToggle.addEventListener('click', () => {
   importPasteWrap.classList.toggle('hidden');
 });
 importPasteGo.addEventListener('click', () => {
   if (importAny(importPasteBox.value) || importCity(importPasteBox.value)) {
     importMenu.classList.add('hidden');
     importPasteWrap.classList.add('hidden');
   }
 });
// Backup download — an explicit save-to-file for cross-device/copy safety.
const importBackupBtn = document.getElementById('import-backup');
if (importBackupBtn) {
  importBackupBtn.addEventListener('click', () => {
    const layout = serializeLayout();
    const v = validateLayout(layout);
    if (!v.ok) { toast('⚠️ ' + v.errors[0]); return; }
    downloadLayout(JSON.stringify(layout, null, 2));
    importMenu.classList.add('hidden');
    toast(t('planner.import.downloaded'));
  });
}

// Score receipt — tap the City Score ring.
document.getElementById('score').addEventListener('click', openReceipt);
document.getElementById('score').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReceipt(); }
});
document.getElementById('receipt-done').addEventListener('click', closeReceipt);

// ── Planner's License (unlock gate) ─────────────────────
function isUnlocked() {
  try { return localStorage.getItem(UNLOCK_STORAGE_KEY) === '1'; } catch (e) { return false; }
}

function maybeLock() {
  const overlay = document.getElementById('lock-overlay');
  if (isUnlocked() || !overlay) return;
  overlay.classList.remove('hidden');
}

function tryUnlock(raw) {
  const errEl = document.getElementById('lock-error');
  // Forgiving match: trim, ignore case, accept the key anywhere in the text.
  // A pasted/uploaded license (or a file that got wrapped in prose) still
  // unlocks. This is a soft gate for kids — never an error wall.
  const hasKey = typeof raw === 'string' && raw.toUpperCase().includes(LICENSE_KEY);
  if (hasKey) {
    try { localStorage.setItem(UNLOCK_STORAGE_KEY, '1'); } catch (e) { /* ignore */ }
    document.getElementById('lock-overlay').classList.add('hidden');
    toast(t('planner.unlock.toast'));
    aiOutput.innerHTML = buddyMsg('planner.buddy.nova', 'planner.unlock.nova');
    updateMetrics();
    render();
    return;
  }
  errEl.textContent = t('planner.unlock.error');
}

(function wireLock() {
  const overlay = document.getElementById('lock-overlay');
  if (!overlay) return;
  document.getElementById('lock-goto-academy').addEventListener('click', () => {
    // Same-origin now (unified under city-sim) — no cross-worker hop.
    window.location.href = '/pregame/';
  });
  const fileInput = document.getElementById('lock-file');
  document.getElementById('lock-upload').addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { tryUnlock(reader.result); fileInput.value = ''; };
    reader.readAsText(f);
  });
  const pasteToggle = document.getElementById('lock-paste-toggle');
  const pasteWrap = document.getElementById('lock-paste-wrap');
  pasteToggle.addEventListener('click', () => pasteWrap.classList.toggle('hidden'));
  document.getElementById('lock-paste-go').addEventListener('click', () => {
    tryUnlock(document.getElementById('lock-paste').value);
  });
})();

// My move modal close on backdrop / X.
document.querySelectorAll('#mymove-modal [data-mymove-close]').forEach((el) => {
  el.addEventListener('click', () => { state.mymove = null; closeMyMove(); });
});
// Receipt modal close on backdrop / X.
document.querySelectorAll('#receipt-modal [data-receipt-close]').forEach((el) => {
  el.addEventListener('click', closeReceipt);
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
  wireSaveModal();
  mountLangToggle('.actions');
  applyStatic();
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
  maybeLock();
  if (!document.getElementById('lock-overlay').classList.contains('hidden')) {
    // Locked — don't show the coach over the lock screen.
  } else {
    maybeShowCoach();
  }
})();
