import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, migrateEconomyFromChampion, normalizeProject, ACTIVE_PROJECT_KEY } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import { buildCapabilityV2 } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';

// --- A tiny in-memory IndexedDB sufficient for project-store.js --------------
// Real IDB is exercised in the browser harness; this proves the STORE's own
// read-compare-write logic (revision checked inside the transaction) in node.
function fakeIndexedDB() {
  const dbs = new Map();
  const value = (store, key) => store.rows.get(String(key));
  function open(name) {
    let data = dbs.get(name);
    if (!data) { data = { stores: new Map(), created: false }; dbs.set(name, data); }
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null };
    const db = {
      objectStoreNames: { contains: n => data.stores.has(n) },
      createObjectStore: (n, opts = {}) => { data.stores.set(n, { keyPath: opts.keyPath, rows: new Map() }); },
      close() {},
      transaction(names) {
        const list = Array.isArray(names) ? names : [names];
        const tx = { oncomplete: null, onerror: null, onabort: null, _ops: 0, _aborted: false, _done: false };
        const schedule = () => {
          const seen = tx._ops;
          setTimeout(() => {
            if (tx._done) return;
            if (tx._aborted) { tx._done = true; tx.onabort?.(); return; }
            if (tx._ops !== seen) { schedule(); return; }
            tx._done = true; tx.oncomplete?.();
          }, 0);
        };
        tx.abort = () => { tx._aborted = true; };
        tx.objectStore = (n) => {
          const store = data.stores.get(n);
          const issue = run => {
            tx._ops++;
            const r = { onsuccess: null, onerror: null, result: undefined };
            queueMicrotask(() => {
              try { r.result = run(); r.onsuccess?.(); }
              catch (e) { r.error = e; r.onerror?.(); }
            });
            return r;
          };
          return {
            get: key => issue(() => value(store, key) || undefined),
            getAll: () => issue(() => [...store.rows.values()]),
            put: obj => issue(() => { store.rows.set(String(obj[store.keyPath]), obj); return obj; }),
          };
        };
        for (const n of list) if (!data.stores.has(n)) throw Error(`missing store ${n}`);
        schedule();
        return tx;
      },
    };
    req.result = db;
    queueMicrotask(() => {
      if (!data.created) { data.created = true; req.onupgradeneeded?.(); }
      req.onsuccess?.();
    });
    return req;
  }
  return { open };
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}

const setup = () => {
  const savedBC = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = undefined;
  const storage = fakeStorage();
  const indexedDB = fakeIndexedDB();
  const store = () => createProjectStore({ storage, indexedDB, channelName: 'test' });
  return { storage, indexedDB, store, restore: () => { globalThis.BroadcastChannel = savedBC; } };
};

test('a new envelope wallet is empty and credits, spends, and books its reward once', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();
    assert.deepEqual(await s.readEconomy(), { version: 1, balance: 0, owned: [], transactions: [], claimed: [], evidence: {} });

    const event = { type: 'held-out-eval', scopeId: 'image-sorter', evidence: { challengeId: 'image-sorter', batch: 'normal', seed: 1 } };
    const first = await s.recordLearningEvent(event);
    assert.equal(first.ok, true);
    assert.equal(first.claimed, true);
    assert.equal(first.amount, 30);
    assert.equal((await s.readEconomy()).balance, 30);

    // The same evidence event, replayed, cannot mint twice.
    const replay = await s.recordLearningEvent(event);
    assert.equal(replay.claimed, false);
    assert.equal((await s.readEconomy()).balance, 30);

    const bought = await s.purchase('acc-visor', 'buy-1', { items: { 'acc-visor': { id: 'acc-visor', name: 'Visor', price: 20 } } });
    assert.equal(bought.purchased, true);
    const eco = await s.readEconomy();
    assert.equal(eco.balance, 10);
    assert.deepEqual(eco.owned, ['acc-visor']);
  } finally { restore(); }
});

test('a stale revision is rejected against the record read inside the transaction', async () => {
  const { store, restore } = setup();
  try {
    const a = store();
    const b = store();
    await a.openActiveProject();
    await b.openActiveProject();
    const staleRevision = (await a.openActiveProject()).revision;

    const first = await a.commitSection('city', { note: 'a' }, staleRevision);
    assert.equal(first.ok, true);

    // B still believes the old revision; A has already advanced it.
    const conflict = await b.commitSection('city', { note: 'b' }, staleRevision);
    assert.equal(conflict.conflict, true);
    assert.equal(conflict.ok, false);

    // A's write stands; B did not silently overwrite it.
    const final = await a.openActiveProject();
    assert.equal(final.projects.city.note, 'a');
  } finally { restore(); }
});

test('an envelope imports a legacy wallet exactly once', () => {
  const project = normalizeProject({ projects: {} });
  const legacy = { version: 1, balance: 120, owned: ['hat'], transactions: [] };
  const first = migrateEconomyFromChampion(project, legacy);
  assert.equal(first.migrated, true);
  assert.equal(project.economy.balance, 120);
  const second = migrateEconomyFromChampion(project, { version: 1, balance: 999, owned: [], transactions: [] });
  assert.equal(second.migrated, false);
  assert.equal(project.economy.balance, 120, 'a second import can never sum duplicate credits');
});

test('the envelope publishes, installs, and runs a skill through the store', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();
    const cap = buildCapabilityV2({
      id: 'cap-drive', name: 'Lane keeper', fields: ['left', 'centre', 'right'], labels: ['forward', 'stop'], k: 3, threshold: 0.5,
      selftest: [{ name: 'forward', input: { left: 9, centre: 9, right: 9 }, expect: { decision: 'forward' } }],
      examples: [{ label: 'forward', values: [9, 9, 9] }, { label: 'stop', values: [1, 1, 9] }],
    }).capability;
    assert.equal((await s.publishSkill(cap)).ok, true);
    assert.equal((await s.installSkill('cap-drive@1', 'host-1', { hostType: 'sorter' })).ok, true);
    const run = await s.runSkill('host-1', { left: 9, centre: 9, right: 9 });
    assert.equal(run.ok, true);
    assert.equal(run.decision, 'forward');
    const installations = await s.readInstallations();
    assert.equal(installations['host-1'].decisions.length, 1);
  } finally { restore(); }
});

test('ACTIVE_PROJECT_KEY is stable', () => {
  assert.equal(ACTIVE_PROJECT_KEY, 'passiona_active_project_v1');
});
