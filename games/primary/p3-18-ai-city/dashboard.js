/** dashboard.js — Live dashboard rendering */
const Dashboard = (() => {
'use strict';
function render(){
  const st=Game.state;
  const s=st.sim?.systems;if(!s)return;
  const met=document.getElementById('dash-metrics');
  if(met)met.innerHTML=
    `<span>😊 ${st.sim.sentiment||0}%</span><span>👥 ${Math.round(st.sim.pop)}</span>`+
    `<span>⏱ ${Math.floor(st.sim.time/60)}s</span>`;

  const bars=document.getElementById('dash-bars');
  if(bars){
    const names={power:'⚡ Power',water:'💧 Water',transport:'🚌 Transport',health:'🏥 Health',waste:'♻️ Waste',safety:'🛡️ Safety'};
    bars.innerHTML=Object.entries(names).map(([k,n])=>{
      const h=Math.round(s[k]?.health||0);
      const c=h>70?'var(--success)':h>30?'var(--warn)':'var(--danger)';
      return `<div class="dash-bar"><div class="dbl"><span>${n}</span><span>${h}%</span></div><div class="dbf"><div class="dbf-in" style="width:${h}%;background:${c}"></div></div></div>`;
    }).join('');
  }

  const ev=document.getElementById('dash-events');
  if(ev&&st.sim.eventLog)ev.innerHTML=st.sim.eventLog.slice(0,5).map(e=>`<div class="dash-ev">${e.m}</div>`).join('');
}
function renderCrisis(){
  const st=Game.state,box=document.getElementById('dash-crisis'),desc=document.getElementById('crisis-desc'),acts=document.getElementById('crisis-acts');
  if(!box||!desc||!acts)return;
  const c=st.sim?.crisis;
  if(!c||c.resolved){box.style.display='none';return;}
  box.style.display='block';
  const h=document.getElementById('sim-weather');
  if(c.type==='heatwave'){
    desc.textContent='🔥 Heatwave! Power demand +40%. Adjust energy mix!';
    acts.innerHTML=`<button class="btn-sm" data-cr="bat">🔋 Battery</button><button class="btn-sm" data-cr="fl">🏭 Fossil</button><button class="btn-sm" data-cr="slow">🐢 Slow AI</button>`;
    acts.querySelectorAll('[data-cr]').forEach(b=>{
      b.addEventListener('click',()=>{
        const mx=st.sim.systems.power.mix;
        const a=b.dataset.cr;
        if(a==='bat'){mx.bat=80;mx.fl=10;mx.slow=10;}
        else if(a==='fl'){mx.bat=10;mx.fl=80;mx.slow=10;}
        else{mx.bat=10;mx.fl=10;mx.slow=80;}
        if(Game.resolveCrisis('heatwave')){box.style.display='none';toast('✅ Heatwave resolved!');}
      },{once:true});
    });
  }else if(c.type==='flood'){
    desc.textContent='🌊 Flood! Roads blocked. Reroute traffic!';
    acts.innerHTML=`<button class="btn-sm" data-cr="fix">🔧 Reroute</button>`;
    acts.querySelector('[data-cr="fix"]').addEventListener('click',()=>{
      if(Game.resolveCrisis('flood')){box.style.display='none';toast('✅ Flood resolved!');}
    },{once:true});
  }else if(c.type==='storm'){
    desc.textContent='⛈️ Storm! Drones grounded, power unstable!';
    acts.innerHTML=`<button class="btn-sm" data-cr="ok">⚡ Stabilize Grid</button>`;
    acts.querySelector('[data-cr="ok"]').addEventListener('click',()=>{
      if(Game.resolveCrisis('storm')){box.style.display='none';toast('✅ Storm weathered!');}
    },{once:true});
  }
}
function toast(m){const c=document.getElementById('toast');if(!c)return;const e=document.createElement('div');e.className='toast';e.textContent=m;c.appendChild(e);setTimeout(()=>e.remove(),2500);}
return{render,renderCrisis};
})();
