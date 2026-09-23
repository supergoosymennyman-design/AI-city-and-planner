import { modelById, resolveModelControls } from '../gen-models.js';

/**
 * hf-spaces.js — the demo adapter for catalogue models hosted on Hugging Face Spaces, called straight
 * from the browser with Gradio's JS client and a device-held key (design doc §6; the browser path was
 * tested from the studio's own origin on 19 Sep).
 *
 * Space ids and endpoints live in gen-models.js; payload settings below are the ones measured in the
 * spike. `@gradio/client` is imported lazily so Node tests (which inject `connect`/`handleFile`)
 * never load it; Vite still bundles it for the app.
 */

/**
 * Which Space and endpoint fills each step.
 *
 * `/generation_all` builds the shape AND paints it; `/shape_generation` returns a white mesh. They
 * take the same parameters, so the choice is per Space — and it is NOT free to choose:
 *
 *   tencent/Hunyuan3D-2mv   texture DISABLED on the hosted Space. Its page reads
 *                           "Texture Generation (Unavailable)" and it warns that texture synthesis
 *                           is off for missing requirements. `/generation_all` is still PUBLISHED in
 *                           its API, so an api-info probe says it exists — but calling it reaches a
 *                           `texgen_worker` that was never created and throws (live failure 09-20).
 *                           Route A therefore stays on `/shape_generation`.
 *   tencent/Hunyuan3D-2.1   advertises a "Textured Shape" output and shows no disabled warning, so
 *                           route B asks for the painted mesh.
 *
 * Before moving any step to `/generation_all`, read that Space's OWN banner. An endpoint appearing
 * in api-info proves it is routed, not that it works.
 */
/** Route A edit: the 2x2 grid as a gallery item; Qwen's defaults (256², prompt rewrite) must be overridden. */
export function editPayload(grid, prompt, handleFile) {
  return {
    images: [{ image: handleFile(grid), caption: null }],
    prompt,
    seed: 0,
    randomize_seed: true,
    true_guidance_scale: 4,
    num_inference_steps: 40,
    height: 1024,
    width: 1024,
    rewrite_prompt: false,
  };
}

/**
 * Route A 3D: each view in its own slot ('left' = the model's own left, see gen-snapshot.js).
 *
 * There is deliberately NO `caption` key here, and it must not come back. tencent/Hunyuan3D-2mv
 * takes one; tencent/Hunyuan3D-2.1 — which accepts the same four mv_image_* slots and is the only
 * one of the two that can paint the mesh — has no such parameter at all. @gradio/client rejects a
 * key that is not in the endpoint's signature ("Parameter `caption` is not a valid keyword
 * argument") BEFORE it submits anything, so sending it made 2.1 impossible to choose for this step:
 * it failed every time, instantly, with an error that pointed at the client rather than at us.
 * 2mv defaults caption to null, so leaving it out is what makes one payload work on both.
 */
export function views3dPayload(views, handleFile, selectedModel = modelById('hunyuan3d-2mv'), controlValues = {}, detailLevel = null) {
  const controls = resolveModelControls(selectedModel, controlValues, detailLevel);
  return {
    image: null,
    mv_image_front: handleFile(views.front),
    mv_image_back: handleFile(views.back),
    mv_image_left: handleFile(views.left),
    mv_image_right: handleFile(views.right),
    steps: controls.steps,
    guidance_scale: 5,
    seed: 1234,
    octree_resolution: controls.octree_resolution,
    check_box_rembg: true,
    num_chunks: controls.num_chunks,
    randomize_seed: true,
  };
}

/** Route B picture. */
export function picturePayload(prompt) {
  return { prompt, seed: 0, randomize_seed: true, width: 1024, height: 1024, num_inference_steps: 4 };
}

/** Route B 3D: one picture, no views. */
export function picture3dPayload(picture, handleFile, selectedModel = modelById('hunyuan3d-2.1'), controlValues = {}, detailLevel = null) {
  const controls = resolveModelControls(selectedModel, controlValues, detailLevel);
  return {
    image: handleFile(picture),
    mv_image_front: null,
    mv_image_back: null,
    mv_image_left: null,
    mv_image_right: null,
    steps: controls.steps,
    guidance_scale: 5,
    seed: 1234,
    octree_resolution: controls.octree_resolution,
    check_box_rembg: true,
    num_chunks: controls.num_chunks,
    randomize_seed: true,
  };
}

/**
 * The URL of a Gradio file output: FileData, a gallery item, a list of either, a plain string, or a
 * `gr.update(value=…)` wrapper.
 *
 * The wrapper is not optional to handle: BOTH 3D Spaces return one. `shape_generation` in
 * tencent/Hunyuan3D-2mv (gradio_app.py:356) and tencent/Hunyuan3D-2.1 (gradio_app.py:456) each
 * `return (gr.update(value=path), model_viewer_html, stats, seed)`, which serialises as
 * `{__type__: 'update', value: {…FileData…}}`. Reading only `.url` made this return null, so the 3D
 * step died with "the Space sent no file" — the live failure on 09-20.
 */
export function fileUrl(out) {
  if (!out) return null;
  if (typeof out === 'string') return out;
  if (Array.isArray(out)) return fileUrl(out[0]);
  // Unwrap gr.update(value=…). Guarded on the absent url so a real FileData is never re-entered.
  if (out.__type__ === 'update' || (out.value !== undefined && out.url === undefined)) return fileUrl(out.value);
  if (out.image) return fileUrl(out.image);
  return typeof out.url === 'string' ? out.url : null;
}

/** Reuse a generated FileData on the same Space, retaining its cached server path. */
function exportFile(out, handleFile) {
  if (!out) return null;
  if (out.__type__ === 'update' || (out.value !== undefined && out.url === undefined)) {
    return exportFile(out.value, handleFile);
  }
  if (typeof out.path === 'string' && out.path && !/^https?:\/\//i.test(out.path)) {
    // handle_file(url) replaces path with the download URL. Gradio 4 uses that URL
    // (including ?jwt=...) as the cached filename, so trimesh sees a token suffix
    // instead of .glb. This file already belongs to the connected Space: send its
    // FileData back directly, without a download/re-upload or stripping auth.
    return { ...out, meta: { ...out.meta, _type: 'gradio.FileData' } };
  }
  const url = fileUrl(out);
  return url ? handleFile(url) : null;
}

/** The Space's real second call: simplify the generated shape to the chosen face count. */
export function exportPayload(data, handleFile, controls, hasTexturedOutput = false) {
  const shape = exportFile(data?.[0], handleFile);
  if (!shape) throw new Error('the Space sent no shape to export');
  const textured = hasTexturedOutput ? exportFile(data?.[1], handleFile) : null;
  return {
    file_out: shape,
    file_out2: textured,
    file_type: 'glb',
    reduce_face: true,
    // The published Space only runs face_reduce_worker on its untextured branch. Passing true here
    // silently skips reduction, so the controllable export must use the shape output.
    export_texture: false,
    target_face_num: controls.target_face_num,
  };
}

let gradioModule = null;
async function loadGradio() {
  if (!gradioModule) gradioModule = await import('@gradio/client');
  return gradioModule;
}

const abortError = () => Object.assign(new Error('cancelled'), { name: 'AbortError' });
const checkAbort = (signal) => { if (signal?.aborted) throw abortError(); };
const quiet = (fn) => { try { Promise.resolve(fn()).catch(() => {}); } catch { /* best-effort cleanup */ } };

/** Abort an await promptly; dispose an acquired connection if it arrives after cancellation. */
function waitFor(promise, signal, onLate = () => {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort); fn(value);
    };
    const abort = () => finish(reject, abortError());
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    Promise.resolve(promise).then((value) => {
      if (settled) { quiet(() => onLate(value)); return; }
      finish(resolve, value);
    }, (err) => finish(reject, err));
  });
}

/**
 * @param {string} key the Hugging Face token (device-held, adult-entered)
 * @param {object|string} selectedModel catalogue entry or id
 * @param {{connect?: Function, handleFile?: Function, fetchImpl?: Function, loadClient?: Function}} [deps] injected in tests
 */
export function createHfSpacesProvider(key, selectedModel, deps = {}) {
  // Keep the old debug/test call shape while production passes a catalogue entry.
  if (selectedModel && !selectedModel.id &&
      (selectedModel.connect || selectedModel.handleFile || selectedModel.fetchImpl || selectedModel.loadClient)) {
    deps = selectedModel;
    selectedModel = null;
  }
  const model = typeof selectedModel === 'string' ? modelById(selectedModel) : selectedModel;
  const fetchImpl = deps.fetchImpl || ((...args) => fetch(...args));

  function runtimeModel(step) {
    const fallback = { edit: 'qwen-image-edit-2511', views3d: 'hunyuan3d-2mv',
      picture: 'flux-1-schnell', picture3d: 'hunyuan3d-2.1' };
    const chosen = model || modelById(fallback[step]);
    if (!chosen?.available || chosen.provider !== 'hf-spaces' ||
        !chosen.steps.includes(step) || !chosen.space) {
      throw new Error(`the selected model cannot do ${step}`);
    }
    return chosen;
  }
  const runtime = (step) => runtimeModel(step).space;

  async function tools(signal) {
    checkAbort(signal);
    if (deps.connect && deps.handleFile) return { connect: deps.connect, handleFile: deps.handleFile };
    const g = await waitFor((deps.loadClient || loadGradio)(), signal);
    checkAbort(signal);
    return {
      connect: deps.connect || ((space, opts) => g.Client.connect(space, opts)),
      handleFile: deps.handleFile || g.handle_file,
    };
  }

  async function withApp(space, signal, use) {
    const api = await tools(signal);
    checkAbort(signal);
    const app = await waitFor(api.connect(space.id, { token: key, events: ['status', 'data'] }), signal,
      (late) => late.close());
    try {
      checkAbort(signal);
      return await use(app, api.handleFile);
    } finally { quiet(() => app.close()); }
  }

  /** Submit one endpoint on an acquired app and resolve with its data message. */
  async function submit(app, endpoint, payload, { onStatus = () => {}, signal } = {}) {
      let job, iterator, complete = false, stopped = false;
      const stop = () => {
        if (job && !stopped && !complete) { stopped = true; quiet(() => job.cancel()); }
      };
      signal?.addEventListener('abort', stop, { once: true });
      try {
        checkAbort(signal); // last check before anything can be submitted
        job = app.submit(endpoint, payload);
        checkAbort(signal);
        iterator = job[Symbol.asyncIterator]();
        for (;;) {
          checkAbort(signal);
          const next = await waitFor(iterator.next(), signal);
          checkAbort(signal);
          if (next.done) throw new Error('the Space closed without a result');
          const msg = next.value;
          if (msg.type === 'status') {
            if (msg.stage === 'error') throw new Error(msg.message || 'the Space reported an error');
            if (msg.stage === 'complete') continue;
            onStatus({ stage: msg.stage === 'pending' ? 'queued' : 'running', queuePosition: msg.position,
              eta: msg.eta, progressData: msg.progress_data });
          } else if (msg.type === 'data') { complete = true; return msg.data; }
        }
      } finally {
        signal?.removeEventListener('abort', stop);
        stop();
        if (iterator?.return) quiet(() => iterator.return());
      }
  }

  /** Submit to one Space and resolve with the data message; statuses go to onStatus. */
  async function call(step, makePayload, opts = {}) {
    const space = runtime(step);
    return withApp(space, opts.signal, async (app, handleFile) =>
      submit(app, space.endpoint, makePayload(handleFile), opts));
  }

  /** Generate; optionally simplify on the same app, recovering only the known PLY loader failure. */
  async function generate3D(step, input, makePayload, opts = {}) {
    const chosen = runtimeModel(step);
    const controls = resolveModelControls(chosen, deps.controlValues, input?.detailLevel);
    const url = await withApp(chosen.space, opts.signal, async (app, handleFile) => {
      const generated = await submit(app, chosen.space.endpoint, makePayload(handleFile, chosen, controls), opts);
      const original = fileUrl(generated?.[chosen.space.outputIndex]) || fileUrl(generated?.[0]);
      if (!controls.reduce_face) return original;
      const payload = exportPayload(generated, handleFile, controls, chosen.space.endpoint === '/generation_all');
      try {
        const exported = await submit(app, '/on_export_click', payload, opts);
        return fileUrl(exported?.[1]);
      } catch (err) {
        checkAbort(opts.signal);
        // Only recover this known server-side mesh-loader failure. Authentication,
        // quota, cancellation and other failures must retain their normal handling.
        if (!original || !/unknown format for load:\s*ply/i.test(err?.message || '')) throw err;
        opts.onStatus?.({ stage: 'running', warning:
          'The service could not simplify this model. The original model is ready; face reduction was not applied. It may be larger and slower to use.' });
        return original;
      }
    });
    return download(url, opts.signal);
  }

  async function download(url, signal) {
    checkAbort(signal);
    if (!url) throw new Error('the Space sent no file');
    const res = await waitFor(fetchImpl(url, { signal }), signal);
    checkAbort(signal);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const blob = await waitFor(res.blob(), signal);
    checkAbort(signal);
    return blob;
  }

  return {
    id: 'hf-spaces',
    async editViews({ grid, prompt }, opts = {}) {
      const data = await call('edit', (handleFile) => editPayload(grid, prompt, handleFile), opts);
      return download(fileUrl(data[0]), opts.signal);
    },
    async viewsTo3D(views, opts = {}) {
      return generate3D('views3d', views,
        (handleFile, chosen) => views3dPayload(views, handleFile, chosen, deps.controlValues, views?.detailLevel), opts);
    },
    async wordsToPicture({ prompt }, opts = {}) {
      const data = await call('picture', () => picturePayload(prompt), opts);
      return download(fileUrl(data[0]), opts.signal);
    },
    async pictureTo3D(input, opts = {}) {
      const { picture } = input || {};
      return generate3D('picture3d', input,
        (handleFile, chosen) => picture3dPayload(picture, handleFile, chosen, deps.controlValues, input?.detailLevel), opts);
    },
    /** Connect (and, where one exists, make a free call) — for "Test the AI services". */
    async check(step, { signal } = {}) {
      const space = runtime(step);
      return withApp(space, signal, async (app) => {
        const free = space.freeCheck;
        checkAbort(signal);
        if (free) await waitFor(app.predict(free.endpoint, free.payload), signal);
        checkAbort(signal);
        return { ok: true, detail: free ? 'connected, and a free test call worked' : 'connected' };
      });
    },
  };
}
