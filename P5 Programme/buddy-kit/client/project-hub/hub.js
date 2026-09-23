import { attachArchiveAsset, createProjectStore, importProjectEnvelope } from '../city-common/project-store.js';
import { CF_KEYS, collectState, writeState } from '../city-common/champion-file.js';
import { loadCustomSkinBlob, loadCustomSkinMetadata, saveCustomSkin } from '../champion-city/custom-skin.js';
import { parseCityLayout, projectHubView } from './hub-state.js';
import { FIT_STUDIO_URL, WORKSHOP_URL } from '../shared/links.js';
import { resetNewCityDraft } from '../city-common/new-city-draft.js';

const $ = selector => document.querySelector(selector);
const store = createProjectStore();
let activeProject = null;
const CITY_LAYOUT_KEY = CF_KEYS.layout;
const isLocalDemo = ['localhost', '127.0.0.1'].includes(location.hostname);

function probeIndexedDB() {
  return new Promise(resolve => {
    if (!window.indexedDB) return resolve(false);
    const request = indexedDB.open('passiona_demo_probe', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('probe');
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('probe', 'readwrite'); tx.objectStore('probe').put('ok', 'ready');
      tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase('passiona_demo_probe'); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    };
  });
}

async function runDemoCheck() {
  const panel = $('#demo-check'), result = $('#demo-check-result'), button = $('#run-demo-check');
  button.disabled = true; result.textContent = 'Checking this browser and the local demo server…';
  const routeChecks = await Promise.all(['/hub/', '/pregame/', '/planner/', '/city-builder/']
    .map(path => fetch(path, { method:'HEAD', cache:'no-store' }).then(response => response.ok).catch(() => false)));
  let localStorageReady = false;
  try { localStorage.setItem('passiona_demo_probe', 'ok'); localStorage.removeItem('passiona_demo_probe'); localStorageReady = true; } catch {}
  const canvas = document.createElement('canvas');
  const webgl = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  const [indexedDBReady, server] = await Promise.all([
    probeIndexedDB(),
    fetch('/api/demo/health', { cache:'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null),
  ]);
  const permission = async name => navigator.permissions?.query ? navigator.permissions.query({ name }).then(value => value.state).catch(() => 'unknown') : 'unknown';
  const [camera, microphone] = await Promise.all([permission('camera'), permission('microphone')]);
  const failures = [];
  if (!routeChecks.every(Boolean)) failures.push('one or more programme pages are missing');
  if (!localStorageReady || !indexedDBReady) failures.push('browser storage is unavailable');
  if (!webgl) failures.push('WebGL is unavailable');
  if (!server?.gateway) failures.push('the local Buddy gateway is unavailable');
  result.textContent = 'Checking one short Buddy reply…';
  const buddy = server?.gateway
    ? await fetch('/api/demo/check', { method:'POST', cache:'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null)
    : null;
  if (server?.gateway && !buddy?.ready) failures.push(buddy?.message || 'Buddy could not complete an AI reply');
  const buddyStatus = buddy?.ready ? 'AI reply received' : (server?.gateway ? 'AI reply unavailable' : 'AI reply not checked');
  const gatewayStatus = server?.gateway ? 'Gateway reachable' : 'Gateway unavailable';
  panel.classList.toggle('is-ready', failures.length === 0); panel.classList.toggle('has-warning', failures.length > 0);
  result.textContent = failures.length
    ? `${gatewayStatus}; ${buddyStatus}. Needs attention: ${failures.join('; ')}. Camera: ${camera}; microphone: ${microphone}.`
    : `${gatewayStatus}; ${buddyStatus} from DeepSeek V4 Flash. Local pages, storage, and WebGL are ready. Open Fit Studio and AI Workshop in their own tabs to check the live tools. Camera: ${camera}; microphone: ${microphone}.`;
  button.disabled = false; button.textContent = 'Check again';
}

function hydrateCityState(state) {
  const layout = parseCityLayout(state?.layout);
  if (!layout) return { ok:false, error:'This project has no usable City layout.' };
  const before = Object.fromEntries(Object.values(CF_KEYS).map(key => [key, localStorage.getItem(key)]));
  const result = writeState(state, localStorage);
  if (result.ok && parseCityLayout(localStorage.getItem(CITY_LAYOUT_KEY))) return { ok:true };
  for (const [key, raw] of Object.entries(before)) {
    try { raw === null ? localStorage.removeItem(key) : localStorage.setItem(key, raw); } catch {}
  }
  return { ok:false, error:'The City could not be restored on this device.' };
}

async function reconcileCity(project) {
  const localRaw = localStorage.getItem(CITY_LAYOUT_KEY);
  const localLayout = parseCityLayout(localRaw);
  const projectState = project?.projects?.city?.legacyState || {};
  const projectLayout = parseCityLayout(projectState.layout);
  if (localLayout) {
    if (projectState.layout !== localRaw) {
      const mirrored = await store.commitSection('city', { legacyState:{ ...projectState, ...collectState(localStorage), layout:localRaw } }, project.revision);
      if (mirrored.ok) return mirrored.project;
    }
    project.projects.city = { ...(project.projects.city || {}), legacyState:{ ...projectState, layout:localRaw } };
    return project;
  }
  // Only an actually empty runtime is hydrated automatically. A malformed
  // local value remains an explicit no-saved-city state instead of being hidden.
  if (localRaw === null && projectLayout) {
    const restored = hydrateCityState(projectState);
    if (!restored.ok) throw new Error(restored.error);
  } else if (!localLayout) {
    project.projects.city = { ...(project.projects.city || {}), legacyState:{} };
  }
  return project;
}

function formatCheckpoint(value) {
  if (!value) return 'No checkpoint time yet';
  try { return `Last checkpoint: ${new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`; }
  catch { return 'Checkpoint saved on this device'; }
}

function render(project, versions) {
  const view = projectHubView(project, versions.length);
  activeProject = project;
  $('#project-name').textContent = view.name;
  $('#summary').textContent = formatCheckpoint(view.updatedAt);
  $('#project-revision').textContent = `Project revision ${view.projectRevision}`;
  $('#checkpoint-count').textContent = `${view.checkpointCount} recovery checkpoint${view.checkpointCount === 1 ? '' : 's'}`;
  $('#studio-transfer').textContent = view.studioRevision ? `Studio transfer · revision ${view.studioRevision}` : 'No Studio transfer yet';
  $('#city-count').textContent = view.hasSavedCity ? `1 saved city · ${view.buildingCount} building${view.buildingCount === 1 ? '' : 's'}` : '0 saved cities · ready to grow';
  $('#machine-count').textContent = isLocalDemo ? 'Build machines locally. Buddy uses your configured online provider.' : 'Build AI skills online. Internet is required; work saves separately.';
  $('#studio-count').textContent = isLocalDemo ? 'Workshop and Studio share a Champion File. City work stays separate.' : 'Shape and dress your Champion in the live Studio. Work there saves separately.';
  for (const name of ['planner', 'city']) $(`#${name}-revision`).textContent = `REV ${view.revisions[name]}`;
  $('#continue').href = '/city-builder/?example=1';
  $('#continue-label').textContent = 'Open the example AI City';
  $('#continue-cue').hidden = true;
  const cityAction = $('#city-action');
  cityAction.href = '/city-builder/?example=1';
  $('#saved-city-action').hidden = !view.hasSavedCity;
  $('#health').innerHTML = '<span aria-hidden="true">✓</span> Saved on this device';
  $('#health').classList.remove('error');
}

async function openProject() {
  try {
    const project = await reconcileCity(await store.openActiveProject());
    render(project, await store.listVersions(project.id));
  } catch (error) {
    $('#summary').textContent = 'Your workspaces are still available below.';
    $('#health').textContent = `Project could not be opened: ${error?.message || error}`;
    $('#health').classList.add('error');
  }
}

$('#download-project').addEventListener('click', async () => {
  const status = $('#health');
  try {
    const result = await store.exportProject();
    if (!result.ok) throw new Error(result.error || 'The project could not be prepared.');
    const [champion, metadata] = await Promise.all([loadCustomSkinBlob(), loadCustomSkinMetadata()]);
    if (champion) attachArchiveAsset(result.archive, { bytes:await champion.arrayBuffer(), role:'champion-glb', name:'champion.glb' });
    if (metadata) result.archive.manifest.champion = metadata;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.archive)], { type:'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(activeProject?.name || 'my-passiona-project').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'my-passiona-project'}.passiona`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.innerHTML = '<span aria-hidden="true">✓</span> Project archive downloaded';
  } catch (error) {
    status.textContent = error?.message || 'The project could not be downloaded.';
    status.classList.add('error');
  }
});

$('#open-project').addEventListener('change', async event => {
  const status = $('#health');
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try {
    status.textContent = 'Opening project archive…'; status.classList.remove('error');
    const archive = JSON.parse(await file.text());
    const parsed = importProjectEnvelope(archive);
    if (!parsed.ok) throw new Error(parsed.error);
    const restored = await store.importProject(archive);
    if (!restored.ok) throw new Error(restored.error || 'The project could not be saved.');
    const champion = Object.values(parsed.assets || {}).find(asset => asset.role === 'champion-glb');
    if (champion) await saveCustomSkin(new Blob([champion.bytes], { type:champion.mediaType }), archive.manifest?.champion || null);
    const cityState = restored.project?.projects?.city?.legacyState;
    if (parseCityLayout(cityState?.layout)) {
      const hydrated = hydrateCityState(cityState);
      if (!hydrated.ok) throw new Error(hydrated.error);
    }
    location.reload();
  } catch (error) {
    status.textContent = error?.message || 'That project could not be opened.';
    status.classList.add('error');
  }
});

if (isLocalDemo) {
  $('#demo-check').hidden = false;
  $('#run-demo-check').addEventListener('click', runDemoCheck);
}

$('#new-city-action').addEventListener('click', event => {
  if (resetNewCityDraft()) return;
  event.preventDefault();
  $('#health').textContent = 'This browser cannot keep a new draft. Check storage before starting.';
  $('#health').classList.add('error');
});

$('#studio-action').href = FIT_STUDIO_URL;
$('#workshop-action').href = WORKSHOP_URL;

openProject();
