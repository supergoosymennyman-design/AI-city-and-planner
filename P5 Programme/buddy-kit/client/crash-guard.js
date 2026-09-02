// crash-guard.js — global error net for every P5 app.
//
// Catches window-level `error` + `unhandledrejection` and shows a friendly,
// child-safe "Oops! The city hit a glitch." overlay with a Restart button,
// instead of a white screen or a frozen UI. The child's state is safe in
// localStorage/IndexedDB autosave, so Restart just reloads.
//
// WHY window-level only: element-targeted errors (a broken <img>/<script> load)
// are usually non-fatal decoration; only errors that bubble to `window` mean the
// app itself is broken. Same rule the deploy copy always used.
//
// Canonical source — the deploy scripts copy this verbatim to each app root
// (like buddy-boot.js). Do NOT edit the copy in deploy/.
(function () {
  'use strict';
  if (window.__crashGuard) return; // re-execution guard (doubled script tag)
  window.__crashGuard = true;

  var shown = false;      // show the overlay exactly once
  var lastCode = '';

  /** Short stable error code from the stack/message — readable in a bug report. */
  function codeOf(e, fallback) {
    var s = (e && (e.stack || e.message)) || fallback || '';
    if (!s) return 'E0';
    var h = 0;
    for (var i = 0; i < s.length && i < 400; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'E' + Math.abs(h).toString(36).toUpperCase();
  }

  /** Human message for the child — never the raw error text (could be confusing/scary). */
  function messageOf(e, fallback) {
    if (fallback && typeof fallback.message === 'string' && fallback.message) return fallback.message;
    if (typeof e === 'string' && e) return e;
    return 'Something unexpected happened.';
  }

  /** Build the overlay (idempotent-ish — guarded by `shown`). */
  function buildOverlay(code) {
    var wrap = document.createElement('div');
    wrap.id = 'crash-guard';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'The city hit a glitch');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;' +
      'background:radial-gradient(1200px 600px at 50% 20%, #16224a 0%, #0b132b 65%);' +
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px;';
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:420px;width:100%;text-align:center;color:#eaf2f8;background:rgba(20,30,60,0.96);' +
      'border:2px solid #00f2fe;border-radius:20px;padding:28px 26px;box-shadow:0 0 60px rgba(0,242,254,0.18);';
    card.innerHTML =
      '<svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true" style="display:block;margin:0 auto 10px">' +
      '<circle cx="40" cy="40" r="34" fill="#00f2fe" opacity="0.15"/>' +
      '<circle cx="40" cy="40" r="28" fill="#0b132b" stroke="#00f2fe" stroke-width="2"/>' +
      '<circle cx="33" cy="37" r="4" fill="#00f2fe"/><circle cx="47" cy="37" r="4" fill="#00f2fe"/>' +
      '<path d="M31 49 Q40 57 49 49" fill="none" stroke="#00f2fe" stroke-width="2" stroke-linecap="round"/>' +
      '<rect x="38" y="14" width="4" height="9" fill="#00f2fe"/><circle cx="40" cy="12" r="3" fill="#ffb84c"/></svg>' +
      '<h1 style="margin:0 0 6px;font-size:22px;color:#00f2fe">Oops! The city hit a glitch.</h1>' +
      '<p style="margin:0 0 18px;font-size:15px;color:#9fb0c7;line-height:1.5">No worries \u2014 your city is safe. Tap Restart and keep building!</p>' +
      '<button type="button" style="display:block;width:100%;min-height:54px;border-radius:14px;border:2px solid transparent;' +
      'background:#00ff9d;color:#06283a;font-size:17px;font-weight:800;cursor:pointer">\u21BB Restart City</button>' +
      '<div style="margin-top:12px;font-size:11px;color:#5c6b84;font-family:ui-monospace,monospace">' + code + '</div>';
    card.querySelector('button').addEventListener('click', function () { window.location.reload(); });
    wrap.appendChild(card);
    return wrap;
  }

  function show(e, fallback) {
    if (shown) return;
    shown = true;
    lastCode = codeOf(fallback, e);
    var overlay = buildOverlay(lastCode);
    requestAnimationFrame(function () {
      if (document.getElementById('crash-guard')) return; // already present
      if (document.body) document.body.appendChild(overlay);
      else setTimeout(function () { document.body && document.body.appendChild(overlay); }, 50);
    });
  }

  window.addEventListener('error', function (e) {
    if (shown) return;
    // Ignore element-targeted errors (img/script load failures) — decoration,
    // not an app crash. Only window-level errors mean the app is broken.
    if (e && e.target && e.target !== window) return;
    show(e && e.message ? e.message : 'Runtime error', e && e.error ? e.error : null);
  });
  window.addEventListener('unhandledrejection', function (e) {
    if (shown) return;
    var reason = e && e.reason ? e.reason : null;
    show(reason && typeof reason.message === 'string' ? reason.message : 'Promise rejected', reason);
  });

  /** Diagnostics hook — the code of the last crash, for tests/support. */
  window.__crashGuardLastCode = function () { return lastCode; };
})();
