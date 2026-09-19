// city-common/badges.js — the Inspector's progression (see docs/badges-and-tiers.md).
//
// MVP scope: the DATA MODEL + display only. A badge is a retroactive diploma —
// recognition validates what the child did; it never gates anything. Tiers are
// role-named conceptual depth (Builder → Skeptic → Auditor → Architect), not rank.
//
// Award logic is intentionally NOT wired yet: badges are triggered by `.cap`
// capability evidence (docs/capability-bridge.md), which flows once the Workshop
// export + city runtime exist. Until then the child's state is the lowest tier
// ("Builder") and the HUD shows it. When evidence arrives, `promote()` is the
// pure, testable seam the award engine calls — no UI rework needed.
export const BADGES_KEY = 'p5_city_badges_v1';

export const TIERS = [
  { id: 'builder',   order: 1, name: 'Builder',   nameZh: '建造者',   blurb: 'It works — you built a machine that learns from examples.', blurbZh: '可行了 — 你造了一台能從例子學習的機器。' },
  { id: 'skeptic',   order: 2, name: 'Skeptic',   nameZh: '質疑者',   blurb: 'You proved it — you split the data and tested on what it never saw.', blurbZh: '你證明了 — 你把資料分開，用從未見過的資料測試。' },
  { id: 'auditor',   order: 3, name: 'Auditor',   nameZh: '審計員',   blurb: 'You found its limits — you set "not sure" and traced wrong answers.', blurbZh: '你找到了它的極限 — 你設定了「不確定」，並追蹤錯誤答案。' },
  { id: 'architect', order: 4, name: 'Architect', nameZh: '建築師',   blurb: 'You compose systems — you wired tested machines together.', blurbZh: '你組裝系統 — 你把經測試的機器接在一起。' },
];

/** An earned badge records the EVIDENCE, not just the id (Evidence Protocol). */
export const defaultBadgeState = () => ({
  tier: 'builder',           // current (highest) earned tier id
  earned: [],                // [{ id, name, earnedAt, evidence:{ heldOut, abstainRate, threshold } }]
  version: 1,
});

export function sanitizeBadges(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultBadgeState();
  const tier = TIERS.some((t) => t.id === raw.tier) ? raw.tier : 'builder';
  const earned = Array.isArray(raw.earned)
    ? raw.earned.filter((b) => b && typeof b === 'object' && TIERS.some((t) => t.id === b.id))
    : [];
  return { tier, earned, version: 1 };
}

export function readBadges(storage = defaultStorage()) {
  if (!storage) return defaultBadgeState();
  try {
    const raw = JSON.parse(storage.getItem(BADGES_KEY) || 'null');
    return sanitizeBadges(raw);
  } catch { return defaultBadgeState(); }
}

export function writeBadges(state, storage = defaultStorage()) {
  if (!storage) return false;
  try { storage.setItem(BADGES_KEY, JSON.stringify(sanitizeBadges(state))); return true; }
  catch { return false; }
}

/** The tier object the child is currently on (for the HUD emblem). */
export function tierOf(state) {
  const t = TIERS.find((t) => t.id === (state && state.tier));
  return t || TIERS[0];
}

/**
 * Promote to a tier IF it's a real step up (ratchet — never downgrade) and the
 * evidence is present. This is the pure seam the award engine will call when
 * `.cap` evidence arrives; not called by any UI yet.
 * @returns {{ok:boolean, state?:object, error?:string}}
 */
export function promote(state, targetTierId, evidence = {}) {
  const s = sanitizeBadges(state);
  const target = TIERS.find((t) => t.id === targetTierId);
  if (!target) return { ok: false, error: 'unknown tier' };
  const current = tierOf(s);
  if (target.order <= current.order) return { ok: false, error: 'not a step up' };
  if (typeof evidence.heldOut !== 'number' || evidence.heldOut <= 0) {
    return { ok: false, error: 'no held-out evidence' };
  }
  const next = { ...s, tier: target.id };
  if (!next.earned.some((b) => b.id === target.id)) {
    next.earned = [...next.earned, {
      id: target.id,
      name: target.name,
      earnedAt: new Date().toISOString(),
      evidence: {
        heldOut: Math.round(evidence.heldOut * 100) / 100,
        abstainRate: evidence.abstainRate != null ? Math.round(evidence.abstainRate * 100) / 100 : null,
        threshold: evidence.threshold != null ? Math.round(evidence.threshold * 100) / 100 : null,
      },
    }];
  }
  return { ok: true, state: next };
}

function defaultStorage() {
  return (typeof window !== 'undefined' && window.localStorage) || null;
}
