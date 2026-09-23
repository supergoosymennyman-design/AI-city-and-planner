// Pure data contract for Landmark Workshop records (safe in browser and Node).
export const LANDMARK_RECORD_VERSION = 1;
export const LANDMARK_PREFIX = 'landmark:';
export const PIXEL_SIZE = 16;
export const PIXEL_PALETTE = Object.freeze(['#10243a','#f5f0df','#ffcb3d','#ee675c','#45b69c','#4385d7','#a66dd4','#ffffff']);
const clamp=(value,min,max,fallback=min)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const choice=(value,values,fallback=values[0])=>values.includes(value)?value:fallback;
export function sanitizePixels(value){return Array.isArray(value)&&value.length===256?value.map(n=>Math.round(clamp(n,0,PIXEL_PALETTE.length-1,0))):Array(256).fill(0);}
const DEFINITIONS = [
  { id:'champion-plaza', emoji:'🏆', name:{en:'Champion Plaza',zh:'冠軍廣場'}, footprint:[8,8], complexity:6, defaults:{statueSource:'custom',pose:'stand'}, validate:c=>({statueSource:choice(c?.statueSource,['custom','preset','generic'],'custom'),pose:choice(c?.pose,['stand','walk','run'],'stand')}) },
  { id:'pixel-mural', emoji:'🎨', name:{en:'Pixel Mural',zh:'像素壁畫'}, footprint:[7,2], complexity:3, defaults:{pixels:Array(256).fill(0),palette:2,symmetry:'none'}, validate:c=>({pixels:sanitizePixels(c?.pixels),palette:Math.round(clamp(c?.palette,0,PIXEL_PALETTE.length-1,2)),symmetry:choice(c?.symmetry,['none','horizontal','vertical'],'none')}) },
  { id:'festival-plaza', emoji:'🏮', name:{en:'Festival Plaza',zh:'節慶廣場'}, footprint:[9,9], complexity:5, defaults:{lantern:'red',banner:'welcome',centerpiece:'tree'}, validate:c=>({lantern:choice(c?.lantern,['red','gold','jade'],'red'),banner:choice(c?.banner,['welcome','celebrate','blank'],'welcome'),centerpiece:choice(c?.centerpiece,['tree','stage','fountain'],'tree')}) },
  { id:'smart-gate', emoji:'💡', name:{en:'Smart Lamp / Gate',zh:'智能燈／閘門'}, footprint:[7,3], complexity:3, defaults:{mode:'proximity',threshold:5,action:'open',override:'auto'}, validate:c=>({mode:choice(c?.mode,['proximity','threshold'],'proximity'),threshold:clamp(c?.threshold,1,10,5),action:choice(c?.action,['open','light'],'open'),override:choice(c?.override,['auto','on','off'],'auto')}) },
];
export const LANDMARK_TEMPLATES = Object.freeze(Object.fromEntries(DEFINITIONS.map(d=>[d.id,Object.freeze(d)])));
export function landmarkItem(templateId,lang='en') { const d=LANDMARK_TEMPLATES[templateId]; return d&&{id:`${LANDMARK_PREFIX}${d.id}`,name:d.name[lang==='zh-Hant'?'zh':'en'],emoji:d.emoji,category:'landmarks',footprint:d.footprint,height:6,landmark:true,complexity:d.complexity}; }
export function landmarkItems(lang='en'){return DEFINITIONS.map(d=>landmarkItem(d.id,lang));}
export function templateFromRecord(record){return record?.landmark?.version===LANDMARK_RECORD_VERSION?LANDMARK_TEMPLATES[record.landmark.templateId]||null:null;}
export function makeLandmarkRecord(templateId,transform={}) { const d=LANDMARK_TEMPLATES[templateId]; if(!d) return null; return {id:`${LANDMARK_PREFIX}${templateId}`,x:transform.x||0,y:transform.y||0,z:transform.z||0,yaw:transform.yaw||0,landmark:{version:LANDMARK_RECORD_VERSION,templateId,config:d.validate(d.defaults)}}; }
export function validateLandmarkRecord(record){const d=templateFromRecord(record);if(!d)return {ok:false,reason:record?.landmark?.version===LANDMARK_RECORD_VERSION?'unknown-template':'unknown-version'};return {ok:true,config:d.validate(record.landmark.config)};}
export function paintPixel(pixels,x,y,color,symmetry='none'){const out=sanitizePixels(pixels);const put=(px,py)=>{if(px>=0&&px<16&&py>=0&&py<16)out[py*16+px]=Math.round(clamp(color,0,PIXEL_PALETTE.length-1,0));};put(x,y);if(symmetry==='horizontal')put(15-x,y);if(symmetry==='vertical')put(x,15-y);return out;}
export function fillPixels(color){return Array(256).fill(Math.round(clamp(color,0,PIXEL_PALETTE.length-1,0)));}
