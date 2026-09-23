/**
 * EmbedderManager — crash-proof wrapper around the self-hosted MediaPipe ImageEmbedder.
 * PROMOTED from web/project/p5-01-recycle-eye/embedder.js (2026-08-17) the moment a second
 * lesson (the AI Machines workshop's Camera eye) reached for it — the toolbox law. p5-01 keeps
 * its local copy for now (that game is frozen mid-review); fold it over in its next touch.
 *
 * WHAT it wraps: `web/toolbox/assets/holistic/vision_bundle.js` — the SAME self-hosted MediaPipe
 * tasks-vision ES-module bundle holistic.js already uses. It genuinely exports `ImageEmbedder`
 * (verified against the bundle source on disk during the p5-01 build, not recalled from memory).
 *
 * ASSETS (installed on disk, never fetched by this file):
 *   web/toolbox/assets/holistic/vision_bundle.js                    (@mediapipe/tasks-vision ES module)
 *   web/toolbox/assets/holistic/wasm/vision_wasm_internal.{js,wasm} (SIMD only — Chrome/Edge/Safari 17+)
 *   web/ml/models/image_embedder/mobilenet_v3_small.tflite          (committed since 2026-09-15 — the one
 *                                                                    web/ml/ file that is; a fresh clone runs
 *                                                                    without `scripts/fetch-p5-01-models.mjs`)
 *
 * PATHS: resolved from THIS script's own URL (document.currentScript, same trick as holistic.js)
 * so any game at any depth can load it — unlike the p5-01 original, which could hardcode
 * page-relative paths because it only ever shipped beside one page. The model lives at
 * `<toolbox>/../ml/...`, i.e. web/ml/ as a sibling of web/toolbox/ — true under web/serve.js AND
 * the gateway mounts, which serve /toolbox/ and /ml/ as sibling roots.
 *
 * BUNDLE API (verified against the bundle SOURCE): `FilesetResolver.forVisionTasks(wasmDir)` →
 * Promise<fileset> (wasmDir has NO trailing slash — the resolver appends the wasm filenames
 * itself) · `ImageEmbedder.createFromOptions(fileset, {baseOptions:{modelAssetPath}, quantize})`
 * → Promise<embedder> · `embedder.embed(source)` is synchronous WASM. It now runs inside
 * embedder-worker.js, never on the page's UI thread. One transferred bitmap is in flight;
 * timeout/disposal terminates the worker and releases its WASM graph.
 *
 * Crash-proof contract (AGENTS.md — device I/O must never dead-end a caller): `init()` and
 * `embed()` ALWAYS settle and NEVER throw/reject. Any failure (missing export, a 404, a hung
 * wasm compile, a bad frame) becomes `init() → {ok:false, reason}` / `embed() → null`, so a
 * caller shows an honest retry instead of hanging. `init()` is idempotent — once settled
 * (success OR failure) further calls return that SAME cached outcome; `dispose()` first to force
 * a clean retry.
 *
 * TEST SEAM: if `window.__TOOLBOX_TEST_EMBEDDER__` exists AT THE MOMENT `init()` is first
 * called, this manager delegates `init()`/`embed()` to it ENTIRELY for the rest of the page's
 * life — whatever the stub resolves/returns/throws IS what this resolves/returns, so a test can
 * script any behavior (including a deliberately broken one) without loading wasm or a model.
 * The stub implements `{ init(): any, embed(source): any }` (sync or async both work).
 *
 * Globals: window.EmbedderManager. Also CommonJS-exported (module.exports guard) so node:test
 * can load this file to inspect its shape — nothing browser-only runs at require() time.
 */
(function () {
  'use strict';

  // Resolve assets from THIS script's own URL so the loading game can live at any depth (same
  // trick as holistic.js). The fallback matches a page two levels under web/ — the common case.
  var SELF_DIR = '';
  try {
    if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
      SELF_DIR = document.currentScript.src.replace(/[^/]*$/, '');
    }
  } catch (e) { /* non-browser */ }
  var BUNDLE_URL = SELF_DIR ? SELF_DIR + 'assets/holistic/vision_bundle.js' : './toolbox/assets/holistic/vision_bundle.js';
  var WASM_DIR = SELF_DIR ? SELF_DIR + 'assets/holistic/wasm' : './toolbox/assets/holistic/wasm';
  var MODEL_PATH = SELF_DIR ? SELF_DIR + '../ml/models/image_embedder/mobilenet_v3_small.tflite' : './ml/models/image_embedder/mobilenet_v3_small.tflite';
  var WORKER_URL = SELF_DIR ? SELF_DIR + 'embedder-worker.js' : './toolbox/embedder-worker.js';

  // Generous but bounded: a hung wasm compile or stalled fetch must still let the caller's
  // loading screen give up and offer Retry rather than hang forever.
  var INIT_TIMEOUT_MS = 45000;

  var initPromise = null;      // cached — init() is idempotent; see file header
  var testSeam = null;         // set iff window.__TOOLBOX_TEST_EMBEDDER__ was present at the first init()
  var embedderInstance = null; // readiness flag; the actual graph lives only in the worker
  var generation = 0;          // bumped by dispose() so a late-resolving in-flight load can't clobber fresh state
  var worker = null, pending = null, requestId = 0, busy = false;
  function stopWorker() {
    if (worker) worker.terminate(); worker = null;
    if (pending) { clearTimeout(pending.timer); pending.resolve(null); pending = null; }
  }
  function request(message, transfer, timeout) {
    return new Promise(function (resolve) {
      if (!worker || pending) { resolve(null); return; }
      var id = ++requestId;
      pending = { id:id, resolve:resolve, timer:setTimeout(stopWorker,timeout) };
      try { worker.postMessage(Object.assign({id:id},message),transfer || []); }
      catch(e) { if(message.bitmap) message.bitmap.close(); stopWorker(); }
    });
  }

  /** Turn any thrown value into a short, loggable string — never lets a weird throw blow up the reason field. */
  function describeError(e) {
    if (e && e.message) return String(e.message);
    try { return String(e); } catch (e2) { return 'unknown error'; }
  }

  /** Resolve `promise` with `fallback` if it hasn't settled within `ms`. Never rejects itself. */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(fallback);
      }, ms);
      promise.then(
        function (v) { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
        function () { if (settled) return; settled = true; clearTimeout(timer); resolve(fallback); }
      );
    });
  }

  /**
   * Load bundle/fileset/model inside one worker. Resolves {ok, reason?} — never throws.
   * @param {number} myGeneration disposal invalidates this request and terminates its worker;
   *   a late result cannot overwrite a newer initialization.
   */
  function loadReal(myGeneration) {
    var attempt = (async function () {
      try {
        worker = new Worker(WORKER_URL);
        var ownWorker = worker;
        worker.onerror = function () { if(worker === ownWorker) stopWorker(); };
        worker.onmessage = function (event) {
          var data = event.data;
          if (!pending || data.id !== pending.id) return;
          var done = pending; pending = null; clearTimeout(done.timer); done.resolve(data);
        };
        var result = await request({kind:'init',bundle:BUNDLE_URL,wasm:WASM_DIR,model:MODEL_PATH},[],INIT_TIMEOUT_MS);
        if (myGeneration !== generation) return {ok:false,reason:'disposed during init'};
        if (!result || !result.ok) { stopWorker(); return {ok:false,reason:result && result.error || 'Background camera processing is unavailable or timed out.'}; }
        embedderInstance = true;
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: describeError(e) };
      }
    })();
    var TIMED_OUT = { timedOut: true };
    return withTimeout(attempt, INIT_TIMEOUT_MS, TIMED_OUT).then(function (res) {
      if (res !== TIMED_OUT) return res;
      // Give up on the caller AND invalidate the still-running attempt: bumping `generation`
      // makes its own late success take the discard-and-close branch above, instead of silently
      // publishing a live instance AFTER init already reported failure.
      generation++;
      return { ok: false, reason: 'timed out after ' + INIT_TIMEOUT_MS + 'ms (wasm compile or model fetch never settled)' };
    });
  }

  /**
   * Bring the embedder up. Idempotent — a second call returns the FIRST call's cached outcome
   * without re-triggering any load (dispose() first to force a clean retry). Delegates entirely
   * to `window.__TOOLBOX_TEST_EMBEDDER__` when present (test seam — see file header).
   * @returns {Promise<{ok:boolean, reason?:string}>} never rejects.
   */
  function init() {
    if (initPromise) return initPromise;
    var seam = (typeof window !== 'undefined') ? window.__TOOLBOX_TEST_EMBEDDER__ : undefined;
    if (seam) {
      testSeam = seam;
      initPromise = (async function () {
        try { return await testSeam.init(); } catch (e) { return { ok: false, reason: 'test seam init() threw: ' + describeError(e) }; }
      })();
      return initPromise;
    }
    initPromise = loadReal(generation);
    return initPromise;
  }

  /**
   * Embed one image-like source with the current model. Assumes `init()` already resolved
   * `{ok:true}` — if it hasn't run/succeeded, resolves null rather than throwing; the caller
   * gates on init()'s result first, same as every device wrapper in this toolbox.
   * @param {HTMLCanvasElement|HTMLVideoElement|HTMLImageElement} source
   * @returns {Promise<Float32Array|null>} never rejects.
   */
  async function embed(source) {
    if (testSeam) {
      try { return await testSeam.embed(source); } catch (e) { return null; }
    }
    try {
      if (!embedderInstance || !worker || busy) return null;
      busy = true;
      var myGeneration = generation;
      var acceptBitmap = true;
      var bitmapJob = createImageBitmap(source);
      bitmapJob.then(function (late) { if (!acceptBitmap || myGeneration !== generation) late.close(); },function () {});
      var bitmap = await withTimeout(bitmapJob,10000,null);
      if (!bitmap) { acceptBitmap=false; return null; }
      if (myGeneration !== generation) { bitmap.close(); return null; }
      var result = await request({kind:'embed',bitmap:bitmap},[bitmap],10000);
      var vec = result && result.vec;
      if (!vec || !vec.length) return null;
      return (vec instanceof Float32Array) ? vec : new Float32Array(vec);
    } catch (e) {
      return null;
    } finally { if (myGeneration === generation) busy = false; }
  }

  /** Tear down the real model (if loaded) and reset all cached state so a later init() starts fresh. */
  function dispose() {
    generation++;
    stopWorker(); busy = false;
    embedderInstance = null;
    testSeam = null;
    initPromise = null;
  }

  var EmbedderManager = { init: init, embed: embed, dispose: dispose };
  if (typeof window !== 'undefined') window.EmbedderManager = EmbedderManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = EmbedderManager;
})();
