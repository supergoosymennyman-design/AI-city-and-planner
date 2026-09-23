/** fal provider tests use a fake client and fake fetch. No API or GPU call is made. */
import { createFalProvider } from '../gen-providers/fal.js';
import { modelById } from '../gen-models.js';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);

function harness(modelId, output = { data: { images: [{ url: 'data:image/png;base64,AAAA' }] } }, providerDeps = {}) {
  const log = { configs: [], calls: [], fetches: [] };
  const createClient = (config) => {
    log.configs.push(config);
    return {
      async subscribe(endpoint, options) {
        log.calls.push({ endpoint, options });
        options.onQueueUpdate({ status: 'IN_QUEUE', queue_position: 3 });
        options.onQueueUpdate({ status: 'IN_PROGRESS', logs: [] });
        return output;
      },
    };
  };
  const fetch = async (url, options) => {
    log.fetches.push({ url, options });
    return { ok: true, status: 200, blob: async () => new Blob(['image'], { type: 'image/png' }) };
  };
  return { provider: createFalProvider('fal-secret', modelById(modelId), { ...providerDeps, createClient, fetch }), log };
}

{
  const { provider, log } = harness('qwen-image-edit-2511-fal', undefined, { proxyUrl: ' https://proxy.example/fal ' });
  const grid = new Blob(['grid'], { type: 'image/png' });
  const statuses = [];
  const signal = new AbortController().signal;
  const out = await provider.editViews({ grid, prompt: 'make it round' }, { signal, onStatus: (s) => statuses.push(s) });
  const call = log.calls[0];
  rec('fal: creates an isolated client with only its own credential',
    log.configs.length === 1 && log.configs[0].credentials === 'fal-secret');
  rec('fal: a configured server URL is passed to the client once per provider connection',
    log.configs[0].proxyUrl === 'https://proxy.example/fal');
  rec('fal: Qwen edit uses its catalogue endpoint and real binary input wire format',
    call.endpoint === 'fal-ai/qwen-image-edit-2511' && call.options.input.image_urls.length === 1 &&
    call.options.input.image_urls[0] === grid && call.options.input.prompt === 'make it round');
  rec('fal: Qwen edit sends documented safe generation settings',
    call.options.input.num_inference_steps === 28 && call.options.input.guidance_scale === 4.5 &&
    call.options.input.enable_safety_checker === true && call.options.input.sync_mode === true);
  rec('fal: passes cancellation to subscribe and normalizes queue updates',
    call.options.abortSignal === signal && statuses.map((s) => s.stage).join() === 'queued,running' &&
    statuses[0].queuePosition === 3);
  rec('fal: downloads the returned image as a Blob with the same signal',
    out instanceof Blob && log.fetches[0].url.startsWith('data:image/png') && log.fetches[0].options.signal === signal);
}

{
  const { provider, log } = harness('flux-1-schnell-fal');
  await provider.wordsToPicture({ prompt: 'a small red robot' }, { onStatus() {} });
  const call = log.calls[0];
  rec('fal: FLUX uses its own endpoint and documented four-step payload',
    call.endpoint === 'fal-ai/flux/schnell' && call.options.input.prompt === 'a small red robot' &&
    call.options.input.num_inference_steps === 4 && !Object.hasOwn(call.options.input, 'image_urls'));
  const before = log.calls.length;
  const check = await provider.check('picture');
  rec('fal: Settings check is honest and never starts paid inference',
    check.ok && /no free/.test(check.detail) && log.calls.length === before);
}

{
  const output = { data: { model_glb: { url: 'https://fal.example/model.glb' } } };
  const { provider, log } = harness('hunyuan3d-v3-fal', output);
  const views = Object.fromEntries(['front', 'back', 'left', 'right'].map((name) =>
    [name, new Blob([name], { type: 'image/png' })]));
  const out = await provider.viewsTo3D(views, { onStatus() {} });
  const wire = log.calls[0].options.input;
  rec('fal: Hunyuan3D v3 multiview uses the documented four named image fields',
    log.calls[0].endpoint === 'fal-ai/hunyuan3d-v3/image-to-3d' &&
    wire.input_image_url === views.front && wire.back_image_url === views.back &&
    wire.left_image_url === views.left && wire.right_image_url === views.right);
  rec('fal: Hunyuan3D v3 respects Normal provider default without forcing polygon reduction',
    wire.enable_pbr === false && wire.generate_type === 'Normal' && !('polygon_type' in wire) &&
    !('face_count' in wire));
  rec('fal: Hunyuan3D v3 reads model_glb rather than an image-shaped fixture',
    out instanceof Blob && log.fetches[0].url === 'https://fal.example/model.glb');
}

{
  const output = { data: { model_glb: { url: 'https://fal.example/trellis.glb' } } };
  const { provider, log } = harness('trellis-2-fal', output);
  const picture = new Blob(['picture'], { type: 'image/png' });
  await provider.pictureTo3D({ picture }, { onStatus() {} });
  const call = log.calls[0];
  rec('fal: TRELLIS 2 makes the single-picture 3D route a real model choice',
    call.endpoint === 'fal-ai/trellis-2' && call.options.input.image_url === picture);
  rec('fal: TRELLIS 2 uses the model-owned provider defaults',
    call.options.input.resolution === 1024 && call.options.input.decimation_target === 500000 &&
    call.options.input.texture_size === 2048 && call.options.input.remesh === true);
}

{
  const output = { data: { model_glb: { url: 'https://fal.example/tuned.glb' } } };
  const { provider, log } = harness('trellis-2-fal', output, {
    controlValues: { decimation_target: 20000, resolution: 1536, texture_size: 4096 },
  });
  await provider.pictureTo3D({ picture: new Blob(['picture']), detailLevel: 'low' }, { onStatus() {} });
  const wire = log.calls[0].options.input;
  rec('fal: stale generic detail choice cannot override independent model options',
    wire.decimation_target === 20000 && wire.resolution === 1536 && wire.texture_size === 4096);
}

{
  let built = 0;
  const ctrl = new AbortController(); ctrl.abort();
  const provider = createFalProvider('key', modelById('flux-1-schnell-fal'), {
    createClient() { built++; return {}; }, fetch: async () => ({}),
  });
  const err = await provider.wordsToPicture({}, { signal: ctrl.signal }).catch((e) => e);
  rec('fal: an already-cancelled call submits nothing', err?.name === 'AbortError' && built === 0);
}

{
  const { provider } = harness('flux-1-schnell-fal', { data: { images: [] } });
  const empty = await provider.wordsToPicture({}, {}).catch((e) => e);
  const wrong = await provider.editViews({}, {}).catch((e) => e);
  rec('fal: a real empty output fails clearly', /without an image/.test(empty?.message));
  rec('fal: catalogue capabilities cannot be bypassed', /cannot run edit/.test(wrong?.message));
}

{
  const { provider, log } = harness('hunyuan3d-v3-fal', { data: { model_glb: { url: 'https://fal.example/low.glb' } } }, {
    controlValues: { generate_type: 'LowPoly', face_count: 123456, polygon_type: 'quadrilateral', enable_pbr: true },
  });
  await provider.pictureTo3D({ picture: new Blob(['picture']) });
  const wire = log.calls[0].options.input;
  rec('fal: native LowPoly choice sends custom face target, polygon choice and material option',
    wire.generate_type === 'LowPoly' && wire.face_count === 123456 && wire.polygon_type === 'quadrilateral' && wire.enable_pbr === true);
}

export default function genFalTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
