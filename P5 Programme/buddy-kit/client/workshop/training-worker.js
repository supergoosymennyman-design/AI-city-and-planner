// Classic worker: adapter bytes and training arithmetic are identical to the classroom kit.
self.window = self;
importScripts('brains/neural.js');
self.onmessage = function (event) {
  const { id, examples, options } = event.data;
  try { self.postMessage({ id, state:self.BrainAdapter_neural.learn(examples,options) }); }
  catch (e) { self.postMessage({ id, error:String(e.message || e) }); }
};
