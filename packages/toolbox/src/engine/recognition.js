/*
 * RecognitionManager — teachable image classifier (coco-ssd object detection +
 * pixel-feature KNN). Ported from source/toolbox/recognition.js (R22 prototype).
 *
 * Port differences (see plan):
 *   - NO remote fetch: the original injected remote tfjs + coco-ssd <script>s and
 *     read globals. Here `tf` and `cocoSsd` are INJECTED via options, and the
 *     coco-ssd model graph loads from options.cocoModelUrl (host-served, local) —
 *     rule #4. The YOLO/CDN code path is dropped.
 *   - addSample(label, frame) / classifyFrame(frame): single-frame Promise paths
 *     the AIServices.trainImageClass / classifyImage adapters use, bypassing the
 *     camera + time-based teachClass() capture loop.
 *   - ESM `export` at the end. Types live in recognition.d.ts.
 *
 * Fidelity note: features are a coarse pixel downsample (the prototype's KNN), NOT
 * MobileNet embeddings — accuracy is modest; a MobileNet upgrade is a follow-up.
 */
function RecognitionManager(options){
  options = options || {};
  this.options = {
    modelType: options.modelType || 'coco-ssd',
    scoreThreshold: options.scoreThreshold || 0.25,
    cameraFacingMode: options.cameraFacingMode || 'environment',
    maxTeachSamples: options.maxTeachSamples || 30,
    width: options.width || 224,
    height: options.height || 224,
    knnTopK: options.knnTopK || 3,
    enableTeaching: options.enableTeaching || false,
    // Injected TensorFlow.js + coco-ssd (no CDN globals).
    tf: options.tf || null,
    cocoSsd: options.cocoSsd || null,
    // Local (host-served) coco-ssd model graph URL; omit to use the lib default.
    cocoModelUrl: options.cocoModelUrl || ''
  };

  this.ready = false;
  this.cameraActive = false;
  this.facingMode = this.options.cameraFacingMode;
  this._video = null;
  this._stream = null;
  this._canvas = null;
  this._ctx = null;
  this._scratch = null;
  this._scratchCtx = null;

  this._detector = null;
  this._modelLoading = false;

  this._knnData = {};
  this._knnEmbeddings = [];

  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
  this.onClassTaught = null;
}

RecognitionManager.prototype.initialize = function(){
  // Injection-only: tf + cocoSsd are provided by the adapter (npm, not CDN).
  // With no detector injected the manager still works in KNN-teachable-only mode
  // (addSample/classifyFrame), so we always reach a ready state.
  if(this.options.modelType === 'coco-ssd' && this.options.tf && this.options.cocoSsd){
    this._modelLoading = true;
    this._loadCocoSsd();
  } else {
    this.ready = true;
    if(this.onReady) this.onReady(true);
  }
};

RecognitionManager.prototype._loadCocoSsd = function(){
  var self = this;
  var tf = this.options.tf;
  var cocoSsd = this.options.cocoSsd;
  if(!tf || !cocoSsd){
    if(this.onError) this.onError('tf/cocoSsd not injected');
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  Promise.resolve(typeof tf.ready === 'function' ? tf.ready() : null).then(function(){
    var cfg = {base: 'lite_mobilenet_v2'};
    if(self.options.cocoModelUrl) cfg.modelUrl = self.options.cocoModelUrl;
    return cocoSsd.load(cfg);
  }).then(function(model){
    self._detector = model;
    self._modelLoading = false;
    self.ready = true;
    if(self.onReady) self.onReady(true);
  }).catch(function(err){
    if(self.onError) self.onError('coco-ssd model load: '+((err && err.message) || 'failed'));
    self._modelLoading = false;
    self.ready = true;
    if(self.onReady) self.onReady(true);
  });
};

/* -------------------------------------------------------------------------- */
/* Single-frame paths used by the AIServices adapter (no camera/time-loop).    */
/* -------------------------------------------------------------------------- */

RecognitionManager.prototype._ensureScratch = function(){
  if(!this._scratch){
    this._scratch = document.createElement('canvas');
    this._scratch.width = this.options.width;
    this._scratch.height = this.options.height;
    this._scratchCtx = this._scratch.getContext('2d');
  }
};

/** Coarse pixel-downsample feature vector for one frame (drawn onto a scratch canvas). */
RecognitionManager.prototype._featuresFromFrame = function(frame){
  this._ensureScratch();
  this._scratchCtx.drawImage(frame, 0, 0, this.options.width, this.options.height);
  var imageData = this._scratchCtx.getImageData(0, 0, this.options.width, this.options.height);
  var data = imageData.data;
  var features = [];
  var step = 8;
  for(var y=0;y<this.options.height;y+=step){
    for(var x=0;x<this.options.width;x+=step){
      var idx = (y*this.options.width+x)*4;
      features.push(data[idx]/255);
      features.push(data[idx+1]/255);
      features.push(data[idx+2]/255);
    }
  }
  return features;
};

/** Add one labeled sample to the KNN store from a single frame. Returns success. */
RecognitionManager.prototype.addSample = function(label, frame){
  if(!label || !frame) return false;
  var features = this._featuresFromFrame(frame);
  if(!this._knnData[label]) this._knnData[label] = {embeddings: [], label: label};
  this._knnData[label].embeddings.push(features);
  this._knnEmbeddings.push({label: label, embedding: features});
  return true;
};

/**
 * Classify one frame → {label, confidence}. Prefers taught KNN classes; falls back
 * to coco-ssd object detection. Always resolves (never rejects) so the adapter's
 * crash-proof contract holds even if the detector throws.
 */
RecognitionManager.prototype.classifyFrame = function(frame){
  var self = this;
  return new Promise(function(resolve){
    if(!frame){ resolve({label: 'unknown', confidence: 0}); return; }
    if(self._knnEmbeddings.length > 0){
      try {
        var feats = self._featuresFromFrame(frame);
        var r = self._knnClassify({label: '', score: 0, embedding: feats});
        resolve({label: r.label || 'unknown', confidence: r.confidence || 0});
      } catch(e){
        resolve({label: 'unknown', confidence: 0});
      }
      return;
    }
    if(self._detector){
      try {
        self._detector.detect(frame, 20, self.options.scoreThreshold).then(function(preds){
          if(preds && preds.length > 0){
            var best = preds.reduce(function(a,b){ return a.score > b.score ? a : b; });
            resolve({label: best.class, confidence: best.score});
          } else {
            resolve({label: 'unknown', confidence: 0});
          }
        }).catch(function(){
          resolve({label: 'unknown', confidence: 0});
        });
      } catch(e){
        resolve({label: 'unknown', confidence: 0});
      }
      return;
    }
    resolve({label: 'unknown', confidence: 0});
  });
};

/* -------------------------------------------------------------------------- */
/* Camera + continuous helpers (escape hatch; unused by the one-shot adapter). */
/* -------------------------------------------------------------------------- */

RecognitionManager.prototype.startCamera = function(videoElement, facingMode, callback){
  if(this.cameraActive){ if(callback) callback(true); return; }
  this.facingMode = facingMode || this.facingMode;
  var self = this;

  this._video = videoElement || this._createVideo();

  var constraints = {
    video: {
      facingMode: this.facingMode,
      width: {ideal: 640},
      height: {ideal: 480}
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
    self._stream = stream;
    self._video.srcObject = stream;
    self._video.play().then(function(){
      self._canvas = document.createElement('canvas');
      self._canvas.width = self.options.width;
      self._canvas.height = self.options.height;
      self._ctx = self._canvas.getContext('2d');
      self.cameraActive = true;
      if(self.onCameraReady) self.onCameraReady(true);
      if(callback) callback(true);
    }).catch(function(e){
      if(self.onError) self.onError('camera-play: '+e.message);
      if(callback) callback(false);
    });
  }).catch(function(e){
    if(self.onError) self.onError('camera: '+e.message);
    if(callback) callback(false);
  });
};

RecognitionManager.prototype.stopCamera = function(){
  if(this._stream){
    this._stream.getTracks().forEach(function(t){t.stop()});
    this._stream = null;
  }
  if(this._video){
    this._video.pause();
    this._video.srcObject = null;
  }
  this.cameraActive = false;
  this._canvas = null;
  this._ctx = null;
};

RecognitionManager.prototype._createVideo = function(){
  var video = document.createElement('video');
  video.setAttribute('playsinline','');
  video.setAttribute('autoplay','');
  video.muted = true;
  video.style.width = '100%';
  video.style.height = '100%';
  return video;
};

RecognitionManager.prototype.classifyImage = function(videoElement, callback){
  if(!this.ready){ if(callback) callback({label:'unknown',confidence:0}); return; }
  var video = videoElement || this._video;
  if(!video || video.readyState < 2){ if(callback) callback({label:'unknown',confidence:0}); return; }
  var self = this;
  if(this._detector){
    this._detector.detect(video, 20, this.options.scoreThreshold).then(function(predictions){
      var result;
      if(predictions && predictions.length > 0){
        var best = predictions.reduce(function(a,b){return a.score > b.score ? a : b});
        result = {label: best.class, confidence: best.score, bbox: best.bbox};
      } else {
        result = {label:'unknown',confidence:0};
      }
      if(self.onClassification) self.onClassification(result);
      if(callback) callback(result);
    }).catch(function(err){
      if(self.onError) self.onError('detect: '+err.message);
      if(callback) callback({label:'unknown',confidence:0});
    });
  } else {
    if(callback) callback({label:'unknown',confidence:0});
  }
};

RecognitionManager.prototype.teachClass = function(label, videoElement, numSamples, callback){
  if(!this.cameraActive){
    if(this.onError) this.onError('Camera not active for teaching');
    if(callback) callback(false);
    return;
  }
  var video = videoElement || this._video;
  if(!video || !this._ctx){ if(callback) callback(false); return; }

  var self = this;
  var count = Math.min(numSamples || 10, this.options.maxTeachSamples);
  if(!this._knnData[label]){ this._knnData[label] = {embeddings:[], label:label}; }

  var captured = 0;
  function captureOne(){
    if(captured >= count){
      if(self.onClassTaught) self.onClassTaught({label:label, sampleCount:self._knnData[label].embeddings.length});
      if(callback) callback(true);
      return;
    }
    setTimeout(function(){
      self._ctx.drawImage(video, 0, 0, self.options.width, self.options.height);
      var imageData = self._ctx.getImageData(0, 0, self.options.width, self.options.height);
      var data = imageData.data;
      var features = [];
      var step = 8;
      for(var y=0;y<self.options.height;y+=step){
        for(var x=0;x<self.options.width;x+=step){
          var idx = (y*self.options.width+x)*4;
          features.push(data[idx]/255, data[idx+1]/255, data[idx+2]/255);
        }
      }
      self._knnData[label].embeddings.push(features);
      self._knnEmbeddings.push({label:label, embedding:features});
      captured++;
      captureOne();
    }, 100);
  }
  captureOne();
};

RecognitionManager.prototype._knnClassify = function(features){
  if(this._knnEmbeddings.length === 0){
    return {label: features.label || 'unknown', confidence: features.score || 0};
  }
  var embedding = features.embedding;
  var distances = [];
  for(var i=0;i<this._knnEmbeddings.length;i++){
    var d = this._euclideanDistance(embedding, this._knnEmbeddings[i].embedding);
    distances.push({label:this._knnEmbeddings[i].label, distance:d});
  }
  distances.sort(function(a,b){return a.distance - b.distance});
  var topK = distances.slice(0, this.options.knnTopK || 3);
  var votes = {};
  for(var j=0;j<topK.length;j++){
    var l = topK[j].label;
    votes[l] = (votes[l]||0) + 1;
  }
  var bestLabel = '';
  var bestCount = 0;
  for(var label in votes){
    if(votes[label] > bestCount){ bestCount = votes[label]; bestLabel = label; }
  }
  var confidence = bestCount / (this.options.knnTopK || 3);
  return {label: bestLabel, confidence: confidence, votes: votes};
};

RecognitionManager.prototype._euclideanDistance = function(a,b){
  if(!a || !b || a.length !== b.length) return Infinity;
  var sum = 0;
  for(var i=0;i<a.length;i++){ sum += (a[i]-b[i])*(a[i]-b[i]); }
  return Math.sqrt(sum);
};

RecognitionManager.prototype.getKnownClasses = function(){
  var result = [];
  for(var label in this._knnData){
    result.push({label:label, sampleCount:this._knnData[label].embeddings.length});
  }
  return result;
};

RecognitionManager.prototype.getState = function(){
  return {
    ready: this.ready,
    cameraActive: this.cameraActive,
    facingMode: this.facingMode,
    detectorType: this._detector ? 'coco-ssd' : 'none',
    modelLoaded: !!this._detector,
    numClasses: Object.keys(this._knnData).length,
    knnSamples: this._knnEmbeddings.length
  };
};

RecognitionManager.prototype.destroy = function(){
  this.stopCamera();
  // Release the WebGL tensors held by the TF.js model; GC doesn't free GPU memory,
  // so dropping the reference alone leaks it. (coco-ssd exposes dispose(); guard
  // in case a future detector type doesn't.)
  if(this._detector && typeof this._detector.dispose === 'function'){
    try { this._detector.dispose(); } catch(e){}
  }
  this._detector = null;
  this._scratch = null;
  this._scratchCtx = null;
  this.ready = false;
  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
  this.onClassTaught = null;
};

export { RecognitionManager };
