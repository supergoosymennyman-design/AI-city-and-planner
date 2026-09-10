// city-common/milestones.js — durable "you did this" recognition.
//
// See docs/badges-and-tiers.md. Milestones are RECOGNITION, never gates: each
// records a demonstrated planning CAPABILITY, is never lost (a ratchet), and
// travels inside the Champion File (CF_KEYS.milestones) so it follows the child
// across devices and lessons. They render in the 3D city's Inspector's Logbook.
//
// Taxonomy rule: "a trigger that is quantity, time, or a perfect score is
// corrupt by definition." The old planner list chased coverage / zoning /
// spread >= 0.999 and score 95+ — the Overfitter's Trap (delete the awkward
// homes until the bar reads 100%). These are now LOCAL capability gates: prove
// you can do it once, and the stamp is yours. There are deliberately NO
// score-threshold milestones.
//
// Storage shape (v2): { version: 2, earned: [{ id, date, evidence }] }.
// The pre-durability planner stored a bare array of ids under the same key, so
// sanitizeMilestones() migrates that legacy shape.
import { METRIC_PARAMS, roadSegments, distToRoads, servicesNear } from './metrics.js';

export const MILESTONES_KEY = 'p5_city_milestones_v1';
const HOME = 'housing';

/**
 * The taxonomy. `test(ctx)` is a pure function returning an evidence object when
 * the capability is demonstrated, or null. ctx = { layout, metrics, walk, params }.
 */
export const MILESTONES = [
  {
    id: 'first_connection',
    name: 'First Neighbourhood',
    nameZh: '第一個社區',
    msg: '🏠 Built your first connected neighbourhood — a home on a road, near a service!',
    msgZh: '🏠 你建立了第一個連繫社區設施的住宅區——住宅就在道路旁，附近有設施！',
    test: ({ layout }) => {
      const homes = (layout.buildings || []).filter((b) => b.type === HOME);
      const segs = roadSegments(layout);
      if (!homes.length || !segs.length) return null;
      for (const h of homes) {
        const nearRoad = distToRoads(h.pos[0], h.pos[1], segs) <= METRIC_PARAMS.accessibleDist;
        const served = servicesNear(layout, h).length > 0;
        if (nearRoad && served) return { homes: homes.length, onRoad: true, served: true };
      }
      return null;
    },
  },
  {
    id: 'services_nearby',
    name: 'Services Nearby',
    nameZh: '設施在附近',
    msg: '🏘️ A neighbourhood with easy access to several services!',
    msgZh: '🏘️ 建立了一個能輕鬆享用多種設施的便利社區！',
    test: ({ layout }) => {
      for (const h of (layout.buildings || []).filter((b) => b.type === HOME)) {
        const near = [...new Set(servicesNear(layout, h))].sort();
        if (near.length >= 3) return { home: h.pos.slice(), services: near };
      }
      return null;
    },
  },
  {
    id: 'safe_routes',
    name: 'Real Walking Routes',
    nameZh: '真實步行路線',
    msg: '🚶 Connected homes to a school or hospital using real roads!',
    msgZh: '🚶 用道路將民居和學校或醫院連接起來！',
    test: ({ walk }) => {
      if (!walk || !Array.isArray(walk.homes)) return null;
      for (const h of walk.homes) {
        if (h && h.ok && (h.ok.school || h.ok.hospital)) {
          return { school: !!h.ok.school, hospital: !!h.ok.hospital, budget: walk.budget };
        }
      }
      return null;
    },
  },
  {
    id: 'smart_zoning',
    name: 'Quiet Neighbourhood',
    nameZh: '寧靜社區',
    msg: '🤫 Placed a noisy building safely away from homes!',
    msgZh: '🤫 將發出噪音的建築物建在遠離民居的安全位置！',
    test: ({ layout }) => {
      const noisy = (layout.buildings || []).filter((b) => METRIC_PARAMS.noisyTypes.includes(b.type));
      const homes = (layout.buildings || []).filter((b) => b.type === HOME);
      if (!noisy.length || !homes.length) return null;
      for (const n of noisy) {
        let nearest = Infinity;
        for (const h of homes) nearest = Math.min(nearest, Math.hypot(h.pos[0] - n.pos[0], h.pos[1] - n.pos[1]));
        if (nearest >= METRIC_PARAMS.zoningDist) return { type: n.type, nearestHome: Math.round(nearest) };
      }
      return null;
    },
  },
  {
    id: 'spread_services',
    name: 'Covering More Ground',
    nameZh: '覆蓋更廣',
    msg: '🧩 Spread services out so more of the city is covered!',
    msgZh: '🧩 將社區設施分佈在不同地區，擴大覆蓋範圍！',
    test: ({ layout }) => {
      const buildings = layout.buildings || [];
      for (const t of METRIC_PARAMS.serviceTypes) {
        const list = buildings.filter((b) => b.type === t);
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const d = Math.hypot(list[i].pos[0] - list[j].pos[0], list[i].pos[1] - list[j].pos[1]);
            if (d > METRIC_PARAMS.coverageDist * 2) return { type: t, distance: Math.round(d) };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'green_nearby',
    name: 'Green Nearby',
    nameZh: '綠意就在附近',
    msg: '🌳 Put green space within reach of a home!',
    msgZh: '🌳 讓住宅附近就有綠化空間！',
    test: ({ layout }) => {
      const parks = layout.parks || [];
      const homes = (layout.buildings || []).filter((b) => b.type === HOME);
      if (!parks.length || !homes.length) return null;
      for (const h of homes) {
        for (const p of parks) {
          const d = Math.hypot(h.pos[0] - p.cx, h.pos[1] - p.cz) - (p.radius || 0);
          if (d <= METRIC_PARAMS.coverageDist) return { home: h.pos.slice(), park: [p.cx, p.cz] };
        }
      }
      return null;
    },
  },
];

export const MILESTONE_IDS = MILESTONES.map((m) => m.id);
const BY_ID = new Map(MILESTONES.map((m) => [m.id, m]));

/** Metadata for one milestone id (or null). */
export function milestone(id) { return BY_ID.get(id) || null; }

export const defaultMilestoneState = () => ({ earned: [], version: 2 });

/**
 * Normalise any stored value to the v2 shape. Legacy `["first_home", …]` (the
 * pre-durability planner format) migrates to dated entries. Unknown or corrupt
 * ids are dropped; duplicates collapse; order is preserved.
 */
export function sanitizeMilestones(raw) {
  let entries = [];
  if (Array.isArray(raw)) entries = raw.map((id) => ({ id }));
  else if (raw && typeof raw === 'object' && Array.isArray(raw.earned)) entries = raw.earned;
  const seen = new Set();
  const earned = [];
  for (const e of entries) {
    const id = typeof e === 'string' ? e : (e && e.id);
    if (!id || seen.has(id) || !BY_ID.has(id)) continue;
    seen.add(id);
    earned.push({
      id,
      date: e && typeof e.date === 'string' ? e.date : null,
      evidence: e && e.evidence && typeof e.evidence === 'object' ? e.evidence : {},
    });
  }
  return { earned, version: 2 };
}

export function readMilestones(storage = defaultStorage()) {
  if (!storage) return defaultMilestoneState();
  try { return sanitizeMilestones(JSON.parse(storage.getItem(MILESTONES_KEY) || 'null')); }
  catch { return defaultMilestoneState(); }
}

export function writeMilestones(state, storage = defaultStorage()) {
  if (!storage) return false;
  try { storage.setItem(MILESTONES_KEY, JSON.stringify(sanitizeMilestones(state))); return true; }
  catch { return false; }
}

export function earnedIds(state) {
  return new Set(sanitizeMilestones(state).earned.map((e) => e.id));
}

export function hasMilestone(state, id) { return earnedIds(state).has(id); }

/** Award one milestone if not already earned. Ratchet: never lost, never repeats. */
export function awardMilestone(state, id, evidence = {}, date = new Date().toISOString()) {
  const s = sanitizeMilestones(state);
  if (!BY_ID.has(id)) return { ok: false, state: s, error: 'unknown milestone' };
  if (s.earned.some((e) => e.id === id)) return { ok: false, state: s, error: 'already earned' };
  s.earned.push({ id, date, evidence });
  return { ok: true, state: s };
}

/** Pure: which un-earned milestones does this city newly satisfy? */
export function evaluateMilestones(ctx, state = defaultMilestoneState()) {
  const won = earnedIds(state);
  const hits = [];
  for (const ms of MILESTONES) {
    if (won.has(ms.id)) continue;
    let evidence = null;
    try { evidence = ms.test(ctx); } catch { evidence = null; }
    if (evidence) hits.push({ id: ms.id, evidence });
  }
  return hits;
}

/**
 * Pure HTML for the Logbook's milestone section (used by the 3D Inspector's
 * Logbook). Kept DOM-free so the copy + earned/locked state are unit-testable.
 * Recognition only — locked rows are visible ("not earned yet"), never hidden
 * and never a gate.
 */
export function milestoneSectionHTML(state, lang = 'en') {
  const zh = lang === 'zh-Hant';
  const s = sanitizeMilestones(state);
  const won = earnedIds(s);
  const rows = MILESTONES.map((ms) => {
    const got = won.has(ms.id);
    const entry = s.earned.find((e) => e.id === ms.id);
    const date = got && entry && entry.date ? String(entry.date).slice(0, 10) : '';
    return `<div class="logbook-ms ${got ? 'earned' : 'locked'}">
        <div class="ms-stamp" aria-hidden="true">${got ? '★' : '☆'}</div>
        <div>
          <div class="ms-name">${zh ? ms.nameZh : ms.name}</div>
          <div class="ms-blurb">${got ? (zh ? ms.msgZh : ms.msg) : (zh ? '尚未獲得' : 'Not earned yet')}${date ? ` · ${date}` : ''}</div>
        </div>
      </div>`;
  }).join('');
  return `<div class="logbook-section-title">${zh ? '你獲得的里程碑' : 'Milestones you earned'}</div>`
    + `<div class="logbook-ms-intro">${zh
      ? '這本日誌記錄了你為城市作出的明智規劃。這裡的每一個印記，都代表你運用了新的規劃技巧，讓市民的生活變得更美好！'
      : 'This logbook records the smart planning choices you\'ve made for our city. Every stamp here shows a new skill you\'ve used to make life better for the people living here!'}</div>`
    + rows;
}

function defaultStorage() {
  return (typeof window !== 'undefined' && window.localStorage) || null;
}
