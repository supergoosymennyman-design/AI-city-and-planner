/**
 * The Pose sense adapter — MediaPipe Holistic packaged to the model-library contract
 * (docs/handouts/model-library-kit/ADAPTER.md). Type A extractor, live: true.
 *
 * WHAT IT DOES: one video frame → ONE unit vector of POSE_VEC_LENGTH numbers, or null when no
 * body is in shot. It writes no classifier, no threshold, no shelves — the app's brain does all
 * of that; this file only makes the numbers (ADAPTER.md §1).
 *
 * THE MATHS THAT MAKES IT WORK (ADAPTER.md 5.3, "scale- and position-invariant"):
 *   A body two metres away and the same body one metre away are the SAME pose. Raw image
 *   coordinates fail that badly, so poseVec():
 *     1. centres every landmark on the HIP MIDPOINT           → position goes away
 *     2. divides by the SHOULDER-MID → HIP-MID distance          → distance-from-camera goes away
 *     3. unit-normalises the whole vector                       → the brain's 1 − d²/2 sureness holds
 *   It keeps 12 body landmarks (shoulders, elbows, wrists, hips, knees, ankles) × (x, y) = 24
 *   numbers, plus 2 hand-open signals (left/right: 0 = no hand seen, else fingertip spread over
 *   palm size), = 26. Face points are dropped (a pose is a body, not an expression); z is dropped
 *   (image-z is noisy and camera-dependent — the card says so honestly).
 *
 * LIVE CONTRACT (ADAPTER.md §4, 5.1, 5.6): vec() is called ~2×/s for a whole lesson on the live
 * <video>. Nothing throws, nothing hangs, no frame is kept, no storage is touched.
 *
 * KIT LAW: docs/handouts/model-library-kit/example-holistic/adapter.js is a BYTE COPY of this file
 * (a test pins it) — what interns read is what the app runs.
 *
 * Globals: window.SenseAdapter_pose. CommonJS-exported for node --test.
 */
(function () {
  'use strict';

  /** Every vector this adapter returns has exactly this many numbers. */
  var POSE_VEC_LENGTH = 26;

  /** BlazePose-33 indices of the body landmarks kept (order = vector order). */
  var KEEP = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  var L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;
  /** A body landmark this faint is "not really seen"; two hips/shoulders like that = no body. */
  var MIN_ANCHOR_SCORE = 0.3;
  var INIT_TIMEOUT_MS = 45000;

  function unit(v) {
    var n = 0;
    for (var i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    var out = new Array(v.length);
    for (var j = 0; j < v.length; j++) out[j] = v[j] / n;
    return out;
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function seen(p) { return p && (p.score === undefined || p.score >= MIN_ANCHOR_SCORE); }

  /**
   * How open a hand is, from its 21 landmarks: mean fingertip distance from the wrist, over
   * the wrist→middle-knuckle length (scale-free). 0 when the hand is not in shot.
   * @param {Array|null} hand
   * @returns {number}
   */
  function handOpen(hand) {
    if (!hand || hand.length < 21) return 0;
    var wrist = hand[0], palm = dist(wrist, hand[9]) || 1;
    var tips = [4, 8, 12, 16, 20], sum = 0;
    for (var i = 0; i < tips.length; i++) sum += dist(wrist, hand[tips[i]]);
    return sum / tips.length / palm;
  }

  /**
   * PURE: a Holistic detection → the pose vector, or null. Exported so the maths is testable in
   * Node without a model (the same body at two distances must land on the same vector).
   * @param {{pose: Array|null, leftHand?: Array|null, rightHand?: Array|null}|null} det
   * @returns {number[]|null} POSE_VEC_LENGTH finite numbers, unit length; null = no body.
   */
  function poseVec(det) {
    try {
      var pose = det && det.pose;
      if (!pose || pose.length < 33) return null;
      var ls = pose[L_SHOULDER], rs = pose[R_SHOULDER], lh = pose[L_HIP], rh = pose[R_HIP];
      // The anchors must be SEEN, or "centre and scale" would be built on noise.
      if (!seen(ls) || !seen(rs) || !seen(lh) || !seen(rh)) return null;
      var cx = (lh.x + rh.x) / 2, cy = (lh.y + rh.y) / 2;
      var sx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
      var torso = Math.hypot(sx - cx, sy - cy);
      if (!(torso > 1e-6)) return null; // a degenerate body (all points on one spot) is not a pose
      var v = [];
      for (var i = 0; i < KEEP.length; i++) {
        var p = pose[KEEP[i]];
        if (!p) return null;
        // An unseen limb point sits at the hip centre (0,0) — "not extended" — rather than at a
        // wild guessed coordinate the model may still emit for occluded points.
        var vis = seen(p);
        v.push(vis ? (p.x - cx) / torso : 0);
        v.push(vis ? (p.y - cy) / torso : 0);
      }
      v.push(handOpen(det.leftHand));
      v.push(handOpen(det.rightHand));
      for (var k = 0; k < v.length; k++) if (!Number.isFinite(v[k])) return null;
      return unit(v);
    } catch (e) {
      return null;
    }
  }

  // --- lifecycle (crash-proof: always settle) ----------------------------------------
  var mgr = null;
  var initOutcome = null;

  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      var timer = setTimeout(function () { finish(fallback); }, ms);
      try { Promise.resolve(p).then(finish, function () { finish(fallback); }); } catch (e) { finish(fallback); }
    });
  }

  function probe() {
    return withTimeout((async function () {
      try {
        if (typeof window === 'undefined' || !window.HolisticManager) return false;
        if (!mgr) mgr = new window.HolisticManager();
        return await mgr.probe();
      } catch (e) { return false; }
    })(), INIT_TIMEOUT_MS, false);
  }

  /** Load the landmarker once; idempotent; {ok:false, reason} on any failure. */
  function init() {
    if (initOutcome) return Promise.resolve(initOutcome);
    // TEST SEAM (same convention as toolbox/embedder.js): a stub present at first init()
    // replaces the model for the page's life — browser tests script poses without 25 MB of wasm.
    var seam = (typeof window !== 'undefined') ? window.__TOOLBOX_TEST_HOLISTIC__ : undefined;
    var run = (async function () {
      try {
        if (seam) { mgr = seam; return { ok: true }; }
        if (typeof window === 'undefined' || !window.HolisticManager) return { ok: false, reason: 'holistic.js is not loaded' };
        if (!mgr) mgr = new window.HolisticManager();
        var ok = await mgr.probe();
        return ok ? { ok: true } : { ok: false, reason: 'the pose model would not load' };
      } catch (e) {
        return { ok: false, reason: (e && e.message) ? String(e.message) : 'load failed' };
      }
    })();
    return withTimeout(run, INIT_TIMEOUT_MS, { ok: false, reason: 'timed out loading the pose model' })
      .then(function (outcome) { initOutcome = outcome; return outcome; });
  }

  function dispose() {
    try { if (mgr && mgr.dispose) mgr.dispose(); } catch (e) { /* nothing useful to do */ }
    mgr = null;
    initOutcome = null;
  }

  /**
   * TYPE A, live: a picture → the pose vector | null. That picture may be a live <video> element,
   * a canvas — ADAPTER.md §6's promise for `inputKind: 'video'`, and what a crate on the belt
   * carries — or a decoded <img>, which the photo tray hands over directly (game.js importPhotos /
   * teachTrainingSet); holistic.js's guard admits all three. Async because Holistic's detect is;
   * the app awaits it. Never throws, never keeps the frame.
   * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} input
   * @returns {Promise<number[]|null>}
   */
  function vec(input) {
    try {
      if (!mgr || !initOutcome || !initOutcome.ok || !input) return Promise.resolve(null);
      return Promise.resolve(mgr.detect(input)).then(poseVec, function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /** Kit-only (ADAPTER.md §7): three REAL poses, computed here from landmark fixtures — a
   *  synthetic body so the maths is checkable in Node: arms down, arms up, and arms up but twice
   *  as far from the camera (must equal arms up — the whole point). */
  function sampleVectors() {
    var body = function (scale, armsUp) {
      var pose = [];
      for (var i = 0; i < 33; i++) pose.push({ x: 0.5, y: 0.5, score: 0.1 }); // unseen filler
      var put = function (i, x, y) { pose[i] = { x: 0.5 + x * scale, y: 0.5 + y * scale, score: 0.99 }; };
      put(11, -0.15, -0.30); put(12, 0.15, -0.30);            // shoulders
      put(23, -0.10, 0.00); put(24, 0.10, 0.00);              // hips
      put(25, -0.10, 0.30); put(26, 0.10, 0.30);              // knees
      put(27, -0.10, 0.60); put(28, 0.10, 0.60);              // ankles
      if (armsUp) { put(13, -0.20, -0.55); put(14, 0.20, -0.55); put(15, -0.20, -0.80); put(16, 0.20, -0.80); }
      else { put(13, -0.20, -0.05); put(14, 0.20, -0.05); put(15, -0.20, 0.20); put(16, 0.20, 0.20); }
      return { pose: pose, leftHand: null, rightHand: null };
    };
    return [poseVec(body(1, false)), poseVec(body(1, true)), poseVec(body(0.5, true))].filter(Boolean);
  }

  var adapter = {
    id: 'pose',
    name: 'Pose eye',
    note: 'Reads how ONE body is posed — arms, legs, open hands. Teach it poses.',
    live: true,
    trainable: true,
    inputKind: 'video',
    vecLength: POSE_VEC_LENGTH,
    probe: probe,
    init: init,
    dispose: dispose,
    vec: vec,
    sampleVectors: sampleVectors,
    // App-facing pure export (not part of the kit contract; harmless to the checker).
    poseVec: poseVec,
  };

  if (typeof window !== 'undefined') window.SenseAdapter_pose = adapter;
  if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})();
