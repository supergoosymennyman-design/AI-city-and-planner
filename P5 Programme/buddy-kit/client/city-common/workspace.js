// Workspace adapters contain only reviewed, persistable editor data. Camera and
// microphone sessions never enter this contract.
import { CF_KEYS, collectState } from './champion-file.js';

const shared = globalThis[Symbol.for('passiona.workspace.adapters')] ||= { adapters: new Set(), suspended: false };
const adapters = shared.adapters;
export function registerWorkspaceAdapter(adapter) {
  for (const method of ['flush', 'capture', 'restore', 'suspend']) {
    if (typeof adapter[method] !== 'function') throw Error(`Workspace adapter needs ${method}().`);
  }
  adapters.add(adapter);
  return () => adapters.delete(adapter);
}
export async function flushWorkspaces() {
  if (shared.suspended) throw Error('The project changed. Reload before saving.');
  for (const adapter of adapters) await adapter.flush();
}
export async function captureWorkspaces() {
  const sections = {};
  for (const adapter of adapters) Object.assign(sections, await adapter.capture());
  return sections;
}
export function suspendWorkspaces(value = true) {
  shared.suspended = value;
  for (const adapter of adapters) adapter.suspend(value);
}
export async function restoreWorkspaces(project) {
  for (const adapter of adapters) await adapter.restore(project);
}

// Replace all project keys, including absent ones. Language is a device choice.
export function replaceCityState(state, storage = globalThis.localStorage) {
  const before = collectState(storage);
  const touched = [];
  const oldCode = storage.getItem('p5_cloud_code_v1');
  try {
    storage.removeItem('p5_cloud_code_v1');
    for (const [name, key] of Object.entries(CF_KEYS)) {
      if (name === 'lang') continue;
      const next = typeof state?.[name] === 'string' ? state[name] : null;
      if (storage.getItem(key) === next) continue;
      if (next !== null) storage.setItem(key, next);
      else storage.removeItem(key);
      touched.push(name);
    }
  } catch (error) {
    if (oldCode != null) storage.setItem('p5_cloud_code_v1', oldCode);
    for (const name of touched.reverse()) {
      const key = CF_KEYS[name];
      if (Object.hasOwn(before, name)) storage.setItem(key, before[name]);
      else storage.removeItem(key);
    }
    throw error;
  }
  return before;
}

export async function championRecord(projectId, work) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('passiona-champion-v1', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', work ? 'readwrite' : 'readonly');
    const records = tx.objectStore('records');
    const req = records.get(`project:${projectId}`); let result, error;
    req.onsuccess = () => {
      try { result = work ? work(req.result, records) : req.result; }
      catch (e) { error = e; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(error || tx.error || Error('Champion storage failed.')); };
  });
}
