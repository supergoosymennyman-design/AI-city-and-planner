/**
 * progress.js — tiny loading-progress bar + progress-reporting fetch, SHARED by the Fit Studio
 * (index.html) and the Animation Viewer (viewer.html).
 *
 * WHY: both pages autoload multi-megabyte assets (champion-base.glb is 24 MB; gear pieces run up
 * to ~15 MB). A bare "Loading…" status line hides how much longer a tablet on classroom Wi-Fi
 * has to wait, and a reviewer cannot tell a hung fetch from a slow one. The bar is driven either
 * by fetch stream progress (Content-Length present) or by explicit label/percent calls (dressing
 * piece N of M, restoring a wardrobe) — callers pass whatever they honestly know.
 *
 * Same house rules as the rest of the folder: vanilla, no CDN, no framework. The two pages both
 * include the <div id="loadProgress"> markup; progressUI() binds to it and no-ops when absent so
 * this module stays safe on either page.
 */

/**
 * Bind to the page's #loadProgress element. Returns {show, hide}.
 * show(label, pct): pct 0..1 draws a determinate bar ("label 47%"); pct omitted (null/undefined)
 * switches to an indeterminate slide (honest "working, unknown size", e.g. clip loads).
 */
export function progressUI() {
  const root = document.getElementById('loadProgress');
  const fill = document.getElementById('loadProgressFill');
  const text = document.getElementById('loadProgressText');

  function show(label, pct) {
    if (!root) return;
    if (pct == null) {
      root.hidden = false;
      root.classList.add('load-progress--indeterminate');
      if (text) text.textContent = label;
      if (fill) fill.style.width = '0%';
    } else {
      root.hidden = false;
      root.classList.remove('load-progress--indeterminate');
      if (text) text.textContent = label + ' ' + Math.round(pct * 100) + '%';
      if (fill) fill.style.width = Math.max(0, Math.min(100, pct * 100)) + '%';
    }
  }

  function hide() {
    if (!root) return;
    root.hidden = true;
    root.classList.remove('load-progress--indeterminate');
  }

  return { show, hide };
}

/**
 * fetch() with download progress. Reports 0..1 through onProgress from the response stream when
 * the server sends Content-Length; without a length the promise resolves after a single
 * onProgress(1) — the bar completes instead of sitting at 0 forever (honest, never stuck).
 * @param {string} url
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (!total || !res.body) {
    const buf = await res.arrayBuffer();
    if (onProgress) onProgress(1);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (onProgress) onProgress(received / total);
  }
  return new Blob(chunks).arrayBuffer();
}
