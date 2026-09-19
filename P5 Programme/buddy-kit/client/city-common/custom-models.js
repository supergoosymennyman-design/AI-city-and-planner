// Device-local student GLB library.  Champion Files carry this small manifest,
// never the binary model data (which deliberately stays in IndexedDB).
export const CUSTOM_MODELS_KEY = 'hk_ai_city_custom_models_v1';
export const CUSTOM_MODEL_PREFIX = 'custom:';
export const MAX_CUSTOM_MODEL_BYTES = 12 * 1024 * 1024;
export const MAX_CUSTOM_LIBRARY_BYTES = 36 * 1024 * 1024;
const DB = 'passiona-custom-models';
const STORE = 'models';

export function isGLB(bytes) {
  const a = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes?.buffer || 0);
  return a.byteLength >= 20 && a[0] === 0x67 && a[1] === 0x6c && a[2] === 0x54 && a[3] === 0x46;
}
export function validateGLB(bytes, { totalBytes = 0 } = {}) {
  const size = bytes?.byteLength || 0;
  if (!size) return { ok: false, error: 'That file is empty.' };
  if (!isGLB(bytes)) return { ok: false, error: 'Please choose a GLB model file.' };
  if (size > MAX_CUSTOM_MODEL_BYTES) return { ok: false, error: 'That model is over the 12 MB limit.' };
  if (totalBytes + size > MAX_CUSTOM_LIBRARY_BYTES) return { ok: false, error: 'My Models is full (36 MB total). Remove a model first.' };
  return { ok: true };
}
export function normalizeCustomManifest(value) {
  let v = value;
  try { if (typeof v === 'string') v = JSON.parse(v); } catch { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { version: 1, models: [], overrides: {} };
  const models = Array.isArray(v.models) ? v.models.filter(m => m && typeof m.id === 'string' && typeof m.name === 'string').map(m => ({ id:m.id, name:m.name.slice(0,80), createdAt:m.createdAt || null })) : [];
  const overrides = v.overrides && typeof v.overrides === 'object' && !Array.isArray(v.overrides) ? Object.fromEntries(Object.entries(v.overrides).filter(([, id]) => models.some(m => m.id === id))) : {};
  return { version: 1, models, overrides };
}
export function customModelRecord(id, x, z, yaw = 0) { return { id: `${CUSTOM_MODEL_PREFIX}${id}`, x, y: 0, z, yaw }; }
export function resolveCustomOverride(role, manifest) { return normalizeCustomManifest(manifest).overrides[role] || null; }

function openDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('This browser cannot store model files.'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
async function request(mode, fn) { const db = await openDB(); return new Promise((resolve,reject) => { const tx=db.transaction(STORE,mode); const r=fn(tx.objectStore(STORE)); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close(); }); }
export const customModelStore = {
  get: id => request('readonly', s => s.get(id)),
  put: value => request('readwrite', s => s.put(value)),
  remove: id => request('readwrite', s => s.delete(id)),
  all: () => request('readonly', s => s.getAll()),
};
export function readCustomManifest(storage = globalThis.localStorage) { try { return normalizeCustomManifest(storage?.getItem(CUSTOM_MODELS_KEY)); } catch { return normalizeCustomManifest(null); } }
export function writeCustomManifest(manifest, storage = globalThis.localStorage) { storage?.setItem(CUSTOM_MODELS_KEY, JSON.stringify(normalizeCustomManifest(manifest))); }
