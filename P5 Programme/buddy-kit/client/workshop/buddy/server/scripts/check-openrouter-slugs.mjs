#!/usr/bin/env node
/**
 * check-openrouter-slugs.mjs — verify every CONCRETE OpenRouter slug in the model registry still
 * exists on OpenRouter's live model list.
 *
 * WHY this exists: model slugs rot. `model-registry.js`'s own header records the curated free list
 * losing an id in a single day. A rotted slug is worse than a missing one — it sits in the kid-facing
 * picker looking fine and only fails when a child taps it mid-lesson.
 *
 * WHY it needs no API key (the point of the whole script): OpenRouter's `GET /api/v1/models` is a
 * public, edge-cached listing — unlike `verify-models.mjs`, which spends a real completion and
 * therefore needs a key. So this runs on a fresh checkout, in CI, or on a teacher's laptop with no
 * credentials at all. It checks EXISTENCE only; `verify-models.mjs` is still the tool that proves a
 * model actually answers with your key.
 *
 * Router and alias ids are SKIPPED, not because checking them is hard but because they cannot rot:
 * `openrouter/free` resolves to whatever free model is up, and `~author/model-latest` resolves to a
 * family's newest version. That is exactly why the registry prefers them (see `isStableModelId`).
 *
 * Usage:  node server/scripts/check-openrouter-slugs.mjs          (from `web/coding agent/`)
 * Exit 0 = every concrete slug present · 1 = at least one rotted · 2 = could not reach the list.
 */
import { KEYED_MODELS, isStableModelId, findProvider } from '../model-registry.js';

const LIST_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_HOST = 'openrouter.ai';

/** Registry entries served by OpenRouter — the only ones this list can speak to. Matched by the
 *  PROVIDER's host rather than a hardcoded provider id, so a self-hosted OpenRouter proxy (a
 *  `OPENROUTER_BASE_URL` override to another host) is correctly skipped instead of checked against
 *  the public list. Models on other providers are out of scope here (verify-models.mjs covers them). */
const openRouterEntries = KEYED_MODELS.filter((m) => {
  const provider = findProvider(m.provider);
  try { return new URL(provider?.baseURL ?? '').host === OPENROUTER_HOST; } catch { return false; }
});

const concrete = openRouterEntries.filter((m) => !isStableModelId(m.id));
const skipped = openRouterEntries.filter((m) => isStableModelId(m.id));

for (const m of skipped) console.log(`SKIP  ${m.id}  (router/alias — cannot rot)`);

if (concrete.length === 0) {
  console.log('\nOK — no concrete slugs to check (every OpenRouter entry is a router or alias).');
  process.exit(0);
}

let live;
try {
  const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  live = await res.json();
} catch (err) {
  // Exit 2, distinct from a real rot: "we could not check" must never read as "everything is fine",
  // and must not fail a build the same way a genuinely-missing model does.
  console.error(`\nCOULD NOT CHECK — ${LIST_URL} unreachable (${err.message}).`);
  console.error('This is NOT a pass: the slugs are unverified. Re-run when you have network.');
  process.exit(2);
}

const ids = new Set((live.data ?? []).map((m) => m.id));
if (ids.size === 0) {
  console.error('\nCOULD NOT CHECK — the list returned no models (unexpected response shape).');
  process.exit(2);
}

const missing = [];
for (const m of concrete) {
  if (ids.has(m.id)) console.log(`OK    ${m.id}  ("${m.label}")`);
  else { console.log(`ROTTED ${m.id}  ("${m.label}") — not on OpenRouter's list`); missing.push(m); }
}

console.log(`\nchecked ${concrete.length} concrete slug(s) against ${ids.size} live models`);
if (missing.length) {
  console.error(`\nFAIL — ${missing.length} rotted slug(s): ${missing.map((m) => m.id).join(', ')}`);
  console.error('Fix in server/model-registry.js: prefer a `~author/model-latest` alias (cannot rot),');
  console.error('or replace with a current slug from https://openrouter.ai/models.');
  process.exit(1);
}
console.log('PASS — every concrete slug is live.');
