(function () {
'use strict';
/** Real supplied data and independent learned snapshots. Pure; no I/O or global training shelves. */
const LibraryData = typeof require === 'function' ? require('../assets/library/catalogue.js') : window.WorkshopLibraryData;
const LibraryDatasets = typeof require === 'function' ? require('./datasets.js') : window.WorkshopDatasets;
const PHOTO_FEATURES = 'mobilenet-v3-small-224-squash-f32-unit-v1';
const clone = (v) => JSON.parse(JSON.stringify(v));
const unit = (v) => { const n = Math.sqrt(v.reduce((a, x) => a + x*x, 0)) || 1; return v.map((x) => x/n); };
const records = new Map();
const CLASSIFIERS = ['knn', 'proto', 'neural'];
function dataset(id) {
  if (id === 'iris-v1') return LibraryData.iris;
  if (id === 'trashnet-v1') return LibraryData.trashnet;
  if (id === 'cars-v1') return LibraryData.cars;
  throw new Error('This data version is not available in this Workshop.');
}
/** 'number' when every row's answer is a measured number (Auto MPG), else 'class' (a word). */
function kind(id) { const d = dataset(id); return d.schema && d.schema.kind === 'number' ? 'number' : 'class'; }
/** Measurement rows (a schema of named features), as opposed to photos read as feature vectors. */
function isTable(id) { return !!dataset(id).rows; }
/** The STRINGS key that names a dataset — the one copy the Files card and its plate both read. */
function nameKey(id) { dataset(id); return { 'iris-v1': 'library.iris', 'trashnet-v1': 'library.trash', 'cars-v1': 'library.cars' }[id]; }
function labels(id) { const d = dataset(id); return kind(id) === 'number' ? [] : d.labels || d.schema.answer.labels; }
function rows(id) { const d = dataset(id); return d.rows || d.photos; }
/**
 * Class data: a stable prefix per class within a frozen split, independent of scores and model
 * selection. Number data has no classes; `perClass` is the total, spread evenly over the split.
 * WHY spread: the Auto MPG rows are stored in mpg order, so a prefix would hand a child only the
 * thirstiest cars and a line fitted on them would never see an efficient one.
 */
function select(id, split, chosen, perClass) {
  if (!['train', 'test'].includes(split)) throw new Error('Choose training or test data.');
  if (kind(id) === 'number') {
    if (!Number.isInteger(perClass) || perClass < 1 || perClass > 3000) throw new Error('Choose a valid sample count.');
    const pile = rows(id).filter((r) => r.split === split);
    if (perClass >= pile.length) return pile;
    if (perClass === 1) return [pile[Math.floor((pile.length - 1) / 2)]];
    // Evenly spaced positions, first and last included; distinct because perClass < pile.length.
    return Array.from({ length: perClass }, (_, i) => pile[Math.round(i * (pile.length - 1) / (perClass - 1))]);
  }
  if (!Array.isArray(chosen) || !chosen.length || chosen.some((l) => !labels(id).includes(l))) throw new Error('Choose available classes.');
  if (!Number.isInteger(perClass) || perClass < 1 || perClass > 3000) throw new Error('Choose a valid sample count.');
  const counts = {};
  return rows(id).filter((r) => r.split === split && chosen.includes(r.label) && (counts[r.label] = (counts[r.label] || 0) + 1) <= perClass);
}
function schema(id) { return isTable(id) ? clone(dataset(id).schema) : { id, features: PHOTO_FEATURES, dimension: 1024 }; }
function preprocessing(id) { dataset(id); return id === 'iris-v1' ? 'iris-cm-div10-level1-unit-v1' : (id === 'cars-v1' ? 'cars-v1-unit' : PHOTO_FEATURES); }
function input(id, row) {
  if (isTable(id)) {
    const features = Object.fromEntries(dataset(id).schema.features.map((f, i) => [f.id, row.values[i]]));
    // tag = the crate face (what a child reads on the belt): every measurement, never the answer.
    return { tag: LibraryDatasets.face(dataset(id).schema, features), features, i:Number(row.id.slice(5))-1, dataset: dataset(id).schema,
      libraryDataset: id, libraryId: row.id, librarySplit: row.split };
  }
  const vec = records.get(row.id);
  if (!vec) throw new Error('These waste photos need loading. Open the data library and try again.');
  return { vec, image: 'library:' + row.id, libraryDataset: id, libraryId: row.id, librarySplit: row.split, preprocessing: PHOTO_FEATURES };
}
function vector(id, data) {
  if (isTable(id)) {
    if (!data || JSON.stringify(data.dataset) !== JSON.stringify(dataset(id).schema)) throw new Error(id === 'iris-v1' ? 'This model needs Iris measurements in centimetres.' : 'This model needs Car measurements.');
    if (dataset(id).schema.features.some((f) => !Number.isFinite(data.features && data.features[f.id]))) throw new Error(id === 'iris-v1' ? 'A flower measurement is missing.' : 'A car measurement is missing.');
    return LibraryDatasets.vec(data.dataset, data.features);
  }
  if (!data || data.preprocessing !== PHOTO_FEATURES || !Array.isArray(data.vec) || data.vec.length !== 1024 || data.vec.some((v) => !Number.isFinite(v))) throw new Error('This model needs the supplied waste-photo features.');
  return data.vec;
}
/** Register one decoded image-feature record. No labels or filenames are model inputs. */
function register(id, raw) {
  if (!rows('trashnet-v1').some((r) => r.id === id) || raw.length !== 1024 || raw.some((v) => !Number.isFinite(v))) throw new Error('Damaged photo features.');
  records.set(id, unit(Array.from(raw)));
}
function ready(id, selected) { return isTable(id) || selected.every((r) => records.has(r.id)); }
/** Numeric payload estimate only; excludes array/object overhead and browser allocations. */
function featureMemory() { return { records:records.size, payloadBytes:records.size*1024*8 }; }
function validateData(binding) {
  if (!binding || binding.version !== 1) throw new Error('Unsupported library data version.');
  const available = new Map(rows(binding.dataset).map((r) => [r.id, r]));
  if (!Array.isArray(binding.ids) || !binding.ids.length || binding.ids.length > available.size || new Set(binding.ids).size !== binding.ids.length) throw new Error('Invalid data selection.');
  return binding.ids.map((id) => { const r = available.get(id); if (!r || r.split !== binding.split) throw new Error('Unknown photo/row or mixed training and test data.'); return r; });
}
function contents(binding) {
  const id = binding && binding.dataset;
  // Classification truth is a word. A dummy numeric value would make Evaluator grade it as regression.
  if (kind(id) !== 'number') return validateData(binding).map((r) => ({ label: r.label, data: input(id, r) }));
  // Number truth: the same crate shape an authored or uploaded number table deals (game.js
  // datasetContents) — the answer as text for the crate, the value for the checker, and the
  // dataset's tolerance so "close enough" means the same thing on every belt.
  const tolerance = dataset(id).schema.answer.tolerance;
  return validateData(binding).map((r) => ({ label: String(r.label), value: r.label,
    data: Object.assign(input(id, r), { tolerance }) }));
}
function examples(id, selected) {
  return selected.map((r) => ({ id: 'library:' + r.id, label: r.label, vec: vector(id, input(id, r)), display: r.id }));
}
function identity(value) { let h = 2166136261; for (const c of JSON.stringify(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); }
/** Train only the dataset's frozen training partition. Returns a new, JSON-only artifact. */
function train(id, selected, brainId, adapters, versions, name, prepared) {
  if (kind(id) === 'number') throw new Error('This data answers with a number. Put it in a Files block and train a number brain on the belt.');
  if (!CLASSIFIERS.includes(brainId) || !adapters[brainId]) throw new Error('Choose a compatible classification brain.');
  const valid = new Map(rows(id).filter((r) => r.split === 'train').map((r) => [r.id, r]));
  if (!selected.length || new Set(selected.map((r) => r.id)).size !== selected.length || selected.some((r) => valid.get(r.id) !== r)) throw new Error('Only original training rows can teach this model.');
  trainingBudget(id, brainId, selected.length);
  const opts = { k: 3, seed: 42 };
  const learned = clone(prepared || adapters[brainId].learn(examples(id, selected), opts));
  return { version: 1, id: id + '-' + brainId + '-' + identity([selected.map((r) => r.id), opts, versions[brainId]]),
    name: String(name || 'My model').slice(0, 60), dataset: id, preprocessing: preprocessing(id),
    brain: brainId, brainVersion: versions[brainId], options: opts, input: schema(id),
    trainingIds: selected.map((r) => r.id), state: learned };
}
/** Bound synchronous training and portable k-NN snapshots; centroid still accepts the full split. */
function trainingBudget(id, brain, count) {
  if ((brain === 'neural' || (brain === 'knn' && id === 'trashnet-v1')) && count > 120) throw new Error('Choose at most 120 observations for this brain. Nearest Centroid can use the full training split.');
}
/** Validate before adoption/Run; a future adapter never silently becomes k-NN. */
function validate(artifact, adapters, versions) {
  // Task 082 added query visualization only; these earlier neural weights use identical
  // learning/prediction arithmetic. Accept that exact predecessor, not arbitrary versions.
  const compatibleNeural = artifact && artifact.brain === 'neural'
    && artifact.brainVersion === '8393696e05d649e9f9898ace094f5ac705357ee2c1f037fae28a0818fdb2a476';
  // 62219d72 repaired inherited-label map construction, leaving these library snapshots and
  // inference arithmetic unchanged. Only these audited predecessor/replacement pairs bypass
  // the hash check; a future adapter needs its own audit. Original identity/version and every
  // schema, state and provenance check stay intact.
  const compatibleLabelMaps = artifact && (
    (artifact.brain === 'knn' && artifact.brainVersion === '2bc04ed4cd9d5e3201bfc61d8b72b76044167a005948525b13a76851196f09a4'
      && versions.knn === '86cd1a3f6b9eea06f2d4ab37ece8c35ea3e4f6721a282b26fc890918d35ef870')
    || (artifact.brain === 'proto' && artifact.brainVersion === 'b3bbfabe8c0fb7cbb85f16ad60503ad23bd5f65cb064237e84b5e9d5db2e9c22'
      && versions.proto === '561eb99b60b1eb92cd7d9d500a229016012f2958bd33eea35b3d0f5840f8199b'));
  if (!artifact || artifact.version !== 1 || !CLASSIFIERS.includes(artifact.brain) || !adapters[artifact.brain]
      || (artifact.brainVersion !== versions[artifact.brain] && !compatibleNeural && !compatibleLabelMaps) || artifact.preprocessing !== preprocessing(artifact.dataset)
      || JSON.stringify(artifact.input) !== JSON.stringify(schema(artifact.dataset))) throw new Error('This saved model needs a different library or brain version.');
  const allowed = new Set(rows(artifact.dataset).filter((r) => r.split === 'train').map((r) => r.id));
  if (!Array.isArray(artifact.trainingIds) || !artifact.trainingIds.length || artifact.trainingIds.some((id) => !allowed.has(id)) || new Set(artifact.trainingIds).size !== artifact.trainingIds.length) throw new Error('Invalid model training provenance.');
  if (!artifact.state || typeof artifact.state !== 'object' || !artifact.options || artifact.options.k !== 3 || artifact.options.seed !== 42) throw new Error('Damaged model state or settings.');
  trainingBudget(artifact.dataset, artifact.brain, artifact.trainingIds.length);
  if (kind(artifact.dataset) === 'number') throw new Error('This saved model needs a different library or brain version.');
  const dim = isTable(artifact.dataset) ? dataset(artifact.dataset).schema.features.length + 1 : 1024; // + the level constant
  const st = artifact.state;
  const byId = new Map(rows(artifact.dataset).map((r) => [r.id,r]));
  const counts = {};
  artifact.trainingIds.forEach((id) => { const label=byId.get(id).label; counts[label]=(counts[label]||0)+1; });
  const finite = (v,n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  const classes = (v) => Array.isArray(v) && JSON.stringify(v.slice().sort()) === JSON.stringify(Object.keys(counts).sort());
  let validState = false;
  if (artifact.brain === 'proto') validState = Array.isArray(st.protos) && classes(st.protos.map((p) => p && p.label))
    && st.protos.every((p) => finite(p.vec,dim) && p.n === counts[p.label]);
  if (artifact.brain === 'knn' && st.shelves && classes(Object.keys(st.shelves))) {
    const seen = new Set();
    validState = Object.entries(st.shelves).every(([label, shelf]) => Array.isArray(shelf) && shelf.length === counts[label]
      && shelf.every((e) => { if (!e || !finite(e.vec,dim) || typeof e.id !== 'string' || seen.has(e.id)) return false;
        seen.add(e.id); return artifact.trainingIds.includes(e.id.slice(8)) && e.id.startsWith('library:') && byId.get(e.id.slice(8)).label === label; }));
  }
  if (artifact.brain === 'neural') validState = classes(st.classes) && st.dim === dim && st.hidden === 12 && st.n === artifact.trainingIds.length
    && finite(st.W1,12*dim) && finite(st.b1,12) && finite(st.W2,st.classes.length*12) && finite(st.b2,st.classes.length)
    && Number.isInteger(st.epochs) && st.epochs >= 0 && st.epochs <= 160 && finite(st.lossHistory,st.epochs) && Number.isFinite(st.loss);
  if (!validState) throw new Error('This model has damaged learned state or training provenance.');
  const probe = adapters[artifact.brain].answer(artifact.state, Array.from({length:dim}, (_,i) => i===dim-1?1:0), artifact.options);
  if (!probe || !Number.isFinite(probe.value) || !labels(artifact.dataset).includes(probe.label)) throw new Error('This model has unreadable learned state.');
  return artifact;
}
function answer(artifact, data, adapters, versions) {
  validate(artifact, adapters, versions);
  const result = adapters[artifact.brain].answer(artifact.state, vector(artifact.dataset, data), artifact.options);
  if (!result) throw new Error('The model could not read this input.');
  return result;
}
/** Validate one immutable run snapshot, then predict without scanning weights/provenance again.
 * The clone isolates a running machine from later edits to the original artifact. */
function predictor(artifact, adapters, versions) {
  const saved = clone(artifact);
  validate(saved, adapters, versions);
  const adapter = adapters[saved.brain];
  return (data) => {
    const result = adapter.answer(saved.state, vector(saved.dataset,data), saved.options);
    if (!result) throw new Error('The model could not read this input.');
    return result;
  };
}
// ---------- Photo REFERENCES on a child's own shelves (plan 2026-09-16) ----------
// A Camera Model can file Data library photos from the belt. Each photo's 1024 feature numbers
// are 21 KB of JSON and already ship with the Workshop, while localStorage holds about 5 MiB
// per origin, so a filed library photo is SAVED as {dataset, id} and its numbers come back from
// the catalogue when the machine opens. Only a crate this catalogue dealt, wearing its own
// feature stamp, becomes a reference; camera and uploaded photos keep their numbers.
const rowIndex = {};
function rowById(datasetId, id) {
  if (!rowIndex[datasetId]) rowIndex[datasetId] = new Map(rows(datasetId).map((r) => [r.id, r]));
  return rowIndex[datasetId].get(id) || null;
}
/** The catalogue row a reference names, or null (unknown dataset, unknown row, non-photo data). */
function refRow(ref) {
  if (!ref || typeof ref !== 'object' || typeof ref.dataset !== 'string' || typeof ref.id !== 'string') return null;
  try { return preprocessing(ref.dataset) === PHOTO_FEATURES ? rowById(ref.dataset, ref.id) : null; } catch (e) { return null; }
}
/** {dataset, id} for a crate the catalogue dealt with its own photo features, else null. */
function photoRef(data) {
  if (!data || data.preprocessing !== PHOTO_FEATURES) return null;
  const ref = { dataset: data.libraryDataset, id: data.libraryId };
  return refRow(ref) ? ref : null;
}
/** A copy of the loaded unit vector a reference names, or null while its features are not loaded. */
function refVector(ref) {
  const row = refRow(ref);
  return row && records.has(row.id) ? records.get(row.id).slice() : null;
}
const isBrain = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !!v.shelves
  && typeof v.shelves === 'object' && !Array.isArray(v.shelves);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function savedExample(ex) {
  const copy = Object.assign({}, ex);
  if (refRow(ex.ref)) delete copy.vec;
  return copy;
}
function savedShelves(brain) {
  const out = {};
  for (const label of Object.keys(brain.shelves)) {
    Object.defineProperty(out, label, { value: (brain.shelves[label] || []).map(savedExample), enumerable: true, writable: true, configurable: true });
  }
  for (const w of Array.isArray(brain.waiting) ? brain.waiting : []) {
    if (!own(out, w.label)) Object.defineProperty(out, w.label, { value: [], enumerable: true, writable: true, configurable: true });
    out[w.label].push(savedExample(w.ex));
  }
  for (const label of Object.keys(out)) out[label].sort((a, b) => a.id - b.id);
  return out;
}
/**
 * The value to WRITE for any saved structure (pieces, shared brains, bricks): a copy in which every
 * brain's referenced photos carry no numbers and every waiting photo is back on its shelf in id
 * order — a file has one place for examples. Never mutates its input; numeric arrays (feature
 * rows) are shared, not copied, because the writer only reads them.
 */
function shelvesForSave(value) {
  if (Array.isArray(value)) return typeof value[0] === 'number' ? value : value.map(shelvesForSave);
  if (!value || typeof value !== 'object') return value;
  const brain = isBrain(value);
  const out = {};
  for (const k of Object.keys(value)) {
    if (brain && k === 'waiting') continue;
    out[k] = brain && k === 'shelves' ? savedShelves(value) : shelvesForSave(value[k]);
  }
  return out;
}
/**
 * Every brain-shaped object anywhere in a value (pieces, bricks, a whole saved section), without
 * descending into a brain's own shelves. Numeric arrays are skipped whole. A saved library
 * model's k-NN state is brain-shaped too; its examples carry no references, so every operation
 * here leaves it unchanged.
 */
function brainsIn(value, out = []) {
  if (Array.isArray(value)) { if (typeof value[0] !== 'number') for (const v of value) brainsIn(v, out); return out; }
  if (!value || typeof value !== 'object') return out;
  if (isBrain(value)) { out.push(value); return out; }
  for (const k of Object.keys(value)) brainsIn(value[k], out);
  return out;
}
/** Park every referenced example that has no numbers on brain.waiting — it cannot vote yet. */
function detachRefs(brain) {
  if (!isBrain(brain)) return 0;
  let n = 0;
  for (const label of Object.keys(brain.shelves)) {
    const shelf = brain.shelves[label];
    if (!Array.isArray(shelf)) continue;
    const ready = [];
    for (const ex of shelf) {
      if (ex && ex.ref && !(Array.isArray(ex.vec) && ex.vec.length)) {
        (brain.waiting = Array.isArray(brain.waiting) ? brain.waiting : []).push({ label, ex });
        n += 1;
      } else ready.push(ex);
    }
    if (ready.length) brain.shelves[label] = ready;
    else delete brain.shelves[label];
  }
  return n;
}
/** File back every waiting example whose features have loaded, in id order. Returns how many. */
function attachRefs(brain) {
  if (!isBrain(brain) || !Array.isArray(brain.waiting)) return 0;
  const still = [];
  let n = 0;
  for (const w of brain.waiting) {
    const vec = refVector(w.ex.ref);
    if (!vec) { still.push(w); continue; }
    w.ex.vec = vec;
    if (!own(brain.shelves, w.label)) Object.defineProperty(brain.shelves, w.label, { value: [], enumerable: true, writable: true, configurable: true });
    brain.shelves[w.label].push(w.ex);
    n += 1;
  }
  if (n) for (const label of Object.keys(brain.shelves)) brain.shelves[label].sort((a, b) => a.id - b.id);
  if (still.length) brain.waiting = still;
  else delete brain.waiting;
  return n;
}
/** The references a brain is still waiting for. */
function waitingRefs(brain) {
  return isBrain(brain) && Array.isArray(brain.waiting) ? brain.waiting.map((w) => w.ex.ref) : [];
}
/** How many waiting references name nothing in this Workshop's catalogue (they can never load). */
function missingRefs(brain) {
  return waitingRefs(brain).filter((ref) => !refRow(ref)).length;
}
/**
 * Remove the waiting photos this catalogue cannot name (a save from a Workshop with a different
 * library) — they can never load, so the child must be able to let them go. Returns their ids.
 */
function dropMissingRefs(brain) {
  if (!isBrain(brain) || !Array.isArray(brain.waiting)) return [];
  const ids = [];
  const kept = brain.waiting.filter((w) => {
    if (refRow(w.ex.ref)) return true;
    ids.push(w.ex.id);
    return false;
  });
  if (kept.length) brain.waiting = kept;
  else delete brain.waiting;
  return ids;
}
/** Valid data bindings (one per dataset + split, ids de-duplicated) that load these references. */
function refBindings(refs) {
  const groups = new Map();
  for (const ref of refs || []) {
    const row = refRow(ref);
    if (!row) continue;
    const key = ref.dataset + '|' + row.split;
    if (!groups.has(key)) groups.set(key, { binding: { version: 1, dataset: ref.dataset, split: row.split, ids: [] }, seen: new Set() });
    const g = groups.get(key);
    if (!g.seen.has(row.id)) { g.seen.add(row.id); g.binding.ids.push(row.id); }
  }
  return [...groups.values()].map((g) => g.binding);
}
function evaluate(artifact, selected, adapters, versions) {
  validate(artifact, adapters, versions);
  const allowed = new Map(rows(artifact.dataset).filter((r) => r.split === 'test').map((r) => [r.id,r]));
  if (!selected.length || new Set(selected.map((r) => r.id)).size !== selected.length || selected.some((r) => allowed.get(r.id) !== r || artifact.trainingIds.includes(r.id))) throw new Error('Choose original, separate test observations.');
  let right = 0; const predictions = [];
  for (const r of selected) { const a = adapters[artifact.brain].answer(artifact.state, vector(artifact.dataset, input(artifact.dataset, r)), artifact.options); if (a.label === r.label) right++; predictions.push({ id:r.id, truth:r.label, guess:a.label }); }
  return { dataset: artifact.dataset, modelId: artifact.id, testIds:selected.map((r) => r.id), right, total:selected.length, predictions };
}
const ModelLibrary = { dataset, kind, isTable, nameKey, labels, rows, select, schema, preprocessing, input, vector, register, ready, featureMemory, validateData, contents, train, trainingBudget, validate, answer, predictor, evaluate, examples, clone, CLASSIFIERS, PHOTO_FEATURES,
  photoRef, refRow, refVector, shelvesForSave, brainsIn, detachRefs, attachRefs, waitingRefs, missingRefs, dropMissingRefs, refBindings };
if (typeof module !== 'undefined' && module.exports) module.exports = ModelLibrary;
if (typeof window !== 'undefined') window.WorkshopModelLibrary = ModelLibrary;
})();
