function GameAudio(){
  this.actx = null;
}

GameAudio.prototype.init = function(){
  if(!this.actx){
    try{this.actx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}
  }
};

GameAudio.prototype.playCorrect = function(){
  this.init();if(!this.actx)return;
  try{
    var t=this.actx.currentTime;
    var _this=this;
    [523,659,784].forEach(function(f,i){
      var o=_this.actx.createOscillator(),g=_this.actx.createGain();
      o.frequency.value=f;o.type='sine';
      g.gain.setValueAtTime(0.18,t+i*0.1);
      g.gain.exponentialRampToValueAtTime(0.001,t+i*0.1+0.25);
      o.connect(g);g.connect(_this.actx.destination);
      o.start(t+i*0.1);o.stop(t+i*0.1+0.25);
    });
  }catch(e){}
};

GameAudio.prototype.playWrong = function(){
  this.init();if(!this.actx)return;
  try{
    var t=this.actx.currentTime,o=this.actx.createOscillator(),g=this.actx.createGain();
    o.frequency.value=150;o.type='square';
    g.gain.setValueAtTime(0.12,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
    o.connect(g);g.connect(this.actx.destination);
    o.start(t);o.stop(t+0.35);
  }catch(e){}
};

GameAudio.prototype.playDone = function(){
  this.init();if(!this.actx)return;
  try{
    var t=this.actx.currentTime,o=this.actx.createOscillator(),g=this.actx.createGain();
    o.frequency.value=880;o.type='sine';
    g.gain.setValueAtTime(0.15,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.connect(g);g.connect(this.actx.destination);
    o.start(t);o.stop(t+0.2);
  }catch(e){}
};

GameAudio.prototype.destroy = function(){
  if(this.actx){try{this.actx.close()}catch(e){};this.actx=null}
};
