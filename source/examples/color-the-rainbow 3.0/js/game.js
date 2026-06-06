function $(id){return document.getElementById(id)}

function hexToRgb(h){
  var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  return [r,g,b]
}
function colorDist(a,b){return Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2)}
function rgbToHex(r){return '#'+[r[0],r[1],r[2]].map(function(n){var h=n.toString(16);return h.length<2?'0'+h:h}).join('')}

function RainbowGame(options){
  options = options || {};
  this.options = options;
  this.conversation = options.conversation || null;
  this.audio = options.audio || new GameAudio();

  this.d = null;
  this._dom = {};
  this._initDOM();

  this.voiceEnabled = !!this.conversation;
  this._awaitingColorName = false;
  this._pendingColour = null;

  this._wireModules();
  this.start();
}

RainbowGame.prototype._initDOM = function(){
  this._dom = {
    app: $('app'),
    stage: $('stage'),
    bottom: $('bottom'),
    bubble: $('bubble-text'),
    scoreEl: $('score'),
    botChar: $('bot-char'),
    moduleBar: $('module-bar'),
    resetBtn: $('reset')
  };

  if(this._dom.resetBtn){
    var self = this;
    this._dom.resetBtn.addEventListener('pointerdown', function(e){
      e.preventDefault();
      if(confirm('Reset all data and start over?')){
        self.d = freshData();
        self.render();
        self.say('Everything reset! Let\u2019s start fresh!');
      }
    });
  }
};

RainbowGame.prototype._wireModules = function(){
  if(this.conversation){
    var self = this;
    this.conversation.onUserSpeech = function(text){self.onVoiceInput(text)};
    this.conversation.onStateChange = function(s){self._updateMicIndicator(s)};
  }
};

RainbowGame.prototype.start = function(){
  this.d = freshData();
  this.d.phraseIndex = 0;
  this.render();
  this.updateModuleStatus();
};

// ------- Voice input handler -------

RainbowGame.prototype.onVoiceInput = function(text){
  if(!text) return;
  text = text.toLowerCase();

  switch(this.d.state){
    case 'intro':
      if(text.includes('go')||text.includes('start')||text.includes('yes')||text.includes('let')){
        this.startTeaching();
      }
      break;

    case 'teaching':
      this._handleVoiceColour(text);
      break;

    case 'game':
      for(var c2 in COLOUR_NAMES){
        if(text.includes(c2)){
          this.onGameTap(c2, this.d.gamePick);
          return;
        }
      }
      break;
  }
};

RainbowGame.prototype._handleVoiceColour = function(text){
  if(this._awaitingColorName){
    for(var c in COLOUR_NAMES){
      if(text.includes(c)){
        this._completeTeaching(c);
        return;
      }
    }
    return
  }
  if(this.d.shapeFilled){
    for(var c in COLOUR_NAMES){
      if(text.includes(c)){
        if(this.d.learned[c] && !this.d.learned[c].rgb){
          this.d.selectedColour = {red:'#FF4444', blue:'#4488FF', yellow:'#F5D742'}[c];
          this._pendingColour = c;
          this._completeTeaching(c);
          return;
        }
        this.say('I already know '+c+'! Teach me a different colour!');
        return;
      }
    }
  }
  for(var i=0;i<PALETTE.length;i++){
    if(text.includes(PALETTE[i].name.toLowerCase())||text.includes(PALETTE[i].hex)){
      this.selectColour(PALETTE[i].hex);
      return;
    }
  }
  for(var c in COLOUR_NAMES){
    if(text.includes(c)){
      var hexMap = {red:'#FF4444', blue:'#4488FF', yellow:'#F5D742'};
      if(hexMap[c]) this.selectColour(hexMap[c]);
      return;
    }
  }
};

// ------- TTS -------

RainbowGame.prototype.say = function(text, cb){
  this._dom.bubble.textContent = text;
  var clean = text.replace(/[^\x20-\x7E\s]/g,'').trim();
  if(this.conversation){
    try{this.conversation.speak(clean, cb)}catch(e){if(cb) cb()}
  }else{
    window.speechSynthesis.cancel();
    this._speakFallback(clean, cb);
  }
};

RainbowGame.prototype._speakFallback = function(text, cb){
  if(!window.speechSynthesis){if(cb) setTimeout(cb,0);return}
  var u=new SpeechSynthesisUtterance(text.replace(/[^\x20-\x7E\s]/g,''));
  u.lang='en-US';u.rate=0.85;u.pitch=1.15;u.volume=0.9;
  var v=pickEnglishVoice();if(v) u.voice=v;
  if(cb){u.onend=cb;u.onerror=cb}
  window.speechSynthesis.speak(u);
};

RainbowGame.prototype._sayNoTTS = function(text){
  this._dom.bubble.textContent = text;
};

// ------- Module status -------

RainbowGame.prototype.updateModuleStatus = function(){
  var bar = this._dom.moduleBar;
  if(!bar) return;
  bar.innerHTML = '';

  if(this.conversation){
    var s = this.conversation.getState();
    this._addStatusIndicator(bar, 'Voice', '🎤', s.ready, s.sttMode!=='none');
  }
};

RainbowGame.prototype._addStatusIndicator = function(bar, label, icon, active, detail){
  var el=document.createElement('span');
  el.className='module-indicator'+(active?' active':'');
  el.innerHTML=icon+' '+label+(detail?' ●':' ○');
  bar.appendChild(el);
};

RainbowGame.prototype._updateMicIndicator = function(state){
  // could highlight the voice indicator differently
};

// ------- Core render loop -------

RainbowGame.prototype.render = function(){
  if(!this.d) return;
  var stage = this._dom.stage;
  var bottom = this._dom.bottom;
  if(!stage||!bottom) return;
  stage.innerHTML='';
  bottom.innerHTML='';

  switch(this.d.state){
    case 'intro': this.renderIntro(); break;
    case 'teaching': this.renderTeaching(); break;
    case 'game': this.renderGame(); break;
    case 'result': this.renderResult(); break;
  }
  this.updateScore();
};

RainbowGame.prototype.updateScore = function(){
  var scoreEl = this._dom.scoreEl;
  if(!scoreEl) return;
  if(this.d.state==='game'||this.d.state==='result'){
    var s='',i;
    for(i=0;i<TOTAL_ROUNDS;i++){
      if(i<this.d.gameScore) s+='<span class="f">★</span>';
      else if(i<this.d.gameRound) s+='<span class="e">★</span>';
      else s+='<span class="e">☆</span>';
    }
    scoreEl.innerHTML=s;
  }else scoreEl.innerHTML=''
};

// ------- Render: Intro -------

RainbowGame.prototype.renderIntro = function(){
  this._sayNoTTS("Hi! I'm Rainbow Bot 🤖  I don't know colours yet. Can you teach me?");
  this.say("Hi! I'm Rainbow Bot! I don't know colours yet. Can you teach me?");

  var p=document.createElement('p');p.className='prompt';p.textContent='🌈 Colour the Rainbow!';
  this._dom.stage.appendChild(p);
  var p2=document.createElement('p');p2.className='sub';p2.textContent='Help me learn red, blue, and yellow!';
  this._dom.stage.appendChild(p2);

  var self=this;
  var btn=document.createElement('button');
  btn.className='btn btn-start';btn.textContent='Let\u2019s Go!';
  btn.addEventListener('pointerdown',function(e){
    e.preventDefault();self.startTeaching();
  });
  this._dom.bottom.appendChild(btn);
};

// ------- Render: Teaching -------

RainbowGame.prototype.renderTeaching = function(){
  var shapeName = 'circle';

  if(!this.d.shapeFilled){
    this.say('Colour the circle! Pick a colour below, then tap the shape.');
  }

  var p=document.createElement('p');p.className='prompt';
  if(this.d.shapeFilled){
    p.textContent='What color is this?';
  }else{
    p.textContent='Colour the circle!';
  }
  this._dom.stage.appendChild(p);

  var wrap=document.createElement('div');wrap.className='shape-wrap';
  var fill = this.d.shapeFilled && this.d.selectedColour ? this.d.selectedColour : '#e0e0e0';
  var svg = createShape(shapeName, fill);
  var shapeEl = svg.querySelector('circle,rect,polygon');
  var self=this;
  shapeEl.addEventListener('pointerdown',function(e){
    e.preventDefault();self.onShapeTap();
  });
  wrap.appendChild(svg);
  this._dom.stage.appendChild(wrap);

  if(!this.d.shapeFilled){
    var h=document.createElement('p');h.className='sub';
    h.textContent='Tap the shape to fill it!';
    this._dom.stage.appendChild(h);
  }

  this.renderPalette();

  var teachBtn=document.createElement('button');teachBtn.id='teach-btn';teachBtn.className='btn';
  teachBtn.textContent='Teach AI!';
  teachBtn.disabled=!this.d.shapeFilled;
  teachBtn.addEventListener('pointerdown',function(e){e.preventDefault();self.onTeachColor()});
  this._dom.bottom.appendChild(teachBtn);
};

RainbowGame.prototype.renderPalette = function(){
  var p=document.createElement('div');p.className='palette';
  var self=this;
  var colours = this.d.state === 'teaching' ? PALETTE.slice(0, 3) : PALETTE;
  colours.forEach(function(c){
    var btn=document.createElement('button');
    btn.className='palette-btn'+(self.d.selectedColour===c.hex?' sel':'');
    btn.style.background=c.hex;
    btn.setAttribute('aria-label',c.name);
    btn.addEventListener('pointerdown',function(e){
      e.preventDefault();self.selectColour(c.hex);
    });
    p.appendChild(btn);
  });
  this._dom.bottom.appendChild(p);
};

// ------- Render: Game -------

RainbowGame.prototype.renderGame = function(){
  if(this.d.gameFeedback){
    var p=document.createElement('p');p.className='prompt';
    p.textContent='Round '+(this.d.gameRound+1)+' of '+TOTAL_ROUNDS;
    this._dom.stage.appendChild(p);
    if(this.d.gamePick && this.d.learned[this.d.gamePick] && this.d.learned[this.d.gamePick].rgb){
      var fill=rgbToHex(this.d.learned[this.d.gamePick].rgb);
      var svg=createShape(this.d.gameShape||SHAPES[0], fill);
      var wrap=document.createElement('div');wrap.className='shape-wrap';
      wrap.appendChild(svg);this._dom.stage.appendChild(wrap);
    }
    return;
  }
  var available=COLOURS.filter(function(c){return this.d.learned[c].rgb},this);
  if(available.length===0){this.d.state='intro';this.render();return}
  var pick=available[Math.floor(Math.random()*available.length)];
  this.d.gamePick=pick;
  this.d.gameShape=SHAPES[Math.floor(Math.random()*SHAPES.length)];
  this.say('What colour is this?');

  var p=document.createElement('p');p.className='prompt';
  p.textContent='Round '+(this.d.gameRound+1)+' of '+TOTAL_ROUNDS;
  this._dom.stage.appendChild(p);

  var fill=rgbToHex(this.d.learned[pick].rgb);
  var svg=createShape(this.d.gameShape, fill);
  var wrap=document.createElement('div');wrap.className='shape-wrap';
  wrap.appendChild(svg);this._dom.stage.appendChild(wrap);

  var bwrap=document.createElement('div');bwrap.className='game-btns';
  var btnOrder=shuffle(['red','blue','yellow'].slice());
  var self=this;
  btnOrder.forEach(function(c){
    var btn=document.createElement('button');
    btn.className='btn btn-'+c;
    btn.textContent=COLOUR_NAMES[c];
    btn.addEventListener('pointerdown',function(e){e.preventDefault();self.onGameTap(c,self.d.gamePick)});
    bwrap.appendChild(btn);
  });
  this._dom.stage.appendChild(bwrap);
};

// ------- Render: Result -------

RainbowGame.prototype.renderResult = function(){
  var s = this.d.gameScore;
  this.say('You got '+s+' out of '+TOTAL_ROUNDS+'! Great job! 🌈');

  var p=document.createElement('p');p.className='result-score';
  p.textContent='You got '+s+' out of '+TOTAL_ROUNDS+'!';
  this._dom.stage.appendChild(p);

  var stars=document.createElement('div');stars.className='stars-big';
  var t='',i;
  for(i=0;i<TOTAL_ROUNDS;i++){
    t+='<span class="'+(i<s?'f':'e')+'">\u2605</span>';
  }
  stars.innerHTML=t;
  this._dom.stage.appendChild(stars);

  var bw=document.createElement('div');bw.className='result-btns';
  var self=this;

  var play=document.createElement('button');play.className='btn btn-primary';
  play.textContent='Play Again';
  play.addEventListener('pointerdown',function(e){
    e.preventDefault();
    self.d.gameRound=0;self.d.gameScore=0;self.d.gameFeedback=null;
    self.d.gamePick=null;self.d.gameShape=null;self.d.state='game';
    self.render();
  });
  bw.appendChild(play);

  var reteach=document.createElement('button');reteach.className='btn reteach-btn';
  reteach.textContent='Re-teach Colours';
  reteach.addEventListener('pointerdown',function(e){e.preventDefault();self.doreteach()});
  bw.appendChild(reteach);

  this._dom.stage.appendChild(bw);
};

// ------- Event handlers -------

RainbowGame.prototype.startTeaching = function(){
  var fresh = freshData();
  this.d.state = 'teaching';
  this.d.learned = fresh.learned;
  this.d.selectedColour = null;
  this.d.shapeFilled = false;
  this.d.taughtCount = 0;
  this.d.gameRound = 0;
  this.d.gameScore = 0;
  this.d.gameFeedback = null;
  this.d.gamePick = null;
  this.d.gameShape = null;
  this.d.phraseIndex = 0;
  this._awaitingColorName = false;
  this._pendingColour = null;
  this.render();
};

RainbowGame.prototype.selectColour = function(hex){
  this.d.selectedColour = hex;
  this.render();
};

RainbowGame.prototype.onShapeTap = function(){
  if(!this.d.selectedColour){
    this.say('Pick a colour from the circles first!');
    return
  }
  this.d.shapeFilled = true;
  this.render();
  var self=this;
  setTimeout(function(){self.say("Hmm\u2026 I don\u2019t know this color.")}, 400);
};

RainbowGame.prototype.onTeachColor = function(){
  if(!this.d.shapeFilled || !this.d.selectedColour){
    this.say('Colour the shape first!');
    return
  }
  var hex = this.d.selectedColour.toUpperCase();
  var colour = TEACHING_HEXES[hex];
  if(!colour){
    this.say('I need to learn red, blue, or yellow! Pick one of those.');
    return
  }
  if(this.d.learned[colour].rgb){
    this.say('I already know '+colour+'! Teach me a different colour!');
    return
  }
  this._pendingColour = colour;
  this._awaitingColorName = true;
  this.say('What colour is this?');
};

RainbowGame.prototype._completeTeaching = function(spokenColour){
  this._awaitingColorName = false;
  var colour = this._pendingColour;
  this._pendingColour = null;

  if(spokenColour !== colour){
    this.say('This is '+colour+', not '+spokenColour+'! What colour is it?');
    this._pendingColour = colour;
    this._awaitingColorName = true;
    return
  }

  var rgb = hexToRgb(this.d.selectedColour);
  this.d.learned[colour].rgb = rgb;
  this.d.selectedColour = null;
  this.d.shapeFilled = false;
  this.audio.playDone();
  this.d.taughtCount++;

  var assoc = COLOR_ASSOCIATIONS[colour] || '';
  var colored = cap(colour);

  var self=this;
  this.say(colored+'! '+assoc+' I know '+this.d.taughtCount+' colour'+(this.d.taughtCount>1?'s':'')+' now!', function(){
    if(self.d.taughtCount >= 3){
      self.d.state = 'game';
      self.d.gameRound = 0;
      self.d.gameScore = 0;
      self.render();
    }else{
      self.render();
    }
  });
};

RainbowGame.prototype.onGameTap = function(chosen, actual){
  if(this.d.gameFeedback) return;
  var self=this;
  if(chosen===actual){
    this.audio.playCorrect();this.d.gameScore++;
    this.d.gameFeedback='correct';
    this.render();
    this.say('Correct! You are so smart! \uD83C\uDF89', function(){
      self.d.gameRound++;
      self.d.gameFeedback=null;
      if(self.d.gameRound>=TOTAL_ROUNDS) self.d.state='result';
      self.render();
    });
  }else{
    this.audio.playWrong();
    this.d.gameFeedback='wrong';
    var phrase = WRONG_PHRASES[this.d.phraseIndex % WRONG_PHRASES.length];
    this.d.phraseIndex++;
    this.render();
    this.say(phrase + ' That\u2019s ' + COLOUR_NAMES[actual] + '!', function(){
      self.d.gameRound++;
      self.d.gameFeedback=null;
      if(self.d.gameRound>=TOTAL_ROUNDS) self.d.state='result';
      self.render();
    });
  }
};

RainbowGame.prototype.doreteach = function(){
  this.d = freshData();
  this.render();
  var self=this;
  setTimeout(function(){self.say('Okay! Let\u2019s learn colours again!')},200);
};

RainbowGame.prototype.destroy = function(){
  if(this.conversation) this.conversation.destroy();
  this.audio.destroy();
};
