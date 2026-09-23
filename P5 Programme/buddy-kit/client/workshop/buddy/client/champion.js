// client/champion.js — the Recycle-Eye HOST page logic: owns the project state (via the shared
// createProjectHost executor), renders the side panel, and hands the buddy its adapter. The panel
// is HOST UI — the buddy chat knows nothing about how a project draws itself.
(function () {
  'use strict';
  const host = window.ProjectState.createProjectHost(window.Projects.recycleEye);
  const panel = document.getElementById('panel');
  function render(state) {
    panel.textContent = '';
    const h = document.createElement('h2'); h.textContent = 'Your Champion'; panel.appendChild(h);
    const acc = document.createElement('p'); acc.textContent = `Accuracy: ${state.readouts.accuracy ?? '—'}`;
    const thr = document.createElement('p'); thr.textContent = `Unsure line: ${state.params.threshold}`;
    panel.append(acc, thr);
    const ul = document.createElement('ul');
    for (const [g, ids] of Object.entries(state.slots.samples.groups)) {
      const li = document.createElement('li'); li.textContent = `${g}: ${ids.length}`; ul.appendChild(li);
    }
    panel.appendChild(ul);
  }
  host.subscribe(render);
  render(host.getState());
  window.BuddyChat.mount(document.getElementById('buddy-root'), {
    manifest: host.manifest, getState: host.getState, apply: host.apply,
  });
})();
