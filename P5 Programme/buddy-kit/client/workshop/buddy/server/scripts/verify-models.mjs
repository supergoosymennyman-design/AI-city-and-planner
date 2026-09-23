#!/usr/bin/env node
// Re-verifies every curated model answers on the configured endpoint — using the SAME call shape
// the app actually makes: a STREAMING chat completion. WHY streaming: the first version of this
// script tested non-streaming completions and passed a model whose STREAMING path then failed live
// in the buddy ("Streaming response failed" → blank reply) — verify what you ship, not a proxy.
// The free tier is also flaky per-request (a model can fail once and pass seconds later), so each
// model gets one retry before it counts as FAIL.
//
// `verifyEntry` is exported so the admin route (server/gateway.js) can re-verify ONE custom entry
// on its OWN baseURL/keyEnv the moment an admin adds it — same streaming-with-retry check, just
// against that entry's endpoint instead of the curated default. Importing this module must NOT
// run the CLI loop (see the `invokedAsMain` guard at the bottom) — only executing it directly does.
//
// Usage: node scripts/verify-models.mjs   (exit 1 if any curated model fails both attempts)
import { pathToFileURL } from 'node:url';
import { MODELS } from '../model-registry.js';
import { DEFAULT_BASE_URL } from '../provider.js';

/**
 * Resolves the endpoint + key an entry should be verified against. Pure (no network, no I/O) so
 * it's cheap to unit-test — the actual streaming call in `attempt`/`verifyEntry` is not.
 * Priority: the entry's OWN `baseURL`/`keyEnv` (custom/school-configured models carry these) beat
 * the process-wide `BUDDY_MODEL_URL` override (curated entries, which have no `baseURL`, still
 * respect a teacher pointing the whole CLI at a different endpoint — unchanged from before this
 * refactor), which beats the hardcoded `DEFAULT_BASE_URL`. The key follows the same shape: the
 * entry's own `keyEnv` lookup beats the shared `BUDDY_MODEL_KEY` fallback.
 * @param {{baseURL?:string, keyEnv?:string}} entry
 * @param {Record<string,string|undefined>} env
 * @returns {{baseURL:string, apiKey:string|undefined}}
 */
export function resolveEndpoint(entry, env) {
  const baseURL = entry.baseURL ?? env.BUDDY_MODEL_URL ?? DEFAULT_BASE_URL;
  const apiKey = (entry.keyEnv ? env[entry.keyEnv] : undefined) ?? env.BUDDY_MODEL_KEY;
  return { baseURL, apiKey };
}

/** One streaming attempt: PASS iff the response is OK and at least one data: chunk arrives. */
async function attempt(modelId, baseURL, apiKey) {
  const r = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 20, stream: true }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok || !r.body) return { ok: false, detail: `HTTP ${r.status}` };
  const reader = r.body.getReader();
  const td = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += td.decode(value, { stream: true });
    if (text.length > 4096) { reader.cancel(); break; } // enough evidence either way
  }
  // A mid-stream provider failure arrives as a JSON error object (seen live) — a run of
  // `data: {...chat.completion.chunk...}` lines is what a healthy stream looks like.
  if (/"type"\s*:\s*"error"/.test(text)) return { ok: false, detail: text.slice(0, 120) };
  if (!text.includes('data:')) return { ok: false, detail: text.slice(0, 120) || 'empty stream' };
  return { ok: true };
}

/**
 * Verifies ONE registry entry against its own endpoint (streaming chat completion + one retry on
 * the free tier's flakiness). NETWORK call — not covered by the node:test suite; the CLI run below
 * (and the admin route in Task 4) is the live check.
 * @param {{id:string, baseURL?:string, keyEnv?:string}} entry
 * @param {Record<string,string|undefined>} env - typically `process.env`.
 * @returns {Promise<{ok:boolean, detail?:string, ms:number, retried:boolean}>}
 */
export async function verifyEntry(entry, env) {
  const { baseURL, apiKey } = resolveEndpoint(entry, env);
  const t0 = performance.now();
  let res;
  let retried = false;
  try {
    res = await attempt(entry.id, baseURL, apiKey);
    if (!res.ok) { retried = true; res = await attempt(entry.id, baseURL, apiKey); } // flaky tier: one retry
  } catch (e) {
    try { retried = true; res = await attempt(entry.id, baseURL, apiKey); } catch (e2) { res = { ok: false, detail: e2.message }; }
  }
  const ms = Math.round(performance.now() - t0);
  return { ok: res.ok, detail: res.detail, ms, retried };
}

async function main() {
  let failed = 0;
  for (const m of MODELS) {
    const res = await verifyEntry(m, process.env);
    console.log(`${res.ok ? 'PASS' : 'FAIL'} ${m.id} [${res.ms}ms${res.retried ? ', retried' : ''}]${res.ok ? '' : ` — ${res.detail}`}`);
    if (!res.ok) failed += 1;
  }
  process.exitCode = failed ? 1 : 0;
}

// Only run the CLI loop when this file is executed directly (`node scripts/verify-models.mjs`) —
// NOT when imported (Task 4's admin route imports `verifyEntry` and must not trigger a full,
// slow, live re-check of every curated model as an import side-effect).
const invokedAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsMain) await main();
