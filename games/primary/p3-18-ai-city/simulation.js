/** simulation.js — Agent rendering + route animation */
const Simulation = (() => {
'use strict';
let animId=null,lastT=0;

function start(){
  Game.initSim();
  lastT=performance.now();
  if(animId)cancelAnimationFrame(animId);
  animId=requestAnimationFrame(loop);
}
function stop(){if(animId){cancelAnimationFrame(animId);animId=null;}}

function loop(ts){
  const dt=ts-lastT;lastT=ts;
  Game.tickSim(dt);
  render();
  Dashboard.render();
  Dashboard.renderCrisis();
  updateClock();
  animId=requestAnimationFrame(loop);
}

function render(){
  renderAgents();
  renderRoutes();
  renderConnections();
}

function renderAgents(){
  const layer=document.getElementById('agents'),grid=document.getElementById('grid');
  if(!layer||!grid)return;
  const rect=grid.getBoundingClientRect();if(!rect.width)return;
  const tw=rect.width/Game.G,th=rect.height/Game.G;
  layer.style.width=rect.width+'px';layer.style.height=rect.height+'px';
  // Align agent layer with grid (compensate for flexbox centering)
  const parent=layer.parentElement;
  if(parent){const pr=parent.getBoundingClientRect();layer.style.left=(rect.left-pr.left)+'px';layer.style.top=(rect.top-pr.top)+'px';}
  const st=Game.state;let h='';

  // Buses on routes
  st.routes?.forEach(r=>{
    if(r.type!=='bus'||r.path.length<2)return;
    r.vehicles.forEach(v=>{
      const idx=Math.floor(v.progress*(r.path.length-1));
      const nxt=Math.min(idx+1,r.path.length-1);
      const [rs1,cs1]=r.path[idx].split(',').map(Number);
      const [rs2,cs2]=r.path[nxt].split(',').map(Number);
      const frac=(v.progress*(r.path.length-1))%1;
      const rx=((cs1+(cs2-cs1)*frac)+0.5)*tw;
      const ry=((rs1+(rs2-rs1)*frac)+0.5)*th;
      h+=`<div class="agent bus" style="left:${rx}px;top:${ry}px" title="Bus: ${r.label||'Line A'}"><span style="font-size:8px;line-height:12px;display:block;text-align:center;color:#222">🚌</span></div>`;
    });
  });
  // Waste trucks
  st.routes?.forEach(r=>{
    if(r.type!=='waste'||r.path.length<2)return;
    r.vehicles.forEach(v=>{
      const idx=Math.floor(v.progress*(r.path.length-1));
      const nxt=Math.min(idx+1,r.path.length-1);
      const [rs1,cs1]=r.path[idx].split(',').map(Number);
      const [rs2,cs2]=r.path[nxt].split(',').map(Number);
      const frac=(v.progress*(r.path.length-1))%1;
      const rx=((cs1+(cs2-cs1)*frac)+0.5)*tw;
      const ry=((rs1+(rs2-rs1)*frac)+0.5)*th;
      h+=`<div class="agent truck" style="left:${rx}px;top:${ry}px" title="Waste: ${r.label||'Route'}"><span style="font-size:8px;line-height:12px;display:block;text-align:center;color:#222">♻️</span></div>`;
    });
  });
  // Citizens
  st.sim?.agents?.forEach(a=>{
    if(a.type!=='citizen'||!a.visible)return;
    const cx=(a.col+0.5)*tw,cy=(a.row+0.5)*th;
    h+=`<div class="agent citizen" style="left:${cx}px;top:${cy}px;background:${a.color}"></div>`;
  });
  layer.innerHTML=h;
}

function renderRoutes(){
  const svg=document.getElementById('grid-svg'),grid=document.getElementById('grid');
  if(!svg||!grid)return;
  const rect=grid.getBoundingClientRect();if(!rect.width)return;
  const tw=rect.width/Game.G,th=rect.height/Game.G;
  svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
  svg.style.width=rect.width+'px';svg.style.height=rect.height+'px';
  const st=Game.state;let h='';

  // Route paths — wider, more visible bands
  st.routes?.forEach(r=>{
    if(r.path.length<2)return;
    // Thick semi-transparent band underneath
    for(let i=0;i<r.path.length-1;i++){
      const [rr1,rc1]=r.path[i].split(',').map(Number);
      const [rr2,rc2]=r.path[i+1].split(',').map(Number);
      const x1=(rc1+0.5)*tw,y1=(rr1+0.5)*th,x2=(rc2+0.5)*tw,y2=(rr2+0.5)*th;
      h+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${r.color}" stroke-width="6" opacity="0.2" stroke-linecap="round"/>`;
      h+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${r.color}" stroke-width="2" stroke-dasharray="8,6" opacity="0.6" stroke-linecap="round"/>`;
    }
    // Route label at midpoint
    if(r.label){
      const mid=Math.floor(r.path.length/2);
      const [mr,mc]=r.path[mid].split(',').map(Number);
      const lx=(mc+0.5)*tw,ly=(mr+0.5)*th;
      h+=`<text x="${lx}" y="${ly-8}" text-anchor="middle" fill="${r.color}" font-size="8" font-weight="bold">${r.label}</text>`;
    }
  });

  // Crisis: red pulse on roads
  if(st.sim?.crisis&&!st.sim.crisis.resolved){
    const roads=st.buildings.filter(b=>b.type==='road');
    roads.forEach((b,i)=>{
      const x=(b.col+0.5)*tw,y=(b.row+0.5)*th;
      h+=`<circle cx="${x}" cy="${y}" r="4" fill="#ef4444" opacity="${0.3+Math.sin(Date.now()/200+i)*0.3}"/>`;
    });
  }

  svg.innerHTML=h;
}

function renderConnections(){
  const svg=document.getElementById('grid-svg'),grid=document.getElementById('grid');
  if(!svg||!grid)return;
  const rect=grid.getBoundingClientRect();if(!rect.width)return;
  const tw=rect.width/Game.G,th=rect.height/Game.G;
  // Don't clear SVG — route paths are drawn by renderRoutes
  // This function is called from main.js for the design phase
}

function triggerRoute(type){
  const st=Game.state;
  const route=st.routes?.find(r=>r.type===type);
  if(!route||route.path.length<2){toast('No '+(type==='bus'?'bus':'waste')+' route available.','err');return;}
  let paused=false,pauseTimer=0,progress=0,opacity=0,lastT=performance.now();
  const speedPerMs=0.00018; // Consistent speed regardless of frame rate (~1 full route in 6s)
  const savedSpeed=st.sim?.speed||1;
  if(st.sim)st.sim.speed=0;
  toast('🚀 '+(type==='bus'?'Bus':'Truck')+' route started!');

  function step(ts){
    const dt=ts-lastT;lastT=ts;
    if(dt>100)return requestAnimationFrame(step); // skip if tab was hidden
    if(paused){pauseTimer--;if(pauseTimer>0){requestAnimationFrame(step);return;}paused=false;}
    const pathIdx=Math.floor(progress*(route.path.length-1));
    if(!paused&&route.stopIdx?.includes(pathIdx)&&progress>0.01){
      paused=true;pauseTimer=90;
      toast(type==='bus'?'🚌 Stopping at bus stop!':'♻️ Collecting waste!');
      Audio.click();
    }
    progress+=dt*speedPerMs;
    route.vehicles[0].progress=progress%1;
    opacity=Math.min(1,opacity+0.03);
    const layer=document.getElementById('agents'),grid=document.getElementById('grid');
    if(layer&&grid){
      const rect=grid.getBoundingClientRect();
      if(rect.width){
        const tw=rect.width/Game.G,th=rect.height/Game.G;
        layer.style.width=rect.width+'px';layer.style.height=rect.height+'px';
        const parent=layer.parentElement;
        if(parent){const pr=parent.getBoundingClientRect();layer.style.left=(rect.left-pr.left)+'px';layer.style.top=(rect.top-pr.top)+'px';}
        const idx2=Math.floor(progress*(route.path.length-1));
        const nxt=Math.min(idx2+1,route.path.length-1);
        const [rs1,cs1]=route.path[idx2].split(',').map(Number);
        const [rs2,cs2]=route.path[nxt].split(',').map(Number);
        const frac=(progress*(route.path.length-1))%1;
        const rx=((cs1+(cs2-cs1)*frac)+0.5)*tw;
        const ry=((rs1+(rs2-rs1)*frac)+0.5)*th;
        layer.innerHTML='<div class="agent '+(type==='bus'?'bus':'truck')+'" style="left:'+rx+'px;top:'+ry+'px;opacity:'+opacity+'" title="'+(type==='bus'?'Bus: '+route.label:'Waste: '+route.label)+'"><span style="font-size:12px;line-height:16px;display:block;text-align:center">'+(type==='bus'?'🚌':'')+'</span></div>';
      }
    }
    if(progress>=1){toast('✅ '+(type==='bus'?'Bus':'Truck')+' route complete!');Audio.complete();if(st.sim)st.sim.speed=savedSpeed;return;}
    requestAnimationFrame(step);
  }
  route.vehicles[0].progress=0;
  requestAnimationFrame(step);
}

function toast(m,t){const c=document.getElementById('toast');if(!c)return;const e=document.createElement('div');e.className='toast'+(t==='err'?' err':'');e.textContent=m;c.appendChild(e);setTimeout(()=>e.remove(),3000);}

function updateClock(){
  const cl=document.getElementById('sim-clock'),we=document.getElementById('sim-weather');
  if(cl)cl.textContent='⏱ '+Math.floor(Game.state.sim?.time/60)+'s';
  if(we&&Game.state.sim)we.textContent=
    Game.state.sim.weather==='clear'?'☀️ Clear':Game.state.sim.weather==='cloudy'?'☁️ Cloudy':
    Game.state.sim.weather==='rain'?'🌧️ Rain':'⛈️ Storm';
}

return{start,stop,triggerRoute};
})();
