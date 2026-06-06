function ConversationManager(options){
  options = options || {};
  this.options = {
    systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
    sttMode: options.sttMode || 'auto',
    ttsMode: options.ttsMode || 'auto',
    llmMode: options.llmMode || 'auto',
    llmApiUrl: options.llmApiUrl || '',
    llmApiKey: options.llmApiKey || '',
    voskModelPath: options.voskModelPath || 'lib/vosk/model.tar.gz',
    mespeakPath: options.mespeakPath || 'lib/mespeak/mespeak.js',
    onnxModelPath: options.onnxModelPath || 'lib/onnx/smolm2/',
    vadThreshold: options.vadThreshold || 0.02,
    vadFramesBefore: options.vadFramesBefore || 10,
    vadFramesAfter: options.vadFramesAfter || 20
  };

  this.state = 'idle';
  this.listening = false;
  this.speaking = false;
  this.ready = false;
  this.modelsReady = { stt: false, tts: false, llm: false, vad: false };

  this._audioStream = null;
  this._audioContext = null;
  this._recognition = null;
  this._vadAnalyser = null;
  this._vadLoop = null;
  this._speechBuffer = '';
  this._ttsUtterance = null;
  this._interrupted = false;

  this.onStateChange = null;
  this.onUserSpeech = null;
  this.onError = null;
  this.onReady = null;
  this.onListeningChange = null;
}

ConversationManager.prototype.initialize = function(){
  var self = this;
  this._initVAD();
  this._initSTT();
  this._initTTS();
  this._initLLM();

  var check = function(){
    self.ready = self.modelsReady.stt || self.modelsReady.tts || self.modelsReady.llm;
    if(self.onReady) self.onReady(self.ready);
    self._emitState('idle');
  };

  setTimeout(check, 100);
};

ConversationManager.prototype._initVAD = function(){
  this.modelsReady.vad = true;
};

ConversationManager.prototype._initSTT = function(){
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(SpeechRecognition && (this.options.sttMode === 'auto' || this.options.sttMode === 'speechrec')){
    try{
      var self = this;
      this._recognition = new SpeechRecognition();
      this._recognition.continuous = true;
      this._recognition.interimResults = false;
      this._recognition.lang = 'en-US';
      this._recognition.maxAlternatives = 1;

      this._recognition.onresult = function(event){
        if(self._interrupted) return;
        for(var i=event.resultIndex;i<event.results.length;i++){
          if(event.results[i].isFinal){
            var text = event.results[i][0].transcript.trim().toLowerCase();
            if(text && self.onUserSpeech) self.onUserSpeech(text);
          }
        }
      };

      this._recognition.onerror = function(event){
        if(event.error !== 'no-speech' && event.error !== 'aborted'){
          if(self.onError) self.onError('stt: '+event.error);
        }
      };

      this._recognition.onend = function(){
        if(self.listening && !self._interrupted){
          setTimeout(function(){
            try{self._recognition.start()}catch(e){}
          }, 300);
        }
      };

      this.modelsReady.stt = true;
      return;
    }catch(e){}
  }
  this.modelsReady.stt = false;
};

ConversationManager.prototype._initTTS = function(){
  if(window.speechSynthesis && (this.options.ttsMode === 'auto' || this.options.ttsMode === 'speechsynth')){
    this.modelsReady.tts = true;
    return;
  }
  if(this.options.ttsMode === 'mespeak' || this.options.ttsMode === 'auto'){
    if(typeof meSpeak !== 'undefined'){
      var self = this;
      try{
        meSpeak.loadConfig('lib/mespeak/mespeak_config.json');
        meSpeak.loadVoice('lib/mespeak/voices/en/en-us.json', function(){
          self._mespeakReady = true;
          self.modelsReady.tts = true;
        });
        return;
      }catch(e){}
    }
  }
  this.modelsReady.tts = false;
};

ConversationManager.prototype._initLLM = function(){
  if(this.options.llmMode === 'remote' || (this.options.llmMode === 'auto' && this.options.llmApiUrl)){
    this.modelsReady.llm = true;
    return;
  }
  if(typeof ort !== 'undefined'){
    this._ortSession = null;
    this.modelsReady.llm = true;
    return;
  }
  this.modelsReady.llm = false;
};

ConversationManager.prototype.startListening = function(){
  if(this.listening) return;
  if(!this.modelsReady.stt){
    if(this.onError) this.onError('STT not available');
    return;
  }
  this._interrupted = false;
  this.listening = true;

  if(this._recognition){
    try{
      this._recognition.start();
      this._emitState('listening');
      if(this.onListeningChange) this.onListeningChange(true);
      return;
    }catch(e){}
  }

  this._startEnergyVAD();
  this._emitState('listening');
  if(this.onListeningChange) this.onListeningChange(true);
};

ConversationManager.prototype.stopListening = function(){
  if(!this.listening) return;
  this.listening = false;

  if(this._recognition){
    try{this._recognition.stop()}catch(e){}
  }

  this._stopEnergyVAD();
  this._emitState('idle');
  if(this.onListeningChange) this.onListeningChange(false);
};

ConversationManager.prototype._startEnergyVAD = function(){
  var self = this;
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    self._audioStream = stream;
    self._audioContext = new (window.AudioContext||window.webkitAudioContext)();
    var source = self._audioContext.createMediaStreamSource(stream);
    var analyser = self._audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    self._vadAnalyser = analyser;

    var bufferLength = analyser.frequencyBinCount;
    var dataArray = new Float32Array(bufferLength);
    var threshold = self.options.vadThreshold;
    var framesBefore = self.options.vadFramesBefore;
    var framesAfter = self.options.vadFramesAfter;
    var speechCount = 0;
    var silenceCount = 0;
    var isSpeaking = false;

    self._vadLoop = setInterval(function(){
      analyser.getFloatTimeDomainData(dataArray);
      var rms = 0;
      for(var i=0;i<bufferLength;i++){
        rms += dataArray[i]*dataArray[i];
      }
      rms = Math.sqrt(rms/bufferLength);

      if(rms > threshold){
        speechCount++;
        silenceCount = 0;
        if(speechCount >= framesBefore && !isSpeaking){
          isSpeaking = true;
          self._speechBuffer = '';
          self._emitState('speaking');
        }
      }else{
        silenceCount++;
        speechCount = 0;
        if(silenceCount >= framesAfter && isSpeaking){
          isSpeaking = false;
          if(self._speechBuffer.trim() && self.onUserSpeech){
            self.onUserSpeech(self._speechBuffer.trim().toLowerCase());
          }
          self._speechBuffer = '';
          self._emitState('listening');
        }
      }
    }, 50);
  }).catch(function(e){
    if(self.onError) self.onError('vad: '+e.message);
  });
};

ConversationManager.prototype._stopEnergyVAD = function(){
  if(this._vadLoop){
    clearInterval(this._vadLoop);
    this._vadLoop = null;
  }
  if(this._audioStream && !this._recognition){
    this._audioStream.getTracks().forEach(function(t){t.stop()});
    this._audioStream = null;
  }
};

ConversationManager.prototype.respondTo = function(text, systemPrompt, callback){
  if(!text){ if(callback) callback(''); return; }
  var prompt = systemPrompt || this.options.systemPrompt;

  if(this.options.llmMode === 'remote' || (this.options.llmMode === 'auto' && this.options.llmApiUrl)){
    this._remoteLLM(text, prompt, callback);
    return;
  }

  this._localLLM(text, prompt, callback);
};

ConversationManager.prototype._remoteLLM = function(text, systemPrompt, callback){
  if(!this.options.llmApiUrl){ if(callback) callback(''); return; }
  var self = this;
  fetch(this.options.llmApiUrl, {
    method:'POST',
    headers:{'Content-Type':'application/json', ...(this.options.llmApiKey?{'Authorization':'Bearer '+this.options.llmApiKey}:{})},
    body:JSON.stringify({messages:[{role:'system',content:systemPrompt},{role:'user',content:text}]})
  }).then(function(resp){return resp.json()}).then(function(data){
    var reply = data.choices?.[0]?.message?.content || data.response || '';
    if(callback) callback(reply);
  }).catch(function(e){
    if(self.onError) self.onError('llm: '+e.message);
    if(callback) callback('');
  });
};

ConversationManager.prototype._localLLM = function(text, systemPrompt, callback){
  if(this._ortSession){
    // ONNX Runtime Web inference stub
    if(callback) callback('');
  }else{
    if(callback) callback('');
  }
};

ConversationManager.prototype.speak = function(text, callback){
  if(!text){if(callback) callback();return}
  this._interrupted = false;
  this.speaking = true;
  this._emitState('speaking');

  if(this.modelsReady.tts && window.speechSynthesis && !this._mespeakReady){
    window.speechSynthesis.cancel();
    var self = this;
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    var v=pickEnglishVoice();if(v) utterance.voice=v;
    utterance.rate = 0.85;
    utterance.pitch = 1.15;
    utterance.volume = 0.9;
    utterance.onend = function(){
      self.speaking = false;
      self._emitState(self.listening?'listening':'idle');
      if(callback) callback();
    };
    utterance.onerror = function(){
      self.speaking = false;
      self._emitState(self.listening?'listening':'idle');
      if(callback) callback();
    };
    this._ttsUtterance = utterance;
    window.speechSynthesis.speak(utterance);
    return;
  }

  if(this._mespeakReady && typeof meSpeak !== 'undefined'){
    try{
      meSpeak.speak(text, {voice:'en/en-us',speed:160,wordgap:5});
      var self = this;
      setTimeout(function(){
        self.speaking = false;
        self._emitState(self.listening?'listening':'idle');
        if(callback) callback();
      }, text.length * 80);
      return;
    }catch(e){}
  }

  this.speaking = false;
  this._emitState(this.listening?'listening':'idle');
  if(callback) callback();
};

ConversationManager.prototype.interrupt = function(){
  this._interrupted = true;
  if(window.speechSynthesis && this._ttsUtterance){
    window.speechSynthesis.cancel();
  }
  if(this._mespeakReady && typeof meSpeak !== 'undefined'){
    try{meSpeak.stop()}catch(e){}
  }
  this.speaking = false;
  this._emitState(this.listening?'listening':'idle');
};

ConversationManager.prototype.setSystemPrompt = function(prompt){
  this.options.systemPrompt = prompt;
};

ConversationManager.prototype.getState = function(){
  return {
    state: this.state,
    listening: this.listening,
    speaking: this.speaking,
    ready: this.ready,
    modelsReady: {stt:this.modelsReady.stt, tts:this.modelsReady.tts, llm:this.modelsReady.llm, vad:this.modelsReady.vad},
    sttMode: this._recognition ? 'speechrec' : (this.modelsReady.stt ? 'vosk' : 'none'),
    ttsMode: this._mespeakReady ? 'mespeak' : (this.modelsReady.tts ? 'speechsynth' : 'none'),
    llmMode: this.options.llmApiUrl ? 'remote' : (this.modelsReady.llm ? 'local' : 'none')
  };
};

ConversationManager.prototype.destroy = function(){
  this.stopListening();
  this.interrupt();
  if(this._audioStream){
    this._audioStream.getTracks().forEach(function(t){t.stop()});
    this._audioStream = null;
  }
  if(this._audioContext){
    try{this._audioContext.close()}catch(e){}
    this._audioContext = null;
  }
  this.ready = false;
  this.onStateChange = null;
  this.onUserSpeech = null;
  this.onError = null;
  this.onReady = null;
};

ConversationManager.prototype._emitState = function(s){
  this.state = s;
  if(this.onStateChange) this.onStateChange(s);
};
