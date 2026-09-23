// src/rig/tests/bind-worker.spec.js
// The worker's message handler (task 014, spec §3), driven without a Worker: the same function the
// page's worker calls on every message. A shape with no joint inside rides the nearest bone
// (owner ruling 3): it comes in as a carried part and goes back with a transferred, rigid skin.
import { handleBindMessage } from '../bind-worker.js';
import { makeTube, makeBox } from './fixtures.js';

const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

export default function (check) {
  const tube = makeTube(0.4, 4, 24, 48);
  const bones = [{ head: [0, 0, 0], tail: [0, 2, 0] }, { head: [0, 2, 0], tail: [0, 4, 0] }];

  // --- a bind message ---
  {
    const posted = [];
    handleBindMessage({ type: 'bind', runId: 7, position: tube.position, index: tube.index, bones, target: 300 }, (m, transfer) => posted.push({ m, transfer }));
    const done = posted.find((p) => p.m.type === 'done');
    const progress = posted.filter((p) => p.m.type === 'progress');
    check('worker: a bind message answers with done, carrying the run id', !!done && done.m.runId === 7 && done.m.skinIndex instanceof Uint16Array && done.m.skinWeight instanceof Float32Array && done.m.stats.reduced === true);
    check('worker: the two result buffers are transferred, not copied', !!done && done.transfer.length === 2 && done.transfer[0] === done.m.skinIndex.buffer && done.transfer[1] === done.m.skinWeight.buffer);
    check('worker: progress messages carry the run id and end at 1', progress.length > 2 && progress.every((p) => p.m.runId === 7 && typeof p.m.stage === 'string') && progress[progress.length - 1].m.fraction === 1);
    let sumErr = 0;
    const n = tube.position.length / 3;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += done.m.skinWeight[i * 4 + k];
      sumErr = Math.max(sumErr, Math.abs(s - 1));
    }
    check('worker: the weights sum to one', sumErr < 1e-5);
    check('worker: without carried parts the answer carries an empty list', !!done && Array.isArray(done.m.carried) && done.m.carried.length === 0 && done.m.stats.carried === 0);
  }

  // --- a carried part: a small box beside the top of the tube, no joint inside it ---
  {
    const box = makeBox([0.6, 2.8, -0.1], [0.9, 3.2, 0.1]); // 0.2 clear of the tube's side, level with bone 1
    const posted = [];
    handleBindMessage({ type: 'bind', runId: 8, position: tube.position, index: tube.index, bones, target: 300, carried: [{ position: box.position, index: box.index }] }, (m, transfer) => posted.push({ m, transfer }));
    const done = posted.find((p) => p.m.type === 'done');
    const ride = done && done.m.carried[0];
    let oneBone = !!ride;
    for (let i = 0; ride && i < 8; i++) oneBone = oneBone && ride.skinIndex[i * 4] === ride.stats.socket.bone && ride.skinWeight[i * 4] === 1 && ride.skinWeight[i * 4 + 1] === 0;
    check('worker: a carried part rides ONE bone at full weight — the bone its points agree on', !!ride && ride.skinIndex instanceof Uint16Array && ride.skinIndex.length === 32 && oneBone && ride.stats.rigid === true);
    check('worker: the carried skin names its bone and its gap to the body', !!ride && ride.stats.socket.bone === 1 && ride.stats.gearPoints === 8 && ride.stats.meanDistance > 0.15 && ride.stats.meanDistance < 0.6 && done.m.stats.carried === 1);
    check('worker: the carried buffers are transferred too', !!done && done.transfer.length === 4 && done.transfer[2] === ride.skinIndex.buffer && done.transfer[3] === ride.skinWeight.buffer);
    check('worker: the body\'s own answer is unchanged by a carried part', !!done && done.m.skinIndex.length === tube.position.length / 3 * 4 && near(done.m.skinWeight[0] + done.m.skinWeight[1] + done.m.skinWeight[2] + done.m.skinWeight[3], 1, 1e-5));
  }

  // --- refusals are answered, never swallowed ---
  {
    const posted = [];
    handleBindMessage({ type: 'nope', runId: 1 }, (m) => posted.push(m));
    check('worker: an unknown message is answered with an error, not silence', posted.length === 1 && posted[0].type === 'error' && posted[0].runId === 1 && /unknown message/.test(posted[0].message));
  }
  {
    const posted = [];
    handleBindMessage({ type: 'bind', runId: 2, position: tube.position, index: tube.index, bones: [], target: 300 }, (m) => posted.push(m));
    check('worker: a failing solve is reported with its reason', posted.some((m) => m.type === 'error' && m.runId === 2 && /bone/.test(m.message)) && !posted.some((m) => m.type === 'done'));
  }
}
