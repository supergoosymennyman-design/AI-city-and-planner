// client/mock-project.js — the Reflex-Wiring MOCK HOST page: a presentable "future project app"
// course editor the team can click through. Owns project state via the shared createProjectHost
// executor (the same engine champion.js/Recycle-Eye uses), builds its ENTIRE UI from JS (no static
// markup in mock-project.html beyond the root div — same DOM-building idiom as buddy.js/champion.js
// so the game/tool works over file:// with zero fetches), and wires the child's OWN direct controls
// (slider / add-rule / remove-rule / try-course) straight to host.apply() — no [Do it] card for
// these; a card is only for a BUDDY-PROPOSED action arriving through the chat widget (see buddy.js
// addActions). Finally mounts BuddyWidget as a floating bubble, sharing the SAME host.apply so its
// undo history stays coherent with whatever the child already did by hand.
(function () {
  'use strict';
  // Inlined for file:// parity (zero fetches) — this PAGE's own strings; unrelated to buddy.js's
  // STRINGS dict (the chat core's own copy, reached only through the mounted widget's window.T).
  const STRINGS = {
    'app.title': 'Reflex Wiring',
    'app.tagline': 'Wire your champion\'s if-then reflexes, then send it down the course.',
    'course.heading': 'The course',
    'hazard.wall': 'Wall',
    'hazard.mud': 'Mud',
    'hazard.gap': 'Gap',
    'hazard.dark': 'Dark',
    'speed.label': 'Reaction speed',
    'speed.hint': 'A slower reaction misses more hazards on the course.',
    'rules.heading': 'Reflex rules',
    'rules.empty': 'No rules yet — add one below.',
    'rules.removeLabel': 'Remove rule: ',
    'add.placeholder': 'if … then …',
    'add.button': 'Add rule',
    'add.duplicate': 'You already have that reflex!',
    'apply.failed': 'Hmm, that didn\'t work — nothing changed.',
    'try.button': 'Try the course',
    'result.heading': 'Course result',
  };
  const t = (k) => STRINGS[k] || k;
  const HAZARDS = ['wall', 'mud', 'gap', 'dark'];
  const MAX_RULE_LEN = 40; // mirrors action-schema.js's isName cap — kept in sync at the input, not just enforced server-side

  const host = window.ProjectState.createProjectHost(window.Projects.reflexWiring);
  const root = document.getElementById('rw-app');

  const el = (tag, cls, attrs) => { const n = document.createElement(tag); if (cls) n.className = cls; for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); return n; };

  // ── Build the page shell ONCE; render() below only ever repaints values (the rules <ul> is the
  // one part rebuilt every time — its length changes on every add/remove). ─────────────────────────
  const header = el('header', 'rw-header');
  const h1 = el('h1'); h1.textContent = t('app.title');
  const tagline = el('p', 'rw-tagline'); tagline.textContent = t('app.tagline');
  header.append(h1, tagline);

  const courseSection = el('section', 'rw-course');
  const courseHeading = el('h2'); courseHeading.textContent = t('course.heading');
  const track = el('div', 'rw-track');
  for (const hazard of HAZARDS) {
    const tile = el('div', `rw-tile rw-tile-${hazard}`);
    const art = el('div', 'rw-tile-art', { 'aria-hidden': 'true' });
    const label = el('span', 'rw-tile-label'); label.textContent = t(`hazard.${hazard}`);
    tile.append(art, label);
    track.appendChild(tile);
  }
  courseSection.append(courseHeading, track);

  const speedSection = el('section', 'rw-panel rw-speed');
  const speedLabel = el('label', 'rw-speed-label', { for: 'rw-speed' }); speedLabel.textContent = t('speed.label');
  const speedRow = el('div', 'rw-speed-row');
  const speedInput = el('input', 'rw-speed-input', { type: 'range', min: '0', max: '5', step: '0.5', id: 'rw-speed' });
  const speedValue = el('output', 'rw-speed-value', { for: 'rw-speed' });
  speedRow.append(speedInput, speedValue);
  const speedHint = el('p', 'rw-hint'); speedHint.textContent = t('speed.hint');
  speedSection.append(speedLabel, speedRow, speedHint);

  const rulesSection = el('section', 'rw-panel rw-rules');
  const rulesHeading = el('h2'); rulesHeading.textContent = t('rules.heading');
  const rulesList = el('ul', 'rw-rules-list');
  const addForm = el('form', 'rw-add-form');
  const addInput = el('input', 'rw-add-input', {
    type: 'text', maxlength: String(MAX_RULE_LEN), autocomplete: 'off', required: 'required',
    placeholder: t('add.placeholder'), 'aria-label': t('add.button'),
  });
  const addButton = el('button', 'rw-add-button', { type: 'submit' }); addButton.textContent = t('add.button');
  addForm.append(addInput, addButton);
  // Feedback line for the child's OWN controls: host.apply() reports {ok,note} and applyAction's
  // addItems silently de-dupes — without this line a duplicate rule (or any failed apply) would
  // clear the input and LOOK accepted while changing nothing (silent no-op = kid-UX dead end).
  const formStatus = el('p', 'rw-form-status', { 'aria-live': 'polite' });
  rulesSection.append(rulesHeading, rulesList, addForm, formStatus);
  const setStatus = (msg) => { formStatus.textContent = msg; };

  // Full-width action bar (like the course strip): the primary CTA reads better spanning the
  // whole shell than boxed into the narrower side column — see mock-project.css's `.rw-run`.
  const runSection = el('section', 'rw-panel rw-run');
  const tryButton = el('button', 'rw-try-button', { type: 'button' }); tryButton.textContent = t('try.button');
  const resultGroup = el('div', 'rw-run-result');
  const resultLabel = el('span', 'rw-result-label', { id: 'rw-result-label' }); resultLabel.textContent = t('result.heading');
  const resultValue = el('p', 'rw-result', { 'aria-live': 'polite', 'aria-labelledby': 'rw-result-label' });
  resultGroup.append(resultLabel, resultValue);
  runSection.append(tryButton, resultGroup);

  const main = el('main', 'rw-main');
  main.append(courseSection, rulesSection, speedSection, runSection);

  const shell = el('div', 'rw-shell');
  shell.append(header, main);
  root.appendChild(shell);

  /** @param {string} result raw courseResult readout ('not tried yet' or 'cleared N/8 gates'). */
  function tierFor(result) {
    const m = /cleared (\d+)\/8 gates/.exec(result);
    if (!m) return 'idle';
    const n = Number(m[1]);
    if (n >= 7) return 'great';
    if (n >= 4) return 'ok';
    return 'low';
  }

  /**
   * Repaints every value from the host's current state. The rules <ul> is cleared + rebuilt in
   * full each time (same "clear and rebuild" idiom as client/champion.js's panel render) — cheap
   * for a handful of short strings, and simplest to keep correct across add/remove/undo alike.
   * @param {object} state
   */
  function render(state) {
    const delay = state.params.reactionDelay;
    speedInput.value = String(delay);
    speedValue.textContent = `${delay}s`;

    rulesList.textContent = '';
    const rules = (state.slots.rules && state.slots.rules.items) || [];
    if (!rules.length) {
      const li = el('li', 'rw-rule-empty'); li.textContent = t('rules.empty'); rulesList.appendChild(li);
    }
    for (const rule of rules) {
      const li = el('li', 'rw-rule');
      const text = el('span', 'rw-rule-text'); text.textContent = rule;
      const remove = el('button', 'rw-rule-remove', { type: 'button', 'aria-label': `${t('rules.removeLabel')}${rule}` });
      remove.textContent = '×';
      remove.onclick = () => applyOrExplain({ op: 'removeItems', slot: 'rules', ids: [rule] });
      li.append(text, remove);
      rulesList.appendChild(li);
    }

    const result = state.readouts.courseResult || '';
    resultValue.textContent = result;
    resultValue.dataset.tier = tierFor(result);
  }

  // ── The child's OWN direct manipulation — every control below calls host.apply() straight away
  // (no [Do it]/[No] card; cards are for buddy-PROPOSED actions arriving via the chat widget).
  // Every call checks the {ok} result: a failed apply never notifies subscribers, so on failure we
  // surface the status line AND re-render from the host so a stale control (e.g. the slider) snaps
  // back to the real state instead of lying. ──────────────────────────────────────────────────────
  const applyOrExplain = (action) => {
    const res = host.apply(action);
    if (res.ok) { setStatus(''); return true; }
    setStatus(t('apply.failed'));
    render(host.getState());
    return false;
  };
  speedInput.addEventListener('input', () => {
    applyOrExplain({ op: 'setParam', name: 'reactionDelay', value: Number(speedInput.value) });
  });
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = addInput.value.trim().slice(0, MAX_RULE_LEN);
    if (!text) return; // whitespace-only submission — `required` already blocks a fully empty one
    // applyAction's addItems de-dupes silently (returns ok:true, changes nothing) — catch the
    // duplicate HERE so the child hears "already have it" instead of a convincing-looking no-op.
    const existing = (host.getState().slots.rules || {}).items || [];
    if (existing.includes(text)) { setStatus(t('add.duplicate')); addInput.focus(); return; }
    if (!applyOrExplain({ op: 'addItems', slot: 'rules', ids: [text] })) return;
    addInput.value = '';
    addInput.focus();
  });
  tryButton.addEventListener('click', () => applyOrExplain({ op: 'runCheck', name: 'testRun' }));

  host.subscribe(render);
  render(host.getState());

  // The bubble shares the SAME host.apply/getState the direct controls use above, so a buddy-
  // approved [Do it] card and the child's own slider/rule edits push onto ONE coherent undo stack.
  window.BuddyWidget.mount({ manifest: host.manifest, getState: host.getState, apply: host.apply });
})();
