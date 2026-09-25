// city-builder/recycling-station.js — Stage 4: run the student's published IMAGE
// classifier on a live conveyor, and let its PREDICTION choose the bin.
//
// The honesty rules the plan names, enforced here:
//   • The prediction selects the bin. Ground truth is shown and scored SEPARATELY
//     and never routes — a wrong prediction visibly enters the wrong bin.
//   • Abstention sends the item to the human-check tray.
//   • The City does NOT run MobileNet live: it feeds the curated library feature
//     vectors (the same ones the Workshop extractor produced) and refuses a bundle
//     whose extractor identity does not match.
//   • Fixed-seed sets (normal / confusing / unfamiliar) so a revision is re-run
//     against the SAME batch and two students compare the same items.
//
// The skill is resolved from the authoritative project envelope (the Workshop's
// published capability + its installation) and run through `store.runSkill`; a
// planted image `.cap` is the offline fallback. Both go through the ONE pure
// `recycling.js` routing rule, so the two paths can never disagree.
import { createProjectStore } from '../city-common/project-store.js';
import { challengeOfCapability } from '../city-common/challenges.js';
import { parseCapability } from '../city-common/cap-runtime.js';
import { buildImageCapabilityV2 } from '../city-common/capability-export.js';
import {
  BINS, RECYCLING_LABELS, RECYCLING_PREPROCESSING, RECYCLING_DIMENSION,
  isImageCapability, checkCompatibility,
  routeItem, routeResult, scoreRun, selectItems, setSizeFor,
} from '../city-common/recycling.js';
import { currentLang } from './i18n.js';

const LIB = '../workshop/assets/library';
const LESSON = '../workshop/assets/lesson';
const CAPS_KEY = 'p5_city_capabilities_v1';
const STORE_NAME = 'passiona-projects-v1';

const STR = {
  en: {
    title: 'Recycling Station', subtitle: 'Your photo model sorts the conveyor.',
    run: 'Run the belt', reset: 'Reset', improving: 'Improve in the Workshop',
    kindNormal: 'Everyday items', kindConfusing: 'Look-alikes', kindUnfamiliar: 'Never taught',
    noModel: 'No image model yet. Train one in the Workshop, then publish it to this station.',
    openWorkshop: 'Open the Workshop', scored: 'Scored against the answer key (never used for routing)',
    correct: 'right', wrong: 'wrong', abstained: 'not sure', tray: 'Human-check tray',
    bin: 'Bin', predicted: 'model said', truth: 'answer key', confidence: 'confidence',
    nearest: 'nearest studied photos', idle: 'Press “Run the belt”.', running: 'Running…',
    mismatch: 'That model was trained on different photo features — it cannot run here.',
    planted: 'planted file', published: 'published in this project',
    empty: 'Nothing to sort.', rerun: 'Run the same batch again after improving your model.',
  },
  'zh-Hant': {
    title: '回收分類站', subtitle: '你的相片模型正在為輸送帶分類。',
    run: '運行輸送帶', reset: '重設', improving: '到工作坊改進',
    kindNormal: '日常物品', kindConfusing: '相似物品', kindUnfamiliar: '未曾教過',
    noModel: '還沒有影像模型。請先在工作坊訓練，然後發佈到這個分類站。',
    openWorkshop: '開啟工作坊', scored: '對照答案評分（永不影響分流）',
    correct: '正確', wrong: '錯誤', abstained: '不確定', tray: '人手檢查盤',
    bin: '回收箱', predicted: '模型判斷', truth: '答案', confidence: '信心',
    nearest: '最接近的已學相片', idle: '按「運行輸送帶」。', running: '運行中…',
    mismatch: '這個模型是用不同的相片特徵訓練的 —— 無法在此運行。',
    planted: '已種入檔案', published: '已發佈於此專案',
    empty: '沒有可分類的物品。', rerun: '改進模型後，可再運行同一批次。',
  },
};
const lang = () => (currentLang() === 'zh-Hant' ? 'zh-Hant' : 'en');
const t = (key) => STR[lang()][key] ?? STR.en[key] ?? key;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── the curated photo library (the City's own copy of the Workshop assets) ──
let cataloguePromise = null;
function injectScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error(`missing ${src}`));
    document.head.append(s);
  });
}
function loadCatalogue() {
  if (window.WorkshopLibraryData?.trashnet) return Promise.resolve(window.WorkshopLibraryData.trashnet);
  if (!cataloguePromise) cataloguePromise = injectScript(`${LIB}/catalogue.js`).then(() => window.WorkshopLibraryData?.trashnet || null);
  return cataloguePromise;
}

const chunkCache = new Map();
/** Decode one shipped feature chunk into unit vectors for the wanted rows. */
function loadChunk(index, wantedRows) {
  const key = `${index}|${[...wantedRows].map((r) => r.id).sort().join(',')}`;
  if (chunkCache.has(key)) return chunkCache.get(key);
  // The chunk scripts assign into this global (the Workshop initializes it too); create it
  // first or the assignment inside the classic script throws and no features arrive.
  window.WorkshopLibraryChunks = window.WorkshopLibraryChunks || {};
  const p = injectScript(`${LIB}/features-${String(index).padStart(3, '0')}.js`).then(() => {
    const b64 = window.WorkshopLibraryChunks?.[index];
    delete window.WorkshopLibraryChunks?.[index];
    if (!b64) throw new Error('missing features');
    const raw = atob(b64);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const out = new Map();
    for (const row of wantedRows) {
      const v = new Array(1024);
      let n = 0;
      for (let i = 0; i < 1024; i++) { const x = view.getFloat32((row.offset * 1024 + i) * 4, true); v[i] = x; n += x * x; }
      n = Math.sqrt(n) || 1;
      out.set(row.id, v.map((x) => x / n));
    }
    return out;
  });
  chunkCache.set(key, p);
  p.catch(() => chunkCache.delete(key));
  return p;
}
/** All wanted rows' unit vectors, grouped so each chunk is fetched once. */
async function featuresFor(rows) {
  const byChunk = new Map();
  for (const r of rows) { if (!byChunk.has(r.chunk)) byChunk.set(r.chunk, []); byChunk.get(r.chunk).push(r); }
  const out = new Map();
  for (const [chunk, chunkRows] of byChunk) {
    const map = await loadChunk(chunk, chunkRows);
    for (const [id, vec] of map) out.set(id, vec);
  }
  return out;
}

// ── resolving the student's published skill ─────────────────────────────────
function readPlantedCaps() {
  try { const a = JSON.parse(localStorage.getItem(CAPS_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

/**
 * Prefer the authoritative envelope: a published image capability plus its sorter
 * installation, run through `store.runSkill`. Fall back to a planted image .cap so
 * a student who imported a file (or works offline) is never stuck.
 */
export async function resolveStationSkill() {
  try {
    const store = createProjectStore();
    await store.openActiveProject();
    const [caps, installs] = await Promise.all([store.readCapabilities(), store.readInstallations()]);
    for (const inst of Object.values(installs || {})) {
      const cap = caps?.[inst.capabilityRef];
      if (cap && isImageCapability(cap)) return { kind: 'installation', store, installationId: inst.id, cap, origin: t('published') };
    }
    const published = Object.values(caps || {}).find(isImageCapability);
    if (published) return { kind: 'capability', store, cap: published, origin: t('published') };
  } catch { /* no envelope yet — fall through to a planted file */ }
  for (const raw of readPlantedCaps()) {
    const parsed = parseCapability(raw);
    const cap = parsed.ok ? parsed.capability : raw;
    if (isImageCapability(cap)) return { kind: 'planted', cap, origin: t('planted') };
  }
  return null;
}

async function runOne(skill, item) {
  if (skill.kind === 'installation') {
    const r = await skill.store.runSkill(skill.installationId, { vector: item.vector });
    if (!r || !r.ok) return routeResult({ decision: null, abstained: true, abstainReason: r?.error || 'run-failed' }, item);
    return routeResult(r, item);
  }
  return routeItem(skill.cap, item);
}

// ── the modal UI ────────────────────────────────────────────────────────────
function binById(id) { return BINS.find((b) => b.id === id) || BINS[BINS.length - 1]; }

let modal = null;
let controller = null;

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'recycle-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="recycle-card">
      <header class="recycle-head">
        <div>
          <h2>♻ <span data-r="title"></span></h2>
          <p class="recycle-sub" data-r="subtitle"></p>
        </div>
        <button class="recycle-close" type="button" aria-label="Close">✕</button>
      </header>
      <div class="recycle-controls">
        <label><span data-r="kindLabel">Set</span>
          <select data-r="kind">
            <option value="normal"></option><option value="confusing"></option><option value="unfamiliar"></option>
          </select></label>
        <button class="recycle-run" type="button" data-r="run"></button>
        <button class="recycle-reset" type="button" data-r="reset"></button>
        <a class="recycle-improve" data-r="improve" hidden></a>
      </div>
      <p class="recycle-status" data-r="status" aria-live="polite"></p>
      <div class="recycle-belt" data-r="belt" aria-label="conveyor"></div>
      <div class="recycle-bins" data-r="bins"></div>
      <section class="recycle-evidence" data-r="evidence"></section>
      <footer class="recycle-score" data-r="score"></footer>
    </div>`;
  document.body.append(modal);
  modal.querySelector('.recycle-close').addEventListener('click', () => close());
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  return modal;
}

function paintStatic() {
  const q = (r) => modal.querySelector(`[data-r="${r}"]`);
  q('title').textContent = t('title');
  q('subtitle').textContent = t('subtitle');
  q('kindLabel').textContent = t('kindNormal').split(' ')[0]; // "Set"/"集合" — label only
  const sel = q('kind');
  sel.options[0].textContent = t('kindNormal');
  sel.options[1].textContent = t('kindConfusing');
  sel.options[2].textContent = t('kindUnfamiliar');
  q('run').textContent = t('run');
  q('reset').textContent = t('reset');
  q('improve').textContent = t('improving');
}

function renderBins(counts) {
  const wrap = modal.querySelector('[data-r="bins"]');
  wrap.innerHTML = BINS.map((b) => {
    const n = counts?.[b.id] || 0;
    return `<div class="recycle-bin${b.id === 'human-check' ? ' recycle-bin-tray' : ''}" data-bin="${b.id}">
      <span class="recycle-bin-emoji" aria-hidden="true">${b.emoji}</span>
      <span class="recycle-bin-label">${esc(b.label === '__abstain' ? t('tray') : b.label)}</span>
      <span class="recycle-bin-count">${n}</span>
    </div>`;
  }).join('');
}

function renderEvidence(result, rowIndex, featureRows) {
  const pane = modal.querySelector('[data-r="evidence"]');
  if (!result) { pane.innerHTML = ''; return; }
  const row = rowIndex.get(result.id);
  const src = row ? `${LESSON}/${String(row.src).replace(/^assets\/lesson\//, '')}` : '';
  const truthBin = row ? BINS.find((b) => b.label === row.label) : null;
  const near = (result.evidence || []).map((e) => {
    const id = String(e.exampleId || '').replace(/^library:/, '');
    const r = rowIndex.get(id);
    const img = r ? `<img class="recycle-nearest-img" src="${LESSON}/${String(r.src).replace(/^assets\/lesson\//, '')}" alt="${esc(e.label)}" loading="lazy">` : '';
    return `<figure class="recycle-nearest">${img}<figcaption>${esc(e.label)} · d=${esc(e.distance)}</figcaption></figure>`;
  }).join('');
  pane.innerHTML = `
    <div class="recycle-evidence-main">
      ${src ? `<img class="recycle-item-img" src="${src}" alt="${esc(row?.label || '')}" loading="lazy">` : ''}
      <dl>
        <dt>${t('predicted')}</dt><dd><b>${esc(result.abstained ? t('abstained') : result.decision)}</b> → ${esc(binById(result.bin).label === '__abstain' ? t('tray') : binById(result.bin).label)}</dd>
        <dt>${t('confidence')}</dt><dd>${esc(result.confidence)}</dd>
        <dt>${t('truth')}</dt><dd>${esc(row?.label || '—')}${truthBin ? ` → ${esc(truthBin.label)}` : ''}</dd>
      </dl>
    </div>
    ${near ? `<p class="recycle-nearest-title">${t('nearest')}</p><div class="recycle-nearest-row">${near}</div>` : ''}`;
}

function renderScore(results) {
  const foot = modal.querySelector('[data-r="score"]');
  if (!results.length) { foot.innerHTML = `<span class="recycle-score-note">${t('scored')}</span>`; return; }
  const s = scoreRun(results);
  foot.innerHTML = `<span class="recycle-score-note">${t('scored')}</span>
    <span class="recycle-score-line"><b>${s.correct}</b> ${t('correct')} · <b>${s.wrong}</b> ${t('wrong')} · <b>${s.abstained}</b> ${t('abstained')} · ${s.total}</span>`;
}

function countsFor(results) {
  const counts = {};
  for (const r of results) counts[r.bin] = (counts[r.bin] || 0) + 1;
  return counts;
}

/** Animate one chip travelling the belt to its bin, then landing. */
function animateChip(item, result) {
  const belt = modal.querySelector('[data-r="belt"]');
  const chip = document.createElement('div');
  chip.className = 'recycle-chip';
  chip.dataset.bin = result.bin;
  const src = item.src ? `<img src="${item.src}" alt="" loading="lazy">` : '';
  chip.innerHTML = `${src}<span class="recycle-chip-bin">${esc(result.abstained ? t('abstained') : result.decision)}</span>`;
  belt.append(chip);
  return new Promise((resolve) => {
    requestAnimationFrame(() => { chip.classList.add('recycle-chip-land'); setTimeout(resolve, prefersReducedMotion() ? 0 : 260); });
  });
}
const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** The 3D AI nodes read this key; recording a real decision makes them react. */
function writeLastDecision(capId, result) {
  if (!capId) return;
  try {
    const key = 'p5_city_cap_lastdec_v1';
    const map = JSON.parse(localStorage.getItem(key) || '{}');
    map[capId] = { label: result.abstained ? '🤔 not sure' : String(result.decision), at: Date.now() };
    localStorage.setItem(key, JSON.stringify(map));
  } catch { /* storage full/private — the node simply keeps its previous colour */ }
}

/** Run one fixed-seed batch end to end. Exposed on the controller for tests. */
async function runBatch({ kind, seed }) {
  const status = modal.querySelector('[data-r="status"]');
  const skill = controller.skill;
  if (!skill) { status.textContent = t('noModel'); return { ok: false, error: 'no-model' }; }
  const compat = checkCompatibility(skill.cap);
  if (!compat.ok) { status.textContent = t('mismatch'); return { ok: false, error: compat.error }; }

  const catalogue = await loadCatalogue();
  if (!catalogue) { status.textContent = t('empty'); return { ok: false, error: 'no-catalogue' }; }
  const count = setSizeFor(kind);
  const rows = selectItems(catalogue.photos, { seed, kind, count, modelLabels: skill.cap.output?.labels });
  if (!rows.length) { status.textContent = t('empty'); return { ok: false, error: 'no-items' }; }
  const vectors = await featuresFor(rows);
  const rowIndex = new Map(catalogue.photos.map((r) => [r.id, r]));
  const labelByRow = new Map(rows.map((r) => [r.id, r.label]));

  status.textContent = `${t('running')} (${kind})`;
  modal.querySelector('[data-r="belt"]').innerHTML = '';
  renderBins({});
  renderScore([]);
  renderEvidence(null);

  const results = [];
  for (const row of rows) {
    const vector = vectors.get(row.id);
    const item = { id: row.id, label: labelByRow.get(row.id), vector, src: `${LESSON}/${String(row.src).replace(/^assets\/lesson\//, '')}` };
    const result = vector ? await runOne(skill, item) : routeResult({ decision: null, abstained: true, abstainReason: 'missing-features' }, item);
    results.push(result);
    writeLastDecision(skill.cap.id, result);
    renderEvidence(result, rowIndex);
    renderBins(countsFor(results));
    await animateChip(item, result);
  }
  renderScore(results);
  status.textContent = t('rerun');
  controller.last = { kind, seed, results };
  reportBatch({ kind, seed, results });
  return { ok: true, kind, seed, results, score: scoreRun(results) };
}

/**
 * Report a completed batch as evidence (implementation plan §2). Fire-and-forget
 * and once-per-challenge: the ledger refuses a replay, and the challenge scope —
 * not the machine — is what a reward is keyed to. `revision-fixed` is decided by
 * the store from the recorded run itself.
 */
function reportBatch({ kind, seed, results }) {
  const skill = controller?.skill;
  if (!skill || !skill.store || typeof skill.store.recordChallengeOutcome !== 'function') return;
  const challengeId = challengeOfCapability(skill.cap);
  if (!challengeId) return;
  const s = scoreRun(results);
  const installed = skill.kind === 'installation';
  const events = [
    { type: 'held-out-eval', evidence: { challengeId, batch: kind, seed, total: s.total, correct: s.correct, wrong: s.wrong, abstained: s.abstained } },
  ];
  if (installed) events.push({ type: 'city-install', evidence: { challengeId, installationId: skill.installationId, batch: kind, seed } });
  if (s.abstained > 0) events.push({ type: 'abstain-demo', evidence: { challengeId, source: 'recycling', batch: kind, seed, abstained: s.abstained } });
  const revision = Number(skill.cap?.revision || 1);
  Promise.resolve()
    .then(() => skill.store.recordChallengeOutcome(challengeId, { revision, scenario: { kind, seed }, results }, events))
    .catch(() => { /* a missing wallet must never break the run */ });
}

/**
 * Train a sorter from the REAL curated TrashNet photos and publish+install it, without
 * a Workshop round-trip. This is the browser integration run's deterministic entry point
 * (and a ready-made demo model) — the conveyor items it is tested against are always the
 * genuine 1024-dim curated features, never a mock.
 *
 * `labelShift` rotates the class names assigned to the study rows, producing a genuinely
 * different published model so a test can prove that changing the model changes sorting.
 */
async function trainFromLibrary({ perClass = 12, threshold = 0.2, labelShift = 0 } = {}) {
  const catalogue = await loadCatalogue();
  if (!catalogue) return { ok: false, error: 'no-catalogue' };
  const labels = RECYCLING_LABELS;
  const rows = [];
  for (const label of labels) rows.push(...catalogue.photos.filter((r) => r.label === label && r.split === 'train').slice(0, perClass));
  const vectors = await featuresFor(rows);
  const shifted = labels.map((_, i) => labels[(i + labelShift) % labels.length]);
  const examples = rows.map((r) => ({ label: shifted[labels.indexOf(r.label)], vector: vectors.get(r.id) }));
  const out = buildImageCapabilityV2({
    id: `cap_trashnet-knn${labelShift ? `-shift${labelShift}` : ''}`, name: 'Curated TrashNet sorter',
    labels: shifted, preprocessing: RECYCLING_PREPROCESSING, dimension: RECYCLING_DIMENSION,
    k: 3, threshold, examples,
  });
  if (!out.ok) return out;
  try {
    const store = createProjectStore();
    await store.openActiveProject();
    const pub = await store.publishSkill(out.capability);
    if (!pub.ok) return { ok: false, error: pub.error };
    await store.installSkill(pub.key, 'host-demo-sorter', { hostType: 'sorter' });
    if (controller) controller.skill = await resolveStationSkill();
    return { ok: true, key: pub.key, examples: examples.length };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function close() {
  if (modal) modal.classList.add('hidden');
}
function open() {
  ensureModal();
  paintStatic();
  modal.classList.remove('hidden');
  if (!controller.skill) {
    modal.querySelector('[data-r="status"]').textContent = t('noModel');
    const improve = modal.querySelector('[data-r="improve"]');
    improve.hidden = false; improve.textContent = t('openWorkshop');
  } else {
    const improve = modal.querySelector('[data-r="improve"]');
    improve.hidden = false; improve.textContent = t('improving');
    modal.querySelector('[data-r="status"]').textContent = t('idle');
  }
  renderBins({}); renderScore([]); renderEvidence(null);
}

/**
 * Open the station. Resolves the student's skill first so the UI can be honest
 * about what it will run. Returns the controller (for the browser integration run).
 */
export async function openRecyclingStation() {
  controller = controller || {
    open, close, runBatch,
    skill: null, last: null,
    async resolve() { this.skill = await resolveStationSkill(); return this.skill; },
  };
  controller.skill = await resolveStationSkill();
  const improve = ensureModal().querySelector('[data-r="improve"]');
  // "Improve in the Workshop" always points at the publish flow back to this page.
  try {
    const url = new URL('../workshop/', location.href);
    url.searchParams.set('publishTarget', 'city');
    url.searchParams.set('returnTo', location.href);
    improve.href = url.href;
  } catch { improve.removeAttribute('href'); }
  open();
  return controller;
}

// A stable handle for the browser integration run; also lets the City's own
// button open the station without importing the module twice.
if (typeof window !== 'undefined') window.__recyclingStation = { open: openRecyclingStation, trainFromLibrary, get controller() { return controller; } };
