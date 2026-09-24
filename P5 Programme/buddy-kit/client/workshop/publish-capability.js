// publish-capability.js — Stage 4: the Workshop's PUBLISH bridge to the City.
//
// A module (not a classic script) because it must reach the shared capability contract
// and the authoritative project store under ../city-common/ — the same files the City
// itself imports, so the published bundle and the City runtime can never drift.
//
// It only acts when the page is opened by the City's sorter host:
//   ?publishTarget=city&hostInstanceId=<id>&returnTo=<city url>
// It takes the student's placed library photo model (TrashNet k-NN) from the Workshop's
// own `window.WorkshopGame.publishImageModel()` seam, builds a .cap v2 IMAGE bundle,
// publishes it into the project envelope, and (when a host instance is named) installs
// it on that host. The City then runs the very same immutable revision.
//
// Nothing here is ever auto-run: the child presses the button. Publishing is free and
// awards no credits by itself (plan §2: closing instructions or importing a template
// does not earn).
import { buildImageCapabilityV2 } from '../city-common/capability-export.js';
import { createProjectStore } from '../city-common/project-store.js';
import { RECYCLING_PREPROCESSING, RECYCLING_DIMENSION } from '../city-common/recycling.js';

const params = new URLSearchParams(location.search);
const TARGET = params.get('publishTarget');
const HOST_INSTANCE_ID = params.get('hostInstanceId');
const RETURN_TO = params.get('returnTo');
const MODEL_ID = params.get('model');

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
  },
  'zh-Hant': {
    publish: '發佈到我的城市', publishing: '正在發佈…', back: '返回我的城市',
    noModel: '請先在資料庫訓練一個相片模型，然後在這裡發佈。',
    failed: '無法發佈這個模型。', ok: '已發佈 —— 你的城市現在可以運行它。',
    installed: '已連接到回收分類站。', ready: '正瞄準回收分類站。',
  },
};
let lang = localStorage.getItem('hk_ai_city_lang_v1') || 'en';
if (!STR[lang]) lang = 'en';
const t = (key) => STR[lang][key] ?? STR.en[key] ?? key;

let store;
const fingerprint = (cap) => JSON.stringify([
  cap?.id, cap?.input?.preprocessing, cap?.input?.dimension,
  cap?.model?.k, cap?.model?.threshold,
  cap?.model?.vectors?.data_b64, cap?.model?.labels?.data_b64,
]);

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

  try {
    if (!store) { store = createProjectStore(); await store.openActiveProject(); }
    const existing = await store.readCapabilities();
    // Re-publishing the SAME trained state is a no-op, not a new revision: an
    // identical fingerprint reuses the published key so the City never sees a
    // spurious "update available".
    const match = Object.keys(existing).find((k) => fingerprint(existing[k]) === fingerprint(out.capability));
    let key;
    let revision;
    if (match) {
      key = match; revision = Number(existing[match].revision || 1);
    } else {
      let maxRev = 0;
      for (const k of Object.keys(existing)) if (k === out.capability.id || k.startsWith(`${out.capability.id}@`)) maxRev = Math.max(maxRev, Number(existing[k].revision || 1));
      out.capability.revision = maxRev + 1;
      const published = await store.publishSkill(out.capability);
      if (!published.ok) return { ok: false, error: published.error };
      key = published.key; revision = out.capability.revision;
    }
    let installed = false;
    if (HOST_INSTANCE_ID) {
      const res = await store.installSkill(key, HOST_INSTANCE_ID, { hostType: 'sorter' });
      installed = !!res.ok;
      if (!res.ok) return { ok: false, error: res.error, key, revision };
    }
    return { ok: true, key, revision, installed, returnTo: RETURN_TO || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** The small banner the City's publish button opens. */
function mountBanner() {
  const bar = document.createElement('div');
  bar.className = 'workshop-publish-bar';
  bar.innerHTML = `<span class="wpb-note">${t('ready')}</span><button class="wpb-go" type="button">${t('publish')}</button><a class="wpb-back" hidden>${t('back')}</a>`;
  document.body.append(bar);
  const note = bar.querySelector('.wpb-note');
  const go = bar.querySelector('.wpb-go');
  const back = bar.querySelector('.wpb-back');
  if (RETURN_TO) back.href = RETURN_TO;
  go.addEventListener('click', async () => {
    go.disabled = true;
    note.textContent = t('publishing');
    const result = await publishImageModelToCity();
    if (!result.ok) {
      note.textContent = result.error === 'no-image-model' ? t('noModel') : t('failed');
      go.disabled = false;
      return;
    }
    note.textContent = result.installed ? `${t('ok')} ${t('installed')}` : t('ok');
    back.hidden = !RETURN_TO;
    if (RETURN_TO) location.href = RETURN_TO;
  });
}

if (TARGET === 'city') mountBanner();

// A stable handle for the browser integration run and for the City's own diagnostics.
window.WorkshopPublish = { publish: publishImageModelToCity, params: { TARGET, HOST_INSTANCE_ID, RETURN_TO, MODEL_ID, THRESHOLD } };
