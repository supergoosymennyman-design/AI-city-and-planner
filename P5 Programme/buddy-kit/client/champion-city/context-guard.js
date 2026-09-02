// context-guard.js — graceful WebGL context-loss handling.
// If the GPU context is lost (driver crash, memory pressure on tablets), show a
// friendly overlay so the child isn't staring at a silently frozen scene. On
// restore, hide it. preventDefault() lets the browser attempt a restore.
export function attachContextLossGuard(renderer, opts = {}) {
  if (!renderer || !renderer.domElement) return;
  let overlay = null;
  const label = opts.label || 'Renderer paused';
  function show() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(5,10,18,0.85);color:#eaf2f8;font:700 16px system-ui,sans-serif;' +
      'text-align:center;padding:24px;pointer-events:none;';
    overlay.textContent = label + ' — your device is catching its breath. It will resume in a moment.';
    document.body.appendChild(overlay);
  }
  function hide() {
    if (overlay) { overlay.remove(); overlay = null; }
  }
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();          // allow the browser to attempt a restore
    show();
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    hide();
    // The game's own requestAnimationFrame loop resumes automatically on
    // restore; nothing else is required here.
  });
}
