// Device-local student GLB library.  Champion Files carry this small manifest,
// never the binary model data (which deliberately stays in IndexedDB).
export const CUSTOM_MODELS_KEY = 'hk_ai_city_custom_models_v1';
export const CUSTOM_MODEL_PREFIX = 'custom:';
export const MAX_CUSTOM_MODEL_BYTES = 12 * 1024 * 1024;
export const MAX_CUSTOM_LIBRARY_BYTES = 36 * 1024 * 1024;
export const CUSTOM_MODEL_MANIFEST_VERSION = 2;
const DB = 'passiona-custom-models';
const STORE = 'models';

function byteView(bytes) {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return new Uint8Array();
}
export function isGLB(bytes) {
  const a = byteView(bytes);
  return a.byteLength >= 20 && a[0] === 0x67 && a[1] === 0x6c && a[2] === 0x54 && a[3] === 0x46;
}
export function validateGLB(bytes, { totalBytes = 0 } = {}) {
  const a = byteView(bytes);
  const size = a.byteLength;
  if (!size) return { ok: false, error: 'That file is empty.' };
  if (!isGLB(bytes)) return { ok: false, error: 'Please choose a GLB model file.' };
  if (size > MAX_CUSTOM_MODEL_BYTES) return { ok: false, error: 'That model is over the 12 MB limit.' };
  if (totalBytes + size > MAX_CUSTOM_LIBRARY_BYTES) return { ok: false, error: 'My Models is full (36 MB total). Remove a model first.' };
  try {
    const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
    if (view.getUint32(4, true) !== 2) return { ok: false, error: 'Please export the model as GLB version 2.' };
    if (view.getUint32(8, true) !== size) return { ok: false, error: 'The GLB file is incomplete or has extra data.' };
    let offset = 12;
    let json = null;
    while (offset + 8 <= size) {
      const length = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      offset += 8;
      if (length > size - offset) return { ok: false, error: 'The GLB contains an incomplete data chunk.' };
      if (type === 0x4e4f534a && json === null) {
        const raw = new TextDecoder().decode(a.subarray(offset, offset + length)).replace(/[\u0000\u0020]+$/g, '');
        json = JSON.parse(raw);
      }
      offset += length;
    }
    if (offset !== size || !json || String(json.asset?.version || '')[0] !== '2') {
      return { ok: false, error: 'The GLB has no valid embedded model description.' };
    }
    const external = [...(json.buffers || []), ...(json.images || [])]
      .some(resource => typeof resource?.uri === 'string' && !resource.uri.startsWith('data:'));
    if (external) return { ok: false, error: 'This model depends on external files. Export one GLB with resources embedded.' };
    const transforms = (json.nodes || []).flatMap(node => [node.translation, node.rotation, node.scale, node.matrix]).filter(Array.isArray);
    if (transforms.some(values => values.some(value => !Number.isFinite(value)))) {
      return { ok: false, error: 'The model contains an invalid position, rotation, or scale.' };
    }
    let triangles = 0;
    for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
      const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
      const count = Math.max(0, Number(accessor?.count) || 0);
      if ((primitive.mode ?? 4) === 4) triangles += Math.floor(count / 3);
      else if (primitive.mode === 5 || primitive.mode === 6) triangles += Math.max(0, count - 2);
    }
    const stats = { bytes: size, triangles, materials: json.materials?.length || 0, textures: json.textures?.length || 0 };
    const warnings = [];
    if (triangles > 100000) warnings.push('High triangle count may run slowly on a school tablet.');
    if (stats.materials > 20) warnings.push('Many materials may make this model slower to draw.');
    if (stats.textures > 10) warnings.push('Many textures may use a lot of device memory.');
    return { ok: true, stats, warnings };
  } catch {
    return { ok: false, error: 'That GLB is malformed and could not be safely read.' };
  }
}
export function normalizeCustomManifest(value) {
  let v = value;
  try { if (typeof v === 'string') v = JSON.parse(v); } catch { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { version: CUSTOM_MODEL_MANIFEST_VERSION, models: [], overrides: {} };
  const models = Array.isArray(v.models) ? v.models.filter(m => m && typeof m.id === 'string' && typeof m.name === 'string').map(m => ({
    id: m.id.slice(0, 100),
    name: m.name.slice(0, 80),
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : null,
    role: typeof m.role === 'string' ? m.role.slice(0, 60) : null,
    orientation: Number.isFinite(m.orientation) ? ((m.orientation % 360) + 360) % 360 : 0,
    footprint: Array.isArray(m.footprint) && m.footprint.length === 2
      ? m.footprint.map(n => Math.max(0.05, Math.min(100, Number(n) || 1))) : [1, 1],
    defaultSize: Math.max(0.05, Math.min(20, Number(m.defaultSize) || 1)),
    thumbnail: m.thumbnail && typeof m.thumbnail === 'object'
      ? { kind: String(m.thumbnail.kind || 'generated').slice(0, 30), width: Math.max(0, Number(m.thumbnail.width) || 0), height: Math.max(0, Number(m.thumbnail.height) || 0) }
      : null,
    missingFile: m.missingFile === true,
  })) : [];
  const overrides = v.overrides && typeof v.overrides === 'object' && !Array.isArray(v.overrides) ? Object.fromEntries(Object.entries(v.overrides).filter(([, id]) => models.some(m => m.id === id))) : {};
  return { version: CUSTOM_MODEL_MANIFEST_VERSION, models, overrides };
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
