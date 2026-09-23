/**
 * search.test.js — pure-node coverage for the Model Shop filter/group/category utilities.
 *
 * These are the Wave A (shop UX) primitives the panel renders from, so the suite pins the
 * contract: substring-only matching, AND semantics, taxonomy order with a last `Other`
 * bucket, no model ever dropped, and a TOTAL / NON-MUTATING / never-throw boundary.
 *
 * Discovered and called by `test.mjs`'s `src/shop/tests/*.test.js` block as
 * `export default function searchTests(check)` — the harness does NOT await the call, so this
 * module must be entirely SYNCHRONOUS and use only `check(name, cond)`.
 */

import { categoriesFromCatalog, filterModels, groupByCategory } from '../search.js';

/** Structural deep-equality for JSON-shaped values (key order is irrelevant). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** JSON clone (all inputs here are JSON-shaped). */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/**
 * Run every search check. Synchronous by contract.
 *
 * @param {(name: string, cond: boolean) => void} check - Harness assertion callback.
 */
export default function searchTests(check) {
  // A small, deterministic fixture: three categories, one unknown, one category-less.
  const makeModels = () => [
    { id: '1', name: 'Robot Head', description: 'a friendly head', category: 'head', unlock: { type: 'free' } },
    { id: '2', name: 'Robot Hand', description: 'grabby helper', category: 'hands', unlock: { type: 'level', level: 2 } },
    { id: '3', name: 'Cat', description: 'a head cat', category: 'character', unlock: { type: 'coins', coins: 5 } },
    { id: '4', name: 'Mystery', description: 'undeclared', category: 'mystery', unlock: { type: 'free' } },
    { id: '5', name: 'Bare', description: 'no category at all', unlock: { type: 'free' } },
  ];
  const cats = [
    { id: 'head', label: 'Head', icon: '', order: 1 },
    { id: 'hands', label: 'Hands', icon: '', order: 2 },
    { id: 'character', label: 'Character', icon: '', order: 3 },
  ];

  // -------------------------------------------------------------------------------
  // filterModels — query
  // -------------------------------------------------------------------------------
  {
    const models = makeModels();
    const empty = filterModels(models, { query: '', categories: cats });
    check('search: empty query returns every model', empty.length === models.length);
    check('search: empty query preserves supplied order', deepEqual(empty.map((m) => m.id), models.map((m) => m.id)));
    check('search: filterModels returns a new array', empty !== models);
  }

  check('search: missing query returns every model', filterModels(makeModels(), { categories: cats }).length === 5);
  check('search: whitespace-only query returns every model', filterModels(makeModels(), { query: '   ' }).length === 5);
  check('search: non-string query is ignored', filterModels(makeModels(), { query: 42 }).length === 5);

  check('search: substring match on name', deepEqual(
    filterModels(makeModels(), { query: 'robot' }).map((m) => m.id),
    ['1', '2'],
  ));
  check('search: substring is case-insensitive', deepEqual(
    filterModels(makeModels(), { query: 'ROBOT' }).map((m) => m.id),
    ['1', '2'],
  ));
  check('search: query is trimmed', deepEqual(
    filterModels(makeModels(), { query: '  robot  ' }).map((m) => m.id),
    ['1', '2'],
  ));
  check('search: description is searched', deepEqual(
    filterModels(makeModels(), { query: 'head' }).map((m) => m.id),
    ['1', '3'],
  ));
  check('search: category is searched', deepEqual(
    filterModels(makeModels(), { query: 'char' }).map((m) => m.id),
    ['3'],
  ));
  check('search: no match returns []', filterModels(makeModels(), { query: 'zzz' }).length === 0);
  check('search: substring only — no fuzzy match', filterModels(makeModels(), { query: 'rbt' }).length === 0);

  // Non-string model fields must not be coerced into matches.
  check('search: numeric fields are not searched', filterModels(
    [{ id: 'n', name: 42, description: 7, category: 3 }],
    { query: '4' },
  ).length === 0);

  // -------------------------------------------------------------------------------
  // filterModels — category filter (AND semantics)
  // -------------------------------------------------------------------------------
  check('search: categoryId "all" applies no filter', filterModels(makeModels(), { categoryId: 'all' }).length === 5);
  check('search: categoryId "" applies no filter', filterModels(makeModels(), { categoryId: '' }).length === 5);
  check('search: missing categoryId applies no filter', filterModels(makeModels(), {}).length === 5);
  check('search: non-string categoryId applies no filter', filterModels(makeModels(), { categoryId: 7 }).length === 5);

  check('search: category filter keeps only that category', deepEqual(
    filterModels(makeModels(), { categoryId: 'hands' }).map((m) => m.id),
    ['2'],
  ));
  check('search: category filter is case-insensitive', deepEqual(
    filterModels(makeModels(), { categoryId: 'HEAD', categories: cats }).map((m) => m.id),
    ['1'],
  ));
  check('search: category filter ANDs with the query', deepEqual(
    filterModels(makeModels(), { query: 'robot', categoryId: 'hands', categories: cats }).map((m) => m.id),
    ['2'],
  ));
  check('search: AND yields [] when only one side matches', filterModels(
    makeModels(),
    { query: 'robot', categoryId: 'character', categories: cats },
  ).length === 0);

  check('search: categoryId "other" selects unknown + absent categories', deepEqual(
    filterModels(makeModels(), { categoryId: 'other', categories: cats }).map((m) => m.id),
    ['4', '5'],
  ));
  check('search: "other" ANDs with the query too', deepEqual(
    filterModels(makeModels(), { query: 'mystery', categoryId: 'other', categories: cats }).map((m) => m.id),
    ['4'],
  ));

  // -------------------------------------------------------------------------------
  // groupByCategory — taxonomy order, Other last, nothing dropped
  // -------------------------------------------------------------------------------
  {
    const grouped = groupByCategory(makeModels(), cats);
    check('search: groupByCategory bucket ids are in taxonomy order', deepEqual(
      grouped.map((b) => b.categoryId),
      ['head', 'hands', 'character', 'other'],
    ));
    check('search: groupByCategory labels come from the taxonomy', deepEqual(
      grouped.map((b) => b.label),
      ['Head', 'Hands', 'Character', 'Other'],
    ));
    check('search: groupByCategory never drops a model', grouped.reduce((n, b) => n + b.models.length, 0) === 5);
    check('search: groupByCategory preserves model order inside a bucket', deepEqual(
      grouped.find((b) => b.categoryId === 'head').models.map((m) => m.id),
      ['1'],
    ));
  }

  {
    const models = makeModels();
    const snapshot = clone(models);
    groupByCategory(models, cats);
    check('search: groupByCategory does not mutate the models array', deepEqual(models, snapshot));
  }

  {
    const grouped = groupByCategory(makeModels(), cats);
    check('search: Other bucket is always last', grouped[grouped.length - 1].label === 'Other');
    check('search: Other bucket holds unknown and absent categories', deepEqual(
      grouped[grouped.length - 1].models.map((m) => m.id),
      ['4', '5'],
    ));
    check('search: Other bucket categoryId is "other"', grouped[grouped.length - 1].categoryId === 'other');
  }

  // Empty buckets are omitted (the panel must not render an empty heading).
  {
    const grouped = groupByCategory([{ id: 'x', category: 'hands' }], cats);
    check('search: empty category buckets are omitted', grouped.length === 1 && grouped[0].categoryId === 'hands');
    check('search: no Other bucket when every model is known', !grouped.some((b) => b.categoryId === 'other'));
  }

  // Models still land in Other when the whole taxonomy is missing/hostile.
  {
    const grouped = groupByCategory([{ id: 'a', category: 'x' }, { id: 'b' }], 'nope');
    check('search: hostile categories degrade to a single Other bucket', grouped.length === 1 && grouped[0].label === 'Other');
    check('search: hostile categories still keep every model', grouped[0].models.length === 2);
  }

  check('search: groupByCategory on empty models returns []', groupByCategory([], cats).length === 0);
  check('search: groupByCategory on non-array models returns []', groupByCategory(null, cats).length === 0);

  // Taxonomy order is driven by `order`, not array position, without mutating the input.
  {
    const unsorted = [
      { id: 'character', label: 'Character', icon: '', order: 3 },
      { id: 'head', label: 'Head', icon: '', order: 1 },
      { id: 'hands', label: 'Hands', icon: '', order: 2 },
    ];
    const snapshot = clone(unsorted);
    const grouped = groupByCategory(makeModels(), unsorted);
    check('search: groupByCategory sorts by categories[].order', deepEqual(
      grouped.map((b) => b.categoryId),
      ['head', 'hands', 'character', 'other'],
    ));
    check('search: groupByCategory does not mutate the categories array', deepEqual(unsorted, snapshot));
  }

  // -------------------------------------------------------------------------------
  // categoriesFromCatalog — Wave A taxonomy source
  // -------------------------------------------------------------------------------
  {
    const derived = categoriesFromCatalog(makeModels());
    check('search: categoriesFromCatalog emits the frozen shape', deepEqual(derived, [
      { id: 'head', label: 'head', icon: '', order: 0 },
      { id: 'hands', label: 'hands', icon: '', order: 1 },
      { id: 'character', label: 'character', icon: '', order: 2 },
      { id: 'mystery', label: 'mystery', icon: '', order: 3 },
    ]));
  }

  check('search: categoriesFromCatalog skips missing/empty categories', deepEqual(
    categoriesFromCatalog([{ category: 'a' }, { category: '  ' }, {}, { category: '' }, { category: 'b' }]).map((c) => c.id),
    ['a', 'b'],
  ));
  check('search: categoriesFromCatalog preserves first-appearance order', deepEqual(
    categoriesFromCatalog([{ category: 'b' }, { category: 'a' }, { category: 'b' }]).map((c) => c.id),
    ['b', 'a'],
  ));
  check('search: categoriesFromCatalog dedupes', categoriesFromCatalog([{ category: 'a' }, { category: 'a' }]).length === 1);
  check('search: categoriesFromCatalog dedupes case-insensitively', deepEqual(
    categoriesFromCatalog([{ category: 'Head' }, { category: 'head' }]).map((c) => c.id),
    ['Head'],
  ));
  check('search: categoriesFromCatalog ignores non-string categories', categoriesFromCatalog([{ category: 42 }, { category: null }]).length === 0);
  check('search: categoriesFromCatalog on hostile input returns []', deepEqual(
    [null, undefined, 'x', 7, {}].map((v) => categoriesFromCatalog(v)),
    [[], [], [], [], []],
  ));

  // -------------------------------------------------------------------------------
  // TOTAL / NON-MUTATING — hostile input never throws and never edits the caller
  // -------------------------------------------------------------------------------
  {
    const models = makeModels();
    const modelsSnapshot = clone(models);
    const catsSnapshot = clone(cats);

    const hostile = [
      null, undefined, 0, '', 'nope', {}, [], [1, 2], { query: {} }, { categoryId: [] },
    ];
    let threw = false;
    hostile.forEach((input) => {
      try {
        filterModels(input?.models, input);
        filterModels(models, input);
        groupByCategory(input, cats);
        groupByCategory(models, input);
        categoriesFromCatalog(input);
      } catch (e) {
        threw = true;
      }
    });
    check('search: hostile input never throws', !threw);
    check('search: filterModels does not mutate models', deepEqual(clone(models), modelsSnapshot));
    check('search: groupByCategory does not mutate models', deepEqual(clone(models), modelsSnapshot));
    check('search: filterModels does not mutate categories', deepEqual(clone(cats), catsSnapshot));
  }

  check('search: filterModels on non-array models returns []', deepEqual(filterModels(null, { query: 'x' }), []));
  check('search: filterModels on null options is total', filterModels(makeModels()).length === 5);
  check('search: groupByCategory on non-array models is total', deepEqual(groupByCategory(undefined, cats), []));
}
