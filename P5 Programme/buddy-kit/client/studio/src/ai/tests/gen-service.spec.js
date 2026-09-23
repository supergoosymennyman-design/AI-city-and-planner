/**
 * gen-service.spec.js — one generation step through a FAKE provider (no network, no GPU).
 * Async checks run at module top level (top-level await; the runner awaits the import) and are
 * replayed through `check` by the default export — the client.spec.js pattern.
 */
import { createGenService, GenError, ERROR_TEXT, STEP_METHOD, CHECK_TIMEOUT_MS, redact, classify } from '../gen-service.js';

const results = [];
const rec = (name, cond) => results.push([name, !!cond]);
const KEY = 'hf_abcdefgh12345678';
const cfgWith = (key = KEY) => () => ({
  models: { edit: 'qwen-image-edit-2511', views3d: 'hunyuan3d-2mv', picture: 'flux-1-schnell',
    picture3d: 'hunyuan3d-2.1', texture: 'none' },
  connections: { 'hf-spaces': { key } },
});

function fakeProvider(overrides = {}) {
  const calls = [];
  const p = {
    editViews: async (input, opts) => {
      calls.push(['editViews', input, opts]);
      opts.onStatus({ stage: 'queued', queuePosition: 2 });
      opts.onStatus({ stage: 'running', progressData: [{ index: 10, length: 40 }] });
      return 'edited-grid';
    },
    viewsTo3D: async () => 'glb',
    wordsToPicture: async () => 'picture',
    pictureTo3D: async () => 'glb-b',
    check: async (step) => ({ ok: step !== 'picture', detail: step === 'picture' ? `bad ${KEY}` : 'connected' }),
    ...overrides,
  };
  return { p, calls };
}

/** Timers that never fire on their own: the test fires them. */
function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    setTimeout: (fn) => { pending.set(++id, fn); return id; },
    clearTimeout: (t) => { pending.delete(t); },
    fireAll: () => { const fns = [...pending.values()]; pending.clear(); for (const fn of fns) fn(); },
    get size() { return pending.size; },
  };
}

// 1. success; progress passes through with step and expected time
{
  const { p, calls } = fakeProvider();
  const timers = fakeTimers();
  let factoryKey, factoryModel, factoryConnection;
  const svc = createGenService({ providers: { 'hf-spaces': (key, model, connection) => {
    factoryKey = key; factoryModel = model; factoryConnection = connection; return p;
  } }, config: cfgWith(), timers });
  const seen = [];
  const out = await svc.runStep('edit', { grid: 'g', prompt: 'x' }, { onProgress: (s) => seen.push(s) });
  rec('gen-service: returns the provider result', out === 'edited-grid');
  rec('gen-service: the provider got the input untouched', calls[0][1].grid === 'g' && calls[0][1].prompt === 'x');
  rec('gen-service: the factory receives only its own key and selected model',
    factoryKey === KEY && factoryConnection.key === KEY &&
    factoryModel.id === 'qwen-image-edit-2511' && factoryModel.provider === 'hf-spaces');
  rec('gen-service: progress starts, passes statuses through, then done', seen.map((s) => s.stage).join() === 'starting,queued,running,done');
  rec('gen-service: progress carries the step and expected time', seen.every((s) => s.step === 'edit' && s.expectedMs === 64000));
  rec('gen-service: queue position and progress data survive', seen[1].queuePosition === 2 && seen[2].progressData[0].index === 10);
  rec('gen-service: the timeout timer is cleared after success', timers.size === 0);
}

// Model controls must cross the service factory seam. Provider payload tests alone cannot prove
// the values saved in Settings ever reach that provider instance.
{
  let factoryConnection;
  const svc = createGenService({
    providers: { 'hf-spaces': (key, model, connection) => {
      factoryConnection = connection;
      return { viewsTo3D: async () => 'controlled-glb' };
    } },
    config: () => ({
      models: { views3d: 'hunyuan3d-2mv' },
      connections: { 'hf-spaces': { key: KEY } },
      controls: { 'hunyuan3d-2mv': { octree_resolution: 384, steps: 10, num_chunks: 12000, target_face_num: 24000 } },
    }),
    timers: fakeTimers(),
  });
  const out = await svc.runStep('views3d', {});
  rec('gen-service: Settings raw controls cross the factory seam for the selected model',
    out === 'controlled-glb' && factoryConnection.controlValues?.octree_resolution === 384 &&
    factoryConnection.controlValues?.target_face_num === 24000);
}

// 2. no key → no-key, and the provider is never built
{
  let built = 0;
  const svc = createGenService({ providers: { 'hf-spaces': () => { built++; return fakeProvider().p; } }, config: cfgWith('  '), timers: fakeTimers() });
  let err;
  try { await svc.runStep('edit', {}); } catch (e) { err = e; }
  rec('gen-service: no key → GenError no-key', err instanceof GenError && err.code === 'no-key' && err.message === ERROR_TEXT['no-key']);
  rec('gen-service: ...and nothing was sent', built === 0);
}

// 2b. A provider is given its reusable connection and its secret stays redacted.
{
  const providerKey = 'provider-secret';
  let received, receivedConnection;
  const svc = createGenService({
    providers: { 'hf-spaces': (key, model, connection) => ({
      editViews: async () => { received = key; receivedConnection = connection; throw new Error(providerKey); },
    }) },
    config: () => ({
      models: { edit: 'qwen-image-edit-2511' },
      connections: { 'hf-spaces': { key: providerKey, futureField: 'future-value' } },
    }),
    timers: fakeTimers(),
  });
  const err = await svc.runStep('edit', {}).catch((e) => e);
  rec('gen-service: provider factory receives its reusable connection once',
    received === providerKey && receivedConnection.futureField === 'future-value');
  rec('gen-service: connection secret is redacted', !err.detail.includes(providerKey) && err.detail.includes('[key]'));
}

{
  let factoryKey, factoryConnection;
  const svc = createGenService({
    providers: { fal: (key, model, connection) => {
      factoryKey = key; factoryConnection = connection;
      return { wordsToPicture: async () => 'picture-through-proxy' };
    } },
    config: () => ({
      models: { picture: 'flux-1-schnell-fal' },
      connections: { fal: { key: '', proxyUrl: 'https://proxy.example/fal' } },
    }),
    timers: fakeTimers(),
  });
  const out = await svc.runStep('picture', {});
  rec('gen-service: a provider-compatible proxy can run without a browser-held key',
    out === 'picture-through-proxy' && factoryKey === '' && factoryConnection.proxyUrl === 'https://proxy.example/fal');
}

// 3. provider errors are classified, and the key is redacted
for (const [msg, code] of [
  ['You have exceeded your ZeroGPU runs limit.', 'quota'],
  ['401 Unauthorized: invalid token', 'bad-key'],
  ['Queue is full', 'busy'],
  ['TypeError: Failed to fetch', 'down'],
  ['something odd', 'failed'],
]) {
  const { p } = fakeProvider({ editViews: async () => { throw new Error(`${msg} (token ${KEY})`); } });
  const svc = createGenService({ providers: { 'hf-spaces': () => p }, config: cfgWith(), timers: fakeTimers() });
  let err;
  try { await svc.runStep('edit', {}); } catch (e) { err = e; }
  rec(`gen-service: "${msg}" → ${code}`, err instanceof GenError && err.code === code);
  rec(`gen-service: the key is redacted (${code})`, !!err && !err.detail.includes(KEY) && err.detail.includes('[key]'));
}

// 4. cancel mid-step: rejects as cancelled and aborts the provider's own signal
{
  let providerSignal;
  const { p } = fakeProvider({
    editViews: (input, opts) => {
      providerSignal = opts.signal;
      return new Promise((_, reject) => opts.signal.addEventListener('abort',
        () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    },
  });
  const svc = createGenService({ providers: { 'hf-spaces': () => p }, config: cfgWith(), timers: fakeTimers() });
  const ctrl = new AbortController();
  const running = svc.runStep('edit', {}, { signal: ctrl.signal });
  ctrl.abort();
  let err;
  try { await running; } catch (e) { err = e; }
  rec('gen-service: cancel → cancelled', err instanceof GenError && err.code === 'cancelled');
  rec('gen-service: cancel aborts the provider call', providerSignal.aborted === true);
}

// 5. an already-aborted signal sends nothing
{
  let built = 0;
  const ctrl = new AbortController();
  ctrl.abort();
  const svc = createGenService({ providers: { 'hf-spaces': () => { built++; return fakeProvider().p; } }, config: cfgWith(), timers: fakeTimers() });
  let err;
  try { await svc.runStep('edit', {}, { signal: ctrl.signal }); } catch (e) { err = e; }
  rec('gen-service: an aborted signal sends nothing', err?.code === 'cancelled' && built === 0);
}

// 6. a provider that never answers times out, and its signal is aborted
{
  let providerSignal;
  const { p } = fakeProvider({ editViews: (input, opts) => { providerSignal = opts.signal; return new Promise(() => {}); } });
  const timers = fakeTimers();
  const svc = createGenService({ providers: { 'hf-spaces': () => p }, config: cfgWith(), timers });
  const running = svc.runStep('edit', {});
  timers.fireAll();
  let err;
  try { await running; } catch (e) { err = e; }
  rec('gen-service: a silent provider times out', err instanceof GenError && err.code === 'timeout' && err.message === ERROR_TEXT.timeout);
  rec('gen-service: the timeout aborts the provider call', providerSignal?.aborted === true);
}

// 7. unknown step, provider without the method, unknown provider
{
  const svc = createGenService({ providers: { 'hf-spaces': () => ({}) }, config: cfgWith(), timers: fakeTimers() });
  let e1;
  try { await svc.runStep('paint', {}); } catch (e) { e1 = e; }
  let e2;
  try { await svc.runStep('edit', {}); } catch (e) { e2 = e; }
  const svc2 = createGenService({ providers: {}, config: cfgWith(), timers: fakeTimers() });
  let e3;
  try { await svc2.runStep('edit', {}); } catch (e) { e3 = e; }
  rec('gen-service: unknown step fails clearly', e1?.code === 'failed' && /unknown step/.test(e1.detail));
  rec('gen-service: a provider without the method fails clearly', e2?.code === 'failed' && /cannot do/.test(e2.detail));
  rec('gen-service: an unknown provider fails clearly', e3?.code === 'failed' && /no provider/.test(e3.detail));
}

// 8. checkAll: one row per step, details redacted
{
  const { p } = fakeProvider();
  const svc = createGenService({ providers: { 'hf-spaces': () => p }, config: cfgWith(), timers: fakeTimers() });
  const rows = await svc.checkAll();
  rec('gen-service: checkAll covers every step', rows.map((r) => r.step).join() === 'edit,views3d,picture,picture3d,texture');
  rec('gen-service: checkAll reports ok, not ok and skipped', rows.filter((r) => r.ok).length === 4 &&
    !rows.find((r) => r.step === 'picture').ok && rows.find((r) => r.step === 'texture').detail === 'skipped');
  rec('gen-service: checkAll redacts the key', rows.every((r) => !r.detail.includes(KEY)));
  const none = createGenService({ providers: { 'hf-spaces': () => p }, config: cfgWith(''), timers: fakeTimers() });
  const noKeyRows = await none.checkAll();
  rec('gen-service: checkAll without a key says so except for explicit none',
    noKeyRows.slice(0, 4).every((r) => !r.ok && r.detail === 'no connection') && noKeyRows[4].ok && noKeyRows[4].detail === 'skipped');
}

// 9. helpers
rec('gen-service: every step has a provider method', Object.keys(STEP_METHOD).join() === 'edit,views3d,picture,picture3d,texture' && STEP_METHOD.texture === 'textureMesh');
rec('gen-service: redact removes any hf_ token too', redact('x hf_ZZZZZZZZZZZZ y', '') === 'x [key] y');
rec('gen-service: classify AbortError → cancelled', classify(Object.assign(new Error('x'), { name: 'AbortError' })) === 'cancelled');

// 10. Every setup/invocation error passes through the same sanitizing boundary.
for (const secret of [KEY, 'xy']) {
  for (const failure of ['factory', 'getter', 'method', 'gen-error', 'check']) {
    const leak = () => { throw failure === 'gen-error' ? new GenError('busy', `detail ${secret}`) : new Error(`failure ${secret}`); };
    const make = () => {
      if (failure === 'factory') return leak();
      if (failure === 'getter') return Object.defineProperty({}, 'editViews', { get: leak });
      return { editViews: leak, check: leak };
    };
    const svc = createGenService({ providers: { 'hf-spaces': make }, config: cfgWith(secret), timers: fakeTimers() });
    const e = await svc.runStep('edit', {}).catch((err) => err);
    rec(`gen-service: ${failure} redacts key of length ${secret.length}`, e instanceof GenError &&
      !`${e.message} ${e.detail} ${e.stack}`.includes(secret));
    const rows = await svc.checkAll();
    rec(`gen-service: Settings ${failure} rows cannot expose the key`, !JSON.stringify(rows).includes(secret));
  }
}
{
  const svc = createGenService({ providers: {}, config: () => { throw new Error(`settings failure ${KEY}`); }, timers: fakeTimers() });
  const e = await svc.runStep('edit', {}).catch((err) => err);
  rec('gen-service: unreadable configuration exposes no raw error detail', e instanceof GenError && e.detail === '' && !e.stack.includes(KEY));
  rec('gen-service: failed configuration still produces five safe check rows', (await svc.checkAll()).length === 5 && !(JSON.stringify(await svc.checkAll())).includes(KEY));
}

// 11. A hung check (ignoring abort) times out; the other rows still run, with no generation.
{
  const timers = fakeTimers();
  const calls = []; let firstSignal, generate = 0;
  const svc = createGenService({ config: cfgWith(), timers, providers: { 'hf-spaces': () => ({
    editViews() { generate++; },
    check(step, { signal }) {
      calls.push(step);
      if (step === 'edit') { firstSignal = signal; return new Promise(() => {}); }
      return { ok: true, detail: 'connected' };
    },
  }) } });
  const pending = svc.checkAll();
  timers.fireAll();
  const rows = await pending;
  rec('gen-service: checks use a separate 15-second limit', CHECK_TIMEOUT_MS === 15000);
  rec('gen-service: timed-out row does not block the remaining free checks', !rows[0].ok && rows.slice(1).every((r) => r.ok) && calls.length === 4 && firstSignal.aborted && generate === 0 && timers.size === 0);
}
{
  const timers = fakeTimers(), ctrl = new AbortController();
  let calls = 0, capturedSignal;
  const svc = createGenService({ config: cfgWith(), timers, providers: { 'hf-spaces': () => ({
    check(step, { signal }) { calls++; capturedSignal = signal; return new Promise(() => {}); },
  }) } });
  const pending = svc.checkAll({ signal: ctrl.signal });
  ctrl.abort();
  const rows = await pending;
  rec('gen-service: cancel frees Settings even if check ignores abort', rows.length === 5 && rows.every((r) => !r.ok) && calls === 1 && capturedSignal.aborted && timers.size === 0);
}
{
  const ctrl = new AbortController(); let report;
  const seen = [];
  const svc = createGenService({ config: cfgWith(), timers: fakeTimers(), providers: { 'hf-spaces': () => ({
    editViews(input, opts) { report = opts.onStatus; return new Promise(() => {}); },
  }) } });
  const pending = svc.runStep('edit', {}, { signal: ctrl.signal, onProgress: (s) => seen.push(s) }).catch((e) => e);
  ctrl.abort(); await pending;
  const count = seen.length; report({ stage: 'running' });
  rec('gen-service: cancelled work cannot deliver late progress', seen.length === count);
}

export default function genServiceTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
