/**
 * city-builder/minimap.js — small 2D top-down minimap for the student's own
 * city. Static layer (student roads, buildings, parks) drawn once; live layer
 * (champion, taxi, drones) redrawn each frame. North is up.
 *
 * Unlike the HK minimap, this has no harbour / OSM traffic graph / fixed quest
 * positions — it renders purely from the student's layout + live entities.
 */

import { catalogType, isSpecial } from '../city-common/catalog.js';
import { t } from './i18n.js';
import { typeSpec } from '../city-common/layout.js';

export function createMinimap(city, champion, taxi, opts = {}) {
  const SIZE = opts.size || 200;
  const bounds = opts.bounds || { minX: 0, maxX: 2000, minZ: 0, maxZ: 2000 };
  const W = bounds.maxX - bounds.minX;
  const H = bounds.maxZ - bounds.minZ;
  const S = SIZE / Math.max(W, H);          // px per meter (square canvas)

  const wrap = document.createElement('div');
  wrap.id = 'minimap';
  wrap.innerHTML = `<canvas width="${SIZE}" height="${SIZE}"></canvas><div class="mm-n">N</div>`;
  document.body.appendChild(wrap);
  const canvas = wrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');

  function wx(x) { return (x - bounds.minX) * S; }
  function wz(z) { return SIZE - (z - bounds.minZ) * S; }   // flip → north up

  // The map and destination panel use the same purpose names as the planner.
  const destinations = document.createElement('button');
  destinations.type = 'button';
  destinations.setAttribute('data-i18n', 'work.destinations');
  destinations.textContent = t('work.destinations');
  destinations.style.cssText = 'min-height:44px;width:100%';
  destinations.onclick = () => opts.openDestinations?.();
  wrap.appendChild(destinations);
  canvas.setAttribute('role','button');
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label',t('work.destinations'));
  canvas.addEventListener('click',()=>opts.openDestinations?.());
  canvas.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();opts.openDestinations?.();}});
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * SIZE / rect.width;
    const y = (event.clientY - rect.top) * SIZE / rect.height;
    const near = (city.layout?.buildings || []).find(b => Math.hypot(wx(b.pos[0])-x,wz(b.pos[1])-y) < 8);
    canvas.title = near ? (typeSpec(near.type)?.name || near.type) : '';
  });

  // ── Static layer (student layout) ──
  const staticCanvas = document.createElement('canvas');
  staticCanvas.width = staticCanvas.height = SIZE;
  drawStatic(staticCanvas.getContext('2d'));

  function drawStatic(c) {
    c.fillStyle = 'rgba(8,12,20,0.93)';
    c.fillRect(0, 0, SIZE, SIZE);

    // Roads (student polylines)
    c.strokeStyle = 'rgba(120,130,150,0.75)';
    c.lineWidth = 1.5;
    for (const r of (city.layout?.roads || [])) {
      if (!r.points || r.points.length < 2) continue;
      c.beginPath();
      c.moveTo(wx(r.points[0][0]), wz(r.points[0][1]));
      for (let i = 1; i < r.points.length; i++) c.lineTo(wx(r.points[i][0]), wz(r.points[i][1]));
      c.stroke();
    }

    // Parks (student circles)
    for (const p of (city.layout?.parks || [])) {
      c.fillStyle = 'rgba(76,190,106,0.4)';
      c.beginPath();
      c.arc(wx(p.cx), wz(p.cz), Math.max(p.radius * S, 2), 0, Math.PI * 2);
      c.fill();
    }

    // Buildings (student layout): special = cyan, generic = grey
    for (const b of (city.layout?.buildings || [])) {
      const spec = typeSpec(b.type);
      const fp = b.footprint || spec?.footprint || [20, 20];
      const px = wx(b.pos[0] - fp[0] / 2);
      const py = wz(b.pos[1] + fp[1] / 2);
      const pw = Math.max(fp[0] * S, 1), ph = Math.max(fp[1] * S, 1);
      c.fillStyle = isSpecial(b.type) ? 'rgba(0,242,254,0.75)' : 'rgba(140,152,168,0.6)';
      c.fillRect(px, py, pw, ph);
    }

    // Border
    c.strokeStyle = 'rgba(0,242,254,0.4)';
    c.lineWidth = 1.5;
    c.strokeRect(0.75, 0.75, SIZE - 1.5, SIZE - 1.5);
  }

  // ── Live layer ──
  function update() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(staticCanvas, 0, 0);

    // Drones (tiny white specks) — reused across both city builders
    const droneList = (city.drones && city.drones.drones) || [];
    for (const d of droneList) {
      // Guard: a drone that hasn't been given a route yet would make A/B undefined.
      if (!d.route || d.route.length < 2) continue;
      const seg = Math.min(Math.max(0, d.seg | 0), d.route.length - 1);
      const A = d.route[seg], B = d.route[(seg + 1) % d.route.length];
      const x = A.x + (B.x - A.x) * Math.min(1, d.t);
      const z = A.z + (B.z - A.z) * Math.min(1, d.t);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(wx(x) - 1, wz(z) - 1, 2, 2);
    }

    // Taxi (when flying) — yellow dot
    if (taxi && taxi.isActive()) {
      const tp = taxi.getPos();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(wx(tp.x), wz(tp.z), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Champion — pulsing green dot
    if (champion) {
      const ch = champion.state.pos;
      const pulse = 3 + Math.round(Math.sin(performance.now() * 0.004) * 0.6);
      ctx.fillStyle = '#4dff88';
      ctx.beginPath();
      ctx.arc(wx(ch.x), wz(ch.z), pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  return { update, canvas, wx, wz, destroy() { destinations.onclick = null; wrap.remove(); } };
}
