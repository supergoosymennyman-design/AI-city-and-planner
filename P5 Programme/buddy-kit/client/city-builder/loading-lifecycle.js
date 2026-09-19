// Per-boot ownership and bounded loading helpers. This module deliberately has
// no three.js dependency, so its cancellation semantics can be unit tested.

export function createBootOwner(generation, env = globalThis) {
  let active = true;
  const cleanups = new Set();
  const timeouts = new Set();
  const rafs = new Set();

  const owner = {
    generation,
    get active() { return active; },
    guard(fn) {
      return (...args) => active ? fn(...args) : undefined;
    },
    own(cleanup) {
      if (typeof cleanup !== 'function') return cleanup;
      if (!active) cleanup(); else cleanups.add(cleanup);
      return cleanup;
    },
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      owner.own(() => target.removeEventListener(type, handler, options));
      return handler;
    },
    timeout(fn, delay) {
      const id = env.setTimeout(() => {
        timeouts.delete(id);
        if (active) fn();
      }, delay);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
      env.clearTimeout(id);
    },
    defer(fn, delay = 0) {
      return owner.timeout(() => {
        if (typeof env.requestIdleCallback === 'function') {
          const id = env.requestIdleCallback(() => { if (active) fn(); }, { timeout: 1000 });
          owner.own(() => env.cancelIdleCallback?.(id));
        } else fn();
      }, delay);
    },
    raf(fn) {
      const id = env.requestAnimationFrame((time) => {
        rafs.delete(id);
        if (active) fn(time);
      });
      rafs.add(id);
      return id;
    },
    cancel() {
      if (!active) return;
      active = false;
      for (const id of timeouts) env.clearTimeout(id);
      for (const id of rafs) env.cancelAnimationFrame(id);
      timeouts.clear();
      rafs.clear();
      for (const cleanup of [...cleanups].reverse()) {
        try { cleanup(); } catch { /* best-effort teardown */ }
      }
      cleanups.clear();
    },
  };
  return owner;
}

export function createLoadQueue({ concurrency = 4, isActive = () => true } = {}) {
  const limit = Math.max(1, Math.floor(concurrency));
  const pending = [];
  let running = 0;
  let cancelled = false;

  function pump() {
    while (!cancelled && isActive() && running < limit && pending.length) {
      const job = pending.shift();
      running++;
      Promise.resolve().then(job.task).then(
        (value) => job.resolve(isActive() && !cancelled ? value : undefined),
        (error) => job.reject(error),
      ).finally(() => { running--; pump(); });
    }
    if ((cancelled || !isActive()) && pending.length) {
      for (const job of pending.splice(0)) job.resolve(undefined);
    }
  }

  return {
    add(task) {
      if (cancelled || !isActive()) return Promise.resolve(undefined);
      return new Promise((resolve, reject) => { pending.push({ task, resolve, reject }); pump(); });
    },
    cancel() { cancelled = true; pump(); },
    stats() { return { running, pending: pending.length, concurrency: limit, cancelled }; },
  };
}

// A deadline only settles the caller's wait; it cannot abort GLTFLoader's
// underlying fetch. Callers must still guard any late scene mutation with their
// boot owner/generation. Keeping that rule here makes it testable without
// three.js and avoids a stalled request holding the entry screen forever.
export function withDeadline(task, { owner, ms, label = 'load', onExpire } = {}) {
  let expired = false;
  let timer = 0;
  const deadline = new Promise((_, reject) => {
    timer = owner.timeout(() => {
      expired = true;
      onExpire?.();
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.name = 'LoadDeadlineError';
      error.stage = label;
      reject(error);
    }, ms);
  });
  const work = Promise.resolve().then(task).then(value => {
    if (expired || !owner.active) return undefined;
    return value;
  });
  return Promise.race([work, deadline]).finally(() => {
    if (timer) owner.clearTimeout(timer);
  });
}
