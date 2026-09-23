/**
 * client.js — the studio's OpenAI-compatible HTTP client.
 *
 * The AI panel talks to any OpenAI-compatible endpoint the user enters (no default): it lists the available models and asks for a single
 * NON-streaming chat completion. Two properties matter for a children's app:
 *
 *   1. Every failure is a typed {@link AIError} — never a bare `TypeError` — so the UI can
 *      branch on `err.kind` without string-matching and show a friendly message.
 *   2. `fetch` is INJECTABLE (`fetchImpl`), so the Node test suite exercises the full
 *      request/response/error surface with zero network access and no mocking library.
 *
 * No third-party HTTP dependency is used — native `fetch` only. The API key is only ever
 * placed in the `Authorization` header; it is never logged, persisted, or embedded in an
 * error message/detail. Response bodies are redacted against credential-shaped text (and
 * the request's own key) before any of them can reach a user-visible string, and are
 * size-bounded before parsing so an oversized reply cannot stall the tab.
 */

import { MAX_RESPONSE_CHARS } from './limits.js';

/** Milliseconds before a request is considered timed out when the caller omits `timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 60000;

/** Sampling temperature used when the caller omits `temperature` (mirrors `AI_DEFAULTS.temperature`). */
const DEFAULT_TEMPERATURE = 0.4;

/** Longest slice of a response body kept in an error's `detail` / default message. */
const MAX_DETAIL = 200;

/**
 * A typed client failure.
 *
 * `kind` is a stable enum the UI branches on; `status` is the HTTP status when the failure
 * came from a response (else `undefined`); `detail` is a short, NON-SECRET diagnostic (a
 * truncated response body, or the underlying error message).
 *
 * @augments Error
 */
export class AIError extends Error {
  /**
   * @param {string} message human-readable, already child-friendly for HTTP statuses
   * @param {{kind?: string, status?: number, detail?: string}} [info] failure taxonomy
   */
  constructor(message, info = {}) {
    super(message);
    this.name = 'AIError';
    /**
     * Failure category the UI can switch on without parsing `message`.
     * @type {'auth'|'forbidden'|'model'|'rate'|'server'|'network'|'timeout'|'aborted'|'shape'}
     */
    this.kind = info.kind || 'shape';
    /** @type {number|undefined} HTTP status code, when a response was received. */
    this.status = info.status;
    /** @type {string|undefined} short, non-secret diagnostic string. */
    this.detail = info.detail;
  }
}

/**
 * Trim and shorten an arbitrary value for use inside an error message or `detail`.
 * Guards against unbounded response bodies bloating a user-facing error.
 * @param {unknown} value value to shorten (non-strings are JSON-stringified)
 * @param {number} [max] maximum characters kept (defaults to {@link MAX_DETAIL})
 * @returns {string} a trimmed, length-bounded string (may be empty)
 */
function truncate(value, max = MAX_DETAIL) {
  let text;
  if (typeof value === 'string') {
    text = value;
  } else if (value == null) {
    return '';
  } else {
    try {
      text = JSON.stringify(value);
    } catch (err) {
      text = String(value);
    }
  }
  const clean = String(text).trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
}

/**
 * Credential-shaped substrings scrubbed from any text that could be shown.
 *
 * The endpoint is untrusted: an unmapped-status body can echo the request's own
 * `Authorization` header back at us. `describeHTTPError` used to append that body
 * to the user-visible message, which put the API key in the chat DOM. These
 * patterns (plus the caller's literal key) are replaced with `[redacted]` first.
 * Deliberately narrow — a false positive only redacts a token-looking string.
 *
 * @type {RegExp[]}
 */
const CREDENTIAL_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{4,}/g,
  /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g,
  /\b(?:api[_-]?key|apikey|access[_-]?token|secret)["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi,
];

/**
 * Replace anything credential-shaped (and the caller's own key, when known) in
 * arbitrary text with `[redacted]`.
 *
 * What: stringifies non-strings, removes every exact occurrence of `secret`, then
 * applies {@link CREDENTIAL_PATTERNS}. Why: the client's documented guarantee is
 * that the key is never embedded in an error message/detail; a hostile endpoint
 * that echoes the header must not break that guarantee. Never throws.
 *
 * @param {unknown} value text (or a JSON-stringifiable value) to scrub.
 * @param {string} [secret] the request's API key, scrubbed verbatim when provided.
 * @returns {string} the scrubbed text (empty for null/undefined).
 */
export function redactSecrets(value, secret) {
  if (value == null) return '';
  let text;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch (err) {
      text = String(value);
    }
    if (typeof text !== 'string') text = String(text);
  }
  if (typeof secret === 'string' && secret.length >= 4) {
    text = text.split(secret).join('[redacted]');
  }
  for (const re of CREDENTIAL_PATTERNS) text = text.replace(re, '[redacted]');
  return text;
}

/** @param {string} baseUrl @param {string} path @returns {string} `{baseUrl}/{path}` with trailing slashes removed. */
function joinUrl(baseUrl, path) {
  const base = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  return `${base}/${path}`;
}

/** @param {unknown} err @returns {boolean} whether a rejection/throw was an abort. */
function isAbortError(err) {
  const name = err && err.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Build an `AbortError`-shaped Error for a timed-out or caller-aborted request. */
function abortReason(timedOut) {
  const err = new Error(timedOut ? 'Request timed out' : 'Request aborted');
  err.name = timedOut ? 'TimeoutError' : 'AbortError';
  return err;
}

/**
 * Create an abort signal that fires after `ms` milliseconds and is composed with an
 * optional caller-supplied signal.
 *
 * Why: `fetch` alone can hang forever on a stalled connection, which would dead-end the
 * chat UI. The returned `cancel` MUST be called once the request settles, otherwise the
 * pending timer would keep a Node process alive for the full timeout.
 *
 * The request layer races the fetch against this signal, so the timeout still fires even
 * when a (test) fetch implementation ignores the signal entirely.
 *
 * @param {number} [ms] milliseconds before abort (defaults to 60000; a non-positive or
 *   non-finite value disables the timer and only composes `externalSignal`)
 * @param {AbortSignal} [externalSignal] caller signal (e.g. a Stop button) to mirror
 * @returns {{signal: AbortSignal, cancel: () => void, didTimeout: () => boolean}}
 *   `signal` for the request; `cancel()` clears the timer and aborts; `didTimeout()`
 *   reports whether the timeout (rather than the caller) triggered the abort.
 */
export function makeTimeout(ms = DEFAULT_TIMEOUT_MS, externalSignal = undefined) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;

  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      timer = null;
      controller.abort();
    }, ms);
  }

  let onExternalAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (onExternalAbort && externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
      onExternalAbort = null;
    }
    controller.abort();
  };

  return { signal: controller.signal, cancel, didTimeout: () => timedOut };
}

/**
 * Settle as soon as EITHER `promise` settles OR the timeout signal aborts.
 *
 * This is what makes a hung/signal-ignoring fetch time out instead of hanging forever.
 * The abort listener is always removed so no listener leaks between requests.
 *
 * @template T
 * @param {Promise<T>} promise the fetch/body-read promise to guard
 * @param {{signal: AbortSignal, didTimeout: () => boolean}} timeout from {@link makeTimeout}
 * @returns {Promise<T>}
 */
function raceAbort(promise, timeout) {
  const { signal } = timeout;
  if (signal.aborted) return Promise.reject(abortReason(timeout.didTimeout()));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(abortReason(timeout.didTimeout()));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Invoke an injected `fetch` without letting a synchronous throw escape as a non-promise.
 * @param {Function} fetchImpl the fetch implementation
 * @param {string} url request URL
 * @param {object} init fetch init (signal is added by the caller)
 * @returns {Promise<object>} the fetch promise
 */
function callFetch(fetchImpl, url, init) {
  return new Promise((resolve, reject) => {
    let result;
    try {
      result = fetchImpl(url, init);
    } catch (err) {
      reject(err);
      return;
    }
    Promise.resolve(result).then(resolve, reject);
  });
}

/**
 * Read a `content-length` header as a number, when the response exposes one.
 * @param {object} res a fetch `Response`-like object
 * @returns {number|null} the declared length, or null when absent/unreadable.
 */
function declaredLength(res) {
  const headers = res && res.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  const raw = headers.get('content-length');
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Read a response body tolerantly AND within a size bound.
 *
 * What: rejects a body larger than `maxChars` BEFORE `JSON.parse`/fence-scanning/render
 * (the expensive, main-thread-blocking work). The `content-length` header is checked
 * first so an honest oversized body is never even read; otherwise `text()` is read and
 * length-checked, and only then parsed by the caller. `json()` (test stubs / a stub
 * without `text()`) is the fallback and cannot be pre-bounded, but every real
 * `Response` exposes `text()`. Never throws.
 *
 * @param {object} res a fetch `Response`-like object
 * @param {number} [maxChars] maximum accepted characters (defaults to
 *   {@link MAX_RESPONSE_CHARS}; a non-finite/≤0 value falls back to the default)
 * @returns {Promise<{value: unknown, text: string, tooLarge?: boolean, size?: number}>}
 *   parsed value (json fallback) or raw text, plus an oversize marker.
 */
async function readBody(res, maxChars = MAX_RESPONSE_CHARS) {
  const limit =
    Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_RESPONSE_CHARS;

  const declared = declaredLength(res);
  if (declared !== null && declared > limit) {
    return { value: undefined, text: '', tooLarge: true, size: declared };
  }

  if (res && typeof res.text === 'function') {
    try {
      const text = await res.text();
      const raw = typeof text === 'string' ? text : '';
      if (raw.length > limit) {
        return { value: undefined, text: '', tooLarge: true, size: raw.length };
      }
      return { value: undefined, text: raw };
    } catch (err) {
      /* fall through to json() */
    }
  }

  if (res && typeof res.json === 'function') {
    try {
      const value = await res.json();
      return { value, text: truncate(value, limit) };
    } catch (err) {
      /* fall through to the empty body below */
    }
  }
  return { value: undefined, text: '' };
}

/**
 * Build the {@link AIError} thrown when a reply body exceeds {@link MAX_RESPONSE_CHARS}.
 * @param {{size?: number}} body the oversized read body.
 * @param {number} [status] the HTTP status (2xx for an oversized success body).
 * @returns {AIError}
 */
function tooLargeError(body, status) {
  const size = body && Number.isFinite(body.size) ? body.size : null;
  return new AIError('The AI reply was too large to read safely. Ask for a smaller result.', {
    kind: 'shape',
    status,
    detail: size === null ? 'reply exceeded the size limit' : `reply was ${size} chars`,
  });
}

/**
 * Turn whatever a fetch/body read threw into an {@link AIError}, so a bare `TypeError`,
 * `DOMException`, or arbitrary throw can never escape the client.
 * @param {unknown} err the caught error
 * @param {{signal: AbortSignal, didTimeout: () => boolean}} timeout request timeout state
 * @returns {AIError}
 */
function toAIError(err, timeout) {
  if (err instanceof AIError) return err;
  const timedOut = timeout ? timeout.didTimeout() : false;
  if (timedOut || (err && err.name === 'TimeoutError')) {
    return new AIError('The AI service took too long to answer. Try again.', {
      kind: 'timeout',
      detail: truncate(err && err.message),
    });
  }
  if ((timeout && timeout.signal.aborted) || isAbortError(err)) {
    return new AIError('The request was stopped.', {
      kind: 'aborted',
      detail: truncate(err && err.message),
    });
  }
  return new AIError('Could not reach the AI service. Check the connection and try again.', {
    kind: 'network',
    detail: truncate(err && err.message),
  });
}

/**
 * Map an HTTP status to its {@link AIError} `kind`.
 *
 * Known statuses are exact (`401→auth`, `403→forbidden`, `404→model`, `429→rate`,
 * `5xx→server`); any other non-2xx response is `shape` (an unexpected/unusable reply)
 * because the enum deliberately has no generic "http" bucket.
 * @param {number} status HTTP status code
 * @returns {'auth'|'forbidden'|'model'|'rate'|'server'|'shape'}
 */
function kindForStatus(status) {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'model';
  if (status === 429) return 'rate';
  if (typeof status === 'number' && status >= 500 && status < 600) return 'server';
  return 'shape';
}

/**
 * Build the user-facing message for an HTTP failure.
 *
 * What: a short, child-friendly, actionable sentence; the known statuses are exact.
 * Why: the panel shows this directly, and children should be told what to DO
 * ("Check it in AI settings.") rather than shown a raw status.
 * `body` enriches only the un-mapped fallback message (and is always truncated).
 * The body is REDACTED first, so an endpoint echoing the `Authorization` header
 * can never put the key into a user-visible message.
 *
 * @param {number} status HTTP status code
 * @param {unknown} [body] response body (used only for the `Request failed (HTTP n).` fallback)
 * @param {string} [secret] the request's API key, scrubbed from the body snippet.
 * @returns {string} the message to show the user
 */
export function describeHTTPError(status, body, secret) {
  if (status === 401) return 'Your API key was rejected. Check it in AI settings.';
  if (status === 403) return 'This key is not allowed to use that model.';
  if (status === 404) return 'Model not found. Pick another from the list.';
  if (status === 429) return 'Too many requests — wait a moment and try again.';
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return 'The AI service had a problem. Try again.';
  }
  const base = `Request failed (HTTP ${status}).`;
  const snippet = truncate(redactSecrets(body, secret));
  return snippet ? `${base} ${snippet}` : base;
}

/**
 * Build an {@link AIError} for a non-2xx response, carrying the status and a truncated,
 * credential-redacted body as `detail`.
 * @param {number} status HTTP status code
 * @param {{text?: string}} body read body (from {@link readBody})
 * @param {string} [secret] the request's API key, scrubbed from the body.
 * @returns {AIError}
 */
function httpError(status, body, secret) {
  const raw = body && typeof body.text === 'string' ? body.text : '';
  const detail = truncate(redactSecrets(raw, secret));
  return new AIError(describeHTTPError(status, raw, secret), {
    kind: kindForStatus(status),
    status,
    detail,
  });
}

/**
 * Run one request end-to-end under a timeout, returning the response and its body.
 *
 * Owns the whole lifecycle so the timeout covers BOTH the network round-trip and the
 * body read, and so the timer is always cleared in `finally`. On any failure it throws an
 * {@link AIError}.
 *
 * @param {{url: string, init: object, fetchImpl: Function, signal?: AbortSignal, timeoutMs?: number}} args
 * @returns {Promise<{res: object, body: {value: unknown, text: string}}>}
 */
async function performRequest({ url, init, fetchImpl, signal, timeoutMs }) {
  if (typeof fetchImpl !== 'function') {
    throw new AIError('Could not reach the AI service. Check the connection and try again.', {
      kind: 'network',
      detail: 'no fetch implementation',
    });
  }
  const timeout = makeTimeout(timeoutMs, signal);
  try {
    if (timeout.signal.aborted) throw abortReason(timeout.didTimeout());
    const res = await raceAbort(callFetch(fetchImpl, url, { ...init, signal: timeout.signal }), timeout);
    if (!res || typeof res !== 'object') {
      throw new AIError('The AI service sent an unexpected reply. Try again.', { kind: 'shape' });
    }
    const body = await raceAbort(readBody(res), timeout);
    return { res, body };
  } catch (err) {
    throw toAIError(err, timeout);
  } finally {
    timeout.cancel();
  }
}

/**
 * Extract a parsed JSON value from a read body.
 * @param {{value: unknown, text: string}} body body from {@link readBody}
 * @returns {unknown} parsed value, or `undefined` when the body is absent/unparseable
 */
function toJSON(body) {
  if (!body) return undefined;
  if (body.value !== undefined) return body.value;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch (err) {
    return undefined;
  }
}

/**
 * List the model ids the endpoint offers.
 *
 * What: `GET {baseUrl}/models` with `Authorization: Bearer {key}`, tolerating both
 * OpenAI's `{data:[{id}]}` envelope and a bare `[{id}]` array. Ids are de-duplicated and
 * sorted with `localeCompare` so the dropdown is stable across refreshes.
 * Why: the model dropdown must never show duplicates or reshuffle every refresh.
 * On any failure it throws an {@link AIError} (never a bare `TypeError`).
 *
 * @param {object} options
 * @param {string} options.baseUrl endpoint root, e.g. `https://host/v1`
 * @param {string} options.key API key (sent only in the `Authorization` header)
 * @param {Function} [options.fetchImpl] fetch implementation (defaults to global `fetch`)
 * @param {AbortSignal} [options.signal] caller abort signal (composed with the timeout)
 * @param {number} [options.timeoutMs] request timeout in ms (defaults to 60000)
 * @returns {Promise<string[]>} sorted, de-duplicated model ids
 * @throws {AIError} on network, timeout, abort, HTTP, or response-shape failure
 */
export async function listModels({ baseUrl, key, fetchImpl = globalThis.fetch, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = joinUrl(baseUrl, 'models');
  const { res, body } = await performRequest({
    url,
    init: { method: 'GET', headers: { Authorization: `Bearer ${key}` } },
    fetchImpl,
    signal,
    timeoutMs,
  });

  if (!res.ok) throw httpError(res.status, body, key);
  if (body && body.tooLarge) throw tooLargeError(body, res.status);

  const value = toJSON(body);
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray(value.data)
      ? value.data
      : null;
  if (!list) {
    throw new AIError('The AI service sent an unexpected reply. Try again.', {
      kind: 'shape',
      status: res.status,
      detail: truncate(redactSecrets(body && body.text, key)),
    });
  }

  const ids = list
    .map((entry) => (entry && typeof entry === 'object' ? entry.id : entry))
    .filter((id) => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/**
 * Ask the endpoint for a single, non-streaming chat completion.
 *
 * What: `POST {baseUrl}/chat/completions` with `{model, messages, temperature, stream:false}`
 * and returns `{content, model, usage}` extracted from `choices[0].message.content`.
 * Why: the studio only ever wants one complete reply to parse as JSON — streaming/SSE is
 * deliberately NOT requested, so the response can be consumed in one shot.
 * On any failure it throws an {@link AIError}; a 2xx reply with no usable `choices` is a
 * `shape` error, so `content` is NEVER `undefined`.
 *
 * @param {object} options
 * @param {string} options.baseUrl endpoint root, e.g. `https://host/v1`
 * @param {string} options.key API key (sent only in the `Authorization` header)
 * @param {string} options.model model id to use
 * @param {Array<{role: string, content: string}>} options.messages chat messages
 * @param {number} [options.temperature] sampling temperature (defaults to 0.4)
 * @param {Function} [options.fetchImpl] fetch implementation (defaults to global `fetch`)
 * @param {AbortSignal} [options.signal] caller abort signal (composed with the timeout)
 * @param {number} [options.timeoutMs] request timeout in ms (defaults to 60000)
 * @returns {Promise<{content: string, model: string|undefined, usage: object|null}>}
 * @throws {AIError} on network, timeout, abort, HTTP, or response-shape failure
 */
export async function chatCompletion({
  baseUrl,
  key,
  model,
  messages,
  temperature,
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const url = joinUrl(baseUrl, 'chat/completions');
  const payload = {
    model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_TEMPERATURE,
    stream: false,
  };
  const { res, body } = await performRequest({
    url,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    fetchImpl,
    signal,
    timeoutMs,
  });

  if (!res.ok) throw httpError(res.status, body, key);
  if (body && body.tooLarge) throw tooLargeError(body, res.status);

  const value = toJSON(body);
  const choices = value && value.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIError('The AI service sent an unexpected reply. Try again.', {
      kind: 'shape',
      status: res.status,
      detail: truncate(redactSecrets(body && body.text, key)),
    });
  }
  const message = choices[0] && choices[0].message;
  if (!message || typeof message.content !== 'string') {
    throw new AIError('The AI service sent an empty reply. Try again.', {
      kind: 'shape',
      status: res.status,
      detail: truncate(redactSecrets(body && body.text, key)),
    });
  }

  return {
    content: message.content,
    model: value.model,
    usage: value.usage == null ? null : value.usage,
  };
}
