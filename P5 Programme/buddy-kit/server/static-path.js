// web/coding agent/server/static-path.js
/**
 * Pure path-containment gate for the gateway's static file handler. This is the ONLY thing that
 * stands between an inbound HTTP request path and a filesystem read of the trust-boundary process
 * (which holds the model credential + server source) — so it is kept tiny and auditable, the same
 * shape as logic/whitelist-gate.js.
 *
 * `path.join(clientDir, decodeURIComponent(url))` alone does NOT reject traversal: `join` collapses
 * `..` segments arithmetically, so `GET /..%2f..%2fserver%2fsecrets.json` walks straight out of
 * clientDir onto secrets/source. This module decodes first, rejects any `..` segment or NUL byte in
 * the decoded string, THEN resolves and re-checks that the final absolute path is still prefixed by
 * `path.resolve(clientDir) + path.sep` before handing it back — belt AND suspenders.
 */
import { resolve, sep } from 'node:path';

/**
 * Resolve an inbound request path to an absolute file path inside `clientDir`, or `null` if the
 * request is unsafe (path traversal, NUL byte, or unparseable percent-encoding).
 * @param {string} clientDir - absolute directory static files must stay inside.
 * @param {string} urlPath - the raw request path (query string already stripped), e.g. '/',
 *   '/app.js', or a malicious '/..%2f..%2fserver%2fsecrets.json'.
 * @returns {string|null} absolute path inside clientDir, ready for `readFile`; `null` if unsafe.
 */
export function resolveClientPath(clientDir, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return null; // malformed percent-encoding — refuse rather than guess
  }
  if (decoded.includes('\0')) return null; // NUL truncation attempts
  if (decoded.split(/[\\/]/).includes('..')) return null; // reject BEFORE path.resolve collapses it
  const base = resolve(clientDir) + sep;
  const file = resolve(clientDir, '.' + sep + decoded);
  if (file !== base.slice(0, -1) && !file.startsWith(base)) return null; // final containment check
  return file;
}
