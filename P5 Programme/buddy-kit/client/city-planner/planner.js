import { installModalOwnership, activeModal, reducedMotion as motionReduced } from '../city-common/interface.js';
installModalOwnership();
import { displayName } from '../city-common/display-names.js';
import { MAYORS, defaultGoals, mayorGoals, readGoals, serializeGoals, effectiveGoalWeights, goalToSlider, sliderToGoal } from '../city-common/planner-goals.js';
import { restoreActive, restoreChampion } from '../city-common/restore-session.js';
import { MAX_IMPORT_BYTES, withinImportLimit } from '../city-common/champion-file.js';
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
import { computeMetrics, METRIC_PARAMS, GOAL_KEYS, stars, normalizeWeights, defaultMetricWeights, METRIC_DESCRIPTORS, metricReceipt } from '../city-common/metrics.js';
import { optimizeLayout, proposeMoves, applyMove, stableSeed } from '../city-common/optimize.js';
import { readMilestones, writeMilestones, evaluateMilestones, awardMilestone, milestone } from '../city-common/milestones.js';
import { computeWalkReach, walkPath, homeReachRoutes, WALK_BUDGET } from '../city-common/walkability.js';
import { ROAD_TEMPLATES, getRoadTemplate, roadTemplateThumbnailSvg } from '../city-common/road-templates.js';
import { onRoadBuildingIndices, roadBands, rectRoadClearance, clearanceOffset, tidyRoads, sampleCatmullRom, ROAD_CLEARANCE_MARGIN, pointToSegment, detectJunctions, materializeJunctions, junctionNodes, resolveRoadSafePlacement } from '../city-common/road-geometry.js';
import { analyzeRoadTopology } from '../city-common/road-topology.js';
import { collectState, composeChampionFile, championFilename, sanitizeChampionFile, rememberSavedAt, lastSavedAt } from '../city-common/champion-file.js';
import { createSnapshotHistory } from '../city-common/command-history.js';
import { createProjectStateCoordinator } from '../city-common/project-state-coordinator.js';
import { buildSampleCity } from '../city-common/sample-city.js';
import { readExampleDraft, writeExampleDraft } from '../city-common/example-draft.js';
import { readNewCityDraft, writeNewCityDraft, resetNewCityDraft } from '../city-common/new-city-draft.js';
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
function templateNote(template) {
  const key = 'planner.template.' + template.id + '.note';
  const localized = t(key);
  // i18n returns its key for a missing string; the English catalog note is a
  // deliberate safe fallback for new templates and older language packs.
  return localized === key ? template.note : localized;
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
const exampleMode = new URLSearchParams(location.search).get('example') === '1';
const newCityMode = !exampleMode && new URLSearchParams(location.search).get('new') === '1';
const MAX_UNDO = 50;

// prefers-reduced-motion must be honoured in JS animation loops, not just CSS
// (P5-LESSON-CONVENTIONS). Under reduce, highlights/route counts render once.
const prefersReducedMotion = motionReduced;

// ─── Goal model (display) ─────────────────────────────
const GOAL_META = {
  happy: { name: 'Happy Homes', emoji: '🏘️' },
  walkable: { name: 'Easy to get around', emoji: '🚶' },
  peaceful: { name: 'Peaceful', emoji: '🤫' },
  spread: { name: 'Balanced & spread out', emoji: '🧩' },
};

// ─── State ──────────────────────────────────────────────
const state = {
  layout: defaultLayout(),
  tool: 'place',          // 'place' | 'road' | 'park' | 'select'
  selectedType: 'housing',
  selectedIdx: -1,
  view: { px: 0.18, ox: 0, oy: 0 },   // px/meter; screen offset of plan (0,0)
  gesture: null,
  aiBusy: false,
  // Goals: null weights = Balanced (default fixed blend).
  goals: defaultGoals(),
  rawBaseline: null,
  goalTab: 'mayor',
  viewMode: 'normal',     // 'normal' | 'happy' | 'walk' | 'ranges'
  walkCache: null,
  homeRoutes: [],         // homeReachRoutes for the selected home (drawn in Walk view)
  homeHappy: [],          // per-building index: 0..1 served share (null = not housing)
  homeWalk: [],           // per-building index: walk reach 0..1 (null = not housing)
  lastMetrics: null,      // most recent computeMetrics result (for receipt + deltas)
  mymove: null,           // active "My move" state (moves + student picks)
  lastPlans: null,        // { greedy:{...}, explore:{...}, active:'greedy'|'explore' }
  activeStrategy: 'greedy',
  roadMode: 'freehand',   // 'freehand' | 'straight' | 'curve'
  curvePts: [],           // in-progress curved-road control points (curve mode)
  curveCursor: null,      // live cursor for the curve preview (desktop hover)
  snap: null,             // live snap target while drawing { x, y, kind }
  connectCount: 0,        // loose joins the weld pass could fix right now
  connectAsked: false,    // the suggestion was offered once this session
  connectPreview: null,   // candidates highlighted while the connect sheet is open
};

const projectState = createProjectStateCoordinator();
const editorHistory = createSnapshotHistory({
  limit: MAX_UNDO,
  snapshot: () => ({
    layout: JSON.parse(JSON.stringify(state.layout)),
    goals: JSON.parse(JSON.stringify(state.goals)),
    // This object is immutable and may contain a multi-megabyte raw import.
    // Preserve its reference instead of duplicating it for every gesture.
    rawBaseline: state.rawBaseline,
  }),
  clone: value => ({
    layout: JSON.parse(JSON.stringify(value.layout)),
    goals: JSON.parse(JSON.stringify(value.goals)),
    rawBaseline: value.rawBaseline,
  }),
  equals: (a, b) => a.rawBaseline === b.rawBaseline
    && JSON.stringify(a.layout) === JSON.stringify(b.layout)
    && JSON.stringify(a.goals) === JSON.stringify(b.goals),
  restore: value => {
    state.layout = value.layout;
    state.goals = value.goals;
    state.rawBaseline = value.rawBaseline;
  },
  onChange: ({ canUndo, canRedo }) => {
    const undoButton = document.getElementById('btn-undo');
    const redoButton = document.getElementById('btn-redo');
    if (undoButton) undoButton.disabled = !canUndo;
    if (redoButton) redoButton.disabled = !canRedo;
  },
});

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

let dpr = 1, lastCanvasSize = null;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  if (lastCanvasSize) {
    state.view.ox += (rect.width - lastCanvasSize.width) / 2;
    state.view.oy += (rect.height - lastCanvasSize.height) / 2;
  }
  lastCanvasSize = {width:rect.width,height:rect.height};
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateZoomButtons();
  render();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);

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
const ZOOM_MIN = 0.05, ZOOM_MAX = 8;
function zoomAt(sx, sy, factor) {
  const p = screenToPlan(sx, sy);
  state.view.px = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.view.px * factor));
  state.view.ox = sx - p.x * state.view.px;
  state.view.oy = sy + p.y * state.view.px;
  updateZoomButtons();
  requestRender();
}
function updateZoomButtons() {
  const zin = document.getElementById('zoom-in');
  const zout = document.getElementById('zoom-out');
  if (zin) zin.disabled = state.view.px >= ZOOM_MAX - 1e-6;
  if (zout) zout.disabled = state.view.px <= ZOOM_MIN + 1e-6;
}
function zoomStep(factor) {
  const rect = canvas.getBoundingClientRect();
  zoomAt(rect.width / 2, rect.height / 2, factor);
}
/** Frame the whole city (buildings + roads + parks) with a margin. */
function fitView() {
  const l = state.layout;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const see = (x, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  };
  for (const b of l.buildings) {
    const fp = b.footprint || typeSpec(b.type)?.footprint || [20, 20];
    see(b.pos[0] - fp[0] / 2, b.pos[1] - fp[1] / 2);
    see(b.pos[0] + fp[0] / 2, b.pos[1] + fp[1] / 2);
  }
  for (const r of l.roads) for (const [x, z] of r.points) see(x, z);
  for (const p of l.parks) { see(p.cx - p.radius, p.cz - p.radius); see(p.cx + p.radius, p.cz + p.radius); }
  if (!Number.isFinite(minX)) { minX = 0; minZ = 0; maxX = SCALE; maxZ = SCALE; }
  const rect = canvas.getBoundingClientRect();
  const pad = 60;
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxZ - minZ);
  state.view.px = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
    Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)));
  state.view.ox = rect.width / 2 - ((minX + maxX) / 2) * state.view.px;
  state.view.oy = rect.height / 2 + ((minZ + maxZ) / 2) * state.view.px;
  updateZoomButtons();
  requestRender();
}
document.getElementById('zoom-in')?.addEventListener('click', (e) => { e.preventDefault(); zoomStep(1.25); });
document.getElementById('zoom-out')?.addEventListener('click', (e) => { e.preventDefault(); zoomStep(1 / 1.25); });
document.getElementById('zoom-fit')?.addEventListener('click', (e) => { e.preventDefault(); fitView(); });

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
  drawRoadNodes(w, h);
  if (state.viewMode === 'ranges') drawRanges(w, h);
  drawWalkRoutes(w, h);
  drawBuildings(w, h);
  drawSelectionAffordance(w, h);
  drawGesture(w, h);
  if (document.activeElement === canvas && showKeyboardCursor) {
    const p=planToScreen(keyCursor.x,keyCursor.y);ctx.strokeStyle='#ffbf47';ctx.lineWidth=3;ctx.strokeRect(p.x-9,p.y-9,18,18);
  }
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
 * Overlay the road network's structure: a dot at every real shared vertex (the
 * node/intersection a weld created), a snap ring while a join is in reach, and
 * pulsing rings on the candidates the connect sheet is offering to fix.
 */
function drawRoadNodes(w, h) {
  const zoom = state.view.px;
  // Junction nodes — only when they'd be readable.
  if (zoom > 0.05) {
    const r = Math.max(2.5, Math.min(6, 2.5 / zoom + 2));
    for (const n of junctionNodes(state.layout.roads)) {
      const s = planToScreen(n.x, n.z);
      if (s.x < -20 || s.x > w + 20 || s.y < -20 || s.y > h + 20) continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0b7d8f';
      ctx.fill();
      ctx.strokeStyle = 'rgba(214,251,255,0.95)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // Candidate joins the connect sheet is offering.
  if (state.connectPreview) {
    for (const c of state.connectPreview) {
      const s = planToScreen(c.x, c.z);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffbf47';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffbf47';
      ctx.fill();
    }
  }
  // Live snap ring while drawing.
  if (state.snap) {
    const s = planToScreen(state.snap.x, state.snap.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#00f2fe';
    ctx.fill();
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
      ctx.fillText(shortName(displayName(b.type,currentLang())), c.x, c.y + emojiSize * 0.55);
    }
  }
}

// The buildings' physical footprints are deliberately tiny at the overview
// zoom, while their emoji stay readable. Keep the interaction target in sync
// with that visible icon and never make it smaller than a comfortable tap.
// This is shared by drawing and hit-testing so a child can grab what they see.
function buildingScreenTarget(b) {
  const c = planToScreen(b.pos[0], b.pos[1]);
  const fp = buildingFootprint(b);
  const bw = fp[0] * state.view.px;
  const bh = fp[1] * state.view.px;
  const emojiSize = Math.max(11, Math.min(28, Math.min(bw, bh) * 0.5));
  return {
    x: c.x,
    y: c.y - emojiSize * 0.28,
    halfW: Math.max(22, bw / 2, emojiSize * 0.7),
    halfH: Math.max(22, bh / 2, emojiSize * 0.7),
  };
}

let selectionRemoveBounds = null;

function drawSelectionAffordance(w, h) {
  selectionRemoveBounds = null;
  const b = state.layout.buildings[state.selectedIdx];
  if (!b) return;
  const target = buildingScreenTarget(b);
  if (target.x + target.halfW < 0 || target.x - target.halfW > w || target.y + target.halfH < 0 || target.y - target.halfH > h) return;

  // A generous outline makes selection clear even when the footprint is only a
  // few pixels. The separate red action is intentionally on-canvas: children
  // do not have to find a side-panel control to correct a placement.
  ctx.save();
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(target.x - target.halfW, target.y - target.halfH, target.halfW * 2, target.halfH * 2);
  ctx.setLineDash([]);

  const label = t('planner.selected.remove');
  ctx.font = '800 12px Nunito, sans-serif';
  const buttonW = Math.max(74, Math.ceil(ctx.measureText(label).width) + 18);
  const buttonH = 28;
  const buttonX = Math.max(4, Math.min(w - buttonW - 4, target.x - buttonW / 2));
  const buttonY = Math.max(4, target.y - target.halfH - buttonH - 8);
  ctx.fillStyle = '#b8324c';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(buttonX, buttonY, buttonW, buttonH, 14);
  else ctx.rect(buttonX, buttonY, buttonW, buttonH);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, buttonX + buttonW / 2, buttonY + buttonH / 2 + 0.5);
  ctx.restore();
  selectionRemoveBounds = { x: buttonX, y: buttonY, width: buttonW, height: buttonH };
}

function shortName(name) {
  return name.length > 16 ? name.slice(0, 15) + '…' : name;
}

function drawGesture(w, h) {
  const g = state.gesture;
  if (g && (g.mode === 'road' || g.mode === 'road-straight') && g.roadPts && g.roadPts.length >= 2) {
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
  if (g && g.mode === 'park' && g.parkStart) {
    const cur = g.parkCur || g.parkStart;
    const c = planToScreen(g.parkStart.x, g.parkStart.y);
    const r = Math.hypot(cur.x - g.parkStart.x, cur.y - g.parkStart.y) * state.view.px;
    ctx.strokeStyle = 'rgba(76,190,106,0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawCurvePreview();
}

/** Live preview of an in-progress curved road (control points + smooth path). */
function drawCurvePreview() {
  if (state.tool !== 'road' || state.roadMode !== 'curve') return;
  const ctrl = state.curvePts.slice();
  if (state.curveCursor) ctrl.push([state.curveCursor.x, state.curveCursor.y]);
  if (!ctrl.length) return;
  if (ctrl.length >= 2) {
    const sampled = sampleCatmullRom(ctrl, { minSpacing: 12 });
    ctx.strokeStyle = 'rgba(0,242,254,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    sampled.forEach(([x, z], i) => {
      const s = planToScreen(x, z);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [x, z] of state.curvePts) {
    const s = planToScreen(x, z);
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#06283a'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

// ─── Catalog drawer ─────────────────────────────────────
const LIB_DRAWER_CATEGORIES = ['nature', 'props', 'vehicles', 'scenarios'];
const LIB_CATEGORY_LABEL = { nature: 'Nature', props: 'Props', vehicles: 'Vehicles', scenarios: 'Themed' };

function drawerCatLabel(cat) {
  if (currentLang() !== 'zh-Hant') return LIB_CATEGORY_LABEL[cat] || cat;
  return t('planner.drawer.cat' + cat.charAt(0).toUpperCase() + cat.slice(1));
}

let drawerLimit = 12;
function buildDrawer(more = false) {
  const category = document.getElementById('drawer-category').value;
  const query = document.getElementById('drawer-search').value.trim().toLowerCase();
  if (!more) { drawerLimit = 12; catalogList.replaceChildren(); }
  const starter = ['housing','school','shop','hospital','library','bus','water','power','recycling','city_central','delivery','health'];
  const entries = CATALOG_ORDER.map(type => ({type, spec:CATALOG[type], category:isSpecial(type)?'special':'generic'}));
  for (const category of LIB_DRAWER_CATEGORIES) for (const spec of libraryByCategory(category)) entries.push({type:'lib:'+spec.id,spec,category});
  let found = entries.filter(entry => (category === 'all' || category === 'starter' || entry.category === category) && (!query || [displayName(entry.type,'en'),displayName(entry.type,'zh-Hant'),entry.spec.name,entry.type].join(' ').toLowerCase().includes(query)));
  if (category === 'starter' && !query) found = starter.map(type => entries.find(e=>e.type===type));
  const start = more ? catalogList.querySelectorAll('.cat-btn').length : 0;
  if (more) drawerLimit += 24;
  for (const {type,spec} of found.slice(start,drawerLimit)) {
    const btn=document.createElement('button');btn.className='cat-btn';btn.dataset.type=type;
    let icon;
    if (type.startsWith('lib:')) {
      icon=document.createElement('img');icon.className='catalog-thumb';icon.src=`../library/thumbnails/${type.slice(4)}.png`;icon.alt='';icon.loading='lazy';
      icon.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.className='emoji';fallback.textContent=spec.emoji||'🏗️';fallback.setAttribute('aria-hidden','true');icon.replaceWith(fallback);icon=fallback;},{once:true});
    } else {
      icon=document.createElement('span');icon.className='emoji';icon.textContent=spec.emoji;icon.setAttribute('aria-hidden','true');
    }
    const primary=displayName(type,currentLang());
    const alternate=displayName(type,currentLang()==='zh-Hant'?'en':'zh-Hant');
    const name=document.createElement('span');name.className='name';name.textContent=primary;
    const alt=document.createElement('span');alt.className='name-alt';alt.textContent=alternate===primary?'':alternate;
    btn.append(icon,name,alt);btn.title=primary+' · '+type;
    btn.onclick=()=>{state.selectedType=type;setTool('place');selectCatalogBtn(type);hint(L('planner.hint.placeItem',{name:displayName(type,currentLang())}));};
    catalogList.append(btn);
  }
  const moreBtn=document.getElementById('drawer-more');moreBtn.hidden=found.length<=drawerLimit;
  document.getElementById('drawer-count').textContent=L('planner.drawer.count',{shown:Math.min(drawerLimit,found.length),total:found.length});
  selectCatalogBtn(state.selectedType);
  if(more) catalogList.querySelectorAll('.cat-btn')[start]?.focus();
}
document.getElementById('drawer-search').addEventListener('input',()=>buildDrawer());
document.getElementById('drawer-category').addEventListener('change',()=>buildDrawer());
document.getElementById('drawer-more').addEventListener('click',()=>buildDrawer(true));

function selectCatalogBtn(key) {
  catalogList.querySelectorAll('.cat-btn').forEach((b) => {
    b.classList.toggle('selected', b.dataset.type === key);
    b.setAttribute('aria-pressed', String(b.dataset.type === key));
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
  roadStart = null;
  state.selectedIdx = -1;
  if (tool !== 'road') cancelCurve(false);
  renderSelectedInfo();
  document.querySelectorAll('.tool-btn').forEach((b) => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  hint(roadHintFor(tool));
  setContextSheet('drawer', tool === 'place');
  updateRoadOptions();
  render();
}

// ─── Road drawing styles (Freehand / Straight / Curve) + Tidy up ─────────
function roadHintFor(tool) {
  if (tool === 'road') {
    if (state.roadMode === 'straight') return t('planner.hint.roadStraight');
    if (state.roadMode === 'curve') return t('planner.hint.roadCurve');
  }
  return t(TOOL_HINT_KEY[tool] || 'planner.hint.place');
}

function setRoadMode(mode) {
  state.roadMode = mode === 'straight' || mode === 'curve' ? mode : 'freehand';
  cancelCurve(false);
  document.querySelectorAll('.road-mode-btn').forEach((b) => {
    const on = b.dataset.roadMode === state.roadMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  if (state.tool === 'road') hint(roadHintFor('road'));
  updateRoadOptions();
  render();
}

function updateRoadOptions() {
  const bar = document.getElementById('road-options');
  if (!bar) return;
  bar.classList.toggle('hidden', state.tool !== 'road');
  const curveActive = state.tool === 'road' && state.roadMode === 'curve';
  document.getElementById('road-finish')?.classList.toggle('hidden', !(curveActive && state.curvePts.length >= 2));
  document.getElementById('road-cancel')?.classList.toggle('hidden', !(curveActive && state.curvePts.length >= 1));
}

function cancelCurve(repaint = true) {
  if (state.curvePts.length || state.curveCursor) {
    state.curvePts = [];
    state.curveCursor = null;
    updateRoadOptions();
    if (repaint) render();
  }
}

function addCurvePoint(p) {
  const snapped = snappedPlan(p);
  const last = state.curvePts[state.curvePts.length - 1];
  if (last && Math.hypot(snapped.x - last[0], snapped.y - last[1]) < 8) return;
  state.curvePts.push([snapped.x, snapped.y]);
  updateRoadOptions();
  render();
}

function polylineLength(pts) {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) n += Math.hypot(pts[i][0] - pts[i + 1][0], pts[i][1] - pts[i + 1][1]);
  return n;
}

/**
 * Keep a Straight road at the same length but snap its direction to the nearest
 * 45°. `hard` (Shift held) snaps from any angle; otherwise only an
 * already-nearly-straight line is corrected, so free angles stay free.
 */
function straightSnap(start, end, hard) {
  const dx = end.x - start.x, dz = end.y - start.y;
  const len = Math.hypot(dx, dz);
  if (!len) return end;
  const step = Math.PI / 4;
  const ang = Math.atan2(dz, dx);
  const nearest = Math.round(ang / step) * step;
  const diff = Math.abs(Math.atan2(Math.sin(ang - nearest), Math.cos(ang - nearest)));
  const tol = hard ? step / 2 : (3 * Math.PI) / 180;
  if (diff <= tol) return { x: start.x + Math.cos(nearest) * len, y: start.y + Math.sin(nearest) * len };
  return end;
}

/** Commit a finished road (already in plan coords). Returns true on success. */
function commitRoad(points) {
  if (!points || points.length < 2) { toast(t('planner.toast.roadDrag')); return false; }
  if (polylineLength(points) < 20) { toast(t('planner.toast.roadShort')); return false; }
  pushUndo();
  state.layout.roads.push({ points, width: ROAD_WIDTH.residential, class: 'residential' });
  // Join the new road into the network straight away. The snap ring already
  // showed the child which roads it touched, and Undo reverses the whole
  // gesture, so this is approval-by-action rather than a silent change.
  const joined = weldRoads({ undo: false });
  const moved = makeBuildingsRoadSafe();
  if (joined) toast(L('planner.toast.welded', { n: joined }));
  else if (moved) toast(`🛣️ Moved ${moved} object${moved === 1 ? '' : 's'} the smallest distance off the road.`);
  updateMetrics();
  render();
  return true;
}

/** Turn the tapped control points into a smooth polyline and commit it. */
function finishCurve() {
  const ctrl = state.curvePts;
  if (ctrl.length < 2) { toast(t('planner.toast.curveShort')); return; }
  // Keep the whole network under the layout's 4000-point cap by widening the
  // sample spacing when the city is already busy (deterministic, bounded).
  const used = state.layout.roads.reduce((n, r) => n + r.points.length, 0);
  const budget = Math.max(20, 3900 - used);
  let spacing = 12;
  let sampled = sampleCatmullRom(ctrl, { minSpacing: spacing });
  while (sampled.length > budget && spacing < 200) {
    spacing *= 1.5;
    sampled = sampleCatmullRom(ctrl, { minSpacing: spacing });
  }
  const pts = sampled.map(([x, z]) => [Math.round(x), Math.round(z)]);
  if (commitRoad(pts)) cancelCurve(false);
  updateRoadOptions();
}

/**
 * Simplify/straighten/connect the whole drawn network, then nudge any
 * unprotected building the tidied roads would sit on. One undo. Landmarks and
 * locked buildings are never moved; tidy keeps their roads' original geometry.
 */
function tidyUpRoads() {
  if (!state.layout.roads.length) { toast(t('planner.toast.tidyNone')); return; }
  const protectedFootprints = state.layout.buildings
    .filter((b) => b.locked || isSpecial(b.type))
    .map((b) => ({ pos: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint || [20, 20] }));
  const { roads, stats } = tidyRoads(state.layout, { protectedFootprints });
  // Never apply a tidy that would produce an invalid layout.
  if (!validateLayout({ ...state.layout, roads }).ok) { toast(t('planner.toast.tidyNone')); return; }
  pushUndo();
  state.layout.roads = roads;
  const moved = makeBuildingsRoadSafe();
  state.selectedIdx = -1;
  cancelCurve(false);
  updateMetrics();
  render();
  const joined = (stats.endpointMerges || 0) + (stats.tJunctions || 0);
  if (stats.pointsAfter === stats.pointsBefore && !joined && !moved) toast(t('planner.toast.tidyNone'));
  else toast(L('planner.toast.tidy', { r: state.layout.roads.length, j: joined, b: moved }));
}

/** Roads are the sole exception to locks: every object gets only the nearest
 * safe nudge, while locks remain authoritative for all ordinary restructuring. */
function makeBuildingsRoadSafe() {
  let moved = 0;
  for (const b of state.layout.buildings) {
    const resolved = resolveRoadSafePlacement({
      position: b.pos,
      footprint: b.footprint || typeSpec(b.type)?.footprint || [20, 20],
      rotation: b.rotation || 0,
      roads: state.layout,
      bounds: [0, 0, state.layout.scaleMeters || SCALE, state.layout.scaleMeters || SCALE],
      obstacles: state.layout.buildings.filter((o) => o !== b),
    });
    if (resolved.ok && resolved.moved) { b.pos = resolved.position; moved++; }
  }
  return moved;
}

// ─── Weld loose road connections (opt-in) ───────────────────────────────
// A child who "joins" two roads by eye leaves a few metres of air between them,
// and the 3D traffic graph needs real shared vertices. detectJunctions reports
// what could be joined; materializeJunctions does it — but only after the child
// approves (or, for an obvious live snap, as they draw). Declining leaves the
// roads exactly as drawn: nothing here ever blocks saving.
// One join tolerance shared by the live snap ring, the "join your roads?"
// suggestion and the weld itself, so what the child sees is what gets fixed.
// 24 m on a 2000 m plan is deliberate: far enough to forgive a finger, tight
// enough that two separately-planned streets are never merged by accident.
const JOIN_DIST = 24;

/** Landmarks and locked buildings a weld must never route a road over. */
function weldProtectedFootprints() {
  return state.layout.buildings
    .filter((b) => b.locked || isSpecial(b.type))
    .map((b) => ({ pos: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint || [20, 20] }));
}

/** Nearest existing road end/body a drawn point could snap onto (or null). */
function snapTargetFor(x, y) {
  let best = null;
  // The active stroke's first point is a real snap target. This is what lets a
  // single freehand/curved stroke visibly close itself before it is committed.
  const activeStart = state.gesture?.roadPts?.[0]
    || (state.curvePts.length ? { x: state.curvePts[0][0], y: state.curvePts[0][1] } : null);
  if (activeStart) {
    const travelled = state.gesture?.roadPts?.reduce((sum, p, i, list) => i ? sum + Math.hypot(p.x - list[i - 1].x, p.y - list[i - 1].y) : 0, 0)
      || polylineLength(state.curvePts);
    const d = Math.hypot(activeStart.x - x, activeStart.y - y);
    if (travelled >= 40 && d <= JOIN_DIST) best = { x: activeStart.x, y: activeStart.y, d, kind: 'loop' };
  }
  for (const r of state.layout.roads) {
    const pts = r.points || [];
    for (const end of [0, pts.length - 1]) {
      const p = pts[end];
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d <= JOIN_DIST && (!best || d < best.d)) best = { x: p[0], y: p[1], d, kind: 'end' };
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const pr = pointToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (pr.t <= 0.02 || pr.t >= 0.98) continue;
      if (pr.d <= JOIN_DIST && (!best || pr.d < best.d)) best = { x: pr.x, y: pr.z, d: pr.d, kind: 'body' };
    }
  }
  return best;
}

/** Snap a drawn plan point onto a nearby road when the child clearly means it. */
function snappedPlan(p) {
  const hit = snapTargetFor(p.x, p.y);
  return hit ? { x: hit.x, y: hit.y, snapped: true } : p;
}

/** Weld every detected junction into the current roads. Returns joins or 0. */
function weldRoads({ undo = true } = {}) {
  if (!state.layout.roads.length) return 0;
  const { roads, stats } = materializeJunctions(state.layout, {
    closeLoops: true,
    endpointDist: JOIN_DIST,
    tJunctionDist: JOIN_DIST,
    protectedFootprints: weldProtectedFootprints(),
  });
  const joined = (stats.endpointMerges || 0) + (stats.tJunctions || 0) + (stats.crossings || 0) + (stats.loops || 0);
  if (!joined) return 0;
  if (undo) pushUndo();
  state.layout.roads = roads;
  refreshConnect();
  return joined;
}

/** Recount loose joins and show/hide the join suggestion button. */
function refreshConnect() {
  const count = state.layout.roads.length
    ? detectJunctions(state.layout, { endpointDist: JOIN_DIST, tJunctionDist: JOIN_DIST }).candidates.length
    : 0;
  state.connectCount = count;
  const btn = document.getElementById('road-connect');
  const badge = document.getElementById('road-connect-count');
  if (btn) btn.classList.toggle('hidden', count === 0);
  if (badge) badge.textContent = count ? String(count) : '';
  return count;
}

/** Explain what is loose, then weld everything only if the child says yes. */
function offerConnect() {
  const { candidates, stats } = detectJunctions(state.layout, { endpointDist: JOIN_DIST, tJunctionDist: JOIN_DIST });
  if (!candidates.length) { toast(t('planner.toast.connectNone')); return; }
  state.connectPreview = candidates;
  render();
  const parts = [];
  if (stats.endpointMerges) parts.push(L('planner.connect.partEnds', { n: stats.endpointMerges }));
  if (stats.tJunctions) parts.push(L('planner.connect.partT', { n: stats.tJunctions }));
  if (stats.crossings) parts.push(L('planner.connect.partCross', { n: stats.crossings }));
  if (stats.loops) parts.push(L('planner.connect.partLoop', { n: stats.loops }));
  confirmCityAction({
    title: t('planner.connect.title'),
    message: `${t('planner.connect.intro')}<br><strong>${parts.join(' · ')}</strong><br>${t('planner.connect.why')}`,
    yesLabel: t('planner.connect.yes'),
    onYes: () => {
      state.connectPreview = null;
      const joined = weldRoads();
      updateMetrics();
      render();
      if (joined) toast(L('planner.toast.welded', { n: joined }));
    },
    onNo: () => { state.connectPreview = null; state.connectAsked = true; render(); },
  });
}

document.querySelectorAll('.road-mode-btn').forEach((b) => b.addEventListener('click', () => setRoadMode(b.dataset.roadMode)));
document.getElementById('road-finish')?.addEventListener('click', (e) => { e.preventDefault(); finishCurve(); });
document.getElementById('road-cancel')?.addEventListener('click', (e) => { e.preventDefault(); cancelCurve(); });
document.getElementById('road-tidy')?.addEventListener('click', (e) => { e.preventDefault(); tidyUpRoads(); });
document.getElementById('road-connect')?.addEventListener('click', (e) => { e.preventDefault(); offerConnect(); });

const drawerEl = document.getElementById('drawer');
const metricsEl = document.getElementById('metrics-panel');
const scoreToggle = document.getElementById('city-score-toggle');
let sheetReturnFocus = null;
function setContextSheet(which, open) {
  const panel = which === 'drawer' ? drawerEl : metricsEl;
  const toggle = which === 'metrics' ? scoreToggle : null;
  if (!panel) return;
  if (open) {
    if (which === 'metrics') setContextSheet('drawer', false);
    sheetReturnFocus = document.activeElement;
  }
  panel.classList.toggle('open', open);
  panel.setAttribute('aria-hidden', String(!open));
  toggle?.setAttribute('aria-expanded', String(open));
}
document.getElementById('drawer-close')?.addEventListener('click',()=>setContextSheet('drawer',false));
document.getElementById('metrics-close')?.addEventListener('click',()=>{setContextSheet('metrics',false);sheetReturnFocus?.focus?.();});
scoreToggle?.addEventListener('click',()=>setContextSheet('metrics',!metricsEl.classList.contains('open')));
document.addEventListener('keydown',(event)=>{
  if(event.key!=='Escape'||activeModal())return;
  if(metricsEl.classList.contains('open')){event.preventDefault();setContextSheet('metrics',false);scoreToggle.focus();}
  else if(drawerEl.classList.contains('open')){event.preventDefault();setContextSheet('drawer',false);document.querySelector('[data-tool="place"]')?.focus();}
});

function hint(msg) {
  hintBar.textContent = msg;
}

// Live language toggle: refresh the parts the static pass can't reach.
window.addEventListener('i18n:change', () => {
  if (state.viewMode === 'normal') hint(roadHintFor(state.tool));
  buildDrawer();
  renderTemplates();   // template names + good-for blurbs switch language live
  updateMetrics();
});

// Keyboard editing uses the same mutations, metrics and autosave as pointer work.
const keyCursor={x:1000,y:1000};
let showKeyboardCursor=false;
let roadStart=null;
function announceCursor() {
  const b=state.layout.buildings[state.selectedIdx];
  document.getElementById('keyboard-status').textContent=(b?displayName(b.type,currentLang())+' · ':'')+L('planner.keyboard.position',{x:Math.round(keyCursor.x),z:Math.round(keyCursor.y)});
}
function selectNext(delta) {
  const count=state.layout.buildings.length;if(!count)return;
  state.tool='select';state.selectedIdx=(state.selectedIdx+delta+count)%count;
  const b=state.layout.buildings[state.selectedIdx];keyCursor.x=b.pos[0];keyCursor.y=b.pos[1];
  const rect=canvas.getBoundingClientRect();state.view.ox=rect.width/2-keyCursor.x*state.view.px;state.view.oy=rect.height/2+keyCursor.y*state.view.px;
  document.querySelectorAll('.tool-btn').forEach(el=>{const on=el.dataset.tool==='select';el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});
  renderSelectedInfo();announceCursor();render();
}
function keyboardPlace() {
  if(state.tool==='place') {placeBuilding(keyCursor.x,keyCursor.y);announceCursor();toast(L('planner.keyboard.placed',{name:displayName(state.selectedType,currentLang()),n:state.layout.buildings.length}));}
  else if(state.tool==='park') {pushUndo();state.layout.parks.push({cx:keyCursor.x,cz:keyCursor.y,radius:50});updateMetrics();render();}
  else if(state.tool==='road') {
    if(!roadStart) {roadStart=[keyCursor.x,keyCursor.y];hint(t('planner.keyboard.roadEnd'));}
    else if(Math.hypot(keyCursor.x-roadStart[0],keyCursor.y-roadStart[1])>=20) {pushUndo();state.layout.roads.push({points:[roadStart,[keyCursor.x,keyCursor.y]],width:ROAD_WIDTH.residential,class:'residential'});roadStart=null;const j=weldRoads({undo:false});if(j)toast(L('planner.toast.welded',{n:j}));updateMetrics();render();}
  } else selectNext(1);
}
canvas.addEventListener('focus',()=>{announceCursor();render();});
canvas.addEventListener('blur',()=>{showKeyboardCursor=false;render();});
canvas.addEventListener('pointerdown',()=>{showKeyboardCursor=false;render();});
canvas.addEventListener('keydown',e=>{
  if(activeModal())return;
  showKeyboardCursor=true;
  if(['Enter',' '].includes(e.key)){
    if(e.key==='Enter' && state.tool==='road' && state.roadMode==='curve' && state.curvePts.length>=2){e.preventDefault();finishCurve();return;}
    e.preventDefault();keyboardPlace();return;
  }
  if(e.key==='Escape'){roadStart=null;cancelCurve(false);state.selectedIdx=-1;renderSelectedInfo();render();return;}
  if(e.key==='['||e.key===']'){e.preventDefault();selectNext(e.key===']'?1:-1);return;}
  if(e.key==='+'||e.key==='-'){e.preventDefault();const r=canvas.getBoundingClientRect();zoomAt(r.width/2,r.height/2,e.key==='+'?1.2:1/1.2);return;}
  const dirs={ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]};const dir=dirs[e.key];if(!dir)return;
  e.preventDefault();const step=e.shiftKey?50:10;
  const b=state.tool==='select'?state.layout.buildings[state.selectedIdx]:null;
  if(b){keyCursor.x=b.pos[0];keyCursor.y=b.pos[1];pushUndo();}
  keyCursor.x=Math.max(0,Math.min(SCALE,keyCursor.x+dir[0]*step));keyCursor.y=Math.max(0,Math.min(SCALE,keyCursor.y+dir[1]*step));
  if(b){b.pos=[keyCursor.x,keyCursor.y];updateMetrics();renderSelectedInfo();}
  announceCursor();render();
});
document.getElementById('keyboard-place').onclick=()=>{keyboardPlace();showKeyboardCursor=true;canvas.focus();};
document.getElementById('keyboard-next').onclick=()=>{selectNext(1);showKeyboardCursor=true;canvas.focus();};
document.getElementById('keyboard-delete').onclick=()=>{if(state.selectedIdx>=0)deleteSelectedOrClear();showKeyboardCursor=true;canvas.focus();};
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
  // A pointer can arrive before ResizeObserver after toolbar reflow or zoom.
  if (!lastCanvasSize || r.width !== lastCanvasSize.width || r.height !== lastCanvasSize.height) resize();
  return { sx: e.clientX - r.left, sy: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  const { sx, sy } = pointerPos(e);
  // The selected building's on-canvas Remove action takes priority over map
  // gestures. Removal is immediate but remains safely reversible with Undo.
  if (selectionRemoveBounds && sx >= selectionRemoveBounds.x && sx <= selectionRemoveBounds.x + selectionRemoveBounds.width && sy >= selectionRemoveBounds.y && sy <= selectionRemoveBounds.y + selectionRemoveBounds.height) {
    e.preventDefault();
    deleteSelectedOrClear();
    return;
  }
  canvas.setPointerCapture(e.pointerId);
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
      if (state.roadMode === 'curve') {
        state.gesture.mode = 'curve';
        state.snap = snapTargetFor(p.x, p.y);
      } else if (state.roadMode === 'straight') {
        state.gesture.mode = 'road-straight';
        state.gesture.roadPts = [snappedPlan(p)];
        state.snap = snapTargetFor(p.x, p.y);
      } else {
        state.gesture.mode = 'road';
        state.gesture.roadPts = [snappedPlan(p)];
        state.snap = snapTargetFor(p.x, p.y);
      }
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
    case 'place': {
      const hit = hitBuilding(sx, sy);
      if (hit >= 0) {
        state.gesture.mode = 'move';
        state.gesture.movingIdx = hit;
        state.selectedIdx = hit;
        renderSelectedInfo();
        render();
      } else {
        // In Place mode empty-map taps still place and empty-map drags pan.
        state.gesture.mode = 'maybe-place';
      }
      break;
    }
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
      state.snap = snapTargetFor(p.x, p.y);
      const last = g.roadPts[g.roadPts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 4) g.roadPts.push(p);
      requestRender();
      break;
    }
    case 'road-straight': {
      const end = clampPlan(screenToPlan(sx, sy));
      state.snap = snapTargetFor(end.x, end.y);
      const snapped = snappedPlan(straightSnap(g.roadPts[0], end, e.shiftKey));
      g.roadPts[1] = { x: snapped.x, y: snapped.y };
      requestRender();
      break;
    }
    case 'curve': {
      if (g.moved > 8) {
        // Dragging in Curve mode pans the map (so the child can reach the next
        // bend); a tap is what adds a point.
        g.mode = 'pan';
        state.view.ox += dx; state.view.oy += dy;
      } else {
        const c = clampPlan(screenToPlan(sx, sy));
        state.snap = snapTargetFor(c.x, c.y);
        state.curveCursor = c;
      }
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
      if (b && !b.locked && g.moved > 4) {
        if (!g.savedUndo) { pushUndo(); g.savedUndo = true; }
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
        const pts = g.roadPts.map((p) => ({ x: p.x, y: p.y }));
        pts[pts.length - 1] = snappedPlan(pts[pts.length - 1]);
        commitRoad(pts.map((p) => [Math.round(p.x), Math.round(p.y)]));
      } else {
        toast(t('planner.toast.roadDrag'));
      }
      break;
    }
    case 'road-straight': {
      const start = g.roadPts[0];
      const end = snappedPlan(straightSnap(start, clampPlan(screenToPlan(sx, sy)), e.shiftKey));
      commitRoad([[Math.round(start.x), Math.round(start.y)], [Math.round(end.x), Math.round(end.y)]]);
      break;
    }
    case 'curve': {
      // A tap adds a bend; a drag already switched to pan instead.
      if (g.moved <= 8) addCurvePoint(clampPlan(screenToPlan(sx, sy)));
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
      if (g.savedUndo) {
        const b = state.layout.buildings[g.movingIdx];
        if (b) {
          const safe = resolveRoadSafePlacement({ position: b.pos, footprint: b.footprint || typeSpec(b.type)?.footprint,
            rotation: b.rotation || 0, roads: state.layout, bounds: [0, 0, SCALE, SCALE],
            obstacles: state.layout.buildings.filter((o) => o !== b) });
          if (safe.ok) b.pos = safe.position;
        }
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
  state.snap = null;
  render();
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { /* keep drawing on pointerleave thanks to capture */ });

canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) return; // Preserve browser zoom.
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
  updateZoomButtons();
}

function hitBuilding(sx, sy) {
  const layout = state.layout;
  for (let i = layout.buildings.length - 1; i >= 0; i--) {
    const b = layout.buildings[i];
    const target = buildingScreenTarget(b);
    if (Math.abs(sx - target.x) <= target.halfW && Math.abs(sy - target.y) <= target.halfH) return i;
  }
  return -1;
}

function placeBuilding(x, y) {
  const spec = typeSpec(state.selectedType);
  if (!spec) return;
  const safe = resolveRoadSafePlacement({ position: [Math.round(x * 2) / 2, Math.round(y * 2) / 2], footprint: spec.footprint,
    roads: state.layout, bounds: [0, 0, state.layout.scaleMeters || SCALE, state.layout.scaleMeters || SCALE],
    obstacles: state.layout.buildings, maxDistance: 80 });
  if (!safe.ok) { toast('🚧 No safe clear space here — try another side of the road.'); return; }
  pushUndo();
  state.layout.buildings.push({
    type: state.selectedType,
    pos: safe.position,
    footprint: spec.footprint,
    height: spec.height,
  });
  updateMetrics();
  render();
}

// ─── Undo / clear ───────────────────────────────────────
function pushUndo() {
  editorHistory.capture();
}
function undo() {
  const result = editorHistory.undo();
  if (result.ok) {
    state.goalTab = state.goals.mode === 'mayor' || state.goals.mode === 'default' ? 'mayor' : 'custom';
    state.selectedIdx = -1;
    updateMetrics();
    render();
    toast(t('planner.toast.undo'));
  } else {
    toast(t('planner.toast.nothingUndo'));
  }
}
function redo() {
  const result = editorHistory.redo();
  if (result.ok) {
    state.goalTab = state.goals.mode === 'mayor' || state.goals.mode === 'default' ? 'mayor' : 'custom';
    state.selectedIdx = -1;
    updateMetrics();
    render();
    toast(t('planner.toast.redo'));
  } else {
    toast(t('planner.toast.nothingRedo'));
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
    const name = displayName(b.type,currentLang());
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
function confirmCityAction({ title, message, yesLabel, onYes, onNo }) {
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
          <button class="confirm-cancel" data-modal-close id="confirm-no" type="button">${t('planner.confirm.keep')}</button>
          <button class="plan-apply" id="confirm-yes" type="button">${yesLabel}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  const cancel = () => { close(); if (onNo) onNo(); };
  m.querySelector('.confirm-backdrop').addEventListener('click', cancel);
  m.querySelector('#confirm-no').addEventListener('click', cancel);
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
  for (const template of ROAD_TEMPLATES) {
    const item = document.createElement('button');
    item.className = 'template-item';
    item.dataset.template = template.id;
    item.setAttribute('aria-label', `${templateName(template.id)} — ${templateNote(template)}`);
    item.innerHTML = `<span class="tpl-preview">${roadTemplateThumbnailSvg(template)}</span><span class="tpl-copy"><span class="tpl-emoji">${template.emoji}</span><span class="tpl-name">${templateName(template.id)}</span><span class="tpl-good">${templateNote(template)}</span></span>`;
    item.addEventListener('click', () => {
      const apply = () => {
        loadRoadTemplate(template.id);
        templateMenu.classList.add('hidden');
      };
      if (cityIsEmpty()) {
        apply();
      } else {
        templateMenu.classList.add('hidden');
        confirmCityAction({
          title: L('planner.template.confirmTitle', { name: templateName(template.id) }),
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
let _layoutSignature = null;
let _objectiveSignature = null;
// All consumers check geometry, including pointer previews and replacements.
// Saving undo history is not itself a mutation. Goal changes invalidate plans,
// but reuse the road calculation when geometry is unchanged.
function invalidateEvidence() {
  const geometry = JSON.stringify(state.layout);
  const objective = JSON.stringify(effectiveWeights());
  if (geometry !== _layoutSignature) {
    _layoutSignature = geometry;
    _walkDirty = true;
    state.walkCache = null;
    state.homeRoutes = [];
    state.lastMetrics = null;
  }
  const signature = geometry + objective;
  if (signature !== _objectiveSignature) {
    _objectiveSignature = signature;
    state.lastPlans = null;
    state.mymove = null;
    _pendingPlan = null;
  }
}
function computeWalkState() {
  invalidateEvidence();
  if (!_walkDirty && state.walkCache) return state.walkCache;
  _walkDirty = false;
  state.walkCache = computeWalkReach(state.layout);
  return state.walkCache;
}

/** Refresh the selected home's real walking routes (Walk view visual). Reads
 * the walk cache if present; computes it when stale WITHOUT recursion. */
function refreshHomeRoutes() {
  const walk = computeWalkState();
  state.homeRoutes = homeReachRoutes(state.layout, walk, state.selectedIdx);
}

function effectiveWeights() {
  return effectiveGoalWeights(state.goals);
}

// ─── Milestones (recognition, NEVER gates) ──────────────
// Durable "you did this" recognition: capability-based (never a score chase),
// never lost, and stored under a key the Champion File owns so it follows the
// child across devices/lessons. Taxonomy + storage live in
// city-common/milestones.js; this function only evaluates + celebrates.
function checkMilestones(m, walk) {
  let store = readMilestones();
  const hits = evaluateMilestones({ layout: state.layout, metrics: m, walk, params: METRIC_PARAMS }, store);
  if (!hits.length) return;
  const zh = currentLang() === 'zh-Hant';
  for (const hit of hits) {
    const res = awardMilestone(store, hit.id, hit.evidence);
    if (!res.ok) continue;
    store = res.state;
    const meta = milestone(hit.id);
    if (meta) toast(zh && meta.msgZh ? meta.msgZh : meta.msg);
  }
  writeMilestones(store);
}

function updateMetrics() {
  refreshSceneryToggle();
  const weights = effectiveWeights();
  const walk = computeWalkState();
  const m = computeMetrics(state.layout, undefined, weights, walk, currentLang());
  state.lastMetrics = m;
  const scoreNum = scoreEl.querySelector('.score-num');
  if (scoreNum) scoreNum.textContent = m.score;
  const compactScore=document.getElementById('score-compact');
  if(compactScore)compactScore.textContent=m.score;
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
  // Buildings sitting on a road are bad planning (roads are sacred, so the
  // BUILDING is what should move). Locked buildings and mission landmarks are
  // never moved automatically, so they stay flagged for the child to fix.
  const onRoadUnprotected = onRoadBuildingIndices(state.layout)
    .filter((i) => { const b = state.layout.buildings[i]; return b && !(b.locked || isSpecial(b.type)); });
  const displayProblems = m.problems.slice();
  if (onRoadUnprotected.length) displayProblems.unshift(L('planner.problem.onRoad', { n: onRoadUnprotected.length }));
  // Advisory only: loose road joins are worth fixing but never block anything.
  const looseCount = refreshConnect();
  if (looseCount) displayProblems.push(L('planner.problem.connect', { n: looseCount }));
  const topology = analyzeRoadTopology(state.layout, { touchTolerance: JOIN_DIST, maxRepairDistance: 90,
    protectedFootprints: weldProtectedFootprints() });
  state.trafficReadiness = topology;
  if (topology.readiness === 'cars-ready') {
    // Positive readiness is exposed in state for the status UI/debug hook but
    // is not phrased as a problem.
  } else if (topology.readiness === 'connect-this-gap') {
    displayProblems.push('Connect this gap to make a safe circuit for cars.');
  } else if (topology.readiness === 'draw-a-loop') {
    displayProblems.push('Cars need a circuit: draw a road back to an earlier road instead of ending every branch.');
  }
  const onRoadCount = onRoadUnprotected.length;
  if (_booted && onRoadCount > (state._onRoadCount || 0)) toast(L('planner.toast.onRoad', { n: onRoadCount }));
  state._onRoadCount = onRoadCount;
  problemsEl.innerHTML = '';
  for (const p of displayProblems) {
    const el = document.createElement('p');
    el.textContent = '⚠️ ' + p;
    problemsEl.appendChild(el);
  }
  const suggestion=document.getElementById('score-suggestion');
  if(suggestion)suggestion.textContent=displayProblems[0]||t('planner.hint.normal');
  renderSelectedInfo();
  requestRender();
  // Every layout/goal mutation funnels through updateMetrics(), so this is the
  // one choke point that guarantees the auto-save sees each change.
  scheduleAutosave();
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
      return `<button class="goal-chip" type="button" aria-label="${L('planner.chipPlace', { name: displayName(k,currentLang()) })}" data-type="${k}" title="${L('planner.chipPlace', { name: displayName(k,currentLang()) })}">${spec?.emoji || '🏗️'} <b>${missing[k]}</b></button>`;
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
  if (b) { keyCursor.x=b.pos[0]; keyCursor.y=b.pos[1]; }
  announceCursor();
  if (!b) { refreshHomeRoutes(); selectedInfo.innerHTML = routeStatusHTML(); return; }
  refreshHomeRoutes();
  const spec = typeSpec(b.type);
  const name = displayName(b.type,currentLang());
  const locked = !!b.locked;
  selectedInfo.innerHTML = `
    <div class="sel-title">${spec?.emoji || ''} ${name}${locked ? ' 🔒' : ''}</div>
    <div class="sel-actions">
      <button id="sel-lock" class="sel-btn ${locked ? 'locked' : ''}">${locked ? t('planner.selected.unlock') : t('planner.selected.lock')}</button>
      <button id="sel-delete" class="sel-btn">${t('planner.selected.remove')}</button>
    </div>${routeStatusHTML()}`;
  document.getElementById('sel-lock').addEventListener('click', toggleLock);
  document.getElementById('sel-delete').addEventListener('click', () => deleteSelectedOrClear());
}

function routeStatusHTML() {
  if (state.viewMode !== 'walk') return '';
  return '<div class="route-statuses" aria-live="polite"><p>' + t('planner.route.basis') + '</p>' + state.homeRoutes.map((r) =>
    `<p data-route-status="${r.status}">${r.type ? (r.type === 'park' ? t('planner.type.park') : displayName(r.type,currentLang())) + ': ' : ''}${t('planner.route.' + r.status)}${Number.isFinite(r.dist) ? ' · ' + r.dist + 'm' : ''}</p>`
  ).join('') + '</div>';
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
    ? L('planner.toast.locked', { name: displayName(b.type,currentLang()) })
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
  document.getElementById('goals-tab-mayor').classList.toggle('active', state.goalTab === 'mayor');
  document.getElementById('goals-tab-custom').classList.toggle('active', state.goalTab === 'custom');
  document.getElementById('goals-mayor-pane').classList.toggle('hidden', state.goalTab !== 'mayor');
  document.getElementById('goals-custom-pane').classList.toggle('hidden', state.goalTab !== 'custom');
}

function renderMayorCards() {
  mayorGrid.innerHTML = '';
  for (const id of Object.keys(MAYORS)) {
    const m = MAYORS[id];
    const card = document.createElement('button');
    card.className = 'mayor-card' + (state.goals.mayorId === id ? ' selected' : '');
    card.dataset.mayor = id;
    card.innerHTML = `
      <div class="mayor-emoji">${m.emoji}</div>
      <div class="mayor-name">${mayorName(id)}</div>
      <div class="mayor-brief">${mayorBrief(id)}</div>`;
    card.addEventListener('click', () => {
      state.goalTab = 'mayor';
      state.goals = mayorGoals(id);
      renderSliders();
      renderMayorCards();
      updateGoalsTabs();
      updateMetrics();
    });
    mayorGrid.appendChild(card);
  }
  const balanced = document.getElementById('btn-mayor-balanced');
  if (balanced) balanced.classList.toggle('selected', state.goals.mode === 'default');
}

// Sliders are RELATIVE importance, not four independent 0–100% toggles: the
// goal weights are re-normalised before scoring (normalizeWeights), so only the
// proportions matter. Showing the raw 0–100 value next to each slider misleads
// a child into thinking "Happy = 100" means the whole score is Happy, when it
// is really Happy ≈ 100/total. We therefore display each goal's live SHARE of
// the total (rounded independently), while the slider position keeps its
// familiar 0–100 "how much this matters" range.
function sliderShares() {
  const sum = GOAL_KEYS.reduce((s, g) => s + (state.goals.values[g] || 0), 0);
  if (!(sum > 0)) return GOAL_KEYS.reduce((o, g) => { o[g] = 0; return o; }, {});
  const out = {};
  for (const g of GOAL_KEYS) out[g] = Math.round(((state.goals.values[g] || 0) / sum) * 100);
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
  const explanation = document.createElement('p');
  explanation.textContent = t(state.goals.mode === 'legacy' ? 'planner.goals.legacy' : 'planner.goals.relative');
  sliderList.appendChild(explanation);
  const vals = Object.fromEntries(GOAL_KEYS.map((g) => [g, goalToSlider(state.goals.values[g])]));
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
      state.goals.values[goal] = sliderToGoal(e.target.value);
      state.goalTab = 'custom';
      state.goals = { version: 1, mode: 'custom', mayorId: null, values: { ...state.goals.values } };
      explanation.textContent = t('planner.goals.relative');
      renderMayorCards();
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
const RECEIPT_META = METRIC_DESCRIPTORS;

function openReceipt() {
  const m = computeMetrics(state.layout, undefined, effectiveWeights(), computeWalkState(), currentLang());
  const weights = effectiveWeights();
  // Resolve the metric-level weights actually used (default blend or mayor/custom).
  const mw = normalizeWeights(weights) || defaultMetricWeights();
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
  document.getElementById('receipt-note').innerHTML = note + ' ' + t('planner.receipt.rounding');
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
  const delta = moveProgressLabel(best);
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

function moveProgressLabel(move) {
  if (move.deltaScore > 0) return `+${move.deltaScore}`;
  if ((move.viabilityChange || 0) > 0) return currentLang() === 'zh-Hant'
    ? `可行性 +${move.viabilityChange}`
    : `viability +${move.viabilityChange}`;
  return String(move.deltaScore);
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
  const name = what === 'housing' ? t('planner.type.housing') : (displayName(what,currentLang()));
  const useName = (k) => L(k, { name });
  if (item.kind === 'off-road') return useName('planner.reason.moveOffRoad');
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
    const weights = effectiveWeights();
    // Stable per-(city, goals) seed: the same city + goals always produce the
    // same Greedy and Explore plans, so the two are directly comparable and a
    // re-press is reproducible (was Date.now()^Math.random(), a fresh lottery
    // every press). Both strategies share ONE seed so Explore's first restart
    // reproduces Greedy exactly (Explore can never score below Greedy).
    const seed = stableSeed(state.layout, weights);
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
    const weights = effectiveWeights();
    // Stable seed: the same city + goals propose the same candidate moves, so
    // "My move" is reproducible across presses (was Date.now()^Math.random()).
    const seed = stableSeed(state.layout, weights);
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
  body.innerHTML = `
    <div class="mymove-intro">${t('planner.mymove.introPre')}<strong>${t('planner.mymove.introStrong')}</strong>${t('planner.mymove.introPost')}</div>
    <div class="mymove-question">${t('planner.mymove.scoreQuestion')}</div>
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
  const best = moves[0];   // first step in the shared Optimise sequence
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
      <strong>${t('planner.mymove.greedyPick')}</strong> ${moveLabel(best)} (${moveProgressLabel(best)}).${t('planner.mymove.greedyWhy')}
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
  if (!state.mymove) return;
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
  const draw = () => {
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
  };
  // Reduced motion: paint the highlight once (the toast carries the text result).
  if (prefersReducedMotion()) { draw(); return; }
  const end = Date.now() + 1600;
  function drawFlash() {
    draw();
    if (Date.now() < end) requestAnimationFrame(drawFlash);
  }
  drawFlash();
}

function moveLabel(m) {
  const name = m.what === 'housing' ? t('planner.movelabel.homeName') : (displayName(m.what,currentLang()));
  if (m.action === 'add') return L('planner.movelabel.add', { name });
  if (m.action === 'move') return L('planner.movelabel.move', { name });
  if (m.action === 'remove') return L('planner.movelabel.remove', { name });
  if (m.action === 'add_park') return t('planner.movelabel.addPark');
  return t('planner.movelabel.other');
}

function receiptDeltaHTML(move, chosenReason, reasonCorrect) {
  const metricLabelEn = { accessibility: 'walk to a road', coverage: 'schools/shops/help nearby', utilities: 'water/power/bus', zoning: 'quiet for homes', spread: 'spread out', balance: 'building mix', green: 'parks', walkability: 'needs reached along roads' };
  const metricEmoji = { accessibility: '🛣️', coverage: '🏘️', utilities: '💧', zoning: '🤫', spread: '🧩', balance: '⚖️', green: '🌳', walkability: '🚶' };
  const metricLabel = (m) => (currentLang() !== 'zh-Hant' ? (metricLabelEn[m] || m) : t('planner.mm.metric.' + m));
  const lines = move.improved.length ? move.improved.map((m) => {
    return `<div class="rr-line"><span>${metricEmoji[m] || ''} ${metricLabel(m)}</span><span class="rr-up">${t('planner.mm.improved')}</span></div>`;
  }) : [];
  // The ✓/✗ badge must use the SAME correctness answer as the banner above
  // (which falls back to reasonMetric when `improved` is empty).
  const reasonBadge = chosenReason
    ? `<div class="rr-line"><span>${L('planner.mm.yourReason', { label: reasonChipLabel(chosenReason) })}</span><span class="${reasonCorrect ? 'rr-up' : 'rr-down'}">${reasonCorrect ? t('planner.mm.right') : t('planner.mm.wrong')}</span></div>`
    : '';
  const progress = (move.viabilityChange || 0) > 0 && move.deltaScore <= 0
    ? `<div class="rr-line"><strong>${currentLang() === 'zh-Hant' ? '區域目標進度' : 'District target progress'}</strong><strong>+${move.viabilityChange}</strong></div>`
    : '';
  const signed = move.deltaScore > 0 ? `+${move.deltaScore}` : String(move.deltaScore);
  return `
    <div class="rr-line"><strong>${t('planner.score.label')}</strong><strong>${move.beforeScore} → ${move.afterScore} (${signed})</strong></div>
    ${progress}
    ${reasonBadge}
    ${lines.join('')}`;
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
/**
 * The planner's weighted breakdown, carried into the 3D city. Without this the
 * child's planning *reasoning* (goals + the score maths) would be discarded the
 * moment they cross over, leaving only a number. With it, the 3D city can echo
 * WHY the city scored as it did using the same rows as the 2D receipt.
 */
function buildPlannerPlan() {
  const m = computeMetrics(state.layout, undefined, effectiveWeights(), computeWalkState(), currentLang());
  return metricReceipt(m, effectiveWeights());
}

function serializeLayout() {
  // The 3D city used to receive only static geometry. Since the planner is the
  // place the child actually "does AI" (weighs goals, picks a mayor, watches the
  // optimiser), we now carry that context forward so the 3D city and the Coding
  // Buddy can talk about the child's own AI choices. Extra keys are ignored by
  // older sanitizers — fully backward compatible.
  const goals = serializeGoals(state.goals);
  const plannerPlan = buildPlannerPlan();
  const plannerScore = plannerPlan.score;

  return {
    version: 2,
    scaleMeters: state.layout.scaleMeters,
    autoScenery: state.layout.autoScenery !== false,
    roads: state.layout.roads,
    parks: state.layout.parks,
    buildings: state.layout.buildings.map((b) => ({
      type: b.type,
      pos: b.pos,
      footprint: b.footprint,
      height: b.height,
      ...(typeof b.locked === 'boolean' ? { locked: b.locked } : {}),
    })),
    ...(goals ? { goals } : {}),
    ...(plannerScore !== null ? { plannerScore } : {}),
    ...(plannerPlan ? { plannerPlan } : {}),
  };
}

function exportCity(mode = 'explore') {
  const layout = serializeLayout();
  const v = validateLayout(layout);
  if (!v.ok) {
    toast(t('ui.invalid'));
    return;
  }
  const json = JSON.stringify(layout, null, 2);
  if (exampleMode) {
    if (!writeExampleDraft(layout)) { toast(t('planner.autosave.error')); return; }
    window.location.href = `/city-builder/?example=1&draft=1&mode=${mode === 'decorate' ? 'decorate' : 'explore'}`;
    return;
  }
  if (newCityMode) {
    if (!writeNewCityDraft(layout)) { toast(t('planner.autosave.error')); return; }
    window.location.href = `/city-builder/?new=1&mode=${mode === 'decorate' ? 'decorate' : 'explore'}`;
    return;
  }
  // Save to localStorage — the SAME origin now serves the 3D city, so this IS
  // the handoff (no file download/upload round-trip). Then walk into it.
  const savedToStorage = projectState.saveSection('layout', json, { source: 'planner-handoff' }).ok;
  if (!savedToStorage) {
    // Storage full / blocked — fall back to a download so the student can still
    // reach the 3D city by uploading the file there. Keep the instruction on
    // the always-visible hint bar too: the toast fades in 2.6s, so a child who
    // looks away would be left with a seemingly-broken "View my city" button.
    downloadLayout(json);
    toast(t('planner.export.storageFull'));
    hint(t('planner.export.storageFullHint'));
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
  window.location.href = `/city-builder/?from=planner&mode=${mode === 'decorate' ? 'decorate' : 'explore'}`;
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

// ── Auto-save (crash safety net) ────────────────────────────────────────────
// The child's layout is persisted automatically a moment after every change, so
// closing the tab (or a crash) never loses an afternoon of building. This writes
// the SAME key the "🌆 View my city" handoff uses, so the 3D city always finds
// the newest city — and the Champion File bundles that key too.
//
// Debounced: drawing a road fires updateMetrics() many times per gesture, and we
// only want ONE write at the end. Deliberately silent on failure (quota / private
// mode) — the explicit "💾 Save" still offers a file, and a scary error on every
// keystroke would be worse than the risk.
const AUTOSAVE_DELAY_MS = 1200;
let _autosaveTimer = 0;
let _statusTimer = 0;
let _booted = false;   // suppress the status flash during the initial programmatic updateMetrics()

/** Serialize + persist the current layout. Returns true when written. */
function saveLayoutToStorage() {
  if (restoreActive) return false;
  try {
    const layout = serializeLayout();
    const v = validateLayout(layout);
    if (!v.ok) return false;   // never persist an invalid city
    if (exampleMode) return writeExampleDraft(layout);
    if (newCityMode) return writeNewCityDraft(layout);
    return projectState.saveSection('layout', currentLayoutString(), { source: 'planner-autosave' }).ok;
  } catch (e) {
    return false;              // quota / blocked storage — keep the in-memory city
  }
}

/** Tiny topbar confirmation so the child (and teacher) can see work is kept. */
function setAutosaveStatus(kind) {
  if (!_booted) return;
  const el = document.getElementById('autosave-status');
  if (!el) return;
  clearTimeout(_statusTimer);
  if (kind === 'saving') {
    el.textContent = t('planner.autosave.saving');
    el.className = 'autosave-status show';
  } else if (kind === 'saved') {
    el.textContent = t('planner.autosave.saved');
    el.className = 'autosave-status show saved';
    _statusTimer = setTimeout(() => {
      const backupAt = Date.parse(lastSavedAt() || '');
      if (!Number.isFinite(backupAt) || Date.now() - backupAt > 7 * 86400000) {
        el.textContent = t('planner.autosave.backup');
        el.className = 'autosave-status show backup';
      } else {
        el.className = 'autosave-status';
      }
    }, 2200);
  } else {
    el.textContent = t('planner.autosave.error');
    el.className = 'autosave-status show error';
  }
}

/** Queue a save for just after the current burst of edits. */
function scheduleAutosave() {
  if (!_booted || restoreActive) return;   // the initial programmatic updateMetrics() is not a change
  clearTimeout(_autosaveTimer);
  setAutosaveStatus('saving');
  _autosaveTimer = setTimeout(() => {
    setAutosaveStatus(saveLayoutToStorage() ? 'saved' : 'error');
  }, AUTOSAVE_DELAY_MS);
}

/** Write immediately (tab hidden / closing) so nothing pending is lost. */
function flushAutosave() {
  clearTimeout(_autosaveTimer);
  setAutosaveStatus(saveLayoutToStorage() ? 'saved' : 'error');
}

// Mobile Safari does not reliably fire beforeunload; visibilitychange + pagehide
// do. Flush pending edits when the tab is backgrounded or closed.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAutosave();
});
window.addEventListener('pagehide', flushAutosave);

// ── Champion File save (named download — the cross-device backup) ───────────
// "💾 Save my city" bundles EVERYTHING (layout + quests + props + skin + flags)
// into one file the student names, so they can restore it on any device next
// lesson. This restores the old forced-download safety net, but named + complete.
function editableSignature() {
  return JSON.stringify([state.layout, state.goals]);
}
function rememberRawLayout(raw) {
  state.rawBaseline = { raw, signature: editableSignature() };
}
function currentLayoutString() {
  if (state.rawBaseline?.signature === editableSignature()) return state.rawBaseline.raw;
  return JSON.stringify(serializeLayout(), null, 2);
}
function currentSnapshot() {
  return { ...collectState(), layout: currentLayoutString() };
}
function restoreFile(state, code) {
  restoreChampion(state, currentSnapshot, () => {
    clearTimeout(_autosaveTimer);
    clearTimeout(_statusTimer);
    if (code) { try { localStorage.setItem(CLOUD_CODE_KEY, code); } catch { /* optional device pointer */ } }
  });
}

function downloadChampionFile(label) {
  const file = composeChampionFile(currentSnapshot(), label);
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
  const cloudBtn = document.getElementById('save-cloud');
  const cloudResult = document.getElementById('save-cloud-result');
  if (!modal || !nameInput || !saveBtn || !goBtn) return;
  const open = () => {
    // Prefill from the last-used name, else a friendly default.
    try {
      const last = localStorage.getItem('p5_city_save_name_v1');
      if (last) nameInput.value = last;
    } catch { /* ignore */ }
    if (cloudResult) { cloudResult.hidden = true; cloudResult.textContent = ''; }
    modal.classList.remove('hidden');
    nameInput.focus();
    nameInput.select();
  };
  const close = () => modal.classList.add('hidden');
  const readName = () => nameInput.value.trim() || 'my-ai-city';
  const rememberName = (name) => { try { localStorage.setItem('p5_city_save_name_v1', name); } catch { /* ignore */ } };
  const doSave = () => {
    const name = readName();
    rememberName(name);
    downloadChampionFile(name);
    close();
  };
  saveBtn.addEventListener('click', open);
  goBtn.addEventListener('click', doSave);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
  modal.querySelectorAll('[data-save-close]').forEach((el) => el.addEventListener('click', close));

  // ☁️ Save to cloud — same worker endpoints the 3D city uses, so a code made
  // here opens there and vice-versa.
  if (cloudBtn) cloudBtn.addEventListener('click', async () => {
    const name = readName();
    rememberName(name);
    cloudBtn.disabled = true;
    cloudBtn.textContent = t('planner.cloud.saving');
    try {
      const code = await cloudSave(name);
      if (cloudResult) {
        cloudResult.hidden = false;
        cloudResult.innerHTML = L('planner.cloud.savedCode', { code: escHTML(code) });
      }
    } catch (e) {
      console.error('[planner] cloud save failed', e);
      if (cloudResult) {
        cloudResult.hidden = false;
        // Kid-first copy: reassure first, then the concrete next step.
        cloudResult.textContent = t('planner.cloud.saveFail');
      }
    } finally {
      cloudBtn.disabled = false;
      cloudBtn.textContent = t('planner.cloud.save');
    }
  });
}

// ── Cloud codes (cross-device backup; same worker as the 3D city) ───────────
// The cloud code is the child's only key to their city, so it travels in the
// POST body (never a query param) and is never logged or put in the URL.
const CLOUD_CODE_KEY = 'p5_cloud_code_v1';   // device-local pointer; not in CF_KEYS

function escHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function cloudSave(label) {
  const file = composeChampionFile(currentSnapshot(), label);
  let lastCode = null;
  try { lastCode = localStorage.getItem(CLOUD_CODE_KEY); } catch { /* ignore */ }
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label: file.label, state: file.state, code: lastCode || undefined }),
  });
  if (!res.ok) throw new Error('save failed (' + res.status + ')');
  const data = await res.json();
  try { localStorage.setItem(CLOUD_CODE_KEY, data.code); } catch { /* ignore */ }
  rememberSavedAt();
  return data.code;
}

async function cloudLoad(code) {
  const res = await fetch('/api/load', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = new Error('load failed (' + res.status + ')');
    err.status = res.status;   // let the UI tell "wrong code" from "cloud is down"
    throw err;
  }
  return await res.json();
}

/** Wire the "☁️ Open from cloud" item + its code-entry modal. */
function wireCloudModal() {
  const modal = document.getElementById('cloud-modal');
  const openBtn = document.getElementById('import-cloud-open');
  const codeInput = document.getElementById('cloud-code');
  const loadBtn = document.getElementById('cloud-load');
  const result = document.getElementById('cloud-load-result');
  if (!modal || !openBtn || !codeInput || !loadBtn) return;
  const open = () => {
    try { const last = localStorage.getItem(CLOUD_CODE_KEY); if (last) codeInput.value = last; } catch { /* ignore */ }
    if (result) result.textContent = '';
    if (importMenu) importMenu.classList.add('hidden');
    modal.classList.remove('hidden');
    codeInput.focus();
    codeInput.select();
  };
  const close = () => modal.classList.add('hidden');
  const doLoad = async () => {
    if (loadBtn.disabled || restoreActive) return;
    const code = codeInput.value.trim();
    if (!code) { if (result) result.textContent = t('planner.cloud.needCode'); return; }
    loadBtn.disabled = true;
    loadBtn.textContent = t('planner.cloud.loading');
    try {
      const data = await cloudLoad(code);
      const champ = sanitizeChampionFile(data);
      if (!champ.ok) { if (result) result.textContent = t('ui.invalid'); return; }
      restoreFile(champ.file.state, code);
    } catch (e) {
      // "Wrong code" and "cloud unreachable" are different problems — say which.
      if (result) {
        result.textContent = (e && e.status === 404)
          ? t('planner.cloud.notFound')
          : t('planner.cloud.offline');
      }
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = t('planner.cloud.load');
    }
  };
  openBtn.addEventListener('click', open);
  loadBtn.addEventListener('click', doLoad);
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doLoad(); } });
  modal.querySelectorAll('[data-cloud-close]').forEach((el) => el.addEventListener('click', close));
}

/** Import a Champion File (restore everything) or a legacy layout JSON. Returns true if handled. */
function importAny(raw) {
  if (!withinImportLimit(raw)) { toast(t('ui.tooLarge')); return true; }
  if (!raw.trim()) return false;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return false; }
  const champ = sanitizeChampionFile(parsed);
  if (parsed?.kind === 'passiona-champion-file' && !champ.ok) { toast(t('ui.invalid')); return true; }
  if (champ.ok) {
    restoreFile(champ.file.state);
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
  if (!withinImportLimit(raw)) { toast(t('ui.tooLarge')); return false; }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    toast(t('planner.import.notJson'));
    return false;
  }
  const v = validateLayout(parsed);
  if (!v.ok) {
    toast(t('ui.invalid'));
    return false;
  }
  const next = sanitizeLayout(parsed);
  pushUndo();
  state.layout = next;
  state.goals = readGoals(parsed.goals);
  rememberRawLayout(raw);
  state.goalTab = state.goals.mode === 'mayor' || state.goals.mode === 'default' ? 'mayor' : 'custom';
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
  walkability: 'needs reached along roads',
};
const METRIC_ICON = {
  accessibility: '🛣️', coverage: '🏘️', utilities: '💧', spread: '🧩', zoning: '🤫', balance: '⚖️', green: '🌳', walkability: '🚶',
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
  // Focus the primary action so the student can Apply with one tap.
  const applyBtn = document.getElementById('plan-apply');
  if (applyBtn) applyBtn.focus();
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

// The plan body is re-rendered when the child compares strategies. Delegate
// its controls through one stable handler so persistent backdrop/X controls do
// not accumulate listeners on every render.
(function wirePlanModalOnce() {
  const modal = document.getElementById('plan-modal');
  if (!modal) return;
  modal.addEventListener('click', (event) => {
    const target = event.target.closest('button,[data-plan-close]');
    if (!target || !modal.contains(target)) return;
    if (target.matches('[data-plan-close]')) { closePlanModal(); return; }
    if (target.classList.contains('strategy-chip')) { showStrategy(target.dataset.strategy); return; }
    if (target.id === 'plan-apply') { applyPlan(); return; }
    if (target.id === 'plan-keep') {
      _pendingPlan = null;
      closePlanModal();
      aiOutput.innerHTML = buddyMsg('planner.buddy.optimiser', 'planner.plan.aiKept');
      toast(t('planner.toast.keptAsIs'));
    }
  });
})();

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
  const draw = () => {
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
  };
  // Reduced motion: one static highlight (the "plan applied" toast is the text result).
  if (prefersReducedMotion()) { draw(); return; }
  const end = Date.now() + FLASH_MS;
  function drawFlash() {
    draw();
    if (Date.now() < end) requestAnimationFrame(drawFlash);
  }
  drawFlash();
}
// ─── Wire up UI ─────────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
  if (target?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (event.shiftKey) redo(); else undo();
});
document.getElementById('btn-clear').addEventListener('click', deleteSelectedOrClear);
// Delete/Backspace removes the selected building (or clears when none), but
// never while the child is typing in a text field.
document.addEventListener('keydown', (e) => {
  if (activeModal() || document.activeElement !== canvas || state.selectedIdx < 0 || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  e.preventDefault();
  deleteSelectedOrClear();
});
document.getElementById('btn-ai').addEventListener('click', askOptimise);
document.getElementById('btn-step').addEventListener('click', runMyMove);
document.getElementById('btn-academy').addEventListener('click', () => { window.location.href = '/pregame/'; });
document.getElementById('btn-example').addEventListener('click', () => {
  // Preserve even the most recent in-memory edit before leaving for the
  // isolated showcase. The example route never writes over this saved plan.
  if (!exampleMode) flushAutosave();
  window.location.href = '/city-builder/?example=1';
});
document.getElementById('btn-export').addEventListener('click', () => exportCity('explore'));
document.getElementById('btn-decorate').addEventListener('click', () => exportCity('decorate'));
document.getElementById('use-example-plan').addEventListener('click', () => {
  if (!exampleMode) return;
  // Capture the visible plan now, even if a debounced autosave has not fired.
  // A blocked session store must never cause an older draft to be copied.
  let draft;
  try { draft = serializeLayout(); }
  catch { toast('Could not read the example plan. Your city was kept.'); return; }
  if (!writeExampleDraft(draft)) { toast('Could not save the example draft. Your city was kept.'); return; }
  const existing = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  const question = existing
    ? 'Replace your saved city with this example plan? A recovery snapshot will be made first.'
    : 'Use this example plan as your city? A recovery snapshot will be made first.';
  if (!window.confirm(question)) return;
  const result = projectState.commit({ layout: JSON.stringify(draft) }, { source: 'example-copy', recovery: true, requireRecovery: true });
  if (!result.ok) { toast(result.error || 'Could not save your city.'); return; }
  window.location.href = '/planner/';
});
document.getElementById('use-new-plan').addEventListener('click', () => {
  if (!newCityMode) return;
  const draft = serializeLayout();
  if (!writeNewCityDraft(draft)) { toast('Could not keep this draft. Your saved city was kept.'); return; }
  const existing = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  const question = existing
    ? 'Replace your saved city with this new plan? A recovery snapshot will be made first.'
    : 'Save this new plan as your city? A recovery snapshot will be made first.';
  if (!window.confirm(question)) return;
  const result = projectState.commit({ layout: JSON.stringify(draft) }, { source: 'new-city-copy', recovery: true, requireRecovery: true });
  if (!result.ok) { toast(result.error || 'Could not save your city.'); return; }
  window.location.href = '/planner/';
});
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
  state.goalTab = 'mayor';
  updateGoalsTabs();
});
document.getElementById('goals-tab-custom').addEventListener('click', () => {
  state.goalTab = 'custom';
  updateGoalsTabs();
});
document.getElementById('btn-mayor-balanced').addEventListener('click', () => {
  state.goalTab = 'mayor';
  state.goals = defaultGoals();
  renderSliders();
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
  renderSelectedInfo();
  render();
}
viewHappy.addEventListener('click', () => setViewMode('happy'));
viewWalk.addEventListener('click', () => setViewMode('walk'));
viewRanges.addEventListener('click', () => setViewMode('ranges'));

// Road template menu
const templateBtn = document.getElementById('btn-template');
renderTemplates();
let templateFocusReturn = null;
function closeTemplateMenu() {
  if (templateMenu.classList.contains('hidden')) return;
  templateMenu.classList.add('hidden');
  if (templateFocusReturn) templateFocusReturn.focus();
  templateFocusReturn = null;
}
templateBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!templateMenu.classList.contains('hidden')) return closeTemplateMenu();
  templateFocusReturn = document.activeElement;
  templateMenu.classList.remove('hidden');
  templateMenu.querySelector('.template-item')?.focus();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.template-wrap')) closeTemplateMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTemplateMenu(); });

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
   if (f.size > MAX_IMPORT_BYTES) { toast(t('ui.tooLarge')); importFileInput.value = ""; return; }
   const reader = new FileReader();
   reader.onerror = () => toast(t('ui.readFail'));
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
    if (!v.ok) { toast(t('ui.invalid')); return; }
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
  wireCloudModal();
  mountLangToggle('.actions');
  applyStatic();
  if (exampleMode) {
    document.body.classList.add('example-plan');
    const banner = document.getElementById('example-plan-banner');
    if (banner) banner.hidden = false;
  }
  if (newCityMode) {
    document.getElementById('new-plan-banner').hidden = false;
  }
  let saved = null;
  if (exampleMode) {
    const draft = readExampleDraft() || buildSampleCity();
    saved = JSON.stringify(draft);
    writeExampleDraft(draft);
  } else if (newCityMode) {
    const draft = readNewCityDraft() || resetNewCityDraft();
    saved = draft ? JSON.stringify(draft) : null;
  } else {
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const v = validateLayout(parsed);
      if (v.ok) {
        state.layout = sanitizeLayout(parsed);
        state.goals = readGoals(parsed.goals);
        rememberRawLayout(saved);
        state.goalTab = state.goals.mode === 'mayor' || state.goals.mode === 'default' ? 'mayor' : 'custom';
      }
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
  if (!exampleMode) maybeShowCoach();
  _booted = true;   // from here on, auto-save changes announce themselves
  // Offer to join a restored city's loose roads once, non-blockingly. The child
  // can always say "Not now" and the roads stay exactly as drawn.
  if (!exampleMode && refreshConnect() > 0 && !state.connectAsked) {
    state.connectAsked = true;
    setTimeout(() => { if (state.connectCount > 0) offerConnect(); }, 700);
  }
})();

// Presentation preference travels with the plan, without entering its metrics.
const sceneryToggle=document.createElement('label');sceneryToggle.className='planner-scenery';
sceneryToggle.innerHTML='<input id="auto-scenery" type="checkbox"><span></span>';
const sceneryInput=sceneryToggle.querySelector('input');
function refreshSceneryToggle(){if(!document.getElementById('auto-scenery'))return;const zh=currentLang()==='zh-Hant';sceneryInput.checked=state.layout.autoScenery!==false;sceneryToggle.querySelector('span').textContent=zh?'自動佈置':'Automatic scenery';sceneryToggle.title=zh?'在3D城市加入花園、植物和街道擺設。關閉後仍保留你放置的物件。':'Add gardens, plants and street furniture in 3D. Your own objects always stay.';}
sceneryInput.addEventListener('change',()=>{state.layout.autoScenery=sceneryInput.checked;flushAutosave();});
document.querySelector('#planner-more .secondary-tools')?.append(sceneryToggle);
window.addEventListener('i18n:change',refreshSceneryToggle);
refreshSceneryToggle();
