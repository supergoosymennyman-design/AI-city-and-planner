import { latestDrivingRevision, publishDrivingRevision } from '../city-common/driving-project.js';
// Internal capability/revision bridge. Workshop skill tabs own the student launch action.
import { buildImageCapabilityV2, buildDriveCapability } from '../city-common/capability-export.js';
import { createProjectStore } from '../city-common/project-store.js';
// Loaded for its SIDE EFFECT: learning-events installs `window.PassionaLearning`,
// the async shared-wallet shim the Workshop's credits dialog (champion-controls.js)
// auto-detects. This module is the Workshop's always-loaded ES entry, so removing
// this import silently reverts the credits UI to the legacy session economy.
import '../city-common/learning-events.js';
import { RECYCLING_PREPROCESSING, RECYCLING_DIMENSION } from '../city-common/recycling.js';
import { DRIVE_HOST_TYPE } from '../city-common/driving.js';

const params = new URLSearchParams(location.search);
const TARGET = params.get('publishTarget');
const HOST_INSTANCE_ID = params.get('hostInstanceId');
const RETURN_TO = params.get('returnTo');
const MODEL_ID = params.get('model');
const SKILL = params.get('skill') === 'drive' ? 'drive' : 'image';

// The published image model's confidence threshold (the sure line, `1 − d²/2`).
// 0.2 admits neighbours within d ≤ 1.265 — the operating point for the curated
// 1024-dim features, where the same-class median distance (~1.23) is inside and the
// cross-class median (~1.35, the honest "unfamiliar" case) falls outside to the
// human-check tray. `?sure=` overrides it (used by the browser integration run).
const requested = params.has('sure') ? Number(params.get('sure')) : NaN;
const THRESHOLD = Number.isFinite(requested) ? Math.min(1, Math.max(0, requested)) : 0.2;


let store;
const fingerprint = (cap) => JSON.stringify([
  cap?.id, cap?.workshop?.sourceMachineId, cap?.input?.preprocessing, cap?.input?.dimension, cap?.input?.kind,
  cap?.model?.plusConstant, cap?.model?.k, cap?.model?.threshold,
  cap?.model?.vectors?.data_b64, cap?.model?.labels?.data_b64,
]);

/** Shared publish/install step: an identical trained state reuses its key, a changed one is a new revision. */
async function commit(capability, hostType) {
  if (!store) { store = createProjectStore(); await store.openActiveProject(); }
  const existing = await store.readCapabilities();
  const match = Object.keys(existing).find((k) => fingerprint(existing[k]) === fingerprint(capability));
  let key, revision;
  if (match) {
    key = match; revision = Number(existing[match].revision || 1);
  } else {
    let maxRev = 0;
    for (const k of Object.keys(existing)) if (k === capability.id || k.startsWith(`${capability.id}@`)) maxRev = Math.max(maxRev, Number(existing[k].revision || 1));
    capability.revision = maxRev + 1;
    const published = await store.publishSkill(capability);
    if (!published.ok) return { ok: false, error: published.error };
    key = published.key; revision = capability.revision;
  }
  // "Saved a runnable, student-edited skill" — existence-checked in the store:
  // the capability must really be published and pass its self-test, and the
  // reward is keyed to the CHALLENGE, never the machine, so improving or copying
  // a machine cannot mint a second one. A missing wallet never blocks a publish.
  try { await store.recordSkillSaved(key); } catch { /* wallet optional */ }
  let installed = false;
  if (HOST_INSTANCE_ID) {
    const res = await store.installSkill(key, HOST_INSTANCE_ID, { hostType });
    installed = !!res.ok;
    if (!res.ok) return { ok: false, error: res.error, key, revision };
  }
  return { ok: true, key, revision, installed, returnTo: RETURN_TO || null };
}

/**
 * Publish the placed photo model. Pure-ish orchestration over the store; exported so a
 * browser integration run can drive the exact production path with no button.
 * @returns {Promise<{ok:boolean,error?:string,key?:string,revision?:number,installed?:boolean}>}
 */
export async function publishImageModelToCity() {
  const game = window.WorkshopGame;
  const model = game?.publishImageModel ? game.publishImageModel(MODEL_ID || null) : null;
  if (!model) return { ok: false, error: 'no-image-model' };

  const out = buildImageCapabilityV2({
    id: `cap_${model.dataset}-knn`,
    name: model.name,
    labels: model.labels,
    preprocessing: RECYCLING_PREPROCESSING,
    dimension: RECYCLING_DIMENSION,
    k: model.k,
    threshold: Number.isFinite(requested) ? THRESHOLD : (model.threshold ?? THRESHOLD),
    examples: model.examples,
    // The capability declares which host kinds may run it; the sorter is the only
    // city installation an image classifier is meant for today.
    city: { hostTypes: ['sorter'], dataset: model.dataset },
    workshop: { dataset: model.dataset, modelId: model.blockId || model.id, sourceMachineId: game.sourceMachineId?.() || null },
  });
  if (!out.ok) return { ok: false, error: out.error };
  try { return await commit(out.capability, 'sorter'); }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

/**
 * Stage 5: publish the placed NUMBER-sense driving model as a `.cap` v2 numeric
 * bundle the City's test car runs. The threshold is the Model's OWN sure line
 * (game.js default 0.5), so the City reproduces the Workshop's decisions.
 * @returns {Promise<{ok:boolean,error?:string,key?:string,revision?:number,installed?:boolean}>}
 */
export async function publishDriveModelToCity() {
  const game = window.WorkshopGame;
  if(game?.drivingDraft?.().pieces.some(p=>p.drivingRole) || game?.drivingDraft?.().driving){
    await game.saveDrivingMachine();
    if(!store){store=createProjectStore();await store.openActiveProject();}
    let published;const result=await store.mutate(project=>{project.projects.workshopSkills={...project.projects.workshopSkills,driving:{...project.projects.workshopSkills?.driving,machineId:game.sourceMachineId()}};published=latestDrivingRevision(project);return project;},{reason:'compile-driving-machine'});
    return result.ok?{ok:true,key:published.key,revision:published.prepared.bundle.revision,installed:true}:result;
  }
  const pair = game?.publishDrivingPair?.();
  if (pair) {
    const machineId = game.sourceMachineId();
    await game.saveDrivingMachine?.();
    if (!store) { store = createProjectStore(); await store.openActiveProject(); }
    let published;
    const result = await store.mutate(project => {
      published = publishDrivingRevision(project, machineId, pair); return project;
    }, { reason: 'publish-driving-pair' });
    return result.ok ? { ok: true, ...published, installed: true, returnTo: RETURN_TO || null } : result;
  }
  const model = game?.publishDriveModel ? game.publishDriveModel(MODEL_ID || null) : null;
  if (!model) return { ok: false, error: 'no-drive-model' };

  const out = buildDriveCapability({
    id: 'cap_drive-knn',
    name: model.name,
    k: model.k,
    threshold: Number.isFinite(model.threshold) ? model.threshold : 0.5,
    examples: model.examples,
    city: { hostTypes: [DRIVE_HOST_TYPE], host: HOST_INSTANCE_ID || null },
    workshop: { modelId: model.id, fields: 'drive-v1', sourceMachineId: game.sourceMachineId?.() || null },
  });
  if (!out.ok) return { ok: false, error: out.error };
  try { return await commit(out.capability, DRIVE_HOST_TYPE); }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

/** Compatibility entry point for existing host integrations. */
export function publishToCity() {
  return SKILL === 'drive' ? publishDriveModelToCity() : publishImageModelToCity();
}

// A stable handle for the browser integration run and for the City's own diagnostics.
window.WorkshopPublish = {
  publish: publishToCity,
  publishImage: publishImageModelToCity,
  publishDrive: publishDriveModelToCity,
  params: { TARGET, HOST_INSTANCE_ID, RETURN_TO, MODEL_ID, SKILL, THRESHOLD },
};
