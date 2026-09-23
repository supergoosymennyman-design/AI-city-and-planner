/** Shared Champion transactions. IDB is authoritative; legacy records are never deleted.
 * All mutations commit in a single read/write transaction. Web Locks also coordinate callers.
 * Revision conflicts fail visibly; a stale document never gets silently merged over newer work.
 */
(function (root) {
  'use strict';
  const DB = 'passiona-champion-v1', STORE = 'records';
  const copy = v => structuredClone(v);
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  const id = () => crypto.randomUUID();
  function prepare(input) {
    const f = copy(input);
    if (!object(f) || f.kind !== 'ai-champion' || f.version !== 1 || !object(f.champion)
      || typeof f.champion.name !== 'string' || !f.champion.name.trim() || f.champion.name.length > 24 || !object(f.projects)) throw Error('Unsupported or invalid Champion File. Current work is unchanged.');
    if (f.champion.id != null && (typeof f.champion.id !== 'string' || !f.champion.id || f.champion.id.length > 100)) throw Error('Invalid champion ID.');
    f.champion.id ||= id();
    if (f.economy === undefined) f.economy = { version: 1, balance: 0, owned: [], transactions: [] };
    if (!object(f.economy) || !Number.isInteger(f.economy.version) || f.economy.version < 1) throw Error('Invalid economy section.');
    if (f.economy.version === 1) economy(f); // Unknown nested schemas travel intact, read-only.
    return f;
  }
  function economy(f) {
    const e = f.economy;
    if (!object(e) || e.version !== 1) throw Error('This economy version is read-only. Use a newer app.');
    if (!integer(e.balance) || !Array.isArray(e.owned) || !e.owned.every(x => typeof x === 'string' && x.length > 0)
      || new Set(e.owned).size !== e.owned.length || !Array.isArray(e.transactions)
      || !e.transactions.every(t => object(t) && typeof t.id === 'string' && t.id && ['award','purchase','legacy-ownership'].includes(t.type)
        && integer(t.amount) && typeof t.title === 'string' && typeof t.at === 'string')
      || new Set(e.transactions.map(t => t.id)).size !== e.transactions.length) throw Error('Invalid credits or transaction history.');
    return e;
  }
  function transact(file, operation) {
    const f = copy(file), e = economy(f), op = operation;
    if (!op || typeof op.id !== 'string' || !op.id) throw Error('A transaction ID is required.');
    const prior = e.transactions.find(t => t.id === op.id);
    if (prior) {
      if (prior.type !== op.type || prior.amount !== op.amount || prior.title !== op.title || prior.item !== op.item) throw Error('Transaction ID already used for a different operation.');
      return f;
    }
    if (!integer(op.amount) || typeof op.title !== 'string' || !op.title.trim() || op.title.length > 160) throw Error('Enter an activity title and a whole-number amount.');
    if (op.type === 'award') {
      if (!op.amount || !integer(e.balance + op.amount)) throw Error('Award amount must be a positive whole number within the balance limit.');
      e.balance += op.amount;
    } else if (op.type === 'purchase') {
      if (typeof op.item !== 'string' || !op.item) throw Error('Choose a catalog item.');
      if (e.owned.includes(op.item)) return f;
      if (e.balance < op.amount) throw Error('Not enough credits.');
      e.balance -= op.amount; e.owned.push(op.item);
    } else if (op.type === 'legacy-ownership') {
      if (e.legacyImported) return f;
      if (!Array.isArray(op.owned) || !op.owned.every(x => typeof x === 'string' && x)) throw Error('Invalid legacy ownership.');
      e.owned = [...new Set([...e.owned, ...op.owned])]; e.legacyImported = true;
    } else throw Error('Unsupported transaction.');
    e.transactions.push({ id: op.id, type: op.type, amount: op.amount, title: op.title.trim(), at: op.at || new Date().toISOString(), ...(op.item ? { item: op.item } : {}) });
    return f;
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
  }
  async function access(work, mode = 'readwrite') {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode); let result, failure;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(failure || tx.error || Error('Champion storage failed. Nothing was committed.')); };
      const store = tx.objectStore(STORE);
      const request = store.get('active');
      request.onsuccess = () => {
        try { result = work(request.result, store); }
        catch (e) { failure = e; tx.abort(); }
      };
    });
  }
  const lock = work => root.navigator?.locks?.request ? root.navigator.locks.request(DB, work) : work();
  async function create(initial) {
    let current = await lock(() => access((record, store) => {
      if (record) { prepare(record.file); return record; }
      const file = prepare(initial);
      const next = { revision: 1, generation: id(), file };
      store.put(copy(initial), 'original:first-import'); store.put(next, 'active'); return next;
    }));
    let queue = Promise.resolve(), epoch = 0, writeRevision = current.revision, stale = false;
    const listeners = new Set();
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DB) : null;
    const announce = type => { for (const fn of listeners) fn(type); };
    if (channel) channel.onmessage = event => { if (event.data?.revision > current.revision) { stale = true; announce('external'); } };
    function edit(change, { replace = false, latest = false } = {}) {
      const ticket = epoch;
      const run = async () => {
        if (ticket !== epoch) throw Error('Champion changed. This operation was cancelled.');
        const expected = current;
        const next = await lock(() => access((record, store) => {
          if (ticket !== epoch || !record || record.generation !== expected.generation || record.file.champion.id !== expected.file.champion.id
            || (!latest && record.revision !== writeRevision)) throw Error('Champion changed in another tab. Save a recovery copy and reload before continuing.');
          const file = prepare(change(copy(record.file)));
          if (!replace && file.champion.id !== record.file.champion.id) throw Error('Champion identity cannot change in an edit.');
          const out = { revision: record.revision + 1, generation: replace ? id() : record.generation, file };
          if (replace) store.put(record, 'recovery:' + id());
          store.put(out, 'active'); return out;
        }));
        if (!latest || next.revision === writeRevision + 1) writeRevision = next.revision;
        current = next;
        stale = writeRevision !== next.revision;
        if (replace) epoch++;
        channel?.postMessage({ revision: next.revision }); announce(replace ? 'switch' : 'change');
        return copy(next.file);
      };
      const result = queue.then(run); queue = result.catch(() => {}); return result;
    }
    return {
      get file() { return copy(current.file); }, get epoch() { return epoch; }, get stale() { return stale; },
      edit, flush: () => queue,
      async migrateStudio(section) {
        await queue;
        const expected = current;
        const next = await lock(async () => {
          const db = await openDB();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
            const active = store.get('active'), marker = store.get('migration:studio'); let out, failure;
            marker.onsuccess = () => {
              try {
                const r = active.result;
                if (r.revision !== expected.revision || r.generation !== expected.generation) throw Error('Champion changed during legacy migration. Reload.');
                out = r;
                if (!marker.result && !r.file.projects['3d-studio'] && section) {
                  const file = copy(r.file); file.projects['3d-studio'] = section;
                  out = { ...r, revision: r.revision + 1, file }; store.put(out, 'active');
                }
                store.put(true, 'migration:studio');
              } catch(e) { failure = e; tx.abort(); }
            };
            tx.oncomplete = () => { db.close(); resolve(out); };
            tx.onabort = tx.onerror = () => { db.close(); reject(failure || tx.error); };
          });
        });
        current = next; writeRevision = next.revision;
        if (next.revision !== expected.revision) channel?.postMessage({revision:next.revision});
        return this.file;
      },
      replace: incoming => { const ready = prepare(incoming); return edit(() => ready, { replace: true }); },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      async refresh() { await queue; const next = await access(r => r, 'readonly'); if (next.revision !== current.revision || next.revision !== writeRevision) { current = next; writeRevision = next.revision; stale = false; epoch++; announce('switch'); } return this.file; },
      transaction(op) { if (op.type === 'award') return Promise.reject(Error('Teacher unlock required.')); return edit(f => transact(f, op), { latest: true }); },
      async award(pin, op) { const ticket = epoch; await verifyPIN(pin); if (ticket !== epoch) throw Error('Champion changed. Unlock again.'); return edit(f => transact(f, { ...op, type: 'award' }), { latest: true }); },
      close() { epoch++; channel?.close(); listeners.clear(); },
    };
  }
  async function pinRecord() { const db = await openDB(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE); const r = tx.objectStore(STORE).get('teacher'); tx.oncomplete = () => { db.close(); resolve(r.result); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
  async function hashPIN(pin, salt) {
    if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) throw Error('Use a PIN of 4–12 digits.');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return Array.from(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 150000, hash: 'SHA-256' }, key, 256)));
  }
  async function setupPIN(pin) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))), verifier = await hashPIN(pin, salt);
    await lock(async () => {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
        let exists = false;
        const r = store.get('teacher');
        r.onsuccess = () => { if (r.result) { exists = true; tx.abort(); } else store.put({ salt, verifier }, 'teacher'); };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = tx.onerror = () => { db.close(); reject(Error(exists ? 'A teacher PIN already exists on this browser.' : 'Teacher PIN could not be stored.')); };
      });
    });
  }
  async function verifyPIN(pin) { const rec = await pinRecord(); if (!rec) throw Error('Set up a teacher PIN first.'); const value = await hashPIN(pin, rec.salt); if (!value.every((v,i) => v === rec.verifier[i])) throw Error('Incorrect teacher PIN.'); }
  // Explicit tagged transport for typed arrays and GLB buffers. Objects are wrapped too, so
  // an imported object resembling a type tag cannot be mistaken for binary data.
  const types = { Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };
  function encode(value) {
    if (value === undefined) return ['undefined'];
    if (Object.is(value, -0)) return ['negativeZero'];
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      let str = ''; for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return ['binary', value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name, btoa(str)];
    }
    if (Array.isArray(value)) return ['array', value.map(encode)];
    if (object(value)) {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw Error('Studio contains data that cannot be saved.');
      return ['object', Object.entries(value).map(([k,v]) => [k, encode(v)])];
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return ['value', value];
    throw Error('Studio contains data that cannot be saved.');
  }
  function decode(node, depth = 0) {
    if (depth > 100 || !Array.isArray(node)) throw Error('Invalid Studio data.');
    if (node[0] === 'undefined') return undefined;
    if (node[0] === 'negativeZero') return -0;
    if (node[0] === 'value') { if (node[1] !== null && !['string','number','boolean'].includes(typeof node[1])) throw Error('Invalid Studio value.'); return node[1]; }
    if (node[0] === 'array') return node[1].map(v => decode(v, depth + 1));
    if (node[0] === 'object') return Object.fromEntries(node[1].map(([k,v]) => [k, decode(v, depth + 1)]));
    if (node[0] === 'binary') { const bytes = Uint8Array.from(atob(node[2]), c => c.charCodeAt(0)); if (node[1] === 'ArrayBuffer') return bytes.buffer; if (!Object.hasOwn(types, node[1])) throw Error('Unsupported Studio binary type.'); return new types[node[1]](bytes.buffer); }
    throw Error('Unsupported Studio encoding.');
  }
  const API = { prepare, economy, transact, create, encode, decode, setupPIN, hasPIN: async () => !!await pinRecord(), id };
  root.ChampionSession = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
