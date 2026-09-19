import { recoveryText } from './recovery-copy.js';
import { CF_KEYS, writeState, downloadState } from './champion-file.js';

// In-memory only. Old scene/editor writes stay suspended until the new page boots.
export let restoreActive = false;
export function restoreChampion(state, snapshot, suspend = () => {}) {
  if (restoreActive) return;
  const before = snapshot();
  restoreActive = true;
  suspend();
  const apply = () => writeState(state);
  const result = apply();
  if (result.ok) { window.location.reload(); return; }
  const tr = key => recoveryText(key, document.documentElement.lang);
  const dialog = document.createElement('dialog');
  dialog.id = 'restore-results';
  dialog.setAttribute('aria-label', tr('title'));
  dialog.style.cssText = 'max-width:560px;padding:24px;border:2px solid #46756b;border-radius:12px;background:#fff;color:#172c29;z-index:100000';
  dialog.addEventListener('cancel', e => e.preventDefault());
  const title = document.createElement('h2');
  title.textContent = tr('heading');
  const note = document.createElement('p');
  note.textContent = tr('note');
  const list = document.createElement('ul');
  const render = res => {
    list.replaceChildren();
    for (const key of Object.keys(state).filter(key => Object.hasOwn(CF_KEYS, key))) {
      const item = document.createElement('li');
      item.textContent = tr(key) + ': ' + (res.failed.includes(key) ? (tr('failed')) : (tr('restored')));
      list.append(item);
    }
  };
  render(result);
  dialog.append(title, note, list);
  const button = (id, label, action) => {
    const b = document.createElement('button');
    b.id = id; b.textContent = label; b.style.cssText = 'min-height:44px;margin:6px;padding:8px';
    b.onclick = action; dialog.append(b);
  };
  button('restore-recovery', tr('previous'), () => downloadState(before, 'Before restore'));
  button('restore-imported', tr('imported'), () => downloadState(state, 'Imported city'));
  button('restore-retry', tr('retry'), () => render(apply()));
  button('restore-continue', tr('continue'), () => window.location.reload());
  document.body.append(dialog);
  dialog.showModal();
}
