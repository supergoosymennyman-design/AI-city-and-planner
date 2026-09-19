// context-guard.js — graceful WebGL context-loss handling.
// If the GPU context is lost (driver crash, memory pressure on tablets), show a
// friendly overlay so the child isn't staring at a silently frozen scene. On
// restore, hide it. preventDefault() lets the browser attempt a restore.
export function attachContextLossGuard(renderer, opts = {}) {
  if (!renderer || !renderer.domElement) return { destroy() {} };
  let overlay = null;
  let recoveryTimer = 0;
  const label = opts.label || 'Renderer paused';
  const detail = opts.detail || 'Your work is safe. The city will resume if the device recovers.';
  const retryLabel = opts.retryLabel || 'Try city again';
  const returnLabel = opts.returnLabel || 'Return to Planner';
  function show() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.dataset.contextRecovery = 'true';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(5,10,18,0.85);color:#eaf2f8;font:700 16px system-ui,sans-serif;' +
      'text-align:center;padding:24px;pointer-events:auto;';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div style="max-width:34rem"><h2 style="margin:0 0 12px"></h2><p style="font-weight:500;line-height:1.5"></p>' +
      '<div data-recovery-actions hidden style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:20px">' +
      '<button data-retry type="button" style="min-height:44px;padding:10px 16px"></button>' +
      '<button data-planner type="button" style="min-height:44px;padding:10px 16px"></button></div></div>';
    overlay.querySelector('h2').textContent = label;
    overlay.querySelector('p').textContent = detail;
    overlay.querySelector('[data-retry]').textContent = retryLabel;
    overlay.querySelector('[data-planner]').textContent = returnLabel;
    overlay.querySelector('[data-retry]').addEventListener('click', () => opts.onRetry?.());
    overlay.querySelector('[data-planner]').addEventListener('click', () => opts.onReturn?.());
    document.body.appendChild(overlay);
    recoveryTimer = setTimeout(() => {
      recoveryTimer = 0;
      if (!overlay) return;
      overlay.querySelector('[data-recovery-actions]').hidden = false;
      overlay.querySelector('[data-retry]').focus();
      opts.onTimeout?.();
    }, opts.recoveryMs ?? 12000);
  }
  function hide() {
    clearTimeout(recoveryTimer);
    recoveryTimer = 0;
    if (overlay) { overlay.remove(); overlay = null; }
  }
  const onLost = (e) => {
    e.preventDefault();          // allow the browser to attempt a restore
    show();
    opts.onLost?.();
  };
  const onRestored = () => {
    hide();
    opts.onRestored?.();
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestored);
  return {
    destroy() {
      clearTimeout(recoveryTimer);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      hide();
    },
  };
}
