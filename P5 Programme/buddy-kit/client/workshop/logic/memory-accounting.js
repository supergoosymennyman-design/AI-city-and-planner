(function(){
  'use strict';
  /** Count primitive payload with shared objects counted once. This is deliberately NOT a heap
   * measurement: object headers, backing-store capacity, DOM, GPU and native allocations differ
   * between browsers. Never serialize the inspected graph or retain it after sampling. */
  function payloadBytes(roots) {
    const seen=new WeakSet(); let bytes=0;
    function visit(value) {
      if(typeof value==='number'){bytes+=8;return;}
      if(typeof value==='string'){bytes+=value.length*2;return;}
      if(typeof value==='boolean'){bytes+=4;return;}
      if(!value||typeof value!=='object'||seen.has(value))return;
      seen.add(value);
      if(ArrayBuffer.isView(value)){visit(value.buffer);return;}
      if(value instanceof ArrayBuffer){bytes+=value.byteLength;return;}
      if(Array.isArray(value)){for(const item of value)visit(item);return;}
      if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return;
      for(const key of Object.keys(value)){bytes+=key.length*2;visit(value[key]);}
    }
    for(const root of roots)visit(root);
    return bytes;
  }
  /** Approximate exposed JS heap only; absence is unknown, never zero RAM. */
  function heap(perf) {
    try {const n=perf&&perf.memory&&perf.memory.usedJSHeapSize;return Number.isFinite(n)&&n>0?n:null;}
    catch(e){return null;}
  }
  const api={payloadBytes,heap};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.WorkshopMemoryAccounting=api;
})();
