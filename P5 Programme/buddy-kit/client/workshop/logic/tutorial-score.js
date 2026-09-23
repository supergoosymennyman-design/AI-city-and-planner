/**
 * tutorial-score.js — the pure topological matcher + weighted scorer behind the car-gallery
 * "Test yourself" challenge (plan T2, D3/D8).
 *
 * WHY a NEW scorer: `logic/score.js` grades a sealed RUN by per-bin purity + coverage — it knows
 * nothing about the STRUCTURE of a machine. The challenge asks a different question: "did the child
 * restore the pieces and connections we removed?" That is a graph/multiset comparison, so it lives
 * here, untouched by the engine.
 *
 * THE MODEL (D8): matching is TOPOLOGICAL, never positional. Two tables with identical pieces
 * (`{type, propsKey}`) and identical edges (`{kind, from, to}`) match even when every card has been
 * moved in x/y — which happens constantly, because `Layout.unoverlap` bumps `y` at load.
 *
 * THE SCORE (D3), one canonical formula:
 *     score = 100 × max(0, (correct restoration weight) − (extra item count)) / (all removed weight)
 * clamped 0–100. A part is worth `weights.part` (default 3); a snap or wire is worth `weights.wire`
 * (default 1). An EXTRA item always costs ONE unit regardless of its kind — it is an item count, not
 * a weighted one, so dropping two stray parts costs 2, not 6.
 *
 * TERMS:
 *   target — the set of REMOVED items the challenge asks the child to restore (the answer key).
 *   attempt — the child's table at Submit.
 *   correct — a target item present in the attempt (weighted; the numerator's positive term).
 *   missing — a target slot the attempt left empty.
 *   wrong   — a target PART slot the attempt filled with a different `{type, propsKey}`.
 *             (A mis-routed edge surfaces as missing + extra: the target edge is gone and the
 *             attempt's stray edge is extra. Edges have no independent slot identity.)
 *   extra   — an attempt item that matches no target item.
 */

(function () {
  'use strict';

const DEFAULT_WEIGHTS = { part: 3, wire: 1 };

// The whitelist is a byte-identical copy of T1's `logic/tutorial-script.js` propsKey: T2 stays
// self-contained, and tutorial-score.test.js pins the parity over every gallery piece so the two
// can never silently drift. x/y/fx/fy/id are absent on purpose — matching is topological.
const PROP_KEYS = [
  'target', 'test', 'n', 'senseId', 'brainId', 'watchPiece', 'watchBlock', 'watchDial',
  'name', 'field', 'colour', 'seconds', 'operation', 'left', 'leftName', 'right', 'rightName',
  'mode', 'items', 'rate', 'speed', 'penalty', 'exits', 'arm',
  'schema', 'libraryData', 'dataset', 'split', 'kind', 'label', 'min', 'max', 'value',
  'training', 'validation', 'power', 'weight',
];

/** Recursively sort object keys so the same config always serialises to the same string. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

/**
 * Canonical config string (no id, no x/y), byte-identical to T1's `propsKey`.
 * @param {object} piece
 * @returns {string}
 */
function propsKey(piece) {
  const picked = {};
  for (const k of PROP_KEYS.slice().sort()) {
    if (piece && piece[k] !== undefined) picked[k] = canonical(piece[k]);
  }
  return JSON.stringify(picked);
}

/** One end of a connection as a comparable string: `"dc_t1:out"` (snap) or `"dc_cnt:atN"` (wire). */
function endKey(end, nodeKey) {
  if (!end) return '?:?';
  return String(end[nodeKey]) + ':' + String(end.port !== undefined ? end.port : end.end);
}

/**
 * Extract the canonical, POSITION-INDEPENDENT signature of a table.
 * @param {{pieces?:Array, snaps?:Array, wires?:Array}} table
 * @returns {{parts: Array<{type:string, propsKey:string, slotKey:string}>,
 *            edges: Array<{kind:'snap'|'wire', from:string, to:string}>}}
 */
function topology(table) {
  const t = table || {};
  const pieces = Array.isArray(t.pieces) ? t.pieces : [];
  const snaps = Array.isArray(t.snaps) ? t.snaps : [];
  const wires = Array.isArray(t.wires) ? t.wires : [];

  const parts = pieces.map((p, i) => ({
    type: p.type,
    propsKey: propsKey(p),
    // The slot's identity: the authored piece id, which survives a pure x/y shift. A piece without
    // an id still gets a stable per-table label so nothing throws.
    slotKey: p.id !== undefined && p.id !== null ? String(p.id) : '#' + i,
  }));

  const edges = [];
  for (const s of snaps) edges.push({ kind: 'snap', from: endKey(s.from, 'piece'), to: endKey(s.to, 'piece') });
  for (const w of wires) edges.push({ kind: 'wire', from: endKey(w.from, 'block'), to: endKey(w.to, 'block') });
  return { parts, edges };
}

/** The externally-reported shape of a part bucket entry. */
function partEntry(p) {
  return { kind: 'part', type: p.type, propsKey: p.propsKey, slotKey: p.slotKey };
}

/** The externally-reported shape of an edge bucket entry. */
function edgeEntry(e) {
  return { kind: e.kind, from: e.from, to: e.to };
}

/**
 * Bucket a target against an attempt by topology alone.
 * @returns {{missing:Array, wrong:Array, extra:Array}} see the module header for the semantics.
 */
function classify(target, attempt) {
  const T = topology(target);
  const A = topology(attempt);

  // Match part identities before edges. Retained ids are fixed; rebuilt duplicates
  // are assigned jointly by their connections, not by array order or position.
  const mapping = new Map(), used = new Set();
  const pending = [];
  for (const tp of T.parts) {
    const ap = A.parts.find(p => p.slotKey === tp.slotKey);
    if (ap) { mapping.set(ap.slotKey, tp.slotKey); used.add(ap.slotKey); }
    else pending.push(tp);
  }
  const remapEnd = (key, map) => {
    const i = key.lastIndexOf(':');
    return (map.get(key.slice(0, i)) || key.slice(0, i)) + key.slice(i);
  };
  const mappedProps = (part, map) => {
    const props = JSON.parse(part.propsKey);
    for (const key of ['watchPiece', 'watchBlock']) if (map.has(props[key])) props[key] = map.get(props[key]);
    return JSON.stringify(props);
  };
  const edgeKey = e => JSON.stringify([e.kind, e.from, e.to]);
  const edgeMatches = map => {
    const counts = new Map();
    for (const e of T.edges) counts.set(edgeKey(e), (counts.get(edgeKey(e)) || 0) + 1);
    let n = 0;
    for (const e of A.edges) {
      const key = edgeKey({ ...e, from: remapEnd(e.from, map), to: remapEnd(e.to, map) });
      if (counts.get(key)) { n++; counts.set(key, counts.get(key) - 1); }
    }
    return n;
  };
  // Tutorial examples are small. Branch only within equal-type groups; exact
  // configuration gets priority over connection credit, including partial attempts.
  pending.sort((a, b) => A.parts.filter(p => p.type === a.type).length - A.parts.filter(p => p.type === b.type).length);
  let best = new Map(mapping), bestValue = -Infinity;
  function assign(i) {
    if (i === pending.length) {
      let configCredit = 0;
      for (const ap of A.parts) {
        const tp = T.parts.find(p => p.slotKey === mapping.get(ap.slotKey));
        if (tp && tp.type === ap.type && tp.propsKey === mappedProps(ap, mapping)) configCredit++;
      }
      const value = (configCredit * (T.edges.length + 1) + edgeMatches(mapping)) * (T.parts.length + 1) + mapping.size;
      if (value > bestValue) { bestValue = value; best = new Map(mapping); }
      return;
    }
    const tp = pending[i];
    let candidates = A.parts.filter(p => !used.has(p.slotKey) && p.type === tp.type);
    candidates.sort((a, b) => Number(b.propsKey === tp.propsKey) - Number(a.propsKey === tp.propsKey));
    for (const ap of candidates) {
      used.add(ap.slotKey); mapping.set(ap.slotKey, tp.slotKey);
      assign(i + 1);
      mapping.delete(ap.slotKey); used.delete(ap.slotKey);
    }
    if (candidates.length < pending.slice(i).filter(p => p.type === tp.type).length
      || !candidates.some(p => mappedProps(p, mapping) === tp.propsKey)) assign(i + 1);
  }
  assign(0);
  const missing = [], wrong = [], extra = [];
  const reverse = new Map([...best].map(([a, t]) => [t, a]));
  for (const tp of T.parts) {
    const ap = A.parts.find(p => p.slotKey === reverse.get(tp.slotKey));
    if (!ap) missing.push(partEntry(tp));
    else if (ap.type !== tp.type || mappedProps(ap, best) !== tp.propsKey) wrong.push({
      kind: 'part', slotKey: tp.slotKey, actualSlotKey: ap.slotKey,
      expected: { type: tp.type, propsKey: tp.propsKey },
      found: { type: ap.type, propsKey: ap.propsKey },
    });
  }
  for (const ap of A.parts) if (!best.has(ap.slotKey)) extra.push(partEntry(ap));
  const eUsed = new Set();
  for (const te of T.edges) {
    const match = A.edges.findIndex((ae, i) => !eUsed.has(i) && ae.kind === te.kind
      && remapEnd(ae.from, best) === te.from && remapEnd(ae.to, best) === te.to);
    if (match >= 0) eUsed.add(match);
    else missing.push({ ...edgeEntry(te), actualFrom: remapEnd(te.from, reverse), actualTo: remapEnd(te.to, reverse) });
  }
  for (let i = 0; i < A.edges.length; i++) if (!eUsed.has(i)) extra.push(edgeEntry(A.edges[i]));

  return { missing, wrong, extra };
}

/** Weight of a bucket: parts weigh `w.part`, snaps and wires weigh `w.wire`. */
function weightOf(items, w) {
  let total = 0;
  for (const it of items) total += it.kind === 'part' ? w.part : w.wire;
  return total;
}

function countKind(items, kind) {
  let n = 0;
  for (const it of items) if (it.kind === kind) n++;
  return n;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * Score a restoration attempt against the removed set (D3).
 * @param {object} target  the removed items (the answer key)
 * @param {object} attempt the child's table at Submit
 * @param {{part?:number, wire?:number}} [weights]
 * @returns {{score:number, correct:number, missing:Array, wrong:Array, extra:Array, breakdown:object}}
 *   `score` is 0–100; `correct` is the weighted restoration weight (numerator before extras).
 */
function score(target, attempt, weights, challenge) {
  const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
  const T = topology(challenge || target);
  const totalWeight = T.parts.length * w.part + T.edges.length * w.wire;

  const c = classify(target, attempt);
  const missingWeight = weightOf(c.missing, w);
  const wrongWeight = weightOf(c.wrong, w);
  const correctWeight = Math.max(0, totalWeight - missingWeight - wrongWeight);
  const extraCount = c.extra.length;
  const numerator = Math.max(0, correctWeight - extraCount);

  // A target with nothing to restore is trivially perfect unless the child littered extras.
  const value = totalWeight > 0 ? clamp(Math.round((100 * numerator) / totalWeight), 0, 100) : (extraCount > 0 ? 0 : 100);

  const missingParts = countKind(c.missing, 'part');
  const missingEdges = c.missing.length - missingParts;
  const extraParts = countKind(c.extra, 'part');
  const extraEdges = c.extra.length - extraParts;

  return {
    score: value,
    correct: correctWeight,
    missing: c.missing,
    wrong: c.wrong,
    extra: c.extra,
    breakdown: {
      totalWeight,
      correctWeight,
      missingWeight,
      wrongWeight,
      extraCount,
      numerator,
      score: value,
      targetParts: T.parts.length,
      targetEdges: T.edges.length,
      correctParts: Math.max(0, T.parts.length - missingParts - c.wrong.length),
      correctEdges: Math.max(0, T.edges.length - missingEdges),
      missingParts,
      missingEdges,
      wrongParts: c.wrong.length,
      wrongEdges: 0,
      extraParts,
      extraEdges,
    },
  };
}

const WorkshopTutorialScore = { topology, classify, score };
if (typeof module !== 'undefined' && module.exports) module.exports = WorkshopTutorialScore;
if (typeof window !== 'undefined') window.WorkshopTutorialScore = WorkshopTutorialScore;
})();
