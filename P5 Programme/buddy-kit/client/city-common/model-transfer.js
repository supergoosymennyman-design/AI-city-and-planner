// A short-lived, device-local handoff between City and the same-origin Model
// Studio.  Binary GLBs never enter a Champion File or leave the student's
// device.  The instance id is the concurrency boundary: one revision changes
// one placed object, never every copy of that library model.
const DB = 'passiona-city-model-transfer';
const STORE = 'drafts';
const MAX_AGE = 1000 * 60 * 30;
function db() { return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); }); }
async function request(mode, fn) { const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,mode),r=fn(tx.objectStore(STORE));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>d.close();}); }
export function newModelTransferId() { return `model-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
export async function saveModelTransfer(draft) { const row={...draft,id:draft.id||newModelTransferId(),createdAt:Date.now(),updatedAt:Date.now()};await request('readwrite',s=>s.put(row));return row; }
export async function readModelTransfer(id) { const row=await request('readonly',s=>s.get(id));if(!row||Date.now()-(row.updatedAt||row.createdAt||0)>MAX_AGE)return null;return row; }
export async function completeModelTransfer(id,result) { const row=await readModelTransfer(id);if(!row)return null;const next={...row,result:{...result,completedAt:Date.now()},updatedAt:Date.now()};await request('readwrite',s=>s.put(next));return next; }
export async function consumeModelTransfer(id) { const row=await readModelTransfer(id);if(!row?.result?.bytes)return null;await request('readwrite',s=>s.delete(id));return row; }
