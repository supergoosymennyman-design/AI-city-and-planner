// project-store.js — the offline-first Passiona project envelope.
//
// This deliberately stores workspace payloads as opaque data. A workspace can
// change its own section without parsing or discarding another workspace's
// future fields. Media is never collected here: callers must only pass the
// reviewed, persistable representation of a machine or model.
import { CF_KEYS, collectState, writeState, composeChampionFile, sanitizeChampionFile } from './champion-file.js';

export const PROJECT_KIND = 'passiona-project';
export const PROJECT_VERSION = 1;
export const ARCHIVE_KIND = 'passiona.archive';
export const ARCHIVE_VERSION = 2;
export const PROJECT_DB = 'passiona-projects-v1';
export const ACTIVE_PROJECT_KEY = 'passiona_active_project_v1';
export const PROJECT_EVENT = 'passiona:project-store-change';
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const id = () => `project-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function createProject(label = 'My AI City') {
  const createdAt = now();
  return {
    kind: PROJECT_KIND, version: PROJECT_VERSION, id: id(), name: String(label || 'My AI City').slice(0, 80),
    createdAt, updatedAt: createdAt, revision: 0,
    champion: {}, projects: { city: {}, workshop: {}, studio: {}, planner: {} },
    capabilities: {}, installations: {}, assets: {}, progress: {}, unknown: {},
  };
}

export function validateProject(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) return { ok: false, error: 'Project is missing.' };
  if (project.kind !== PROJECT_KIND || project.version !== PROJECT_VERSION) return { ok: false, error: 'This project format is not supported.' };
  if (!project.id || !project.projects || typeof project.projects !== 'object') return { ok: false, error: 'Project sections are missing.' };
  return { ok: true };
}

/** Convert the current City’s compatible localStorage state without deleting it. */
export function migrateLegacyCity(storage = globalThis.localStorage) {
  const project = createProject(storage?.getItem(CF_KEYS.cityName) || 'My AI City');
  project.projects.city = { legacyState: collectState(storage) };
  return project;
}

/** Convert a Workshop Champion while retaining every unfamiliar section verbatim. */
export function migrateWorkshopChampion(champion) {
  const project = createProject(champion?.label || champion?.name || 'My AI Project');
  project.champion = clone(champion?.champion || champion?.identity || {});
  project.projects.workshop = { champion: clone(champion) };
  return project;
}

/** Convert the shipped City Champion File into the project envelope. */
export function migrateChampionFile(file) {
  const checked = sanitizeChampionFile(file);
  if (!checked.ok) return checked;
  const project = createProject(checked.file.label);
  project.projects.city = { legacyState: clone(checked.file.state) };
  return { ok: true, project };
}

export function exportProjectEnvelope(project) {
  const valid = validateProject(project); if (!valid.ok) return valid;
  const payload = clone(project);
  const integrity = simpleHash(JSON.stringify(payload));
  const workspaceRevisions = Object.fromEntries(Object.entries(payload.projects || {}).map(([name, section]) => [name, Number(section?.revision || 0)]));
  return { ok: true, archive: {
    kind: ARCHIVE_KIND, version: ARCHIVE_VERSION, exportedAt: now(), integrity,
    manifest: {
      project: { id: payload.id, name: payload.name, revision: payload.revision, createdAt: payload.createdAt, updatedAt: payload.updatedAt },
      workspaceRevisions,
      sections: { city: 'projects.city', workshop: 'projects.workshop', studio: 'projects.studio', planner: 'projects.planner' },
      capabilities: clone(payload.capabilities || {}), assetMetadata: clone(payload.assets || {}),
    },
    project: payload,
    // Binary entries are added by attachArchiveAsset(); keeping them outside
    // workspace JSON lets each editor preserve unknown sections byte-for-byte.
    assets: [],
  } };
}

export function attachArchiveAsset(archive, { bytes, mediaType = 'model/gltf-binary', role = 'asset', name = 'asset.glb' }) {
  if (!archive || archive.kind !== ARCHIVE_KIND || !(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))) return { ok: false, error: 'Asset bytes are missing.' };
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hash = simpleHashBytes(view);
  archive.assets ||= [];
  if (!archive.assets.some(asset => asset.hash === hash)) archive.assets.push({ hash, byteLength: view.byteLength, mediaType, role, name, data: bytesToBase64(view) });
  archive.manifest ||= {}; archive.manifest.assetMetadata ||= {}; archive.manifest.assetMetadata[hash] = { byteLength: view.byteLength, mediaType, role, name };
  return { ok: true, hash };
}

export function importProjectEnvelope(value) {
  try {
    const legacy = value?.kind === PROJECT_KIND && value?.version === PROJECT_VERSION;
    const portable = value?.kind === ARCHIVE_KIND && value?.version === ARCHIVE_VERSION;
    if ((!legacy && !portable) || !value.project) return { ok: false, error: 'That is not a Passiona project.' };
    const raw = JSON.stringify(value.project);
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_ARCHIVE_BYTES) return { ok: false, error: 'Project archive is too large.' };
    if (value.integrity && value.integrity !== simpleHash(raw)) return { ok: false, error: 'Project archive is damaged.' };
    const valid = validateProject(value.project); if (!valid.ok) return valid;
    const assets = {};
    for (const asset of value.assets || []) {
      const bytes = base64ToBytes(asset.data);
      if (bytes.byteLength !== asset.byteLength || simpleHashBytes(bytes) !== asset.hash) return { ok: false, error: `Project asset “${asset.name || asset.hash}” is damaged.` };
      assets[asset.hash] = { ...asset, bytes: bytes.buffer };
      delete assets[asset.hash].data;
    }
    return { ok: true, project: clone(value.project), assets };
  } catch { return { ok: false, error: 'Project archive could not be read.' }; }
}

// Non-cryptographic corruption check. Cloud storage must add a cryptographic
// integrity check when it is introduced; this is intentionally not a security claim.
export function simpleHash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return `fnv1a-${(h >>> 0).toString(16)}`; }
export function simpleHashBytes(bytes) { let h = 2166136261; for (const byte of bytes) { h ^= byte; h = Math.imul(h, 16777619); } return `fnv1a-${(h >>> 0).toString(16)}`; }
function bytesToBase64(bytes) { let binary = ''; const step = 0x8000; for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step)); return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64'); }
function base64ToBytes(value) { const binary = typeof atob === 'function' ? atob(value || '') : Buffer.from(value || '', 'base64').toString('binary'); const out = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i); return out; }

export function createProjectStore({ storage = safeStorage(), indexedDB = globalThis.indexedDB, channelName = 'passiona-projects' } = {}) {
  let active = null, dbPromise = null, channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelName) : null;
  const emit = detail => { globalThis.dispatchEvent?.(new CustomEvent(PROJECT_EVENT, { detail })); channel?.postMessage(detail); };
  channel && (channel.onmessage = event => globalThis.dispatchEvent?.(new CustomEvent(PROJECT_EVENT, { detail: event.data })));

  const db = () => {
    if (!indexedDB) return Promise.resolve(null);
    if (!dbPromise) dbPromise = new Promise(resolve => {
      const req = indexedDB.open(PROJECT_DB, 1);
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' }); if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'key' }); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null);
    });
    return dbPromise;
  };
  async function read(idValue) { const d = await db(); if (!d) return null; return new Promise(resolve => { const r = d.transaction('projects').objectStore('projects').get(idValue); r.onsuccess = () => resolve(r.result || null); r.onerror = () => resolve(null); }); }
  async function write(project, versionReason) {
    const d = await db(); if (!d) return false;
    return new Promise(resolve => { const tx = d.transaction(['projects', 'versions'], 'readwrite'); tx.objectStore('projects').put(project); if (versionReason) tx.objectStore('versions').put({ key: `${project.id}:${project.revision}`, projectId: project.id, reason: versionReason, savedAt: now(), project: clone(project) }); tx.oncomplete = () => resolve(true); tx.onerror = tx.onabort = () => resolve(false); });
  }
  async function versions(projectId = active?.id) { const d = await db(); if (!d || !projectId) return []; return new Promise(resolve => { const r = d.transaction('versions').objectStore('versions').getAll(); r.onsuccess = () => resolve((r.result || []).filter(v => v.projectId === projectId).sort((a, b) => b.project.revision - a.project.revision)); r.onerror = () => resolve([]); }); }
  async function openActiveProject() {
    const requested = storage?.getItem(ACTIVE_PROJECT_KEY); let project = requested && await read(requested);
    if (!project) { project = migrateLegacyCity(storage); await write(project, 'migration:legacy-city'); try { storage?.setItem(ACTIVE_PROJECT_KEY, project.id); } catch {} }
    active = project; return clone(active);
  }
  async function createAndOpen(name) { active = createProject(name); await write(active, 'created'); try { storage?.setItem(ACTIVE_PROJECT_KEY, active.id); } catch {} emit({ type: 'opened', projectId: active.id }); return clone(active); }
  async function commitSection(section, patch, expectedRevision = active?.revision) {
    if (!active) await openActiveProject();
    if (expectedRevision !== active.revision) return { ok: false, conflict: true, project: clone(active) };
    if (!section || typeof section !== 'string' || !patch || typeof patch !== 'object') return { ok: false, error: 'Invalid project section.' };
    const before = clone(active); const next = clone(active); next.projects[section] = { ...(next.projects[section] || {}), ...clone(patch) }; next.revision++; next.updatedAt = now();
    if (!await write(next, `edit:${section}`)) return { ok: false, storageFull: true, project: before };
    active = next; emit({ type: 'changed', projectId: active.id, section, revision: active.revision }); return { ok: true, project: clone(active) };
  }
  async function checkpoint(reason = 'manual') { if (!active) await openActiveProject(); const ok = await write(active, reason); return { ok, project: clone(active) }; }
  async function exportProject() { if (!active) await openActiveProject(); return exportProjectEnvelope(active); }
  async function importProject(archive) { const parsed = importProjectEnvelope(archive); if (!parsed.ok) return parsed; if (active) await write(active, 'before-import'); active = parsed.project; active.revision++; active.updatedAt = now(); const ok = await write(active, 'import'); if (!ok) return { ok: false, storageFull: true }; try { storage?.setItem(ACTIVE_PROJECT_KEY, active.id); } catch {} emit({ type: 'imported', projectId: active.id }); return { ok: true, project: clone(active) }; }
  async function restoreLegacyCity() { if (!active) await openActiveProject(); const state = active.projects.city?.legacyState; if (!state) return { ok: false, error: 'This project has no City data.' }; return writeState(state, storage); }
  async function restoreRevision(revision) { if (!active) await openActiveProject(); const found = (await versions(active.id)).find(v => v.project.revision === revision); if (!found) return { ok: false, error: 'That revision is not available.' }; await write(active, 'before-revision-restore'); active = clone(found.project); active.revision++; active.updatedAt = now(); const ok = await write(active, 'revision-restored'); if (ok) emit({ type: 'restored', projectId: active.id, revision: active.revision }); return { ok, project: clone(active) }; }
  return { openActiveProject, createProject: createAndOpen, readSection: async section => { if (!active) await openActiveProject(); return clone(active.projects[section] || {}); }, commitSection, checkpoint, listVersions: versions, restoreRevision, flush: checkpoint, syncStatus: () => ({ state: 'local', label: 'Saved on this device' }), exportProject, importProject, restoreLegacyCity };
}

function safeStorage() { try { return globalThis.localStorage || null; } catch { return null; } }
