// capability-export.js — build a `.cap` v2 bundle from a trained example set.
//
// PURE and deterministic. The Workshop's export side and its tests use this to
// emit an immutable, data-only capability the City can run without the Workshop
// open (see docs/capability-bridge.md). The stored vectors are transformed the
// SAME way the runtime transforms an incoming event — optional bias constant,
// then unit-normalize — so `knn-unit-majority-v2` reproduces the Workshop's
// decisions exactly.
//
// The bundle carries no executable code. Amounts, labels and mappings are data.
import { CAP_MAGIC, CAP_SPEC_VERSION_2, CAP_ALGORITHM_V2, CAP_ABSTAIN } from './cap-runtime.js';
import { unitVec } from './knn-vector.js';

const encodeFloat32 = (rows, dim) => {
  const buf = new ArrayBuffer(rows.length * dim * 4);
  const dv = new DataView(buf);
  rows.forEach((row, i) => row.forEach((v, j) => dv.setFloat32((i * dim + j) * 4, v, true)));
  return bytesToBase64(new Uint8Array(buf));
};
const encodeUint16 = (values) => {
  const buf = new ArrayBuffer(values.length * 2);
  const dv = new DataView(buf);
  values.forEach((v, i) => dv.setUint16(i * 2, v, true));
  return bytesToBase64(new Uint8Array(buf));
};
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

/**
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.name
 * @param {string[]} spec.fields              field names, in order
 * @param {string[]} spec.labels              output label set
 * @param {Array<{label:string, values:number[], display?:object}>} spec.examples study examples (raw field values)
 * @param {number} [spec.k]
 * @param {number} spec.threshold             sure-line threshold (0..1)
 * @param {number} [spec.plusConstant]        bias appended before unit-normalize (0 = none)
 * @param {object} [spec.evaluation]
 * @param {object} [spec.evidence]
 * @param {object} [spec.city]
 * @param {Array}  [spec.selftest]
 * @param {object} [spec.workshop]
 * @param {number} [spec.revision]
 * @returns {{ok:true, capability}|{ok:false,error}}
 */
export function buildCapabilityV2(spec = {}) {
  const { id, name, fields, labels, examples } = spec;
  if (!id || !name) return { ok: false, error: 'A capability needs an id and a name.' };
  if (!Array.isArray(fields) || !fields.length) return { ok: false, error: 'A capability needs at least one input field.' };
  if (!Array.isArray(labels) || labels.length < 2) return { ok: false, error: 'A classifier needs at least two labels.' };
  if (!Array.isArray(examples) || !examples.length) return { ok: false, error: 'A capability needs study examples.' };
  const bias = Number.isFinite(spec.plusConstant) ? spec.plusConstant : 0;
  const dim = fields.length + (bias ? 1 : 0);
  const rows = [];
  const indices = [];
  for (const ex of examples) {
    if (!labels.includes(ex.label)) return { ok: false, error: `Example label "${ex.label}" is not in the label set.` };
    if (!Array.isArray(ex.values) || ex.values.length !== fields.length || !ex.values.every(Number.isFinite)) {
      return { ok: false, error: 'Every example needs one finite value per input field.' };
    }
    const raw = bias ? [...ex.values, bias] : [...ex.values];
    rows.push(unitVec(raw));
    indices.push(labels.indexOf(ex.label));
  }
  const threshold = Number.isFinite(spec.threshold) ? spec.threshold : 0.5;
  const k = Number.isInteger(spec.k) && spec.k > 0 ? spec.k : 3;
  const capability = {
    magic: CAP_MAGIC,
    specVersion: CAP_SPEC_VERSION_2,
    kind: 'classifier',
    id,
    revision: spec.revision || 1,
    name,
    createdAt: spec.createdAt || null,
    workshop: spec.workshop || {},
    input: {
      kind: 'vector',
      fields: fields.map((f) => (typeof f === 'string' ? { name: f, type: 'float32', required: true } : f)),
      plusConstant: bias,
      normalization: 'unit',
    },
    output: { kind: 'label', labels: [...labels], abstainLabel: CAP_ABSTAIN },
    model: {
      algorithm: CAP_ALGORITHM_V2,
      k,
      threshold,
      tiePolicy: spec.tiePolicy || 'nearest',
      plusConstant: bias,
      vectors: { dtype: 'float32le', count: rows.length, dim, data_b64: encodeFloat32(rows, dim) },
      labels: { dtype: 'uint16le', count: indices.length, data_b64: encodeUint16(indices) },
    },
    evaluation: spec.evaluation || { scores: {} },
    evidence: spec.evidence || examples.map((ex, i) => ({ index: i, label: ex.label, display: ex.display || null })),
    selftest: { cases: spec.selftest || [] },
    city: spec.city || {},
  };
  return { ok: true, capability };
}
