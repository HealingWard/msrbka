import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'pricel:';

function read(storage, key, fallback) {
  try {
    const raw = storage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(storage, key, value) {
  try {
    if (value === undefined) storage.removeItem(PREFIX + key);
    else storage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // приватный режим / переполнение — просто работаем без сохранения
  }
}

const getStorage = (kind) => {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

/** useState, который переживает перезагрузку страницы. */
export function usePersistentState(key, initial, kind = 'local') {
  const [value, setValue] = useState(() => {
    const s = getStorage(kind);
    const init = typeof initial === 'function' ? initial() : initial;
    return s ? read(s, key, init) : init;
  });
  useEffect(() => {
    const s = getStorage(kind);
    if (s) write(s, key, value);
  }, [key, kind, value]);

  // синхронизация между вкладками
  useEffect(() => {
    if (kind !== 'local') return undefined;
    const onStorage = (e) => {
      if (e.key === PREFIX + key && e.newValue != null) {
        try { setValue(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, kind]);

  const reset = useCallback(() => setValue(typeof initial === 'function' ? initial() : initial), [initial]);
  return [value, setValue, reset];
}
