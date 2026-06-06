function showLoading(){
  var stage = $('stage');
  if(!stage) return {};
  stage.innerHTML='';
  var wrap=document.createElement('div');wrap.className='loading-screen';
  var h2=document.createElement('h2');h2.textContent='\uD83C\uDF08 Loading\u2026';
  wrap.appendChild(h2);

  var row=document.createElement('div');row.className='loading-item';
  var lab=document.createElement('span');lab.className='load-label';lab.textContent='Voice Engine';
  var bar=document.createElement('div');bar.className='load-bar';
  var fill=document.createElement('div');fill.className='fill';
  bar.appendChild(fill);
  row.appendChild(lab);row.appendChild(bar);
  wrap.appendChild(row);

  stage.appendChild(wrap);
  return {'load-voice': fill};
}

function updateLoadingBar(el, pct){
  if(el) el.style.width = pct+'%';
}

function buildSettings(){
  var panel = $('settings-panel');
  var overlay = $('settings-overlay');
  if(!panel) return;

  var closeBtn = document.createElement('button');
  closeBtn.className='btn';closeBtn.textContent='Close';
  closeBtn.style.cssText='background:#ccc;color:#333;margin-top:auto';

  var voiceLabel=document.createElement('label');
  var voiceCb=document.createElement('input');voiceCb.type='checkbox';
  var saved = localStorage.getItem('ctr-voice');
  voiceCb.checked = saved!==null ? saved==='true' : true;
  voiceCb.addEventListener('change', function(){
    if(window._game) window._game.voiceEnabled = this.checked;
    localStorage.setItem('ctr-voice', this.checked);
  });
  voiceLabel.appendChild(voiceCb);
  voiceLabel.appendChild(document.createTextNode('Voice Input'));
  panel.appendChild(voiceLabel);
  panel.appendChild(closeBtn);

  function toggleSettings(){
    var open = panel.classList.toggle('open');
    overlay.classList.toggle('open', open);
  }
  closeBtn.addEventListener('pointerdown', function(e){e.preventDefault(); toggleSettings()});
  overlay.addEventListener('pointerdown', function(e){if(e.target===overlay) toggleSettings()});

  var gear = $('settings-btn');
  if(gear) gear.addEventListener('pointerdown', function(e){e.preventDefault(); toggleSettings()});
}

function buildFallbackInput(){
  var wrap=document.createElement('div');wrap.id='voice-fallback-input';
  wrap.className='hidden';
  var input=document.createElement('input');input.type='text';
  input.placeholder='Type a colour\u2026';
  input.addEventListener('keydown', function(e){
    if(e.key==='Enter' && input.value.trim()){
      if(window._game) window._game.onVoiceInput(input.value.trim());
      input.value='';
    }
  });
  var btn=document.createElement('button');btn.textContent='Send';
  btn.addEventListener('pointerdown', function(){
    if(input.value.trim()){
      if(window._game) window._game.onVoiceInput(input.value.trim());
      input.value='';
    }
  });
  wrap.appendChild(input);wrap.appendChild(btn);
  var bottom=$('bottom');
  if(bottom) bottom.parentNode.insertBefore(wrap, bottom);
  return wrap;
}

(function(){
  try {
    var loadEls = showLoading();

    var conversation = new ConversationManager({
      systemPrompt: 'You are Rainbow Bot, a friendly robot helping children learn colours. Keep responses short and encouraging.'
    });

    conversation.initialize();
    updateLoadingBar(loadEls['load-voice'], 100);

    var game = new RainbowGame({
      conversation: conversation
    });
    window._game = game;

    buildSettings();
    var fallbackInput = buildFallbackInput();

    if(conversation.getState().sttMode === 'none'){
      fallbackInput.classList.remove('hidden');
    }

    conversation.onReady = function(ready){
      if(conversation.getState().sttMode === 'none'){
        fallbackInput.classList.remove('hidden');
      }
      var voiceSetting = localStorage.getItem('ctr-voice');
      if(voiceSetting === 'true' || (voiceSetting === null && ready)){
        conversation.startListening();
      }
    };

    game.updateModuleStatus();
  } catch(e) {
    console.error('Rainbow Game error:', e);
    var stage = $('stage');
    if(stage) stage.innerHTML = '<p style="color:red;padding:40px;text-align:center">Error: ' + e.message + '</p>';
  }
})();
