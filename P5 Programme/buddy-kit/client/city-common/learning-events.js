// learning-events.js — the one door an app uses to report demonstrated work.
//
// Apps never mint credits themselves: they name a learning EVENT (with evidence)
// and this module hands it to the shared envelope wallet, where the versioned
// reward config decides the amount and the ledger refuses duplicates. The call
// is fire-and-forget: a missing IndexedDB never breaks the lesson.
//
// It is the same module for ES-module apps (Academy, Market, City) and, via the
// `window.PassionaLearning` shim it installs, for the classic-script Workshop.
import { createProjectStore } from './project-store.js';
import { REWARD_CONFIG } from './ledger.js';

export const LEARNING_EVENT = 'passiona:learning-event';

let storePromise = null;
function walletStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const store = createProjectStore();
      await store.openActiveProject();
      return store;
    })().catch(() => null);
  }
  return storePromise;
}

/**
 * Report demonstrated work. Idempotent: replaying the same (type, scopeId)
 * cannot mint credits twice, so callers may call it freely.
 * @returns {Promise<{ok:boolean, claimed?:boolean, amount?:number, reason?:string, error?:string}>}
 */
export async function awardLearningEvent(event) {
  const store = await walletStore();
  if (!store) return { ok: false, error: 'The shared wallet is unavailable.' };
  try {
    const result = await store.recordLearningEvent(event);
    announce(result, event);
    return result;
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

/** Convenience wrapper: award('tutorial-task', 'academy-room-1', { room: 1 }). */
export function award(type, scopeId, evidence) {
  return awardLearningEvent({ type, scopeId, evidence });
}

export async function readWallet() {
  const store = await walletStore();
  if (!store) return null;
  try { return await store.readEconomy(); } catch { return null; }
}

/** The versioned rules, so an app can label a task without hard-coding credits. */
export function rewardFor(type) { return REWARD_CONFIG.rewards[type] || null; }

function announce(result, event) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent(LEARNING_EVENT, {
      detail: { type: event?.type, scopeId: event?.scopeId, claimed: !!result?.claimed, amount: result?.amount || 0 },
    }));
  } catch { /* notification is optional */ }
}

// Classic-script bridge (the Workshop loads no ES modules directly).
if (typeof window !== 'undefined') {
  window.PassionaLearning = Object.freeze({
    award: awardLearningEvent,
    report: award,
    wallet: readWallet,
    rewardFor,
    config: REWARD_CONFIG,
  });
}
