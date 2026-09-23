/**
 * Direct-browser fal adapter for the catalogue's image generation models.
 *
 * A fresh client is created for each selected model/key pair, so credentials cannot leak into a
 * different provider or a concurrent model call. The fal client uploads Blob inputs, follows the
 * queue, and uses the supplied AbortSignal to cancel queued work. Tests inject both client and
 * fetch; this module never needs a live or paid call to verify its wire format.
 */
import { createFalClient } from '@fal-ai/client';
import { resolveModelControls } from '../gen-models.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

function assertUsable(model, step) {
  if (!model?.available || model.provider !== 'fal' || !model.steps?.includes(step) ||
      typeof model.fal?.endpoint !== 'string') {
    throw new Error(`fal model cannot run ${step}`);
  }
}

function reportQueue(update, onStatus) {
  if (update?.status === 'IN_QUEUE') {
    onStatus({ stage: 'queued', queuePosition: update.queue_position });
  } else if (update?.status === 'IN_PROGRESS') {
    onStatus({ stage: 'running' });
  }
}

async function outputBlob(result, { model, fetchImpl, signal }) {
  const url = model.fal.output
    ? result?.data?.[model.fal.output]?.url
    : result?.data?.images?.[0]?.url;
  if (typeof url !== 'string' || !url) throw new Error(`fal completed without ${model.fal.output ? 'a GLB' : 'an image'}`);
  if (signal?.aborted) throw abortError();
  const response = await fetchImpl(url, { signal });
  if (!response?.ok) throw new Error(`fal image download failed (${response?.status || 'unknown'})`);
  return response.blob();
}

/**
 * @param {string} key device-held fal credential
 * @param {object} model selected catalogue record
 * @param {{createClient?: Function, fetch?: Function, proxyUrl?: string}} [deps] test seams and optional fal-compatible proxy
 */
export function createFalProvider(key, model, deps = {}) {
  const makeClient = deps.createClient || createFalClient;
  const fetchImpl = deps.fetch || globalThis.fetch;

  async function run(step, input, { onStatus = () => {}, signal } = {}) {
    assertUsable(model, step);
    if (signal?.aborted) throw abortError();
    if (typeof fetchImpl !== 'function') throw new Error('fal image download is unavailable');
    const proxyUrl = typeof deps.proxyUrl === 'string' ? deps.proxyUrl.trim() : '';
    const client = makeClient({ credentials: key, ...(proxyUrl ? { proxyUrl } : {}) });
    const controls = resolveModelControls(model, deps.controlValues, input?.detailLevel);
    let falInput;
    if (step === 'edit') {
      falInput = {
        prompt: input?.prompt,
        image_urls: [input?.grid],
        image_size: { width: 1024, height: 1024 },
        num_inference_steps: 28,
        guidance_scale: 4.5,
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'png',
        sync_mode: true,
      };
    } else if (step === 'picture') {
      falInput = {
        prompt: input?.prompt,
        image_size: { width: 1024, height: 1024 },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true,
        output_format: 'png',
        sync_mode: true,
      };
    } else if (model.fal.input === 'hunyuan3d-v3') {
      const views = step === 'views3d' ? input : null;
      falInput = {
        input_image_url: views ? views.front : input?.picture,
        ...(views ? {
          back_image_url: views.back,
          left_image_url: views.left,
          right_image_url: views.right,
        } : {}),
        enable_pbr: controls.enable_pbr,
        generate_type: controls.generate_type,
        ...(controls.generate_type === 'LowPoly' ? {
          face_count: controls.face_count, polygon_type: controls.polygon_type,
        } : {}),
      };
    } else if (model.fal.input === 'trellis-2') {
      falInput = {
        image_url: input?.picture,
        resolution: controls.resolution,
        decimation_target: controls.decimation_target,
        texture_size: controls.texture_size,
        remesh: true,
      };
    } else {
      throw new Error(`fal has no input mapping for ${model.id}`);
    }
    const result = await client.subscribe(model.fal.endpoint, {
      input: falInput,
      logs: false,
      abortSignal: signal,
      onQueueUpdate: (update) => reportQueue(update, onStatus),
    });
    return outputBlob(result, { model, fetchImpl, signal });
  }

  return {
    id: 'fal',
    editViews: (input, opts) => run('edit', input, opts),
    viewsTo3D: (input, opts) => run('views3d', input, opts),
    wordsToPicture: (input, opts) => run('picture', input, opts),
    pictureTo3D: (input, opts) => run('picture3d', input, opts),
    // fal has no free credential probe. Do not create a paid inference merely to test Settings.
    check(step) {
      assertUsable(model, step);
      return { ok: true, detail: 'key saved; no free fal key check' };
    },
  };
}
