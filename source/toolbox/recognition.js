function RecognitionManager(options){
  options = options || {};
  this.options = {
    modelType: options.modelType || 'coco-ssd',
    yoloModelUrl: options.yoloModelUrl || '',
    scoreThreshold: options.scoreThreshold || 0.25,
    cameraFacingMode: options.cameraFacingMode || 'environment',
    maxTeachSamples: options.maxTeachSamples || 30,
    width: options.width || 224,
    height: options.height || 224,
    enableTeaching: options.enableTeaching || false
  };

  this.ready = false;
  this.cameraActive = false;
  this.facingMode = this.options.cameraFacingMode;
  this._video = null;
  this._stream = null;
  this._canvas = null;
  this._ctx = null;

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
  var self = this;
  var type = this.options.modelType;
  this._modelLoading = true;

  if(type === 'coco-ssd'){
    this._loadScripts([
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
      'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2/dist/coco-ssd.min.js'
    ], function(){
      self._loadCocoSsd();
    });
  } else if(type === 'yolo'){
    this._loadScripts([
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.22.0/dist/tf-backend-webgl.min.js',
      'https://cdn.jsdelivr.net/npm/yolo-tfjs-vision@1.0.6/dist/yolo.umd.js'
    ], function(){
      self._loadYolo();
    });
  } else {
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
  }
};

RecognitionManager.prototype._loadScripts = function(urls, callback){
  var loaded = 0;
  var total = urls.length;
  var self = this;

  function oneLoaded(){
    loaded++;
    if(loaded >= total && callback) callback();
  }

  if(total === 0){ if(callback) callback(); return; }

  urls.forEach(function(url){
    var existing = document.querySelector('script[src="'+url+'"]');
    if(existing){
      oneLoaded();
      return;
    }
    var s = document.createElement('script');
    s.src = url;
    s.async = false;
    s.onload = oneLoaded;
    s.onerror = function(){
      if(self.onError) self.onError('Failed to load: '+url);
      oneLoaded();
    };
    document.head.appendChild(s);
  });
};

RecognitionManager.prototype._loadCocoSsd = function(){
  var self = this;
  if(typeof cocoSsd === 'undefined' || typeof tf === 'undefined'){
    if(this.onError) this.onError('cocoSsd or tf not available after script load');
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  tf.ready().then(function(){
    return cocoSsd.load({base:'lite_mobilenet_v2'});
  }).then(function(model){
    self._detector = model;
    self._modelLoading = false;
    self.ready = true;
    if(self.onReady) self.onReady(true);
  }).catch(function(err){
    if(self.onError) self.onError('coco-ssd model load: '+err.message);
    self._modelLoading = false;
    self.ready = true;
    if(self.onReady) self.onReady(true);
  });
};

RecognitionManager.prototype._loadYolo = function(){
  var self = this;
  if(typeof YOLO === 'undefined'){
    if(this.onError) this.onError('YOLO not available after script load');
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  var modelUrl = this.options.yoloModelUrl;
  if(!modelUrl){
    if(this.onError) this.onError('YOLO model URL required');
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  try {
    var yolo = new YOLO();
    yolo.setup({
      modelUrl: modelUrl,
      scoreThreshold: this.options.scoreThreshold
    });
    yolo.loadModel().then(function(modelObj){
      self._yoloInstance = yolo;
      self._yoloModelObj = modelObj;
      self._modelLoading = false;
      self.ready = true;
      if(self.onReady) self.onReady(true);
    }).catch(function(err){
      if(self.onError) self.onError('YOLO model load: '+err.message);
      self._modelLoading = false;
      self.ready = true;
      if(self.onReady) self.onReady(true);
    });
  } catch(err){
    if(this.onError) this.onError('YOLO init: '+err.message);
    this._modelLoading = false;
    this.ready = true;
    if(this.onReady) this.onReady(true);
  }
};

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

RecognitionManager.prototype.switchCamera = function(callback){
  if(!this.cameraActive){ if(callback) callback(false); return; }
  this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
  var videoEl = this._video;
  this.stopCamera();
  this.startCamera(videoEl, this.facingMode, callback);
};

RecognitionManager.prototype.classifyImage = function(videoElement, callback){
  if(!this.ready){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }
  var video = videoElement || this._video;
  if(!video || video.readyState < 2){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }

  var self = this;

  if(this._detector){
    this._detector.detect(video, 20, this.options.scoreThreshold).then(function(predictions){
      var result;
      if(predictions && predictions.length > 0){
        var best = predictions.reduce(function(a,b){return a.score > b.score ? a : b});
        result = {
          label: best.class,
          confidence: best.score,
          bbox: best.bbox
        };
      } else {
        result = {label:'unknown',confidence:0};
      }
      if(self.onClassification) self.onClassification(result);
      if(callback) callback(result);
    }).catch(function(err){
      if(self.onError) self.onError('detect: '+err.message);
      if(callback) callback({label:'unknown',confidence:0});
    });
  } else if(this._yoloInstance && this._yoloModelObj){
    if(!this._canvas){
      if(callback) callback({label:'unknown',confidence:0});
      return;
    }
    this._ctx.drawImage(video, 0, 0, this.options.width, this.options.height);
    var img = new Image();
    img.src = this._canvas.toDataURL();
    img.onload = function(){
      self._yoloInstance.detect(img, self._yoloModelObj, self._canvas, function(detections){
        var result;
        if(detections && detections.labels && detections.labels.length > 0){
          var bestIdx = 0;
          for(var i=1;i<detections.scores.length;i++){
            if(detections.scores[i] > detections.scores[bestIdx]) bestIdx = i;
          }
          var boxes = detections.boxes;
          result = {
            label: detections.labels[bestIdx],
            confidence: detections.scores[bestIdx],
            bbox: [boxes[bestIdx*4+1], boxes[bestIdx*4], boxes[bestIdx*4+3]-boxes[bestIdx*4+1], boxes[bestIdx*4+2]-boxes[bestIdx*4]]
          };
        } else {
          result = {label:'unknown',confidence:0};
        }
        if(self.onClassification) self.onClassification(result);
        if(callback) callback(result);
      });
    };
  } else if(this.options.enableTeaching && this._knnEmbeddings.length > 0){
    if(!this._ctx){
      if(callback) callback({label:'unknown',confidence:0});
      return;
    }
    this._ctx.drawImage(video, 0, 0, this.options.width, this.options.height);
    this._extractFeatures(function(features){
      if(!features){
        if(callback) callback({label:'unknown',confidence:0});
        return;
      }
      var result = self._knnClassify(features);
      if(self.onClassification) self.onClassification(result);
      if(callback) callback(result);
    });
  } else {
    if(callback) callback({label:'unknown',confidence:0});
  }
};

RecognitionManager.prototype.classifyPointedAt = function(fingerPos, videoElement, callback){
  if(!this.ready || !fingerPos || typeof fingerPos.x !== 'number'){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }
  var video = videoElement || this._video;
  if(!video || video.readyState < 2){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }

  var self = this;
  var fw = video.videoWidth || 640;
  var fh = video.videoHeight || 480;
  var fx = fingerPos.x * fw;
  var fy = fingerPos.y * fh;

  if(this._detector){
    this._detector.detect(video, 20, this.options.scoreThreshold).then(function(predictions){
      var result = self._pickClosest(predictions, fx, fy);
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

RecognitionManager.prototype._pickClosest = function(predictions, px, py){
  if(!predictions || predictions.length === 0){
    return {label:'unknown',confidence:0};
  }
  var best = null;
  var bestDist = Infinity;
  for(var i=0;i<predictions.length;i++){
    var p = predictions[i];
    var cx = p.bbox[0] + p.bbox[2]/2;
    var cy = p.bbox[1] + p.bbox[3]/2;
    var dist = Math.sqrt((cx-px)*(cx-px)+(cy-py)*(cy-py));
    if(dist < bestDist){
      bestDist = dist;
      best = p;
    }
  }
  if(best && best.score >= this.options.scoreThreshold){
    return {
      label: best.class,
      confidence: best.score,
      bbox: best.bbox
    };
  }
  return {label:'unknown',confidence:0};
};

RecognitionManager.prototype._extractFeatures = function(callback){
  var imageData = this._ctx.getImageData(0, 0, this.options.width, this.options.height);
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
  if(callback) callback({label:'', score:0, embedding: features});
};

RecognitionManager.prototype.teachClass = function(label, videoElement, numSamples, callback){
  if(!this.cameraActive){
    if(this.onError) this.onError('Camera not active for teaching');
    if(callback) callback(false);
    return;
  }
  var video = videoElement || this._video;
  if(!video || !this._ctx){
    if(callback) callback(false);
    return;
  }

  var self = this;
  var count = Math.min(numSamples || 10, this.options.maxTeachSamples);
  if(!this._knnData[label]){
    this._knnData[label] = {embeddings:[], label:label};
  }

  var captured = 0;
  function captureOne(){
    if(captured >= count){
      if(self.onClassTaught) self.onClassTaught({label:label, sampleCount:self._knnData[label].embeddings.length});
      if(callback) callback(true);
      return;
    }
    setTimeout(function(){
      self._ctx.drawImage(video, 0, 0, self.options.width, self.options.height);
      self._extractFeatures(function(feat){
        if(feat && feat.embedding){
          self._knnData[label].embeddings.push(feat.embedding);
          self._knnEmbeddings.push({label:label, embedding:feat.embedding});
        }
        captured++;
        captureOne();
      });
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
    if(votes[label] > bestCount){
      bestCount = votes[label];
      bestLabel = label;
    }
  }

  var confidence = bestCount / (this.options.knnTopK || 3);

  return {label: bestLabel, confidence: confidence, votes: votes};
};

RecognitionManager.prototype._euclideanDistance = function(a,b){
  if(!a || !b || a.length !== b.length) return Infinity;
  var sum = 0;
  for(var i=0;i<a.length;i++){
    sum += (a[i]-b[i])*(a[i]-b[i]);
  }
  return Math.sqrt(sum);
};

RecognitionManager.prototype.saveClasses = function(){
  try{
    var data = {};
    for(var label in this._knnData){
      data[label] = {label:label, embeddings:this._knnData[label].embeddings};
    }
    localStorage.setItem('recognition-knn', JSON.stringify(data));
    return true;
  }catch(e){return false}
};

RecognitionManager.prototype.loadClasses = function(){
  try{
    var raw = localStorage.getItem('recognition-knn');
    if(!raw) return false;
    var data = JSON.parse(raw);
    this._knnData = {};
    this._knnEmbeddings = [];
    for(var label in data){
      this._knnData[label] = {embeddings:data[label].embeddings, label:label};
      for(var i=0;i<data[label].embeddings.length;i++){
        this._knnEmbeddings.push({label:label, embedding:data[label].embeddings[i]});
      }
    }
    return true;
  }catch(e){return false}
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
    detectorType: this._detector ? 'coco-ssd' : (this._yoloInstance ? 'yolo' : 'none'),
    modelLoaded: !!(this._detector || this._yoloInstance),
    numClasses: Object.keys(this._knnData).length,
    knnSamples: this._knnEmbeddings.length
  };
};

RecognitionManager.prototype.destroy = function(){
  this.stopCamera();
  this._detector = null;
  this._yoloInstance = null;
  this._yoloModelObj = null;
  this.ready = false;
  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
};
