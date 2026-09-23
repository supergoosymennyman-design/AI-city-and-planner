/**
 * gen-hf-spaces.spec.js — the demo provider with a FAKE Gradio client (no network, no GPU).
 * Every Space id and setting asserted here is the one measured in the 19 Sep spike.
 */
import {
  editPayload, views3dPayload, picturePayload, picture3dPayload, exportPayload, fileUrl, createHfSpacesProvider,
} from '../gen-providers/hf-spaces.js';
import { modelById, modelsForStep } from '../gen-models.js';
import { SPACE_PARAMETERS } from './fixtures/space-signatures.js';
import { handle_file as realHandleFile } from '@gradio/client';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);
const KEY = 'hf_fakekey12345678';
const handleFile = (b) => ({ handled: b });

function fakeGradio(script) {
  const log = [];
  const connect = async (space, opts) => {
    log.push({ space, opts });
    return {
      submit(endpoint, payload) {
        log.push({ endpoint, payload });
        // The export endpoint is the required second half of every 3D call. Its fake returns the
        // shape URL it was handed, so older adapter assertions still identify the generated file.
        const msgs = endpoint === '/on_export_click'
          ? [{ type: 'data', data: ['<html>', { url: payload.file_out.handled || payload.file_out.url }] }]
          : script(endpoint, payload);
        let cancelled = false;
        const it = (async function* gen() {
          for (const m of msgs) {
            if (cancelled) return;
            yield m;
          }
        })();
        it.cancel = () => { cancelled = true; log.push({ cancelled: true }); };
        return it;
      },
      predict: async (endpoint, payload) => { log.push({ predict: endpoint, payload }); return { data: [{ value: 5 }] }; },
      close: () => { log.push({ closed: true }); },
    };
  };
  const fetchImpl = async (url) => { log.push({ fetched: url }); return { ok: true, status: 200, blob: async () => `blob:${url}` }; };
  return { connect, fetchImpl, log };
}

rec('hf-spaces: edit model owns Qwen-Image-Edit 2511 /infer',
  modelById('qwen-image-edit-2511').space.id === 'Qwen/Qwen-Image-Edit-2511' && modelById('qwen-image-edit-2511').space.endpoint === '/infer');
// 2mv's hosted Space reports "Texture Generation (Unavailable)", so /generation_all throws there
// even though api-info lists it (live failure 09-20). Route A must stay on the shape endpoint.
rec('hf-spaces: views3d stays on /shape_generation — 2mv cannot texture',
  modelById('hunyuan3d-2mv').space.id === 'tencent/Hunyuan3D-2mv' && modelById('hunyuan3d-2mv').space.endpoint === '/shape_generation');
rec('hf-spaces: picture model owns FLUX.1 schnell /infer',
  modelById('flux-1-schnell').space.id === 'black-forest-labs/FLUX.1-schnell' && modelById('flux-1-schnell').space.endpoint === '/infer');
rec('hf-spaces: picture3d model owns Hunyuan3D 2.1 /generation_all',
  modelById('hunyuan3d-2.1').space.id === 'tencent/Hunyuan3D-2.1' && modelById('hunyuan3d-2.1').space.endpoint === '/generation_all');

const ep = editPayload('GRID', 'PROMPT', handleFile);
rec('hf-spaces: edit sends the grid as a gallery item', ep.images.length === 1 && ep.images[0].image.handled === 'GRID' && ep.images[0].caption === null);
rec('hf-spaces: edit settings as tested (40 steps, guidance 4, 1024², no prompt rewrite)',
  ep.num_inference_steps === 40 && ep.true_guidance_scale === 4 && ep.width === 1024 && ep.height === 1024 && ep.rewrite_prompt === false && ep.prompt === 'PROMPT');
const vp = views3dPayload({ front: 'F', left: 'L', back: 'B', right: 'R' }, handleFile);
rec('hf-spaces: each view goes to its own slot', vp.mv_image_front.handled === 'F' && vp.mv_image_left.handled === 'L' &&
  vp.mv_image_back.handled === 'B' && vp.mv_image_right.handled === 'R' && vp.image === null);
// This assertion used to read `vp.caption === null`, which pinned the bug in place: Hunyuan3D-2.1
// has no caption parameter, so the key must be ABSENT, not null. Present-and-null is what
// @gradio/client rejects.
rec('hf-spaces: the four-view payload carries no caption key at all', !('caption' in vp));
rec('hf-spaces: 2mv uses its own live defaults', vp.steps === 5 && vp.guidance_scale === 5 && vp.octree_resolution === 256 && vp.check_box_rembg === true && vp.num_chunks === 8000);
const pp = picturePayload('A DRAGON');
rec('hf-spaces: FLUX schnell settings', pp.prompt === 'A DRAGON' && pp.width === 1024 && pp.height === 1024 && pp.num_inference_steps === 4);
const p3 = picture3dPayload('PIC', handleFile);
rec('hf-spaces: 2.1 gets one image, no views and its own live defaults', p3.image.handled === 'PIC' && p3.mv_image_front === null && p3.steps === 30 && p3.octree_resolution === 256);
const xp = exportPayload([{ url: 'shape.glb' }], handleFile,
  { target_face_num: 23456 }, false);
rec('hf-spaces: export asks for a real reduced GLB at the chosen face count',
  xp.file_out.handled === 'shape.glb' && xp.file_out2 === null && xp.file_type === 'glb' &&
  xp.reduce_face === true && xp.export_texture === false && xp.target_face_num === 23456);
rec('hf-spaces: fileUrl reads FileData, gallery items, strings', fileUrl({ url: 'u1' }) === 'u1' &&
  fileUrl([{ image: { url: 'u2' }, caption: null }]) === 'u2' && fileUrl('u3') === 'u3' && fileUrl(null) === null);
// The 3D Spaces hand back gr.update(value=FileData), NOT a bare FileData. Verified against the
// published sources: tencent/Hunyuan3D-2mv gradio_app.py:356 and Hunyuan3D-2.1 gradio_app.py:456
// both `return (gr.update(value=path), model_viewer_html, stats, seed)`.
rec('hf-spaces: fileUrl unwraps a gr.update payload', fileUrl({ __type__: 'update', value: { url: 'u4' } }) === 'u4');
rec('hf-spaces: fileUrl unwraps an update wrapping a gallery', fileUrl({ __type__: 'update', value: [{ image: { url: 'u5' } }] }) === 'u5');
rec('hf-spaces: an update carrying nothing is still nothing', fileUrl({ __type__: 'update', value: null }) === null);

// editViews: connects with the key, maps statuses, downloads the gallery picture
{
  const g = fakeGradio(() => [
    { type: 'status', stage: 'pending', position: 2, eta: 30 },
    { type: 'status', stage: 'generating', progress_data: [{ index: 12, length: 40, progress: null }] },
    { type: 'data', data: [[{ image: { url: 'https://x.hf.space/file=edited.webp' }, caption: null }], 7] },
  ]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const statuses = [];
  const out = await p.editViews({ grid: 'GRID', prompt: 'P' }, { onStatus: (s) => statuses.push(s) });
  rec('hf-spaces: connects to the edit Space with the key and status events',
    g.log[0].space === 'Qwen/Qwen-Image-Edit-2511' && g.log[0].opts.token === KEY && g.log[0].opts.events.includes('status'));
  rec('hf-spaces: pending → queued with its place in line', statuses[0].stage === 'queued' && statuses[0].queuePosition === 2);
  rec('hf-spaces: generating → running with progress data', statuses[1].stage === 'running' && statuses[1].progressData[0].index === 12);
  rec('hf-spaces: the edited picture is downloaded', out === 'blob:https://x.hf.space/file=edited.webp');
  rec('hf-spaces: successful calls close their connection once', g.log.filter((l) => l.closed).length === 1);
}

// viewsTo3D returns the GLB behind data[0]
{
  // shape_generation returns (gr.update(path), html, stats, seed) — one file, at index 0.
  const g = fakeGradio(() => [{ type: 'data', data: [{ url: 'https://y.hf.space/file=white_mesh.glb' }, '<html>', {}, 1234] }]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const out = await p.viewsTo3D({ front: 'F', left: 'L', back: 'B', right: 'R' }, {});
  rec('hf-spaces: views3d downloads the shape it was given', out === 'blob:https://y.hf.space/file=white_mesh.glb' && g.log[0].space === 'tencent/Hunyuan3D-2mv');
}

// The REAL Hunyuan response shape, end-to-end through the actual adapter (regression for the
// live failure on 09-20: the wrapper made fileUrl return null and the step died with
// "the Space sent no file", which the UI showed only as "Something went wrong").
{
  const g = fakeGradio(() => [{ type: 'data', data: [
    { __type__: 'update', value: { path: '/tmp/white_mesh.glb', url: 'https://y.hf.space/file=white_mesh.glb',
      orig_name: 'white_mesh.glb', size: 1234, meta: { _type: 'gradio.FileData' } } },
    '<html>', { time: {} }, 1234] }]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const out = await p.viewsTo3D({ front: 'F', left: 'L', back: 'B', right: 'R' }, {});
  rec('hf-spaces: views3d unwraps the gr.update the real Space sends', out === 'blob:https://y.hf.space/file=white_mesh.glb');
}
{
  const g = fakeGradio(() => [{ type: 'data', data: [
    { __type__: 'update', value: { url: 'https://z.hf.space/file=white21.glb', meta: { _type: 'gradio.FileData' } } },
    { __type__: 'update', value: { url: 'https://z.hf.space/file=textured21.glb', meta: { _type: 'gradio.FileData' } } },
    '<html>', {}, 7] }]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  rec('hf-spaces: picture3d exports the reducible shape file (Hunyuan3D-2.1)',
    await createHfSpacesProvider(KEY, 'hunyuan3d-2.1', { connect: g.connect, handleFile,
      fetchImpl: g.fetchImpl, controlValues: { reduce_face: true } }).pictureTo3D({ picture: 'PIC' }) === 'blob:https://z.hf.space/file=white21.glb');
  const exportCall = g.log.find((entry) => entry.endpoint === '/on_export_click');
  rec('hf-spaces: generation and export are two calls on the same selected Space',
    !!exportCall && exportCall.payload.file_out.handled.includes('white21.glb') &&
    exportCall.payload.file_out2.handled.includes('textured21.glb') && exportCall.payload.reduce_face === true &&
    exportCall.payload.target_face_num === 10000);
}

// The selected catalogue model, rather than the step name, owns the Space, endpoint and output.
{
  const g = fakeGradio(() => [{ type: 'data', data: [
    { __type__: 'update', value: { url: 'https://choice.hf.space/file=white.glb' } },
    { __type__: 'update', value: { url: 'https://choice.hf.space/file=painted.glb' } },
  ] }]);
  const p = createHfSpacesProvider(KEY, modelById('hunyuan3d-2.1'),
    { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const out = await p.viewsTo3D({ front: 'F', left: 'L', back: 'B', right: 'R' });
  rec('hf-spaces: choosing 2.1 for multiview changes the Space and endpoint',
    g.log[0].space === 'tencent/Hunyuan3D-2.1' && g.log.some((l) => l.endpoint === '/generation_all'));
  rec('hf-spaces: chosen 2.1 unwraps the real update envelope and preserves its texture by default',
    out === 'blob:https://choice.hf.space/file=painted.glb');
}
{
  const g = fakeGradio(() => [{ type: 'data', data: [
    { __type__: 'update', value: { url: 'https://choice.hf.space/file=low.glb' } }, '<html>', {}, 12,
  ] }]);
  const p = createHfSpacesProvider(KEY, 'hunyuan3d-2mv', {
    connect: g.connect, handleFile, fetchImpl: g.fetchImpl,
    controlValues: { reduce_face: true, steps: 10, octree_resolution: 300, num_chunks: 12000, target_face_num: 24000 },
  });
  await p.viewsTo3D({ front: 'F', left: 'L', back: 'B', right: 'R', detailLevel: 'low' });
  const generation = g.log.find((entry) => entry.endpoint === '/shape_generation').payload;
  const exported = g.log.find((entry) => entry.endpoint === '/on_export_click').payload;
  rec('hf-spaces: the child Detail choice crosses the real provider seam',
    generation.octree_resolution === 196 && generation.steps === 10 && generation.num_chunks === 12000 &&
    exported.target_face_num === 24000);
}
{
  const g = fakeGradio(() => [{ type: 'data', data: [
    { __type__: 'update', value: { url: 'https://choice.hf.space/file=shape.glb' } }, '<html>', {}, 12,
  ] }]);
  const p = createHfSpacesProvider(KEY, 'hunyuan3d-2mv',
    { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const out = await p.pictureTo3D({ picture: 'PIC' });
  rec('hf-spaces: choosing 2mv for a single picture uses its working shape endpoint',
    g.log[0].space === 'tencent/Hunyuan3D-2mv' && g.log.some((l) => l.endpoint === '/shape_generation') &&
    out === 'blob:https://choice.hf.space/file=shape.glb');
}
{
  let connected = 0;
  const p = createHfSpacesProvider(KEY, modelById('qwen-image-edit-2511'), {
    handleFile, connect: () => { connected++; }, fetchImpl: async () => ({}),
  });
  const err = await p.viewsTo3D({}).catch((e) => e);
  rec('hf-spaces: a model cannot silently run a capability it does not catalogue',
    /cannot do views3d/.test(err.message) && connected === 0);
}

// error stage, and a stream with no result
{
  const g = fakeGradio(() => [{ type: 'status', stage: 'error', message: 'You have exceeded your ZeroGPU runs limit.' }]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  let err;
  try { await p.wordsToPicture({ prompt: 'x' }, {}); } catch (e) { err = e; }
  rec("hf-spaces: a Space error keeps the Space's message", !!err && /ZeroGPU/.test(err.message));
  const g2 = fakeGradio(() => [{ type: 'status', stage: 'generating' }]);
  const p2 = createHfSpacesProvider(KEY, { connect: g2.connect, handleFile, fetchImpl: g2.fetchImpl });
  let err2;
  try { await p2.pictureTo3D({ picture: 'PIC' }, {}); } catch (e) { err2 = e; }
  rec('hf-spaces: no result → a clear error', !!err2 && /without a result/.test(err2.message));
  rec('hf-spaces: error and empty-result paths close their connections', g.log.filter((l) => l.closed).length === 1 && g2.log.filter((l) => l.closed).length === 1);
}

// cancel: the job is cancelled and the call rejects as an AbortError
{
  const g = fakeGradio(() => [
    { type: 'status', stage: 'generating' },
    { type: 'status', stage: 'generating' },
    { type: 'data', data: [{ url: 'never' }] },
  ]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const ctrl = new AbortController();
  let err;
  try {
    await p.viewsTo3D({ front: 1, left: 2, back: 3, right: 4 }, { signal: ctrl.signal, onStatus: () => ctrl.abort() });
  } catch (e) { err = e; }
  rec('hf-spaces: cancel stops the job', g.log.some((l) => l.cancelled) && err?.name === 'AbortError');
  rec('hf-spaces: nothing is downloaded after cancel', !g.log.some((l) => l.fetched));
}

// a failed download
{
  const g = fakeGradio(() => [{ type: 'data', data: [{ url: 'https://z/file=a.glb' }] }]);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: async () => ({ ok: false, status: 404 }) });
  let err;
  try { await p.viewsTo3D({ front: 1, left: 2, back: 3, right: 4 }, {}); } catch (e) { err = e; }
  rec('hf-spaces: a failed download says so', !!err && /download failed \(404\)/.test(err.message));
  rec('hf-spaces: failed download has already released the connection', g.log.filter((l) => l.closed).length === 1);
}

// check: 2mv makes a free call, the others only connect
{
  const g = fakeGradio(() => []);
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl: g.fetchImpl });
  const r1 = await p.check('views3d');
  const r2 = await p.check('edit');
  rec('hf-spaces: the 2mv check calls its free endpoint', r1.ok &&
    g.log.some((l) => l.predict === modelById('hunyuan3d-2mv').space.freeCheck.endpoint));
  rec('hf-spaces: the edit check only connects', r2.ok && g.log.filter((l) => l.predict).length === 1);
  rec('hf-spaces: checks close both connections and never submit', g.log.filter((l) => l.closed).length === 2 && !g.log.some((l) => l.endpoint));
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Cancel while the lazy import or connection is unresolved: zero jobs, including late completion.
for (const stage of ['import', 'connect']) {
  const gate = deferred(), entered = deferred(), ctrl = new AbortController();
  let submitted = 0, closed = 0;
  const app = { submit() { submitted++; throw new Error('must not submit'); }, close() { closed++; } };
  const deps = stage === 'import'
    ? { loadClient: () => { entered.resolve(); return gate.promise; } }
    : { handleFile, connect: () => { entered.resolve(); return gate.promise; } };
  const p = createHfSpacesProvider(KEY, deps);
  const pending = p.wordsToPicture({ prompt: 'test' }, { signal: ctrl.signal }).catch((e) => e);
  await entered.promise; ctrl.abort();
  const e = await pending;
  gate.resolve(stage === 'import' ? { Client: { connect: () => app }, handle_file: handleFile } : app);
  await flush();
  rec(`hf-spaces: cancel during ${stage} submits zero jobs`, e.name === 'AbortError' && submitted === 0);
  rec(`hf-spaces: late ${stage} acquires no leaked connection`, closed === (stage === 'connect' ? 1 : 0));
}

// A silent queue and a rejecting cancel()/close() must not hang or emit unhandled rejections.
{
  const entered = deferred(), ctrl = new AbortController();
  let cancelled = 0, closed = 0;
  const unhandled = []; const listener = (e) => unhandled.push(e);
  process.on('unhandledRejection', listener);
  try {
    const p = createHfSpacesProvider(KEY, { handleFile, connect: async () => ({
      submit() { entered.resolve(); return {
        [Symbol.asyncIterator]() { return this; }, next: () => new Promise(() => {}),
        cancel() { cancelled++; return Promise.reject(new Error('cancel failed')); },
      }; },
      close() { closed++; return Promise.reject(new Error('close failed')); },
    }) });
    const pending = p.wordsToPicture({ prompt: 'test' }, { signal: ctrl.signal }).catch((e) => e);
    await entered.promise; ctrl.abort(); const e = await pending; await flush();
    rec('hf-spaces: cancel ends a silent queue and releases the client', e.name === 'AbortError' && cancelled === 1 && closed === 1);
    rec('hf-spaces: rejected cleanup promises are observed', unhandled.length === 0);
  } finally { process.removeListener('unhandledRejection', listener); }
}

// Abort both phases of downloading, even if fetch/body decoding ignores its signal.
for (const phase of ['fetch', 'body']) {
  const gate = deferred(), entered = deferred(), ctrl = new AbortController();
  const g = fakeGradio(() => [{ type: 'data', data: [{ url: 'https://fake.invalid/result' }] }]);
  const fetchImpl = () => {
    if (phase === 'fetch') { entered.resolve(); return gate.promise; }
    return Promise.resolve({ ok: true, blob() { entered.resolve(); return gate.promise; } });
  };
  const p = createHfSpacesProvider(KEY, { connect: g.connect, handleFile, fetchImpl });
  const pending = p.wordsToPicture({ prompt: 'test' }, { signal: ctrl.signal }).catch((e) => e);
  await entered.promise; ctrl.abort();
  rec(`hf-spaces: cancel during ${phase} rejects promptly`, (await pending).name === 'AbortError');
  gate.resolve(phase === 'fetch' ? { ok: true, blob: async () => 'late' } : 'late');
  await flush();
  rec(`hf-spaces: ${phase} cancellation leaves no client open`, g.log.filter((l) => l.closed).length === 1);
}

// Free checks are cancellable during both connection and prediction and cannot submit jobs.
for (const phase of ['connect', 'predict']) {
  const gate = deferred(), entered = deferred(), ctrl = new AbortController();
  let closed = 0, predicted = 0, submitted = 0;
  const app = {
    close() { closed++; }, submit() { submitted++; },
    predict(endpoint) { predicted++; rec('hf-spaces: only the allowlisted free endpoint is checked', endpoint === modelById('hunyuan3d-2mv').space.freeCheck.endpoint); entered.resolve(); return gate.promise; },
  };
  const p = createHfSpacesProvider(KEY, { handleFile, connect: () => {
    if (phase === 'connect') { entered.resolve(); return gate.promise; }
    return Promise.resolve(app);
  } });
  const pending = p.check('views3d', { signal: ctrl.signal }).catch((e) => e);
  await entered.promise; ctrl.abort(); const e = await pending;
  gate.resolve(phase === 'connect' ? app : { data: [] }); await flush();
  rec(`hf-spaces: free ${phase} check cancels and releases connections`, e.name === 'AbortError' && closed === 1 && submitted === 0 && predicted === (phase === 'predict' ? 1 : 0));
}

// --- every payload key must exist in the real Space signature (fixtures/space-signatures.js) ---
//
// @gradio/client throws on an unknown key BEFORE submitting, so a stray key is not a degraded
// result — it is a model nobody can select. A hardcoded `caption` did exactly that to
// tencent/Hunyuan3D-2.1 while every existing test stayed green, because no test knew any signature.
const blob = { fake: 'blob' };
const PAYLOADS = {
  edit: () => editPayload(blob, 'make it a horse', handleFile),
  views3d: () => views3dPayload({ front: blob, back: blob, left: blob, right: blob }, handleFile),
  picture: () => picturePayload('a horse'),
  picture3d: () => picture3dPayload(blob, handleFile),
};
for (const [step, makePayload] of Object.entries(PAYLOADS)) {
  // Not just the default model: EVERY hf-spaces model the adult can pick for this step.
  const choices = modelsForStep(step).filter((m) => m.provider === 'hf-spaces' && m.available && m.space);
  rec(`hf-spaces: ${step} offers at least one selectable Space to check`, choices.length > 0);
  for (const model of choices) {
    const signature = SPACE_PARAMETERS[model.space.id];
    rec(`hf-spaces: ${model.id} has a recorded live signature for ${step}`,
      !!signature && Array.isArray(signature[model.space.endpoint]));
    if (!signature || !signature[model.space.endpoint]) continue;
    const accepted = signature[model.space.endpoint];
    const sent = Object.keys(makePayload());
    const strays = sent.filter((k) => !accepted.includes(k));
    rec(`hf-spaces: ${step} sends nothing ${model.space.id} would reject (${strays.join(', ') || 'none'})`,
      strays.length === 0);
  }
}
// The pin above only bites if the fixture really does differ between the two Spaces — otherwise it
// would have passed against the caption bug too.
rec('hf-spaces: the fixture records that 2mv takes a caption and 2.1 does not',
  SPACE_PARAMETERS['tencent/Hunyuan3D-2mv']['/shape_generation'].includes('caption') &&
  !SPACE_PARAMETERS['tencent/Hunyuan3D-2.1']['/generation_all'].includes('caption'));
rec('hf-spaces: Hunyuan3D-2.1 really does accept the four multiview slots',
  ['mv_image_front', 'mv_image_back', 'mv_image_left', 'mv_image_right']
    .every((k) => SPACE_PARAMETERS['tencent/Hunyuan3D-2.1']['/generation_all'].includes(k)));
for (const space of ['tencent/Hunyuan3D-2mv', 'tencent/Hunyuan3D-2.1']) {
  const sent = Object.keys(exportPayload([{ url: 'shape.glb' }, { url: 'painted.glb' }], handleFile,
    { target_face_num: 10000 }, true));
  const accepted = SPACE_PARAMETERS[space]['/on_export_click'];
  rec(`hf-spaces: export sends nothing ${space} would reject`, sent.every((key) => accepted.includes(key)));
}

// A signed download URL must never replace the server-side model path. Gradio 4
// caches URL inputs using their URL basename, including its dotted token; trimesh
// then treats the token suffix as the file extension. Exercise the real adapter
// and real JS handle_file, with only the remote generation/export stubbed.
for (const model of ['hunyuan3d-2mv', 'hunyuan3d-2.1']) {
  const shape = { path: '/tmp/gradio/generated/white_mesh.glb',
    url: 'https://example.hf.space/file=/tmp/gradio/generated/white_mesh.glb?jwt=header.payload.signature',
    orig_name: 'white_mesh.glb', meta: { _type: 'gradio.FileData' } };
  const painted = { ...shape, path: '/tmp/gradio/generated/painted.glb', orig_name: 'painted.glb' };
  const calls = [];
  let closed = 0;
  const provider = createHfSpacesProvider(KEY, model, {
    controlValues: { reduce_face: true },
    handleFile: realHandleFile,
    connect: async () => ({
      submit(endpoint, payload) {
        calls.push({ endpoint, payload });
        return (async function* () {
          if (endpoint !== '/on_export_click') {
            yield { type: 'data', data: [
              { __type__: 'update', value: shape }, { __type__: 'update', value: painted },
            ] };
          } else if (payload.file_out.path !== shape.path) {
            yield { type: 'status', stage: 'error', message: "file_type 'signature' not supported" };
          } else {
            yield { type: 'data', data: ['<html>', { url: 'https://example.hf.space/reduced.glb' }] };
          }
        })();
      },
      close() { closed++; },
    }),
    fetchImpl: async (url) => ({ ok: true, blob: async () => `download:${url}` }),
  });
  const result = await provider.pictureTo3D({ picture: new Blob(['image']) }).catch((e) => e);
  rec(`hf-spaces: ${model} exports a signed-URL result without treating its token as a file type`,
    result === 'download:https://example.hf.space/reduced.glb' && closed === 1);
  const sent = calls.find((c) => c.endpoint === '/on_export_click')?.payload;
  rec(`hf-spaces: ${model} preserves the server file metadata and GLB export setting`,
    sent?.file_out.path === shape.path && sent.file_out.orig_name === 'white_mesh.glb'
    && sent.file_out.meta._type === 'gradio.FileData' && sent.file_type === 'glb'
    && (model !== 'hunyuan3d-2.1' || sent.file_out2.path === painted.path));
}

export default function genHfSpacesTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
