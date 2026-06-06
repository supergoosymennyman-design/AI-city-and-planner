const Storage = (() => {
  const DB_NAME = 'NatureHuntDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'knowledge';

  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const d = event.target.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) {
          d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };
      request.onerror = (event) => {
        console.warn('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async function save(dataset) {
    try {
      const d = await openDB();
      const tx = d.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id: 'dataset', data: dataset, updated: Date.now() });
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch {
      return false;
    }
  }

  async function load() {
    try {
      const d = await openDB();
      const tx = d.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('dataset');
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result ? request.result.data : null);
        };
        request.onerror = (e) => reject(e.target.error);
      });
    } catch {
      return null;
    }
  }

  async function clear() {
    try {
      const d = await openDB();
      const tx = d.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('dataset');
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch {
      return false;
    }
  }

  return { save, load, clear };
})();
