// model-scale.js — pure helpers for mapping authored model bounds into the
// city's metre-based world without distorting doors, windows, or storeys.

export const CITY_CHAMPION_HEIGHT = 1.8;

function positive(value, fallback = 1) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Largest UNIFORM scale that contains source bounds inside a target box.
 * Source may be a THREE.Vector3 or a plain {x,y,z} object. Target uses the
 * explicit world-space names {width,height,depth}.
 */
export function uniformScaleForBounds(source, target, extra = 1) {
  const sx = positive(source?.x);
  const sy = positive(source?.y);
  const sz = positive(source?.z);
  const width = positive(target?.width);
  const height = positive(target?.height);
  const depth = positive(target?.depth);
  return Math.min(width / sx, height / sy, depth / sz) * positive(extra);
}

/** World-space dimensions produced by a uniform scale. */
export function scaledBounds(source, scale) {
  const s = positive(scale);
  return {
    width: positive(source?.x) * s,
    height: positive(source?.y) * s,
    depth: positive(source?.z) * s,
  };
}

/** Convert the shared library schema into an explicit target box. */
export function itemTargetBounds(item, extra = 1) {
  const footprint = Array.isArray(item?.footprint) ? item.footprint : [1, 1];
  const e = positive(extra);
  return {
    width: positive(footprint[0]) * e,
    depth: positive(footprint[1]) * e,
    height: positive(item?.height) * e,
  };
}
