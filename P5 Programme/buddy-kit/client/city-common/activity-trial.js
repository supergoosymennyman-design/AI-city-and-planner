import { SCHOOL_BOUNDS } from './driving-school-site.js';
import { runInference } from './cap-runtime.js';
import { SCHOOL_TRACKS, createCar, advanceStep, DRIVE_DT, DRIVE_MAX_STEPS } from './driving.js';
import { routeResult, routeDecision, humanReviewResult, scoreRun } from './recycling.js';
export const ACTIVITY_SITES = Object.freeze({ recycling: 'city-recycling-school-v1', driving: 'city-driving-school-v1' });
export const CITY_BIN_MAPPING = Object.freeze({ metal:'bin-metal', plastic:'bin-plastic', cardboard:'bin-cardboard', glass:'bin-glass' });
/** Resolve only an explicit site's immutable installation. No first-compatible fallback. */
export function siteSkill(capabilities, installations, siteId, compatible) {
  if (!siteId) return null;
  const installation = Object.values(installations || {}).find(i => i.hostInstanceId === siteId);
  const cap = capabilities?.[installation?.capabilityRef];
  return cap && compatible(cap) ? { cap, installationId:installation.id, installation } : null;
}
/** One synchronous owner, advanced exclusively by the host renderer. No timers or promises. */
export class ActivityTrial {
  constructor(kind, cap, scenario, rows = [], machineResults = null) {
    this.machineResults=machineResults?structuredClone(machineResults):null; this.kind=kind; this.cap=cap ? structuredClone(cap) : null; this.scenario=scenario; this.rows=structuredClone(rows);
    this.state='ready'; this.accumulator=0; this.steps=[]; this.results=[]; this.index=0; this.phase=0;
    this.track=kind==='driving' ? SCHOOL_TRACKS[scenario] : null;
    this.car=this.track ? createCar(this.track) : null; this.previous=this.car; this.outcome=null;
  }
  run() { if(['ready','paused'].includes(this.state) && (this.kind!=='recycling'||this.rows.length)) this.state='running'; }
  pause() { if(this.state==='running') this.state='paused'; this.accumulator=0; }
  finish(outcome) { this.outcome=outcome; this.state='finished'; if(this.car)this.car.speed=0; }
  step() { if(!['ready','paused','running'].includes(this.state)||(this.kind==='recycling'&&!this.rows.length))return; this.state='paused'; this.accumulator=0; this.advance(); }
  update(dt) {
    if(this.state!=='running')return;
    this.accumulator+=Math.max(0,Math.min(dt,.1));
    while(this.accumulator>=DRIVE_DT && this.state==='running') { this.accumulator-=DRIVE_DT; this.advance(); }
  }
  advance() {
    try {
      if(this.kind==='driving') {
        if(this.steps.length>=DRIVE_MAX_STEPS) {this.finish('timeout');return;}
        const t=this.steps.length*DRIVE_DT;
        // advanceStep senses once for the record; inference reads that same fixed state.
        const { observation } = this.observe();
        const next=advanceStep(this.track,this.car,runInference(this.cap,observation),{t,step:this.steps.length});
        this.previous=this.car; this.car=next.car; this.steps.push(next.record);
        if(next.done)this.finish(next.record.event);
      } else {
        if(!this.rows.length)throw Error('No held-out scanner objects');
        if(this.phase===0) this.current=null;
        if(this.phase===12) {
          const row=this.rows[this.index];
          const inferred=this.cap && this.cap.kind!=='recycling-machine' ? runInference(this.cap,{vector:row.vector}) : null;
          const result=this.machineResults?.[this.index] || (inferred ? routeResult(inferred,row) : humanReviewResult(row));
          if(inferred)result.bin=routeDecision(inferred.decision,inferred.abstained,this.scenario==='personal'?undefined:CITY_BIN_MAPPING).bin;
          // An unsupported destination is a human check, never a counted correct sort.
          if(result.bin==='human-check')result.abstained=true;
          this.current=result;
        }
        this.phase++;
        if(this.phase>=30) {
          this.results.push(this.current); this.index++;this.phase=0;
          if(this.index>=this.rows.length)this.finish('completed');
        }
      }
    } catch(error) { this.state='error'; this.outcome='runtime-failure'; this.error=String(error.message||error); if(this.car)this.car.speed=0; }
  }
  observe() { return sense(this.track,this.car,this.steps.length*DRIVE_DT); }
  summary() { return { scenario:this.scenario, ...(this.kind==='recycling'?{datasetVersion:this.scenario==='personal'?null:this.scenario==='materials-v2'?'city-recycling-v2':'city-recycling-v1'}:{}), outcome:this.outcome, revision:this.cap?.revision||null,
    capabilityId:this.cap?.id||null, steps:this.steps, results:this.results, score:scoreRun(this.results) }; }
}
import { sense } from './driving.js';
/** Find free ground without rewriting old cities. Clearance includes approach/camera margins. */
export function placeActivitySites({scale=2000, focus=[1000,1000], buildings=[], roads=[], props=[], trees=[], kinds=['recycling','driving']}={}) {
  const occupied=[...buildings,...props].map(b=>({x:b.pos?.[0]??b.x,z:b.pos?.[1]??b.z,r:Math.hypot(...(b.footprint||[12,12]))/2+4}));
  occupied.push(...trees.map(t=>({x:t.x,z:t.z,r:(t.radius||3)+2})));
  const reserved=[];
  const clear=(x,z,w,d)=> {
    if(x-w/2<3||z-d/2<3||x+w/2>scale-3||z+d/2>scale-3)return false;
    if(occupied.some(o=>Math.abs(x-o.x)<w/2+o.r && Math.abs(z-o.z)<d/2+o.r))return false;
    if(reserved.some(o=>Math.abs(x-o.x)<(w+o.w)/2 && Math.abs(z-o.z)<(d+o.d)/2))return false;
    for(const road of roads)for(let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
      for(let j=0;j<=n;j++){const f=n?j/n:0;if(Math.abs(x-a[0]-(b[0]-a[0])*f)<w/2+(road.width||10)/2+2&&Math.abs(z-a[1]-(b[1]-a[1])*f)<d/2+(road.width||10)/2+2)return false;}
    }
    return true;
  };
  for(const [kind,w,d] of [['recycling',24,22],['driving',SCHOOL_BOUNDS.w,SCHOOL_BOUNDS.d]]) {
    if(!kinds.includes(kind))continue;
    let found=null;
    for(let ring=0;ring<Math.min(64,scale/8)&&!found;ring++)for(let i=0;i<Math.max(1,ring*8);i++){
      const angle=i/Math.max(1,ring*8)*Math.PI*2,x=focus[0]+Math.cos(angle)*ring*8,z=focus[1]+Math.sin(angle)*ring*8;
      if(clear(x,z,w,d)){found={kind,id:ACTIVITY_SITES[kind],x,z,w,d,pos:[x,z],footprint:[w,d]};break;}
    }
    if(found)reserved.push(found);
  }
  return reserved;
}
