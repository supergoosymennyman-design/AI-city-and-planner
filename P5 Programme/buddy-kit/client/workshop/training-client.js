(function () {
  'use strict';
  const url = new URL('training-worker.js',document.currentScript.src);
  let worker = null, active = null, seq = 0, idleTimer = null;
  const queue = [];
  const error = message => Object.assign(new Error(message),{code:'WORKSHOP_TRAINING_FAILED'});
  function fail(reason) {
    clearTimeout(idleTimer); idleTimer=null;
    if (worker) worker.terminate(); worker=null;
    const jobs = active ? [active,...queue.splice(0)] : queue.splice(0); active=null;
    for (const job of jobs) { clearTimeout(job.timer); job.reject(error(reason)); }
  }
  function pump() {
    clearTimeout(idleTimer); idleTimer=null;
    if (active) return;
    if (!queue.length) {
      // Keep the completed weights on their owning page banks, but release the worker's
      // duplicate memo and JavaScript runtime after a short batch-friendly idle window.
      if(worker) idleTimer=setTimeout(()=>{ if(!active&&!queue.length&&worker){worker.terminate();worker=null;} idleTimer=null; },5000);
      return;
    }
    active=queue.shift();
    try {
      if (!worker) {
        worker=new Worker(url);
        const ownWorker=worker;
        worker.onerror=() => { if(worker===ownWorker) fail('Training could not start. Reopen the Workshop using its web link and try again.'); };
        worker.onmessage=({data}) => {
          if (!active || data.id !== active.id) return;
          const done=active; active=null; clearTimeout(done.timer);
          if(data.error) done.reject(error(data.error)); else done.resolve(data.state);
          pump();
        };
      }
      active.timer=setTimeout(() => fail('Training took too long. Use fewer examples and try again.'),30000);
      worker.postMessage({id:active.id, examples:active.examples, options:active.options});
    } catch(e) { fail('Background training is unavailable. Open the Workshop in a supported browser using its web link.'); }
  }
  /** One worker, at most sixteen waiting models; no worker-per-model RAM multiplication. */
  function train(id, examples, options) {
    if (id !== 'neural') return Promise.reject(error('Unsupported background learner.'));
    if (queue.length >= 16) return Promise.reject(error('Too many Models are waiting to train. Try a smaller machine.'));
    return new Promise((resolve,reject) => { queue.push({id:++seq,examples,options,resolve,reject}); pump(); });
  }
  window.WorkshopTraining = { train, cancel:() => fail('Training cancelled.'), memory:()=>({workerAlive:!!worker,active:!!active,queued:queue.length}) };
  window.WorkshopLearnedState.configure(train);
  window.addEventListener('pagehide',() => fail('Workshop closed.'));
})();
