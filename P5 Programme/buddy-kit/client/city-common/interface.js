// Planner / outdoor City only. No persistence. Owns existing and dynamic dialogs.
const selector = '[aria-modal="true"], dialog[open]';
const visible = el => el.isConnected && !el.hidden && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
const focusable = root => [...root.querySelectorAll('button, a[href], input, textarea, select, summary, iframe, [tabindex]')].filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length);
let stack = [], inerted = new Map(), lastFocus = null, installed = false;
export function activeModal() {
  const opened = [...document.querySelectorAll(selector)].filter(visible);
  return opened.filter(el => !stack.some(entry => entry.el === el)).at(-1)
    || stack.filter(entry => opened.includes(entry.el)).at(-1)?.el || null;
}
function release() { for (const [el, value] of inerted) el.inert = value; inerted.clear(); }
function containBackground(modal) {
  let node = modal;
  while (node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || ['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) continue;
      if (!inerted.has(sibling)) inerted.set(sibling, sibling.inert);
      sibling.inert = true;
    }
    if (node.parentElement === document.body) break;
    node = node.parentElement;
  }
}
function reconcile() {
  const open = [...document.querySelectorAll(selector)].filter(visible);
  const old = stack.at(-1);
  const removed = stack.filter(entry => !open.includes(entry.el));
  stack = stack.filter(entry => open.includes(entry.el));
  for (const el of open) if (!stack.some(entry => entry.el === el)) {
    let origin = lastFocus || document.activeElement;
    // Chained dialogs (My Work → Save) return to the original visible opener.
    const previous = removed.find(entry => entry.el.contains(origin));
    if (previous) origin = previous.origin;
    stack.push({el, origin});
  }
  const top = stack.at(-1);
  if (top?.el === old?.el) {
    if (top) {
      containBackground(top.el);
      if (!top.el.contains(document.activeElement)) (focusable(top.el)[0] || top.el).focus();
    }
    return;
  }
  release();
  if (top) {
    containBackground(top.el);
    top.el.tabIndex = -1;
    // Keep a deliberately focused input; otherwise prefer input, then first action.
    const returned = removed.at(-1)?.origin;
    if (returned && top.el.contains(returned) && returned.isConnected) returned.focus();
    else if (!top.el.contains(document.activeElement)) (focusable(top.el).find(el => el.tagName === 'INPUT') || focusable(top.el)[0] || top.el).focus();
  } else {
    const origin = removed[0]?.origin;
    if (origin?.isConnected && !origin.closest('[inert]')) origin.focus();
  }
  window.dispatchEvent(new CustomEvent('modal:change', {detail:{open:!!top}}));
}
export function installModalOwnership() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', e => {
    if (!e.isTrusted) return; // Internal forwarding/download clicks are not openers.
    const opener = e.target.closest('button, a, summary, [role="button"]');
    if (opener) lastFocus = opener;
  }, true);
  document.addEventListener('focusin', e => {
    const top = activeModal();
    if (top && visible(top) && !top.contains(e.target)) { (focusable(top)[0] || top).focus(); return; }
    if (!top || !top.contains(e.target)) lastFocus = e.target;
  });
  // Capture Tab/Escape before legacy global handlers. Other keys reach dialog
  // controls; the bubble guard below prevents them reaching background handlers.
  window.addEventListener('keydown', e => {
    const modal = activeModal(); if (!modal) return;
    if (e.key === 'Tab') {
      const items = focusable(modal), first = items[0], last = items.at(-1);
      if (!items.length || (e.shiftKey ? document.activeElement === first : document.activeElement === last) || !modal.contains(document.activeElement)) {
        e.preventDefault(); (e.shiftKey ? last : first)?.focus();
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      // Recovery must retain its explicit backup / retry / reload decision.
      if (modal.id === 'restore-results') return;
      const close = modal.querySelector('.modal-close, #game-overlay-close, [data-modal-close]');
      if (close) close.click(); else if (modal.tagName === 'DIALOG') modal.close();
    }
  }, true);
  document.addEventListener('keydown', e => { if (activeModal()) e.stopImmediatePropagation(); });
  new MutationObserver(reconcile).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','hidden','open','aria-modal']});
  reconcile();
}

// Session 6 policy: freeze decorative ambient time, retain user-directed motion.
// Query live, so OS preference changes apply without reload or a storage key.
export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const ambientDelta = dt => reducedMotion() || document.hidden ? 0 : dt;

// Continuous controls: hold via pointer or Space/Enter; AT click gives one short
// step. Blur, cancellation, modal opening and tab hiding always release the hold.
export function bindHold(el, on, off) {
  if (!el) return;
  let timer;
  const stop = () => { clearTimeout(timer); off(); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); on(); });
  for (const event of ['pointerup','pointercancel','lostpointercapture','blur']) el.addEventListener(event, stop);
  el.addEventListener('keydown', e => { if ([' ','Enter'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); on(); } });
  el.addEventListener('keyup', e => { if ([' ','Enter'].includes(e.key)) { e.preventDefault(); stop(); } });
  el.addEventListener('click', e => { if (e.detail === 0) { on(); timer = setTimeout(stop, 180); } });
  window.addEventListener('modal:change', stop);
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', stop);
}
