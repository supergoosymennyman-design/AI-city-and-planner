#!/usr/bin/env node
/**
 * scripts/generate-fabric.mjs
 *
 * Deterministic offline fabric generator for the P5 city-builder template.
 *
 * Writes:
 *   client/city-builder/data/fabric.json
 *   client/city-builder/data/fabric-meta.json
 *
 * Coordinate system:
 *   x = east, z = north, both in local meters [0, 2000].
 *   y is implied: avatar at y=0, building heights are positive y.
 *
 * This generator is intentionally self-contained, deterministic, and validated.
 * It does not use OSM/GeoJSON because the runtime template needs addressable
 * InstancedMesh lots, not merged OSM meshes.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const EXTENT_METERS = 2000;
const CENTER = EXTENT_METERS / 2;

// Stable dev seed. Change only if you intentionally want a new fabric.
const SEED = 0x51e3c17;

const MIN_LOTS = 1500;
const MAX_LOTS = 4000;
const TARGET_LOTS = 2400;

const ROAD_WIDTH = {
  primary: 14,
  secondary: 11,
  tertiary: 9,
  residential: 7,
  service: 5,
};

// Extra sidewalk / clearance margin kept free of building lots.
const ROAD_MARGIN = {
  primary: 5,
  secondary: 4,
  tertiary: 3.5,
  residential: 3,
  service: 2.5,
};

const PRIMARY_COUNT_PER_AXIS = 4;

/* ------------------------------------------------------------------ */
/* Small utilities                                                    */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function rand(rng, min, max) {
  return min + (max - min) * rng();
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function roadClearance(roadClass) {
  return ROAD_WIDTH[roadClass] / 2 + ROAD_MARGIN[roadClass];
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* Road hierarchy                                                     */
/* ------------------------------------------------------------------ */

/**
 * Generates one axis of the base road grid.
 *
 * Boundary roads are secondary. Primary arterials are spaced roughly every
 * 400m. Secondary roads are inserted so the base grid is roughly 200m.
 */
function makeAxis(rng, primaryCount = PRIMARY_COUNT_PER_AXIS) {
  const entries = [];

  // Boundary road near the lower extent edge.
  entries.push({ coord: rand(rng, 24, 34), class: "secondary" });

  // Primary arterials.
  for (let i = 0; i < primaryCount; i++) {
    const base = ((i + 1) * EXTENT_METERS) / (primaryCount + 1);
    const jitter = rand(rng, -55, 55);
    entries.push({
      coord: clamp(base + jitter, 160, EXTENT_METERS - 160),
      class: "primary",
    });
  }

  // Boundary road near the upper extent edge.
  entries.push({
    coord: rand(rng, EXTENT_METERS - 34, EXTENT_METERS - 24),
    class: "secondary",
  });

  entries.sort((a, b) => a.coord - b.coord);

  // Insert secondary roads between existing primary/boundary roads.
  const expanded = [entries[0]];

  for (let i = 0; i < entries.length - 1; i++) {
    const a = entries[i];
    const b = entries[i + 1];
    const len = b.coord - a.coord;

    const target = rand(rng, 190, 230);
    let segments = Math.max(1, Math.round(len / target));

    // Avoid tiny blocks.
    while (segments > 1 && len / segments < 150) segments--;

    for (let s = 1; s < segments; s++) {
      const jitter = rand(rng, -0.14, 0.14);
      let coord = a.coord + (s + jitter) * (len / segments);
      coord = clamp(coord, a.coord + 75, b.coord - 75);
      expanded.push({ coord, class: "secondary" });
    }

    expanded.push(b);
  }

  expanded.sort((a, b) => a.coord - b.coord);

  // Remove near-duplicates while preserving primaries when possible.
  const filtered = [];
  for (const e of expanded) {
    const prev = filtered[filtered.length - 1];
    if (!prev || e.coord - prev.coord >= 58) {
      filtered.push({ ...e });
    } else if (e.class === "primary" && prev.class !== "primary") {
      filtered[filtered.length - 1] = { ...e };
    }
  }

  return filtered;
}

function buildBaseRoads(vEntries, hEntries) {
  const roads = [];

  for (const e of vEntries) {
    roads.push({
      points: [
        [e.coord, 0],
        [e.coord, EXTENT_METERS],
      ],
      width: ROAD_WIDTH[e.class],
      class: e.class,
    });
  }

  for (const e of hEntries) {
    roads.push({
      points: [
        [0, e.coord],
        [EXTENT_METERS, e.coord],
      ],
      width: ROAD_WIDTH[e.class],
      class: e.class,
    });
  }

  return roads;
}

/* ------------------------------------------------------------------ */
/* Block subdivision                                                  */
/* ------------------------------------------------------------------ */

function makeInitialBlocks(vEntries, hEntries) {
  const blocks = [];

  for (let i = 0; i < vEntries.length - 1; i++) {
    const left = vEntries[i];
    const right = vEntries[i + 1];

    for (let j = 0; j < hEntries.length - 1; j++) {
      const bottom = hEntries[j];
      const top = hEntries[j + 1];

      blocks.push({
        outer: {
          x0: left.coord,
          x1: right.coord,
          z0: bottom.coord,
          z1: top.coord,
        },
        margins: {
          left: roadClearance(left.class),
          right: roadClearance(right.class),
          bottom: roadClearance(bottom.class),
          top: roadClearance(top.class),
        },
      });
    }
  }

  return blocks;
}

function getBuildable(block) {
  return {
    x0: block.outer.x0 + block.margins.left,
    x1: block.outer.x1 - block.margins.right,
    z0: block.outer.z0 + block.margins.bottom,
    z1: block.outer.z1 - block.margins.top,
  };
}

function chooseInternalRoadClass(rng, area) {
  const r = rng();

  // Occasionally widen a major infill street.
  if (area > 26000 && r < 0.16) return "tertiary";

  // Mostly residential, some narrow service lanes.
  return r < 0.84 ? "residential" : "service";
}

/**
 * Recursively inserts residential/service streets inside large base blocks.
 * This creates the ~100m infill block scale without destroying the hierarchy.
 */
function subdivideBlocks(baseBlocks, rng) {
  const internalRoads = [];
  const finalBlocks = [];
  const queue = [...baseBlocks];

  const SPLIT_THRESHOLD = 148;
  const MIN_CHILD_BUILDABLE = 36;

  while (queue.length) {
    const block = queue.shift();
    const b = getBuildable(block);
    const bw = b.x1 - b.x0;
    const bd = b.z1 - b.z0;

    if (bw < 20 || bd < 20) {
      finalBlocks.push(block);
      continue;
    }

    if (bw <= SPLIT_THRESHOLD && bd <= SPLIT_THRESHOLD) {
      finalBlocks.push(block);
      continue;
    }

    const orientations = [];

    if (bw >= bd) {
      if (bw > SPLIT_THRESHOLD) orientations.push("v");
      if (bd > SPLIT_THRESHOLD) orientations.push("h");
    } else {
      if (bd > SPLIT_THRESHOLD) orientations.push("h");
      if (bw > SPLIT_THRESHOLD) orientations.push("v");
    }

    let didSplit = false;

    for (const orient of orientations) {
      const cls = chooseInternalRoadClass(rng, bw * bd);
      const inset = roadClearance(cls);

      if (orient === "v") {
        const minRx =
          block.outer.x0 + block.margins.left + inset + MIN_CHILD_BUILDABLE;
        const maxRx =
          block.outer.x1 - block.margins.right - inset - MIN_CHILD_BUILDABLE;

        if (maxRx > minRx + 4) {
          const mid = (block.outer.x0 + block.outer.x1) / 2;
          const jitter = Math.min(28, (maxRx - minRx) * 0.22);
          const rx = clamp(mid + rand(rng, -jitter, jitter), minRx, maxRx);

          internalRoads.push({
            points: [
              [rx, block.outer.z0],
              [rx, block.outer.z1],
            ],
            width: ROAD_WIDTH[cls],
            class: cls,
          });

          queue.push({
            outer: {
              x0: block.outer.x0,
              x1: rx,
              z0: block.outer.z0,
              z1: block.outer.z1,
            },
            margins: {
              left: block.margins.left,
              right: inset,
              bottom: block.margins.bottom,
              top: block.margins.top,
            },
          });

          queue.push({
            outer: {
              x0: rx,
              x1: block.outer.x1,
              z0: block.outer.z0,
              z1: block.outer.z1,
            },
            margins: {
              left: inset,
              right: block.margins.right,
              bottom: block.margins.bottom,
              top: block.margins.top,
            },
          });

          didSplit = true;
          break;
        }
      } else {
        const minRz =
          block.outer.z0 + block.margins.bottom + inset + MIN_CHILD_BUILDABLE;
        const maxRz =
          block.outer.z1 - block.margins.top - inset - MIN_CHILD_BUILDABLE;

        if (maxRz > minRz + 4) {
          const mid = (block.outer.z0 + block.outer.z1) / 2;
          const jitter = Math.min(28, (maxRz - minRz) * 0.22);
          const rz = clamp(mid + rand(rng, -jitter, jitter), minRz, maxRz);

          internalRoads.push({
            points: [
              [block.outer.x0, rz],
              [block.outer.x1, rz],
            ],
            width: ROAD_WIDTH[cls],
            class: cls,
          });

          queue.push({
            outer: {
              x0: block.outer.x0,
              x1: block.outer.x1,
              z0: block.outer.z0,
              z1: rz,
            },
            margins: {
              left: block.margins.left,
              right: block.margins.right,
              bottom: block.margins.bottom,
              top: inset,
            },
          });

          queue.push({
            outer: {
              x0: block.outer.x0,
              x1: block.outer.x1,
              z0: rz,
              z1: block.outer.z1,
            },
            margins: {
              left: block.margins.left,
              right: block.margins.right,
              bottom: inset,
              top: block.margins.top,
            },
          });

          didSplit = true;
          break;
        }
      }
    }

    if (!didSplit) {
      finalBlocks.push(block);
    }
  }

  return { blocks: finalBlocks, internalRoads };
}

/* ------------------------------------------------------------------ */
/* Parks                                                              */
/* ------------------------------------------------------------------ */

function distToSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;

  if (l2 === 0) return Math.hypot(px - x1, pz - z1);

  let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
  t = clamp(t, 0, 1);

  const cx = x1 + t * dx;
  const cz = z1 + t * dz;

  return Math.hypot(px - cx, pz - cz);
}

function parkClearOfRoads(cx, cz, radius, roads) {
  for (const road of roads) {
    const clear = ROAD_WIDTH[road.class] / 2 + ROAD_MARGIN[road.class];

    for (let i = 0; i < road.points.length - 1; i++) {
      const [x1, z1] = road.points[i];
      const [x2, z2] = road.points[i + 1];

      if (distToSegment(cx, cz, x1, z1, x2, z2) < radius + clear) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Parks are placed inside buildable block rectangles so they do not overlap
 * roads. Lot generation later rejects any lot intersecting a park circle.
 */
function generateParks(finalBlocks, roads, rng) {
  const parks = [];
  const candidates = [];

  for (const block of finalBlocks) {
    const b = getBuildable(block);
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;

    if (w < 52 || d < 52) continue;

    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const dist = Math.hypot(cx - CENTER, cz - CENTER);

    // Prefer mid-ring / fringe residential areas, not the downtown core.
    if (dist < 620 || dist > 1500) continue;

    candidates.push({ cx, cz, w, d, dist });
  }

  shuffle(candidates, rng);

  const desiredParks = 6;

  for (const c of candidates) {
    if (parks.length >= desiredParks) break;

    const safeRadius = Math.min(c.w, c.d) / 2 - 6;
    if (safeRadius < 30) continue;

    const radius = clamp(rand(rng, 34, 68), 30, safeRadius);

    const maxJitterX = Math.max(0, c.w / 2 - radius - 3);
    const maxJitterZ = Math.max(0, c.d / 2 - radius - 3);

    const px = c.cx + rand(rng, -maxJitterX, maxJitterX);
    const pz = c.cz + rand(rng, -maxJitterZ, maxJitterZ);

    const tooClose = parks.some(
      (p) => Math.hypot(p.cx - px, p.cz - pz) < p.radius + radius + 85
    );

    if (tooClose) continue;

    parks.push({ cx: px, cz: pz, radius });
  }

  // Fallback: if block-derived parks were insufficient, sample safely.
  let attempts = 0;
  while (parks.length < 4 && attempts < 8000) {
    attempts++;

    const px = rand(rng, 160, EXTENT_METERS - 160);
    const pz = rand(rng, 160, EXTENT_METERS - 160);
    const dist = Math.hypot(px - CENTER, pz - CENTER);

    if (dist < 650) continue;

    const radius = rand(rng, 30, 55);

    if (px - radius < 60 || px + radius > EXTENT_METERS - 60) continue;
    if (pz - radius < 60 || pz + radius > EXTENT_METERS - 60) continue;

    if (!parkClearOfRoads(px, pz, radius, roads)) continue;

    const tooClose = parks.some(
      (p) => Math.hypot(p.cx - px, p.cz - pz) < p.radius + radius + 85
    );

    if (tooClose) continue;

    parks.push({ cx: px, cz: pz, radius });
  }

  return parks.slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Lots                                                               */
/* ------------------------------------------------------------------ */

function rectCircleOverlap(cx, cz, radius, lot, margin = 0) {
  const dx = Math.max(Math.abs(lot.cx - cx) - lot.w / 2, 0);
  const dz = Math.max(Math.abs(lot.cz - cz) - lot.d / 2, 0);
  return Math.hypot(dx, dz) <= radius + margin;
}

function pickHeight(dist, rng) {
  // Downtown core: towers + a few super-tall glass towers.
  if (dist <= 620) {
    const superChance = dist < 320 ? 0.09 : 0.045;

    if (rng() < superChance) {
      return Math.round(clamp(180 + rng() * 40, 180, 220));
    }

    return Math.round(40 + Math.pow(rng(), 0.75) * 140);
  }

  // Mid ring: offices / concrete.
  if (dist <= 1080) {
    let h = 15 + Math.pow(rng(), 1.15) * 45;

    // Slightly taller near the core edge.
    if (dist < 700) h += 8;

    return Math.round(clamp(h, 15, 60));
  }

  // Fringe: walk-ups / tenements.
  return Math.round(8 + Math.pow(rng(), 1.3) * 22);
}

function generateLots(finalBlocks, parks, rng, opts) {
  const { cellScale = 1.0, vacancy = 0.02 } = opts;
  const lots = [];

  for (const block of finalBlocks) {
    const b = getBuildable(block);
    const width = b.x1 - b.x0;
    const depth = b.z1 - b.z0;

    if (width < 14 || depth < 14) continue;

    const blockCx = (b.x0 + b.x1) / 2;
    const blockCz = (b.z0 + b.z1) / 2;
    const blockDist = Math.hypot(blockCx - CENTER, blockCz - CENTER);

    let baseW;
    let baseD;

    if (blockDist <= 650) {
      baseW = rand(rng, 16, 26);
      baseD = rand(rng, 16, 26);
    } else if (blockDist <= 1100) {
      baseW = rand(rng, 18, 30);
      baseD = rand(rng, 18, 30);
    } else {
      baseW = rand(rng, 20, 32);
      baseD = rand(rng, 20, 32);
    }

    baseW = clamp(baseW * cellScale, 12, 32);
    baseD = clamp(baseD * cellScale, 12, 32);

    const gap = clamp(rand(rng, 1.6, 2.8), 1.5, 3);

    const slotW = baseW + gap;
    const slotD = baseD + gap;

    const cols = Math.floor((width + gap) / slotW);
    const rows = Math.floor((depth + gap) / slotD);

    if (cols <= 0 || rows <= 0) continue;

    const totalW = cols * slotW - gap;
    const totalD = rows * slotD - gap;

    const startX = b.x0 + (width - totalW) / 2 + baseW / 2;
    const startZ = b.z0 + (depth - totalD) / 2 + baseD / 2;

    for (let r = 0; r < rows; r++) {
      const cz = startZ + r * slotD;

      for (let c = 0; c < cols; c++) {
        const cx = startX + c * slotW;

        if (vacancy > 0 && rng() < vacancy) continue;

        const w = clamp(baseW - rng() * 2.2, 12, 32);
        const d = clamp(baseD - rng() * 2.2, 12, 32);

        const lot = { cx, cz, w, d };

        // Keep pre-baked parks clean.
        if (parks.some((p) => rectCircleOverlap(p.cx, p.cz, p.radius, lot, 0.75))) {
          continue;
        }

        const dist = Math.hypot(cx - CENTER, cz - CENTER);
        const h = pickHeight(dist, rng);

        lots.push({ cx, cz, w, d, h });
      }
    }
  }

  return lots;
}

function downsampleLots(lots, max, rng) {
  if (lots.length <= max) return lots;

  const scored = lots.map((l) => {
    const dist = Math.hypot(l.cx - CENTER, l.cz - CENTER);
    const tallBonus = l.h > 150 ? 260 : 0;
    return { l, key: dist + rng() * 650 - tallBonus };
  });

  scored.sort((a, b) => a.key - b.key);
  return scored.slice(0, max).map((s) => s.l);
}

function ensureSkyscrapers(lots, rng) {
  const tallCount = lots.filter((l) => l.h > 180).length;
  if (tallCount >= 3) return;

  const core = lots.filter(
    (l) => Math.hypot(l.cx - CENTER, l.cz - CENTER) < 560
  );

  shuffle(core, rng);

  const needed = 3 - tallCount;
  for (const lot of core.slice(0, needed)) {
    lot.h = Math.round(clamp(185 + rng() * 35, 181, 220));
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

function lotIntersectsRoadClearance(lot, road) {
  // Subtract a tiny tolerance because generated margins are exact but JSON
  // values are rounded for output.
  const clear = Math.max(
    0.05,
    road.width / 2 + ROAD_MARGIN[road.class] - 0.06
  );

  const minX = lot.cx - lot.w / 2;
  const maxX = lot.cx + lot.w / 2;
  const minZ = lot.cz - lot.d / 2;
  const maxZ = lot.cz + lot.d / 2;

  for (let i = 0; i < road.points.length - 1; i++) {
    const [x1, z1] = road.points[i];
    const [x2, z2] = road.points[i + 1];

    if (Math.abs(x1 - x2) <= 0.01) {
      // Vertical segment.
      const x = x1;
      const segMinZ = Math.min(z1, z2) - clear;
      const segMaxZ = Math.max(z1, z2) + clear;

      if (
        maxX > x - clear &&
        minX < x + clear &&
        maxZ > segMinZ &&
        minZ < segMaxZ
      ) {
        return true;
      }
    } else {
      // Horizontal segment.
      const z = z1;
      const segMinX = Math.min(x1, x2) - clear;
      const segMaxX = Math.max(x1, x2) + clear;

      if (
        maxX > segMinX &&
        minX < segMaxX &&
        maxZ > z - clear &&
        minZ < z + clear
      ) {
        return true;
      }
    }
  }

  return false;
}

function validateFabric(lots, roads, parks) {
  assert(
    lots.length >= MIN_LOTS && lots.length <= MAX_LOTS,
    `Lot count ${lots.length} outside expected range [${MIN_LOTS}, ${MAX_LOTS}]`
  );

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];

    assert(lot.id === i, `Lot ids must be dense. Expected ${i}, got ${lot.id}`);

    assert(Number.isFinite(lot.cx), "lot.cx must be finite");
    assert(Number.isFinite(lot.cz), "lot.cz must be finite");
    assert(Number.isFinite(lot.w), "lot.w must be finite");
    assert(Number.isFinite(lot.d), "lot.d must be finite");
    assert(Number.isFinite(lot.h), "lot.h must be finite");

    assert(lot.w >= 12 && lot.w <= 32, `Lot footprint width invalid: ${lot.w}`);
    assert(lot.d >= 12 && lot.d <= 32, `Lot footprint depth invalid: ${lot.d}`);
    assert(lot.h > 0, "Lot height must be positive");

    assert(
      lot.cx - lot.w / 2 >= -0.05 && lot.cx + lot.w / 2 <= EXTENT_METERS + 0.05,
      "Lot x footprint out of extent"
    );

    assert(
      lot.cz - lot.d / 2 >= -0.05 && lot.cz + lot.d / 2 <= EXTENT_METERS + 0.05,
      "Lot z footprint out of extent"
    );
  }

  // Height gradient checks.
  let coreCount = 0;
  let coreSum = 0;
  let coreMax = 0;
  let fringeCount = 0;
  let fringeSum = 0;

  for (const lot of lots) {
    const dist = Math.hypot(lot.cx - CENTER, lot.cz - CENTER);

    if (dist <= 600) {
      coreCount++;
      coreSum += lot.h;
      coreMax = Math.max(coreMax, lot.h);
      assert(lot.h >= 39, `Core lot height too low: ${lot.h}`);
    }

    if (dist >= 1150) {
      fringeCount++;
      fringeSum += lot.h;
      assert(lot.h <= 32, `Fringe lot height too high: ${lot.h}`);
    }
  }

  assert(coreCount > 20, "Expected a meaningful downtown core sample");
  assert(fringeCount > 20, "Expected a meaningful fringe sample");
  assert(coreMax >= 180, "Expected at least one skyscraper in the core");
  assert(
    coreSum / coreCount > fringeSum / fringeCount + 10,
    "Expected core heights to average significantly higher than fringe heights"
  );

  // Lot / road clearance.
  for (const lot of lots) {
    for (const road of roads) {
      assert(
        !lotIntersectsRoadClearance(lot, road),
        `Lot ${lot.id} overlaps road right-of-way + sidewalk margin`
      );
    }
  }

  // Parks must be lot-free.
  for (const park of parks) {
    for (const lot of lots) {
      assert(
        !rectCircleOverlap(park.cx, park.cz, park.radius, lot, 0.05),
        `Lot ${lot.id} intersects park`
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Meta + output                                                      */
/* ------------------------------------------------------------------ */

function makeMeta(lots, roads, parks) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (const lot of lots) {
    minX = Math.min(minX, lot.cx - lot.w / 2);
    minZ = Math.min(minZ, lot.cz - lot.d / 2);
    maxX = Math.max(maxX, lot.cx + lot.w / 2);
    maxZ = Math.max(maxZ, lot.cz + lot.d / 2);
  }

  if (!lots.length) {
    minX = minZ = 0;
    maxX = maxZ = EXTENT_METERS;
  }

  return {
    version: 1,
    extentMeters: EXTENT_METERS,
    seed: SEED,
    lotCount: lots.length,
    roadCount: roads.length,
    parkCount: parks.length,
    bounds: {
      minX: round2(minX),
      minZ: round2(minZ),
      maxX: round2(maxX),
      maxZ: round2(maxZ),
    },
  };
}

function main() {
  const rngRoads = mulberry32(SEED + 11);
  const vEntries = makeAxis(rngRoads, PRIMARY_COUNT_PER_AXIS);
  const hEntries = makeAxis(rngRoads, PRIMARY_COUNT_PER_AXIS);

  const baseRoads = buildBaseRoads(vEntries, hEntries);
  const baseBlocks = makeInitialBlocks(vEntries, hEntries);

  const rngSplit = mulberry32(SEED + 22);
  const { blocks: finalBlocks, internalRoads } = subdivideBlocks(
    baseBlocks,
    rngSplit
  );

  const roads = [...baseRoads, ...internalRoads];

  const rngParks = mulberry32(SEED + 33);
  const parks = generateParks(finalBlocks, roads, rngParks);

  // Adaptive lot generation: keep final output inside the InstancedMesh budget.
  let opts = { cellScale: 1.0, vacancy: 0.02 };
  let lots = [];

  for (let attempt = 0; attempt < 9; attempt++) {
    const rngLots = mulberry32(SEED + 500 + attempt * 131);
    lots = generateLots(finalBlocks, parks, rngLots, opts);

    if (lots.length >= MIN_LOTS && lots.length <= MAX_LOTS) break;

    if (lots.length > MAX_LOTS) {
      opts.cellScale = clamp(
        opts.cellScale * Math.sqrt(lots.length / TARGET_LOTS),
        0.8,
        1.3
      );
      opts.vacancy = clamp(opts.vacancy + 0.015, 0, 0.15);
    } else {
      opts.cellScale = clamp(
        opts.cellScale * Math.sqrt(lots.length / TARGET_LOTS),
        0.72,
        1.3
      );
      opts.vacancy = 0;
    }
  }

  // One last lower-density attempt if necessary.
  if (lots.length < MIN_LOTS) {
    const rngLots = mulberry32(SEED + 9999);
    lots = generateLots(finalBlocks, parks, rngLots, {
      cellScale: 0.72,
      vacancy: 0,
    });
  }

  if (lots.length > MAX_LOTS) {
    const rngThin = mulberry32(SEED + 44);
    lots = downsampleLots(lots, MAX_LOTS, rngThin);
  }

  const rngSky = mulberry32(SEED + 55);
  ensureSkyscrapers(lots, rngSky);

  // Stable spatial ordering, then dense ids.
  lots.sort((a, b) => a.cz - b.cz || a.cx - b.cx);

  const roundedLots = lots.map((lot, i) => ({
    id: i,
    cx: round2(lot.cx),
    cz: round2(lot.cz),
    w: round2(clamp(lot.w, 12, 32)),
    d: round2(clamp(lot.d, 12, 32)),
    h: Math.round(lot.h),
  }));

  const roundedRoads = roads.map((road) => ({
    points: road.points.map((p) => [round2(p[0]), round2(p[1])]),
    width: road.width,
    class: road.class,
  }));

  const roundedParks = parks.map((park) => ({
    cx: round2(park.cx),
    cz: round2(park.cz),
    radius: round2(park.radius),
  }));

  validateFabric(roundedLots, roundedRoads, roundedParks);

  const fabric = {
    version: 1,
    extentMeters: EXTENT_METERS,
    lots: roundedLots,
    roads: roundedRoads,
    parks: roundedParks,
  };

  const meta = makeMeta(roundedLots, roundedRoads, roundedParks);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(__dirname, "..", "client", "city-builder", "data");

  fs.mkdirSync(outDir, { recursive: true });

  const fabricPath = path.join(outDir, "fabric.json");
  const metaPath = path.join(outDir, "fabric-meta.json");

  fs.writeFileSync(fabricPath, JSON.stringify(fabric, null, 2));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log("[fabric] wrote", fabricPath);
  console.log("[fabric] wrote", metaPath);
  console.log(
    `[fabric] lots=${roundedLots.length} roads=${roundedRoads.length} parks=${roundedParks.length}`
  );
}

main();
