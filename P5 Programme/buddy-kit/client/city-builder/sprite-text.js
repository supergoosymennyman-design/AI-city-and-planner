// city-builder/sprite-text.js — tiny canvas-texture helper for 3D name labels.
// Renders a rounded pill with text to a canvas → THREE.CanvasTexture, so labels
// need no CSS2D renderer wiring and no external assets.

import * as THREE from 'three';

export function createLabelTexture(text, fg = '#eaf2f8', bg = 'rgba(8,14,24,0.85)', border = '#00f2fe') {
  const label = String(text || '').slice(0, 28);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // Measure to fit the pill around the text.
  ctx.font = '700 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  const tw = ctx.measureText(label).width;
  const w = Math.ceil(tw + 40);
  const h = 52;
  canvas.width = w;
  canvas.height = h;
  ctx.font = '700 28px system-ui, -apple-system, "Segoe UI", sans-serif';
  // Rounded pill background + thin border (roundRect may be absent on older iOS).
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(1, 1, w - 2, h - 2, 18);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = border;
    ctx.stroke();
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = border;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
