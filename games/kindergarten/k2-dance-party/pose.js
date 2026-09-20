/**
 * PoseManager — MoveNet MultiPose (up to 6 bodies x 17 keypoints) over CDN.
 * Ported from packages/toolbox/src/ai.ts (MoveNet path). Crash-proof + serialized:
 * detectPoses ALWAYS resolves (never rejects) so a classroom loop is safe.
 *
 * Globals: window.PoseManager. Also CommonJS-exported for node --test.
 */
(function () {
  // PINNED versions (match the React repo: tfjs ^4.22.0, pose-detection ^2.1.3). Never `latest`.
  var TF_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js'; // lint-web-allow-cdn TODO: self-host ML assets (Initiative B follow-up)
  var POSE_CDN = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js'; // lint-web-allow-cdn TODO: self-host ML assets (Initiative B follow-up)
  // SRI hashes — copy the sha384 from jsdelivr's "SRI" panel for EACH pinned file above.
  // Empty ⇒ no integrity applied (only acceptable transiently during bring-up; fill before shipping).
  var TF_SRI = '';   // e.g. 'sha384-…'
  var POSE_SRI = ''; // e.g. 'sha384-…'

  function loadScript(src, integrity) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.crossOrigin = 'anonymous';            // required for SRI + clean CORS on jsdelivr
      if (integrity) s.integrity = integrity; // sha384 of the pinned file
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      var done = function (v) { if (settled) return; settled = true; clearTimeout(t); resolve(v); };
      var t = setTimeout(function () { done(fallback); }, ms);
      promise.then(done, function () { done(fallback); });
    });
  }

  function PoseManager(opts) {
    opts = opts || {};
    this.minPoseScore = opts.minPoseScore != null ? opts.minPoseScore : 0.2;
    this.detectTimeoutMs = opts.detectTimeoutMs != null ? opts.detectTimeoutMs : 1500;
    this._tfCdn = opts.cdnTf || TF_CDN;
    this._poseCdn = opts.cdnPose || POSE_CDN;
    this._tfSri = opts.tfSri || TF_SRI;
    this._poseSri = opts.poseSri || POSE_SRI;
    this._detector = null;
    this._detectorPromise = null;
    this._queue = Promise.resolve();
    this._disposed = false;
  }

  // Pure: MoveNet poses (pixels) -> Landmark[][] normalized 0..1. Exported for test.
  PoseManager.posesToLandmarks = function (poses, w, h, minScore) {
    if (!w || !h) return [];
    var out = [];
    for (var i = 0; i < poses.length; i++) {
      var p = poses[i];
      if ((p.score == null ? 1 : p.score) < minScore) continue;
      out.push(p.keypoints.map(function (k) { return { x: k.x / w, y: k.y / h, score: k.score }; }));
    }
    return out;
  };

  PoseManager.prototype._ensureDetector = function () {
    var self = this;
    if (this._disposed) return Promise.resolve(null);
    if (!this._detectorPromise) {
      this._detectorPromise = (async function () {
        try {
          await loadScript(self._tfCdn, self._tfSri);
          await loadScript(self._poseCdn, self._poseSri);
          if (!window.tf || !window.poseDetection) return null;
          // Pin a working backend BEFORE the detector factory inspects it (WebGPU-null landmine, ai.ts).
          var backends = ['webgl', 'cpu'];
          for (var i = 0; i < backends.length; i++) {
            try { await window.tf.setBackend(backends[i]); await window.tf.ready(); break; } catch (e) { /* next */ }
          }
          var pd = window.poseDetection;
          self._detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
            modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
            enableSmoothing: true,
            enableTracking: true,
            trackerType: pd.TrackerType.BoundingBox,
          });
          return self._detector;
        } catch (e) { return null; }
      })();
    }
    return this._detectorPromise;
  };

  PoseManager.prototype._queuePose = function (run) {
    var p = this._queue.then(run, run);
    this._queue = p.catch(function () {});
    return p;
  };

  PoseManager.prototype.probe = async function () {
    return (await this._ensureDetector()) !== null;
  };

  PoseManager.prototype.detectPoses = function (video) {
    var self = this;
    return this._queuePose(async function () {
      try {
        var det = await self._ensureDetector();
        if (!det || self._disposed) return [];
        var poses = await withTimeout(det.estimatePoses(video), self.detectTimeoutMs, []);
        return PoseManager.posesToLandmarks(poses, video.videoWidth, video.videoHeight, self.minPoseScore);
      } catch (e) { return []; }
    });
  };

  PoseManager.prototype.detectPose = async function (video) {
    var bodies = await this.detectPoses(video);
    return bodies[0] || [];
  };

  PoseManager.prototype.dispose = function () {
    this._disposed = true;
    try { if (this._detector && this._detector.dispose) this._detector.dispose(); } catch (e) {}
    this._detector = null; this._detectorPromise = null;
  };

  if (typeof window !== 'undefined') window.PoseManager = PoseManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = { PoseManager: PoseManager };
})();
