import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBuddyTurn } from '../P5 Programme/scripts/demo-preflight.mjs';

const secret = 'test-secret-never-print';
const env = { DEEPSEEK_API_KEY:secret };
const frame = value => new Response(JSON.stringify(value) + '\n', { headers:{ 'content-type':'application/x-ndjson' } });

test('presenter check requires a live terminal reply and uses one fixed turn', async () => {
  let calls = 0;
  const result = await checkBuddyTurn({ async fetch(request) {
    calls++;
    const body = await request.json();
    assert.equal(body.model, 'deepseek-v4-flash');
    assert.equal(body.message, 'In one short sentence, say hello to a student exploring an AI City.');
    assert.equal(JSON.stringify(body).includes(secret), false);
    return frame({ type:'done', source:'live', spent:18, reply:'Hello, City explorer!' });
  } }, env);
  assert.equal(calls, 1);
  assert.equal(result.ready, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('missing key prevents a provider call', async () => {
  const result = await checkBuddyTurn({ fetch() { throw new Error('should not call'); } }, {});
  assert.equal(result.reason, 'missing-key');
});

test('provider failures and echoed secrets stay unavailable and hidden', async () => {
  const output = [];
  const original = console.error;
  console.error = (...parts) => output.push(parts.join(' '));
  try {
    for (const worker of [
      { fetch:async () => frame({ type:'done', source:'error', reply:`bad ${secret}` }) },
      { fetch:async () => frame({ type:'done', source:'live', spent:0, reply:`partial ${secret}` }) },
      { fetch:async () => { throw new Error(`bad ${secret}`); } },
    ]) {
      const result = await checkBuddyTurn(worker, env);
      assert.equal(result.ready, false);
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
    assert.equal(output.join(' ').includes(secret), false);
  } finally { console.error = original; }
});
