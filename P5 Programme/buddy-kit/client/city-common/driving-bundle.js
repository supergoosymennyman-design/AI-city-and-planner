// A driving revision is one indivisible pair. Legacy .cap models remain on
// driving.js. Preparation validates and snapshots once, never in a physics step.
import '../workshop/logic/data-vector.js';
import '../workshop/logic/driving-pair-data.js';
import { classify, surenessOf } from './knn-vector.js';

const { schemas, preprocessing } = globalThis.WorkshopDrivingPairData;
const { vector } = globalThis.WorkshopDataVector;
export const DRIVING_BUNDLE_MAGIC = 'passiona.driving';
export { schemas as DRIVING_SCHEMAS };

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function predict(model, role, readings, brain = model.examples) {
  const query = vector(schemas[role], readings, true);
  const result = classify(brain, query, model.k);
  const confidence = surenessOf(result);
  return { decision: result?.label ?? null, confidence, evidence: result?.evidence || [],
    abstained: !result || confidence < model.threshold };
}

export function buildDrivingBundle({ machineId, revision, models }) {
  try {
    if (!machineId || !Number.isSafeInteger(revision) || revision < 1) throw new Error('Missing machine revision');
    const bundle = { magic: DRIVING_BUNDLE_MAGIC, version: 1, machineId, revision, models: {}, selftests: [] };
    for (const role of Object.keys(schemas)) {
      const source = models?.[role];
      if (!source?.blockId || !source.examples?.length) throw new Error('Teach both models first');
      const model = { blockId: source.blockId, schema: schemas[role], preprocessing,
        algorithm: 'knn-unit-majority-v2', k: source.k, threshold: source.threshold,
        examples: source.examples.map(ex => ({ ...ex, vec: [...ex.vec] })) };
      bundle.models[role] = model;
      // Tests carry physical readings, so schema/preprocessing parity is checked.
      for (const example of model.examples.filter(ex => ex.readings).slice(0, 12)) {
        const expected = predict(model, role, example.readings);
        bundle.selftests.push({ role, readings: example.readings, decision: expected.decision, abstained: expected.abstained });
      }
    }
    const prepared = prepareDrivingBundle(bundle);
    return prepared.ok ? { ok: true, bundle: prepared.bundle } : prepared;
  } catch (e) { return { ok: false, error: e.message }; }
}

export function prepareDrivingBundle(input) {
  try {
    const bundle = JSON.parse(JSON.stringify(input));
    if (bundle.magic !== DRIVING_BUNDLE_MAGIC || bundle.version !== 1 || !bundle.machineId || !Number.isSafeInteger(bundle.revision) || bundle.revision < 1) throw new Error('Invalid driving revision');
    for (const role of Object.keys(schemas)) {
      const m = bundle.models?.[role], schema = schemas[role];
      if (!m || !m.blockId || m.preprocessing !== preprocessing || m.algorithm !== 'knn-unit-majority-v2' || JSON.stringify(m.schema) !== JSON.stringify(schema)) throw new Error('Incompatible ' + role + ' model');
      if (!Number.isInteger(m.k) || m.k < 1 || !Number.isFinite(m.threshold) || m.threshold < 0 || m.threshold > 1 || !Array.isArray(m.examples) || !m.examples.length || m.examples.length > 20000) throw new Error('Invalid ' + role + ' classifier');
      const dimension = schema.features.reduce((n, f) => n + (f.options?.length || 1), 1);
      const ids = new Set();
      for (const ex of m.examples) {
        if (!Number.isSafeInteger(ex.id) || ids.has(ex.id) || !schema.answer.labels.includes(ex.label) || !Array.isArray(ex.vec) || ex.vec.length !== dimension || !ex.vec.every(Number.isFinite) || Math.abs(Math.hypot(...ex.vec) - 1) > 1e-6) throw new Error('Invalid learned example');
        ids.add(ex.id);
        if (ex.readings && vector(schema, ex.readings, true).some((x, i) => Math.abs(x - ex.vec[i]) > 1e-6)) throw new Error('Example preprocessing mismatch');
      }
      if (!bundle.selftests?.some(t => t.role === role)) throw new Error('Missing ' + role + ' self-tests');
    }
    for (const test of bundle.selftests) {
      if (!schemas[test.role]) throw new Error('Invalid self-test role');
      const result = predict(bundle.models[test.role], test.role, test.readings);
      if (result.decision !== test.decision || result.abstained !== test.abstained) throw new Error('Driving self-test failed');
    }
    freeze(bundle);
    const brains = {};
    for (const role of Object.keys(schemas)) {
      const shelves = Object.create(null);
      for (const example of bundle.models[role].examples) (shelves[example.label] ||= []).push(example);
      brains[role] = { shelves };
    }
    return { ok: true, bundle, decide(readings) {
      try {
        const steering = predict(bundle.models.steering, 'steering', readings, brains.steering);
        const speed = predict(bundle.models.speed, 'speed', readings, brains.speed);
        return { steering, speed, failure: steering.abstained || speed.abstained ? 'uncertain-model' : null };
      } catch { return { steering: null, speed: null, failure: 'invalid-input' }; }
    } };
  } catch (e) { return { ok: false, error: e.message }; }
}
