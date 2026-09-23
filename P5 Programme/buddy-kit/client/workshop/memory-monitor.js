(function(){
  'use strict';
  /** Local, on-demand diagnostics. Sampling stops on close; only scalar readings are retained. */
  function open(host){
    if(document.getElementById('memoryMonitor'))return;
    const t=host.t, dialog=document.createElement('dialog');dialog.id='memoryMonitor';dialog.className='ovcard library-dialog memory-monitor';
    dialog.setAttribute('aria-labelledby','memoryMonitorTitle');
    const head=document.createElement('div');head.className='ovhead';
    const title=document.createElement('h2');title.id='memoryMonitorTitle';title.textContent=t('memory.monitorTitle');
    const close=document.createElement('button');close.textContent=t('library.close');close.onclick=()=>dialog.close();head.append(title,close);
    const body=document.createElement('div');body.className='ovbody';
    const note=document.createElement('p');note.textContent=t('memory.monitorNote');body.appendChild(note);
    const table=document.createElement('table'), cells={};
    for(const key of ['heap','peak','history','features','compiled','images','rows','worker']){
      const tr=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');
      th.scope='row';th.textContent=t('memory.metric.'+key);td.dataset.metric=key;tr.append(th,td);table.appendChild(tr);cells[key]=td;
    }
    body.appendChild(table);
    const foot=document.createElement('p');foot.className='hint';foot.textContent=t('memory.monitorLocal');body.appendChild(foot);
    let peak=null, timer=null;
    const mib=n=>n===null?t('memory.unavailable'):(n/1048576).toFixed(1)+' MiB';
    function refresh(){
      if(!dialog.isConnected)return;
      const s=host.snapshot();if(s.jsHeapBytes!==null)peak=Math.max(peak||0,s.jsHeapBytes);
      cells.heap.textContent=mib(s.jsHeapBytes);cells.peak.textContent=mib(peak);
      cells.history.textContent=mib(s.historyBytes);cells.features.textContent=mib(s.library.payloadBytes)+' ('+s.library.records+')';
      cells.compiled.textContent=mib(s.compiledPayloadBytes);cells.images.textContent=mib(s.canvasPayloadBytes);
      cells.rows.textContent=String(s.retainedRows);
      cells.worker.textContent=t(s.training.workerAlive?'memory.workerAlive':'memory.workerReleased')+' · '+t('memory.queued',{n:s.training.queued});
    }
    dialog.addEventListener('close',()=>{clearInterval(timer);dialog.remove();},{once:true});
    dialog.append(head,body);document.body.appendChild(dialog);dialog.showModal();refresh();timer=setInterval(refresh,2000);close.focus();
  }
  window.WorkshopMemoryMonitor={open};
})();
