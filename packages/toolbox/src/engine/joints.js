/*
 * JointDetectionManager — hand + pose landmark detection.
 *
 * METHOD: Google's MAINTAINED MediaPipe Tasks Vision API (@mediapipe/tasks-vision) — HandLandmarker
 * and PoseLandmarker. Replaced the deprecated @mediapipe/holistic "Solutions" API (PLAN §5: "consider
 * migrating to the maintained @mediapipe/tasks-vision"). The Tasks API is simpler: detectForVideo()
 * returns results SYNCHRONOUSLY (no onResults callback dance) and self-hosting is just serving the
 * /wasm dir + the .task model files.
 *
 * Port rules:
 *   - NO CDN globals: the tasks-vision module is INJECTED via options.visionTasks ({FilesetResolver,
 *     HandLandmarker, PoseLandmarker}); the wasm dir + model files resolve under host-served URLs
 *     (options.wasmBase / handModelUrl / poseModelUrl). When absent the manager stays inert and
 *     reports via onError — never throws at construct (rule #12).
 *   - sendOnce(frame): a one-shot path the AIServices.detectPose adapter uses. It returns a NORMALISED
 *     result ({rightHandLandmarks,leftHandLandmarks,poseLandmarks}) — the SAME shape the old Holistic
 *     produced — so ai.ts's resultsToLandmarks mapping is unchanged.
 *   - Gesture helpers (countExtendedFingers / classifyGesture / ...) operate on a 21-point {x,y,z}
 *     hand-landmark array, which Tasks Vision produces identically — so they carry over untouched.
 *   - ESM `export` at the end. Types live in joints.d.ts (hand-written; takes precedence).
 */
function JointDetectionManager(options) {
  options = options || {};
  this.options = {
    enableHands: options.enableHands !== undefined ? options.enableHands : true,
    enablePose: options.enablePose !== undefined ? options.enablePose : false,
    numHands: options.numHands || 2,
    runningMode: options.runningMode || 'VIDEO',
    minDetectionConfidence: options.minDetectionConfidence || 0.5,
    minTrackingConfidence: options.minTrackingConfidence || 0.5,
    // Injected tasks-vision module (no CDN global): { FilesetResolver, HandLandmarker, PoseLandmarker }.
    visionTasks: options.visionTasks || null,
    // Host-served URLs (rule #4). wasmBase = dir holding vision_wasm_internal.wasm etc.; *ModelUrl = .task files.
    wasmBase: options.wasmBase || '',
    handModelUrl: options.handModelUrl || '',
    poseModelUrl: options.poseModelUrl || '',
    // 'GPU' (WebGL) where available; the caller can force 'CPU' on weak devices.
    delegate: options.delegate || 'GPU',
  };

  this.ready = false;
  this.cameraActive = false;
  this._video = null;
  this._stream = null;
  this._hand = null; // HandLandmarker instance
  this._pose = null; // PoseLandmarker instance
  // detectForVideo requires strictly-increasing timestamps PER landmarker instance; a monotonic
  // counter satisfies that without needing Date.now()/performance.now().
  this._ts = 0;

  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
}

JointDetectionManager.prototype.initialize = function () {
  var self = this;
  var vt = this.options.visionTasks;
  var anyEnabled = this.options.enableHands || this.options.enablePose;
  if (!vt || !vt.FilesetResolver || !anyEnabled) {
    if (!vt && this.onError) this.onError('tasks-vision not injected');
    this.ready = true;
    if (this.onReady) this.onReady(true);
    return;
  }
  // Async model load (FilesetResolver + createFromOptions). Always reaches a ready state (rule #12):
  // a failed load just leaves that landmarker null and the path degrades, never wedges the adapter.
  this._setup()
    .then(function () {
      self.ready = true;
      if (self.onReady) self.onReady(true);
    })
    .catch(function (err) {
      if (self.onError) self.onError('tasks-vision setup: ' + ((err && err.message) || 'failed'));
      self.ready = true;
      if (self.onReady) self.onReady(true);
    });
};

JointDetectionManager.prototype._setup = async function () {
  var vt = this.options.visionTasks;
  var o = this.options;
  var fileset = await vt.FilesetResolver.forVisionTasks(o.wasmBase);
  if (o.enableHands && vt.HandLandmarker) {
    this._hand = await vt.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.handModelUrl, delegate: o.delegate },
      runningMode: o.runningMode,
      numHands: o.numHands,
      minHandDetectionConfidence: o.minDetectionConfidence,
      minTrackingConfidence: o.minTrackingConfidence,
    });
  }
  if (o.enablePose && vt.PoseLandmarker) {
    this._pose = await vt.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.poseModelUrl, delegate: o.delegate },
      runningMode: o.runningMode,
      numPoses: 1,
      minPoseDetectionConfidence: o.minDetectionConfidence,
      minTrackingConfidence: o.minTrackingConfidence,
    });
  }
};

/**
 * One-shot detection: run the enabled landmarkers on a single frame and resolve a NORMALISED result
 * (the old Holistic shape) so the adapter mapping is unchanged. Resolves null if nothing is ready or
 * detectForVideo throws. Never rejects (rule #12).
 */
JointDetectionManager.prototype.sendOnce = function (frame) {
  var self = this;
  return new Promise(function (resolve) {
    if (!frame || (!self._hand && !self._pose)) {
      resolve(null);
      return;
    }
    try {
      self._ts += 1;
      var ts = self._ts;
      var out = { rightHandLandmarks: null, leftHandLandmarks: null, poseLandmarks: null };
      if (self._hand) {
        var hr = self._hand.detectForVideo(frame, ts);
        if (hr && hr.landmarks) {
          for (var i = 0; i < hr.landmarks.length; i++) {
            var cat =
              (hr.handedness && hr.handedness[i] && hr.handedness[i][0] && hr.handedness[i][0].categoryName) || '';
            // MediaPipe handedness is from the camera's view; we just need a primary hand for gestures.
            if (cat === 'Left' && !out.leftHandLandmarks) out.leftHandLandmarks = hr.landmarks[i];
            else if (cat === 'Right' && !out.rightHandLandmarks) out.rightHandLandmarks = hr.landmarks[i];
            else if (!out.rightHandLandmarks) out.rightHandLandmarks = hr.landmarks[i];
          }
        }
      }
      if (self._pose) {
        var pr = self._pose.detectForVideo(frame, ts);
        if (pr && pr.landmarks && pr.landmarks.length > 0) out.poseLandmarks = pr.landmarks[0];
      }
      // Fan out to continuous listeners (used by dev harnesses), best-effort.
      if (self.onHandsDetected && (out.leftHandLandmarks || out.rightHandLandmarks)) {
        self.onHandsDetected(out.rightHandLandmarks || out.leftHandLandmarks);
      }
      if (self.onPoseDetected && out.poseLandmarks) self.onPoseDetected(out.poseLandmarks);
      if (self.onGesture) {
        var primary = out.rightHandLandmarks || out.leftHandLandmarks;
        if (primary) self.onGesture(self.classifyGesture(primary));
      }
      resolve(out);
    } catch (e) {
      if (self.onError) self.onError('detectForVideo: ' + ((e && e.message) || 'failed'));
      resolve(null);
    }
  });
};

/* ------------------------------------------------------------------ camera -- */

JointDetectionManager.prototype.startCamera = function (videoElement, callback) {
  if (this.cameraActive) {
    if (callback) callback(true);
    return;
  }
  var self = this;
  this._video = videoElement || this._createVideo();
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } })
    .then(function (stream) {
      self._stream = stream;
      self._video.srcObject = stream;
      return self._video.play();
    })
    .then(function () {
      self.cameraActive = true;
      if (self.onCameraReady) self.onCameraReady(true);
      if (callback) callback(true);
    })
    .catch(function (e) {
      if (self.onError) self.onError('camera: ' + e.message);
      if (callback) callback(false);
    });
};

JointDetectionManager.prototype.stopCamera = function () {
  if (this._stream) {
    this._stream.getTracks().forEach(function (t) {
      t.stop();
    });
    this._stream = null;
  }
  if (this._video) {
    this._video.pause();
    this._video.srcObject = null;
  }
  this.cameraActive = false;
};

JointDetectionManager.prototype._createVideo = function () {
  var video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  return video;
};

/* ------------------------------------------------- gesture classification -- */
/* These operate on a 21-point {x,y,z} hand-landmark array (identical in Tasks Vision). */

/** Public: classify a hand-landmark array into a coarse gesture name. */
JointDetectionManager.prototype.classifyGesture = function (landmarks) {
  if (!landmarks || landmarks.length < 21) return 'other';
  var wrist = landmarks[0];
  var indexTip = landmarks[8];
  var middleTip = landmarks[12];
  var fingers = this.countExtendedFingers(landmarks);
  var thumbExtended = this._isThumbExtended(landmarks);
  // Index specifically (tip above its PIP) so a lone middle finger doesn't read as 'point'.
  var indexExtended = landmarks[8].y < landmarks[6].y;
  var allExtended = fingers >= 4;

  if (!thumbExtended && !indexExtended && fingers <= 1) return 'fist';
  if (thumbExtended && !indexExtended && fingers <= 2) return 'thumbs_up';
  if (!thumbExtended && indexExtended && fingers <= 2) return 'point';
  if (allExtended) return 'open';
  if (fingers === 2 && indexExtended) {
    var dist = this._distance(indexTip, wrist);
    var midDist = this._distance(middleTip, wrist);
    if (midDist > dist * 0.7) return 'two_fingers';
    return 'peace';
  }
  return 'other';
};

JointDetectionManager.prototype.countExtendedFingers = function (landmarks) {
  if (!landmarks || landmarks.length < 21) return 0;
  var count = 0;
  // The thumb extends sideways (x-axis), so the tip-above-PIP (y) test for the other fingers doesn't
  // apply — delegate to the dedicated x-based check.
  if (this._isThumbExtended(landmarks)) count++;
  var tips = [8, 12, 16, 20];
  var pips = [6, 10, 14, 18];
  for (var i = 0; i < tips.length; i++) {
    if (landmarks[tips[i]].y < landmarks[pips[i]].y) count++;
  }
  return count;
};

JointDetectionManager.prototype.isHandOpen = function (landmarks) {
  if (!landmarks || landmarks.length < 21) return false;
  return this.countExtendedFingers(landmarks) >= 4;
};

JointDetectionManager.prototype.getHandDirection = function (landmarks) {
  if (!landmarks || landmarks.length < 5) return { x: 0, y: 0 };
  var wrist = landmarks[0];
  var indexMcp = landmarks[5];
  var dx = indexMcp.x - wrist.x;
  var dy = indexMcp.y - wrist.y;
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
};

JointDetectionManager.prototype._isThumbExtended = function (landmarks) {
  return landmarks[4].x < landmarks[2].x - 0.02;
};

JointDetectionManager.prototype._distance = function (a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
};

JointDetectionManager.prototype.getState = function () {
  return {
    ready: this.ready,
    cameraActive: this.cameraActive,
    handsReady: !!this._hand,
    poseReady: !!this._pose,
    handsEnabled: this.options.enableHands,
    poseEnabled: this.options.enablePose,
  };
};

JointDetectionManager.prototype.destroy = function () {
  this.stopCamera();
  // Free the MediaPipe WASM/GPU graphs before dropping references; GC won't reclaim the native
  // graph, so without close() every re-creation leaks one.
  if (this._hand && typeof this._hand.close === 'function') {
    try {
      this._hand.close();
    } catch (e) {
      /* ignore */
    }
  }
  if (this._pose && typeof this._pose.close === 'function') {
    try {
      this._pose.close();
    } catch (e) {
      /* ignore */
    }
  }
  this._hand = null;
  this._pose = null;
  this.ready = false;
  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
};

export { JointDetectionManager };
