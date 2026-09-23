'use strict';
/**
 * wire-id.js — STABLE IDENTITY for the table's signal wires (task: wire-selectable, plan Task 1).
 *
 * WHY THIS EXISTS: a wire in `table.wires` has always been identified only by its ARRAY INDEX
 * (`{from:{block,port}, to:{block,port}}`), and an index drifts the moment any wire is added or
 * removed. Selection and deletion need something that survives an edit — so every wire earns a
 * DETERMINISTIC id derived from its own endpoints: `block:port>block:port`. Two wires between the
 * same pair of ports (legal: one signal to two dials) get a `~n` suffix, in author order.
 *
 * MEMORY-ONLY, ON PURPOSE (plan "Must NOT Have"): the id is recomputed from the endpoints on load,
 * never written into the saved table — the archive schema is untouched, and a second call is a
 * no-op ("idempotent"). A reordered-but-identical wire list yields the same ids because the base
 * key is content-addressed, not position-addressed.
 *
 * DETERMINISM: pure function of its argument. No DOM, no clock, no randomness.
 * Globals: window.WorkshopWireId. CommonJS-exported for node --test.
 */
(function () {
  /**
   * The content-addressed base id of one wire. Namespaced with `>` so it can never collide with
   * the `~`-suffixed keys a Brick gives its own internal wires (`logic/brick.js`).
   * @param {{from:{block:string,port:string}, to:{block:string,port:string}}} w
   * @returns {string} e.g. `files1:row>feeder1:drop`
   */
  function wireKey(w) {
    return w.from.block + ':' + w.from.port + '>' + w.to.block + ':' + w.to.port;
  }

  /**
   * Attach the id as a NON-ENUMERABLE property. The table is compared and saved by
   * `JSON.stringify` (game.js's `machineTouched`/`serialize`), so an enumerable `id` would make
   * every pristine example look "touched" and leak a new field into the save format. A
   * non-enumerable id is still readable as `w.id` (floor-layout, tests) but invisible to JSON.
   */
  function setWireId(w, id) {
    try { Object.defineProperty(w, 'id', { value: id, enumerable: false, configurable: true, writable: true }); }
    catch (e) { w.id = id; } // a frozen/hostile object — fall back rather than throw
  }

  /**
   * Give every wire on `table` a stable, unique `id` in place. An existing unique id is kept (so
   * the call is idempotent); a duplicate or missing one is (re)derived and, if still taken, given
   * the next free `~n` suffix. Returns the same table for chaining.
   * @param {{wires?:Array}} table
   * @returns {object} table
   */
  function ensureWireIds(table) {
    if (!table || !Array.isArray(table.wires)) return table;
    const used = new Set();
    for (const w of table.wires) {
      if (!w || !w.from || !w.to) continue;
      let id = (typeof w.id === 'string' && w.id) ? w.id : wireKey(w);
      if (used.has(id)) {
        const base = id;
        let n = 1;
        while (used.has(base + '~' + n)) n++;
        id = base + '~' + n;
      }
      setWireId(w, id);
      used.add(id);
    }
    return table;
  }

  const WireId = { wireKey, ensureWireIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = WireId;
  if (typeof window !== 'undefined') window.WorkshopWireId = WireId;
})();
