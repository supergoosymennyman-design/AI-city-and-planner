// ledger.js — the Passiona learning economy (pure, deterministic, testable).
//
// Three distinct forms of progress live here or beside here:
//   • City Credits  — spendable, shared across apps (THIS FILE: balance/owned).
//   • Skill stages  — demonstrated learning (not a currency; derived elsewhere).
//   • Badges        — permanent achievements with evidence cards (badges.js).
//
// Rules this file enforces (implementation plan §2):
//   • Awards come from a VERSIONED config with STABLE achievement IDs — a caller
//     never chooses a credit amount, only names the evidence event.
//   • Rewards are once-only per scope (tutorial or challenge). Duplicate events
//     are harmless: replaying an event can never mint credits twice.
//   • Failure is never penalised; repeated testing is free.
//   • Events carry EVIDENCE REFERENCES, not prose the caller invents.
//
// This module is intentionally independent of IndexedDB and of the DOM. The
// project store commits the economy it returns inside one IDB transaction, so a
// storage failure cannot leave a debit without ownership.
//
// The economy shape is a superset of the shipped Workshop/Studio economy
// (`champion-session.js`) so an envelope economy can be mirrored into the
// `ai-champion` file without the Workshop validator rejecting it.

export const ECONOMY_VERSION = 1;

/** The shipped economy fields plus the two achievement books this plan adds. */
export function emptyEconomy() {
  return { version: ECONOMY_VERSION, balance: 0, owned: [], transactions: [], claimed: [], evidence: {} };
}

const object = v => v && typeof v === 'object' && !Array.isArray(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const text = v => typeof v === 'string' && v.length > 0;

/** Accept the legacy `{version,balance,owned,transactions}` shape and add the books. */
export function normalizeEconomy(raw) {
  const e = emptyEconomy();
  if (!object(raw)) return e;
  e.version = raw.version ?? ECONOMY_VERSION;
  e.balance = raw.balance ?? 0;
  e.owned = Array.isArray(raw.owned) ? [...raw.owned] : [];
  e.transactions = Array.isArray(raw.transactions) ? [...raw.transactions] : [];
  e.claimed = Array.isArray(raw.claimed) ? [...raw.claimed] : [];
  e.evidence = object(raw.evidence) ? { ...raw.evidence } : {};
  if (raw.legacyImported) e.legacyImported = true;
  return e;
}

/** Throw on a corrupt/unsupported economy. Unknown future versions travel read-only. */
export function validateEconomy(economy) {
  if (!object(economy) || !Number.isInteger(economy.version) || economy.version < 1) {
    throw Error('Invalid economy section.');
  }
  if (economy.version !== ECONOMY_VERSION) throw Error('This economy version is read-only. Use a newer app.');
  if (!integer(economy.balance)) throw Error('Invalid credits balance.');
  if (!Array.isArray(economy.owned) || !economy.owned.every(text) || new Set(economy.owned).size !== economy.owned.length) {
    throw Error('Invalid owned items.');
  }
  if (!Array.isArray(economy.transactions) || !economy.transactions.every(t =>
    object(t) && text(t.id) && typeof t.title === 'string' && text(t.at) && integer(t.amount)
    && ['award', 'purchase', 'legacy-ownership'].includes(t.type))
    || new Set(economy.transactions.map(t => t.id)).size !== economy.transactions.length) {
    throw Error('Invalid transaction history.');
  }
  if (!Array.isArray(economy.claimed) || !economy.claimed.every(text) || new Set(economy.claimed).size !== economy.claimed.length) {
    throw Error('Invalid claimed-reward book.');
  }
  if (!object(economy.evidence)) throw Error('Invalid evidence references.');
  return economy;
}

/**
 * The single pure commit primitive — the shipped transaction rules, preserved
 * exactly so the two stores stay interchangeable. Returns a NEW economy; the
 * input is never mutated. Throws on an invalid operation.
 */
export function applyTransaction(economy, operation) {
  const e = normalizeEconomy(economy);
  validateEconomy(e);
  const op = operation;
  if (!object(op) || !text(op.id)) throw Error('A transaction ID is required.');
  const prior = e.transactions.find(t => t.id === op.id);
  if (prior) {
    if (prior.type !== op.type || prior.amount !== op.amount || prior.title !== op.title || prior.item !== op.item) {
      throw Error('Transaction ID already used for a different operation.');
    }
    return e;
  }
  if (!integer(op.amount) || !text(op.title) || op.title.length > 160) throw Error('Enter an activity title and a whole-number amount.');
  const at = op.at || new Date().toISOString();
  if (op.type === 'award') {
    if (!op.amount || !integer(e.balance + op.amount)) throw Error('Award amount must be a positive whole number within the balance limit.');
    e.balance += op.amount;
  } else if (op.type === 'purchase') {
    if (!text(op.item)) throw Error('Choose a catalog item.');
    if (e.owned.includes(op.item)) return e;
    if (e.balance < op.amount) throw Error('Not enough credits.');
    e.balance -= op.amount; e.owned.push(op.item);
  } else if (op.type === 'legacy-ownership') {
    if (e.legacyImported) return e;
    if (!Array.isArray(op.owned) || !op.owned.every(text)) throw Error('Invalid legacy ownership.');
    e.owned = [...new Set([...e.owned, ...op.owned])]; e.legacyImported = true;
  } else throw Error('Unsupported transaction.');
  const row = { id: op.id, type: op.type, amount: op.amount, title: op.title.trim(), at };
  if (op.item) row.item = op.item;
  if (op.source) row.source = op.source;
  if (op.scope) row.scope = op.scope;
  if (op.evidence) row.evidence = op.evidence;
  e.transactions.push(row);
  return e;
}

// ---------------------------------------------------------------------------
// The earning rules — a VERSIONED configuration with stable achievement IDs.
// Amounts are the initial tuning configuration; learning is never paywalled.
// ---------------------------------------------------------------------------

export const REWARD_VERSION = 1;

/**
 * Where a reward may be claimed. A reward scope is a REGISTERED id, never a
 * caller's free string: this allow-list is what stops an invented scope from
 * minting credits (implementation plan §2 / §113 / §216). `challenge` mirrors
 * `challenges.js` `CHALLENGE_IDS`; `tutorialRooms` mirrors the Academy's
 * `ROOM_ORDER`. Keep both in sync when a challenge or room is added.
 */
export const REWARD_SCOPES = Object.freeze({
  challenge: Object.freeze(['image-sorter', 'driver']),
  tutorialRooms: Object.freeze([1, 2, 3, 4]),
});

/** Evidence field types. Events carry typed REFERENCES, not caller-invented prose. */
const EVIDENCE_FIELD = Object.freeze({
  string: (v) => typeof v === 'string' && v.length > 0,
  number: (v) => Number.isFinite(v),
  positiveInteger: (v) => Number.isInteger(v) && v > 0,
  idList: (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x.length > 0),
});

export const REWARDS = Object.freeze({
  'tutorial-task':  { id: 'tutorial-task',   credits: 10, scope: 'tutorial',  title: 'Finished a tutorial task',
                      evidence: { room: 'positiveInteger' } },
  'skill-saved':    { id: 'skill-saved',     credits: 20, scope: 'challenge', title: 'Saved a runnable skill',
                      evidence: { capabilityId: 'string', key: 'string', revision: 'positiveInteger' } },
  'held-out-eval':  { id: 'held-out-eval',   credits: 30, scope: 'challenge', title: 'Ran a held-out evaluation',
                      anyOf: [{ batch: 'string', seed: 'number' }, { trackId: 'string' }] },
  'city-install':   { id: 'city-install',    credits: 40, scope: 'challenge', title: 'Installed and tested in the City',
                      evidence: { installationId: 'string' } },
  'revision-fixed': { id: 'revision-fixed',  credits: 30, scope: 'challenge', title: 'Fixed a recorded failure',
                      evidence: { fixedIds: 'idList', fromRevision: 'positiveInteger', toRevision: 'positiveInteger' } },
  'abstain-demo':   { id: 'abstain-demo',    credits: 20, scope: 'challenge', title: 'Demonstrated “not sure / ask for help”',
                      evidence: { source: 'string' } },
});

export const REWARD_CONFIG = Object.freeze({ version: REWARD_VERSION, scopes: REWARD_SCOPES, rewards: REWARDS });

/** A stable, device-independent key: one reward per (achievement, scope). */
export function claimKey(reward, scopeId) {
  if (!text(scopeId)) throw Error('A reward scope is required.');
  return `${reward.id}:${String(scopeId).slice(0, 120)}`;
}

function evidenceMatches(spec, evidence) {
  return Object.entries(spec).every(([field, kind]) => EVIDENCE_FIELD[kind]?.(evidence[field]));
}

/**
 * Evidence must be the typed references this reward declares — never a stub.
 * Any `challengeId` it names must agree with the scope it is claimed under.
 * Exported so a store can reuse the exact same gate.
 */
export function validateRewardEvidence(reward, evidence, scopeId = null) {
  const error = 'This reward needs evidence before it can be credited.';
  if (!object(evidence) || Object.keys(evidence).length === 0) return { ok: false, error };
  if (reward?.evidence && !evidenceMatches(reward.evidence, evidence)) return { ok: false, error };
  if (reward?.anyOf && !reward.anyOf.some((spec) => evidenceMatches(spec, evidence))) return { ok: false, error };
  if (evidence.challengeId != null && scopeId != null && evidence.challengeId !== scopeId) {
    return { ok: false, error: 'This evidence belongs to a different challenge.' };
  }
  return { ok: true };
}

/** A scope must be a registered challenge or a known Academy room — never invented. */
export function validateRewardScope(reward, scopeId) {
  if (reward?.scope === 'challenge') {
    return REWARD_SCOPES.challenge.includes(scopeId)
      ? { ok: true }
      : { ok: false, error: 'This reward must be claimed against a registered challenge.' };
  }
  if (reward?.scope === 'tutorial') {
    const match = /^academy-room-(\d+)$/.exec(String(scopeId));
    if (match && REWARD_SCOPES.tutorialRooms.includes(Number(match[1]))) return { ok: true };
    return { ok: false, error: 'This reward must be claimed against a registered tutorial.' };
  }
  return { ok: false, error: 'This reward has no valid scope.' };
}

/**
 * Validate one learning event and, the first time it is seen, mint its credits.
 * Replays are harmless. Extra fields on `event` are ignored.
 *
 * @param {object} economy  current economy (not mutated)
 * @param {{type:string, scopeId:string, evidence:object, id?:string}} event
 * @returns {{ok:boolean, economy:object, claimed:boolean, amount?:number, reason?:string, error?:string}}
 */
export function recordLearningEvent(economy, event, { config = REWARD_CONFIG } = {}) {
  let current;
  try { current = normalizeEconomy(economy); validateEconomy(current); }
  catch (error) { return { ok: false, economy: economy, claimed: false, error: String(error.message || error) }; }
  const type = event && event.type;
  const reward = config?.rewards?.[type];
  if (!reward) return { ok: false, economy: current, claimed: false, error: 'Unknown learning event.' };
  const scope = validateRewardScope(reward, event.scopeId);
  if (!scope.ok) return { ok: false, economy: current, claimed: false, error: scope.error };
  const evidenceCheck = validateRewardEvidence(reward, event.evidence, event.scopeId);
  if (!evidenceCheck.ok) return { ok: false, economy: current, claimed: false, error: evidenceCheck.error };
  let key;
  try { key = claimKey(reward, event.scopeId); }
  catch (error) { return { ok: false, economy: current, claimed: false, error: String(error.message || error) }; }
  if (current.claimed.includes(key)) return { ok: true, economy: current, claimed: false, reason: 'already-claimed' };
  const transactionId = `reward:${key}`;
  if (current.transactions.some(t => t.id === transactionId)) {
    // A mirrored transaction proves the reward was already paid: book it, don't re-mint.
    current.claimed.push(key); current.evidence[key] = event.evidence;
    return { ok: true, economy: current, claimed: false, reason: 'already-paid' };
  }
  let next;
  try {
    next = applyTransaction(current, {
      id: transactionId, type: 'award', amount: reward.credits, title: reward.title,
      at: event.at, source: 'learning', scope: String(event.scopeId).slice(0, 120), evidence: event.evidence,
    });
  } catch (error) { return { ok: false, economy: current, claimed: false, error: String(error.message || error) }; }
  next.claimed = [...current.claimed, key];
  next.evidence = { ...current.evidence, [key]: event.evidence };
  return { ok: true, economy: next, claimed: true, amount: reward.credits, title: reward.title, key };
}

/** Price of a catalogue item. Accepts `{items:{id:{price}}}` or an array of items. */
export function priceOf(catalogue, itemId) {
  const items = catalogue?.items;
  if (object(items) && !Array.isArray(items)) {
    const entry = items[itemId];
    return entry && Number.isFinite(entry.price) ? entry.price : null;
  }
  if (Array.isArray(items)) {
    const entry = items.find(i => i && i.id === itemId);
    return entry && Number.isFinite(entry.price) ? entry.price : null;
  }
  return null;
}

/**
 * purchaseItem — price comes from the CATALOGUE, never the caller. Idempotent by
 * ownership and by transaction ID.
 * @returns {{ok:boolean, economy:object, purchased:boolean, reason?:string, error?:string}}
 */
export function purchaseItem(economy, catalogue, itemId, transactionId, { at } = {}) {
  if (!text(itemId)) return { ok: false, economy, purchased: false, error: 'Choose an item.' };
  if (!text(transactionId)) return { ok: false, economy, purchased: false, error: 'A purchase needs a transaction ID.' };
  const price = priceOf(catalogue, itemId);
  if (!integer(price)) return { ok: false, economy, purchased: false, error: 'That item is not in the catalogue.' };
  let current;
  try { current = normalizeEconomy(economy); validateEconomy(current); }
  catch (error) { return { ok: false, economy, purchased: false, error: String(error.message || error) }; }
  if (current.owned.includes(itemId)) return { ok: true, economy: current, purchased: false, reason: 'already-owned' };
  const entry = catalogueName(catalogue, itemId);
  try {
    const next = applyTransaction(current, { id: transactionId, type: 'purchase', item: itemId, amount: price, title: entry || itemId, at });
    return { ok: true, economy: next, purchased: true, amount: price };
  } catch (error) { return { ok: false, economy: current, purchased: false, error: String(error.message || error) }; }
}

function catalogueName(catalogue, itemId) {
  const items = catalogue?.items;
  if (object(items) && !Array.isArray(items)) return items[itemId]?.name || null;
  if (Array.isArray(items)) return items.find(i => i && i.id === itemId)?.name || null;
  return null;
}
