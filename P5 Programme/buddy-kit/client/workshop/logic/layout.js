'use strict';
/**
 * layout.js — card un-overlap for the table (pure, DOM-free).
 *
 * WHY: gallery machines are DATA (galleryTable) with hand-placed x/y, and cards GROW — every
 * widget row added since a gallery was authored made its cards taller, until the recycle
 * sorter's Front door sat on its Feeder and an Only-if lay across a Bin (internal-review pass,
 * 2026-08-18). Re-measuring by hand after every card change is exactly the kind of drift that
 * ships; so the gallery runs through this once at build and the cards can never overlap.
 *
 * HOW: cards are processed top-to-bottom (ties left-to-right, then id — deterministic); each
 * one is pushed DOWN until it clears every card already placed. Only y moves — the author's
 * columns and left-to-right story survive; a machine reads top-down after the pass exactly as
 * it read before, just with air between the cards. A few passes settle any cascade.
 */
(function () {
  const GAP = 16;

  // The gap is VERTICAL only: side-by-side cards a few px apart are the author's columns, not
  // an overlap (with a horizontal gap the whole recycle sorter cascaded 250px down).
  function overlaps(a, b, gap) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  }

  /**
   * @param {Array<{id:string, x:number, y:number}>} pieces — the table's pieces (not mutated)
   * @param {(p:object) => {w:number, h:number}} sizeOf — the card's model size (game.js sizeOf)
   * @param {{gap?:number}} [opts]
   * @returns {Array} new piece objects, same order as given, y adjusted where needed
   */
  function unoverlap(pieces, sizeOf, opts) {
    const gap = opts && Number.isFinite(opts.gap) ? opts.gap : GAP;
    const boxes = pieces.map((p, i) => { const s = sizeOf(p); return { i, id: String(p.id), x: p.x, y: p.y, w: s.w, h: s.h }; });
    const order = boxes.slice().sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      const placed = [];
      for (const b of order) {
        let bumped = true;
        while (bumped) {
          bumped = false;
          for (const q of placed) {
            if (overlaps(b, q, gap)) { b.y = q.y + q.h + gap; bumped = true; moved = true; }
          }
        }
        placed.push(b);
      }
      if (!moved) break;
      order.sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    return pieces.map((p, i) => (boxes[i].y === p.y ? p : Object.assign({}, p, { y: boxes[i].y })));
  }

  /** True when no two cards touch (with the gap). Tests and asserts. */
  function hasOverlap(pieces, sizeOf, opts) {
    const gap = opts && Number.isFinite(opts.gap) ? opts.gap : GAP;
    const boxes = pieces.map((p) => { const s = sizeOf(p); return { x: p.x, y: p.y, w: s.w, h: s.h }; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j], gap)) return true;
    return false;
  }

  const api = { unoverlap, hasOverlap, GAP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.WorkshopLayout = api;
})();
