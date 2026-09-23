/** Tencent TokenHub provider tests use fake HTTP responses. No API or GPU call is made. */
import { createTencentTokenHubProvider } from '../gen-providers/tencent-tokenhub.js';
import { modelById } from '../gen-models.js';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

{
  const calls = [];
  const statuses = [];
  const replies = [
    jsonResponse({ id: 'job-123', status: 'queued' }),
    jsonResponse({ id: 'job-123', status: 'in_progress' }),
    jsonResponse({ id: 'job-123', status: 'completed', data: [
      { type: 'obj', url: 'https://files.example/model.zip' },
      { type: 'glb', url: 'https://files.example/model.glb' },
    ] }),
    { ok: true, status: 200, blob: async () => new Blob(['glb'], { type: 'model/gltf-binary' }) },
  ];
  const fetch = async (url, options) => { calls.push({ url, options }); return replies.shift(); };
  const waits = [];
  const provider = createTencentTokenHubProvider('tencent-secret', modelById('hunyuan3d-3.1-tokenhub'), {
    fetch, wait: async (ms, signal) => { waits.push({ ms, signal }); }, baseUrl: ' https://proxy.example/tokenhub/ ',
  });
  const signal = new AbortController().signal;
  const out = await provider.pictureTo3D({ picture: new Blob(['hello'], { type: 'image/png' }) }, {
    signal, onStatus: (status) => statuses.push(status),
  });
  const submit = JSON.parse(calls[0].options.body);
  const query1 = JSON.parse(calls[1].options.body);
  rec('tencent-tokenhub: submits to a configured compatible base URL with only its own bearer key',
    calls[0].url === 'https://proxy.example/tokenhub/v1/api/3d/submit' &&
    calls[0].options.headers.Authorization === 'Bearer tencent-secret');
  rec('tencent-tokenhub: sends the real documented single-image base64 wire format',
    submit.model === 'hy-3d-3.1' && submit.image_base64 === 'aGVsbG8=' &&
    submit.enable_pbr === true && submit.generate_type === 'normal' && submit.face_count === 100000 &&
    !Object.hasOwn(submit, 'image_url'));
  rec('tencent-tokenhub: polls the documented query endpoint using the returned job id',
    calls[1].url.endsWith('/v1/api/3d/query') && query1.model === 'hy-3d-3.1' && query1.id === 'job-123' &&
    calls[2].url.endsWith('/v1/api/3d/query') && waits.length === 2);
  rec('tencent-tokenhub: reports queued, running and downloading states',
    statuses.map((status) => status.stage).join() === 'queued,running,downloading');
  rec('tencent-tokenhub: chooses the GLB result rather than an OBJ-shaped fixture',
    calls[3].url === 'https://files.example/model.glb' && calls[3].options.signal === signal && out instanceof Blob);
  const before = calls.length;
  const check = await provider.check('picture3d');
  rec('tencent-tokenhub: Settings check never starts paid inference',
    check.ok && /no free/.test(check.detail) && calls.length === before);
}

{
  let calls = 0;
  const ctrl = new AbortController(); ctrl.abort();
  const provider = createTencentTokenHubProvider('key', modelById('hunyuan3d-3.1-tokenhub'), {
    fetch: async () => { calls++; return jsonResponse({}); }, wait: async () => {},
  });
  const err = await provider.pictureTo3D({ picture: new Blob(['x']) }, { signal: ctrl.signal }).catch((e) => e);
  rec('tencent-tokenhub: an already-cancelled request sends nothing', err?.name === 'AbortError' && calls === 0);
}

{
  const provider = createTencentTokenHubProvider('key', modelById('hunyuan3d-3.1-tokenhub'), {
    fetch: async () => jsonResponse({ message: 'invalid API key' }, 401), wait: async () => {},
  });
  const err = await provider.pictureTo3D({ picture: new Blob(['x']) }, {}).catch((e) => e);
  rec('tencent-tokenhub: HTTP authentication failures keep their status for service classification',
    /401/.test(err?.message) && /invalid API key/.test(err?.message));
}

{
  const provider = createTencentTokenHubProvider('key', modelById('hunyuan3d-3.1-tokenhub'), {
    fetch: async () => jsonResponse({ id: 'job', status: 'completed', data: [{ type: 'obj', url: 'x' }] }),
    wait: async () => {},
  });
  const missing = await provider.pictureTo3D({ picture: new Blob(['x']) }, {}).catch((e) => e);
  const wrong = await provider.pictureTo3D.call({}, {}, {}).catch((e) => e);
  rec('tencent-tokenhub: a completed response without a GLB fails clearly', /without a GLB/.test(missing?.message));
  rec('tencent-tokenhub: missing picture input fails before submitting', /picture file/.test(wrong?.message));
}

export default function genTencentTokenHubTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
