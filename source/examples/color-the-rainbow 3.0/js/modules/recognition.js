function RecognitionManager(options){
  options = options || {};
  this.options = {
    modelPath: options.modelPath || 'lib/mediapipe/mobilenet_v3/',
    knnTopK: options.knnTopK || 3,
    cameraFacingMode: options.cameraFacingMode || 'environment',
    maxTeachSamples: options.maxTeachSamples || 30,
    width: options.width || 224,
    height: options.height || 224
  };

  this.ready = false;
  this.cameraActive = false;
  this.facingMode = this.options.cameraFacingMode;
  this._video = null;
  this._stream = null;
  this._canvas = null;
  this._ctx = null;
  this._classifier = null;

  this._knnData = {};
  this._knnEmbeddings = [];

  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
  this.onClassTaught = null;
}

RecognitionManager.prototype.initialize = function(){
  this.ready = true;
  if(this.onReady) this.onReady(true);
};

RecognitionManager.prototype.startCamera = function(videoElement, facingMode, callback){
  if(this.cameraActive){ if(callback) callback(true); return; }
  this.facingMode = facingMode || this.facingMode;
  var self = this;

  this._video = videoElement || this._createVideo();

  var constraints = {
    video: {
      facingMode: this.facingMode,
      width: {ideal: this.options.width*2},
      height: {ideal: this.options.height*2}
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
  if(!this.ready || !this._ctx){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }
  var video = videoElement || this._video;
  if(!video || !this._ctx){
    if(callback) callback({label:'unknown',confidence:0});
    return;
  }

  this._ctx.drawImage(video, 0, 0, this.options.width, this.options.height);

  var self = this;
  this._extractFeatures(function(features){
    if(!features){
      if(callback) callback({label:'unknown',confidence:0});
      return;
    }
    var result = self._knnClassify(features);
    if(self.onClassification) self.onClassification(result);
    if(callback) callback(result);
  });
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
  var topK = distances.slice(0, this.options.knnTopK);
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

  var confidence = bestCount / this.options.knnTopK;

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
    numClasses: Object.keys(this._knnData).length,
    knnSamples: this._knnEmbeddings.length
  };
};

RecognitionManager.prototype.destroy = function(){
  this.stopCamera();
  this._classifier = null;
  this.ready = false;
  this.onClassification = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
};
