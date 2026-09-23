import test from 'node:test';
import assert from 'node:assert/strict';
import { createBootOwner, createLoadQueue, withDeadline } from '../P5 Programme/buddy-kit/client/city-builder/loading-lifecycle.js';

test('bounded load queue never exceeds its concurrency and cancels pending work', async () => {
  let active = true, running = 0, peak = 0;
  const releases = [];
  const queue = createLoadQueue({ concurrency: 2, isActive: () => active });
  const jobs = Array.from({ length: 5 }, (_, i) => queue.add(async () => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => releases.push(resolve));
    running--;
    return i;
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(peak, 2);
  active = false;
  queue.cancel();
  releases.splice(0).forEach(resolve => resolve());
  assert.deepEqual(await Promise.all(jobs), [undefined, undefined, undefined, undefined, undefined]);
});

test('bounded load queue starts pending jobs by stable priority', async () => {
  const order = [], releases = [];
  const queue = createLoadQueue({ concurrency: 1 });
  const first = queue.add(async () => { order.push('running'); await new Promise(resolve => releases.push(resolve)); });
  const low = queue.add(async () => order.push('low'), { priority: 1 });
  const nearA = queue.add(async () => order.push('near-a'), { priority: 10 });
  const nearB = queue.add(async () => order.push('near-b'), { priority: 10 });
  await new Promise(resolve => setImmediate(resolve));
  releases[0]();
  await Promise.all([first, low, nearA, nearB]);
  assert.deepEqual(order, ['running', 'near-a', 'near-b', 'low']);
});

test('queue idle waits for every running and pending optional job', async () => {
  const releases = [];
  const queue = createLoadQueue({ concurrency: 1 });
  queue.add(() => new Promise(resolve => releases.push(resolve)));
  queue.add(() => new Promise(resolve => releases.push(resolve)));
  let drained = false;
  const idle = queue.whenIdle().then(() => { drained = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  releases.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  releases.shift()();
  await idle;
  assert.equal(drained, true);
});

test('bounded load queue disposes a running result that becomes stale', async () => {
  let active = true, release;
  const disposed = [];
  const queue = createLoadQueue({ concurrency: 1, isActive: () => active });
  const result = queue.add(() => new Promise(resolve => { release = () => resolve('model'); }), {
    onStale: value => disposed.push(value),
  });
  await new Promise(resolve => setImmediate(resolve));
  active = false;
  release();
  assert.equal(await result, undefined);
  assert.deepEqual(disposed, ['model']);
});

test('boot owner rejects stale callbacks and releases listeners, timers and RAFs', () => {
  const calls = [];
  const target = new EventTarget();
  let next = 1;
  const timers = new Map(), rafs = new Map();
  const env = {
    setTimeout(fn) { const id = next++; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = next++; rafs.set(id, fn); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
  };
  const owner = createBootOwner(7, env);
  owner.listen(target, 'ping', () => calls.push('listener'));
  owner.timeout(() => calls.push('timer'), 10);
  owner.raf(() => calls.push('raf'));
  const guarded = owner.guard(() => calls.push('async'));
  owner.cancel();
  target.dispatchEvent(new Event('ping'));
  guarded();
  for (const fn of timers.values()) fn();
  for (const fn of rafs.values()) fn(0);
  assert.deepEqual(calls, []);
  assert.equal(timers.size, 0);
  assert.equal(rafs.size, 0);
});

test('deadline settles a stalled task and late work cannot apply after cancellation', async () => {
  const owner = createBootOwner(1);
  let release, applied = false;
  const stalled = new Promise(resolve => { release = resolve; });
  await assert.rejects(
    withDeadline(() => stalled.then(() => { if (owner.active) applied = true; }), { owner, ms: 5, label: 'champion' }),
    { name: 'LoadDeadlineError' },
  );
  owner.cancel();
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(applied, false);
});
