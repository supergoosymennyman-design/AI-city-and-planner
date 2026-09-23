(function () {
  'use strict';
  const clone = v => JSON.parse(JSON.stringify(v));
  const profiles = {
    knn: { control:'k', score:'votes' }, proto: { score:'similarity' },
    grouper: { control:'k', score:'similarity' }, number: { control:'k', score:'similarity' },
    line: { control:'penalty', score:'fit' }, neural: { score:'output' },
  };
  /** Open an isolated investigation. Captured examples/settings never follow a moving belt.
   * Predictions still come from the actual adapters; only query and local experiment dials vary. */
  function create(o) {
    const examples = clone(o.examples || []), original = o.frozen.vec.slice();
    const binding = o.binding ? clone(o.binding) : null, schema = o.schema ? clone(o.schema) : null;
    const initialOptions = {k:o.frozen.k, penalty:Math.max(0,Math.min(1,o.penalty||0)), degree:o.degree || 1};
    const learned = new Map();
    const testMarks=clone(o.testMarks||[]);
    const numeric = examples.some(e => String(e.label).trim() && Number.isFinite(Number(e.label)));
    // A data vector ends in a level constant before unit normalization. Recover that exact
    // representation for the rule brain, never fit raw examples against a normalized query.
    const raw = v => schema && v.length && v[v.length-1] > 0 ? v.map(x => x/v[v.length-1]) : v.slice();
    const input = s => {
      const ex = examples.find(e => String(e.id) === String(s.exampleId));
      const v = ex ? (s.brainId === 'line' && ex.raw ? ex.raw : ex.vec) : s.vec;
      return s.brainId === 'line' ? raw(v) : v.slice();
    };
    function model(s) {
      const adapter = o.adapters[binding ? binding.brain : s.brainId];
      if (!adapter) return null;
      const opts = binding ? binding.options : {...initialOptions, k:s.k, penalty:s.penalty === undefined ? initialOptions.penalty : Math.max(0,Math.min(1,s.penalty))};
      const key = adapter.id + ':' + JSON.stringify(opts);
      if (!binding && !learned.has(key)) {
        learned.set(key,adapter.learn(examples,opts));
        if (learned.size > 16) learned.delete(learned.keys().next().value);
      }
      return {adapter,opts,state:binding ? binding.state : learned.get(key)};
    }
    const dimNames = schema ? schema.features.flatMap(f=>f.options ? f.options : [f.name]).concat([o.baseWord]) : undefined;
    function answerFor(s) {
      const m=model(s);return m ? m.adapter.answer(m.state,input(s),{...m.opts,dimNames}) : null;
    }
    function planFor(s) {
      const m=model(s);if (!m || !m.adapter.view) return null;
      const q=input(s), ans=answerFor(s);
      const sameRule=s.brainId===o.frozen.brainId && m.opts.penalty===initialOptions.penalty;
      return m.adapter.view(m.state,q,ans,{...m.opts,...o.viewWords,schema,seed:1,testMarks:sameRule?testMarks:[]});
    }
    function describe(v) {
      if (!schema) return [];
      const r=raw(v), rows=[];let i=0;
      for(const f of schema.features) {
        if(f.options) {const vs=r.slice(i,i+f.options.length);const n=vs.indexOf(Math.max(...vs));rows.push({name:f.name,value:f.options[n]});i+=f.options.length;}
        else {rows.push({name:f.name,value:Number((f.min+r[i]*(f.max-f.min)).toPrecision(5))});i++;}
      }
      return i+1===r.length ? rows : [];
    }
    return {
      answerFor,planFor,
      brains:Object.values(o.adapters).map(a=>({id:a.id,name:o.brainName(a.id),disabled:(a.id==='line'||a.id==='number')&&!numeric&&!binding})),
      examples:examples.map(e=>({id:e.id,label:e.label,display:e.display,rows:describe(e.vec)})),
      inputFor:s=>({rows:describe(input(s)),dimension:input(s).length,exampleId:s.exampleId}),
      original:original, initialOptions,
    };
  }
  const api={profiles,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.WorkshopBrainLab=api;
})();
