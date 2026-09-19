import * as THREE from 'three';
import {TIME_KEY,TIME_PRESETS,validTime,nextTime} from '../city-common/time-of-day.js';
import {currentLang} from './i18n.js';
const colors=['horizon','sky','skyLight','groundLight','sun','rim','cloud','window','lamp','grassDayTint'];
function values(id){const p={...TIME_PRESETS[id]};for(const k of colors)p[k]=new THREE.Color(p[k]);return p;}
export function createTimeOfDay({scene,renderer,sky,hemi,sun,rim,ground,grasses=()=>[],reducedMotion,getClouds,post={},onPresetChange=()=>{}}){
 let id='sunset';try{id=validTime(localStorage.getItem(TIME_KEY));}catch{}
 let current=values(id),from=values(id),target=values(id),elapsed=1,scan=0,started=0,look=null;
 const emissives=new Map(),stars=new Set();
 const button=document.createElement('button');button.id='time-of-day';button.className='time-of-day';button.type='button';
 document.body.appendChild(button);
 function label(){const p=TIME_PRESETS[id],zh=currentLang()==='zh-Hant';button.textContent=`${p.icon} ${zh?p.zh:p.en}`;button.setAttribute('aria-label',`${zh?'時間':'Time'}: ${zh?p.zh:p.en}. ${zh?'按一下切換':'Press to change'}`);}
 function setTimeOfDay(value){id=validTime(value);from={...current};for(const k of colors)from[k]=current[k].clone();target=values(id);elapsed=0;started=performance.now();try{localStorage.setItem(TIME_KEY,id);}catch{}label();onPresetChange(id);update(0);}
 button.onclick=()=>setTimeOfDay(nextTime(id));window.addEventListener('i18n:change',label);label();
 function register(){scene.traverse(o=>{if(o.userData.timeStars)stars.add(o);if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if((m?.userData.timeWindow || m?.userData.timeLamp) && !emissives.has(m)){m.userData.timeBaseEmission ??= m.emissiveIntensity||1;emissives.set(m,m.userData.timeBaseEmission);}
 }});}
 function update(dt){
  scan-=dt;if(scan<=0){register();scan=.5;}
  if(elapsed<1)elapsed=reducedMotion()?1:Math.min(1,(performance.now()-started)/700);const t=elapsed*elapsed*(3-2*elapsed);
  for(const k of Object.keys(target)){if(colors.includes(k))current[k].copy(from[k]).lerp(target[k],t);else if(typeof target[k]==='number')current[k]=THREE.MathUtils.lerp(from[k],target[k],t);}
  // A City Look grades the visible sky only. Time still controls the real
  // lighting feedback (sun, lamps, windows and stars), so changing a look
  // never changes the child's simulation or hides its algorithm overlays.
  const horizon=look?.horizon||current.horizon, skyColor=look?.sky||current.sky;
  if (scene.background?.isColor) scene.background.copy(horizon);scene.fog.color.copy(horizon);scene.fog.density=current.fog;
  sky.material.uniforms.horizon.value.copy(horizon);sky.material.uniforms.zenith.value.copy(skyColor);
  ground()?.userData.__uFogColor?.value.copy(horizon);
  for(const material of grasses()){
   material.userData.__uFogColor?.value.copy(current.horizon);
   if(material.userData.__uGrassNight)material.userData.__uGrassNight.value=current.night;
   if(material.userData.__uGrassWarmth)material.userData.__uGrassWarmth.value=current.grassWarmth;
   if(material.userData.__uGrassDayTint)material.userData.__uGrassDayTint.value.copy(current.grassDayTint);
   if(material.userData.__uGrassDayBrightness)material.userData.__uGrassDayBrightness.value=current.grassDayBrightness;
  }
  hemi.color.copy(current.skyLight);hemi.groundColor.copy(current.groundLight);hemi.intensity=current.ambient;
  sun.color.copy(current.sun);sun.intensity=current.sunIntensity;sun.position.set(current.sunX,current.sunY,current.sunZ);
  rim.color.copy(current.rim);rim.intensity=current.rimIntensity;renderer.toneMappingExposure=current.exposure;
  for(const [m,base] of emissives){
   const isLamp=!!m.userData.timeLamp;
   m.emissive.copy(isLamp?current.lamp:current.window);
   // Windows stay naturally quiet in daylight; lamp caps retain a tiny warm
   // presence so streets never look like they have missing geometry.
   m.emissiveIntensity=base*(isLamp?(0.12+current.night*.88):(0.08+current.night*.92));
  }
  if(post.bloom){post.bloom.threshold=current.bloomThreshold;}
  if(post.saturation)post.saturation.value=current.saturation;
  if(post.vignette)post.vignette.value=current.vignette;
  for(const o of stars){o.visible=current.starVisibility>0;o.material.opacity=.3*current.starVisibility;}
  getClouds()?.setTimeOfDay?.(current);
 }
 onPresetChange(id);update(0);
 return {update,setTimeOfDay,setLook(value){
  // City Look presets intentionally keep their compact public hex values.
  // The renderer, however, copies colours into THREE.Color uniforms, so make
  // private runtime colours instead of mutating the shared catalog entry.
  look=value?{...value,horizon:new THREE.Color(value.horizon),sky:new THREE.Color(value.sky)}:null;
  update(0);
 },get id(){return id;},get settled(){return elapsed===1;},get bloom(){return current.bloom;},get night(){return current.night;},destroy(){button.remove();window.removeEventListener('i18n:change',label);emissives.clear();stars.clear();}};
}
