'use strict';
/**
 * history.js — the pure Undo/Redo stack for BUILDING (task 061, §9a phase 1).
 *
 * WHY strings: an entry's `json` is the serialized authored surface ({table, bricks}) captured
 * AFTER an edit. Storing the string (a) makes dedup an O(1) equality (a seam that fired without
 * changing anything records nothing — "no-ops make no history"), and (b) makes every restore a
 * fresh JSON.parse — no aliasing between the stack and live state, ever. The caller owns what
 * goes IN the snapshot (spec: table + bricks; never brains, media, seed, champion name).
 *
 * The model: entries are STATES, index points at the current one. reset() lays the baseline
 * (the machine as loaded — label null, nothing before it to undo to); record() truncates any
 * redo tail, pushes, and evicts the oldest past `cap` (memory bound, spec Ruling 7).
 * undo()/redo() move the pointer and hand back the state to apply plus the label to SPEAK:
 * undo names the edit it took back (the entry it left), redo the entry it arrived at.
 */
(function () {
  const History = {
    /** Bound both entry count and UTF-16 snapshot bytes. The current state always survives. */
    create(cap, maxBytes = 32 * 1024 * 1024) { return { cap: cap || 50, maxBytes, entries: [], index: -1 }; },
    /** Start over from one baseline state (machine load/swap). Mutates and returns h. */
    reset(h, json) { h.entries = [{ label: null, json }]; h.index = 0; return h; },
    /**
     * Record a post-edit state. Returns false (and records nothing) when json is identical to
     * the current entry — the seam fired but nothing authored actually changed.
     */
    record(h, label, json) {
      if (h.index >= 0 && h.entries[h.index].json === json) return false;
      h.entries.length = h.index + 1; // a new edit after Undo clears Redo
      h.entries.push({ label, json });
      h.index++;
      let bytes = h.entries.reduce((n,e) => n + e.json.length * 2,0);
      while (h.entries.length > 1 && (h.entries.length > h.cap || bytes > h.maxBytes)) {
        bytes -= h.entries.shift().json.length * 2; h.index--;
      }
      return true;
    },
    canUndo(h) { return h.index > 0; },
    canRedo(h) { return h.index < h.entries.length - 1; },
    undoLabel(h) { return this.canUndo(h) ? h.entries[h.index].label : null; },
    redoLabel(h) { return this.canRedo(h) ? h.entries[h.index + 1].label : null; },
    /** Step back. Returns {label: the edit taken back, json: the state to apply} or null. */
    undo(h) {
      if (!this.canUndo(h)) return null;
      const label = h.entries[h.index].label;
      h.index--;
      return { label, json: h.entries[h.index].json };
    },
    /** Step forward. Returns {label: the edit re-done, json: the state to apply} or null. */
    redo(h) {
      if (!this.canRedo(h)) return null;
      h.index++;
      return { label: h.entries[h.index].label, json: h.entries[h.index].json };
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = History;
  if (typeof window !== 'undefined') window.WorkshopHistory = History;
})();
