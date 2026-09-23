// Permanent, display-only homes for Workshop skills.  The mesh is deliberately
// separate from the record: a child may change its appearance without changing
// the installed, immutable capability revision.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { installCapability } from '../city-common/cap-runtime.js';

export const SKILL_HOST_PREFIX = 'skill-host:';
export const SKILL_HOSTS = Object.freeze({
  sorter: { emoji:'♻', en:'Community Recycling Sorter', zh:'社區回收分類站', footprint:[9,7] },
  delivery: { emoji:'◈', en:'Drone Delivery Dock', zh:'無人機配送站', footprint:[8,7] },
  mobility: { emoji:'▣', en:'Smart Mobility Stop', zh:'智慧交通站', footprint:[9,5] },
  universal: { emoji:'◇', en:'AI Skill Workshop Pod', zh:'AI 技能工作坊', footprint:[7,7] },
  showcase: { emoji:'★', en:'Champion Skill Pavilion', zh:'冠軍技能展館', footprint:[10,9] },
});
export function skillHostItem(id, lang='en') { const type=id?.slice(SKILL_HOST_PREFIX.length); const h=SKILL_HOSTS[type]; return h && { id, host:true, hostType:type, emoji:h.emoji, name:lang==='zh-Hant'?h.zh:h.en, category:'skill-hosts', footprint:h.footprint, height:5 }; }
export function newSkillHostRecord(type) { return { id:`${SKILL_HOST_PREFIX}${type}`, instanceId:`host-${crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`}`, hostType:type, visualSource:{kind:'library'}, capabilityRef:null }; }
export function hostStatus(record, capabilities=[]) {
  const ref=record?.capabilityRef;
  if (!ref) return 'empty';
  const cap=capabilities.find(c=>c?.id===ref.capabilityId && Number(c?.revision||1)===Number(ref.revision));
  const installed=cap && installCapability(cap);
  if (!installed?.ok || !installed.installation.selftest.ok || ref.verificationState==='failed') return 'attention';
  if (capabilities.some(c=>c?.id===ref.capabilityId && Number(c?.revision||1)>Number(ref.revision))) return 'update';
  return 'connected';
}
const material=(color, extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.12,...extra});
const add=(g,geo,mat,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;};
function frame(g,x,z,w,d,h=3.6){ const graphite=material(0x2d3940), pale=material(0xdfd9c9); add(g,new THREE.BoxGeometry(w,.35,d),pale,x,.18,z); for(const dx of[-w/2+.28,w/2-.28])for(const dz of[-d/2+.28,d/2-.28])add(g,new THREE.BoxGeometry(.22,h,.22),graphite,x+dx,h/2,z+dz); }
function visual(type) { const g=new THREE.Group();g.name='skill-host-visual'; const pale=material(0xe6dfcf), jade=material(0x23a99a,{emissive:0x126b65,emissiveIntensity:.2}), graphite=material(0x34424a), cyan=material(0x40c5cf,{emissive:0x17747b,emissiveIntensity:.35});
  if(type==='sorter'){frame(g,0,0,7,5); add(g,new THREE.CylinderGeometry(1.05,1.3,1.5,16),pale,-2.4,1.15,-.4); add(g,new THREE.BoxGeometry(3.7,.55,1.25),graphite,0,1.25,0); add(g,new THREE.BoxGeometry(2.5,1.35,1.7),pale,1.8,1.1,.3); for(const x of[-2,0,2])add(g,new THREE.BoxGeometry(1.25,1.1,1.45),jade,x,.82,2.25); add(g,new THREE.BoxGeometry(.55,1.35,.4),cyan,-3,1.1,1.8); }
  else if(type==='delivery'){frame(g,0,0,7,6); add(g,new THREE.CylinderGeometry(2.2,2.2,.32,24),pale,0,.35,0); add(g,new THREE.BoxGeometry(2.6,.55,1.4),graphite,0,.72,-1.4); add(g,new THREE.BoxGeometry(.16,3.2,.16),cyan,2.65,1.8,1.8); add(g,new THREE.CylinderGeometry(.42,.42,.18,16),jade,0,1.1,.2); for(const x of[-1.2,1.2])add(g,new THREE.BoxGeometry(.18,.18,2.7),graphite,x,1.3,.2); }
  else if(type==='mobility'){frame(g,0,0,8,3.6,3); add(g,new THREE.BoxGeometry(7,.18,2.7),graphite,0,3,0); add(g,new THREE.BoxGeometry(6.5,.18,.45),pale,0,1.25,-1.3); add(g,new THREE.BoxGeometry(2.3,1.15,.15),cyan,-2.3,2.05,-1.25); add(g,new THREE.BoxGeometry(2.4,.45,.6),pale,1.8,.75,-.5); add(g,new THREE.CylinderGeometry(.12,.12,4,10),jade,3,2,1); }
  else if(type==='universal'){frame(g,0,0,5.6,5.6); add(g,new THREE.BoxGeometry(1.2,2.2,1.2),graphite,-1.75,1.3,0); add(g,new THREE.CylinderGeometry(1.05,1.05,1.7,16),jade,0,1.25,0); add(g,new THREE.BoxGeometry(1.45,1.45,1.45),pale,1.7,1.0,0); add(g,new THREE.BoxGeometry(2.4,.12,.12),cyan,0,2.5,0); }
  else {frame(g,0,0,8,7,3.1); add(g,new THREE.CylinderGeometry(1.2,1.55,1.0,18),pale,0,.85,0); add(g,new THREE.CylinderGeometry(3.5,3.5,.15,24),graphite,0,3.05,0); for(const x of[-2.7,2.7])add(g,new THREE.BoxGeometry(1.7,.6,.45),pale,x,.72,1.9); add(g,new THREE.BoxGeometry(.5,1.2,.4),cyan,-3.1,1.1,-1.8); }
 return g; }
function socket(record, caps, statusOverride) { const state=statusOverride||hostStatus(record,caps); const icon={empty:'○',connected:'●',update:'↻',attention:'!'}[state]; const color={empty:'#91a1a5',connected:'#35d0a8',update:'#f6c553',attention:'#ed7875'}[state]; const el=document.createElement('button'); el.className='skill-socket'; el.type='button'; el.dataset.skillHost=record.instanceId; el.setAttribute('aria-label',`${record.hostType} ${state}`); el.innerHTML=`<span aria-hidden="true">${icon}</span><b>${state==='empty'?'Build or connect a skill':state==='connected'?'Enter my skill':state==='update'?'Update available':'Needs attention'}</b>`; el.style.setProperty('--socket-color',color); return new CSS2DObject(el); }
export function createSkillHostRoot(record, {capabilities=[],statusOverride=null}={}) { const root=new THREE.Group(), v=visual(record.hostType); root.add(v); const mount=new THREE.Group(); mount.position.set(0,.85,3.05); root.add(mount); const s=socket(record,capabilities,statusOverride); s.position.set(0,1.2,0); mount.add(s); root.userData.skillHost=true;root.userData.skillHostRecord=record;root.userData.status=statusOverride||hostStatus(record,capabilities); root.userData.dispose=()=>s.element.remove(); return root; }
export function workshopUrl(record) { const url=new URL('../workshop/',location.href); url.searchParams.set('publishTarget','city');url.searchParams.set('hostInstanceId',record.instanceId);url.searchParams.set('returnTo',new URL(`../city-builder/?skillHost=${encodeURIComponent(record.instanceId)}`,location.href).href);return url.href; }
export function editSkillHostDialog(record, capabilities=[], lang='en', customModels=[]) {
  const zh=lang==='zh-Hant', d=document.createElement('dialog'); d.className='skill-host-dialog';
  const choices=capabilities.map(c=>`<option value="${String(c.id).replace(/\"/g,'&quot;')}@${Number(c.revision||1)}">${String(c.name||c.id)} · r${Number(c.revision||1)}</option>`).join('');
  const status=hostStatus(record,capabilities); const current=record.capabilityRef?`${record.capabilityRef.capabilityId}@${record.capabilityRef.revision}`:'';
  const models=customModels.map(m=>`<option value="custom:${String(m.id).replace(/\"/g,'&quot;')}">${String(m.name)}</option>`).join('');
  d.innerHTML=`<form method="dialog"><h2>${zh?'技能插座':'Skill Socket'}</h2><p>${zh?'外觀可更換；已安裝的技能版本不會自動改變。':'Appearance can change; the installed skill revision never changes by itself.'}</p><p class="skill-host-state">${status==='empty'?(zh?'○ 尚未連接':'○ No skill connected'):status==='connected'?(zh?'● 已連接':'● Connected'):status==='update'?(zh?'↻ 有更新可用':'↻ Update available'):(zh?'! 需要處理':'! Needs attention')}</p><label>${zh?'已發佈技能':'Published skill'}<select name="cap"><option value="">${zh?'尚未連接':'No skill connected'}</option>${choices}</select></label><label>${zh?'外觀':'Appearance'}<select name="visual"><option value="library">${zh?'旗艦模型':'Flagship model'}</option>${models}</select></label><menu><button value="cancel">${zh?'取消':'Cancel'}</button><button value="workshop" class="secondary">${zh?'前往工作坊':'Open Workshop'}</button><button value="save" class="primary">${zh?'儲存連接':'Save connection'}</button></menu></form>`;
  document.body.append(d);d.querySelector('[name=cap]').value=current;d.querySelector('[name=visual]').value=record.visualSource?.kind==='custom'?`custom:${record.visualSource.modelId}`:'library';d.showModal();
  return new Promise(resolve=>d.addEventListener('close',()=>{const fd=new FormData(d.querySelector('form'));const selected=String(fd.get('cap')||''),visual=String(fd.get('visual')||'library');const cap=capabilities.find(c=>`${c.id}@${Number(c.revision||1)}`===selected);const value=d.returnValue==='save'?{...record,capabilityRef:cap?{projectId:cap.projectId||cap.id,capabilityId:cap.id,revision:Number(cap.revision||1),verificationState:installCapability(cap).installation?.selftest?.ok?'verified':'failed'}:null,visualSource:visual.startsWith('custom:')?{kind:'custom',modelId:visual.slice(7)}:{kind:'library'}}:null;const open=d.returnValue==='workshop';d.remove();resolve({value,openWorkshop:open});},{once:true}));
}
