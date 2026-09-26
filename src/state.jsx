import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { STORE_NAMES } from './data/catalog.js';
import { usePersistentState } from './lib/storage.js';
import { navigate } from './lib/router.js';
import { runKey, runToParams } from './lib/search.js';
import { isLive } from './lib/config.js';
import { DEMO_BY_ID, snapshot } from './lib/items.js';

const DAY = 86400000;
const ago = (days, h = 12, m = 0) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// Стартовое наполнение, чтобы «Мои поиски» и «Избранное» не были пустыми при первом визите.
const seedSaved = () => [
  { id: 'q1', q: 'бежевый тренч до 25 000', ds: 'trench', stores: STORE_NAMES.slice(),
    crit: { brands: ['12 Storeez', 'Massimo Dutti', 'COS'], size: 'M', color: ['бежевый'], budget: 25000 }, last: ago(2, 18, 12) },
  { id: 'q2', q: 'белые кеды Veja, 38 размер, до 15 000', ds: 'shoes', stores: ['Lamoda', 'Stockmann'],
    crit: { brands: ['Veja'], size: '38', color: ['белый'], budget: 15000 }, last: ago(7, 10, 4) },
  { id: 'q3', q: 'чёрный тренч S', ds: 'trench', stores: ['Lamoda'],
    crit: { brands: [], size: 'S', color: ['чёрный'], budget: null }, last: ago(24, 21, 40) },
];
// Демо-избранное — только без сервера: в живом режиме избранное начинается с реальных товаров.
const seedFavs = () => (isLive() ? {} : {
  t1: { addedAt: ago(40), coll: 'c1' }, t4: { addedAt: ago(21), coll: 'c1' }, t12: { addedAt: ago(9), coll: 'c1' },
  s1: { addedAt: ago(60), coll: 'c2' }, s3: { addedAt: ago(33), coll: 'c2' }, t8: { addedAt: ago(14), coll: 'c3' },
  s6: { addedAt: ago(5), coll: '' },
});
const MAX_CACHED_RUNS = 4;
const seedColls = () => [
  { id: 'c1', name: 'Тренч на осень' }, { id: 'c2', name: 'Обувь' }, { id: 'c3', name: 'Подарки' },
];
const seedPrefs = () => ({ selStores: [], selBrands: [], cats: ['Одежда'], view: 'grid', askClarify: true });

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [saved, setSaved] = usePersistentState('saved', seedSaved);
  const [favs, setFavs] = usePersistentState('favs', seedFavs);
  const [colls, setColls] = usePersistentState('colls', seedColls);
  const [prefs, setPrefs] = usePersistentState('prefs', seedPrefs);
  const [query, setQuery] = usePersistentState('query', 'бежевый тренч до 25 000', 'session');
  const [pending, setPending] = usePersistentState('pending', null, 'session');
  const [lastRun, setLastRun] = usePersistentState('lastRun', null, 'session');
  // Выдача по магазинам для последних поисков: key → { at, stores: { [магазин]: { status, items, error, searchUrl } } }
  const [results, setResults] = usePersistentState('results', {}, 'session');
  const [toast, setToast] = useState(null);
  const notify = useCallback((msg) => setToast(msg), []);
  const clearToast = useCallback(() => setToast(null), []);

  const setPref = useCallback((k, v) => setPrefs((p) => ({ ...p, [k]: typeof v === 'function' ? v(p[k]) : v })), [setPrefs]);

  const runSearch = useCallback((run) => {
    const now = new Date().toISOString();
    setLastRun({ ...run, at: now });
    setSaved((list) => list.map((s) => (s.q === run.q && s.ds === run.ds ? { ...s, last: now } : s)));
    // Новый запуск всегда ищет заново.
    const key = runKey(run);
    setResults((r) => { const next = { ...r }; delete next[key]; return next; });
    navigate('/results?' + runToParams(run));
  }, [setLastRun, setSaved, setResults]);

  const setStoreResult = useCallback((key, store, res) => {
    setResults((r) => {
      const prev = r[key] || { stores: {} };
      const entry = { ...prev, at: new Date().toISOString(), stores: { ...prev.stores, [store]: res } };
      const keys = Object.keys(r).filter((k) => k !== key).slice(-(MAX_CACHED_RUNS - 1));
      return { ...Object.fromEntries(keys.map((k) => [k, r[k]])), [key]: entry };
    });
  }, [setResults]);

  /** Товар по id: из выдачи последних поисков, избранного или демо-каталога. */
  const findItem = useCallback((id) => {
    for (const e of Object.values(results)) {
      for (const st of Object.values(e.stores || {})) {
        const hit = (st.items || []).find((x) => x.id === id);
        if (hit) return hit;
      }
    }
    return favs[id]?.item || DEMO_BY_ID[id] || null;
  }, [results, favs]);

  const relaunch = useCallback((id) => {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    setPref('selStores', s.stores.slice());
    setQuery(s.q);
    runSearch({ q: s.q, ds: s.ds, stores: s.stores.slice(), crit: s.crit });
  }, [saved, setPref, setQuery, runSearch]);

  const saveSearch = useCallback((run) => {
    setSaved((list) => (list.some((s) => s.q === run.q && s.ds === run.ds)
      ? list
      : [{ id: 'q' + Date.now(), q: run.q, ds: run.ds, stores: run.stores.slice(), crit: run.crit, last: run.at || new Date().toISOString() }, ...list]));
  }, [setSaved]);

  const deleteSearch = useCallback((id) => setSaved((list) => list.filter((s) => s.id !== id)), [setSaved]);

  const toggleFav = useCallback((item, coll = '') => {
    setFavs((f) => {
      const next = { ...f };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { addedAt: new Date().toISOString(), coll, item: snapshot(item), priceAtAdd: item.price };
      return next;
    });
  }, [setFavs]);

  /** Обновляет снимок товара в избранном (после открытия карточки с актуальной ценой). */
  const refreshFav = useCallback((item) => {
    setFavs((f) => (f[item.id] ? { ...f, [item.id]: { ...f[item.id], item: snapshot(item) } } : f));
  }, [setFavs]);

  const setFavColl = useCallback((id, coll) => setFavs((f) => (f[id] ? { ...f, [id]: { ...f[id], coll } } : f)), [setFavs]);

  const addColl = useCallback((name) => {
    const id = 'c' + Date.now();
    setColls((c) => [...c, { id, name }]);
    return id;
  }, [setColls]);

  const removeColl = useCallback((id) => {
    setColls((c) => c.filter((x) => x.id !== id));
    setFavs((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.coll === id ? { ...v, coll: '' } : v])));
  }, [setColls, setFavs]);

  const value = useMemo(() => ({
    saved, favs, colls, prefs, query, pending, lastRun, results, toast, notify, clearToast,
    setQuery, setPending, setLastRun, setPref, setStoreResult, findItem,
    runSearch, relaunch, saveSearch, deleteSearch, toggleFav, refreshFav, setFavColl, addColl, removeColl,
  }), [saved, favs, colls, prefs, query, pending, lastRun, results, toast, notify, clearToast, setQuery, setPending, setLastRun, setPref,
    setStoreResult, findItem, runSearch, relaunch, saveSearch, deleteSearch, toggleFav, refreshFav, setFavColl, addColl, removeColl]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
