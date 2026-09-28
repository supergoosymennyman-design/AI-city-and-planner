import { registerWorkspaceAdapter } from './workspace.js';
const pending = new Set();
const failures = new Set();

export function commitReward(work) {
  const record = { work };
  const retry = () => {
    failures.delete(record);
    const promise = Promise.resolve().then(work).then(result => {
      if (!result?.ok) throw Error(result?.error || 'Reward could not be saved.');
      record.button?.remove(); return result;
    }).catch(error => {
      failures.add(record);
      if (typeof document !== 'undefined' && !record.button) {
        const button = document.createElement('button'); record.button = button;
        button.textContent = 'Reward not saved — Retry / 獎勵未儲存 — 重試';
        button.style.cssText = 'position:fixed;bottom:80px;left:16px;z-index:100000;min-height:44px';
        button.onclick = () => { button.disabled = true; retry().finally(() => { button.disabled = false; }); };
        document.body.append(button);
      }
      return { ok:false, error:error.message };
    }).finally(() => pending.delete(promise));
    pending.add(promise); return promise;
  };
  return retry();
}
export async function flushRewardSaves() {
  while (pending.size) await Promise.all([...pending]);
  if (failures.size) throw Error('A reward has not been saved. Press Retry before saving or leaving. / 請先重試儲存獎勵。');
}
registerWorkspaceAdapter({ flush: flushRewardSaves, capture: () => ({}), restore: async () => {}, suspend: () => {} });
if (typeof document !== 'undefined') document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || (!pending.size && !failures.size) || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
  event.preventDefault();
  flushRewardSaves().then(() => { location.href = anchor.href; }).catch(() => {});
}, true);
