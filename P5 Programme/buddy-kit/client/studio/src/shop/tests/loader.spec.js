/**
 * loader.test.js — pure-Node coverage for the model-shop asset loader (`src/shop/loader.js`).
 *
 * The loader is impure (it fetches and imports models), but BOTH of its environment
 * dependencies are injected — `fetchImpl` and `importModel` — so every failure path is
 * reproducible here with plain stubs and no browser, no network, and no WebGL.
 *
 * Why this file uses top-level `await` yet still exports a SYNCHRONOUS default:
 * the harness calls `mod.default(check)` without awaiting it and then `process.exit()`s,
 * so an `async` default would silently report green. The harness DOES `await import(...)`
 * this module, though, and dynamic `import()` waits for top-level `await`. So the async
 * probes run during module evaluation (awaited by the harness), the results land in
 * `probes`, and the default export is a plain synchronous function that only reads them.
 * `mod.default.constructor.name` therefore stays `Function`, never `AsyncFunction`.
 *
 * Every probe uses `capture()` so a synchronous throw AND a rejected promise are recorded
 * as data rather than escaping — that is how "never throws" is proven.
 */

import { readFileSync } from 'node:fs';
import { CATALOG_FALLBACK } from '../catalog.js';
import { SKILL_TREE_FALLBACK } from '../skill-tree.js';
import { createLoader } from '../loader.js';

// --- stubs ---------------------------------------------------------------------

/**
 * Build a fake `Response`.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.ok] - The `ok` flag.
 * @param {number} [opts.status] - The HTTP status.
 * @param {unknown} [opts.payload] - Value returned by `json()`.
 * @param {boolean} [opts.jsonThrows] - When true, `json()` rejects (an invalid body).
 * @returns {{ok: boolean, status: number, json: () => Promise<unknown>}}
 */
function response({ ok = true, status = 200, payload, jsonThrows = false } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (jsonThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
      return payload;
    },
  };
}

/**
 * A fake `importModel` that counts calls and resolves a clonable stub scene.
 *
 * @returns {Function & {calls: string[]}} The fake; `calls` records every requested URL.
 */
function recordingImport() {
  /** @type {string[]} */
  const calls = [];
  const fn = (url) => {
    calls.push(url);
    return Promise.resolve({ scene: { clone: () => ({ cloned: true }) } });
  };
  fn.calls = calls;
  return fn;
}

/**
 * Run a thunk and capture its outcome as DATA, so no throw can escape the probe block.
 *
 * @param {() => Promise<unknown>} thunk - The call to make.
 * @returns {Promise<{threw: boolean, value?: unknown, error?: unknown}>}
 */
async function capture(thunk) {
  try {
    return { threw: false, value: await thunk() };
  } catch (err) {
    return { threw: true, error: err };
  }
}

// --- async probes (awaited by the harness's dynamic import) ---------------------

/** @type {Record<string, any>} */
const probes = {};

// 1. Catalog: 404, network rejection, and invalid JSON must all degrade identically.
{
  const notFound = createLoader({
    baseUrl: './',
    fetchImpl: () => Promise.resolve(response({ ok: false, status: 404 })),
    importModel: null,
  });
  probes.notFound = await capture(() => notFound.loadCatalog());

  const offline = createLoader({
    baseUrl: '/',
    fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    importModel: null,
  });
  probes.offline = await capture(() => offline.loadCatalog());

  const badJson = createLoader({
    baseUrl: '/',
    fetchImpl: () => Promise.resolve(response({ jsonThrows: true })),
    importModel: null,
  });
  probes.badJson = await capture(() => badJson.loadCatalog());
}

// 2. Catalog: a valid response goes through `catalog.js` normalization.
{
  /** @type {string|null} */
  let requested = null;
  const valid = createLoader({
    baseUrl: 'sub/dir',
    fetchImpl: (url) => {
      requested = url;
      return Promise.resolve(
        response({
          payload: {
            version: 1,
            startingCoins: 5,
            startingLevel: 2,
            models: [
              { id: 'ok', name: 'Okay', file: 'ok.glb', unlock: { type: 'free' } },
              { id: 'bad', name: 'Bad', file: '../bad.glb', unlock: { type: 'free' } },
            ],
          },
        }),
      );
    },
    importModel: null,
  });
  const result = await capture(() => valid.loadCatalog());
  probes.validCatalog = result;
  probes.validCatalogUrl = requested;
}

// 3. baseUrl normalization: one trailing slash, whatever the caller supplies.
{
  /** @type {string[]} */
  const urls = [];
  const make = (baseUrl) =>
    createLoader({
      baseUrl,
      fetchImpl: (url) => {
        urls.push(url);
        return Promise.resolve(response({ payload: { version: 1, models: [] } }));
      },
      importModel: null,
    });
  await make('./').loadCatalog();
  await make('/').loadCatalog();
  await make('deep/sub').loadCatalog();
  await make('deep/sub/').loadCatalog();
  probes.baseUrls = urls;
}

// 4. Template cache: two calls, one import, two DISTINCT clones; clear() re-arms it.
{
  const importModel = recordingImport();
  const loader = createLoader({ baseUrl: 'assets', fetchImpl: null, importModel });
  const first = await capture(() => loader.loadTemplate('starter-cube.glb'));
  const second = await capture(() => loader.loadTemplate('starter-cube.glb'));
  probes.cachedFirst = first;
  probes.cachedSecond = second;
  probes.cachedCalls = importModel.calls.slice();

  loader.clear();
  const afterClear = await capture(() => loader.loadTemplate('starter-cube.glb'));
  probes.afterClear = afterClear;
  probes.afterClearCalls = importModel.calls.length;
}

// 4b. Independent clones: `Object3D.clone(true)` shares geometry/material with the
//     template, so the loader must deep-clone both per mesh — otherwise recoloring one
//     placement would recolor every placement AND the cached template, and deleting one
//     would dispose the shared GPU resources out from under the others.
{
  const geometry = { clone: () => ({ geometryClone: true }) };
  const material = { clone: () => ({ materialClone: true }) };
  const makeMesh = () => ({
    isMesh: true,
    geometry,
    material,
    children: [],
    traverse(cb) { cb(this); },
  });
  const templateRoot = {
    isGroup: true,
    geometry: null,
    material: null,
    children: [makeMesh()],
    traverse(cb) {
      cb(this);
      for (const child of this.children) child.traverse(cb);
    },
    // Mirror three.js Object3D.clone(true): NEW nodes, SHARED geometry/material.
    clone() {
      return {
        isGroup: true,
        geometry: null,
        material: null,
        children: [makeMesh()],
        traverse(cb) {
          cb(this);
          for (const child of this.children) child.traverse(cb);
        },
      };
    },
  };
  const loader = createLoader({
    baseUrl: './',
    fetchImpl: null,
    importModel: () => Promise.resolve({ scene: templateRoot }),
  });
  const a = await capture(() => loader.loadTemplate('starter-cube.glb'));
  const b = await capture(() => loader.loadTemplate('starter-cube.glb'));
  probes.independentClones = {
    a,
    b,
    templateGeometry: geometry,
    templateMaterial: material,
    templateStillShares:
      templateRoot.children[0].geometry === geometry &&
      templateRoot.children[0].material === material,
  };
}

// 5. Path traversal / malformed filenames reject WITHOUT touching the importer.
{
  const importModel = recordingImport();
  const loader = createLoader({ baseUrl: './', fetchImpl: null, importModel });
  probes.traversal = await capture(() => loader.loadTemplate('../evil.glb'));
  probes.traversalSlashed = await capture(() => loader.loadTemplate('sub/evil.glb'));
  probes.traversalNonGlb = await capture(() => loader.loadTemplate('evil.txt'));
  probes.traversalNonString = await capture(() => loader.loadTemplate(42));
  probes.traversalCalls = importModel.calls.length;
}

// 6. A failed import rejects (not swallowed) and a non-clonable result rejects too.
{
  const rejecting = createLoader({
    baseUrl: './',
    fetchImpl: null,
    importModel: () => Promise.reject(new Error('disk exploded')),
  });
  probes.importRejected = await capture(() => rejecting.loadTemplate('missing.glb'));

  const shapeLess = createLoader({
    baseUrl: './',
    fetchImpl: null,
    importModel: () => Promise.resolve({ notAScene: true }),
  });
  probes.importShapeLess = await capture(() => shapeLess.loadTemplate('weird.glb'));
}

// 7. Skill tree: the success path uses the injected fetch and normalizes via skill-tree.js.
{
  /** @type {string|null} */
  let requested = null;
  const valid = createLoader({
    baseUrl: 'sub/dir',
    fetchImpl: (url) => {
      requested = url;
      return Promise.resolve(
        response({
          payload: {
            version: 1,
            categories: [
              { id: 'head', label: 'Head', icon: '', order: 2 },
              { id: 'body', label: 'Body', icon: '', order: 1 },
            ],
            branches: [
              {
                id: 'br',
                name: 'Branch',
                nodes: [
                  { id: 'a', name: 'A', levelReward: 1, coinReward: 5 },
                  { id: 'b', name: 'B', levelReward: 2, coinReward: 10 },
                ],
              },
            ],
          },
        }),
      );
    },
    importModel: null,
  });
  probes.validSkillTree = await capture(() => valid.loadSkillTree());
  probes.validSkillTreeUrl = requested;
}

// 8. Skill tree: every failure path resolves (never rejects) with the frozen fallback.
{
  const httpError = createLoader({
    baseUrl: './',
    fetchImpl: () => Promise.resolve(response({ ok: false, status: 500, payload: {} })),
    importModel: null,
  });
  probes.skillTreeHttpError = await capture(() => httpError.loadSkillTree());

  const network = createLoader({
    baseUrl: '/',
    fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    importModel: null,
  });
  probes.skillTreeNetwork = await capture(() => network.loadSkillTree());

  const badJson = createLoader({
    baseUrl: '/',
    fetchImpl: () => Promise.resolve(response({ jsonThrows: true })),
    importModel: null,
  });
  probes.skillTreeBadJson = await capture(() => badJson.loadSkillTree());

  const noFetch = createLoader({ baseUrl: './' });
  probes.skillTreeNoFetch = await capture(() => noFetch.loadSkillTree());
}

// --- assertions (synchronous default export) -----------------------------------

/**
 * Assert a degraded catalog result: fallback catalog, one error, non-null fetchError.
 *
 * @param {{threw: boolean, value?: any}} captured - A `capture()` result.
 * @returns {boolean}
 */
function isDegraded(captured) {
  if (captured.threw) return false;
  const r = captured.value;
  if (!r) return false;
  return (
    r.catalog === CATALOG_FALLBACK &&
    Array.isArray(r.catalog.models) &&
    r.catalog.models.length === 0 &&
    Array.isArray(r.errors) &&
    r.errors.length === 1 &&
    typeof r.errors[0] === 'string' &&
    r.errors[0] !== '' &&
    typeof r.fetchError === 'string' &&
    r.fetchError !== ''
  );
}

/**
 * Assert a degraded skill-tree result: frozen fallback config, one error, non-null fetchError.
 *
 * @param {{threw: boolean, value?: any}} captured - A `capture()` result.
 * @returns {boolean}
 */
function isDegradedSkillTree(captured) {
  if (captured.threw) return false;
  const r = captured.value;
  if (!r) return false;
  return (
    r.config === SKILL_TREE_FALLBACK &&
    Array.isArray(r.config.categories) &&
    r.config.categories.length === 0 &&
    Array.isArray(r.config.branches) &&
    r.config.branches.length === 0 &&
    Array.isArray(r.errors) &&
    r.errors.length === 1 &&
    typeof r.errors[0] === 'string' &&
    r.errors[0] !== '' &&
    typeof r.fetchError === 'string' &&
    r.fetchError !== ''
  );
}

/**
 * Register this module's checks. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness PASS/FAIL callback.
 */
export default function loaderTests(check) {  // --- loadCatalog degradation (404 / network / invalid JSON) --------------------
  check('loader: 404 fetch resolves to a fallback catalog with a non-null fetchError', isDegraded(probes.notFound));
  check('loader: 404 fetch yields catalog.models.length === 0', probes.notFound.value && probes.notFound.value.catalog.models.length === 0);
  check('loader: 404 fetch surfaces the HTTP status', probes.notFound.value && /404/.test(probes.notFound.value.fetchError));
  check('loader: network rejection resolves (never throws) with a non-null fetchError', isDegraded(probes.offline));
  check('loader: network failure message says network error', probes.offline.value && /network error/i.test(probes.offline.value.fetchError));
  check('loader: invalid JSON resolves (never throws) with a non-null fetchError', isDegraded(probes.badJson));
  check('loader: invalid JSON message mentions JSON', probes.badJson.value && /JSON/.test(probes.badJson.value.fetchError));
  check('loader: all three failures kept the fallback economy defaults', [probes.notFound, probes.offline, probes.badJson].every((c) => c.value && c.value.catalog.startingCoins === CATALOG_FALLBACK.startingCoins && c.value.catalog.startingLevel === CATALOG_FALLBACK.startingLevel));

  // --- loadCatalog success path (normalizeCatalog is actually used) --------------
  const valid = probes.validCatalog;
  check('loader: valid fetch resolves with fetchError === null', !valid.threw && valid.value.fetchError === null);
  check('loader: valid fetch normalizes through catalog.js (invalid entry dropped)', !valid.threw && valid.value.catalog.models.length === 1 && valid.value.catalog.models[0].id === 'ok' && valid.value.errors.length === 1);
  check('loader: valid fetch preserves the catalog starting values', !valid.threw && valid.value.catalog.startingCoins === 5 && valid.value.catalog.startingLevel === 2);
  check('loader: catalog URL is built from the injected base', probes.validCatalogUrl === 'sub/dir/models/catalog.json');

  // --- baseUrl normalization -----------------------------------------------------
  check('loader: baseUrl always gains exactly one trailing slash', JSON.stringify(probes.baseUrls) === JSON.stringify(['./models/catalog.json', '/models/catalog.json', 'deep/sub/models/catalog.json', 'deep/sub/models/catalog.json']));

  // --- template cache + independent clones ---------------------------------------
  check('loader: loadTemplate resolves two DISTINCT objects', !probes.cachedFirst.threw && !probes.cachedSecond.threw && probes.cachedFirst.value !== probes.cachedSecond.value);
  check('loader: loadTemplate returns clones, not the cached template', probes.cachedFirst.value && probes.cachedFirst.value.cloned === true && probes.cachedSecond.value && probes.cachedSecond.value.cloned === true);
  check('loader: importModel is called exactly ONCE for two loads (cache hit)', probes.cachedCalls.length === 1);
  check('loader: importModel receives the base-relative models URL', probes.cachedCalls[0] === 'assets/models/starter-cube.glb');
  check('loader: clear() empties the cache so the next load re-imports', probes.afterClearCalls === 2 && !probes.afterClear.threw && probes.afterClear.value !== probes.cachedFirst.value);

  // --- independent clone resources (fix #4) --------------------------------------
  const ic = probes.independentClones;
  const cloneMesh = (captured) =>
    captured && !captured.threw && captured.value && Array.isArray(captured.value.children)
      ? captured.value.children[0]
      : null;
  check('loader: a placement gets its OWN material (not the cached template\'s)',
    !!cloneMesh(ic.a) && cloneMesh(ic.a).material !== ic.templateMaterial);
  check('loader: a placement gets its OWN geometry (not the cached template\'s)',
    !!cloneMesh(ic.a) && cloneMesh(ic.a).geometry !== ic.templateGeometry);
  check('loader: two placements never share a material object',
    !!cloneMesh(ic.a) && !!cloneMesh(ic.b) && cloneMesh(ic.a).material !== cloneMesh(ic.b).material);
  check('loader: two placements never share a geometry object',
    !!cloneMesh(ic.a) && !!cloneMesh(ic.b) && cloneMesh(ic.a).geometry !== cloneMesh(ic.b).geometry);
  check('loader: both placements cloned successfully',
    !!cloneMesh(ic.a) && !!cloneMesh(ic.b));
  check('loader: the cached template is left untouched by resource cloning',
    ic.templateStillShares === true);

  // --- traversal / malformed filenames reject without importing ------------------
  check('loader: loadTemplate("../evil.glb") rejects', probes.traversal.threw === true);
  check('loader: "../evil.glb" never reaches importModel', probes.traversalCalls === 0);
  check('loader: a slashed "sub/evil.glb" rejects', probes.traversalSlashed.threw === true);
  check('loader: a non-.glb name rejects', probes.traversalNonGlb.threw === true);
  check('loader: a non-string filename rejects', probes.traversalNonString.threw === true);

  // --- import failures are surfaced, not swallowed -------------------------------
  check('loader: a rejecting importModel propagates the rejection', probes.importRejected.threw === true && /disk exploded/.test(String(probes.importRejected.error && probes.importRejected.error.message)));
  check('loader: a non-clonable import result rejects', probes.importShapeLess.threw === true);

  // --- loadSkillTree success + never-reject failures -----------------------------
  const st = probes.validSkillTree;
  check('loader: loadSkillTree valid fetch resolves with fetchError === null', !st.threw && st.value.fetchError === null);
  check('loader: loadSkillTree normalizes through skill-tree.js', !st.threw && st.value.config.version === 1 && st.value.config.categories.length === 2 && st.value.config.categories[0].id === 'body' && st.value.config.branches.length === 1 && st.value.config.branches[0].nodes.length === 2 && st.value.config.branches[0].nodes[1].id === 'b');
  check('loader: loadSkillTree calls the injected fetch with a skill-tree.json URL', probes.validSkillTreeUrl === 'sub/dir/skill-tree.json');
  check('loader: loadSkillTree HTTP 500 resolves (never throws) with the fallback config', isDegradedSkillTree(probes.skillTreeHttpError));
  check('loader: loadSkillTree HTTP error surfaces the status', probes.skillTreeHttpError.value && /500/.test(probes.skillTreeHttpError.value.fetchError));
  check('loader: loadSkillTree network rejection resolves (never throws) with the fallback config', isDegradedSkillTree(probes.skillTreeNetwork));
  check('loader: loadSkillTree invalid JSON resolves (never throws) with the fallback config', isDegradedSkillTree(probes.skillTreeBadJson));
  check('loader: loadSkillTree missing fetch resolves (never rejects) with a non-null fetchError', !probes.skillTreeNoFetch.threw && probes.skillTreeNoFetch.value && typeof probes.skillTreeNoFetch.value.fetchError === 'string' && probes.skillTreeNoFetch.value.fetchError !== '');

  // --- source guardrails (the test-import safety contract) -----------------------
  const rawSource = readFileSync(new URL('../loader.js', import.meta.url), 'utf8');
  // Strip block/line comments so prose about the dependencies cannot trip the guards.
  const source = rawSource.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  check('loader: source has no static 3D/addon import', !/from\s+['"]three/.test(source) && !/io\/gltf\.js/.test(source));
  check('loader: source never reads the build environment', !/import\.meta\.env/.test(source));
  check('loader: source is deterministic (no clock or RNG)', !/Math\.random|Date\.now/.test(source));
  check('loader: source calls no fetch itself (network only via injected fetchImpl)', !/\bfetch\s*\(/.test(source));
}
