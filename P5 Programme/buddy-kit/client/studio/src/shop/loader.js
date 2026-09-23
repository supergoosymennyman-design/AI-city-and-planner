/**
 * loader.js — the model-shop's runtime asset loader: catalog fetch + GLB template cache.
 *
 * This is the ONE impure shop module (besides the controller): it talks to the network and
 * to a GLB importer. Both of those dependencies are INJECTED — `fetchImpl` and
 * `importModel` — so Node's test harness can import this file without a DOM, without a
 * browser `fetch`, and without dragging a WebGL/DOM loader into the test process:
 *
 *   - `baseUrl` is injected (the app supplies the Vite base) rather than read from the
 *     build environment, because Node has no build environment and reading it here would
 *     throw at import time.
 *   - `importModel(url) => Promise<{ scene: Object3D }>` is injected. The app passes its
 *     real GLB importer; tests pass a stub. This module never imports that importer
 *     statically, so it stays environment-free.
 *
 * Design rules (mirrors `./catalog.js`'s never-throw discipline):
 *   - `loadCatalog()` NEVER throws: a network error, a non-OK status, or invalid JSON
 *     degrades to a safe fallback catalog plus a surfaced `fetchError`.
 *   - `loadSkillTree()` mirrors that discipline for `skill-tree.json`: any failure resolves
 *     with `SKILL_TREE_FALLBACK` plus a surfaced `fetchError`, never rejects.
 *   - `loadTemplate(file)` DOES reject on a bad filename or a failed import, because a
 *     missing asset must be reportable by the caller, not silently swallowed.
 *   - The module performs no work at import time. Nothing is fetched until `loadCatalog()`
 *     is called; nothing is imported until `loadTemplate()` is called.
 */

import { CATALOG_FALLBACK, FILE_RE, normalizeCatalog } from './catalog.js';
import { SKILL_TREE_FALLBACK, normalizeSkillTree } from './skill-tree.js';

// Template filenames share `catalog.js`'s bare-`.glb` grammar (`FILE_RE`): a bare filename in
// `models/` — no paths, no URLs. The loader still rejects independently at its boundary.

/**
 * Normalize a base URL so later path concatenation is unambiguous.
 *
 * WHY: the injected base may arrive as `'./'`, `'/'`, `'sub/dir'`, or `'sub/dir/'`. Rather
 * than branch at every use-site, we guarantee exactly one trailing `/` here.
 *
 * @param {unknown} baseUrl - The app-supplied base (typically the build's base path).
 * @returns {string} A base string ending in `/`. Non-strings fall back to `'./'`.
 */
function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl === '') return './';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/**
 * Coerce an unknown thrown value into a human-readable message for error reporting.
 *
 * @param {unknown} err - A thrown value (usually an `Error`).
 * @returns {string} A non-empty message; never throws.
 */
function errorMessage(err) {
  if (err && typeof err.message === 'string' && err.message !== '') return err.message;
  return String(err);
}

/**
 * Give a cloned object graph its OWN geometry and materials.
 *
 * WHY: three.js `Object3D.clone(true)` creates new NODES but SHARES each mesh's
 * `geometry` and `material` with the source. Two placements of the same cached
 * template would therefore share live GPU resources: recoloring one (properties.js)
 * recolors every placement AND the cached template, and deleting one disposes the
 * resources out from under the others. Mirror `src/scene.js`'s `duplicate()`, which
 * clones both per mesh. `material` may be an array (multi-material mesh), so every
 * entry is cloned. The template object itself is never touched — only the clone.
 *
 * @param {object} root - The freshly-cloned object graph (three.js Object3D-like).
 * @returns {object} The same `root`, with per-node resource clones applied in place.
 */
function cloneResources(root) {
  if (!root || typeof root !== 'object') return root;
  const cloneNodeResources = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.geometry && typeof node.geometry.clone === 'function') {
      try { node.geometry = node.geometry.clone(); } catch (err) { /* keep shared geometry */ }
    }
    const material = node.material;
    if (Array.isArray(material)) {
      node.material = material.map((entry) =>
        entry && typeof entry.clone === 'function' ? entry.clone() : entry,
      );
    } else if (material && typeof material.clone === 'function') {
      node.material = material.clone();
    }
  };
  if (typeof root.traverse === 'function') root.traverse(cloneNodeResources);
  else cloneNodeResources(root);
  return root;
}

/**
 * Create a model-shop loader bound to an injected environment.
 *
 * @param {object} deps - The injected dependencies (all supplied by the app/test caller).
 * @param {string} [deps.baseUrl] - Base path that `models/` hangs off (e.g. `'./'` or `'/'`).
 *   Normalized to end with `/`; defaults to `'./'`.
 * @param {Function} [deps.fetchImpl] - `(url) => Promise<Response>`. Falls back to the
 *   global `fetch` when omitted; if neither exists, `loadCatalog()` degrades cleanly.
 * @param {Function} [deps.importModel] - `(url) => Promise<{scene: Object3D}>`. Required by
 *   `loadTemplate()`; when omitted, `loadTemplate()` rejects with a clear message.
 * @returns {{
 *   loadCatalog: () => Promise<{catalog: object, errors: string[], fetchError: string|null}>,
 *   loadSkillTree: () => Promise<{config: object, errors: string[], fetchError: string|null}>,
 *   loadTemplate: (file: string) => Promise<object>,
 *   clear: () => void,
 * }} The loader API. All methods are safe to call repeatedly.
 */
export function createLoader({ baseUrl, fetchImpl, importModel, timeoutMs = 15000 } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const doFetch =
    typeof fetchImpl === 'function'
      ? fetchImpl
      : typeof globalThis.fetch === 'function'
        ? globalThis.fetch.bind(globalThis)
        : null;
  const doImport = typeof importModel === 'function' ? importModel : null;

  /**
   * One loaded template per bare filename. The stored value is the pristine GLB scene;
   * callers never receive it directly — they receive a fresh deep clone.
   *
   * @type {Map<string, object>}
   */
  const templateCache = new Map();
  const pending = new Map();
  // Cache templates own their geometry/materials; placements have independent clones.
  function disposeTemplate(scene) {
    scene?.traverse?.(node => {
      node.geometry?.dispose?.();
      for (const material of [].concat(node.material || [])) material.dispose?.();
    });
  }

  /**
   * Fetch and normalize `public/models/catalog.json`.
   *
   * WHY: the catalog is developer-edited config, so a broken or missing file must not
   * crash boot. Every failure path resolves (never rejects) with the fallback catalog, a
   * one-element `errors` array, and a non-null `fetchError` the UI can surface.
   *
   * @returns {Promise<{catalog: object, errors: string[], fetchError: string|null}>}
   *   The normalized catalog; `fetchError` is `null` on success. Never rejects.
   */
  async function loadCatalog() {
    const url = `${base}models/catalog.json`;
    /** @param {string} message @returns {{catalog: object, errors: string[], fetchError: string}} */
    const fail = (message) => ({
      catalog: CATALOG_FALLBACK,
      errors: [message],
      fetchError: message,
    });

    try {
      if (doFetch === null) {
        return fail(`catalog: no fetch implementation available for ${url}`);
      }

      let res;
      try {
        res = await doFetch(url);
      } catch (err) {
        return fail(`catalog: network error fetching ${url}: ${errorMessage(err)}`);
      }

      if (!res || !res.ok) {
        const status = res && res.status !== undefined ? res.status : 'unknown';
        return fail(`catalog: HTTP ${status} fetching ${url}`);
      }

      let raw;
      try {
        raw = await res.json();
      } catch (err) {
        return fail(`catalog: invalid JSON in ${url}: ${errorMessage(err)}`);
      }

      // The parser is total; even so, this whole method is wrapped so a surprise from it
      // still degrades instead of breaking boot.
      const { catalog, errors } = normalizeCatalog(raw);
      return { catalog, errors, fetchError: null };
    } catch (err) {
      return fail(`catalog: unexpected error loading ${url}: ${errorMessage(err)}`);
    }
  }

  /**
   * Fetch and normalize `skill-tree.json`.
   *
   * WHY: the skill tree is developer-edited config, so a broken or missing file must not
   * crash boot. Every failure path resolves (never rejects) with the frozen fallback tree, a
   * one-element `errors` array, and a non-null `fetchError` the UI can surface.
   *
   * @returns {Promise<{config: object, errors: string[], fetchError: string|null}>}
   *   The normalized config; `fetchError` is `null` on success. Never rejects.
   */
  async function loadSkillTree() {
    const url = `${base}skill-tree.json`;
    /** @param {string} message @returns {{config: object, errors: string[], fetchError: string}} */
    const fail = (message) => ({
      config: SKILL_TREE_FALLBACK,
      errors: [message],
      fetchError: message,
    });

    try {
      if (doFetch === null) {
        return fail(`skill-tree: no fetch implementation available for ${url}`);
      }

      let res;
      try {
        res = await doFetch(url);
      } catch (err) {
        return fail(`skill-tree: network error fetching ${url}: ${errorMessage(err)}`);
      }

      if (!res || !res.ok) {
        const status = res && res.status !== undefined ? res.status : 'unknown';
        return fail(`skill-tree: HTTP ${status} fetching ${url}`);
      }

      let raw;
      try {
        raw = await res.json();
      } catch (err) {
        return fail(`skill-tree: invalid JSON in ${url}: ${errorMessage(err)}`);
      }

      // The parser is total; even so, this whole method is wrapped so a surprise from it
      // still degrades instead of breaking boot.
      const { config, errors } = normalizeSkillTree(raw);
      return { config, errors, fetchError: null };
    } catch (err) {
      return fail(`skill-tree: unexpected error loading ${url}: ${errorMessage(err)}`);
    }
  }

  /**
   * Load a model template and return an INDEPENDENT clone of it.
   *
   * WHY the cache: placements of the same model must not each re-download and re-parse the
   * GLB. WHY the clone: every placement is a separate scene object a user can move, so two
   * placements must never share the same object. The cached template itself is never
   * returned.
   *
   * @param {string} file - A bare `.glb` filename (e.g. `'starter-cube.glb'`), sharing
   *   `catalog.js`'s `FILE_RE` grammar. Paths, `..`, and URLs are rejected here independently.
   * @returns {Promise<object>} A fresh deep clone of the (cached) template scene.
   * @throws {Promise<Error>} Rejects on an invalid filename, a missing/callable importer,
   *   a non-clonable import result, or a failed import. Import failures are deliberately
   *   NOT swallowed — the caller reports them.
   */
  function loadTemplate(file) {
    if (typeof file !== 'string' || !FILE_RE.test(file)) {
      return Promise.reject(
        new Error(`loader: "${String(file)}" is not a bare .glb filename`),
      );
    }

    const cached = templateCache.get(file);
    if (cached) {
      try {
        return Promise.resolve(cloneResources(cached.clone(true)));
      } catch (err) {
        // A cached template that can no longer clone is unusable — evict and report.
        templateCache.delete(file);
        return Promise.reject(err);
      }
    }

    if (doImport === null) {
      return Promise.reject(
        new Error('loader: no importModel implementation was injected'),
      );
    }

    let request = pending.get(file);
    if (!request) {
      const url = `${base}models/${file}`;
      request = { active: true, cancel: null, promise: null };
      let timer;
      const gate = new Promise((_, reject) => {
        request.cancel = () => { request.active = false; reject(new Error('Model loading was cancelled.')); };
        timer = setTimeout(() => { request.active = false; reject(new Error('Model loading timed out. Try again.')); }, timeoutMs);
      });
      const loading = Promise.resolve().then(() => doImport(url)).then((gltf) => {
        const scene = gltf && gltf.scene;
        if (!request.active) { disposeTemplate(scene); return null; }
        if (!scene || typeof scene.clone !== 'function') {
          throw new Error(`loader: "${file}" did not resolve a clonable scene`);
        }
        templateCache.set(file, scene);
        return scene;
      });
      request.promise = Promise.race([loading, gate]).finally(() => {
        clearTimeout(timer);
        if (pending.get(file) === request) pending.delete(file);
      });
      pending.set(file, request);
    }
    // Coalesce the import, never the returned placement: each caller owns its clone.
    return request.promise.then(scene => {
      if (!request.active) throw new Error('Model loading was cancelled.');
      return cloneResources(scene.clone(true));
    });
  }

  /**
   * Drop every cached template.
   *
   * WHY: used by "Reset progress" and by tests, so a re-enabled shop re-reads disk after
   * an asset changes. Economy state is untouched — this clears only the in-memory cache.
   *
   * @returns {void}
   */
  function clear() {
    for (const request of pending.values()) request.cancel();
    pending.clear();
    for (const scene of templateCache.values()) disposeTemplate(scene);
    templateCache.clear();
  }

  return { loadCatalog, loadSkillTree, loadTemplate, clear };
}
