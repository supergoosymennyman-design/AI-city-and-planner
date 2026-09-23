// src/rig/bind-scheduler.js
// The rebind schedule (task 014, spec §3 "it runs itself"): any skeleton change schedules a
// recompute; after 400 ms with no further edits the work starts in a worker; a run already in
// flight when a new edit arrives is abandoned (its worker terminated — the solve inside is
// synchronous, so that is the only way to stop it) and the newest skeleton wins. Answers for any
// run but the current one are dropped. Timers and the worker factory are injected so the Node
// suite can drive it exactly.

export const REBIND_DELAY_MS = 400;

export class BindScheduler {
  /**
   * @param {{spawn: () => {postMessage:Function, terminate:Function}, delayMs?: number,
   *   setTimer?: Function, clearTimer?: Function, onStart?: Function, onProgress?: Function,
   *   onDone?: Function, onError?: Function, onIdle?: Function}} opts
   */
  constructor(opts) {
    if (!opts || typeof opts.spawn !== 'function') throw new Error('BindScheduler needs a spawn() that returns a worker');
    this.spawn = opts.spawn;
    this.delayMs = opts.delayMs === undefined ? REBIND_DELAY_MS : opts.delayMs;
    this.setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer || ((id) => clearTimeout(id));
    this.onStart = opts.onStart || (() => {});
    this.onProgress = opts.onProgress || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.onError = opts.onError || (() => {});
    this.onIdle = opts.onIdle || (() => {});
    this.timer = null;
    this.worker = null;
    this.job = null;
    this.runId = 0;
    /** @type {'idle'|'waiting'|'running'} */
    this.state = 'idle';
  }

  /** The skeleton changed: drop any run in flight, wait, then run `makeJob()` (null = nothing to do). */
  schedule(makeJob) {
    if (typeof makeJob !== 'function') throw new Error('schedule() takes a job factory');
    this.abandon();
    if (this.timer !== null) this.clearTimer(this.timer);
    this.state = 'waiting';
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.fire(makeJob);
    }, this.delayMs);
  }

  fire(makeJob) {
    const job = makeJob();
    if (!job) {
      this.state = 'idle';
      this.onIdle();
      return;
    }
    const runId = ++this.runId;
    const worker = this.spawn();
    this.worker = worker;
    this.job = job;
    this.state = 'running';
    worker.onmessage = (event) => this.receive(runId, event.data);
    worker.onerror = (event) => this.receive(runId, { type: 'error', runId, message: (event && event.message) || 'the bending worker crashed' });
    worker.postMessage({ type: 'bind', runId, position: job.position, index: job.index, bones: job.bones, target: job.target, carried: job.carried || [] });
    this.onStart(runId);
  }

  receive(runId, data) {
    // An answer from an abandoned run (or a stray message) is dropped: the skeleton it solved is gone.
    if (!data || data.runId !== runId || runId !== this.runId || !this.worker) return;
    if (data.type === 'progress') {
      this.onProgress(data.fraction, data.stage);
      return;
    }
    const job = this.job;
    this.release();
    if (data.type === 'done') this.onDone({ skinIndex: data.skinIndex, skinWeight: data.skinWeight, stats: data.stats, carried: data.carried || [], key: job.key });
    else this.onError(String(data.message || 'the bending failed'));
  }

  /** Stop the run in flight, if any. */
  abandon() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.job = null;
    }
  }

  release() {
    this.abandon();
    this.state = 'idle';
  }

  /** Forget the pending wait and the run in flight (the skeleton was cleared). */
  cancel() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.release();
  }
}
