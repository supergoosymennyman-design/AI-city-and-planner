(function () {
  'use strict';
  // Task 081: scalar transformations, correlation and explicit memory. No DOM, I/O or eval.
  const TYPES = ['calculate', 'join', 'memory'];
  const MAX_WAITING = 64, MAX_FINISHED = 4096, MAX_FIELDS = 32;
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const scalar = v => typeof v === 'string' || Number.isFinite(v);
  const keyOK = k => typeof k === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k) && !['constructor','prototype','__proto__'].includes(k);
  /** Validate authored settings before Run; names never execute code or traverse arbitrary objects. */
  function validate(b) {
    if (b.type === 'calculate') {
      if (!['copyValue','add','subtract','multiply','divide'].includes(b.operation) || !keyOK(b.field)) throw new Error('Calculate needs an operation and a short result field name.');
      if (!['signalNumber','signalWord','measurement','derivedField','leftWord','rightWord','leftNumber','rightNumber'].includes(b.left) || !['constant','signalNumber','measurement','derivedField'].includes(b.right)) throw new Error('Choose a Calculate input field.');
      for (const side of ['left','right']) if ((side === 'left' || b.operation !== 'copyValue') && ['measurement','derivedField'].includes(b[side]) && !keyOK(b[side+'Name'])) throw new Error('Choose a short measurement or result field name.');
      if (!Number.isFinite(b.n)) throw new Error('Calculate needs a finite constant.');
    }
    if (b.type === 'join' && (!Number.isFinite(b.seconds) || b.seconds < .1 || b.seconds > 60)) throw new Error('Join waits between 0.1 and 60 seconds.');
    if (b.type === 'memory' && (typeof b.initialLabel !== 'string' || b.initialLabel.length > 80 || !Number.isFinite(b.initialValue))) throw new Error('Memory needs a starting word (up to 80 letters) and a finite number.');
  }
  /** Fresh Run state. Only authored initial values survive a new experiment. */
  function create(b) {
    return { pending:[], waiting:Object.create(null), finished:Object.create(null), finishedCount:0, processed:0, stored:{label:b.initialLabel || '',value:b.initialValue || 0}, last:null, notice:'' };
  }
  function context(sig) {
    const c = sig.data && sig.data.context;
    return c && typeof c.id === 'string' ? c : (typeof sig.flowId === 'string' ? {id:sig.flowId,truth:{label:sig.label,value:sig.value},status:'input'} : null);
  }
  /** Restricted selectors deliberately exclude reference answers, dataset labels and internal state. */
  function read(sig, path, n) {
    if (path === 'constant') return n;
    const d = sig.data || {}, c = context(sig);
    if (path === 'value' || path === 'label') {
      if (d.dataset && (!c || c.status === 'input')) throw new Error('Choose a measurement field. The source row value is its reference answer.');
      return sig[path];
    }
    const [group, name, extra] = path.split('.');
    if (extra || !keyOK(name)) throw new Error('Use value, label, constant, features.name, fields.name, left.label or right.value.');
    if (group === 'features' || group === 'fields') return d[group] && Object.hasOwn(d[group],name) ? d[group][name] : undefined;
    if (['left','right'].includes(group) && ['label','value'].includes(name)) return d.pair && d.pair[group] && d.pair[group][name];
    throw new Error('That field is not available to Calculate.');
  }
  function calculate(b, sig, n) {
    const selector = (choice,name) => ({signalNumber:'value',signalWord:'label',measurement:'features.'+name,derivedField:'fields.'+name,leftWord:'left.label',rightWord:'right.label',leftNumber:'left.value',rightNumber:'right.value',constant:'constant'})[choice] || '';
    const left = read(sig,selector(b.left,b.leftName),n); let result = left;
    if (!scalar(left)) throw new Error('Calculate is missing its first word or number.');
    if (b.operation !== 'copyValue') {
      const right = read(sig,selector(b.right,b.rightName),n);
      if (!Number.isFinite(left) || !Number.isFinite(right)) throw new Error('This calculation needs two numbers.');
      if (b.operation === 'divide' && right === 0) throw new Error('Cannot divide by zero. Change the input or constant.');
      result = b.operation === 'add' ? left+right : b.operation === 'subtract' ? left-right : b.operation === 'multiply' ? left*right : left/right;
      if (!Number.isFinite(result)) throw new Error('The calculated number is too large.');
      // Twelve significant digits keep classroom decimal arithmetic readable and repeatable.
      result = Number(result.toPrecision(12));
    }
    const data = clone(sig.data || {}), c = context(sig);
    const fields = data.fields || {};
    if (!Object.hasOwn(fields,b.field) && Object.keys(fields).length >= MAX_FIELDS) throw new Error('This item already has 32 derived fields. Reuse a field name.');
    fields[b.field] = result; data.fields = fields; data.tag = String(result);
    if (c) data.context = {...clone(c),status:['unsure','unread','error'].includes(c.status) ? c.status : 'derived'};
    return {label:String(result),value:Number.isFinite(result) ? result : 0,data,flowId:c && c.id};
  }
  function enqueue(s, port, sig) {
    if (s.pending.length >= 256) throw new Error('Too many signals reached this block at once. Slow the source down.');
    s.pending.push({port,...clone(sig)});
  }
  function finish(s,id) { s.finished[id]=true; s.finishedCount++; delete s.waiting[id]; }
  function review(s, sig, message) { s.notice=message; enqueue(s,'review',{label:message,value:0,data:sig && sig.data,flowId:sig && sig.flowId}); }
  /** ACT only: outputs queue for next tick. Inputs are copied, so branches cannot rewrite each other. */
  function act(s,b,port,sig,tick,dials) {
    s.notice='';
    if (b.type === 'memory') {
      if (port === 'read') { enqueue(s,'out',s.stored); return; }
      const next = port === 'clear' ? {label:b.initialLabel,value:b.initialValue} : {label:String(sig.label).slice(0,80),value:sig.value};
      if (!Number.isFinite(next.value)) throw new Error('Memory needs a word and a finite number.');
      if (s.stored.label !== next.label || s.stored.value !== next.value) { s.stored=next; enqueue(s,'changed',next); }
      s.last=clone(s.stored); return;
    }
    if (b.type === 'calculate') {
      try { const out=calculate(b,sig,dials.n); s.last={label:out.label,value:out.value}; s.processed++; enqueue(s,'out',out); }
      catch(e) { s.notice=e.message; enqueue(s,'error',{label:e.message,value:0}); }
      return;
    }
    const c=context(sig);
    if (!c || c.id.length > 160) { review(s,null,'Join needs readings from the same item. Use Model result or branch one Files row.'); return; }
    if (s.finished[c.id]) { s.notice='This item was already handled by Join.'; return; }
    if (!Object.hasOwn(s.waiting,c.id)) {
      if (Object.keys(s.waiting).length >= MAX_WAITING || s.finishedCount + Object.keys(s.waiting).length >= MAX_FINISHED) { review(s,sig,'Join is full. Slow the source or start a new Run.'); return; }
      s.waiting[c.id]={since:tick};
    }
    const pair=s.waiting[c.id];
    if (pair[port]) { s.notice='Join kept the first reading on this side for this item.'; return; }
    pair[port]=clone(sig);
    if (!pair.left || !pair.right) return;
    finish(s,c.id);
    const lc=context(pair.left), rc=context(pair.right);
    if (['unsure','unread','error'].includes(lc.status) || ['unsure','unread','error'].includes(rc.status)) { review(s,sig,'One model could not give a confident reading.'); return; }
    if (JSON.stringify(lc.truth) !== JSON.stringify(rc.truth)) { review(s,sig,'These branches no longer describe the same reference item.'); return; }
    const agree = pair.left.label === pair.right.label;
    const data=clone(pair.left.data || {});
    data.context={...clone(lc),status:'joined'};
    data.pair={left:{label:pair.left.label,value:pair.left.value},right:{label:pair.right.label,value:pair.right.value}};
    const out={label:agree ? pair.left.label : 'disagree',value:agree ? 1 : 0,data,flowId:c.id};
    s.last={label:out.label,value:out.value}; enqueue(s,'out',out); enqueue(s,agree?'agree':'disagree',out);
  }
  /** EMIT only; a missing counterpart is a review event, never a disagreement or fabricated result. */
  function emit(s,b,tick,dials) {
    // Drain last tick first, leaving room for up to 64 timeout notices on this tick.
    const ready=s.pending; s.pending=[];
    if (b.type === 'join') for (const [id,pair] of Object.entries(s.waiting)) {
      if (tick-pair.since >= Math.round(dials.seconds*10)) { finish(s,id); review(s,pair.left||pair.right,'The other reading did not arrive in time.'); }
    }
    const out=ready.concat(s.pending); s.pending=[]; return out;
  }
  const api={TYPES,MAX_WAITING,MAX_FINISHED,validate,create,context,calculate,act,emit};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  if (typeof window!=='undefined') window.WorkshopComposition=api;
})();
