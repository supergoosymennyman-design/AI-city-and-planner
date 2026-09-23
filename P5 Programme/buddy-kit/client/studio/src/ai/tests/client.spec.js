/**
 * client.spec.js — pure-node coverage for the OpenAI-compatible client (`src/ai/client.js`).
 *
 * Discovered by `run-tests.mjs`'s `src/ai/tests/*.spec.js` block, which calls
 * `mod.default(check)` SYNCHRONOUSLY and then immediately `process.exit()`s. Because the
 * client is async, all checks are executed at MODULE TOP LEVEL (a top-level `await`, which
 * the runner's `await import(...)` waits for) and are recorded as `[name, cond]` pairs;
 * the default export then just replays those pairs synchronously. This keeps the runner
 * untouched while still testing real promises.
 *
 * Every request uses a STUB `fetchImpl` — there is ZERO real network access, and no
 * mocking library is needed. Error assertions check the exact `err.kind` values.
 */

import {
  AIError,
  listModels,
  chatCompletion,
  makeTimeout,
  describeHTTPError,
} from '../client.js';

const BASE = 'https://x.example/v1';
const KEY = 'sk-test-key';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Spread into a client call: base url, key, and a short timeout (tests override as needed). */
const cfg = (extra) => ({ baseUrl: BASE, key: KEY, timeoutMs: 1000, ...extra });

/** Await `fn`, returning the thrown error (or null) — avoids `assert.rejects` and its lib. */
async function catchErr(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

/** A 2xx stub fetch returning `value` from `res.json()`. */
const okJSON = (value, status = 200) => async () => ({
  ok: true,
  status,
  json: async () => value,
});

/** A non-2xx stub fetch returning `value` from `res.json()`. */
const statusJSON = (status, value) => async () => ({
  ok: false,
  status,
  json: async () => value,
});

/** Collected `[name, cond]` results, replayed by the default export. */
const results = [];
const record = (name, cond) => {
  results.push([name, !!cond]);
};

async function run() {
  // ---------------------------------------------------------------------------
  // listModels
  // ---------------------------------------------------------------------------
  {
    const ids = await listModels(
      cfg({
        fetchImpl: okJSON({
          object: 'list',
          data: [{ id: 'zeta' }, { id: 'alpha' }, { id: 'alpha' }, { id: 'beta' }],
        }),
      }),
    );
    record(
      'client: listModels de-duplicates and sorts ids with localeCompare',
      Array.isArray(ids) && ids.length === 3 && ids.join(',') === 'alpha,beta,zeta',
    );
  }

  {
    const ids = await listModels(cfg({ fetchImpl: okJSON([{ id: 'b' }, { id: 'a' }]) }));
    record(
      'client: listModels tolerates a bare array body',
      ids.length === 2 && ids.join(',') === 'a,b',
    );
  }

  {
    let seen = null;
    const f = async (url, opts) => {
      seen = { url, opts };
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'm1' }] }) };
    };
    const ids = await listModels(cfg({ fetchImpl: f }));
    record(
      'client: listModels GETs {baseUrl}/models with a Bearer header and an abort signal',
      !!seen &&
        seen.url === 'https://x.example/v1/models' &&
        seen.opts.method === 'GET' &&
        seen.opts.headers.Authorization === 'Bearer sk-test-key' &&
        !!seen.opts.signal &&
        typeof seen.opts.signal.aborted === 'boolean' &&
        ids[0] === 'm1',
    );
  }

  {
    const err = await catchErr(() =>
      listModels(cfg({ fetchImpl: statusJSON(401, { error: { message: 'bad key' } }) })),
    );
    record(
      'client: listModels 401 throws AIError kind auth with the exact friendly message',
      err instanceof AIError &&
        err.kind === 'auth' &&
        err.status === 401 &&
        err.message === 'Your API key was rejected. Check it in AI settings.',
    );
  }

  {
    const long = 'z'.repeat(400);
    const err = await catchErr(() =>
      listModels(cfg({ fetchImpl: statusJSON(400, { message: long }) })),
    );
    record(
      'client: listModels HTTP error detail is truncated and includes the status',
      err instanceof AIError &&
        err.kind === 'shape' &&
        err.status === 400 &&
        typeof err.detail === 'string' &&
        err.detail.length <= 201 &&
        err.detail.length < long.length &&
        err.message.startsWith('Request failed (HTTP 400).'),
    );
  }

  {
    const err = await catchErr(() =>
      listModels(cfg({ fetchImpl: okJSON({ nope: true }) })),
    );
    record(
      'client: listModels 200 without a data array throws AIError kind shape',
      err instanceof AIError && err.kind === 'shape',
    );
  }

  {
    const f = async () => ({ ok: true, status: 200, text: async () => 'not json' });
    const err = await catchErr(() => listModels(cfg({ fetchImpl: f })));
    record(
      'client: listModels 200 with unparseable text throws AIError kind shape',
      err instanceof AIError && err.kind === 'shape',
    );
  }

  // ---------------------------------------------------------------------------
  // chatCompletion — happy path + payload shape
  // ---------------------------------------------------------------------------
  {
    let cap = null;
    const f = async (url, opts) => {
      cap = { url, method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'hello' } }],
          model: 'alpha',
          usage: { total_tokens: 3 },
        }),
      };
    };
    const out = await chatCompletion(
      cfg({
        fetchImpl: f,
        model: 'alpha',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.5,
      }),
    );
    record(
      'client: chatCompletion returns content/model/usage from choices[0]',
      out.content === 'hello' && out.model === 'alpha' && !!out.usage && out.usage.total_tokens === 3,
    );
    record(
      'client: chatCompletion POSTs to /chat/completions with stream:false and the payload',
      !!cap &&
        cap.url === 'https://x.example/v1/chat/completions' &&
        cap.method === 'POST' &&
        cap.headers['Content-Type'] === 'application/json' &&
        cap.headers.Authorization === 'Bearer sk-test-key' &&
        cap.body.stream === false &&
        cap.body.model === 'alpha' &&
        cap.body.temperature === 0.5 &&
        Array.isArray(cap.body.messages) &&
        cap.body.messages.length === 1 &&
        cap.body.messages[0].content === 'hi',
    );
  }

  {
    let body = null;
    const f = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'x' } }] }) };
    };
    await chatCompletion(cfg({ fetchImpl: f, model: 'm', messages: [] }));
    record(
      'client: chatCompletion defaults temperature to 0.4 and always sends stream:false',
      !!body && body.temperature === 0.4 && body.stream === false,
    );
  }

  // ---------------------------------------------------------------------------
  // chatCompletion — malformed 2xx replies (never return undefined content)
  // ---------------------------------------------------------------------------
  for (const [label, payload] of [
    ['missing', {}],
    ['empty', { choices: [] }],
    ['null', { choices: null }],
  ]) {
    const err = await catchErr(() =>
      chatCompletion(cfg({ fetchImpl: okJSON(payload), model: 'm', messages: [] })),
    );
    record(
      `client: chatCompletion rejects a 200 reply with ${label} choices as kind shape`,
      err instanceof AIError && err.kind === 'shape',
    );
  }

  {
    const err = await catchErr(() =>
      chatCompletion(cfg({ fetchImpl: okJSON({ choices: [{ message: {} }] }), model: 'm', messages: [] })),
    );
    record(
      'client: chatCompletion rejects a 200 reply with no message content (never undefined)',
      err instanceof AIError && err.kind === 'shape' && err.message.length > 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Exact HTTP status → kind mapping
  // ---------------------------------------------------------------------------
  for (const [status, kind] of [
    [401, 'auth'],
    [403, 'forbidden'],
    [404, 'model'],
    [429, 'rate'],
    [500, 'server'],
    [503, 'server'],
    [418, 'shape'],
  ]) {
    const err = await catchErr(() =>
      chatCompletion(cfg({ fetchImpl: statusJSON(status, { error: { message: 'nope' } }), model: 'm', messages: [] })),
    );
    record(
      `client: HTTP ${status} maps to kind ${kind}`,
      err instanceof AIError && err.kind === kind && err.status === status,
    );
  }

  // ---------------------------------------------------------------------------
  // describeHTTPError — exact strings
  // ---------------------------------------------------------------------------
  record(
    'client: describeHTTPError returns the exact child-friendly message per status',
    describeHTTPError(401) === 'Your API key was rejected. Check it in AI settings.' &&
      describeHTTPError(403) === 'This key is not allowed to use that model.' &&
      describeHTTPError(404) === 'Model not found. Pick another from the list.' &&
      describeHTTPError(429) === 'Too many requests — wait a moment and try again.' &&
      describeHTTPError(500) === 'The AI service had a problem. Try again.' &&
      describeHTTPError(503) === 'The AI service had a problem. Try again.' &&
      describeHTTPError(418) === 'Request failed (HTTP 418).',
  );
  record(
    'client: describeHTTPError appends a truncated body for an unmapped status',
    describeHTTPError(400, 'x'.repeat(500)).startsWith('Request failed (HTTP 400). ') &&
      describeHTTPError(400, 'x'.repeat(500)).length < 500,
  );

  // ---------------------------------------------------------------------------
  // AIError shape
  // ---------------------------------------------------------------------------
  {
    const e = new AIError('boom', { kind: 'auth', status: 401, detail: 'nope' });
    record(
      'client: AIError is an Error carrying kind/status/detail',
      e instanceof Error &&
        e instanceof AIError &&
        e.name === 'AIError' &&
        e.kind === 'auth' &&
        e.status === 401 &&
        e.detail === 'nope' &&
        e.message === 'boom',
    );
  }

  // ---------------------------------------------------------------------------
  // Transport failures — every one is an AIError
  // ---------------------------------------------------------------------------
  {
    const err = await catchErr(() =>
      listModels(
        cfg({
          fetchImpl: async () => {
            throw new TypeError('Failed to fetch');
          },
        }),
      ),
    );
    record(
      'client: a fetch rejection becomes AIError kind network (no bare TypeError)',
      err instanceof AIError &&
        err.kind === 'network' &&
        !(err instanceof TypeError) &&
        err.message === 'Could not reach the AI service. Check the connection and try again.',
    );
  }

  {
    const err = await catchErr(() =>
      chatCompletion(
        cfg({
          model: 'm',
          messages: [],
          fetchImpl: () => {
            throw new Error('kaboom');
          },
        }),
      ),
    );
    record(
      'client: a synchronous fetch throw is wrapped as AIError kind network',
      err instanceof AIError && err.kind === 'network',
    );
  }

  {
    const err = await catchErr(() =>
      listModels(
        cfg({
          fetchImpl: async () => {
            throw new Error('Failed to fetch');
          },
        }),
      ),
    );
    record(
      'client: an error detail never embeds the API key',
      err instanceof AIError && !String(err.detail || '').includes(KEY),
    );
  }

  // ---------------------------------------------------------------------------
  // Timeout genuinely fires on a never-resolving fetch
  // ---------------------------------------------------------------------------
  {
    const never = () => new Promise(() => {});
    const started = Date.now();
    const err = await catchErr(() =>
      listModels(cfg({ fetchImpl: never, timeoutMs: 20 })),
    );
    const elapsed = Date.now() - started;
    record(
      'client: a never-resolving fetch times out as kind timeout within ~200ms',
      err instanceof AIError && err.kind === 'timeout' && elapsed < 200,
    );
  }

  // ---------------------------------------------------------------------------
  // Caller abort — distinct from timeout
  // ---------------------------------------------------------------------------
  {
    const controller = new AbortController();
    const pending = catchErr(() =>
      chatCompletion(
        cfg({
          model: 'm',
          messages: [],
          signal: controller.signal,
          timeoutMs: 5000,
          fetchImpl: () => new Promise(() => {}),
        }),
      ),
    );
    setTimeout(() => controller.abort(), 10);
    const err = await pending;
    record(
      'client: a caller abort maps to kind aborted (not timeout)',
      err instanceof AIError && err.kind === 'aborted' && err.status === undefined,
    );
  }

  {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const err = await catchErr(() =>
      listModels(
        cfg({
          signal: controller.signal,
          fetchImpl: () => {
            called = true;
            return new Promise(() => {});
          },
        }),
      ),
    );
    record(
      'client: an already-aborted signal rejects immediately as aborted',
      err instanceof AIError && err.kind === 'aborted' && called === false,
    );
  }

  // ---------------------------------------------------------------------------
  // makeTimeout
  // ---------------------------------------------------------------------------
  {
    const t = makeTimeout(20);
    record(
      'client: makeTimeout exposes a signal and cancel',
      !!t.signal && typeof t.signal.aborted === 'boolean' && typeof t.cancel === 'function' && t.didTimeout() === false,
    );
    await sleep(60);
    record(
      'client: makeTimeout aborts after the delay and reports didTimeout',
      t.signal.aborted === true && t.didTimeout() === true,
    );
    t.cancel();
  }

  {
    const t = makeTimeout(20);
    t.cancel();
    await sleep(40);
    record(
      'client: makeTimeout cancel clears the pending timer',
      t.signal.aborted === true && t.didTimeout() === false,
    );
  }

  {
    const external = new AbortController();
    const t = makeTimeout(5000, external.signal);
    external.abort();
    record(
      'client: makeTimeout composes a caller-supplied signal',
      t.signal.aborted === true && t.didTimeout() === false,
    );
    t.cancel();
  }
}

try {
  await run();
} catch (err) {
  record('client: test module ran without an unexpected throw', false);
  console.error('client.spec.js unexpected error:', err);
}

/**
 * Replay the recorded async results through the runner's synchronous `check`.
 * @param {(name: string, cond: boolean) => void} check the runner's PASS/FAIL counter
 */
export default function clientTests(check) {
  for (const [name, cond] of results) check(name, cond);
}
