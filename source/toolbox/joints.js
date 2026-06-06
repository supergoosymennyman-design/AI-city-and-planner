function JointDetectionManager(options){
  options = options || {};
  this.options = {
    enableHands: options.enableHands !== undefined ? options.enableHands : true,
    enablePose: options.enablePose !== undefined ? options.enablePose : false,
    enableFace: options.enableFace !== undefined ? options.enableFace : false,
    maxNumHands: options.maxNumHands || 2,
    runningMode: options.runningMode || 'video',
    detectionInterval: options.detectionInterval || 100,
    modelComplexity: options.modelComplexity || 1,
    minDetectionConfidence: options.minDetectionConfidence || 0.5,
    minTrackingConfidence: options.minTrackingConfidence || 0.5
  };

  this.ready = false;
  this.cameraActive = false;
  this.detecting = false;
  this.modelsReady = {hands: false, pose: false, face: false};

  this._video = null;
  this._stream = null;
  this._holistic = null;
  this._detectLoop = null;
  this._lastHolisticResults = null;
  this._lastHands = [];
  this._lastPose = null;
  this._lastFace = null;
  this._currentCallbacks = null;

  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onFaceDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
}

JointDetectionManager.prototype.initialize = function(){
  var self = this;
  var anyEnabled = this.options.enableHands || this.options.enablePose || this.options.enableFace;
  if(!anyEnabled){
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  this._loadScripts([
    'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js'
  ], function(){
    self._setupHolistic();
  });
};

JointDetectionManager.prototype._loadScripts = function(urls, callback){
  var loaded = 0;
  var total = urls.length;
  var self = this;
  function oneLoaded(){ loaded++; if(loaded >= total && callback) callback(); }
  if(total === 0){ if(callback) callback(); return; }
  urls.forEach(function(url){
    if(document.querySelector('script[src="'+url+'"]')){ oneLoaded(); return; }
    var s = document.createElement('script');
    s.src = url;
    s.async = false;
    s.onload = oneLoaded;
    s.onerror = function(){ if(self.onError) self.onError('Failed: '+url); oneLoaded(); };
    document.head.appendChild(s);
  });
};

JointDetectionManager.prototype._setupHolistic = function(){
  var self = this;
  if(typeof Holistic === 'undefined'){
    if(this.onError) this.onError('Holistic not available after script load');
    this.ready = true;
    if(this.onReady) this.onReady(true);
    return;
  }
  try {
    this._holistic = new Holistic({
      locateFile: function(file){
        return 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/' + file;
      }
    });
    this._holistic.setOptions({
      modelComplexity: this.options.modelComplexity,
      smoothLandmarks: true,
      refineFaceLandmarks: this.options.enableFace,
      minDetectionConfidence: this.options.minDetectionConfidence,
      minTrackingConfidence: this.options.minTrackingConfidence
    });
    this._holistic.onResults(function(results){
      self._lastHolisticResults = results;
      self._processResults();
    });
  } catch(e){
    if(this.onError) this.onError('Holistic setup: '+e.message);
  }
  this.ready = true;
  this.modelsReady.hands = this.options.enableHands;
  this.modelsReady.pose = this.options.enablePose;
  this.modelsReady.face = this.options.enableFace;
  if(this.onReady) this.onReady(true);
};

JointDetectionManager.prototype.startCamera = function(videoElement, callback){
  if(this.cameraActive){ if(callback) callback(true); return; }
  var self = this;
  this._video = videoElement || this._createVideo();
  navigator.mediaDevices.getUserMedia({
    video: {facingMode:'user', width:{ideal:640}, height:{ideal:480}}
  }).then(function(stream){
    self._stream = stream;
    self._video.srcObject = stream;
    self._video.play().then(function(){
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

JointDetectionManager.prototype.stopCamera = function(){
  if(this._stream){
    this._stream.getTracks().forEach(function(t){t.stop()});
    this._stream = null;
  }
  if(this._video){
    this._video.pause();
    this._video.srcObject = null;
  }
  this.cameraActive = false;
};

JointDetectionManager.prototype._createVideo = function(){
  var video = document.createElement('video');
  video.setAttribute('playsinline','');
  video.setAttribute('autoplay','');
  video.muted = true;
  return video;
};

JointDetectionManager.prototype.detectHands = function(videoElement, callback){
  this._startDetection(videoElement, {onHands: callback});
};

JointDetectionManager.prototype.detectPose = function(videoElement, callback){
  this._startDetection(videoElement, {onPose: callback});
};

JointDetectionManager.prototype.detectAll = function(videoElement, callbacks){
  this._startDetection(videoElement, callbacks);
};

JointDetectionManager.prototype._startDetection = function(videoElement, callbacks){
  if(this.detecting){
    for(var k in callbacks){ if(callbacks[k]) this._currentCallbacks[k] = callbacks[k]; }
    return;
  }
  var video = videoElement || this._video;
  if(!video) return;
  this.detecting = true;
  this._currentCallbacks = callbacks || {};
  this._holisticBusy = false;
  var self = this;

  function detectFn(){
    // Stop only when detection is explicitly turned off. Do NOT bail just because
    // the model is still loading — keep polling so the loop survives being started
    // before the (async, CDN-loaded) Holistic model is ready, and picks it up once
    // it arrives. (Regression "Bug B": this used to `return` while _holistic was
    // null, which permanently killed detection on slow/first loads.)
    if(!self.detecting) return;
    if(self._holistic && !self._holisticBusy && video.readyState >= 2){
      self._holisticBusy = true;
      self._holistic.send({image: video}).then(function(){
        self._holisticBusy = false;
      }).catch(function(err){
        self._holisticBusy = false;
        if(self.onError) self.onError('Holistic: ' + (err.message || 'send failed'));
      });
    }
    self._detectLoop = setTimeout(detectFn, self.options.detectionInterval);
  }

  this._detectLoop = setTimeout(detectFn, 100);
};

JointDetectionManager.prototype._processResults = function(){
  var r = this._lastHolisticResults;
  if(!r) return;
  var cbs = this._currentCallbacks;

  if(this.options.enableHands){
    var hands = this._getHands(r);
    this._lastHands = hands;
    if(cbs && cbs.onHands) cbs.onHands(hands);
    if(this.onHandsDetected) this.onHandsDetected(hands);
    var g = this._detectGestures(hands);
    if(g){
      if(cbs && cbs.onGesture) cbs.onGesture(g);
      if(this.onGesture) this.onGesture(g);
    }
  }

  if(this.options.enablePose){
    var pose = this._getPose(r);
    this._lastPose = pose;
    if(cbs && cbs.onPose) cbs.onPose(pose);
    if(this.onPoseDetected) this.onPoseDetected(pose);
  }

  if(this.options.enableFace){
    var face = this._getFace(r);
    this._lastFace = face;
    if(cbs && cbs.onFace) cbs.onFace(face);
    if(this.onFaceDetected) this.onFaceDetected(face);
  }
};

JointDetectionManager.prototype._getHands = function(results){
  var hands = [];
  if(results.leftHandLandmarks && results.leftHandLandmarks.length > 0){
    hands.push({landmarks: results.leftHandLandmarks, handedness: 'Left', score: 1});
  }
  if(results.rightHandLandmarks && results.rightHandLandmarks.length > 0){
    hands.push({landmarks: results.rightHandLandmarks, handedness: 'Right', score: 1});
  }
  return hands;
};

JointDetectionManager.prototype._getPose = function(results){
  if(results.poseLandmarks && results.poseLandmarks.length > 0){
    return {landmarks: results.poseLandmarks, score: 1};
  }
  return null;
};

JointDetectionManager.prototype._getFace = function(results){
  if(results.faceLandmarks && results.faceLandmarks.length > 0){
    return {landmarks: results.faceLandmarks, score: 1};
  }
  return null;
};

JointDetectionManager.prototype._runHandDetection = function(video){
  return this._lastHands;
};

JointDetectionManager.prototype._runPoseDetection = function(video){
  return this._lastPose;
};

JointDetectionManager.prototype.stop = function(){
  this.detecting = false;
  if(this._detectLoop){
    clearTimeout(this._detectLoop);
    this._detectLoop = null;
  }
};

JointDetectionManager.prototype._detectGestures = function(hands){
  if(!hands || hands.length === 0) return null;
  var results = [];

  for(var i=0;i<hands.length;i++){
    var hand = hands[i];
    var landmarks = hand.landmarks;
    if(!landmarks || landmarks.length < 21) continue;

    var gesture = this._classifyHandGesture(landmarks);
    var handedness = hand.handedness || 'Unknown';

    results.push({
      type: gesture,
      hand: handedness,
      score: hand.score || 0,
      landmarks: landmarks
    });
  }

  if(results.length === 0) return null;
  // Always hand back a single gesture object so consumers can rely on `.type` /
  // `.hand`. (Previously returned a raw array when two hands were present, which
  // made `g.type` undefined for every onGesture caller.) Report the primary
  // (first-detected) hand; the full per-hand list stays in `results` if needed.
  return results[0];
};

JointDetectionManager.prototype._classifyHandGesture = function(landmarks){
  var wrist = landmarks[0];
  var thumbTip = landmarks[4];
  var indexTip = landmarks[8];
  var indexPip = landmarks[6];
  var middleTip = landmarks[12];
  var middlePip = landmarks[10];
  var ringTip = landmarks[16];
  var ringPip = landmarks[14];
  var pinkyTip = landmarks[20];
  var pinkyPip = landmarks[18];

  var fingers = this.countExtendedFingers(landmarks);
  var thumbExtended = this._isThumbExtended(landmarks);
  // Check the index finger specifically (tip above its PIP joint) rather than
  // "≥1 finger up" — otherwise e.g. a lone raised middle finger would read as an
  // extended index and mis-trigger the 'point' gesture below.
  var indexExtended = landmarks[8].y < landmarks[6].y;
  var allExtended = fingers >= 4;

  if(!thumbExtended && !indexExtended && fingers <= 1){
    return 'fist';
  }

  if(thumbExtended && !indexExtended && fingers <= 2){
    return 'thumbs_up';
  }

  if(!thumbExtended && indexExtended && fingers <= 2){
    return 'point';
  }

  if(allExtended){
    return 'open';
  }

  if(fingers === 2 && indexExtended){
    var dist = this._distance(indexTip, wrist);
    var midDist = this._distance(middleTip, wrist);
    if(midDist > dist * 0.7) return 'two_fingers';
    return 'peace';
  }

  return 'other';
};

JointDetectionManager.prototype.countExtendedFingers = function(landmarks){
  if(!landmarks || landmarks.length < 21) return 0;
  var count = 0;
  // The thumb extends sideways (x-axis), so the tip-above-PIP (y-axis) test used
  // for the other fingers doesn't apply to it — delegate to the dedicated x-based
  // check instead of mis-counting it. (Note: _isThumbExtended assumes a roughly
  // upright, front-facing hand; see its caveats.)
  if(this._isThumbExtended(landmarks)) count++;
  // Index, middle, ring, pinky: tip higher than its PIP (smaller y) ⇒ extended.
  var tips = [8, 12, 16, 20];
  var pips = [6, 10, 14, 18];
  for(var i=0;i<tips.length;i++){
    if(landmarks[tips[i]].y < landmarks[pips[i]].y) count++;
  }
  return count;
};

JointDetectionManager.prototype.isHandOpen = function(landmarks){
  if(!landmarks || landmarks.length < 21) return false;
  return this.countExtendedFingers(landmarks) >= 4;
};

JointDetectionManager.prototype.isPointing = function(landmarks){
  if(!landmarks || landmarks.length < 21) return false;
  var indexTip = landmarks[8];
  var indexPip = landmarks[6];
  var middlePip = landmarks[10];
  var ringPip = landmarks[14];
  var pinkyPip = landmarks[18];
  var indexExtended = indexTip.y < indexPip.y;
  var othersCurled = middlePip.y < landmarks[12].y &&
                      ringPip.y < landmarks[16].y &&
                      pinkyPip.y < landmarks[20].y;
  return indexExtended && othersCurled;
};

JointDetectionManager.prototype.getHandDirection = function(landmarks){
  if(!landmarks || landmarks.length < 5) return {x:0,y:0};
  var wrist = landmarks[0];
  var indexMcp = landmarks[5];
  var dx = indexMcp.x - wrist.x;
  var dy = indexMcp.y - wrist.y;
  var len = Math.sqrt(dx*dx+dy*dy);
  if(len===0) return {x:0,y:0};
  return {x:dx/len, y:dy/len};
};

JointDetectionManager.prototype._isThumbExtended = function(landmarks){
  var thumbTip = landmarks[4];
  var thumbMcp = landmarks[2];
  return thumbTip.x < thumbMcp.x - 0.02;
};

JointDetectionManager.prototype._getPalmCenter = function(landmarks){
  var x=0,y=0,z=0;
  for(var i=0;i<5;i++){
    x+=landmarks[i].x;
    y+=landmarks[i].y;
    z+=landmarks[i].z;
  }
  return {x:x/5, y:y/5, z:z/5};
};

JointDetectionManager.prototype._distance = function(a,b){
  return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2);
};

JointDetectionManager.prototype.getState = function(){
  return {
    ready: this.ready,
    cameraActive: this.cameraActive,
    detecting: this.detecting,
    handsReady: this.modelsReady.hands,
    poseReady: this.modelsReady.pose,
    faceReady: this.modelsReady.face,
    handsEnabled: this.options.enableHands,
    poseEnabled: this.options.enablePose,
    faceEnabled: this.options.enableFace
  };
};

JointDetectionManager.prototype.destroy = function(){
  this.stop();
  this.stopCamera();
  // Free the MediaPipe WASM/GPU graph before dropping the reference. GC won't
  // reclaim the native graph for us, so without this every manager re-creation
  // (e.g. each Hands/Pose/Face toggle in the harness) leaks a full Holistic graph
  // — expensive on tablets. close() may run async; we don't need to await it.
  if(this._holistic && typeof this._holistic.close === 'function'){
    try { this._holistic.close(); } catch(e){}
  }
  this._holistic = null;
  this.ready = false;
  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onFaceDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
};
