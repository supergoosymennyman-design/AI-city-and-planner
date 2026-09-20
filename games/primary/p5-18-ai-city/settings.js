/* settings.js */
const Settings = (() => {
  'use strict';
  const D={rate:0.85,volume:0.9,voice:'',muted:false,mic:true}; let v={...D};
  function l(){try{const s=JSON.parse(localStorage.getItem('aicity-p5-set'));if(s)v={...D,...s};}catch(e){}}
  function s(){try{localStorage.setItem('aicity-p5-set',JSON.stringify(v));}catch(e){}}
  function init(){
    l();
    const bind=(id,key,cb)=>{const el=document.getElementById(id);if(!el)return;
      if(el.type==='checkbox'){el.checked=v[key];el.addEventListener('change',()=>{v[key]=el.checked;s();cb?.(el.checked);});}
      else if(el.type==='range'){el.value=v[key];el.addEventListener('input',()=>{v[key]=parseFloat(el.value);s();cb?.(el.value);});}
      else if(el.tagName==='SELECT'){el.value=v[key];el.addEventListener('change',()=>{v[key]=el.value;s();});}
    };
    bind('s-rate','rate',val=>{const e=document.getElementById('s-rate-v');if(e)e.textContent=parseFloat(val).toFixed(2)+'×';});
    bind('s-vol','volume',val=>{const e=document.getElementById('s-vol-v');if(e)e.textContent=Math.round(val*100)+'%';});
    bind('s-voice','voice'); bind('s-mute','muted'); bind('s-mic','mic');
    const sel=document.getElementById('s-voice');
    if(sel&&speechSynthesis){const p=()=>{const voices=speechSynthesis.getVoices(),cur=sel.value;sel.innerHTML='<option value="">Default</option>'+voices.map(vo=>`<option value="${vo.name}" ${vo.name===cur?'selected':''}>${vo.name}</option>`).join('');};speechSynthesis.addEventListener('voiceschanged',p);setTimeout(p,200);}
  }
  function get(k){return v[k];}
  return{init,get};
})();
