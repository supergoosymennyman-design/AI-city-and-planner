import { marketHandler, marketItems } from './market-catalogue.js';
import { bindWorkspace, LEGACY_OWNER_KEY, WORKSPACE_GENERATION_KEY } from './project-binding.js';
// project-store.js — the offline-first Passiona project envelope.
//
// This deliberately stores workspace payloads as opaque data. A workspace can
// change its own section without parsing or discarding another workspace's
// future fields. Media is never collected here: callers must only pass the
// reviewed, persistable representation of a machine or model.
import { CF_KEYS, collectState, writeState, composeChampionFile, sanitizeChampionFile } from './champion-file.js';
import { emptyEconomy, normalizeEconomy, applyTransaction, purchaseItem as ledgerPurchaseItem, recordLearningEvent as ledgerRecordEvent } from './ledger.js';
import { publishCapability, capabilityOfPublished, installSkill as registryInstallSkill, runSkill as registryRunSkill } from './skill-registry.js';
import { recordRun as challengeRecordRun, normalizeChallengeRuns, wrongIdsOf, gradedIdsOf, correctIdsOf, challengeOfCapability } from './challenges.js';
import { promoteFromEvidence } from './achievements.js';
import { statueStatus } from './statues.js';
import { writeBadges } from './badges.js';

export const PROJECT_KIND = 'passiona-project';
export const PROJECT_VERSION = 1;
export const ARCHIVE_KIND = 'passiona.archive';
export const ARCHIVE_VERSION = 2;
export const PROJECT_DB = 'passiona-projects-v1';
export const ACTIVE_PROJECT_KEY = 'passiona_active_project_v1';
export const PROJECT_EVENT = 'passiona:project-store-change';
export const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const id = () => `project-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function createProject(label = 'My AI City') {
  const createdAt = now();
  return {
    kind: PROJECT_KIND, version: PROJECT_VERSION, id: id(), name: String(label || 'My AI City').slice(0, 80),
    createdAt, updatedAt: createdAt, revision: 0,
    champion: {}, projects: { city: {}, workshop: {}, studio: {}, planner: {} },
    economy: emptyEconomy(),
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

/** Give an older envelope the economy book without disturbing its other sections. */
export function normalizeProject(project) {
  if (!project || typeof project !== 'object') return project;
  if (!project.economy) project.economy = emptyEconomy();
  else project.economy = normalizeEconomy(project.economy);
  project.capabilities ||= {}; project.installations ||= {};
  project.challenges = normalizeChallengeRuns(project.challenges);
  const state = project.projects?.city?.legacyState;
  if (state) {
    let accessories; try { accessories = JSON.parse(state.accessories || '{}'); } catch { accessories = {}; }
    if (!accessories || typeof accessories !== 'object' || Array.isArray(accessories)) accessories = {};
    for (const item of marketItems()) {
      if (project.economy.owned.includes(item.id)) continue;
      if (item.kind === 'accessory' && accessories[item.slot] === item.championAccessory) delete accessories[item.slot];
      if (item.kind === 'finish' && state.championFinish === item.finish) delete state.championFinish;
      if (item.kind === 'host-upgrade' && state.hostAppearance === item.hostUpgrade) delete state.hostAppearance;
    }
    if (state.accessories) state.accessories = JSON.stringify(accessories);
  }
  return project;
}

/**
 * Import the shipped Workshop/Studio economy into an envelope EXACTLY ONCE.
 * Never sums duplicate copies: an established envelope wallet wins, and the
 * import is recorded so a second call is a no-op.
 */
export function migrateEconomyFromChampion(project, championEconomy) {
  normalizeProject(project);
  project.progress ||= {};
  if (project.progress.economyMigrated) return { ok: true, migrated: false, reason: 'already-migrated' };
  const incoming = normalizeEconomy(championEconomy);
  if (championEconomy?.projectOwner && championEconomy.projectOwner !== project.id) {
    project.progress.economyMigrated = true;
    return { ok: true, migrated: false, reason: 'another-project' };
  }
  const established = project.economy.balance !== 0 || project.economy.owned.length || project.economy.transactions.length || project.economy.claimed.length || Object.keys(project.economy.evidence).length;
  if (!established && (incoming.balance > 0 || incoming.owned.length > 0 || incoming.transactions.length > 0)) {
    project.economy = incoming;
  }
  project.progress.economyMigrated = true;
  project.progress.economyMigratedAt = now();
  project.progress.economyMigrationSource = championEconomy?.projectOwner || 'legacy-champion';
  return { ok: true, migrated: true, economy: clone(project.economy) };
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
    const assets = Object.create(null);
    for (const asset of value.assets || []) {
      const bytes = base64ToBytes(asset.data);
      if (bytes.byteLength !== asset.byteLength || simpleHashBytes(bytes) !== asset.hash) return { ok: false, error: `Project asset “${asset.name || asset.hash}” is damaged.` };
      assets[asset.hash] = { ...asset, bytes: bytes.buffer };
      delete assets[asset.hash].data;
    }
    const refs = value.manifest?.assetReferences;
    if (refs) {
      if (value.manifest.assetReferencesIntegrity && value.manifest.assetReferencesIntegrity !== simpleHash(JSON.stringify(refs))) return { ok: false, error: 'Project asset references are damaged.' };
      for (const ref of [...(refs.models || []), ...(refs.champion ? [refs.champion] : [])]) {
        if (!ref?.hash || !Object.hasOwn(assets, ref.hash)) return { ok: false, error: 'A required model asset is missing from the project archive.' };
      }
      const declared = JSON.parse(value.project.projects.city?.legacyState?.customModels || '{"models":[]}');
      if ((declared.models || []).some(m => !(refs.models || []).some(r => r.id === m.id))) return { ok: false, error: 'A required custom model reference is missing.' };
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

/**
 * The NON-transactional body of a challenge outcome, extracted so it can be
 * unit-tested without IndexedDB. PURE: returns a NEW project; the input is never
 * mutated. The evidence-EXISTENCE checks stay in here, which is why the store
 * calls this INSIDE its `mutate` transaction (never above it — that would
 * reintroduce a time-of-check/time-of-use gap).
 *
 * @returns {{project:object, claimed:Array, fixedIds:string[], previousRevision:number|null,
 *   badgeState:object, badgeTier:string|null}}
 */
export function applyChallengeOutcome(current, challengeId, outcome = {}, events = [], { at = null } = {}) {
  const project = clone(current);
  normalizeProject(project);
  const wrongIds = Array.isArray(outcome.wrongIds) ? outcome.wrongIds : wrongIdsOf(outcome.results);
  const gradedIds = Array.isArray(outcome.gradedIds) ? outcome.gradedIds : gradedIdsOf(outcome.results);
  const record = challengeRecordRun(project.challenges, {
    challengeId, revision: outcome.revision, scenario: outcome.scenario, wrongIds, gradedIds,
  });
  project.challenges = record.state;
  const fixedIds = record.fixedIds;
  const previousRevision = record.previous ? (Number(record.previous.revision) || 1) : null;
  const list = Array.isArray(events) ? events.map((ev) => ({ ...ev })) : [];
  if (fixedIds.length) {
    list.push({
      type: 'revision-fixed',
      evidence: {
        challengeId, scenario: outcome.scenario || null, fixedIds,
        fromRevision: previousRevision, toRevision: Number(outcome.revision) || 1,
      },
    });
  }
  // Evidence EXISTENCE is checked here, inside the caller's transaction, not
  // trusted from the caller: an event only mints when the envelope really holds
  // the capability, installation, or abstention it points at.
  const caps = Object.values(project.capabilities || {});
  const challengeCaps = caps.filter((c) => challengeOfCapability(c) === challengeId);
  const installs = Object.values(project.installations || {})
    .filter((i) => project.capabilities?.[i.capabilityRef] && challengeOfCapability(project.capabilities[i.capabilityRef]) === challengeId);
  const machine=project.projects?.recyclingMachine;
  const machineRun=challengeId==='image-sorter'&&machine?.version===1&&machine.sourceMachineId===outcome.machineId&&Number(outcome.revision)>0&&Number(outcome.revision)<=Number(machine.revision);
  const abstained = Number(outcome.abstained) || (Array.isArray(outcome.results) ? outcome.results.filter((r) => r && r.abstained).length : 0);
  // An honest "not sure" demo only counts when the SAME run also got something
  // right — abstaining on everything is not a demonstration of knowing limits.
  const correctIds = Array.isArray(outcome.correctIds) ? outcome.correctIds : correctIdsOf(outcome.results);
  const correctCount = Number.isFinite(outcome.correctCount)
    ? Number(outcome.correctCount)
    : (Array.isArray(outcome.correctIds) ? outcome.correctIds.length : correctIds.length);
  const claimed = [];
  for (const ev of list) {
    if (!ev || !ev.type) continue;
    let evidence = ev.evidence || {};
    if (ev.type === 'held-out-eval') {
      if (!challengeCaps.length && !machineRun) continue; // no runnable skill => no held-out evaluation
    } else if (ev.type === 'city-install') {
      if (!installs.length && !machineRun) continue; // requires a real installation or saved City machine
      evidence = { ...evidence, installationId: installs[0]?.id || 'recycling:'+machine.sourceMachineId }; // the REAL installation
    } else if (ev.type === 'abstain-demo') {
      if (abstained <= 0 || correctCount < 1) continue; // needs an abstention AND a correct answer in the same run
    }
    const res = ledgerRecordEvent(project.economy, { type: ev.type, scopeId: challengeId, evidence: { ...evidence, challengeId }, at });
    if (res.ok) { project.economy = res.economy; if (res.claimed) claimed.push({ type: ev.type, amount: res.amount }); }
  }
  // Badges are promoted from the SAME evidence, in the SAME call. The envelope
  // copy is authoritative; the legacy localStorage mirror is written by the
  // store AFTER the transaction commits.
  project.projects ||= {};
  const promotion = promoteFromEvidence(project, project.projects.badges);
  project.projects.badges = promotion.state;
  return {
    project, claimed, fixedIds, previousRevision,
    badgeState: promotion.state, badgeTier: promotion.ok ? promotion.tier : null,
  };
}

export function createProjectStore({ storage = safeStorage(), indexedDB = globalThis.indexedDB, channelName = 'passiona-projects' } = {}) {
  let generation = 0, workspaceGeneration = storage?.getItem(WORKSPACE_GENERATION_KEY);
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
  async function read(idValue) { const d = await db(); if (!d) return null; return new Promise((resolve, reject) => { const r = d.transaction('projects').objectStore('projects').get(idValue); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error || Error('Project could not be read.')); }); }
  async function write(project, versionReason, beforeProjectId) {
    const d = await db(); if (!d) return false;
    return new Promise(resolve => { const tx = d.transaction(['projects', 'versions'], 'readwrite'); tx.objectStore('projects').put(project); if (beforeProjectId) { const req = tx.objectStore('projects').get(beforeProjectId); req.onsuccess = () => { const prior = req.result; if (prior) tx.objectStore('versions').put({ key: `${prior.id}:${prior.revision}`, projectId: prior.id, reason: 'before-import', savedAt: now(), project: clone(prior) }); }; } if (versionReason) tx.objectStore('versions').put({ key: `${project.id}:${project.revision}`, projectId: project.id, reason: versionReason, savedAt: now(), project: clone(project) }); tx.oncomplete = () => resolve(true); tx.onerror = tx.onabort = () => resolve(false); });
  }
  async function versions(projectId = active?.id) { const d = await db(); if (!d || !projectId) return []; return new Promise(resolve => { const r = d.transaction('versions').objectStore('versions').getAll(); r.onsuccess = () => resolve((r.result || []).filter(v => v.projectId === projectId).sort((a, b) => b.project.revision - a.project.revision)); r.onerror = () => resolve([]); }); }
  const openActiveProject = () => globalThis.navigator?.locks?.request
    ? globalThis.navigator.locks.request('passiona-project-open', openProject) : openProject();
  async function openProject() {
    const requested = storage?.getItem(ACTIVE_PROJECT_KEY); let project = requested && await read(requested);
    if (!project) { project = migrateLegacyCity(storage); if (!await write(project, 'migration:legacy-city')) throw Error('Project storage is unavailable. Your previous work was kept.'); storage?.setItem(ACTIVE_PROJECT_KEY, project.id); }
    if (storage && storage.getItem(ACTIVE_PROJECT_KEY) !== project.id) throw Error('The project changed while opening. Reload before editing.');
    active = normalizeProject(project); workspaceGeneration = storage?.getItem(WORKSPACE_GENERATION_KEY);
    if (storage === safeStorage() && typeof window !== 'undefined') {
      if (!storage.getItem(LEGACY_OWNER_KEY)) storage.setItem(LEGACY_OWNER_KEY, active.id);
      bindWorkspace(active.id);
    }
    mirrorBadges(active); return clone(active);
  }
  function activatePointer(project, activate) {
    const oldId = storage?.getItem(ACTIVE_PROJECT_KEY), oldGeneration = storage?.getItem(WORKSPACE_GENERATION_KEY);
    const nextGeneration = id(); let rollback;
    try {
      rollback = activate?.(project);
      storage?.setItem(WORKSPACE_GENERATION_KEY, nextGeneration);
      storage?.setItem(ACTIVE_PROJECT_KEY, project.id);
      workspaceGeneration = nextGeneration;
    } catch (error) {
      if (storage) {
        if (oldId == null) storage.removeItem(ACTIVE_PROJECT_KEY); else storage.setItem(ACTIVE_PROJECT_KEY, oldId);
        if (oldGeneration == null) storage.removeItem(WORKSPACE_GENERATION_KEY); else storage.setItem(WORKSPACE_GENERATION_KEY, oldGeneration);
      }
      rollback?.(); throw error;
    }
  }
  async function createAndOpen(name) {
    if (storage === safeStorage() && typeof window !== 'undefined') {
      if (!active) await openActiveProject();
      const project = createProject(name);
      if (!await write(project, 'created')) throw Error('The new project could not be saved.');
      const { switchWorkspaceProject } = await import('./backup-coordinator.js');
      const result = await switchWorkspaceProject(api, project.id);
      return result.project;
    }
    generation++;
    const project = createProject(name);
    if (!await write(project, 'created')) throw Error('The project could not be saved.');
    activatePointer(project);
    active = project;
    if (storage === safeStorage() && typeof window !== 'undefined') bindWorkspace(active.id, { rebind: true });
    emit({ type: 'opened', projectId: active.id }); return clone(active);
  }
  function binding() { return { projectId: active?.id, generation }; }
  function bound(expected) {
    return expected.generation === generation && expected.projectId === active?.id
      && (!storage || (storage.getItem(ACTIVE_PROJECT_KEY) === expected.projectId && storage.getItem(WORKSPACE_GENERATION_KEY) === workspaceGeneration));
  }
  const stale = () => ({ ok: false, staleWorkspace: true, error: 'The project changed. Reload this workspace before editing.', project: clone(active) });


  /** Mirror the envelope's authoritative badges to the legacy key the Logbook reads. */
  function mirrorBadges(project) {
    const badges = project?.projects?.badges;
    if (!badges) return;
    const ok = writeBadges(badges, storage);
    if (!ok && storage) console.warn('[project-store] badges could not be mirrored to localStorage; the envelope copy stands.');
  }

  /** Re-read the active project from IndexedDB so a cached read cannot go stale
   *  after another tab writes. Without IDB the in-memory copy is all we have. */
  async function freshActive() {
    if (!active) { await openActiveProject(); return active; }
    const expected = binding();
    if (!bound(expected)) throw Error(stale().error);
    const stored = await read(expected.projectId);
    if (!bound(expected)) throw Error(stale().error);
    if (stored) active = normalizeProject(stored);
    return active;
  }

  /** Every project on this device, newest first, with the active one flagged. */
  async function listProjects() {
    const d = await db(); if (!d) return [];
    const rows = await new Promise(resolve => {
      const r = d.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
    return rows
      .map(p => ({ id: p.id, name: p.name, revision: p.revision, updatedAt: p.updatedAt, balance: p.economy?.balance ?? 0, active: p.id === active?.id }))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  /** Switch which project every app reads: swaps the complete wallet and progress. */
  async function switchProject(projectId, { prepare, activate } = {}) {
    if (!activate && storage === safeStorage() && typeof window !== 'undefined') {
      try { const { switchWorkspaceProject } = await import('./backup-coordinator.js'); return await switchWorkspaceProject(api, projectId); }
      catch (error) { return { ok: false, error: error.message }; }
    }
    generation++;
    const expected = binding();
    const project = await read(projectId);
    if (!project) return { ok: false, error: 'That project is not on this device.' };
    try { if (prepare) await prepare(project); if (!bound(expected)) return stale(); activatePointer(project, activate); }
    catch (error) { return { ok: false, error: error.message }; }
    active = normalizeProject(project);
    mirrorBadges(active);
    emit({ type: 'switched', projectId: active.id });
    return { ok: true, project: clone(active) };
  }

  /**
   * Copy a project. The copy carries the SAME claimed rewards and achievements,
   * so it can never re-earn them — copying must not mint eligibility (plan §2).
   */
  async function copyProject(projectId, name) {
    const source = await read(projectId || active?.id);
    if (!source) return { ok: false, error: 'That project is not on this device.' };
    const copy = clone(source);
    copy.id = id();
    copy.name = String(name || `${source.name || 'My AI City'} (copy)`).slice(0, 80);
    copy.createdAt = now(); copy.updatedAt = now(); copy.revision = 0;
    if (storage === safeStorage() && typeof window !== 'undefined') {
      try { const { copyProjectAssets } = await import('./backup-coordinator.js'); await copyProjectAssets(source, copy); }
      catch (error) { return { ok: false, error: error.message }; }
    }
    const ok = await write(copy, 'copied');
    if (!ok) return { ok: false, storageFull: true };
    emit({ type: 'copied', projectId: copy.id });
    return { ok: true, project: clone(copy) };
  }
  /**
   * Read-modify-write the active project INSIDE one IndexedDB transaction. The
   * revision is compared against the record actually read from storage, so two
   * tabs can never both win. `change(project)` returns:
   *   • a project object   → commit it (revision bumps),
   *   • null / undefined   → no-op, nothing is written,
   *   • { conflict: true } → reject without writing (a concurrent change).
   * `versioned:false` skips the recovery snapshot for high-frequency ledgers.
   */
  async function mutate(change, { reason = 'mutate', versioned = true } = {}) {
    if (!active) await openActiveProject();
    const expected = binding();
    const d = await db();
    if (!bound(expected)) return stale();
    if (!d) return { ok: false, storageUnavailable: true, project: clone(active) };
    const projectId = expected.projectId;
    return new Promise(resolve => {
      const tx = d.transaction(['projects', 'versions'], 'readwrite');
      const store = tx.objectStore('projects');
      const req = store.get(projectId);
      let outcome = null, conflict = false, failure = null;
      req.onsuccess = () => {
        if (!bound(expected)) { failure = Error(stale().error); tx.abort(); return; }
        const current = req.result;
        if (!current) { failure = Error('The active project was not found.'); tx.abort(); return; }
        try {
          const result = change(clone(current));
          if (result && result.conflict) { conflict = true; outcome = result.project || current; return; }
          if (result == null) { outcome = current; return; }
          const next = result;
          next.id = current.id; next.kind = current.kind; next.version = current.version;
          next.createdAt = current.createdAt;
          next.revision = current.revision + 1; next.updatedAt = now();
          store.put(next);
          if (versioned) tx.objectStore('versions').put({ key: `${current.id}:${current.revision}`, projectId: current.id, reason, savedAt: now(), project: clone(current) });
          outcome = next;
        } catch (e) { failure = e; tx.abort(); }
      };
      req.onerror = () => { failure = Error('The project could not be read.'); tx.abort(); };
      tx.oncomplete = () => {
        if (!bound(expected)) { resolve(stale()); return; }
        active = outcome || active;
        if (!conflict) emit({ type: 'changed', projectId: active.id, revision: active.revision });
        if (conflict) { resolve({ ok: false, conflict: true, project: clone(active) }); return; }
        resolve({ ok: true, project: clone(active) });
      };
      tx.onabort = tx.onerror = () => resolve({ ok: false, error: String(failure?.message || failure || 'Project storage failed; nothing was committed.'), project: clone(active) });
    });
  }

  async function commitSection(section, patch, expectedRevision = active?.revision) {
    if (!section || typeof section !== 'string' || !patch || typeof patch !== 'object') return { ok: false, error: 'Invalid project section.' };
    const result = await mutate(current => {
      if (expectedRevision !== current.revision) return { conflict: true, project: current };
      const next = clone(current);
      next.projects[section] = { ...(next.projects[section] || {}), ...clone(patch) };
      next.progress ||= {}; next.progress.lastWorkspace = section; next.progress.lastWorkspaceAt = now();
      return next;
    }, { reason: `edit:${section}` });
    if (result.conflict) return result;
    if (!result.ok) return { ok: false, storageFull: true, project: result.project, error: result.error };
    emit({ type: 'changed', projectId: result.project.id, section, revision: result.project.revision });
    return { ok: true, project: result.project };
  }

  async function readEconomy() { return clone((await freshActive()).economy); }

  /** Shared-wallet mutations. All commit atomically; none can deepen a debit. */
  async function transact(op) {
    if (!op || op.type === 'award') return { ok: false, error: 'Teacher unlock required.' };
    return economyMutation(current => applyTransaction(current.economy, op), `transact:${op?.type || '?'}`);
  }
  async function award(op) { return economyMutation(current => applyTransaction(current.economy, { ...op, type: 'award' }), 'teacher-award'); }
  async function purchase(itemId, transactionId, catalogue, { at } = {}) {
    let purchased = false;
    const out = await economyMutation(current => {
      const result = ledgerPurchaseItem(current.economy, catalogue, itemId, transactionId, { at });
      if (!result.ok) throw Error(result.error);
      purchased = result.purchased; return result.economy;
    }, 'purchase');
    return { ...out, purchased };
  }
  async function equipItem(itemId, equipped = true) {
    return mutate(project => {
      const handler = marketHandler(itemId);
      if (!handler || handler.action !== 'equip' || !project.economy?.owned?.includes(itemId)) throw Error('Buy this item in the current project before equipping it.');
      project.projects.city ||= {};
      const state = project.projects.city.legacyState ||= {};
      if (handler.kind === 'accessory') {
        const map = JSON.parse(state.accessories || '{}');
        if (equipped) map[handler.slot] = handler.accessory;
        else if (map[handler.slot] === handler.accessory) delete map[handler.slot];
        state.accessories = JSON.stringify(map);
      } else {
        const key = handler.kind === 'finish' ? 'championFinish' : 'hostAppearance';
        if (equipped) state[key] = handler.finishId || handler.hostUpgrade;
        else delete state[key];
      }
      return project;
    }, { reason: 'equipment' });
  }
  async function recordLearningEvent(event, config) {
    // The two existence-checked rewards are delegated here so the raw store
    // primitive cannot mint what the dedicated methods refuse: a direct
    // `recordLearningEvent({type:'skill-saved'|'tutorial-task'})` is held to the
    // same envelope check as the shared `award()` door.
    if (event?.type === 'skill-saved') return recordSkillSaved(event?.evidence?.key);
    if (event?.type === 'tutorial-task') {
      const fromScope = /^academy-room-(\d+)$/.exec(String(event?.scopeId ?? ''))?.[1];
      return recordTutorialTask(event?.evidence?.room ?? fromScope);
    }
    let claimed = false, amount = 0;
    const out = await economyMutation(current => {
      const result = ledgerRecordEvent(current.economy, event, config ? { config } : undefined);
      if (!result.ok) throw Error(result.error);
      claimed = result.claimed; amount = result.amount || 0; return result.economy;
    }, `learn:${event?.type || '?'}`);
    return { ...out, claimed, amount };
  }
  /**
   * Record "saved a runnable skill". The envelope must already hold the published
   * capability AND its self-test must still pass — a caller cannot mint this by
   * naming an unpublished key (existence check, inside the transaction). Scoped to
   * the capability's CHALLENGE, never the machine, so improving or copying a
   * machine cannot earn a second time.
   * @param {string} capabilityKey  e.g. "cap_drive-knn@2"
   */
  async function recordSkillSaved(capabilityKey) {
    let claimed = false, amount = 0, challengeId = null;
    const key = typeof capabilityKey === 'string' ? capabilityKey : null;
    const result = await mutate(current => {
      normalizeProject(current);
      const published = key ? capabilityOfPublished(current, key) : null;
      if (!published) throw Error('That capability is not published in this project.');
      if (!published.selftest?.ok) throw Error('The capability fails its self-test.');
      const challenge = challengeOfCapability(published.capability);
      if (!challenge) throw Error('That capability belongs to no registered challenge.');
      challengeId = challenge;
      const res = ledgerRecordEvent(current.economy, {
        type: 'skill-saved', scopeId: challenge,
        evidence: {
          challengeId: challenge, capabilityId: published.capability.id, key,
          revision: Number(published.capability.revision) || 1,
        },
      });
      if (!res.ok) throw Error(res.error);
      current.economy = res.economy; claimed = res.claimed; amount = res.amount || 0;
      return current;
    }, { reason: `skill-saved:${key || '?'}`, versioned: false });
    return { ...result, claimed, amount, challengeId };
  }

  /**
   * Mark an Academy room complete in the envelope. This is the RECORD the
   * tutorial-task existence check reads; only the Academy calls it, on real
   * completion of the room's challenge. Idempotent — no revision bump on replay.
   */
  async function markTutorialRoom(room) {
    const n = Number(room);
    const result = await mutate(current => {
      normalizeProject(current);
      if (!Number.isInteger(n) || n < 1) throw Error('Invalid Academy room.');
      current.progress ||= {};
      current.progress.tutorialRooms ||= {};
      if (current.progress.tutorialRooms[n] === true) return null;
      current.progress.tutorialRooms[n] = true;
      return current;
    }, { reason: `tutorial-room:${room}`, versioned: false });
    return { ...result, room: n };
  }

  /**
   * Record "finished a tutorial task". Requires the room to be COMPLETED in the
   * envelope first (`markTutorialRoom`), so a caller cannot mint the reward for a
   * room the project has no evidence of finishing. Scoped per room; replays are
   * harmless.
   */
  async function recordTutorialTask(room) {
    let claimed = false, amount = 0;
    const n = Number(room);
    const result = await mutate(current => {
      normalizeProject(current);
      if (!Number.isInteger(n) || n < 1) throw Error('Invalid Academy room.');
      if (current.progress?.tutorialRooms?.[n] !== true) throw Error('That Academy room is not completed in this project.');
      const res = ledgerRecordEvent(current.economy, {
        type: 'tutorial-task', scopeId: `academy-room-${n}`, evidence: { room: n },
      });
      if (!res.ok) throw Error(res.error);
      current.economy = res.economy; claimed = res.claimed; amount = res.amount || 0;
      return current;
    }, { reason: `tutorial-task:${n}`, versioned: false });
    return { ...result, claimed, amount };
  }

  /** Capability contract: publish (immutable, validated) → install → run. */
  async function publishSkill(capability) {
    let error = null, published = false, key = null;
    const result = await skillMutation(current => {
      const out = publishCapability(current, capability);
      if (!out.ok) throw Error(out.error);
      published = out.published; key = out.key;
    }, 'publish-skill');
    return error ? { ok: false, error, project: result.project } : { ...result, published, key };
  }
  async function installSkill(capabilityRef, hostInstanceId, opts) {
    let error = null, installation = null;
    const result = await skillMutation(current => {
      const out = registryInstallSkill(current, capabilityRef, hostInstanceId, opts);
      if (!out.ok) throw Error(out.error);
      installation = out.installation;
    }, 'install-skill');
    return error ? { ok: false, error, project: result.project } : { ...result, installation };
  }
  /**
   * Record one completed City run for a CHALLENGE and, in the SAME transaction,
   * commit the learning events its evidence supports. The scope is ALWAYS the
   * challenge id — never a machine id — so a copied machine cannot earn again.
   * A newer revision that fixes a previously-wrong item on the same scenario
   * earns `revision-fixed` here, from the recorded comparison itself.
   * @param {object} outcome {revision, scenario, results | wrongIds, gradedIds}
   * @param {Array<{type:string, evidence:object}>} events
   */
  async function recordChallengeOutcome(challengeId, outcome = {}, events = [], { at = null } = {}) {
    let claimed = [], fixedIds = [], previousRevision = null, badgeTier = null, badgeState = null;
    const result = await mutate(current => {
      // The pure body runs INSIDE the transaction, so the evidence-existence
      // checks and the writes they gate are one atomic unit.
      const applied = applyChallengeOutcome(current, challengeId, outcome, events, { at });
      claimed = applied.claimed; fixedIds = applied.fixedIds; previousRevision = applied.previousRevision;
      badgeState = applied.badgeState; badgeTier = applied.badgeTier;
      return applied.project;
    }, { reason: `challenge:${challengeId}`, versioned: true });
    if (result.ok && badgeState) mirrorBadges({ projects: { badges: badgeState } });
    return { ...result, claimed, fixedIds, previousRevision, badgeTier };
  }

  /** Badge state + earned statues, derived from the envelope's own evidence. */
  async function readAchievements() {
    const project = await freshActive();
    return { badges: clone(project.projects?.badges || null), statues: statueStatus(project), economy: clone(project.economy) };
  }

  async function runSkill(installationId, observation, opts) {
    let error = null, decision = null;
    const result = await skillMutation(current => {
      const out = registryRunSkill(current, installationId, observation, opts);
      if (!out.ok) throw Error(out.error);
      decision = { decision: out.decision, confidence: out.confidence, voteShare: out.voteShare, abstained: out.abstained, abstainReason: out.abstainReason, evidence: out.evidence };
    }, `run-skill:${installationId}`);
    return error ? { ok: false, error, project: result.project } : { ...result, ...decision };
  }
  async function skillMutation(change, reason) {
    let error = null;
    const result = await mutate(current => {
      normalizeProject(current);
      try { change(current); return current; }
      catch (e) { error = String(e.message || e); return null; }
    }, { reason, versioned: false });
    return { ...result, ok: result.ok && !error, error: error || result.error };
  }

  async function economyMutation(nextEconomy, reason) {
    let error = null;
    const result = await mutate(current => {
      normalizeProject(current);
      try { current.economy = nextEconomy(current); return current; }
      catch (e) { error = String(e.message || e); return null; }
    }, { reason, versioned: false });
    if (error) return { ok: false, error, project: result.project, economy: clone(result.project?.economy) };
    return { ...result, economy: clone(result.project.economy) };
  }

  async function checkpoint(reason = 'manual') {
    if (!active) await openActiveProject();
    const expected = binding(), d = await db();
    if (!bound(expected)) return stale();
    if (!d) return { ok: false, storageUnavailable: true };
    return new Promise(resolve => {
      const tx = d.transaction(['projects', 'versions'], 'readwrite');
      const request = tx.objectStore('projects').get(expected.projectId);
      let project;
      request.onsuccess = () => {
        if (!bound(expected) || !request.result) { tx.abort(); return; }
        project = request.result;
        tx.objectStore('versions').put({ key: `${project.id}:${project.revision}`, projectId: project.id, reason, savedAt: now(), project: clone(project) });
      };
      tx.oncomplete = () => { if (bound(expected)) active = normalizeProject(project); resolve({ ok: true, project: clone(project) }); };
      tx.onerror = tx.onabort = () => resolve({ ok: false, error: 'Recovery snapshot could not be saved.' });
    });
  }
  async function exportProject() {
    const project = await freshActive();
    if (!bound(binding())) return stale();
    return exportProjectEnvelope(project);
  }
  async function importProject(archive, { stage, activate } = {}) {
    if (!stage && !activate && storage === safeStorage() && typeof window !== 'undefined') {
      try { const { restoreProjectBackup } = await import('./backup-coordinator.js'); return await restoreProjectBackup(archive, { store: api }); }
      catch (error) { return { ok: false, error: error.message }; }
    }
    const parsed = importProjectEnvelope(archive); if (!parsed.ok) return parsed;
    if (!active) await openActiveProject();
    const expected = binding();
    const recovery = await checkpoint('before-import'); if (!recovery.ok) return recovery;
    const project = normalizeProject(parsed.project);
    project.progress ||= {}; project.progress.importedFrom = project.id;
    project.id = id(); project.createdAt = now(); project.updatedAt = now();
    if (!bound(expected)) return stale();
    try { if (stage) await stage(project); }
    catch (error) { return { ok: false, error: error.message }; }
    if (!bound(expected)) return stale();
    const ok = await write(project, 'import', expected.projectId);
    if (!ok) return { ok: false, storageFull: true };
    if (!bound(expected)) return stale();
    try { activatePointer(project, activate); }
    catch (error) { return { ok: false, error: error.message }; }
    generation++; active = project;
    mirrorBadges(active); emit({ type: 'imported', projectId: active.id });
    return { ok: true, project: clone(active) };
  }
  async function restoreLegacyCity() { if (!active) await openActiveProject(); const state = active.projects.city?.legacyState; if (!state) return { ok: false, error: 'This project has no City data.' }; return writeState(state, storage); }
  async function restoreRevision(revision) {
    if (!active) await openActiveProject();
    const expected = binding();
    const found = (await versions(expected.projectId)).find(v => v.project.revision === revision);
    if (!bound(expected)) return stale();
    if (!found) return { ok: false, error: 'That revision is not available.' };
    return mutate(() => clone(found.project), { reason: 'before-revision-restore' });
  }
  const api = {
    openActiveProject, createProject: createAndOpen, mutate,
    readSection: async section => clone((await freshActive()).projects?.[section] || {}),
    commitSection, checkpoint, listVersions: versions, restoreRevision, flush: checkpoint,
    syncStatus: () => ({ state: 'local', label: 'Saved on this device' }), exportProject, importProject, restoreLegacyCity,
    readEconomy, transact, award, purchase, equipItem, recordLearningEvent,
    readCapabilities: async () => clone((await freshActive()).capabilities || {}),
    readInstallations: async () => clone((await freshActive()).installations || {}),
    readChallenges: async () => clone((await freshActive()).challenges),
    readAchievements,
    listProjects, switchProject, copyProject,
    publishSkill, installSkill, runSkill, recordChallengeOutcome,
    recordSkillSaved, markTutorialRoom, recordTutorialTask,
    close: () => { channel?.close(); dbPromise?.then(d => d?.close()); },
  };
  return api;
}

function safeStorage() { try { return globalThis.localStorage || null; } catch { return null; } }
