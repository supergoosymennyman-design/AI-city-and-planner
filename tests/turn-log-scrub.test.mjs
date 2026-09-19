// tests/turn-log-scrub.test.mjs — the gateway's "logs never carry a provider key" rule.
//
// Regression for Gemini audit pass 1 (finding F1): turn.js scrubbed only the request's BYOK key,
// leaving a DEPLOYMENT credential exposed if an upstream SDK error echoed it (some do, in the
// message or the url). secretValues() now collects every configured secret and scrubSecrets()
// replaces them all before anything is logged.
//
// Run: node --test tests/turn-log-scrub.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretValues, scrubSecrets } from '../P5 Programme/buddy-kit/server/turn.js';

test('secretValues collects the BYOK key and every *_KEY / *_API_KEY / *_TOKEN / *_SECRET env value', () => {
  const env = {
    BUDDY_MODEL_KEY: 'sk-deploy-1234567890',
    OPENROUTER_API_KEY: 'sk-or-abcdefgh',
    SOME_TOKEN: 'tok-12345678',
    A_SECRET: 'secret-12345678',
    BUDDY_MODEL_URL: 'https://example.test/v1', // not a secret
    ZEN_BASE_URL: 'https://zen.test',           // not a secret
    SHORT_KEY: 'abc',                            // too short to scrub safely
  };
  const vals = secretValues(env, 'sk-child-0987654321');
  assert.ok(vals.includes('sk-child-0987654321'), 'byok key');
  assert.ok(vals.includes('sk-deploy-1234567890'), 'BUDDY_MODEL_KEY');
  assert.ok(vals.includes('sk-or-abcdefgh'), 'OPENROUTER_API_KEY');
  assert.ok(vals.includes('tok-12345678'), 'SOME_TOKEN');
  assert.ok(vals.includes('secret-12345678'), 'A_SECRET');
  assert.ok(!vals.includes('https://example.test/v1'), 'URLs are not secrets');
  assert.ok(!vals.includes('abc'), 'short env values are ignored');
  // But an explicitly supplied BYOK key is scrubbed regardless of length (pass-2 F4).
  assert.ok(secretValues({}, 'abc').includes('abc'), 'a short BYOK key is still scrubbed');
});

test('scrubSecrets replaces every secret with [key] and caps the result', () => {
  const secrets = secretValues({ BUDDY_MODEL_KEY: 'sk-deploy-1234567890' }, 'sk-child-0987654321');
  const out = scrubSecrets('Invalid token sk-deploy-1234567890 (key sk-child-0987654321)', secrets);
  assert.ok(!out.includes('sk-deploy-1234567890'), 'deployment key must be scrubbed');
  assert.ok(!out.includes('sk-child-0987654321'), 'byok key must be scrubbed');
  assert.ok(out.includes('[key]'));
  assert.ok(out.length <= 200);
});

test('scrubSecrets is total: caps long text, tolerates no secrets and undefined input', () => {
  assert.equal(scrubSecrets('x'.repeat(500), [], 200).length, 200);
  assert.equal(scrubSecrets('x'.repeat(500), [], 300).length, 300);
  assert.equal(scrubSecrets(undefined, []), '');
});
