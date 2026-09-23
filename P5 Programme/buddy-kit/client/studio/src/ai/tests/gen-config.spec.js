/**
 * gen-config.spec.js — the generation settings store (src/ai/gen-config.js), pure Node.
 * Node has no localStorage, so the first blocks exercise the in-memory fallback; the stub blocks
 * prove corrupt JSON and a throwing setItem degrade without throwing. Stubs are removed in `finally`.
 */
import {
  GEN_DEFAULTS, GEN_STEPS, ROUTE_STEPS, connectionFor, credentialValues, isConnectionReady, loadGenConfig, saveGenConfig, resetGenConfig, keyFor, isStepReady, isRouteReady,
} from '../gen-config.js';

const HAD = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
const PREV = globalThis.localStorage;
function restoreStorage() {
  if (HAD) globalThis.localStorage = PREV;
  else delete globalThis.localStorage;
}
function stub({ value = null, failSet = false, failRemove = false } = {}) {
  const m = new Map();
  if (value != null) m.set('studio.gen.config', value);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failSet) throw new Error('QuotaExceededError'); m.set(k, v); },
    removeItem: (k) => { if (failRemove) throw new Error('read-only storage'); m.delete(k); },
  };
}

export default function genConfigTests(check) {
  restoreStorage();
  resetGenConfig();
  const d = loadGenConfig();
  check('gen-config: defaults select a model for every step', GEN_STEPS.every((s) => typeof d.models[s] === 'string'));
  check('gen-config: standalone texture is skipped by default', d.models.texture === 'none' && isStepReady(d, 'texture'));
  check('gen-config: defaults carry empty reusable provider connections',
    d.connections['hf-spaces'].key === '' && d.connections.fal.key === '' && d.connections.fal.proxyUrl === '' &&
    d.connections['tencent-tokenhub'].key === '' && d.connections['tencent-tokenhub'].baseUrl === '');
  check('gen-config: defaults carry model-owned raw generation controls',
    d.controls['hunyuan3d-2mv'].octree_resolution === 256 &&
    d.controls['hunyuan3d-2mv'].target_face_num === 10000 &&
    d.controls['hunyuan3d-v3-fal'].face_count === 500000 &&
    d.controls['trellis-2-fal'].resolution === 1024);
  check('gen-config: routes A and B include the optional texture seam',
    ROUTE_STEPS.A.join() === 'edit,views3d,texture' && ROUTE_STEPS.B.join() === 'picture,picture3d,texture');
  check('gen-config: not ready without a key', !isRouteReady(d, 'A') && !isRouteReady(d, 'B'));

  saveGenConfig({ connections: { 'hf-spaces': { key: '  hf_test123456789  ' } } });
  const k = loadGenConfig();
  check('gen-config: a saved connection survives a reload (memory fallback)',
    k.connections['hf-spaces'].key === '  hf_test123456789  ');
  check('gen-config: keyFor trims', keyFor(k, 'edit') === 'hf_test123456789');
  check('gen-config: ready once the key is set', isRouteReady(k, 'A') && isRouteReady(k, 'B'));
  check('gen-config: saving a connection keeps the models', GEN_STEPS.every((s) => k.models[s] === GEN_DEFAULTS.models[s]));
  saveGenConfig({ controls: { 'hunyuan3d-2mv': { octree_resolution: 384, target_face_num: 24000 } } });
  const tuned = loadGenConfig();
  check('gen-config: adult raw controls persist without wiping sibling parameters',
    tuned.controls['hunyuan3d-2mv'].octree_resolution === 384 &&
    tuned.controls['hunyuan3d-2mv'].target_face_num === 24000 &&
    tuned.controls['hunyuan3d-2mv'].steps === 5);
  saveGenConfig({ controls: { 'hunyuan3d-2mv': { octree_resolution: 9999, target_face_num: 'bad' } } });
  const rejectedControls = loadGenConfig();
  check('gen-config: out-of-schema raw controls fall back to model defaults',
    rejectedControls.controls['hunyuan3d-2mv'].octree_resolution === 256 &&
    rejectedControls.controls['hunyuan3d-2mv'].target_face_num === 10000);
  saveGenConfig({ connections: { fal: { key: 'fal-secret', proxyUrl: 'https://proxy.example/api' } } });
  const connected = loadGenConfig();
  check('gen-config: provider connection can carry a key and protocol-specific server URL',
    connectionFor(connected, 'fal').key === 'fal-secret' && connectionFor(connected, 'fal').proxyUrl === 'https://proxy.example/api');
  check('gen-config: fal can use either a browser key or a compatible proxy connection',
    isConnectionReady(connected, 'fal') && isConnectionReady({ connections: { fal: { key: '', proxyUrl: 'https://proxy.example' } } }, 'fal') &&
    !isConnectionReady({ connections: { fal: { key: '', proxyUrl: '' } } }, 'fal'));
  check('gen-config: redaction values include secret fields but not server URLs',
    credentialValues(connected).includes('fal-secret') && !credentialValues(connected).includes('https://proxy.example/api'));
  saveGenConfig({ connections: { 'tencent-tokenhub': { key: 'tencent-secret', baseUrl: 'https://tokenhub-proxy.example' } } });
  const official = loadGenConfig();
  check('gen-config: an official model reuses its provider key and optional compatible URL',
    connectionFor(official, 'tencent-tokenhub').key === 'tencent-secret' &&
    connectionFor(official, 'tencent-tokenhub').baseUrl === 'https://tokenhub-proxy.example' &&
    credentialValues(official).includes('tencent-secret'));
  check('gen-config: selecting the official Tencent model uses its connection rather than another provider key',
    keyFor({ ...official, models: { ...official.models, picture3d: 'hunyuan3d-3.1-tokenhub' } }, 'picture3d') === 'tencent-secret');

  saveGenConfig({ models: { picture: 'trellis-2' } });
  const p = loadGenConfig();
  check('gen-config: saving a model keeps the connections', p.connections['hf-spaces'].key === '  hf_test123456789  ');
  check('gen-config: an unavailable or wrong-step model is not ready',
    !isStepReady(p, 'picture') && !isRouteReady(p, 'B') && isRouteReady(p, 'A'));
  check('gen-config: unknown route is never ready', !isRouteReady(p, 'C'));
  check('gen-config: keyFor tolerates junk', keyFor(null, 'edit') === '' && keyFor({}, 'edit') === '');
  check('gen-config: a model assigned to the wrong step is not ready',
    !isStepReady({ models: { picture: 'qwen-image-edit-2511' }, keys: { 'hf-spaces': 'key' } }, 'picture'));
  check('gen-config: a fal proxy alone makes its selected step ready', isStepReady({
    models: { picture: 'flux-1-schnell-fal' }, connections: { fal: { key: '', proxyUrl: 'https://proxy.example' } },
  }, 'picture'));
  check('gen-config: defaults are frozen', Object.isFrozen(GEN_DEFAULTS) && Object.isFrozen(GEN_DEFAULTS.connections) &&
    Object.values(GEN_DEFAULTS.connections).every(Object.isFrozen) && Object.isFrozen(GEN_DEFAULTS.controls) &&
    Object.values(GEN_DEFAULTS.controls).every(Object.isFrozen));

  const r = resetGenConfig();
  check('gen-config: reset forgets provider connections', r.connections['hf-spaces'].key === '' &&
    loadGenConfig().connections['hf-spaces'].key === '' && r.connections.fal.proxyUrl === '');

  try {
    // End the preceding memory-only session before installing independent storage fixtures.
    globalThis.localStorage = stub();
    resetGenConfig();
    globalThis.localStorage = stub({ value: '{not json' });
    check('gen-config: corrupt JSON loads defaults', loadGenConfig().connections['hf-spaces'].key === '');
    globalThis.localStorage = stub({ value: '[1,2]' });
    check('gen-config: an array loads defaults', loadGenConfig().models.edit === GEN_DEFAULTS.models.edit);
    globalThis.localStorage = stub({
      value: JSON.stringify({ models: { edit: 42, views3d: 'hunyuan3d-2.1' }, connections: { fal: { key: 7, proxyUrl: 'https://proxy.example' }, x: { key: 'k' } } }),
    });
    const w = loadGenConfig();
    check('gen-config: bad field types are ignored, good ones kept',
      w.models.edit === GEN_DEFAULTS.models.edit && w.models.views3d === 'hunyuan3d-2.1' &&
      w.connections.fal.key === '' && w.connections.fal.proxyUrl === 'https://proxy.example' && w.connections.x.key === 'k');
    globalThis.localStorage = stub({
      value: JSON.stringify({ providers: { edit: 'hf-spaces', views3d: 'hf-spaces' }, keys: { 'hf-spaces': 'old' } }),
    });
    const migrated = loadGenConfig();
    check('gen-config: old provider settings migrate to proven model defaults',
      migrated.models.edit === GEN_DEFAULTS.models.edit && migrated.models.views3d === GEN_DEFAULTS.models.views3d &&
      migrated.connections['hf-spaces'].key === 'old');
    check('gen-config: legacy flat keys become reusable provider connections',
      connectionFor(migrated, 'hf-spaces').key === 'old');
    globalThis.localStorage = stub({ failSet: true });
    let threw = false;
    try {
      saveGenConfig({ connections: { 'hf-spaces': { key: 'hf_kept_in_memory' } } });
    } catch (err) {
      threw = true;
    }
    check('gen-config: a throwing setItem does not throw', !threw);
    check('gen-config: ...and the value is kept for this session', loadGenConfig().connections['hf-spaces'].key === 'hf_kept_in_memory');
    resetGenConfig();
    globalThis.localStorage = stub({ value: JSON.stringify({ keys: { 'hf-spaces': 'old-key' } }), failSet: true });
    saveGenConfig({ connections: { 'hf-spaces': { key: 'new-key' } } });
    check('gen-config: failed replacement beats the stale saved key', loadGenConfig().connections['hf-spaces'].key === 'new-key');
    saveGenConfig({ models: { edit: 'another' } });
    check('gen-config: successive failed writes merge the session value', loadGenConfig().connections['hf-spaces'].key === 'new-key');
    resetGenConfig();
    globalThis.localStorage = stub({ value: JSON.stringify({ keys: { 'hf-spaces': 'old-key' } }), failSet: true, failRemove: true });
    resetGenConfig();
    check('gen-config: failed removal forgets the key for this session', loadGenConfig().connections['hf-spaces'].key === '');
    saveGenConfig({ models: { picture: 'another' } });
    check('gen-config: save after failed reset cannot resurrect the key', loadGenConfig().connections['hf-spaces'].key === '');
    const recovered = stub();
    globalThis.localStorage = recovered;
    saveGenConfig({ connections: { 'hf-spaces': { key: 'recovered-key' } } });
    check('gen-config: recovered writes persist the session value',
      JSON.parse(recovered.getItem('studio.gen.config')).connections['hf-spaces'].key === 'recovered-key');
    recovered.removeItem('studio.gen.config');
    check('gen-config: another tab deleting storage clears the mirror', loadGenConfig().connections['hf-spaces'].key === '');
    recovered.setItem('studio.gen.config', JSON.stringify({ keys: { 'hf-spaces': 'read-key' } }));
    loadGenConfig();
    recovered.getItem = () => { throw new Error('blocked'); };
    check('gen-config: a successful read refreshes the fallback', loadGenConfig().connections['hf-spaces'].key === 'read-key');
  } finally {
    globalThis.localStorage = stub();
    resetGenConfig();
    restoreStorage();
    resetGenConfig();
  }
}
