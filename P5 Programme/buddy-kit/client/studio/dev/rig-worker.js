// Worker for the rig check page: runs the bone-heat solve off the main thread.
import { computeHeatWeights } from '../src/rig/heat-weights.js';

self.onmessage = (event) => {
  const { position, index, bones } = event.data;
  try {
    const out = computeHeatWeights({ position, index }, bones, {
      onProgress: (fraction, stage) => self.postMessage({ type: 'progress', fraction, stage }),
    });
    self.postMessage(
      { type: 'done', skinIndex: out.skinIndex, skinWeight: out.skinWeight, stats: out.stats },
      [out.skinIndex.buffer, out.skinWeight.buffer],
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.stack) || err) });
  }
};
