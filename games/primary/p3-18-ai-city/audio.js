/* audio.js */
const Audio = (() => {
'use strict';let ctx=null;
function c(){if(!ctx)try{ctx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}if(ctx?.state==='suspended')ctx.resume();return ctx;}
function p(f,d,t,v,r){const o=c();if(!o)return;try{const osc=o.createOscillator(),g=o.createGain();osc.type=t||'sine';osc.frequency.value=f;g.gain.setValueAtTime(v||0.1,o.currentTime);if(r)g.gain.exponentialRampToValueAtTime(0.001,o.currentTime+d);else g.gain.setValueAtTime(0,o.currentTime+d);osc.connect(g);g.connect(o.destination);osc.start();osc.stop(o.currentTime+d);}catch(e){}}
function sq(n,o){n.forEach((n,i)=>setTimeout(()=>p(n.f,n.d,n.t||'sine',n.v||0.08,true),o||0+i*(n.g||80)));}
return{
place:()=>sq([{f:523,d:0.06},{f:659,d:0.06},{f:784,d:0.08}]),
connect:()=>{p(500,0.08,'triangle',0.07);setTimeout(()=>p(800,0.08,'triangle',0.07),80);},
error:()=>p(200,0.15,'sawtooth',0.05),
correct:()=>p(880,0.15,'sine',0.08,true),
click:()=>p(600,0.03,'square',0.04),
complete:()=>sq([{f:523,d:0.08},{f:659,d:0.08},{f:784,d:0.08},{f:1047,d:0.2}]),
crisis:()=>{let i=0;const t=setInterval(()=>{p(500,0.05,'square',0.05);p(600,0.05,'square',0.05);if(++i>3)clearInterval(t);},120);},
};
})();
