/* Shared Data-sense transform. Classic script for Workshop; side-effect import
 * for the renderer-independent driving runtime. No training/inference forks. */
(function () {
  'use strict';
  function raw(schema, features, strict = false) {
    const out = [];
    for (const f of schema.features) {
      const x = features?.[f.id];
      if (strict && (f.options ? !f.options.includes(x) : typeof x !== 'number' || !Number.isFinite(x))) {
        throw new Error('Invalid reading: ' + f.id);
      }
      if (f.options) for (const o of f.options) out.push(x === o ? 1 : 0);
      else out.push(f.max === f.min ? 0 : (Number(x) - f.min) / (f.max - f.min));
    }
    out.push(1);
    return out;
  }
  function vector(schema, features, strict = false) {
    const v = raw(schema, features, strict);
    const norm = Math.hypot(...v) || 1;
    return v.map(x => x / norm);
  }
  const api = { raw, vector };
  globalThis.WorkshopDataVector = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
