/**
 * Browser adapter for Tencent's official TokenHub HY-3D API.
 *
 * TokenHub accepts a single input picture as raw base64, returns an asynchronous job id, and is
 * polled until its result list contains a GLB. Multiview is deliberately not mapped here because
 * the official wire format requires public image URLs rather than the in-memory captures this app
 * owns. Tests inject fetch and waiting; they never submit a paid task.
 */

const DEFAULT_BASE_URL = 'https://tokenhub.tencentmaas.com';
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

function assertUsable(model, step) {
  if (!model?.available || model.provider !== 'tencent-tokenhub' ||
      !model.steps?.includes(step) || typeof model.tokenhub?.model !== 'string') {
    throw new Error(`Tencent TokenHub model cannot run ${step}`);
  }
}

function normalizeBaseUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function blobBase64(blob, signal) {
  if (!(blob instanceof Blob)) throw new Error('Tencent TokenHub needs a picture file');
  if (signal?.aborted) throw abortError();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (signal?.aborted) throw abortError();
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function responseJson(response) {
  let body = null;
  try { body = await response.json(); } catch { /* malformed provider response */ }
  if (!response?.ok) {
    const detail = body?.error?.message || body?.message || `HTTP ${response?.status || 'error'}`;
    throw new Error(`Tencent TokenHub request failed (${response?.status || 'unknown'}): ${detail}`);
  }
  if (!body || typeof body !== 'object') throw new Error('Tencent TokenHub returned invalid JSON');
  return body;
}

function waitForPoll(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener('abort', cancel); resolve(); }
    function cancel() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError()); }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/**
 * @param {string} key device-held Tencent TokenHub API key
 * @param {object} model selected catalogue record
 * @param {{fetch?: Function, wait?: Function, baseUrl?: string}} [deps] test seams and compatible proxy
 */
export function createTencentTokenHubProvider(key, model, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const wait = deps.wait || waitForPoll;
  const baseUrl = normalizeBaseUrl(deps.baseUrl);
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function post(path, payload, signal) {
    if (signal?.aborted) throw abortError();
    if (typeof fetchImpl !== 'function') throw new Error('Tencent TokenHub connection is unavailable');
    return responseJson(await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal,
    }));
  }

  async function pictureTo3D(input, { onStatus = () => {}, signal } = {}) {
    assertUsable(model, 'picture3d');
    const image_base64 = await blobBase64(input?.picture, signal);
    const submitted = await post('/v1/api/3d/submit', {
      model: model.tokenhub.model,
      image_base64,
      enable_pbr: true,
      face_count: 100000,
      generate_type: 'normal',
    }, signal);
    if (typeof submitted.id !== 'string' || !submitted.id) {
      throw new Error('Tencent TokenHub submitted no job id');
    }

    let job = submitted;
    while (job.status === 'queued' || job.status === 'in_progress') {
      onStatus({ stage: job.status === 'queued' ? 'queued' : 'running' });
      await wait(1500, signal);
      job = await post('/v1/api/3d/query', { model: model.tokenhub.model, id: submitted.id }, signal);
    }
    if (job.status !== 'completed') {
      throw new Error(`Tencent TokenHub job ${job.status || 'failed'}${job.message ? `: ${job.message}` : ''}`);
    }
    const url = job.data?.find((item) => item?.type === 'glb')?.url;
    if (typeof url !== 'string' || !url) throw new Error('Tencent TokenHub completed without a GLB');
    onStatus({ stage: 'downloading' });
    const output = await fetchImpl(url, { signal });
    if (!output?.ok) throw new Error(`Tencent TokenHub GLB download failed (${output?.status || 'unknown'})`);
    return output.blob();
  }

  return {
    id: 'tencent-tokenhub',
    pictureTo3D,
    // TokenHub has no documented free credential probe. Testing must not start a paid generation.
    check(step) {
      assertUsable(model, step);
      return { ok: true, detail: 'key saved; no free Tencent TokenHub key check' };
    },
  };
}
