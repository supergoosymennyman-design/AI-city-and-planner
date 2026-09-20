#!/usr/bin/env node
/** Materialise the one-off Woven Delta marketing layout. Run after changing this file. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, '../docs/showcases/woven-delta-ai-city.json');
const scaleMeters = 2000;

const roads = [
  // The long, asymmetric S is the city’s visual spine; none of these paths closes.
  { class: 'primary', width: 24, points: [[100,180],[330,280],[560,430],[760,610],[940,770],[1090,980],[1280,1180],[1530,1370],[1810,1640],[1910,1840]] },
  { class: 'primary', width: 20, points: [[120,1530],[340,1430],[570,1320],[800,1190],[1010,1040],[1230,860],[1470,680],[1730,560],[1910,430]] },
  { class: 'secondary', width: 14, points: [[210,520],[470,600],[690,690],[850,820],[1040,940],[1290,1010],[1580,1050],[1840,1120]] },
  { class: 'secondary', width: 14, points: [[170,1110],[410,1020],[650,930],[850,850],[1110,720],[1380,590],[1690,360]] },
  // Short angled bridges stitch triangular blocks together without a hub-and-spoke pattern.
  { class: 'tertiary', width: 10, points: [[470,600],[570,920],[650,1230]] },
  { class: 'tertiary', width: 10, points: [[760,610],[940,430],[1170,350]] },
  { class: 'tertiary', width: 10, points: [[1090,980],[1300,760],[1470,680]] },
  { class: 'tertiary', width: 10, points: [[1280,1180],[1490,1320],[1730,1420]] },
  { class: 'residential', width: 8, points: [[270,1640],[510,1510],[720,1440]] },
  { class: 'residential', width: 8, points: [[1210,1570],[1430,1510],[1690,1540]] },
];

const parks = [
  { cx: 430, cz: 810, radius: 62 }, { cx: 780, cz: 1110, radius: 52 },
  { cx: 1140, cz: 540, radius: 56 }, { cx: 1430, cz: 1160, radius: 64 },
  { cx: 1640, cz: 820, radius: 48 }, { cx: 690, cz: 1510, radius: 46 },
];

function distToSegment(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const q = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / q));
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}
function clearOfRoutes(x, z) {
  for (const road of roads) for (let i = 0; i < road.points.length - 1; i++) {
    if (distToSegment(x, z, road.points[i], road.points[i + 1]) < 43) return false;
  }
  return !parks.some(p => Math.hypot(x - p.cx, z - p.cz) < p.radius + 35);
}

const types = ['housing','housing','housing','housing','shop','office','library','school','hospital','fire','police'];
const buildings = [];
// A compact, offset grid gives low-rise neighbourhood texture while route and park
// clearances preserve the irregular triangular blocks authored above.
for (let z = 160, row = 0; z <= 1840 && buildings.length < 270; z += 88, row++) {
  for (let x = 150 + (row % 2) * 26; x <= 1840 && buildings.length < 270; x += 78) {
    if (!clearOfRoutes(x, z)) continue;
    const n = buildings.length;
    const type = types[n % types.length];
    const height = type === 'office' ? 54 + (n % 5) * 12 : type === 'housing' ? 17 + (n % 4) * 7 : 18 + (n % 4) * 5;
    buildings.push({ type, pos: [x, z], footprint: type === 'shop' ? [28,28] : [20,20], height });
  }
}

// Mission landmarks form a deliberately uneven skyline rather than a ceremonial centre.
const missions = [
  ['city_central', [980,670], 132], ['finance_tower',[1210,850],118], ['atc',[1520,920],102],
  ['drone_routing',[1340,500],76], ['traffic_lab',[800,470],62], ['traffic_emergency',[610,1050],70],
  ['health',[980,1230],68], ['delivery',[1510,1270],74], ['monitoring',[1710,690],72],
  ['water',[330,1180],60], ['power',[470,380],66], ['recycling',[550,1510],55],
  ['robot_grid',[890,1510],66], ['swarm',[1130,1490],64], ['subsurface',[1680,1370],58],
  ['bus',[250,760],54], ['treasury',[720,780],80], ['sentiment_lab',[1090,330],64],
];
for (const [type, pos, height] of missions) buildings.push({ type, pos, height });

if (buildings.length !== 288) throw new Error(`Expected 288 buildings, got ${buildings.length}`);
const layout = { version: 2, scaleMeters, autoScenery: true, roads, parks, buildings };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(layout, null, 2)}\n`);
console.log(`Wrote ${output} (${buildings.length} buildings).`);
