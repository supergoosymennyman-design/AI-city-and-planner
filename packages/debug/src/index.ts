/**
 * @edu/debug — the team's one consistent debugging API (AGENTS.md "debuggability-first").
 *
 * Three tools:
 *  - `debug(namespace)` — namespaced, production-off logging (zero cost when disabled).
 *  - `assert(cond, msg)` — fail loud at an invariant boundary; narrows types.
 *  - `invariant(cond, msg)` — like assert, but semantically "this must never happen".
 *
 * WHY a tiny homegrown module instead of the `debug` npm package: zero dependencies
 * (tablet/offline + no-CDN rules), and we can bake in the **no-PII** guardrail (§5c)
 * and a browser+node enablement model the standard `debug` lib doesn't give us.
 *
 * ⚠️ NEVER pass child personal data (names, transcripts, image/audio bytes) to `debug`
 * (§5c). Debug output is for developers; it must be safe to leave in shipped code.
 */

// ---------------------------------------------------------------------------
// Enablement — read once at module load (same model as the popular `debug` lib).
// Set BEFORE the app loads; toggling at runtime requires a reload.
// ---------------------------------------------------------------------------

/**
 * The active debug pattern, e.g. "city:*,toolbox" or "*". Empty = all logging off.
 * Sources, in priority order (first non-empty wins):
 *  1. `globalThis.__EDU_DEBUG__`  — explicit override (tests, embedded hosts)
 *  2. `localStorage.getItem('debug')` — browser/tablet, matches `debug` lib convention
 *  3. `process.env.DEBUG`         — node/CI
 */
function readDebugPattern(): string {
  try {
    const g = globalThis as { __EDU_DEBUG__?: unknown };
    if (typeof g.__EDU_DEBUG__ === 'string') return g.__EDU_DEBUG__;

    // localStorage can be absent (node) or throw (Safari private mode) — guard both.
    if (typeof localStorage !== 'undefined') {
      const fromLs = localStorage.getItem('debug');
      if (fromLs) return fromLs;
    }

    // `process` exists in node/CI; in a browser bundle it's typically undefined.
    if (typeof process !== 'undefined' && typeof process.env?.DEBUG === 'string') {
      return process.env.DEBUG;
    }
  } catch {
    // Any access error (e.g. blocked storage) → debugging simply stays off. Never throw.
  }
  return '';
}

/** Tokens are comma- or whitespace-separated; `*` = all, trailing `*` = prefix match. */
function patternMatches(pattern: string, namespace: string): boolean {
  const tokens = pattern.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    if (token === '*') return true;
    if (token.endsWith('*')) {
      // prefix wildcard: 'city:*' enables 'city:waste', 'city:power', ...
      if (namespace.startsWith(token.slice(0, -1))) return true;
    } else if (token === namespace) {
      return true;
    }
  }
  return false;
}

const ACTIVE_PATTERN = readDebugPattern();

/** A namespaced logger: `(message, ...args) => void`. No-op when its namespace is off. */
export type DebugLogger = (message: string, ...args: unknown[]) => void;

/** Is this namespace currently enabled? Useful to guard expensive log-arg construction. */
export function isDebugEnabled(namespace: string): boolean {
  return ACTIVE_PATTERN !== '' && patternMatches(ACTIVE_PATTERN, namespace);
}

/**
 * Create a namespaced debug logger. When the namespace is disabled this returns a
 * shared no-op, so leaving `debug('city:waste')(...)` calls in hot sim loops costs
 * (effectively) nothing in production.
 *
 * @example
 *   const log = debug('city:waste');
 *   log('overflow at tick %d, trash=%d', state.globals.tick, trashMilli);
 */
export function debug(namespace: string): DebugLogger {
  if (!isDebugEnabled(namespace)) return NOOP;
  // Bind once; the prefix makes interleaved subsystem logs readable during debugging.
  return (message: string, ...args: unknown[]): void => {
    // console.debug keeps these off the default console level in some browsers.
    console.debug(`[${namespace}] ${message}`, ...args);
  };
}

const NOOP: DebugLogger = () => {};

// ---------------------------------------------------------------------------
// Assertions — fail loud at invariant boundaries (determinism, serialization, DAG).
// ---------------------------------------------------------------------------

/** Thrown by `assert`. Distinct type so callers/tests can catch invariant breaks. */
export class AssertionError extends Error {
  override readonly name = 'AssertionError';
}

/** Thrown by `invariant` — a "this should never happen" violation. */
export class InvariantError extends Error {
  override readonly name = 'InvariantError';
}

/**
 * Throw `AssertionError(message)` if `condition` is falsy. The `asserts condition`
 * return type also **narrows types** for the compiler after the call, so it doubles
 * as a type guard. Keep messages specific — include the bad value and the expectation.
 *
 * @example
 *   assert(Number.isInteger(trashMilli), `trash must be integer milli-units, got ${trashMilli}`);
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}

/**
 * Like `assert`, but for impossible states (exhaustiveness, "unreachable" branches).
 * Use when a failure means a programming bug, not bad input.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

/** Assert unreachability (e.g. in a `switch` default) — also a compile-time exhaustiveness check. */
export function assertNever(value: never, message = `Unreachable: ${String(value)}`): never {
  throw new InvariantError(message);
}
