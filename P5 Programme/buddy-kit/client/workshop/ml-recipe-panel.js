'use strict';
/** The Evaluator's optional ML recipe. All numbers come from frozen recipe results. */
(function () {
  function node(tag, cls, text) {
    const e = document.createElement(tag); if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text; return e;
  }
  function render(parent, deps) {
    const { ctx, history, t, fmt, recipe } = deps;
    const box = node('section', 'mlrecipe'); box.setAttribute('aria-label', t('ml.title'));
    box.appendChild(node('h3', '', t('ml.title')));
    box.appendChild(node('p', 'hint', t('ml.intro')));
    const help = node('details', 'mlhelp'); help.appendChild(node('summary', '', t('ml.help')));
    for (const key of ['steps', 'bias', 'variance', 'caution', 'selfMatch', 'lifetime']) help.appendChild(node('p', '', t('ml.' + key)));
    box.appendChild(help); parent.appendChild(box);
    if (ctx.why) { box.appendChild(node('p', 'mlnotice', t(ctx.why))); return; }
    const trials = history.trials, current = trials.filter(r => r.model === ctx.modelKey).at(-1);
    const chosen = history.selected === null ? current : trials[history.selected];
    const record = chosen || trials.at(-1);
    const controls = node('div', 'mlcontrols');
    const label = node('label', '', t('ml.k')), k = node('select', 'mlk'); k.setAttribute('aria-label', t('ml.k'));
    for (let n = 1; n <= 9; n++) { const op = node('option', '', String(n)); op.value = String(n); k.appendChild(op); }
    k.value = String(ctx.dials.k); k.addEventListener('change', () => deps.setK(Number(k.value)));
    label.appendChild(k); controls.appendChild(label);
    controls.appendChild(node('span', 'hint', t('ml.fixed', { sure: fmt(ctx.dials.sure) })));
    const check = node('button', 'primary mlcheck', t('ml.check')); check.type = 'button';
    check.disabled = trials.length >= 24; check.addEventListener('click', () => deps.check(false)); controls.appendChild(check);
    const test = node('button', 'mltest', t('ml.test')); test.type = 'button';
    test.disabled = !ctx.piles.test.length || !current || !current.results.training.metrics.complete || !current.results.validation.metrics.complete;
    test.addEventListener('click', () => deps.check(true)); controls.appendChild(test); box.appendChild(controls);
    box.appendChild(node('p', 'hint', t(ctx.piles.test.length ? 'ml.testNote' : 'ml.noTest')));
    if (trials.length >= 24) box.appendChild(node('p', 'hint', t('ml.limit')));
    const grid = node('div', 'mlresults');
    for (const pile of ['training', 'validation', 'test']) {
      const rec = pile === 'test' ? history.test : record, result = rec && rec.results[pile];
      const card = node('section', 'mlresult'); card.dataset.pile = pile;
      card.appendChild(node('h4', '', t(pile === 'test' ? 'ml.testTitle' : 'ml.' + pile)));
      card.appendChild(node('p', 'hint', t('ml.' + pile + 'Hint')));
      if (!result) card.appendChild(node('p', '', t('ml.notChecked')));
      else {
        card.dataset.current = String(rec.model === ctx.modelKey);
        card.appendChild(node('p', 'mlrecordstate', t(rec.model === ctx.modelKey ? 'ml.current' : 'ml.earlier', { k: rec.k })));
        const s = result.summary, m = result.metrics;
        const rate = x => x === null ? t('panel.evalUnavailable') : fmt(x * 100) + '%';
        card.appendChild(node('p', 'mlcount', t('ml.count', { right: s.right, n: s.scorable })));
        card.appendChild(node('p', 'mlerror', t('ml.error', { wrong: s.wrong, n: s.answered, rate: rate(m.error) })));
        card.appendChild(node('p', 'mlall', t('ml.all', { n: s.scorable - s.right, total: s.scorable, rate: rate(m.notCorrect) })));
        card.appendChild(node('p', 'hint', t('ml.breakdown', { ...s, coverage: rate(s.coverage) })));
        if (!m.complete) card.appendChild(node('p', 'mlnotice', t('ml.incomplete')));
        const details = node('details', 'mlpredictions'); details.appendChild(node('summary', '', t('ml.inspect')));
        for (const out of result.outcomes) details.appendChild(node('p', 'mlprediction', t('ml.prediction', { id: out.id,
          reference: out.reference.present ? out.reference.value : t('ml.noReference'),
          guess: out.status === 'answered' ? String(out.guess) : t('verdict.' + out.verdict), verdict: t('verdict.' + out.verdict) })));
        details.addEventListener('toggle', () => {
          if (!details.open || details.dataset.photos || !window.WorkshopLibraryLoader) return;
          details.dataset.photos = '1';
          result.outcomes.forEach((out, i) => {
            const photo = node('canvas', 'mlphoto'); photo.width = 96; photo.height = 96;
            photo.setAttribute('role', 'img'); photo.setAttribute('aria-label', out.id);
            details.querySelectorAll('.mlprediction')[i].prepend(photo);
            const draw = img => { if (photo.isConnected) photo.getContext('2d').drawImage(img, 0, 0, 96, 96); };
            const img = window.WorkshopLibraryLoader.thumbnail('library:' + out.id, draw);
            if (img) draw(img);
          });
        });
        card.appendChild(details);
      }
      grid.appendChild(card);
    }
    box.appendChild(grid);
    if (!trials.length) return;
    const historyBox = node('div', 'mlhistory'); historyBox.appendChild(node('h4', '', t('ml.trials')));
    trials.forEach((trial, index) => {
      const b = node('button', 'mltrial', t('ml.trial', { n: index + 1, k: trial.k })); b.type = 'button';
      b.setAttribute('aria-pressed', String(trial === record)); b.addEventListener('click', () => deps.select(index)); historyBox.appendChild(b);
    });
    if (trials.some(r => r.experiment !== ctx.experiment)) historyBox.appendChild(node('p', 'hint', t('ml.separate')));
    const pts = recipe.points(trials, ctx.experiment);
    if (pts.length) {
      const canvas = node('canvas', 'mlchart'); canvas.width = 600; canvas.height = 240;
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', t('ml.chart'));
      const c = canvas.getContext('2d'), x = v => 48 + (v - 1) * 62, y = v => 192 - v * 160;
      c.fillStyle = '#10232b'; c.fillRect(0, 0, 600, 240); c.font = '12px sans-serif';
      for (const v of [0, .5, 1]) {
        c.fillStyle = '#dce8e9'; c.fillText(v * 100 + '%', 8, y(v) + 4);
        c.strokeStyle = '#486069'; c.beginPath(); c.moveTo(44, y(v)); c.lineTo(552, y(v)); c.stroke();
      }
      for (let n = 1; n <= 9; n++) { c.fillStyle = '#dce8e9'; c.fillText(String(n), x(n) - 3, 214); }
      for (const [pile, colour] of [['training', '#8ae3c3'], ['validation', '#ffbd7d']]) {
        const series = pts.filter(p => p.pile === pile).sort((a, b) => a.x - b.x || a.trial - b.trial);
        c.strokeStyle = colour; c.fillStyle = colour; c.lineWidth = 2; c.beginPath();
        series.forEach((p, i) => i ? c.lineTo(x(p.x), y(p.y)) : c.moveTo(x(p.x), y(p.y))); c.stroke();
        for (const p of series) { c.beginPath(); c.arc(x(p.x), y(p.y), 4, 0, Math.PI * 2); c.fill(); }
      }
      historyBox.appendChild(canvas); historyBox.appendChild(node('p', 'hint', t('ml.chart')));
      // Every dot also has an accessible table value and an inspectable trial button.
      const table = node('table', 'mlpoints'), head = node('tr');
      for (const key of ['ml.trials', 'ml.k', 'ml.training', 'ml.validation']) { const th = node('th', '', t(key)); th.scope = 'col'; head.appendChild(th); }
      table.appendChild(head);
      trials.forEach((trial, i) => {
        const a = pts.find(p => p.trial === i && p.pile === 'training'), b = pts.find(p => p.trial === i && p.pile === 'validation');
        if (!a || !b) return;
        const row = node('tr');
        for (const value of [String(i + 1), String(trial.k), fmt(a.y * 100) + '%', fmt(b.y * 100) + '%']) row.appendChild(node('td', '', value));
        table.appendChild(row);
      });
      historyBox.appendChild(table);
    }
    box.appendChild(historyBox);
  }
  window.WorkshopMLRecipePanel = { render };
})();
