// client/buddy-boot.js — the ONE script tag a host app needs.
//
//   <script src="https://your-gateway/buddy-boot.js"></script>
//   <script>BuddyBoot.mount({ manifest, getState, apply });</script>
//
// WHY this file exists: before it, a host hand-copied six ordered script loads plus a stylesheet
// (p5-01's game.js did exactly that). Getting the order wrong is SILENT — the bubble mounts, and then
// the child's first message throws into dead air, because buddy.js reaches for CommandParse /
// StreamFrames / KidMarkdown / ProjectState only at chat time. That shipped once. The list now lives
// here, next to the code that needs it, and a host never writes it again.
//
// Everything is buildless and offline: classic <script> tags, same-origin by default, no bundler, no
// CDN, no fetch of anything but our own files.
(function () {
  'use strict';

  // RE-EXECUTION GUARD — first statement, before anything else runs. A host that includes the
  // documented snippet TWICE (two templates, a partial rendered twice, a CMS block pasted in two
  // places) executes this file twice, and each execution gets its OWN closure: `pending` below starts
  // null again, so the second mount() reloads all seven dependencies and mounts a SECOND launcher and
  // panel over the first. That makes two documented promises false at once — "a second call, or a
  // doubled script tag, loads nothing twice" and "no multi-instance page" (INTEGRATION.md §9) — and it
  // is the FIRST thing a stranger's build system will do to us. Bailing here keeps the first
  // execution's `window.BuddyBoot` (and therefore its `pending`) as the one and only instance.
  if (window.BuddyBoot) return;

  /**
   * The canonical load order. Each entry is relative to this file's own directory.
   * `logic/*` are the pure modules buddy.js consumes at chat time (action validation, project state,
   * NDJSON frame decoding, kid-safe markdown, slash-command parsing); then the chat core; then the
   * widget chrome that mounts it. Exported (frozen) so tests and INTEGRATION.md cannot drift from it.
   * @type {ReadonlyArray<string>}
   */
  var DEPENDENCIES = Object.freeze([
    'logic/action-schema.js',
    'logic/project-state.js',
    'logic/stream-frames.js',
    'logic/kid-markdown.js',
    'logic/command-parse.js',
    'buddy.js',
    'buddy-widget.js',
  ]);

  // Captured AT PARSE TIME: document.currentScript is only non-null while this script is executing,
  // so reading it later (inside mount) would always yield null. This is what lets a host configure
  // zero paths — the gateway origin is wherever they pointed the <script src>.
  var SELF = (document.currentScript && document.currentScript.src) || '';
  // lastIndexOf returns -1 for a slash-free SELF (bare filename, no directory). slice(0, -1) would
  // chop the LAST CHARACTER of SELF rather than yield '' -- e.g. 'buddy-boot.js' -> 'buddy-boot.j',
  // which is truthy and silently 404s every dependency ('buddy-boot.j/logic/...'). A real browser
  // <script>.src always resolves absolute (always has a slash), so this is a latent case, not a live
  // one -- guarded explicitly rather than relying on that always being true.
  var SLASH = SELF.lastIndexOf('/');
  var BASE = SLASH >= 0 ? SELF.slice(0, SLASH) : '';

  /** Absolute url for a path relative to this loader. */
  function url(rel) { return BASE ? BASE + '/' + rel : rel; }

  /**
   * Load one <script src>, resolving on load and REJECTING (loudly, naming the url) on error.
   *
   * NO DE-DUP: this appends a fresh <script> every call, so calling it twice for the same src loads it
   * twice. (p5-01's own `loadScript` in game.js does de-dup; this one deliberately does not — one
   * responsibility per function.) Not loading anything twice is `mount()`'s job, and it does it two
   * ways: the `pending` promise below makes a repeat call a no-op, and the re-execution guard at the top
   * of this IIFE makes a doubled <script src="buddy-boot.js"> a no-op. Every call to loadScript comes
   * from that one guarded path, so a duplicate tag is unreachable today — stated here so a future
   * caller does not assume a guarantee this function never made.
   * @param {string} src @returns {Promise<void>}
   */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('buddy-boot: could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  /**
   * Load one stylesheet, INSERTED BEFORE the host's own sheets rather than appended.
   *
   * WHY insert instead of append: the documented cascade is core -> theme -> host, so a host can
   * override any class by source order at equal specificity, with no !important anywhere. A host's
   * <link> is already in <head> when this runs, so APPENDING would put our sheets last and make them
   * win every tie — which is precisely why p5-01 had to mark 11 of its own rules !important to beat a
   * dynamically appended buddy-widget.css. Inserting ahead of the first existing stylesheet makes the
   * contract true. With no host sheet present (our own demo pages), insertBefore(null) === append.
   *
   * WHY the anchor is a PARAMETER and not looked up here: after the first insert, "the first
   * stylesheet in <head>" IS the sheet we just inserted, so a per-call lookup would place the theme
   * AHEAD of core and invert the one order that matters. The caller captures the anchor once and
   * passes the same node for both sheets, which keeps them in call order ahead of it.
   * @param {string} href @param {Element|null} anchor - insert before this node; null appends
   * @returns {Promise<void>}
   */
  function loadCss(href, anchor) {
    return new Promise(function (resolve, reject) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = function () { resolve(); };
      l.onerror = function () { reject(new Error('buddy-boot: could not load ' + href)); };
      document.head.insertBefore(l, anchor || null);
    });
  }

  var pending = null; // the one in-flight (or settled) mount — see mount()'s idempotency contract

  /**
   * Load the buddy and mount it as a floating bubble.
   *
   * Idempotent: a second call returns the SAME promise and loads nothing twice (`pending`), and a
   * DOUBLED <script src="buddy-boot.js"> never reaches a second `pending` at all (the re-execution
   * guard at the top of this IIFE — without it the second execution's fresh closure would mount a
   * second launcher and panel). Never throws synchronously — a host may ignore the returned promise (fire-and-forget, as
   * p5-01 does) and a failure still surfaces in the console rather than silently producing a bubble
   * that dies on first send. A rejected mount stays rejected for the rest of the page's life, ON
   * PURPOSE — retrying would risk a second mount racing the first and producing two widgets; recovery
   * is a page reload, same as any other failed one-time boot script.
   *
   * Deciding WHETHER a gateway exists stays the host's business (p5-01 probes for one before it ever
   * calls this); the loader does one job.
   *
   * @param {object} opts - every window.BuddyWidget.mount option (manifest, getState, apply,
   *   buddyName, onBuddyName, getMemory, onRemember, notes, persona, gatewayUrl), plus:
   *   `theme:false` skips buddy-theme.css only — buddy-core.css is never skippable, because a host
   *   that re-authors structure inherits our layout bugs and fixes them alone (see INTEGRATION.md).
   *   `gatewayUrl` defaults to this loader's own base, so /api/turn resolves with no extra wiring.
   * @returns {Promise<{open:function, close:function, adoptName:function, clearConversation:function}>} the widget handle
   */
  function mount(opts) {
    if (pending) return pending;
    opts = opts || {};
    pending = (function () {
      // Captured ONCE, before any insert — see loadCss's contract for why a per-call lookup inverts
      // core/theme order.
      //
      // SCOPED TO document.head, NOT the document. `document.querySelector` searches the whole tree, so
      // it will happily return a <style> a component library injected into <body>, or a deferred sheet
      // at the end of body — and `document.head.insertBefore(link, thatNode)` then throws
      // NotFoundError (DOM pre-insert step 2: the reference child must be a child of the parent).
      // That throw happens inside loadCss's Promise executor, so loadCss rejects, mount() rejects, and
      // the host gets NO BUDDY AT ALL with a bare DOMException as the only clue. No host we ship to
      // today has a body-level sheet; this kit exists for hosts we have never seen.
      var anchor = document.head.querySelector('link[rel~="stylesheet"], style');
      var css = [loadCss(url('buddy-core.css'), anchor)];
      if (opts.theme !== false) css.push(loadCss(url('buddy-theme.css'), anchor));
      // Scripts load STRICTLY in sequence (each awaits the previous): classic <script> tags appended
      // dynamically are async by default, so firing them in parallel would let buddy.js execute
      // before the logic modules it closes over exist. The stylesheets have no such ordering
      // dependency on the scripts, so they ride along concurrently.
      var chain = Promise.resolve();
      DEPENDENCIES.forEach(function (dep) {
        chain = chain.then(function () { return loadScript(url(dep)); });
      });
      return Promise.all([chain, Promise.all(css)]).then(function () {
        if (!window.BuddyWidget || typeof window.BuddyWidget.mount !== 'function') {
          throw new Error('buddy-boot: buddy-widget.js loaded but window.BuddyWidget.mount is missing');
        }
        if (opts.gatewayUrl === undefined) opts.gatewayUrl = BASE;
        return window.BuddyWidget.mount(opts);
      });
    })();
    pending.catch(function (e) {
      // Loud, and never swallowed: a host that fire-and-forgets still sees why nothing appeared.
      // The promise stays rejected for a host that DID await it.
      if (window.console && console.error) console.error(e && e.message ? e.message : e);
    });
    return pending;
  }

  window.BuddyBoot = { mount: mount, DEPENDENCIES: DEPENDENCIES };
})();
