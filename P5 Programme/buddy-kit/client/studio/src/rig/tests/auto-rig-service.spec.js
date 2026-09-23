import { requestAutoRig, autoRigEndpoint } from '../auto-rig-service.js';

async function run(check) {
  let submitted = 0, closed = 0;
  const fakeClient = { submit() { submitted++; return { async *[Symbol.asyncIterator]() { yield { type: 'status', stage: 'error', message: 'GPU task aborted' }; }, cancel() {} }; }, close() { closed++; } };
  let error = '';
  try { await requestAutoRig(new Blob(['fake']), { connect: async () => fakeClient }); } catch (e) { error = e.message; }
  check('auto-rig service: a GPU abort is an error, not a completed empty rig', error === 'GPU task aborted' && submitted === 1 && closed === 1);
  let cancelled = false;
  const hanging = { submit() { return { async *[Symbol.asyncIterator]() { await new Promise(() => {}); }, cancel() { cancelled = true; } }; }, close() {} };
  try { await requestAutoRig(new Blob(['fake']), { connect: async () => hanging, timeout: 15 }); } catch (e) { error = e.message; }
  check('auto-rig service: a hanging provider times out and cancels the job', /too long/.test(error) && cancelled);
  const controller = new AbortController(); controller.abort();
  let connected = false;
  try { await requestAutoRig(new Blob(['fake']), { signal: controller.signal, connect: async () => { connected = true; return fakeClient; } }); } catch (e) { error = e.message; }
  check('auto-rig service: pre-cancelled request never connects', !connected && /cancelled/.test(error));
  let resolveConnect, lateClosed = false;
  const later = new Promise((resolve) => { resolveConnect = resolve; });
  try { await requestAutoRig(new Blob(['fake']), { connect: () => later, timeout: 10 }); } catch { /* expected */ }
  resolveConnect({ close() { lateClosed = true; }, submit() { throw new Error('late submission'); } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  check('auto-rig service: a connection resolving after timeout is closed without submission', lateClosed);
  const glb = new ArrayBuffer(24); new DataView(glb).setUint32(0, 0x46546c67, true);
  const input = new Blob(['geometry']);
  let call;
  const output = await requestAutoRig(input, { provider: 'direct', endpoint: 'https://rig.example/rig', token: 'private-api-key',
    fetchImpl: async (url, options) => { call = { url, ...options }; return new Response(glb); } });
  check('direct rig: posts original binary body to chosen URL with Bearer key', call.url === 'https://rig.example/rig' && call.method === 'POST' && call.body === input && call.headers.Authorization === 'Bearer private-api-key' && call.headers['Content-Type'] === 'model/gltf-binary');
  check('direct rig: does not follow redirects or send ambient cookies', call.redirect === 'error' && call.credentials === 'omit');
  check('direct rig: returns binary GLB', new DataView(output).getUint32(0, true) === 0x46546c67);
  await requestAutoRig(input, { provider: 'direct', endpoint: 'http://localhost:9000/rig', fetchImpl: async (_, options) => { call = options; return new Response(glb); } });
  check('direct rig: supports local endpoints without authentication', !('Authorization' in call.headers));
  for (const endpoint of ['http://remote.example/rig', 'https://user:password@rig.example/rig', 'https://rig.example/rig?key=secret', 'https://rig.example/rig#fragment', 'not a url']) {
    let rejected = false;
    try { autoRigEndpoint(endpoint); } catch { rejected = true; }
    check(`direct rig: rejects unsafe or invalid endpoint ${endpoint.split('?')[0]}`, rejected);
  }
  for (const [response, expected] of [[new Response('unauthorized', { status: 401 }), /HTTP 401/], [new Response('{"job":"pending"}'), /invalid GLB/], [new Response(glb, { headers: { 'content-length': String(31 * 1024 * 1024) } }), /too large/]]) {
    error = '';
    try { await requestAutoRig(input, { provider: 'direct', endpoint: 'https://rig.example/rig', fetchImpl: async () => response }); } catch (e) { error = e.message; }
    check('direct rig: rejects HTTP failures, non-GLB replies and oversized responses', expected.test(error));
  }
  let directSignal;
  try { await requestAutoRig(input, { provider: 'direct', endpoint: 'https://rig.example/rig', timeout: 10, fetchImpl: (_, options) => { directSignal = options.signal; return new Promise(() => {}); } }); } catch (e) { error = e.message; }
  check('direct rig: timeout aborts a hanging HTTP request', /too long/.test(error) && directSignal.aborted);
  try { await requestAutoRig(input, { provider: 'direct', endpoint: 'https://rig.example/rig', token: 'private-api-key', fetchImpl: async () => { throw new Error('failed private-api-key'); } }); } catch (e) { error = e.message; }
  check('direct rig: provider errors redact the custom API credential', error === 'failed [redacted]');
}
const results = [];
await run((name, condition) => results.push([name, condition]));
export default function (check) { for (const [name, condition] of results) check(name, condition); }
