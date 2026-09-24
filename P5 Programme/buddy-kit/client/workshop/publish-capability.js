// publish-capability.js — Stage 4/5: the Workshop's PUBLISH bridge to the City.
//
// A module (not a classic script) because it must reach the shared capability contract
// and the authoritative project store under ../city-common/ — the same files the City
// itself imports, so the published bundle and the City runtime can never drift.
//
// It only acts when the page is opened by the City:
//   ?publishTarget=city&hostInstanceId=<id>&returnTo=<city url>
// and the payload is chosen by `skill`:
//   • (default / image)  the placed library photo model (TrashNet k-NN)  → .cap v2 IMAGE
//   • skill=drive        the placed Number-sense driving model            → .cap v2 NUMERIC
//
// For `skill=drive` the page ALSO loads the Driving starter, because the City's
// "Improve in the Workshop" link is a deliberate hand-off and the student must
// land on the activity the City sent them to. Nothing is ever auto-published: the
// child presses the button. Publishing is free and awards no credits by itself
// (plan §2: closing instructions or importing a template does not earn).
import { buildImageCapabilityV2, buildDriveCapability } from '../city-common/capability-export.js';
import { createProjectStore } from '../city-common/project-store.js';
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
const requested = Number(params.get('sure'));
const THRESHOLD = Number.isFinite(requested) ? Math.min(1, Math.max(0, requested)) : 0.2;

const STR = {
  en: {
    publish: 'Publish to my City', publishing: 'Publishing…', back: 'Back to my City',
    noModel: 'Train a photo model in the Data library first, then publish it here.',
    failed: 'That model could not be published.', ok: 'Published — your City can run it now.',
    installed: 'Connected to the recycling station.', ready: 'Aiming at the recycling station.',
    driveReady: 'Train the Driving machine below, then publish it to your car.',
    driveNoModel: 'Teach the Driving machine first (press Teach it), then publish it here.',
    driveOk: 'Published — your car will drive with this model now.',
    driveInstalled: 'Connected to your test car.',
  },
  'zh-Hant': {
    publish: '發佈到我的城市', publishing: '正在發佈…', back: '返回我的城市',
    noModel: '請先在資料庫訓練一個相片模型，然後在這裡發佈。',
    failed: '無法發佈這個模型。', ok: '已發佈 —— 你的城市現在可以運行它。',
    installed: '已連接到回收分類站。', ready: '正瞄準回收分類站。',
    driveReady: '在下方訓練駕駛機器，然後發佈到你的汽車。',
    driveNoModel: '請先教駕駛機器（按「教它」），然後在這裡發佈。',
    driveOk: '已發佈 —— 你的汽車現在會用這個模型駕駛。',
    driveInstalled: '已連接到你的測試汽車。',
  },
};
let lang = localStorage.getItem('hk_ai_city_lang_v1') || 'en';
if (!STR[lang]) lang = 'en';
const t = (key) => STR[lang][key] ?? STR.en[key] ?? key;

let store;
const fingerprint = (cap) => JSON.stringify([
  cap?.id, cap?.input?.preprocessing, cap?.input?.dimension, cap?.input?.kind,
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
    threshold: THRESHOLD,
    examples: model.examples,
    // The capability declares which host kinds may run it; the sorter is the only
    // city installation an image classifier is meant for today.
    city: { hostTypes: ['sorter'], dataset: model.dataset },
    workshop: { dataset: model.dataset, modelId: model.id },
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
  const model = game?.publishDriveModel ? game.publishDriveModel(MODEL_ID || null) : null;
  if (!model) return { ok: false, error: 'no-drive-model' };

  const out = buildDriveCapability({
    id: 'cap_drive-knn',
    name: model.name,
    k: model.k,
    threshold: Number.isFinite(model.threshold) ? model.threshold : 0.5,
    examples: model.examples,
    city: { hostTypes: [DRIVE_HOST_TYPE], host: HOST_INSTANCE_ID || null },
    workshop: { modelId: model.id, fields: 'drive-v1' },
  });
  if (!out.ok) return { ok: false, error: out.error };
  try { return await commit(out.capability, DRIVE_HOST_TYPE); }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
}

/** The banner's publish action for the active skill. */
export function publishToCity() {
  return SKILL === 'drive' ? publishDriveModelToCity() : publishImageModelToCity();
}

/** The small banner the City's publish button opens. */
function mountBanner() {
  const drive = SKILL === 'drive';
  const bar = document.createElement('div');
  bar.className = 'workshop-publish-bar';
  bar.dataset.skill = SKILL;
  bar.innerHTML = `<span class="wpb-note">${t(drive ? 'driveReady' : 'ready')}</span><button class="wpb-go" type="button">${t('publish')}</button><a class="wpb-back" hidden>${t('back')}</a>`;
  document.body.append(bar);
  const note = bar.querySelector('.wpb-note');
  const go = bar.querySelector('.wpb-go');
  const back = bar.querySelector('.wpb-back');
  if (RETURN_TO) back.href = RETURN_TO;
  go.addEventListener('click', async () => {
    go.disabled = true;
    note.textContent = t('publishing');
    const result = await publishToCity();
    if (!result.ok) {
      const noModel = drive ? result.error === 'no-drive-model' : result.error === 'no-image-model';
      note.textContent = noModel ? t(drive ? 'driveNoModel' : 'noModel') : t('failed');
      go.disabled = false;
      return;
    }
    note.textContent = result.installed ? `${t(drive ? 'driveOk' : 'ok')} ${t(drive ? 'driveInstalled' : 'installed')}` : t(drive ? 'driveOk' : 'ok');
    back.hidden = !RETURN_TO;
    if (RETURN_TO) location.href = RETURN_TO;
  });
}

/**
 * A City "Improve in the Workshop" hand-off for driving opens the Driving starter
 * so the student lands on the activity. We wait for the Workshop to load; if it
 * never does, the banner still works against whatever is on the table.
 */
function openDriveStarter() {
  let tries = 0;
  const tick = () => {
    const game = window.WorkshopGame;
    if (game && game.loadGalleryMachine) { game.loadGalleryMachine('drive-v1'); return; }
    if (tries++ < 100) setTimeout(tick, 100);
  };
  tick();
}

if (TARGET === 'city') {
  mountBanner();
  if (SKILL === 'drive') openDriveStarter();
}

// A stable handle for the browser integration run and for the City's own diagnostics.
window.WorkshopPublish = {
  publish: publishToCity,
  publishImage: publishImageModelToCity,
  publishDrive: publishDriveModelToCity,
  params: { TARGET, HOST_INSTANCE_ID, RETURN_TO, MODEL_ID, SKILL, THRESHOLD },
};
