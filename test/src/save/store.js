// A small key-value store in the browser's database (IndexedDB), Phase 8.
// Settings now; campaign saves from M2. If the database can't be opened
// (private browsing, blocked storage), it keeps values in memory for this visit.

let dbName = 'pmnn';
let dbPromise = null;
const memory = new Map();
const STORE = 'kv';

export function init(name) {
  dbName = name;
  dbPromise = null;
}

function open() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function get(key) {
  const db = await open();
  if (!db) return memory.get(key);
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? memory.get(key));
      req.onerror = () => resolve(memory.get(key));
    } catch {
      resolve(memory.get(key));
    }
  });
}

export async function set(key, value) {
  memory.set(key, value);
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function del(key) {
  memory.delete(key);
  const db = await open();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Ask the browser to keep our data (Phase 8: Safari may clear it otherwise).
export async function askToKeep() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
