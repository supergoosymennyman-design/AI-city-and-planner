// src/rig/tests/bind-scheduler.spec.js
// The rebind schedule (task 014, spec §3 "it runs itself"): 400 ms after the last edit, one run at
// a time, a run in flight is abandoned when a new edit arrives, the newest skeleton wins. Timers
// and workers are fakes, so the test is synchronous and exact.
import { BindScheduler, REBIND_DELAY_MS } from '../bind-scheduler.js';

function harness() {
  const timers = [];
  const workers = [];
  const events = [];
  const s = new BindScheduler({
    spawn: () => {
      const w = { posted: [], terminated: false, onmessage: null, onerror: null, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
      workers.push(w);
      return w;
    },
    setTimer: (fn, ms) => { timers.push({ fn, ms, cleared: false, fired: false }); return timers.length; },
    clearTimer: (id) => { timers[id - 1].cleared = true; },
    onStart: (runId) => events.push(`start ${runId}`),
    onProgress: (fraction, stage) => events.push(`progress ${stage} ${fraction}`),
    onDone: (r) => events.push(`done ${r.key}`),
    onError: (m) => events.push(`error ${m}`),
    onIdle: () => events.push('idle'),
  });
  const fire = () => { for (const t of timers) { if (t.cleared || t.fired) continue; t.fired = true; t.fn(); } };
  return { s, timers, workers, events, fire };
}

export default function (check) {
  const h = harness();
  const jobA = () => ({ position: new Float32Array(3), index: new Uint32Array(3), bones: [{ head: [0, 0, 0], tail: [0, 1, 0] }], target: 20000, carried: [], key: 'k1' });
  h.s.schedule(jobA);
  check('scheduler: the delay is 400 ms', REBIND_DELAY_MS === 400 && h.timers[0].ms === 400 && h.s.state === 'waiting');
  h.s.schedule(jobA);
  check('scheduler: a second edit inside the window restarts the wait', h.timers.length === 2 && h.timers[0].cleared === true && h.workers.length === 0 && h.s.state === 'waiting');
  h.fire();
  const w1 = h.workers[0];
  check('scheduler: when the wait ends one worker gets the job', h.workers.length === 1 && w1.posted.length === 1 && w1.posted[0].type === 'bind' && w1.posted[0].runId === 1 && w1.posted[0].bones.length === 1 && w1.posted[0].target === 20000 && Array.isArray(w1.posted[0].carried) && w1.posted[0].carried.length === 0 && h.s.state === 'running' && h.events.includes('start 1'));
  w1.onmessage({ data: { type: 'progress', runId: 1, fraction: 0.5, stage: 'solve' } });
  check('scheduler: progress for the current run reaches the page', h.events.includes('progress solve 0.5'));
  w1.onmessage({ data: { type: 'progress', runId: 99, fraction: 0.9, stage: 'other' } });
  check('scheduler: a message from another run is dropped', !h.events.some((e) => e.includes('other')));
  const jobB = () => ({ ...jobA(), key: 'k2' });
  h.s.schedule(jobB);
  check('scheduler: an edit during a run abandons it at once', w1.terminated === true && h.s.state === 'waiting' && h.workers.length === 1);
  h.fire();
  const w2 = h.workers[1];
  check('scheduler: the newest skeleton wins', h.workers.length === 2 && w2.posted[0].runId === 2 && h.s.state === 'running');
  w1.onmessage({ data: { type: 'done', runId: 1, skinIndex: new Uint16Array(4), skinWeight: new Float32Array(4), stats: {} } });
  check('scheduler: a late answer from the abandoned run is dropped', !h.events.some((e) => e.startsWith('done')) && h.s.state === 'running');
  w2.onmessage({ data: { type: 'done', runId: 2, skinIndex: new Uint16Array(4), skinWeight: new Float32Array(4), stats: { ms: 1 } } });
  check('scheduler: the answer for the current run is delivered and the worker released', h.events.includes('done k2') && w2.terminated === true && h.s.state === 'idle');
  h.s.schedule(jobA);
  h.fire();
  const w3 = h.workers[2];
  w3.onmessage({ data: { type: 'error', runId: 3, message: 'boom' } });
  check('scheduler: a failing solve reports the error and goes idle', h.events.includes('error boom') && w3.terminated === true && h.s.state === 'idle');
  h.s.schedule(jobA);
  h.fire();
  const w4 = h.workers[3];
  w4.onerror({ message: 'crashed' });
  check('scheduler: a worker that crashes reports too', h.events.includes('error crashed') && w4.terminated === true && h.s.state === 'idle');
  h.s.schedule(jobA);
  h.fire();
  const w5 = h.workers[4];
  h.s.schedule(jobA);
  h.s.cancel();
  check('scheduler: cancel clears the wait and stops the run', w5.terminated === true && h.timers[h.timers.length - 1].cleared === true && h.s.state === 'idle');
  h.fire();
  check('scheduler: a cancelled wait never fires', h.workers.length === 5);
  h.s.schedule(() => null);
  h.fire();
  check('scheduler: a job factory returning null runs nothing and says idle', h.workers.length === 5 && h.events.includes('idle') && h.s.state === 'idle');
  // carried parts (shapes with no joint inside, owner ruling 3) ride the message through and their skins come back
  const carriedPart = { position: new Float32Array(24), index: new Uint32Array(36) };
  h.s.schedule(() => ({ ...jobA(), carried: [carriedPart], key: 'k3' }));
  h.fire();
  const w6 = h.workers[5];
  check('scheduler: the carried parts ride the bind message', w6.posted[0].carried.length === 1 && w6.posted[0].carried[0] === carriedPart);
  const rideBack = [{ skinIndex: new Uint16Array(32), skinWeight: new Float32Array(32), stats: { socket: { bone: 0 } } }];
  const seen = [];
  h.s.onDone = (r) => seen.push(r);
  w6.onmessage({ data: { type: 'done', runId: 6, skinIndex: new Uint16Array(4), skinWeight: new Float32Array(4), stats: { carried: 1 }, carried: rideBack } });
  check('scheduler: the carried skins come back with the answer', seen.length === 1 && seen[0].key === 'k3' && seen[0].carried === rideBack && seen[0].stats.carried === 1 && h.s.state === 'idle');

  // --- an abandoned run's FAILURE is dropped too, not only its answer ---
  // receive()'s staleness guard covers 'error' and onerror exactly as it covers 'done', but only
  // the 'done' path was ever tested, so the clause could be bypassed for errors and the suite
  // stayed green. It is load-bearing: a late crash from a run the child already replaced would
  // otherwise terminate the LIVE worker and report a failure against a skeleton that is gone.
  // Each case gets its own harness, so one check cannot mask the other by leaving no live worker.
  const abandonedRun = () => {
    const g = harness();
    g.s.schedule(jobA);
    g.fire();
    const stale = g.workers[0];
    g.s.schedule(() => ({ ...jobA(), key: 'k2' }));
    g.fire();
    return { g, stale, live: g.workers[1] };
  };
  {
    const { g, stale, live } = abandonedRun();
    stale.onmessage({ data: { type: 'error', runId: 1, message: 'stale boom' } });
    check('scheduler: an error from an abandoned run is dropped',
      !g.events.some((e) => e.startsWith('error')) && live.terminated === false && g.s.state === 'running');
    live.onmessage({ data: { type: 'done', runId: 2, skinIndex: new Uint16Array(4), skinWeight: new Float32Array(4), stats: {} } });
    check('scheduler: the live run still answers after a stale failure',
      g.events.includes('done k2') && g.s.state === 'idle');
  }
  {
    const { g, stale, live } = abandonedRun();
    stale.onerror({ message: 'stale crash' });
    check('scheduler: a crash from an abandoned worker is dropped too',
      !g.events.some((e) => e.startsWith('error')) && live.terminated === false && g.s.state === 'running');
  }

  // --- a second terminal answer for the SAME run is absorbed ---
  // `!this.worker` in the guard is not redundant with the runId checks: the first delivery's
  // release() nulls `job`, so a duplicated or re-entrant 'done' for the still-current runId would
  // read `.key` off null and throw out of onmessage, where nothing catches it.
  {
    const g = harness();
    g.s.schedule(jobA);
    g.fire();
    const w = g.workers[0];
    const answer = { data: { type: 'done', runId: 1, skinIndex: new Uint16Array(4), skinWeight: new Float32Array(4), stats: {} } };
    w.onmessage(answer);
    let threw = null;
    try { w.onmessage(answer); } catch (e) { threw = e; }
    check('scheduler: a repeated answer for the same run is absorbed, not thrown',
      threw === null && g.events.filter((e) => e.startsWith('done')).length === 1 && g.s.state === 'idle');
  }
}
