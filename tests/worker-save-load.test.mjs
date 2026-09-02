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

test('GET /api/load accepts messy word-code input (uppercase, spaces) and restores', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'tiger-bamboo-river-umbrella', state: { layout: 'L' } });
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/load?code=Tiger Bamboo River Umbrella', null, 'GET');
  assert.equal(status, 200);
  assert.equal(data.state.layout, 'L');
});

test('legacy NOVA-XXXXXX codes still load (backward compatible)', async () => {
  const kv = fakeKV();
  await fetchWith({ SAVES: kv }, '/api/save', { code: 'NOVA-K7M2P3', state: { layout: 'legacy' } });
  const { status, data } = await fetchWith({ SAVES: kv }, '/api/load?code=k7m2p3', null, 'GET');
  assert.equal(status, 200);
  assert.equal(data.state.layout, 'legacy');
});

test('GET /api/load: bad code → 400, unknown code → 404', async () => {
  const kv = fakeKV();
  const bad = await fetchWith({ SAVES: kv }, '/api/load?code=NOPE', null, 'GET');
  assert.equal(bad.status, 400);
  const missing = await fetchWith({ SAVES: kv }, '/api/load?code=NOVA-XXXXXX', null, 'GET');
  assert.equal(missing.status, 404);
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
