// web/coding agent/server/route-static.js
/**
 * Pure static-route composition for the gateway. `static-path.js`'s `resolveClientPath` is the
 * containment PRIMITIVE (is this path safely inside this one base dir?); this module is the ROUTE
 * decision on top of it (which of the gateway's static bases — CLIENT, the `/logic/` sibling, or
 * one of the read-only `/project/`, `/ml/`, `/toolbox/` mounts — does this request path belong to?).
 * Split out so the route composition itself is unit-testable without booting the http server,
 * matching this repo's "pure module, thin handler" idiom.
 *
 * `client/index.html` loads `logic/*.js` as classic <script> tags so the browser and node:test share
 * ONE source of truth for champion-state/action-schema — those files live in the SIBLING `logic/`
 * dir, not under CLIENT, so `/logic/...` is routed to a second, equally-contained static root.
 *
 * `/project/`, `/ml/`, `/toolbox/` (Task 10) let the gateway serve a champion-project page (e.g.
 * `web/project/p5-01-recycle-eye/`) SAME-ORIGIN, so its own relative asset paths — `../../toolbox/
 * camera.js`, the ML model files under `web/ml/` — resolve against the gateway's own origin exactly
 * as they do under `web/serve.js` in dev. Read-only: nothing on the gateway ever writes into these
 * three roots, so they reuse the identical prefix-then-`resolveClientPath` shape `/logic/` already
 * established rather than needing any new containment primitive.
 */
import { resolveClientPath } from './static-path.js';

/**
 * Resolve an inbound request path (query string already stripped) to an absolute file path inside
 * whichever base directory it routes to, or `null` if the request is unsafe or resolves to neither.
 * @param {string} reqUrl - the request path, e.g. '/', '/buddy.js', '/logic/champion-state.js',
 *   '/project/p5-01-recycle-eye/', '/ml/models/x.tflite', '/toolbox/camera.js'.
 * @param {{CLIENT:string, LOGIC:string, PROJECT?:string, ML?:string, TOOLBOX?:string}} bases -
 *   absolute directories for the static roots. PROJECT/ML/TOOLBOX are optional so existing callers
 *   that only ever request CLIENT/LOGIC-shaped paths (e.g. this file's own pre-Task-10 tests) keep
 *   working without passing them — the prefix check below short-circuits before either is read.
 * @returns {string|null} absolute path ready for `readFile`, or `null` if unsafe.
 */
export function routeStaticPath(reqUrl, { CLIENT, LOGIC, PROJECT, ML, TOOLBOX }) {
  if (reqUrl.startsWith('/logic/')) return resolveClientPath(LOGIC, reqUrl.slice('/logic'.length));
  if (reqUrl.startsWith('/project/')) return resolveClientPath(PROJECT, reqUrl.slice('/project'.length));
  if (reqUrl.startsWith('/ml/')) return resolveClientPath(ML, reqUrl.slice('/ml'.length));
  if (reqUrl.startsWith('/toolbox/')) return resolveClientPath(TOOLBOX, reqUrl.slice('/toolbox'.length));
  return resolveClientPath(CLIENT, reqUrl);
}
