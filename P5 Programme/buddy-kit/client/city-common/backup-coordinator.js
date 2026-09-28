import { validateProjectState } from './project-state-coordinator.js';
import { createProjectStore, exportProjectEnvelope, importProjectEnvelope, attachArchiveAsset, migrateChampionFile, migrateWorkshopChampion, MAX_ARCHIVE_BYTES, simpleHash } from './project-store.js';
import { collectState } from './champion-file.js';
import { normalizeCustomManifest, customModelStore, MAX_CUSTOM_LIBRARY_BYTES, validateGLB } from './custom-models.js';
import { loadCustomSkinBlob, loadCustomSkinMetadata, saveCustomSkin, clearCustomSkin, CUSTOM_SKIN_MAX_BYTES } from '../champion-city/custom-skin.js';
import { flushWorkspaces, captureWorkspaces, restoreWorkspaces, suspendWorkspaces, replaceCityState, championRecord } from './workspace.js';
import { bindWorkspace, assertWorkspace } from './project-binding.js';

export async function captureProject(store) {
  assertWorkspace();
  await flushWorkspaces();
  const current = await store.exportProject();
  if (!current.ok) throw Error(current.error);
  const projectId = current.archive.project.id;
  const record = await championRecord(projectId);
  const sections = await captureWorkspaces();
  const legacyState = sections.city?.legacyState || collectState();
  const result = await store.mutate(project => {
    project.projects.city = { ...project.projects.city, legacyState };
    if (record?.file) project.projects.workshop = { ...project.projects.workshop, champion: record.file };
    for (const [key, value] of Object.entries(sections)) project.projects[key] = { ...project.projects[key], ...value };
    return project;
  }, { reason: 'workspace-capture' });
  if (!result.ok) throw Error(result.error || 'Workspace could not be saved.');
  return result.project;
}

export async function buildProjectBackup(store = createProjectStore()) {
  assertWorkspace();
  await store.openActiveProject();
  const workspaceGeneration = localStorage.getItem('passiona_workspace_generation_v1');
  const project = await captureProject(store);
  const out = exportProjectEnvelope(project);
  if (!out.ok) throw Error(out.error);
  const archive = out.archive;
  archive.manifest.assetReferences = { models: [], champion: null };
  const manifest = normalizeCustomManifest(project.projects.city?.legacyState?.customModels);
  const rawProps = project.projects.city?.legacyState?.props || '';
  for (const match of rawProps.matchAll(/"id"\s*:\s*"custom:([^"]+)"/g)) {
    if (!manifest.models.some(model => model.id === match[1])) throw Error(`Custom model ${match[1]} has no saved reference. Reattach it before downloading.`);
  }
  let total = 0;
  for (const model of manifest.models) {
    const saved = await customModelStore.get(model.id, project.id);
    if (!saved?.bytes) throw Error(`“${model.name}” is missing. Reattach its GLB before downloading a complete project.`);
    const valid = validateGLB(saved.bytes, { totalBytes: total });
    if (!valid.ok) throw Error(`${model.name}: ${valid.error}`);
    total += saved.bytes.byteLength;
    const attached = attachArchiveAsset(archive, { bytes: saved.bytes, role: 'custom-model', name: model.name });
    if (!attached.ok) throw Error(attached.error);
    archive.manifest.assetReferences.models.push({ id: model.id, hash: attached.hash });
  }
  const champion = await loadCustomSkinBlob(project.id);
  if (champion) {
    if (champion.size > CUSTOM_SKIN_MAX_BYTES) throw Error('Champion GLB exceeds the 64 MiB limit. Use a smaller model.');
    const attached = attachArchiveAsset(archive, { bytes: await champion.arrayBuffer(), role: 'champion-glb', name: 'champion.glb' });
    if (!attached.ok) throw Error(attached.error);
    archive.manifest.assetReferences.champion = { hash: attached.hash, metadata: await loadCustomSkinMetadata(project.id) };
  } else if (['custom', '__custom__'].includes(project.projects.city?.legacyState?.skin)) {
    throw Error('The custom Champion is missing. Reattach its GLB before downloading a complete project.');
  }
  archive.manifest.assetReferencesIntegrity = simpleHash(JSON.stringify(archive.manifest.assetReferences));
  const raw = JSON.stringify(archive);
  if (new TextEncoder().encode(raw).byteLength > MAX_ARCHIVE_BYTES) throw Error('The complete project exceeds 80 MiB. Reduce custom model sizes and try again.');
  const verified = importProjectEnvelope(archive);
  if (!verified.ok) throw Error(verified.error);
  assertWorkspace();
  if (localStorage.getItem('passiona_workspace_generation_v1') !== workspaceGeneration) throw Error('Project changed during backup. Reload and try again.');
  return archive;
}

export async function downloadProject({ store, label } = {}) {
  const archive = await buildProjectBackup(store);
  const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${String(label || archive.project.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'my-project'}.passiona`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return archive;
}

export function parseProjectBackup(value) {
  if (value?.kind === 'passiona-champion-file') {
    const migrated = migrateChampionFile(value);
    return migrated.ok ? exportProjectEnvelope(migrated.project) : migrated;
  }
  if (value?.kind === 'ai-champion' && value.version === 1 && value.champion && value.projects) {
    return exportProjectEnvelope(migrateWorkshopChampion(value));
  }
  const parsed = importProjectEnvelope(value);
  return parsed.ok ? { ok: true, archive: value } : parsed;
}

async function stageProject(project, parsed, archive) {
  const references = archive.manifest?.assetReferences;
  const models = references?.models || [];
  let total = 0;
  for (const ref of models) {
    const asset = parsed.assets[ref.hash];
    const valid = validateGLB(asset.bytes, { totalBytes: total });
    if (!valid.ok) throw Error(valid.error);
    total += asset.bytes.byteLength;
    if (total > MAX_CUSTOM_LIBRARY_BYTES) throw Error('Custom model library exceeds 36 MiB.');
    await customModelStore.put({ id: ref.id, bytes: asset.bytes, name: asset.name }, project.id);
  }
  const championRef = references?.champion;
  const champion = championRef ? parsed.assets[championRef.hash] : Object.values(parsed.assets).find(a => a.role === 'champion-glb');
  if (champion) {
    if (champion.bytes.byteLength > CUSTOM_SKIN_MAX_BYTES) throw Error('Champion GLB exceeds 64 MiB.');
    await saveCustomSkin(new Blob([champion.bytes]), championRef?.metadata || archive.manifest?.champion || null, project.id);
  }
  const file = project.projects.workshop?.champion;
  if (file) await championRecord(project.id, (_, records) => {
    records.put({ revision: 1, generation: crypto.randomUUID(), file }, `project:${project.id}`);
  });
  await restoreWorkspaces(project);
}

export async function restoreProjectBackup(value, { store = createProjectStore() } = {}) {
  const checked = parseProjectBackup(value);
  if (!checked.ok) throw Error(checked.error);
  const parsed = importProjectEnvelope(checked.archive);
  if (!parsed.ok) throw Error(parsed.error);
  assertWorkspace();
  const city = validateProjectState(parsed.project.projects.city?.legacyState || {});
  if (!city.ok) throw Error(city.error);
  if (parsed.project.projects.workshop?.champion) {
    await import('../workshop/toolbox/champion-session.js');
    globalThis.ChampionSession.prepare(parsed.project.projects.workshop.champion);
  }
  await store.openActiveProject();
  await captureProject(store);
  suspendWorkspaces();
  let stagedId;
  try {
    const result = await store.importProject(checked.archive, {
      stage: (project) => { stagedId = project.id; return stageProject(project, parsed, checked.archive); },
      activate: project => { const before = replaceCityState(project.projects.city?.legacyState || {}); return () => replaceCityState(before); },
    });
    if (!result.ok) throw Error(result.error || 'Restore failed; your previous project is still available.');
    bindWorkspace(result.project.id, { rebind: true });
    return result;
  } catch (error) {
    if (stagedId) await discardStagedProject(stagedId, checked.archive).catch(() => {});
    suspendWorkspaces(false); throw error;
  }
}

export async function switchWorkspaceProject(store, projectId) {
  await captureProject(store);
  const saved = await store.checkpoint('before-project-switch');
  if (!saved.ok) throw Error(saved.error || 'The current project could not be saved.');
  suspendWorkspaces();
  try {
    const result = await store.switchProject(projectId, { prepare: restoreWorkspaces, activate: project => { const before = replaceCityState(project.projects.city?.legacyState || {}); return () => replaceCityState(before); } });
    if (!result.ok) throw Error(result.error);
    bindWorkspace(result.project.id, { rebind: true }); return result;
  } catch (error) { suspendWorkspaces(false); throw error; }
}

export async function copyProjectAssets(source, copy) {
  const manifest = normalizeCustomManifest(source.projects.city?.legacyState?.customModels);
  for (const model of manifest.models) {
    const saved = await customModelStore.get(model.id, source.id);
    if (!saved?.bytes) throw Error(`Reattach ${model.name} before copying this project.`);
    await customModelStore.put(saved, copy.id);
  }
  const champion = await loadCustomSkinBlob(source.id);
  if (champion) await saveCustomSkin(champion, await loadCustomSkinMetadata(source.id), copy.id);
  const file = copy.projects.workshop?.champion;
  if (file) await championRecord(copy.id, (_, records) => records.put({ revision:1, generation:crypto.randomUUID(), file }, `project:${copy.id}`));
}

export function showRestoreFailure(error, value) {
  const zh = document.documentElement.lang.startsWith('zh');
  const dialog=document.createElement('dialog'); dialog.id='restore-results';
  dialog.style.cssText='max-width:560px;padding:24px;border:2px solid #46756b;border-radius:12px;z-index:100000';
  const title=document.createElement('h2'); title.textContent=zh?'還原失敗，已保留原專案':'Restore failed; previous project kept';
  const note=document.createElement('p'); note.textContent=error.message;
  dialog.append(title,note);
  dialog.addEventListener('cancel',event=>event.preventDefault());
  const button=(id,label,action)=>{const b=document.createElement('button');b.id=id;b.textContent=label;b.style.cssText='min-height:44px;margin:6px';b.onclick=()=>Promise.resolve().then(action).catch(e=>{note.textContent=e.message;});dialog.append(b);};
  button('restore-recovery',zh?'下載原專案':'Download previous project',()=>downloadProject());
  button('restore-imported',zh?'下載匯入原檔':'Download incoming file',()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=value.kind==='passiona.archive'?'incoming.passiona':'incoming.champion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  button('restore-retry',zh?'重試還原':'Retry restore',async()=>{await restoreProjectBackup(value);location.reload();});
  button('restore-continue',zh?'繼續編輯':'Keep working',()=>dialog.remove());
  document.body.append(dialog);dialog.showModal();
}

async function discardStagedProject(projectId, archive) {
  if (localStorage.getItem('passiona_active_project_v1') === projectId) return;
  for (const ref of archive.manifest?.assetReferences?.models || []) await customModelStore.remove(ref.id, projectId);
  await clearCustomSkin(projectId);
  await championRecord(projectId, (_, records) => records.delete(`project:${projectId}`));
  const db = await new Promise((resolve,reject) => {
    const req=indexedDB.open('passiona-projects-v1',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  await new Promise((resolve,reject) => {
    const tx=db.transaction(['projects','versions'],'readwrite');
    tx.objectStore('projects').delete(projectId);
    const versions=tx.objectStore('versions'), req=versions.getAll();
    req.onsuccess=()=>{for(const row of req.result)if(row.projectId===projectId)versions.delete(row.key);};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};
  });
}
