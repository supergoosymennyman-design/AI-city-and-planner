(function () {
  'use strict';
  const L = window.WorkshopModelLibrary;
  const Loader = window.WorkshopLibraryLoader;
  /** The host owns edits/history. This panel owns selection and cancellable asset loading. */
  function open(host) {
    const t = host.t;
    const make = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
    const dialog = make('dialog'); dialog.id = 'modelLibrary'; dialog.className = 'ovcard library-dialog';
    dialog.setAttribute('aria-labelledby', 'libraryTitle');
    const header = make('div'); header.className = 'ovhead';
    const title = make('h2', t(host.dataOnly ? 'library.dataTitle' : 'library.open')); title.id = 'libraryTitle';
    const close = make('button', t('library.close')); close.onclick = () => dialog.close();
    // ? on the head (spec 2026-09-19 §4): the manual's Files card explains what this dialog does.
    if (host.help) { const help = make('button', '?'); help.className = 'help'; help.setAttribute('aria-label', t('help.button')); help.title = t('help.button'); help.onclick = () => { dialog.close(); host.help(); }; header.append(title, help, close); }
    else header.append(title, close);
    const body = make('div'); body.className = 'ovbody';
    if (host.dataOnly) body.appendChild(make('p', t('library.dataIntro')));
    const notice = make('p'); notice.id = 'libraryStatus'; notice.setAttribute('role', 'status');
    const controls = [];
    function button(text, fn, parent = body) { const b = make('button', text); b.onclick = () => { try { fn(); } catch (e) { say(e); } }; controls.push(b); parent.appendChild(b); return b; }
    function select(label, values, id) {
      const wrap = make('label', label); const s = make('select'); s.id = id;
      for (const [value, text] of values) { const o = make('option', text); o.value = value; s.appendChild(o); }
      wrap.appendChild(s); body.appendChild(wrap); controls.push(s); return s;
    }
    // A number dataset (Auto MPG) is data only: the ready-made models here are all classifiers.
    const sources = ['iris-v1', 'trashnet-v1'].concat(host.dataOnly ? ['cars-v1'] : []).map((id) => [id, t(L.nameKey(id))]);
    const source = select(t('library.data'), sources, 'libraryDataset');
    const bound = host.target && (host.target.libraryModel || host.target.libraryData);
    source.value = bound && sources.some(([id]) => id === bound.dataset) ? bound.dataset : 'iris-v1';
    // The dataset's provenance note and licence fold behind one line (spec 2026-09-19 §4).
    const about = make('details'); about.className = 'library-about'; about.appendChild(make('summary', t('library.about'))); body.appendChild(about);
    const info = make('p'); info.className = 'hint'; about.appendChild(info);
    const link = make('a', t('library.source')); link.target = '_blank'; link.rel = 'noopener'; about.appendChild(link);
    const choices = make('fieldset'); const legend = make('legend', t('library.classes')); choices.appendChild(legend); body.appendChild(choices);
    const countLabel = make('label'); const countText = document.createTextNode(t('library.count')); countLabel.appendChild(countText);
    const count = make('input'); count.id = 'libraryCount'; count.type = 'number'; count.min = 1; count.max = 3000; count.value = 10;
    countLabel.appendChild(count); controls.push(count); body.appendChild(countLabel);
    const split = select(t('library.pile'), [['train',t('library.trainPile')],['test',t('library.testPile')]], 'librarySplit');
    const previews = make('div'); previews.className = 'library-previews'; body.appendChild(previews);
    let draft = host.target && host.target.libraryModel ? L.clone(host.target.libraryModel) : null;
    let job = null;
    const chosen = () => [...choices.querySelectorAll('input:checked')].map((n) => n.value);
    const selection = (pile) => L.select(source.value, pile, chosen(), Number(count.value));
    const say = (e) => { notice.textContent = (e && e.code === 'WORKSHOP_TRAINING_FAILED' ? t('hint.trainingFailed') : e && e.message ? e.message : e) + (host.storageFailed() ? ' ' + t('library.storageFailed') : ''); };
    async function work(fn) {
      if (job) return;
      const own = {stop:false}; job = own;
      controls.forEach((c) => { c.disabled = true; }); choices.disabled = true; stop.disabled = false; stop.hidden = false;
      try { await fn(own); } catch (e) { say(e); }
      finally { if (job === own) job = null; controls.forEach((c) => { c.disabled = false; }); choices.disabled = false; stop.disabled = true; stop.hidden = true; }
    }
    const load = async (selected, own) => Loader.load(source.value, selected, own, (n,total) => say(t('library.loading',{n,total})));
    button(t('library.useData'), () => work(async (own) => {
      const selected = selection(split.value); await load(selected, own);
      if (own.stop || !dialog.isConnected) return;
      host.data({version:1, dataset:source.value, split:split.value, ids:selected.map((r) => r.id)});
      say(t('library.dataPlaced',{n:selected.length}));
    }));
    const modelInfo = make('p'); modelInfo.id = 'libraryModelInfo';
    function describe() {
      modelInfo.textContent = draft ? draft.name + ' — ' + t('library.trained',{n:draft.trainingIds.length})
        + (draft.evaluation ? ' ' + t('library.score',{right:draft.evaluation.right,total:draft.evaluation.total}) : '') : t('library.noModel');
    }
    if (!host.dataOnly) {
      const brain = select(t('library.brain'), L.CLASSIFIERS.map((id) => [id,host.brainLabel(id)]), 'libraryBrain');
      body.appendChild(make('p', t('library.neuralLimit')));
      body.appendChild(modelInfo);
      button(t('library.ready'), () => {
        draft = L.clone(host.models.models.find((m) => m.dataset === source.value)); describe();
        host.model(L.clone(draft), false); say(t('library.placed'));
      });
      button(t('library.train'), () => work(async (own) => {
        const selected = selection('train');
        L.trainingBudget(source.value, brain.value, selected.length);
        await load(selected, own); if (own.stop || !dialog.isConnected) return;
        let learned;
        if (brain.value === 'neural') {
          own.cancel = () => window.WorkshopTraining.cancel();
          learned = await window.WorkshopTraining.train('neural',L.examples(source.value,selected),{k:3,seed:42});
          if (own.stop || !dialog.isConnected) return;
        }
        draft = L.train(source.value, selected, brain.value, host.adapters, host.models.versions, t('library.myModel') + ' ' + host.brainLabel(brain.value), learned);
        describe(); say(t('library.trained',{n:selected.length}));
      }));
      button(t('library.place'), () => { if (!draft) return say(t('library.noModel')); host.model(L.clone(draft), false); say(t('library.placed')); });
      if (host.target && host.target.type === 'sense') button(t('library.replace'), () => { if (!draft) return say(t('library.noModel')); if (host.model(L.clone(draft), true) !== false) say(t('library.replaced')); else say(t('hint.connectionsCancelled')); });
      button(t('library.test'), () => work(async (own) => {
        if (!draft || draft.dataset !== source.value) throw new Error(t('library.noModel'));
        const selected = selection('test'); await load(selected, own); if (own.stop || !dialog.isConnected) return;
        draft.evaluation = L.evaluate(draft, selected, host.adapters, host.models.versions); describe();
        say(t('library.score',{right:draft.evaluation.right,total:draft.evaluation.total}));
      }));
      button(t('library.compare'), () => work(async (own) => {
        const selected = selection('test'); await load(selected, own); if (own.stop || !dialog.isConnected) return;
        const models = host.placed().filter((p) => p.libraryModel.dataset === source.value);
        if (!models.length) throw new Error(t('library.noPlaced'));
        say(models.map((p) => { const e = L.evaluate(p.libraryModel, selected, host.adapters, host.models.versions); return (p.name || p.id) + ': ' + t('library.score',{right:e.right,total:e.total}); }).join('\n'));
      }));
      body.appendChild(make('p', t('library.lifecycle')));
    }
    const stop = make('button', t('library.stop')); stop.disabled = true; stop.hidden = true; // shown only while a load runs (spec 2026-09-19 §4)
    stop.onclick = () => { if (job) { job.stop = true; if (job.cancel) job.cancel(); } }; header.insertBefore(stop, close);
    function refresh() {
      choices.querySelectorAll('label').forEach((n) => n.remove());
      const number = L.kind(source.value) === 'number';
      choices.hidden = number;
      countText.textContent = t(number ? 'library.carsCount' : 'library.count');
      for (const label of L.labels(source.value)) {
        const wrap = make('label'); const check = make('input'); check.type = 'checkbox'; check.value = label; check.checked = true;
        wrap.append(check, document.createTextNode(label)); choices.appendChild(wrap);
      }
      const all = L.rows(source.value); const training = all.filter((r) => r.split === 'train').length;
      info.textContent = t(source.value === 'iris-v1' ? 'library.irisNote' : source.value === 'cars-v1' ? 'library.carsNote' : 'library.trashNote') + ' ' + t('library.counts',{train:training,test:all.length-training});
      link.href = L.dataset(source.value).source;
      previews.textContent = '';
      if (source.value === 'trashnet-v1') for (const row of all.filter((r) => r.split === 'train').filter((_,i) => i % 400 === 0).slice(0,4)) {
        const img = make('img'); img.src = row.src; img.alt = row.label; img.loading = 'lazy';
        img.onerror = () => say(t('library.missingPhoto')); previews.appendChild(img);
      }
      if (draft && draft.dataset !== source.value) draft = null;
      describe();
    }
    source.onchange = refresh;
    dialog.append(header, body, notice);
    dialog.addEventListener('close', () => { if (job) { job.stop = true; if (job.cancel) job.cancel(); } dialog.remove(); host.closed(); });
    refresh(); document.body.appendChild(dialog); dialog.showModal(); close.focus();
  }
  window.WorkshopLibraryUI = { open };
})();
