/** UniRig transport shared by the browser and the local dev proxy. No LLM dependency. */
export const AUTO_RIG_SPACE = 'Faisal786U/unirig-api';
export const AUTO_RIG_TIMEOUT = 240000;

/** Validate a user-owned binary rigging endpoint before sending geometry or a credential. */
export function autoRigEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a complete API endpoint URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('Use HTTPS for the API endpoint (HTTP is allowed on localhost).');
  if (url.username || url.password || url.hash || url.search) throw new Error('Use an endpoint without credentials, query parameters or a fragment. Put the key in API key.');
  return url.href;
}

/** Submit a geometry-only GLB. Abort/timeout never returns a late result to the caller. */
export async function requestAutoRig(blob, { token, signal, provider = 'hugging-face', endpoint, onStatus = () => {}, connect, fetchImpl = globalThis.fetch, timeout = AUTO_RIG_TIMEOUT } = {}) {
  if (!['hugging-face', 'direct'].includes(provider)) throw new Error('Choose a supported auto-rig provider.');
  const directURL = provider === 'direct' ? autoRigEndpoint(endpoint) : null;
  let client, job, timer, abort;
  const controller = new AbortController();
  const cancelled = new Promise((_, reject) => {
    abort = () => { controller.abort(); reject(new Error('Auto-rig cancelled.')); };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new Error('Auto-rig took too long. Your model is unchanged. Try again later.')); }, timeout);
  });
  const work = async () => {
    if (controller.signal.aborted) throw new Error('Auto-rig cancelled.');
    if (directURL) {
      // Deliberately small contract: raw geometry GLB in, rigged GLB out. No credential redirects.
      const response = await fetchImpl(directURL, {
        method: 'POST', body: blob, signal: controller.signal, redirect: 'error', credentials: 'omit',
        headers: { 'Content-Type': 'model/gltf-binary', Accept: 'model/gltf-binary', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) throw new Error(`The rigging API returned HTTP ${response.status}. Check the endpoint and API key.`);
      return readRigGLB(response);
    }
    const api = connect ? { connect } : (await import('@gradio/client')).Client;
    client = await api.connect(AUTO_RIG_SPACE, { events: ['data', 'status'], ...(token ? { token } : {}) });
    if (controller.signal.aborted) { client.close?.(); throw new Error('Auto-rig cancelled.'); }
    const { handle_file } = await import('@gradio/client');
    job = client.submit('/rig_model', { input_glb: handle_file(blob) });
    let result;
    for await (const event of job) {
      if (controller.signal.aborted) throw new Error('Auto-rig cancelled.');
      if (event.type === 'status') {
        if (event.stage === 'error' || event.success === false) throw new Error(event.message || 'The rigging service failed.');
        onStatus(event.stage === 'pending' ? 'The rigging service is working…' : 'Receiving the skeleton…');
      }
      if (event.type === 'data') result = event.data;
    }
    const url = result?.[0]?.url;
    if (!url) throw new Error(typeof result?.[1] === 'string' ? result[1] : 'The service returned no rig.');
    if (new URL(url).protocol !== 'https:') throw new Error('The service returned an invalid model URL.');
    const response = await fetchImpl(url, { signal: controller.signal }); // never forward the HF token to an asset URL
    if (!response.ok) throw new Error(`Could not download the rig (${response.status}).`);
    return readRigGLB(response);
  };
  try { return await Promise.race([work(), cancelled]); }
  catch (error) {
    const message = String(error.message || error).replace(/hf_[A-Za-z0-9]+/g, '[redacted]');
    throw new Error(token ? message.split(token).join('[redacted]') : message);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
    try { Promise.resolve(job?.cancel()).catch(() => {}); } catch { /* best effort */ }
    try { client?.close(); } catch { /* best effort */ }
  }
}

async function readRigGLB(response) {
  if (Number(response.headers.get('content-length')) > 30 * 1024 * 1024) throw new Error('The rigged GLB is too large (maximum 30 MB).');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 30 * 1024 * 1024 || bytes.byteLength < 20 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) throw new Error('The service returned an invalid GLB.');
  return bytes;
}
