import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, createProject, migrateEconomyFromChampion, normalizeProject, applyChallengeOutcome, ACTIVE_PROJECT_KEY } from '../P5 Programme/buddy-kit/client/city-common/project-store.js';
import { buildCapabilityV2, buildDriveCapability } from '../P5 Programme/buddy-kit/client/city-common/capability-export.js';
import { publishCapability, installSkill } from '../P5 Programme/buddy-kit/client/city-common/skill-registry.js';

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

test('applyChallengeOutcome is pure, existence-checked, and gates abstain-demo on a correct answer', () => {
  const project = createProject('Pure');
  const cap = buildDriveCapability({
    id: 'cap_drive-knn', name: 'Drive', k: 1, threshold: 0.5,
    examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
  }).capability;
  publishCapability(project, cap);
  installSkill(project, 'cap_drive-knn@1', 'host-car', { hostType: 'driver' });
  const snapshot = JSON.stringify(project);

  // Held-out evidence mints, and the input project is never mutated (pure).
  const held = applyChallengeOutcome(project, 'driver',
    { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: [] },
    [{ type: 'held-out-eval', evidence: { trackId: 'full' } }]);
  assert.deepEqual(held.claimed.map((c) => c.type), ['held-out-eval']);
  assert.equal(held.project.economy.balance, 30);
  assert.equal(JSON.stringify(project), snapshot, 'applyChallengeOutcome must not mutate its input');

  // Abstaining without a single correct answer is not an honest "not sure" demo.
  const noCorrect = applyChallengeOutcome(project, 'driver',
    { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: ['goal'], abstained: 2, correctCount: 0 },
    [{ type: 'abstain-demo', evidence: { source: 'test-track' } }]);
  assert.deepEqual(noCorrect.claimed, []);

  // The same abstention WITH a correct answer in the run does mint.
  const withCorrect = applyChallengeOutcome(project, 'driver',
    { revision: 2, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: [], abstained: 1, correctCount: 1 },
    [{ type: 'abstain-demo', evidence: { source: 'test-track' } }]);
  assert.deepEqual(withCorrect.claimed.map((c) => c.type), ['abstain-demo']);

  // A recycling-style batch derives its correct count from the results.
  const derived = applyChallengeOutcome(project, 'driver',
    { revision: 1, scenario: { kind: 'normal', seed: 1 }, abstained: 1, results: [
      { id: 'a', decision: 'forward', truth: 'forward' }, { id: 'b', abstained: true } ] },
    [{ type: 'abstain-demo', evidence: { source: 'recycling' } }]);
  assert.deepEqual(derived.claimed.map((c) => c.type), ['abstain-demo']);
});

test('skill-saved and tutorial-task require the envelope to back them', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();

    // A fabricated skill-saved ref cannot mint: nothing is published under it.
    const fabricated = await s.recordSkillSaved('cap_nope@1');
    assert.equal(fabricated.ok, false);
    assert.equal((await s.readEconomy()).balance, 0);

    // An UNCOMPLETED room cannot mint its tutorial task.
    const early = await s.recordTutorialTask(1);
    assert.equal(early.ok, false);
    assert.equal((await s.readEconomy()).balance, 0);

    // Once the room is marked complete in the envelope, the task records once.
    assert.equal((await s.markTutorialRoom(1)).ok, true);
    const task = await s.recordTutorialTask(1);
    assert.equal(task.ok, true);
    assert.equal(task.claimed, true);
    assert.equal(task.amount, 10);
    assert.equal((await s.readEconomy()).balance, 10);
    const replay = await s.recordTutorialTask(1);
    assert.equal(replay.claimed, false);
    assert.equal((await s.readEconomy()).balance, 10);

    // A really published capability backs skill-saved, scoped to its challenge.
    const cap = buildDriveCapability({
      id: 'cap_drive-knn', name: 'Drive', k: 1, threshold: 0.5,
      examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
    }).capability;
    await s.publishSkill(cap);
    const saved = await s.recordSkillSaved('cap_drive-knn@1');
    assert.equal(saved.ok, true);
    assert.equal(saved.claimed, true);
    assert.equal(saved.amount, 20);
    assert.equal(saved.challengeId, 'driver');
    assert.equal((await s.readEconomy()).balance, 30);

    const evidence = (await s.readEconomy()).evidence;
    const key = Object.keys(evidence).find((k) => k.startsWith('skill-saved:'));
    assert.equal(evidence[key].capabilityId, 'cap_drive-knn');
    assert.equal(evidence[key].revision, 1);
  } finally { restore(); }
});

test('recordChallengeOutcome refuses evidence the envelope cannot back', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();
    // Nothing published, installed, or abstained: every event is refused.
    const empty = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: [], wrongIds: [] },
      [{ type: 'held-out-eval', evidence: { trackId: 'full' } }, { type: 'city-install', evidence: { installationId: 'made-up' } }, { type: 'abstain-demo', evidence: { source: 'test-track' } }]);
    assert.deepEqual(empty.claimed, []);
    assert.equal((await s.readEconomy()).balance, 0);

    // A published (not installed) capability allows held-out-eval, but NOT city-install.
    const cap = buildDriveCapability({
      id: 'cap_drive-knn', name: 'Drive', k: 1, threshold: 0.5,
      examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
    }).capability;
    await s.publishSkill(cap);
    const one = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: [], wrongIds: [] },
      [{ type: 'held-out-eval', evidence: { trackId: 'full' } }, { type: 'city-install', evidence: { installationId: 'made-up' } }]);
    assert.deepEqual(one.claimed.map((c) => c.type), ['held-out-eval']);

    // abstain-demo is refused when the run abstained zero times.
    const two = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'other' }, gradedIds: [], wrongIds: [], abstained: 0 },
      [{ type: 'abstain-demo', evidence: { source: 'test-track' } }]);
    assert.deepEqual(two.claimed, []);

    // Once installed, city-install commits and names the REAL installation.
    await s.installSkill('cap_drive-knn@1', 'host-car', { hostType: 'driver' });
    const three = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: [], wrongIds: [] },
      [{ type: 'city-install', evidence: { installationId: 'made-up' } }]);
    assert.deepEqual(three.claimed.map((c) => c.type), ['city-install']);
    const key = Object.keys((await s.readEconomy()).evidence).find((k) => k.startsWith('city-install:'));
    assert.equal((await s.readEconomy()).evidence[key].installationId, 'host-car');
  } finally { restore(); }
});

test('projects list, copy without re-earning, and switch the whole wallet', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();
    const event = { type: 'held-out-eval', scopeId: 'image-sorter', evidence: { challengeId: 'image-sorter', batch: 'normal', seed: 1 } };
    assert.equal((await s.recordLearningEvent(event)).claimed, true);
    assert.equal((await s.readEconomy()).balance, 30);

    const before = await s.listProjects();
    assert.equal(before.length, 1);
    const originalId = before[0].id;
    assert.equal(before[0].active, true);

    const copy = await s.copyProject(originalId, 'Copy A');
    assert.equal(copy.ok, true);
    assert.notEqual(copy.project.id, originalId);
    // The copy carries the SAME claimed rewards — so it cannot re-earn them.
    assert.equal(copy.project.economy.balance, 30);
    assert.deepEqual(copy.project.economy.claimed, (await s.readEconomy()).claimed);
    assert.equal((await s.listProjects()).length, 2);

    // Switching swaps the complete wallet and progress.
    assert.equal((await s.switchProject(copy.project.id)).ok, true);
    assert.equal((await s.readEconomy()).balance, 30);
    const replay = await s.recordLearningEvent(event);
    assert.equal(replay.claimed, false, 'a copied project cannot manufacture reward eligibility');
    assert.equal((await s.readEconomy()).balance, 30);

    // Switching back to the original keeps ITS wallet intact.
    assert.equal((await s.switchProject(originalId)).ok, true);
    assert.equal((await s.readEconomy()).balance, 30);
    assert.equal((await s.switchProject('does-not-exist')).ok, false);
  } finally { restore(); }
});

test('recordChallengeOutcome commits evidence rewards and a revision fix atomically', async () => {
  const { store, restore } = setup();
  try {
    const s = store();
    await s.openActiveProject();
    const cap = buildDriveCapability({
      id: 'cap_drive-knn', name: 'Driving Model', k: 1, threshold: 0.5, revision: 1,
      examples: [{ label: 'forward', values: [9, 9, 9, 0, 0, 6, 0, 0] }, { label: 'stop', values: [1, 1, 1, 0, 0, 0, 0, 0] }],
    }).capability;
    await s.publishSkill(cap);
    await s.installSkill('cap_drive-knn@1', 'host-car', { hostType: 'driver' });

    const events = [
      { type: 'held-out-eval', evidence: { trackId: 'full' } },
      { type: 'city-install', evidence: { installationId: 'host-car' } },
    ];
    const first = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: ['goal'] }, events);
    assert.equal(first.ok, true);
    assert.deepEqual(first.fixedIds, []);
    assert.deepEqual(first.claimed.map((c) => c.type).sort(), ['city-install', 'held-out-eval']);
    assert.equal((await s.readEconomy()).balance, 70); // 30 + 40
    // Badges are promoted from the same evidence, in the same transaction.
    assert.equal(first.badgeTier, 'skeptic');
    const ach = await s.readAchievements();
    assert.equal(ach.badges.tier, 'skeptic');
    assert.equal(ach.badges.earned.some((b) => b.id === 'skeptic'), true);

    // Replaying the same events and the same revision cannot mint or "fix" again.
    const replay = await s.recordChallengeOutcome('driver',
      { revision: 1, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: ['goal'] }, events);
    assert.deepEqual(replay.claimed, []);
    assert.deepEqual(replay.fixedIds, []);
    assert.equal((await s.readEconomy()).balance, 70);

    // A newer revision reaches the goal on the SAME track: the recorded failure is fixed.
    const second = await s.recordChallengeOutcome('driver',
      { revision: 2, scenario: { kind: 'track', seed: 'full' }, gradedIds: ['goal'], wrongIds: [] }, events);
    assert.deepEqual(second.fixedIds, ['goal']);
    const eco = await s.readEconomy();
    assert.equal(eco.balance, 100); // + 30
    const key = Object.keys(eco.evidence).find((k) => k.startsWith('revision-fixed:'));
    assert.ok(key, 'the fix records its evidence');
    assert.deepEqual(eco.evidence[key].fixedIds, ['goal']);
    assert.equal(eco.evidence[key].fromRevision, 1);
    assert.equal(eco.evidence[key].toRevision, 2);
  } finally { restore(); }
});
