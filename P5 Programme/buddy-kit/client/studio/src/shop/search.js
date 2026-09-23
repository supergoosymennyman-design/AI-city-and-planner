/**
 * search.js — pure filtering / grouping for the Model Shop list (Wave A: shop UX only).
 *
 * The shop panel renders a flat list of catalog models (see `catalog.js`). This module is
 * the single, side-effect-free home for "which models does the child see right now?" so the
 * panel stays a dumb renderer and the behaviour is unit-testable under `node test.mjs`.
 *
 * Contract (mirrors `catalog.js`):
 *
 *  - PURE: no DOM, no `three`, no `fetch`, no `localStorage`, no `import.meta.env`, no
 *    `Math.random`, no `Date.now`. Node imports it directly.
 *  - TOTAL: none of these functions ever throw. Hostile input (`models` not an array,
 *    non-string `query`, garbage `categories`) degrades to a safe, empty-ish result.
 *  - NON-MUTATING: the caller's array and model objects are never edited. The functions
 *    return NEW arrays holding the SAME model references, in the supplied order.
 *
 * Search semantics: a case-insensitive, whitespace-trimmed SUBSTRING test over each model's
 * `name`, `description` and `category` — no fuzzy/regex matching, no scoring, no reordering.
 * The category filter combines with the query using AND. A model whose `category` is absent
 * or not declared in `categories` belongs to the synthetic `other` bucket, which
 * `groupByCategory` always renders last; grouping NEVER drops a model.
 *
 * This module is intentionally Wave A only: it knows nothing about the Wave B skill tree.
 */

/** Synthetic bucket id for models whose category is absent or unknown. */
const OTHER_BUCKET = 'other';

/** Label rendered for the synthetic bucket. */
const OTHER_LABEL = 'Other';

/**
 * Trim a value to a string, or `''` when it is not a string. Deliberately does NOT coerce
 * numbers/objects — a non-string field simply contributes nothing to matching.
 *
 * @param {unknown} value
 * @returns {string}
 */
function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve the bucket a model belongs to: the canonical `categories[].id` it matches
 * (case-insensitively), or `'other'` for an absent / undeclared category.
 *
 * @param {unknown} category - The model's raw `category` value.
 * @param {ReadonlyArray<{id?: unknown}>} categories - Normalized category list.
 * @returns {string}
 */
function bucketFor(category, categories) {
  const value = asText(category);
  if (value === '') return OTHER_BUCKET;
  const lower = value.toLowerCase();
  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    const id = asText(cat.id);
    if (id !== '' && id.toLowerCase() === lower) return cat.id;
  }
  return OTHER_BUCKET;
}

/**
 * Copy `categories` into taxonomy order without mutating the input. `order` is authoritative
 * when it is a finite number; anything else falls back to the array position. The sort is
 * stable, so equal orders keep their authored order.
 *
 * @param {unknown} categories
 * @returns {Array<object>} New array of the (by-reference) category objects.
 */
function orderCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return categories
    .map((cat, index) => ({ cat, index }))
    .filter((entry) => entry.cat && typeof entry.cat === 'object')
    .sort((a, b) => {
      const ao = typeof a.cat.order === 'number' && Number.isFinite(a.cat.order) ? a.cat.order : a.index;
      const bo = typeof b.cat.order === 'number' && Number.isFinite(b.cat.order) ? b.cat.order : b.index;
      return ao - bo;
    })
    .map((entry) => entry.cat);
}

/**
 * Does a model belong to the requested category bucket? `'other'` selects the synthetic
 * bucket (absent or undeclared category); any other id is an exact, case-insensitive match
 * against the model's own `category`, so a taxonomy is only needed to resolve `'other'`.
 *
 * @param {unknown} modelCategory - The model's raw `category` value.
 * @param {string} category - The lowercased, trimmed requested category id.
 * @param {ReadonlyArray<{id?: unknown}>} categories - Normalized category list.
 * @returns {boolean}
 */
function matchesCategory(modelCategory, category, categories) {
  if (category === OTHER_BUCKET) {
    return bucketFor(modelCategory, categories).toLowerCase() === OTHER_BUCKET;
  }
  return asText(modelCategory).toLowerCase() === category;
}

/**
 * Filter the shop models by an optional keyword and an optional category.
 *
 * @param {unknown} models - The catalog's `models` array (any value; non-arrays are ignored).
 * @param {{query?: unknown, categoryId?: unknown, categories?: unknown}} [options]
 *   `query` — substring to match; non-strings and blanks mean "match all".
 *   `categoryId` — bucket id to keep; `'all'`, `''`, missing or non-string mean "no filter".
 *   `categories` — the taxonomy used to resolve known vs. `'other'` buckets.
 * @returns {Array<object>} New array of matching model references, in the supplied order.
 */
export function filterModels(models, options) {
  const list = Array.isArray(models) ? models : [];
  const opts = options && typeof options === 'object' ? options : {};

  const query = typeof opts.query === 'string' ? opts.query.trim().toLowerCase() : '';
  const category = typeof opts.categoryId === 'string' ? opts.categoryId.trim().toLowerCase() : '';
  const categories = Array.isArray(opts.categories) ? opts.categories : [];
  const filterByCategory = category !== '' && category !== 'all';

  return list.filter((model) => {
    if (query !== '') {
      const name = typeof model?.name === 'string' ? model.name : '';
      const description = typeof model?.description === 'string' ? model.description : '';
      const categoryText = typeof model?.category === 'string' ? model.category : '';
      const hit = name.toLowerCase().includes(query)
        || description.toLowerCase().includes(query)
        || categoryText.toLowerCase().includes(query);
      if (!hit) return false;
    }
    if (filterByCategory && !matchesCategory(model?.category, category, categories)) {
      return false;
    }
    return true;
  });
}

/**
 * Group models into category buckets rendered in taxonomy order, with the synthetic `'other'`
 * bucket always last. Empty buckets are omitted so the panel never renders a heading with
 * nothing under it.
 *
 * Every model lands in exactly one bucket (known category by id match, otherwise `'other'`),
 * so no model is ever dropped — including when `categories` is missing or hostile.
 *
 * @param {unknown} models - The catalog's `models` array.
 * @param {unknown} categories - Normalized `{id,label,icon,order}` taxonomy.
 * @returns {Array<{categoryId: string, label: string, models: Array<object>}>}
 */
export function groupByCategory(models, categories) {
  const list = Array.isArray(models) ? models : [];
  const ordered = orderCategories(categories);

  const buckets = [];
  const byKey = new Map();
  for (const cat of ordered) {
    const id = asText(cat.id);
    if (id === '') continue;
    const key = id.toLowerCase();
    if (byKey.has(key)) continue; // first declaration wins on duplicate ids
    const label = typeof cat.label === 'string' && cat.label.trim() !== '' ? cat.label : id;
    const bucket = { categoryId: cat.id, label, models: [] };
    byKey.set(key, bucket);
    buckets.push(bucket);
  }

  const other = { categoryId: OTHER_BUCKET, label: OTHER_LABEL, models: [] };
  for (const model of list) {
    const key = asText(model?.category).toLowerCase();
    const bucket = key === '' ? undefined : byKey.get(key);
    if (bucket) bucket.models.push(model);
    else other.models.push(model);
  }

  const result = buckets.filter((bucket) => bucket.models.length > 0);
  if (other.models.length > 0) result.push(other);
  return result;
}

/**
 * Derive a Wave A category taxonomy from the catalog itself — there is no `skill-tree.json`
 * in Wave A. Distinct, non-empty `category` values are emitted in FIRST-APPEARANCE order as
 * `{id, label, icon: '', order: index}`, which is the exact shape the panel's `view.categories`
 * expects (Wave B replaces the *source* with the config taxonomy, not the shape).
 *
 * Case-insensitive duplicates collapse to the first-seen spelling. Models with a missing or
 * empty category are skipped here but still render under `'other'` via `groupByCategory`.
 *
 * @param {unknown} models - The catalog's `models` array.
 * @returns {Array<{id: string, label: string, icon: string, order: number}>}
 */
export function categoriesFromCatalog(models) {
  if (!Array.isArray(models)) return [];
  const seen = new Set();
  const result = [];
  for (const model of models) {
    const value = asText(model?.category);
    if (value === '') continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id: value, label: value, icon: '', order: result.length });
  }
  return result;
}
