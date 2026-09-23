// src/rig/bind-worker.js
// Worker entry for the bending (task 014, spec §3). The page posts one `bind` message per run; the
// worker answers with progress, then `done` with the skin arrays transferred, or `error`.
// `handleBindMessage` is the whole behaviour, kept callable from Node.
//
// A shape with no joint inside it cannot be solved (no heat source → a singular block, the
// no-joints failure of 2026-09-20) but it can RIDE: the page sends it as a carried part and the
// worker gives it the body's weights by closest-point transfer, collapsed onto the one bone its
// points agree on — the rule proven on the cone and the helmet on 20 September (owner ruling 3).
import { bindMesh } from './bind.js';
import { transferWeights } from './transfer-weights.js';

/**
 * Handle one message from the page. `post(message, transfer)` sends a reply.
 * @param {object} data the message
 * @param {(message: object, transfer?: ArrayBuffer[]) => void} post
 */
export function handleBindMessage(data, post) {
  const runId = data && data.runId;
  if (!data || data.type !== 'bind') {
    post({ type: 'error', runId, message: `unknown message ${data && data.type}` });
    return;
  }
  try {
    const body = { position: data.position, index: data.index };
    const out = bindMesh(body, data.bones, {
      target: data.target,
      onProgress: (fraction, stage) => post({ type: 'progress', runId, fraction, stage }),
    });
    const carriedIn = Array.isArray(data.carried) ? data.carried : [];
    const carried = [];
    const transfer = [out.skinIndex.buffer, out.skinWeight.buffer];
    for (let i = 0; i < carriedIn.length; i++) {
      // The merged FINE body is the source: the transfer reads the answer already carried back to it.
      const ride = transferWeights(body, { skinIndex: out.skinIndex, skinWeight: out.skinWeight }, carriedIn[i].position, { rigid: true });
      carried.push({ skinIndex: ride.skinIndex, skinWeight: ride.skinWeight, stats: ride.stats });
      transfer.push(ride.skinIndex.buffer, ride.skinWeight.buffer);
    }
    out.stats.carried = carried.length;
    post({ type: 'done', runId, skinIndex: out.skinIndex, skinWeight: out.skinWeight, stats: out.stats, carried }, transfer);
  } catch (err) {
    post({ type: 'error', runId, message: String((err && err.stack) || err) });
  }
}

// Only a real worker has `self.postMessage` and no document; Node and the page never do.
const inWorker = typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof self.document === 'undefined';
if (inWorker) {
  self.onmessage = (event) => handleBindMessage(event.data, (message, transfer) => self.postMessage(message, transfer || []));
}
