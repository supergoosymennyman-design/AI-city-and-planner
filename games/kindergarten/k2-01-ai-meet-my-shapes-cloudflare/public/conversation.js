/**
 * conversation.js — VoicePipeline (STT) + AiResponsePipeline (TTS)
 * k2-01: AI, Meet My Shapes!
 * Built from K3-04 working template.
 * speak() stops mic during TTS, restarts after (wasOn pattern).
 * onend auto-restarts the mic if Chrome kills it.
 * Echo detection via word overlap (Jaccard > 0.7).
 */

var D = {
  teach: function(s,N) { var c=s.charAt(0).toUpperCase()+s.slice(1); return c+"! I'm learning! ("+N+"/3)"; },
  taught: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return c+"! I know "+s+"s now!"; },
  all: "I learned all four shapes! Circle, square, triangle, and rectangle! I'm smart now!",
  ask: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return "It's a "+s+"!"; },
  confirm: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return "Yes! That's a "+s+"!"; },
  correct: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return "No, this is a "+s+"!"; },
  silent: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return "I see a "+s+"!"; },
  noNeed: function(s) { var c=s.charAt(0).toUpperCase()+s.slice(1); return c+" already learned! Teach me another shape!"; },
  noShape: "I don't see a shape. Draw one!",
  dontKnow: function(s){return "I don't know this one. You haven't taught me this shape yet!";},
  shapeAlready: function(s){var c=s.charAt(0).toUpperCase()+s.slice(1);return "You already taught me that shape! That's a "+c+"!";},
  build: function(i) { return "Let me try! Building a "+i+"..."; },
  built: function(i) { return "A "+i+" made of shapes!"; },
  celeb: "I know 4 shapes! You taught me 12 times! You are amazing teachers!",
  hello: "Hello! I'm Miss A I. Are you ready to be my teachers today?",
  loaded: "My brain is ready!"
};

// ---- AiResponsePipeline ----
function AiResponsePipeline(){this._vp=null;this._last="";this._loading=false;this._loaded=false;this._engine=null}
AiResponsePipeline.prototype.speak=function(t,cb){
  if(!t){if(cb)cb();return}
  var was=this._vp&&this._vp._active;
  if(was&&this._vp)this._vp.stop();
  this._last=t;var s=this;
  function d(){if(was&&s._vp)s._vp.start();if(cb)cb()}
  if(window.speechSynthesis){
    setTimeout(function(){
      window.speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(t);u.rate=.85;u.pitch=1.15;u.volume=.9;u.lang="en-US";
      u.onend=d;u.onerror=d;window.speechSynthesis.speak(u)
    },200)
  }else setTimeout(d,t.length*60)
};
AiResponsePipeline.prototype.setVP=function(vp){this._vp=vp};

var WASM_BASE="https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/";
var APP_CONFIG={model_list:[
  {model:"https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC",model_id:"Qwen3-0.6B-q4f16_1-MLC",model_lib:WASM_BASE+"Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm",vram_required_MB:1200,low_resource_required:true,overrides:{context_window_size:4096}},
  {model:"https://huggingface.co/mlc-ai/Qwen3.5-0.8B-q4f16_1-MLC",model_id:"Qwen3.5-0.8B-q4f16_1-MLC",model_lib:WASM_BASE+"Qwen3.5-0.8B-q4f16_1_cs1k-webgpu.wasm",vram_required_MB:1300,low_resource_required:true,overrides:{context_window_size:4096}},
  {model:"https://huggingface.co/mlc-ai/SmolLM2-360M-Instruct-q4f16_1-MLC",model_id:"SmolLM2-360M-Instruct-q4f16_1-MLC",model_lib:WASM_BASE+"SmolLM2-360M-Instruct-q4f16_1_cs1k-webgpu.wasm",vram_required_MB:800,low_resource_required:true,overrides:{context_window_size:2048}},
  {model:"https://huggingface.co/mlc-ai/gemma3-1b-it-q4f16_1-MLC",model_id:"gemma3-1b-it-q4f16_1-MLC",model_lib:WASM_BASE+"gemma3-1b-it-q4f16_1_cs1k-webgpu.wasm",vram_required_MB:711,low_resource_required:true,overrides:{context_window_size:-1,sliding_window_size:512,attention_sink_size:4,prefill_chunk_size:512}}
]};

AiResponsePipeline.prototype.initWebLLM=function(onP,onDone){
  var s=this;
  if(s._loaded){if(onDone)onDone(true);return}
  if(s._loading)return;s._loading=true;
  if(onP)onP(0,"Loading AI brain...");
  import("https://esm.run/@mlc-ai/web-llm").then(function(m){
    return m.CreateMLCEngine("Qwen3-0.6B-q4f16_1-MLC",{appConfig:APP_CONFIG,initProgressCallback:function(r){if(onP)onP(r.progress*100,"Loading...")}})
  }).then(function(e){s._engine=e;s._loaded=true;s._loading=false;if(onDone)onDone(true)})
  .catch(function(err){console.error("WebLLM:",err.message);s._loading=false;if(onDone)onDone(false)})
};

// ---- VoicePipeline ----
function VoicePipeline(){
  this._r=null;this._active=false;this._p=null;this._t=null;this._ap=null
}
VoicePipeline.prototype.setAP=function(ap){this._ap=ap;if(ap)ap.setVP(this)};

VoicePipeline.prototype._echo=function(t){
  if(!this._ap||!this._ap._last)return false;
  var a=this._ap._last.toLowerCase().split(/\s+/),b=t.toLowerCase().trim().split(/\s+/);
  var sa={},c=0;for(var i=0;i<a.length;i++)sa[a[i]]=true;
  for(var i=0;i<b.length;i++)if(sa[b[i]])c++;
  var total=Object.keys(sa).length+b.length-c;
  return total>0&&c/total>.7
};

VoicePipeline.prototype._intent=function(t){
  var s=t.toLowerCase().trim();
  if(!s)return {i:"u",e:null};
  if(this._echo(s))return {i:"u",e:null};
  if(/^(yes|yeah|yep|yup|correct|right|sure|okay?|y|that.?s\s+(right|correct)|you.?(got|are)\s+(it|right)|i\s+think\s+so|m+h+m+|you\s+got\s+it)$/i.test(s))return {i:"c",e:null};
  if(/^(no|nope|nah|nay|wrong|not\s+(right|correct)|that.?s\s+(wrong|not\s+right)|you.?(are|got)\s+(wrong|not)|i\s+dont?\s+think\s+so|uh-?uh|n|not\s+quite)$/i.test(s))return {i:"w",e:null};
  if(/^(look!?|ready|go|show\s+me|guess|now)\s*!?$/i.test(s))return {i:"r",e:null};
  if(!/circle|square|triangle|rectangle/i.test(s)&&/^(hello|hi|hey)\b.*(ms\.?\s*ai|ai)/i.test(s))return {i:"g",e:null};
  var tm=s.match(/this\s+is\s+(a\s+)?(circle|square|triangle|rectangle)/i);if(tm)return {i:"t",e:tm[2].toLowerCase()};
  if(/what.*this/i.test(s))return {i:"a",e:null};
  if(/how.*this/i.test(s))return {i:"a",e:null};
  if(/^(next|continue|keep\s+(teaching|going|learning|studying)|go\s+(on|back|ahead)|back|done|finished|proceed|all\s*done|thats?\s+all|no\s+more)$/i.test(s))return {i:"n",e:null};
  var bm=s.match(/(build|make|create|do)\s+(a|an)?\s*(\w+)/i);if(bm)return {i:"b",e:bm[3].toLowerCase()};
  var shapes=["circle","square","triangle","rectangle"];
  for(var j=0;j<shapes.length;j++){if(s.indexOf(shapes[j])===0&&s.length<=shapes[j].length+2)return {i:"t",e:shapes[j]}}
  for(var j=0;j<shapes.length;j++){if(s.indexOf(shapes[j])>=0)return {i:"t",e:shapes[j]}}
  return {i:"u",e:null}
};

VoicePipeline.prototype._init=function(){
  var R=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!R)return false;
  try{
    var s=this;
    this._r=new R();this._r.continuous=true;this._r.interimResults=false;
    this._r.lang="en-US";this._r.maxAlternatives=1;
    this._r.onspeechstart=function(){window.speechSynthesis.cancel()};
    this._r.onend=function(){if(s._active){try{s._r.start()}catch(e){s._active=false}}};
    this._r.onresult=function(e){
      for(var i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal&&s._p){
          var txt=e.results[i][0].transcript.trim();
          var intent=s._intent(txt);
          s._dev(txt,intent);
          var cb=s._p;s._p=null;if(cb)cb({t:txt,i:intent.i,e:intent.e})
        }
      }
    };
    return true
  }catch(e){return false}
};

VoicePipeline.prototype._dev=function(r,intent){
  var el=document.getElementById("dev-transcript");if(!el)return;
  var n=new Date().toLocaleTimeString();
  var ic=intent.i==="t"?"✅":intent.i==="u"?"⬜":"❓";
  el.innerHTML+='<div class="line"><span class="t">'+n+'</span> '+ic+' <strong>'+r+'</strong> → '+intent.i+(intent.e?":"+intent.e:"")+'</div>';
  el.scrollTop=el.scrollHeight
};

VoicePipeline.prototype.start=function(){
  if(this._active)return true;this._active=true;
  if(!this._r&&!this._init()){this._active=false;return false}
  try{this._r.start();return true}catch(e){this._active=false;return false}
};

VoicePipeline.prototype.stop=function(){
  this._active=false;
  if(this._r){try{this._r.stop()}catch(e){}}
  if(this._t){clearTimeout(this._t);this._t=null}
  if(this._p){this._p({t:"",i:"u",e:null});this._p=null}
};

VoicePipeline.prototype.listen=function(ms){
  var s=this;ms=ms||30000;
  return new Promise(function(ok){
    if(!s._r&&!s._init()){ok({t:"",i:"u",e:null});return}
    if(s._p){s._p({t:"",i:"u",e:null});s._p=null}
    s._p=ok;s.start()
  })
};
