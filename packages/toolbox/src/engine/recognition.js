/*
 * RecognitionManager — teachable-image classifier.
 *
 * METHOD (the real Teachable Machine approach): a MobileNet feature extractor turns each frame into
 * a high-dimensional embedding (1280-d for v2), and @tensorflow-models/knn-classifier does nearest-
 * neighbour over those embeddings. coco-ssd object detection is the NO-TRAINING fallback.
 *
 * Why this replaced the prototype: the original port used a coarse ~28x28 pixel downsample as the
 * feature vector. On a real webcam that is dominated by lighting + background, not the object — so it
 * could only separate flat colours, never real objects ("trash" in practice). MobileNet embeddings are
 * illumination/background robust, which is what makes teach->test actually work. (PLAN §5: "PORT the
 * existing MobileNet-embedding + knn-classifier flow" — the prototype port skipped it; this restores it.)
 *
 * Port rules:
 *   - NO CDN globals: tf, cocoSsd, mobilenet, knnClassifier are all INJECTED via options. Models are
 *     self-hostable via *Url options (golden rule #4); mobilenet.load()/cocoSsd.load() otherwise fetch
 *     from their default CDN (online-only).
 *   - addSample(label, frame) / classifyFrame(frame): single-frame paths the AIServices adapter uses.
 *   - mobilenet.infer / knn accept an HTMLVideoElement|HTMLCanvasElement|HTMLImageElement directly, so
 *     there is no manual pixel sampling / scratch canvas anymore.
 *   - ESM `export` at the end. Types live in recognition.d.ts.
 */
function RecognitionManager(options) {
  options = options || {};
  this.options = {
    scoreThreshold: options.scoreThreshold || 0.25,
    cameraFacingMode: options.cameraFacingMode || 'environment',
    maxTeachSamples: options.maxTeachSamples || 30,
    knnTopK: options.knnTopK || 3,
    enableTeaching: options.enableTeaching || false,
    // Injected libraries (no CDN globals).
    tf: options.tf || null,
    cocoSsd: options.cocoSsd || null,
    mobilenet: options.mobilenet || null, // module exposing load()
    knnClassifier: options.knnClassifier || null, // module exposing create()
    // Self-hosted (host-served) model URLs; omit to use each lib's default (CDN, online-only).
    cocoModelUrl: options.cocoModelUrl || '',
    mobilenetUrl: options.mobilenetUrl || '',
    // MobileNet variant — v2 alpha 1.0 = best accuracy (1280-d, ~14MB). Lower alpha trades accuracy
    // for size/speed on weak tablets (§8 budget); injectable so the host can tune per device.
    mobilenetVersion: options.mobilenetVersion || 2,
    mobilenetAlpha: options.mobilenetAlpha || 1.0,
  };

  this.ready = false;
  this.cameraActive = false;
  this.facingMode = this.options.cameraFacingMode;
  this._video = null;
  this._stream = null;

  this._extractor = null; // MobileNet model (frame -> embedding)
  this._knn = null; // knn-classifier instance (taught classes)
  this._detector = null; // coco-ssd model (no-training fallback)
  this._loading = false;

  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
  this.onClassTaught = null;
}

RecognitionManager.prototype.initialize = function () {
  // Load the teachable feature extractor (+ optional coco-ssd fallback), then signal ready.
  // We always reach a ready state (best-effort, rule #12) so the adapter never wedges: a failed
  // model load just means that path degrades (teachable off, or coco-less = KNN-only).
  var self = this;
  this._loading = true;
  var tasks = [this._loadExtractor()];
  // coco-ssd is OPT-IN via a self-hosted cocoModelUrl. Default coco-ssd.load() fetches its weights
  // from a CDN (breaks offline / rule #4), and the teachable mobilenet+KNN path never needs it — so we
  // only load the fallback detector when the host explicitly self-hosts it.
  if (this.options.cocoSsd && this.options.tf && this.options.cocoModelUrl) tasks.push(this._loadCocoSsd());
  Promise.all(tasks)
    .then(function () {
      self._loading = false;
      self.ready = true;
      if (self.onReady) self.onReady(true);
    })
    .catch(function () {
      self._loading = false;
      self.ready = true;
      if (self.onReady) self.onReady(true);
    });
};

/** Build the MobileNet feature extractor + an empty KNN classifier. No-op if libs not injected. */
RecognitionManager.prototype._loadExtractor = function () {
  var self = this;
  var tf = this.options.tf;
  var mobilenet = this.options.mobilenet;
  var knn = this.options.knnClassifier;
  if (!mobilenet || !knn) {
    // No teachable libs → teachable disabled; coco-ssd fallback (if any) still works.
    return Promise.resolve();
  }
  try {
    this._knn = knn.create();
  } catch (e) {
    this._knn = null;
  }
  // tf may be absent in tests/DI (mobilenet.load doesn't need our tf reference); guard before .ready().
  var tfReady = tf && typeof tf.ready === 'function' ? tf.ready() : null;
  return Promise.resolve(tfReady)
    .then(function () {
      var cfg = { version: self.options.mobilenetVersion, alpha: self.options.mobilenetAlpha };
      // A self-hosted model graph URL keeps it offline (rule #4); else the lib fetches from its CDN.
      if (self.options.mobilenetUrl) cfg.modelUrl = self.options.mobilenetUrl;
      return mobilenet.load(cfg);
    })
    .then(function (model) {
      self._extractor = model;
    })
    .catch(function (err) {
      if (self.onError) self.onError('mobilenet load: ' + ((err && err.message) || 'failed'));
    });
};

RecognitionManager.prototype._loadCocoSsd = function () {
  var self = this;
  var tf = this.options.tf;
  var cocoSsd = this.options.cocoSsd;
  if (!tf || !cocoSsd) return Promise.resolve();
  return Promise.resolve(typeof tf.ready === 'function' ? tf.ready() : null)
    .then(function () {
      var cfg = { base: 'lite_mobilenet_v2' };
      if (self.options.cocoModelUrl) cfg.modelUrl = self.options.cocoModelUrl;
      return cocoSsd.load(cfg);
    })
    .then(function (model) {
      self._detector = model;
    })
    .catch(function (err) {
      if (self.onError) self.onError('coco-ssd model load: ' + ((err && err.message) || 'failed'));
    });
};

/* -------------------------------------------------------------------------- */
/* Single-frame paths used by the AIServices adapter.                          */
/* -------------------------------------------------------------------------- */

/**
 * Add one labeled sample: MobileNet embedding -> knn-classifier. Returns success.
 * NOTE: knn-classifier copies the example internally (normalises + tf.keep), so we MUST dispose the
 * embedding we pass in — otherwise every taught frame leaks a tensor on the GPU.
 */
RecognitionManager.prototype.addSample = function (label, frame) {
  if (!label || !frame) return false;
  if (!this._extractor || !this._knn) return false; // teachable not ready
  var emb = null;
  try {
    emb = this._extractor.infer(frame, true); // true = penultimate-layer embedding, not logits
    this._knn.addExample(emb, label);
    if (this.onClassTaught) {
      var counts = this._knn.getClassExampleCount();
      this.onClassTaught({ label: label, sampleCount: counts[label] || 0 });
    }
    return true;
  } catch (e) {
    if (this.onError) this.onError('addSample: ' + ((e && e.message) || 'failed'));
    return false;
  } finally {
    if (emb && typeof emb.dispose === 'function') {
      try {
        emb.dispose();
      } catch (_) {
        /* ignore */
      }
    }
  }
};

/**
 * Classify one frame -> {label, confidence}. Prefers taught KNN classes; falls back to coco-ssd object
 * detection. Always resolves (never rejects) so the adapter's crash-proof contract holds (rule #12).
 */
RecognitionManager.prototype.classifyFrame = function (frame) {
  var self = this;
  return new Promise(function (resolve) {
    if (!frame) {
      resolve({ label: 'unknown', confidence: 0 });
      return;
    }
    // Taught classes win over the generic detector (teach -> test).
    if (self._extractor && self._knn && self._knn.getNumClasses() > 0) {
      var emb = null;
      try {
        emb = self._extractor.infer(frame, true);
      } catch (e) {
        if (self.onError) self.onError('infer: ' + ((e && e.message) || 'failed'));
        resolve({ label: 'unknown', confidence: 0 });
        return;
      }
      self._knn
        .predictClass(emb, self.options.knnTopK)
        .then(function (r) {
          if (emb && emb.dispose) emb.dispose();
          var conf = (r && r.confidences && r.label != null && r.confidences[r.label]) || 0;
          resolve({ label: (r && r.label) || 'unknown', confidence: conf });
        })
        .catch(function (err) {
          if (self.onError) self.onError('predictClass: ' + ((err && err.message) || 'failed'));
          if (emb && emb.dispose) {
            try {
              emb.dispose();
            } catch (_) {
              /* ignore */
            }
          }
          resolve({ label: 'unknown', confidence: 0 });
        });
      return;
    }
    // No taught classes: fall back to coco-ssd object detection if present.
    if (self._detector) {
      try {
        self._detector
          .detect(frame, 20, self.options.scoreThreshold)
          .then(function (preds) {
            if (preds && preds.length > 0) {
              var best = preds.reduce(function (a, b) {
                return a.score > b.score ? a : b;
              });
              resolve({ label: best.class, confidence: best.score });
            } else {
              resolve({ label: 'unknown', confidence: 0 });
            }
          })
          .catch(function () {
            resolve({ label: 'unknown', confidence: 0 });
          });
      } catch (e) {
        resolve({ label: 'unknown', confidence: 0 });
      }
      return;
    }
    resolve({ label: 'unknown', confidence: 0 });
  });
};

/* -------------------------------------------------------------------------- */
/* Camera + continuous helpers (escape hatch; route through the single-frame    */
/* paths so there is one classification code path).                             */
/* -------------------------------------------------------------------------- */

RecognitionManager.prototype.startCamera = function (videoElement, facingMode, callback) {
  if (this.cameraActive) {
    if (callback) callback(true);
    return;
  }
  this.facingMode = facingMode || this.facingMode;
  var self = this;
  this._video = videoElement || this._createVideo();
  var constraints = {
    video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
  };
  navigator.mediaDevices
    .getUserMedia(constraints)
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

RecognitionManager.prototype.stopCamera = function () {
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

RecognitionManager.prototype._createVideo = function () {
  var video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.style.width = '100%';
  video.style.height = '100%';
  return video;
};

/** Continuous classify of a live video element -> callback. Routes through classifyFrame. */
RecognitionManager.prototype.classifyImage = function (videoElement, callback) {
  var self = this;
  var video = videoElement || this._video;
  if (!video || (typeof video.readyState === 'number' && video.readyState < 2)) {
    if (callback) callback({ label: 'unknown', confidence: 0 });
    return;
  }
  this.classifyFrame(video).then(function (r) {
    if (self.onClassification) self.onClassification(r);
    if (callback) callback(r);
  });
};

/** Capture `numSamples` frames of a live video as KNN examples for `label`. Routes through addSample. */
RecognitionManager.prototype.teachClass = function (label, videoElement, numSamples, callback) {
  var video = videoElement || this._video;
  if (!video) {
    if (this.onError) this.onError('No video for teaching');
    if (callback) callback(false);
    return;
  }
  var self = this;
  var count = Math.min(numSamples || 10, this.options.maxTeachSamples);
  var captured = 0;
  function captureOne() {
    if (captured >= count) {
      if (callback) callback(true);
      return;
    }
    setTimeout(function () {
      self.addSample(label, video);
      captured++;
      captureOne();
    }, 100);
  }
  captureOne();
};

RecognitionManager.prototype.getKnownClasses = function () {
  var result = [];
  if (this._knn) {
    var counts = this._knn.getClassExampleCount();
    for (var label in counts) {
      if (Object.prototype.hasOwnProperty.call(counts, label)) {
        result.push({ label: label, sampleCount: counts[label] });
      }
    }
  }
  return result;
};

RecognitionManager.prototype.getState = function () {
  var samples = 0;
  if (this._knn) {
    var counts = this._knn.getClassExampleCount();
    for (var l in counts) if (Object.prototype.hasOwnProperty.call(counts, l)) samples += counts[l];
  }
  return {
    ready: this.ready,
    cameraActive: this.cameraActive,
    facingMode: this.facingMode,
    extractor: this._extractor ? 'mobilenet' : 'none',
    detectorType: this._detector ? 'coco-ssd' : 'none',
    numClasses: this._knn ? this._knn.getNumClasses() : 0,
    knnSamples: samples,
  };
};

RecognitionManager.prototype.destroy = function () {
  this.stopCamera();
  // Free WebGL tensors held by the KNN store + the models; GC doesn't free GPU memory, so dropping
  // references alone leaks it. Guard each in case a lib lacks dispose().
  if (this._knn) {
    try {
      this._knn.dispose();
    } catch (e) {
      /* ignore */
    }
    this._knn = null;
  }
  if (this._extractor && typeof this._extractor.dispose === 'function') {
    try {
      this._extractor.dispose();
    } catch (e) {
      /* ignore */
    }
  }
  this._extractor = null;
  if (this._detector && typeof this._detector.dispose === 'function') {
    try {
      this._detector.dispose();
    } catch (e) {
      /* ignore */
    }
  }
  this._detector = null;
  this.ready = false;
  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
  this.onClassTaught = null;
};

export { RecognitionManager };
