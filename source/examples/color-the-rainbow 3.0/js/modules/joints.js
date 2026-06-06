function JointDetectionManager(options){
  options = options || {};
  this.options = {
    enableHands: options.enableHands !== undefined ? options.enableHands : true,
    enablePose: options.enablePose !== undefined ? options.enablePose : false,
    maxNumHands: options.maxNumHands || 2,
    runningMode: options.runningMode || 'video',
    handModelPath: options.handModelPath || 'lib/mediapipe/hand_landmarker.task',
    poseModelPath: options.poseModelPath || 'lib/mediapipe/pose_landmarker.task',
    detectionInterval: options.detectionInterval || 100
  };

  this.ready = false;
  this.cameraActive = false;
  this.detecting = false;
  this.modelsReady = {hands: false, pose: false};

  this._video = null;
  this._stream = null;
  this._handLandmarker = null;
  this._poseLandmarker = null;
  this._detectLoop = null;
  this._lastHands = [];
  this._lastPose = null;

  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
}

JointDetectionManager.prototype.initialize = function(){
  this.ready = this.options.enableHands || this.options.enablePose;
  this.modelsReady.hands = this.options.enableHands;
  this.modelsReady.pose = this.options.enablePose;
  if(this.onReady) this.onReady(this.ready);
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
  if(!this.options.enableHands){
    if(this.onError) this.onError('Hand detection not available');
    return;
  }
  var video = videoElement || this._video;
  if(!video) return;

  this.detecting = true;
  var self = this;

  function detectFn(){
    if(!self.detecting) return;
    var hands = self._runHandDetection(video);
    self._lastHands = hands;
    if(callback) callback(hands);
    if(self.onHandsDetected) self.onHandsDetected(hands);
    var gesture = self._detectGestures(hands);
    if(gesture && self.onGesture) self.onGesture(gesture);
    self._detectLoop = setTimeout(detectFn, self.options.detectionInterval);
  }

  this._detectLoop = setTimeout(detectFn, 100);
};

JointDetectionManager.prototype.detectPose = function(videoElement, callback){
  if(!this.options.enablePose){
    if(this.onError) this.onError('Pose detection not available');
    return;
  }
  var video = videoElement || this._video;
  if(!video) return;

  this.detecting = true;
  var self = this;

  function detectFn(){
    if(!self.detecting) return;
    var pose = self._runPoseDetection(video);
    self._lastPose = pose;
    if(callback) callback(pose);
    if(self.onPoseDetected) self.onPoseDetected(pose);
    self._detectLoop = setTimeout(detectFn, self.options.detectionInterval);
  }

  this._detectLoop = setTimeout(detectFn, 100);
};

JointDetectionManager.prototype.detectAll = function(videoElement, callbacks){
  var video = videoElement || this._video;
  if(!video) return;

  this.detecting = true;
  var self = this;

  function detectFn(){
    if(!self.detecting) return;

    if(self.options.enableHands){
      var hands = self._runHandDetection(video);
      self._lastHands = hands;
      if(callbacks && callbacks.onHands) callbacks.onHands(hands);
      if(self.onHandsDetected) self.onHandsDetected(hands);
      var g = self._detectGestures(hands);
      if(g && callbacks && callbacks.onGesture) callbacks.onGesture(g);
      if(g && self.onGesture) self.onGesture(g);
    }

    if(self.options.enablePose){
      var pose = self._runPoseDetection(video);
      self._lastPose = pose;
      if(callbacks && callbacks.onPose) callbacks.onPose(pose);
      if(self.onPoseDetected) self.onPoseDetected(pose);
    }

    self._detectLoop = setTimeout(detectFn, self.options.detectionInterval);
  }

  this._detectLoop = setTimeout(detectFn, 100);
};

JointDetectionManager.prototype._runHandDetection = function(video){
  return [];
};

JointDetectionManager.prototype._runPoseDetection = function(video){
  return null;
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
  return results.length === 1 ? results[0] : results;
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
  var indexExtended = fingers >= 1;
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
  var tips = [4, 8, 12, 16, 20];
  var pips = [3, 6, 10, 14, 18];
  var count = 0;

  for(var i=0;i<tips.length;i++){
    if(landmarks[tips[i]].y < landmarks[pips[i]].y){
      count++;
    }
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
    handsEnabled: this.options.enableHands,
    poseEnabled: this.options.enablePose
  };
};

JointDetectionManager.prototype.destroy = function(){
  this.stop();
  this.stopCamera();
  this._handLandmarker = null;
  this._poseLandmarker = null;
  this.ready = false;
  this.onHandsDetected = null;
  this.onPoseDetected = null;
  this.onGesture = null;
  this.onCameraReady = null;
  this.onError = null;
  this.onReady = null;
};
