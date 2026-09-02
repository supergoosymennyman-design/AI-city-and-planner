/**
 * HolisticManager — MediaPipe Holistic Landmarker (ONE tracked person: BlazePose-33 body +
 * 21-point hands) over SELF-HOSTED assets. No CDN at runtime (AGENTS.md offline rule).
 *
 * Why this exists (vs. toolbox/pose.js): pose.js is MoveNet MultiPose — many bodies, COCO-17, no
 * toe keypoint and no fingers. Holistic trades the headcount for PRECISION on one body: a real
 * index-fingertip landmark (hand landmark 8) and real toe landmarks (foot_index, 31/32). k2-17
 * "Point & Learn" needs the fingertip + toes; k2-18 is the documented second consumer.
 *
 * Crash-proof contract (the classroom rule): probe() and detect() ALWAYS settle and NEVER throw.
 * A missing/hung/failed model resolves false / null so the caller can block honestly with a retry
 * instead of hanging forever. GPU delegate is tried first and falls back to CPU automatically.
 *
 * ASSETS (already installed, do not fetch):
 *   web/toolbox/assets/holistic/vision_bundle.js          (@mediapipe/tasks-vision ES module;
 *                                                          renamed from .mjs — serve.js MIME map)
 *   web/toolbox/assets/holistic/wasm/vision_wasm_internal.{js,wasm}   (SIMD only — Chrome/Edge)
 *   web/toolbox/assets/holistic/holistic_landmarker.task  (13.68 MB float16 model)
 *
 * NOTE (upstream doc bug, keep): MediaPipe's own web README prints the model URL ending
 * `.../holistic_landmarker/float16/1/hand_landmark.task`, which 404s. The real file is
 * `.../holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task`.
 *
 * Globals: window.HolisticManager. Also CommonJS-exported for node --test.
 */
(function () {
  'use strict';

  // Resolve the asset folder from THIS script's own URL so the game can live at any depth and the
  // whole thing still works over file://. Falls back to a same-origin absolute path.
  var SELF_SRC = '';
  try {
    if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
      SELF_SRC = document.currentScript.src;
    }
  } catch (e) { /* non-browser */ }
  var DEFAULT_ASSETS = SELF_SRC ? SELF_SRC.replace(/[^/]*$/, 'assets/holistic/') : '../../toolbox/assets/holistic/';

  /** Resolve a promise with `fallback` if it hasn't settled in `ms` (never rejects). */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
      var timer = setTimeout(function () { done(fallback); }, ms);
      try { promise.then(done, function () { done(fallback); }); } catch (e) { done(fallback); }
    });
  }

  /**
   * One MediaPipe landmark → the toolbox's plain landmark shape.
   * `visibility` (pose only; hands don't carry it) becomes `score`, so downstream pure logic uses ONE
   * confidence convention across pose.js and holistic.js. Hand points get score `undefined` = "present".
   */
  function toLandmark(p) {
    return { x: p.x, y: p.y, z: p.z, score: p.visibility === undefined ? undefined : p.visibility };
  }
  function toLandmarks(arr) {
    if (!arr || !arr.length) return null;
    var out = new Array(arr.length);
    for (var i = 0; i < arr.length; i++) out[i] = toLandmark(arr[i]);
    return out;
  }

  /**
   * @param {object} [opts]
   * @param {string} [opts.assetsBase]   folder holding vision_bundle.js / wasm/ / the .task model
   * @param {number} [opts.loadTimeoutMs] give up on a hung model load (default 30000 ms)
   * @param {'GPU'|'CPU'} [opts.delegate] first delegate to try; CPU is the automatic fallback
   */
  function HolisticManager(opts) {
    opts = opts || {};
    this.assetsBase = opts.assetsBase || DEFAULT_ASSETS;
    this.loadTimeoutMs = opts.loadTimeoutMs != null ? opts.loadTimeoutMs : 30000;
    this.delegate = opts.delegate || 'GPU';
    /** Which delegate actually loaded ('GPU' | 'CPU' | null) — surfaced for diagnostics only. */
    this.backend = null;
    this._lm = null;
    this._loadPromise = null;
    this._lastTs = -1;      // detectForVideo timestamps MUST increase monotonically
    this._disposed = false;
  }

  /** Load the ES-module bundle once. Classic-script callers can't `import` — we do it for them. */
  HolisticManager.prototype._loadBundle = function () {
    var url = this.assetsBase + 'vision_bundle.js';
    // Indirect eval keeps bundlers/older parsers from choking; this file is never bundled, but the
    // dynamic import must survive being loaded as a classic script in every target browser.
    return import(/* webpackIgnore: true */ url);
  };

  /**
   * Create the landmarker at most once. Resolves the landmarker or null — never rejects.
   * Tries `this.delegate` (GPU by default) then falls back to CPU, because a tablet with a blocked
   * or broken WebGL context must still run the lesson rather than dead-end.
   */
  HolisticManager.prototype._ensure = function () {
    var self = this;
    if (this._disposed) return Promise.resolve(null);
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = withTimeout((async function () {
      try {
        var mod = await self._loadBundle();
        var FilesetResolver = mod.FilesetResolver, HolisticLandmarker = mod.HolisticLandmarker;
        if (!FilesetResolver || !HolisticLandmarker) return null;
        var vision = await FilesetResolver.forVisionTasks(self.assetsBase + 'wasm');
        var modelAssetPath = self.assetsBase + 'holistic_landmarker.task';
        var order = self.delegate === 'CPU' ? ['CPU'] : ['GPU', 'CPU'];
        for (var i = 0; i < order.length; i++) {
          try {
            self._lm = await HolisticLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelAssetPath, delegate: order[i] },
              runningMode: 'VIDEO',
            });
            self.backend = order[i];
            return self._lm;
          } catch (e) {
            try { console.warn('[holistic] delegate ' + order[i] + ' failed:', e && e.message || e); } catch (e2) {}
          }
        }
        return null;
      } catch (e) {
        try { console.warn('[holistic] load failed:', e && e.message || e); } catch (e2) {}
        return null;
      }
    })(), this.loadTimeoutMs, null);

    return this._loadPromise;
  };

  /** True once the model is usable. Resolves false on ANY failure/timeout — never throws. */
  HolisticManager.prototype.probe = async function () {
    try { return (await this._ensure()) !== null; } catch (e) { return false; }
  };

  /**
   * One VIDEO-mode read of `videoEl`.
   * @returns {Promise<{pose: object[]|null, poseWorld: object[]|null, leftHand: object[]|null, rightHand: object[]|null}|null>}
   *   `null` when the model isn't ready / the frame is unusable / inference threw. Holistic is
   *   SINGLE-PERSON, so the nested result arrays are always taken at index [0].
   *   `pose` is image-normalized (x,y in 0..1, z image-scaled); `poseWorld` is MediaPipe's WORLD
   *   pose — metres, origin at the hip centre — the right input for driving a 3D skeleton
   *   (motion capture / champion mirroring, 2026-08-11). Null if the runtime doesn't provide it.
   */
  HolisticManager.prototype.detect = async function (videoEl) {
    try {
      var lm = await this._ensure();
      if (!lm || this._disposed) return null;
      if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
      var ts = (typeof performance !== 'undefined' && performance.now) ? performance.now() : this._lastTs + 1;
      if (ts <= this._lastTs) ts = this._lastTs + 1;  // MUST be strictly increasing or MediaPipe throws
      this._lastTs = ts;
      var res = lm.detectForVideo(videoEl, ts);
      if (!res) return null;
      // faceLandmarks + segmentationMasks are deliberately IGNORED (this lesson needs body + hands).
      return {
        pose: toLandmarks(res.poseLandmarks && res.poseLandmarks[0]),
        poseWorld: toLandmarks(res.poseWorldLandmarks && res.poseWorldLandmarks[0]),
        leftHand: toLandmarks(res.leftHandLandmarks && res.leftHandLandmarks[0]),
        rightHand: toLandmarks(res.rightHandLandmarks && res.rightHandLandmarks[0]),
      };
    } catch (e) {
      return null;
    }
  };

  HolisticManager.prototype.dispose = function () {
    this._disposed = true;
    try { if (this._lm && this._lm.close) this._lm.close(); } catch (e) {}
    this._lm = null; this._loadPromise = null;
  };

  if (typeof window !== 'undefined') window.HolisticManager = HolisticManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = { HolisticManager: HolisticManager };
})();
