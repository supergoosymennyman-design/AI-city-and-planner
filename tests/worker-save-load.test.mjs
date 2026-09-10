// tests/worker-save-load.test.mjs — the worker's cloud save/load endpoints,
// exercised through the REAL fetch handler with a fake KV namespace.
//
// Run: node --test tests/worker-save-load.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../P5 Programme/buddy-kit/worker/index.mjs';

/** A Map-backed fake for the Cloudflare KV namespace (env.SAVES). */
function fakeKV() {
  const map = new Map();
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => { map.set(k, String(v)); },
    _map: map,
  };
}

const jsonReq = (path, body, method = 'POST') => new Request('http://worker.test' + path, {
  method,
  headers: body != null ? { 'content-type': 'application/json' } : undefined,
  body: body == null ? undefined : JSON.stringify(body),
});

async function fetchWith(env, path, body, method) {
  const res = await worker.fetch(jsonReq(path, body, method), env);
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

test('POST /api/save returns a 4-word mnemonic code and stores the payload', async () => {
  const kv = fakeKV();
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/save', {
    label: 'Jason week 3', state: { layout: '{"version":2}', skin: 'crimson' },
  });
  assert.equal(status, 200);
  assert.match(data.code, /^[a-z]+(-[a-z]+){3}$/, 'expected 4 hyphenated words');
  const stored = JSON.parse(kv._map.get(data.code));
  assert.equal(stored.label, 'Jason week 3');
  assert.equal(stored.state.skin, 'crimson');
});

test('POST /api/save with an existing word code UPSERTS (no new code)', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'tiger-bamboo-river-umbrella', state: { layout: 'x' } });
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/save', { code: 'tiger-bamboo-river-umbrella', state: { layout: 'y' } });
  assert.equal(status, 200);
  assert.equal(data.code, 'tiger-bamboo-river-umbrella');
  assert.equal(JSON.parse(kv._map.get('tiger-bamboo-river-umbrella')).state.layout, 'y');
});

test('POST /api/load accepts messy word-code input (uppercase, spaces) and restores', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'tiger-bamboo-river-umbrella', state: { layout: 'L' } });
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/load', { code: 'Tiger Bamboo River Umbrella' });
  assert.equal(status, 200);
  assert.equal(data.state.layout, 'L');
});

test('legacy NOVA-XXXXXX codes still load (backward compatible)', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'NOVA-K7M2P3', state: { layout: 'legacy' } });
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/load', { code: 'k7m2p3' });
  assert.equal(status, 200);
  assert.equal(data.state.layout, 'legacy');
});

test('POST /api/load: bad code → 400, unknown code → 404', async () => {
  const kv = fakeKV();
  const bad = await fetchWith({ SAVES: kv }, '/api/load', { code: 'NOPE' });
  assert.equal(bad.status, 400);
  const missing = await fetchWith({ SAVES: kv }, '/api/load', { code: 'NOVA-XXXXXX' });
  assert.equal(missing.status, 404);
});

test('A7: GET /api/load is gone — the code must ride in the body, never the query string', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'tiger-bamboo-river-umbrella', state: { layout: 'L' } });
  const res = await worker.fetch(new Request('http://worker.test/api/load?code=tiger-bamboo-river-umbrella', { method: 'GET' }), { SAVES: kv });
  assert.equal(res.status, 404, 'GET /api/load must not resolve (A7)');
});

test('A5/A7: a save label that trips the safety screen or is over-long falls back to the default', async () => {
  const kv = fakeKV();
  // An email is PII the filter flags — it must never reach KV, even though the copy asks kids not to.
  const pii = await fetchWith({ SAVES: kv }, '/api/save', { label: 'me@example.com', state: { layout: 'x' } });
  assert.equal(pii.status, 200);
  assert.equal(JSON.parse(kv._map.get(pii.data.code)).label, 'My AI City');
  // Over-long labels are neutralised rather than stored (or rejected).
  const long = await fetchWith({ SAVES: kv }, '/api/save', { label: 'x'.repeat(200), state: { layout: 'y' } });
  assert.equal(long.status, 200);
  assert.equal(JSON.parse(kv._map.get(long.data.code)).label, 'My AI City');
  // A normal kid city name is kept as-is.
  const ok = await fetchWith({ SAVES: kv }, '/api/save', { label: 'My Dragon City', state: { layout: 'z' } });
  assert.equal(JSON.parse(kv._map.get(ok.data.code)).label, 'My Dragon City');
});

test('POST /api/save rejects bad bodies, missing KV (503), and oversized bodies (400)', async () => {
  const kv = fakeKV();
  const noState = await fetchWith({ SAVES: kv }, '/api/save', { label: 'x' });
  assert.equal(noState.status, 400);
  const noKv = await fetchWith({}, '/api/save', { state: { a: 'b' } });
  assert.equal(noKv.status, 503);
  // The worker's body gate (256KB) rejects a huge save before any KV write.
  const big = await fetchWith({ SAVES: kv }, '/api/save', { state: { a: 'x'.repeat(400 * 1024) } });
  assert.equal(big.status, 400);
});
