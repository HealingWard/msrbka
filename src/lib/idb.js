// Небольшое хранилище «ключ → значение» в IndexedDB: для больших данных (выдача на тысячи вещей),
// которые не помещаются в localStorage/sessionStorage (там около 5 МБ).

const DB = 'otmer', STORE = 'kv';
let dbP = null;

function db() {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('нет IndexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    dbP.catch(() => { dbP = null; });
  }
  return dbP;
}

const run = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
  const tx = d.transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  tx.oncomplete = () => resolve(req.result);
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
}));

export const idbGet = (key) => run('readonly', (s) => s.get(key));
export const idbSet = (key, value) => run('readwrite', (s) => s.put(value, key));
