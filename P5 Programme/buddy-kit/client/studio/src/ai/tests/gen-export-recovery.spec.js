import { createHfSpacesProvider } from '../gen-providers/hf-spaces.js';

const results = [];
for (const scenario of ['default', 'ply', 'success', 'auth', 'cancel']) {
  const calls = [], notices = [], downloads = [];
  const ctrl = new AbortController();
  const provider = createHfSpacesProvider('test', 'hunyuan3d-2.1', {
    controlValues: { reduce_face: scenario !== 'default', target_face_num: 23456 },
    handleFile: (x) => x,
    connect: async () => ({
      close() {},
      submit(endpoint, payload) {
        calls.push({ endpoint, payload });
        return (async function* () {
          if (endpoint === '/generation_all') {
            yield { type: 'data', data: [{ url: 'shape.glb' }, { url: 'painted.glb' }] };
          } else if (scenario === 'success') {
            yield { type: 'data', data: ['html', { url: 'reduced.glb' }] };
          } else {
            if (scenario === 'cancel') ctrl.abort();
            yield { type: 'status', stage: 'error', message: scenario === 'auth' ? '401 unauthorized' : 'Unknown format for load: ply' };
          }
        })();
      },
    }),
    fetchImpl: async (url) => { downloads.push(url); return { ok: true, blob: async () => url }; },
  });
  const result = await provider.pictureTo3D({ picture: 'input' }, {
    signal: ctrl.signal, onStatus: (s) => { if (s.warning) notices.push(s.warning); },
  }).catch((e) => e);
  if (scenario === 'default') results.push(['export recovery: provider default skips export and keeps texture',
    result === 'painted.glb' && calls.length === 1 && notices.length === 0]);
  if (scenario === 'ply') results.push(['export recovery: broken PLY export keeps original without regenerating, with an honest notice',
    result === 'painted.glb' && calls.length === 2 && notices.length === 1 && /not applied/.test(notices[0])]);
  if (scenario === 'success') results.push(['export recovery: enabled simplification uses the custom target and reduced output',
    result === 'reduced.glb' && calls[1].payload.target_face_num === 23456 && notices.length === 0]);
  if (scenario === 'auth' || scenario === 'cancel') results.push([`export recovery: ${scenario} is not hidden by a fallback`,
    result instanceof Error && downloads.length === 0]);
}
export default function (check) { for (const [name, ok] of results) check(name, ok); }
