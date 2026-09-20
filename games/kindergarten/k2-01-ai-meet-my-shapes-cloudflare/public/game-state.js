/**
 * game-state.js — k2-01 AI, Meet My Shapes!
 * States: INTRO → TEACHING → MINITEST → SMART → CREATION → CELEBRATION
 * Drawing canvas + shape recognition. No camera.
 */
var SHAPES=["circle","square","triangle","rectangle"];

function Game(){
  this.state="INTRO";this.voice=new VoicePipeline();this.ai=new AiResponsePipeline();
  this.vision=new VisionPipeline();this.creation=new CreationPipeline();
  this.voice.setAP(this.ai);
  this.progress={};SHAPES.forEach(function(s){this.progress[s]=0},this);
  // Thin wrong-name layer: maps geometric shape → label the kid taught
  // Example: {circle:"square"} means the kid taught circles as "square"
  this.shapeLabels={};
  this._webllmOk=false;this._drawing=false;
  this._lastX=0;this._lastY=0;this._actions=[]
}
Game.prototype._r=function(h){document.getElementById("app").innerHTML=h;this._btn()};
Game.prototype._btn=function(){
  var x=document.getElementById("mic-btn");if(x)x.remove();
  var y=document.getElementById("to-create");if(y)y.remove();
  var b=document.createElement("button");b.id="mic-btn";
  b.className=this.voice._active?"on":"off";b.textContent="🎤";
  var s=this;b.onclick=function(){s.voice.stop();s.voice.start();b.className=s.voice._active?"on":"off"};
  document.body.appendChild(b);
  if(this.state==="SMART"||this.state==="TEACHING"){
    var c=document.createElement("button");c.id="to-create";c.textContent="Creation Mode →";
    c.style.cssText="position:fixed;top:62px;right:8px;z-index:10001;font-size:.7rem;padding:4px 10px;min-height:32px;background:#A78BFA;border:none;border-radius:16px;color:#fff;font-weight:700;cursor:pointer;font-family:inherit";
    c.onclick=function(){s.enterCreation()};
    document.body.appendChild(c)
  }
};
Game.prototype._talk=function(t,cb){this.ai.speak(t,cb)};
Game.prototype._total=function(){var t=0;SHAPES.forEach(function(s){t+=this.progress[s]},this);return t};

// ===== CANVAS DRAWING =====
Game.prototype._initCanvas=function(el){
  if(!el)return;el.width=el.offsetWidth||400;el.height=el.offsetHeight||400;
  this.vision.pointAtCanvas(el);this._dc=el;this._dctx=el.getContext("2d");
  this._dctx.strokeStyle="#000";this._dctx.lineWidth=8;this._dctx.lineCap="round";this._dctx.lineJoin="round";
  this._dctx.fillStyle="#FFF";this._dctx.fillRect(0,0,el.width,el.height);
  var s=this;
  function start(e){e.preventDefault();s._drawing=true;var p=s._pos(e);s._lastX=p.x;s._lastY=p.y;s._actions.push({t:"path",pts:[{x:p.x,y:p.y}],color:"#000"})}
  function move(e){e.preventDefault();if(!s._drawing)return;var p=s._pos(e);s._dctx.beginPath();s._dctx.moveTo(s._lastX,s._lastY);s._dctx.lineTo(p.x,p.y);s._dctx.stroke();s._lastX=p.x;s._lastY=p.y;if(s._actions.length&&s._actions[s._actions.length-1].t==="path")s._actions[s._actions.length-1].pts.push({x:p.x,y:p.y})}
  function end(e){e.preventDefault();s._drawing=false}
  el.addEventListener("touchstart",start,{passive:false});el.addEventListener("touchmove",move,{passive:false});el.addEventListener("touchend",end,{passive:false});
  el.addEventListener("mousedown",start);el.addEventListener("mousemove",move);el.addEventListener("mouseup",end);
};
Game.prototype._pos=function(e){var r=this._dc.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return{x:t.clientX-r.x,y:t.clientY-r.y}};

Game.prototype._clearCanvas=function(){if(this._dctx&&this._dc){this._dctx.fillStyle="#FFF";this._dctx.fillRect(0,0,this._dc.width,this._dc.height);this._actions=[]}};
Game.prototype._undoCanvas=function(){if(this._actions.length<1||!this._dctx||!this._dc)return;this._actions.pop();this._dctx.fillStyle="#FFF";this._dctx.fillRect(0,0,this._dc.width,this._dc.height);var s=this;this._actions.forEach(function(a){if(a.t==="path"&&a.pts.length>1){s._dctx.beginPath();s._dctx.strokeStyle=a.color;s._dctx.lineWidth=8;s._dctx.lineCap="round";s._dctx.lineJoin="round";s._dctx.moveTo(a.pts[0].x,a.pts[0].y);for(var i=1;i<a.pts.length;i++)s._dctx.lineTo(a.pts[i].x,a.pts[i].y);s._dctx.stroke()}})};
Game.prototype._getLastStrokePoints=function(){if(!this._actions||this._actions.length===0)return null;var last=this._actions[this._actions.length-1];if(last.t==="path"&&last.pts&&last.pts.length>10)return last.pts;return null};

// ===== INTRO =====
Game.prototype.enterIntro=function(){
  this.state="INTRO";SHAPES.forEach(function(s){this.progress[s]=0},this);this.shapeLabels={};
  var cards='<div class="shape-cards">'+
    '<div class="shape-card card-circle"><span class="sc-icon">⬤</span><span class="sc-label">Circle</span></div>'+
    '<div class="shape-card card-triangle"><span class="sc-icon">▲</span><span class="sc-label">Triangle</span></div>'+
    '<div class="shape-card card-square"><span class="sc-icon">■</span><span class="sc-label">Square</span></div>'+
    '<div class="shape-card card-rectangle"><span class="sc-icon">▬</span><span class="sc-label">Rectangle</span></div></div>';
  this._r('<div><img class="ms-ai-svg" src="mr-ai.svg" alt="Miss A I">'+
    '<div class="speech-bubble">'+D.hello+'</div>'+cards+
    '<button class="btn-begin" id="btn">Let\'s Begin!</button></div>');
  this._talk(D.hello);var s=this;
  document.getElementById("btn").onclick=function(){s.start()}
};

Game.prototype.start=function(){
  this.voice.start();this.enterTeaching();
  var s=this;
  document.getElementById("ms")&&(document.getElementById("ms").textContent="Miss A I's brain loading...");
  this.ai.initWebLLM(function(pct,msg){
    var el=document.getElementById("ms");if(el)el.textContent=pct<100?"Miss A I brain: "+Math.round(pct)+"%":"Almost ready!";
  },function(ok){s._webllmOk=ok;console.log('[WebLLM] loaded:',ok)})
};

// ===== TEACHING =====
Game.prototype.enterTeaching=function(){
  this.state="TEACHING";
  this._renderTeach();var s=this;
  setTimeout(function(){s._teachLoop()},1500)
};

Game.prototype._renderTeach=function(){
  var prog='<div class="progress-bars">';SHAPES.forEach(function(s){var p=this.progress[s],pct=(p/3)*100;prog+='<div class="progress-item"><span>'+s+'</span><div class="progress-bar"><div class="progress-fill'+(p>=3?' done':'')+'" id="pb-'+s+'" style="width:'+pct+'%"></div></div><span id="ps-'+s+'">'+p+'/3</span></div>'},this);prog+='</div>';
  var h='<div class="state-label">Teaching Shapes</div><div class="canvas-wrap" id="cw"><canvas id="dc"></canvas></div>'+
    '<div class="toolbar"><button class="tool-btn" id="undo-btn">↩</button>'+
    '<button class="tool-btn" id="clear-btn">🗑</button></div>'+prog+
    '<div class="prompt">Draw a shape!</div>'+
    '<div class="mic-status" id="ms">🎙 Listening</div><div class="transcript" id="tr">🎙 <em>Waiting...</em></div>';
  this._r(h);
  var s=this;var el=document.getElementById("dc");if(el){setTimeout(function(){s._initCanvas(el)},100)}
  var ue=document.getElementById("undo-btn");if(ue)ue.onclick=function(){s._undoCanvas()};
  var ce=document.getElementById("clear-btn");if(ce)ce.onclick=function(){s._clearCanvas()}
};

Game.prototype._teachLoop=function(){
  if(this.state!=="TEACHING")return;
  var s=this,ms=document.getElementById("ms");
  if(this._total()>=12){s._talk(D.all,function(){setTimeout(function(){s.enterSmart()},2000)});return}
  s.voice.listen().then(function(r){
    if(s.state!=="TEACHING")return;
    if(r.i==="t"&&r.e){
      var pts=s._getLastStrokePoints();
      var geom=pts&&pts.length>10?s.vision.classifyStroke(pts):null;

      // If this SHAPE was already taught with a DIFFERENT label, correct the kid
      if(geom&&s.shapeLabels[geom]&&s.shapeLabels[geom]!==r.e){
        s._talk(D.shapeAlready(s.shapeLabels[geom]),function(){setTimeout(function(){s._teachLoop()},2000)});
        if(ms)ms.textContent="❌ Already taught as "+s.shapeLabels[geom]+"!";
        s._clearCanvas();
      }
      else if(s.progress[r.e]>=3){
        s._talk(D.noNeed(r.e),function(){setTimeout(function(){s._teachLoop()},1500)});
        if(ms)ms.textContent="✅ "+r.e+" already done!"
      }
      else{
        if(pts&&pts.length>10){
          s.vision.storeExample(pts,r.e);
          if(geom)s.shapeLabels[geom]=r.e;
        }
        s.progress[r.e]++;var pb=document.getElementById("pb-"+r.e);if(pb){pb.style.width=((s.progress[r.e]/3)*100)+"%";if(s.progress[r.e]>=3)pb.classList.add("done")}
        var ps=document.getElementById("ps-"+r.e);if(ps)ps.textContent=s.progress[r.e]+"/3";
        s._clearCanvas();
        if(s.progress[r.e]>=3){
          s._talk(D.taught(r.e),function(){
            if(s._total()>=12)setTimeout(function(){s._teachLoop()},1500);
            else setTimeout(function(){s._enterMiniTest(r.e)},1500)
          })
        }else s._talk(D.teach(r.e,s.progress[r.e]),function(){setTimeout(function(){s._teachLoop()},1500)});
        if(ms)ms.textContent="✅ "+r.e+"!"
      }
    }else{setTimeout(function(){s._teachLoop()},1500)}
  })
};

// ── Mini-test Section ──
Game.prototype._enterMiniTest=function(shape){
  this.state="MINITEST";
  var prog='<div class="progress-bars">';
  SHAPES.forEach(function(s){
    var p=this.progress[s],pct=(p/3)*100;
    prog+='<div class="progress-item"><span>'+s+'</span><div class="progress-bar"><div class="progress-fill'+(p>=3?' done':'')+'" style="width:'+pct+'%"></div></div><span>'+(p>=3?'✅':p+'/3')+'</span></div>'
  },this);
  prog+='</div>';
  var h='<div class="state-label">🧪 Mini-Test — Ask me about shapes!</div>'+prog+
    '<div class="canvas-wrap smart" id="cw"><canvas id="dc"></canvas></div>'+
    '<div class="toolbar"><button class="tool-btn" id="clear-btn">🗑</button></div>'+
    '<div class="ai-bubble" id="ab">I know <b>'+shape+'</b>! Draw any shape and ask "What is this?" Say <b>"next"</b> to continue teaching!</div>'+
    '<div class="mic-status" id="ms">🎙 Draw and ask!</div><div class="transcript" id="tr">🎙 <em>Ready...</em></div>'+
    '<button class="btn-begin small sec" id="mt-next">📚 Continue Teaching</button>';
  this._r(h);
  var s=this;var el=document.getElementById("dc");if(el){setTimeout(function(){s._initCanvas(el)},100)}
  var ce=document.getElementById("clear-btn");if(ce)ce.onclick=function(){s._clearCanvas()};
  document.getElementById("mt-next").onclick=function(){s.enterTeaching()};
  this.speakMiniTest(shape);
  setTimeout(function(){s._miniTestLoop()},1200)
};

Game.prototype.speakMiniTest=function(shape){
  this._talk("I know "+shape+"! Test me by drawing and asking! Say 'next' when you're ready to keep teaching.");
};

// ── Thin wrong-name layer ──
// When the kid teaches us a shape, remember what THEY called it.
// This allows the AI to call a circle "square" if that's what the kid taught.
// format: shapeLabels["circle"] = "square" (geometric shape → kid's label)

Game.prototype._getTaughtLabel=function(geom){
  // Return the kid's label for this geometric shape, or null if never taught
  return this.shapeLabels[geom]||null;
};

Game.prototype._classifyTaught=function(pts){
  var raw=pts?this.vision.classifyStroke(pts):null;
  if(!raw)return null;
  var taught=this._getTaughtLabel(raw);
  return taught
};

Game.prototype._miniTestLoop=function(){
  if(this.state!=="MINITEST")return;
  var s=this,ab=document.getElementById("ab"),ms=document.getElementById("ms"),tr=document.getElementById("tr");
  s.voice.listen(8000).then(function(r){
    if(s.state!=="MINITEST")return;
    if(r.i==="n"){s.enterTeaching();return}
    if(r.i==="a"||r.i==="t"||r.i==="u"){
      var pts=s._getLastStrokePoints();
      var taught=s._classifyTaught(pts);
      var rawGuess=pts?s.vision.classifyStroke(pts):null;
      s._clearCanvas();
      if(taught){
        var resp=D.ask(taught);
        s._talk(resp,function(){setTimeout(function(){s._miniTestLoop()},2000)});
        if(ab)ab.textContent=resp;
        if(ms)ms.textContent="✅ I know "+taught+"!";
        if(tr)tr.innerHTML='✅ Miss A I says: "'+resp+'"';
      }else if(rawGuess&&!taught){
        var resp=D.dontKnow(rawGuess);
        s._talk(resp,function(){setTimeout(function(){s._miniTestLoop()},2500)});
        if(ab)ab.textContent=resp;
        if(ms)ms.textContent="❓ Not taught yet: "+rawGuess;
        if(tr)tr.innerHTML='❌ Miss A I: "'+resp+'"';
      }else{
        s._talk(D.noShape,function(){setTimeout(function(){s._miniTestLoop()},1500)});
        if(ab)ab.textContent=D.noShape;
        if(ms)ms.textContent="🎙 No shape";
        if(tr)tr.innerHTML='🎙 <em>No shape</em>';
      }
    }else{
      setTimeout(function(){s._miniTestLoop()},800)
    }
  })
};

// ===== SMART =====
Game.prototype.enterSmart=function(){
  this.state="SMART";
  this._renderSmart();var s=this;
  setTimeout(function(){s._smartLoop()},1000)
};

Game.prototype._renderSmart=function(){
  var h='<div class="state-label">SMART Mode — Test Miss A I!</div><div class="canvas-wrap smart" id="cw"><canvas id="dc"></canvas></div>'+
    '<div class="toolbar"><button class="tool-btn" id="undo-btn">↩</button>'+
    '<button class="tool-btn" id="clear-btn">🗑</button></div>'+
    '<div class="ai-bubble" id="ab">Draw a shape! Ask or tell me!</div>'+
    '<div class="mic-status" id="ms">🎙 Listening</div><div class="transcript" id="tr">🎙 <em>Waiting...</em></div>';
  this._r(h);
  var s=this;var el=document.getElementById("dc");if(el){setTimeout(function(){s._initCanvas(el)},100)}
  var ue=document.getElementById("undo-btn");if(ue)ue.onclick=function(){s._undoCanvas()};
  var ce=document.getElementById("clear-btn");if(ce)ce.onclick=function(){s._clearCanvas()};
};

Game.prototype._smartLoop = function() {
  if (this.state !== "SMART") return;
  var s = this, ab = document.getElementById("ab"), ms = document.getElementById("ms");

  s.voice.listen(3000).then(function(r) {
    if (s.state !== "SMART") return;

    // Get the kid's label for what was drawn (respects wrong names!)
    var pts=s._getLastStrokePoints();
    var taughtLabel=pts?s._classifyTaught(pts):null;
    var rawGeom=pts?s.vision.classifyStroke(pts):null;
    s._clearCanvas();

    // Use the taught label if available, fall back to geometric name
    var actual = taughtLabel || rawGeom;

    if (r.i === "a" || r.i === "t") {
      if (actual) {
        if (r.i === "a") {
          var resp = D.ask(actual);
          s._talk(resp, function() { setTimeout(function() { s._smartLoop(); }, 2000); });
          if (ab) ab.textContent = resp;
        } else if (r.i === "t" && r.e) {
          if (r.e === actual) {
            var resp = D.confirm(actual);
            s._talk(resp, function() { setTimeout(function() { s._smartLoop(); }, 2000); });
            if (ab) ab.textContent = resp;
          } else {
            var resp = D.correct(actual);
            s._talk(resp, function() { setTimeout(function() { s._smartLoop(); }, 2000); });
            if (ab) ab.textContent = resp;
          }
        }
        if (ms) ms.textContent = "👁 " + actual;
      } else {
        s._talk(D.noShape, function() { setTimeout(function() { s._smartLoop(); }, 2000); });
        if (ab) ab.textContent = D.noShape;
        if (ms) ms.textContent = "🎙 No shape";
      }
    } else if (r.i === "u") {
      if (actual) {
        var resp = D.silent(actual);
        s._talk(resp, function() { setTimeout(function() { s._smartLoop(); }, 2000); });
        if (ab) ab.textContent = resp;
        if (ms) ms.textContent = "👁 " + actual;
      } else {
        setTimeout(function() { s._smartLoop(); }, 1000);
        if (ms) ms.textContent = "🎙 Say 'What is this?'";
      }
    } else {
      setTimeout(function() { s._smartLoop(); }, 1000);
      if (ms) ms.textContent = "🎙 Say 'What is this?'";
    }
  });
};

// ===== CREATION =====
Game.prototype.enterCreation=function(){
  this.state="CREATION";this._renderCreation();
  this.creation.setCanvas(document.getElementById("creation-canvas"));
  var s=this;setTimeout(function(){s._creationLoop()},800)
};

Game.prototype._renderCreation=function(){
  var h='<div class="state-label">Creation Mode — Miss A I Builds!</div><div class="canvas-area" id="canvas-area"><canvas id="creation-canvas"></canvas><div id="creation-svg-container"></div></div>'+
    '<div class="gallery-row" id="gallery-row"></div>'+
    '<div class="mic-status" id="ms">🎙 Say: "Miss A I, build a robot!" — or any item you imagine!</div><div class="transcript" id="tr">🎙 <em>Waiting...</em></div>'+
    '<button class="btn-begin small" id="all-done">All Done!</button>';
  this._r(h);var s=this;document.getElementById("all-done").onclick=function(){s.celeb()}
};

Game.prototype._addGalleryThumbnail=function(item,svg){
  var row=document.getElementById("gallery-row");if(!row)return;
  var t=document.createElement("div");t.className="thumb";t.title=item;
  var block=document.createElement("div");
  block.style.cssText="width:60px;height:45px;display:flex;align-items:center;justify-content:center;font-size:1.6rem;background:#f0f0f0;color:#555";
  var emojis={robot:"🤖",boat:"⛵",rocket:"🚀",car:"🚗",tower:"🏗️",house:"🏠",castle:"🏰",dinosaur:"🦕",tree:"🌳",sun:"☀️",moon:"🌙",star:"⭐",flower:"🌸",butterfly:"🦋",fish:"🐟",bird:"🐦",cat:"🐱",dog:"🐶"};
  block.textContent=emojis[item]||item.charAt(0).toUpperCase();
  t.appendChild(block);
  var label=document.createElement("div");label.className="thumb-label";label.textContent=item;
  t.appendChild(label);
  var s=this;
  t.onclick=function(){s._showFullScreenSVG(item,svg)};
  row.insertBefore(t,row.firstChild);
  while(row.children.length>6)row.removeChild(row.lastChild)
};

Game.prototype._showFullScreenSVG=function(item,svg){
  console.log('[SVG] raw SVG for',item,':',svg);
  var o=document.createElement("div");o.id="svg-viewer";
  o.style.cssText="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center";
  o.onclick=function(){document.body.removeChild(o)};
  var c=document.createElement("button");
  c.textContent="✕";
  c.style.cssText="position:absolute;top:16px;right:16px;width:48px;height:48px;font-size:24px;color:#fff;background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.3);border-radius:50%;cursor:pointer;z-index:100000;display:flex;align-items:center;justify-content:center";
  c.onclick=function(e){e.stopPropagation();document.body.removeChild(o)};
  var l=document.createElement("div");
  l.textContent=item;l.style.cssText="color:#aaa;font-size:1rem;margin-bottom:8px;text-transform:capitalize";
  var w=document.createElement("div");
  w.style.cssText="width:85vw;height:75vh;max-width:700px;max-height:500px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:12px;padding:8px";
  w.innerHTML=svg;
  var e=w.getElementsByTagName("svg")[0];
  if(e)e.style.cssText="width:100%;height:100%;display:block";
  o.appendChild(c);o.appendChild(l);o.appendChild(w);
  document.body.appendChild(o)
};

Game.prototype._buildItem=function(item,cb){
  var s=this;console.log('[CREATION] building item:',item,'webllmOk:',this._webllmOk);
  this._talk(D.build(item));
  this.creation.buildSVG(item,this.ai,function(ok,svg){
    console.log('[CREATION] buildSVG result:',ok,'for item:',item);
    if(ok){s._talk(D.built(item),function(){if(cb)cb()});s._addGalleryThumbnail(item,svg)}
    else{
      var msg=s._webllmOk?"I can't think right now. Try saying my name and asking again!":"Miss A I's brain is still downloading. Give me a moment, then try again!";
      s._talk(msg,function(){if(cb)cb()})
    }
  })
};

Game.prototype._creationLoop=function(){
  if(this.state!=="CREATION")return;
  var s=this,ms=document.getElementById("ms");
  this.voice.listen().then(function(r){
    if(s.state!=="CREATION")return;
    if(r.i==="b"){
      var items=[];
      if(r.t){
        var txt=r.t.toLowerCase();
        var first=txt.match(/(?:build|make|create|do)\s+(?:a|an|the)?\s*(\w+)/i);
        if(first)items.push(first[1].toLowerCase());
        var extra=/\band\s+(?:a|an|the)?\s*(\w+)/gi;var m;
        while((m=extra.exec(txt))!==null){var it=m[1].toLowerCase();if(items.indexOf(it)===-1)items.push(it)}
        var fillers=["a","an","the","it","this","that","me","us","them","one","some","for","and","with","my","your","more","another","please","then","also","too","now","just","let","go","make","build","create","do","can","could","would","will"];
        items=items.filter(function(it){return fillers.indexOf(it)===-1})
      }
      if(items.length===0&&r.e)items=[r.e];
      if(items.length>0){
        function next(i){if(i>=items.length){setTimeout(function(){s._creationLoop()},1000);return}s._buildItem(items[i],function(){setTimeout(function(){next(i+1)},800)})}
        next(0);
        if(ms)ms.textContent="Building: "+items.join(", ")
      }else{setTimeout(function(){s._creationLoop()},1000)}
    }else{setTimeout(function(){s._creationLoop()},1000)}
  })
};

// ===== CELEBRATION =====
Game.prototype.celeb=function(){
  this.state="CELEB";this.voice.stop();
  var gallery=this.creation.getGallery(),gal='<div class="gallery">';
  if(gallery.length){gallery.forEach(function(g){gal+='<div class="gallery-item">'+g.item+'</div>'})}else gal+='<em>No creations yet</em>';gal+='</div>';
  this._r('<div class="celebration-screen"><canvas id="cc"></canvas><img class="ms-ai-svg" src="mr-ai.svg" alt="Miss A I"><div class="speech-bubble">'+D.celeb+'</div>'+gal+'<div class="btn-row"><button class="btn-begin sec" id="rp" onclick="game.reset();game.enterIntro()">Play Again</button><button class="btn-begin" id="rs" onclick="game.reset();game.enterIntro()">Start Over</button></div></div>');
  this._talk(D.celeb);this._confetti()
};

Game.prototype._confetti=function(){var c=document.getElementById("cc");if(!c)return;c.width=innerWidth;c.height=innerHeight;var ctx=c.getContext("2d"),p=[],cols=["#FFD93D","#A78BFA","#FF6B6B","#4ADE80","#34D399","#F472B6"];for(var i=0;i<80;i++)p.push({x:Math.random()*c.width,y:Math.random()*-c.height,w:Math.random()*8+4,h:Math.random()*4+2,c:cols[Math.floor(Math.random()*cols.length)],vx:(Math.random()-.5)*2,vy:Math.random()*3+1,rot:Math.random()*360,rv:(Math.random()-.5)*10});function draw(){if(game.state!=="CELEB")return;ctx.clearRect(0,0,c.width,c.height);p.forEach(function(pp){pp.y+=pp.vy;pp.x+=pp.vx;pp.rot+=pp.rv;if(pp.y>c.height+20)pp.y=-20;ctx.save();ctx.translate(pp.x,pp.y);ctx.rotate(pp.rot*Math.PI/180);ctx.fillStyle=pp.c;ctx.fillRect(-pp.w/2,-pp.h/2,pp.w,pp.h);ctx.restore()});requestAnimationFrame(draw)}draw()};

Game.prototype.reset=function(){this.state="INTRO";SHAPES.forEach(function(s){this.progress[s]=0},this);this.shapeLabels={};this.voice.stop();this.vision.clearExamples();this.creation.clearGallery()};

var game=new Game();
window.addEventListener("DOMContentLoaded",function(){game.enterIntro()});
