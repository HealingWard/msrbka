import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STORE_NAMES } from './data/catalog.js';
import { usePersistentState } from './lib/storage.js';
import { navigate } from './lib/router.js';
import { runKey, runToParams } from './lib/search.js';
import { isLive } from './lib/config.js';
import { DEMO_BY_ID, snapshot } from './lib/items.js';
import { addKnownBrands } from './data/catalog.js';
import { extBrands, extensionVersion } from './lib/extension.js';

const DAY = 86400000;
const ago = (days, h = 12, m = 0) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// Демо-наполнение «Моих поисков» — только без сервера; в живом режиме там только ваши поиски.
const DEMO_SAVED_IDS = ['q1', 'q2', 'q3'];
const seedSaved = () => (isLive() ? [] : [
  { id: 'q1', q: 'бежевый тренч до 25 000', ds: 'trench', stores: STORE_NAMES.slice(),
    crit: { brands: ['12 Storeez', 'Massimo Dutti', 'COS'], size: 'M', color: ['бежевый'], budget: 25000 }, last: ago(2, 18, 12) },
  { id: 'q2', q: 'белые кеды Veja, 38 размер, до 15 000', ds: 'shoes', stores: ['Lamoda', 'Stockmann'],
    crit: { brands: ['Veja'], size: '38', color: ['белый'], budget: 15000 }, last: ago(7, 10, 4) },
  { id: 'q3', q: 'чёрный тренч S', ds: 'trench', stores: ['Lamoda'],
    crit: { brands: [], size: 'S', color: ['чёрный'], budget: null }, last: ago(24, 21, 40) },
]);
// Демо-избранное — только без сервера: в живом режиме избранное начинается с реальных товаров.
// [дней назад, список, цель как доля текущей цены]
const DEMO_FOLLOW = { t1: [40, 'c1', 0.9], t4: [21, 'c1', null], t12: [9, 'c1', 0.93], s1: [60, 'c2', 1.03], s3: [33, 'c2', 0.9], t8: [14, 'c3', null], s6: [5, 'c3', 0.95] };
const seedFavs = () => (isLive() ? {} : Object.fromEntries(Object.entries(DEMO_FOLLOW).map(([id, [d, coll, f]]) => {
  const p = DEMO_BY_ID[id];
  return [id, { addedAt: ago(d), coll, target: f && p ? Math.floor((p.price * f) / 100) * 100 : null }];
})));
const MAX_CACHED_RUNS = 4;
const seedColls = () => [
  { id: 'c1', name: 'Себе, осень' }, { id: 'c2', name: 'Маше' }, { id: 'c3', name: 'Маме' },
];
const seedPrefs = () => ({ selStores: ['Stockmann', 'Lamoda'], selBrands: [], cats: ['Одежда'], view: 'grid', tableDark: true, askClarify: true, v: 2 });

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
  // Бренды, которые встретились в фильтрах магазинов или добавлены вручную, — пополняют список выбора.
  const [learned, setLearned] = usePersistentState('brands', []);
  useState(() => addKnownBrands(learned));
  const learnBrands = useCallback((list) => {
    if (addKnownBrands(list)) setLearned((cur) => [...new Set([...cur, ...list.map((b) => String(b).trim()).filter(Boolean)])].slice(-3000));
  }, [setLearned]);
  // Раз в неделю расширение забирает полный список брендов со страницы «Все бренды» Stockmann.
  useEffect(() => {
    if (!isLive()) return undefined;
    const KEY = 'pricel:brandsSync';
    let last = 0;
    try { last = +localStorage.getItem(KEY) || 0; } catch { /* нет хранилища */ }
    if (Date.now() - last < 7 * DAY) return undefined;
    let stop = false;
    extensionVersion().then((v) => {
      if (!v || stop) return null;
      return extBrands('stockmann').then((r) => {
        if (stop || !r || !r.brands || !r.brands.length) return;
        learnBrands(r.brands);
        if (r.status === 'ok') try { localStorage.setItem(KEY, String(Date.now())); } catch { /* нет хранилища */ }
      });
    }).catch(() => {});
    return () => { stop = true; };
  }, [learnBrands]);
  const notify = useCallback((msg) => setToast(msg), []);
  const clearToast = useCallback(() => setToast(null), []);

  // Переход на приоритет Stockmann и Lamoda: по умолчанию ищем в них, Яндекс Маркет — по желанию.
  useEffect(() => {
    if (!prefs.v) setPrefs((p) => ({ ...p, selStores: ['Stockmann', 'Lamoda'], v: 2 }));
  }, [prefs.v, setPrefs]);
  // v3: из «Моих поисков» убираем демо-поиски, попавшие туда при первом визите.
  useEffect(() => {
    if ((prefs.v || 0) >= 3) return;
    if (isLive()) setSaved((list) => list.filter((x) => !DEMO_SAVED_IDS.includes(x.id)));
    setPrefs((p) => ({ ...p, v: 3 }));
  }, [prefs.v, setPrefs, setSaved]);

  const setPref = useCallback((k, v) => setPrefs((p) => ({ ...p, [k]: typeof v === 'function' ? v(p[k]) : v })), [setPrefs]);

  // Каждый поиск сразу попадает в «Мои поиски» (новый — наверх, повторный — обновляет дату и параметры).
  const runSearch = useCallback((run) => {
    const now = new Date().toISOString();
    setLastRun({ ...run, at: now });
    setSaved((list) => {
      const same = (s) => s.q === run.q && s.ds === run.ds;
      const prev = list.find(same);
      const entry = { id: prev?.id || 'q' + Date.now(), q: run.q, ds: run.ds, stores: run.stores.slice(), crit: run.crit, last: now };
      return [entry, ...list.filter((s) => !same(s))].slice(0, 100);
    });
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

  /** Следить за ценой / перестать. Новая вещь попадает в указанный список или в первый. */
  const toggleFav = useCallback((item, coll) => {
    setFavs((f) => {
      const next = { ...f };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { addedAt: new Date().toISOString(), coll: coll ?? colls[0]?.id ?? '', item: snapshot(item), priceAtAdd: item.price, target: null };
      return next;
    });
  }, [setFavs, colls]);

  /** Цель по цене; если за вещью ещё не следят — начинаем следить. */
  const setTarget = useCallback((item, target) => {
    setFavs((f) => {
      const cur = f[item.id] || { addedAt: new Date().toISOString(), coll: colls[0]?.id ?? '', item: snapshot(item), priceAtAdd: item.price };
      return { ...f, [item.id]: { ...cur, target: target || null } };
    });
  }, [setFavs, colls]);

  /** Обновляет снимок товара в избранном (после открытия карточки с актуальной ценой). */
  const refreshFav = useCallback((item) => {
    setFavs((f) => (f[item.id] ? { ...f, [item.id]: { ...f[item.id], item: snapshot(item) } } : f));
  }, [setFavs]);

  /** Результат проверки цен: новый снимок товара и время проверки. Фото оставляем прежнее (оно уже сохранено). */
  const applyRecheck = useCallback((results) => {
    const at = new Date().toISOString();
    setFavs((f) => {
      const next = { ...f };
      for (const r of results) {
        const cur = next[r.id];
        if (!cur) continue;
        if (r.status === 'ok' && r.item) {
          // Пустые поля карточки (бренд, цвет…) не затирают сохранённые.
          const merged = { ...(cur.item || {}) };
          for (const [k, v] of Object.entries(snapshot(r.item))) {
            if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) merged[k] = v;
          }
          if (cur.item?.image) merged.image = cur.item.image;
          if (r.item.old == null) merged.old = null; // скидка закончилась
          next[r.id] = { ...cur, item: merged, checkedAt: at, checkStatus: 'ok' };
        } else if (r.status === 'noprice') {
          next[r.id] = { ...cur, item: { ...cur.item, stock: 'Нет в наличии' }, checkedAt: at, checkStatus: 'noprice' };
        } else {
          next[r.id] = { ...cur, checkStatus: r.status };
        }
      }
      return next;
    });
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
    saved, favs, colls, prefs, query, pending, lastRun, results, toast, notify, clearToast, learned, learnBrands,
    setQuery, setPending, setLastRun, setPref, setStoreResult, findItem,
    runSearch, relaunch, saveSearch, deleteSearch, toggleFav, setTarget, refreshFav, applyRecheck, setFavColl, addColl, removeColl,
  }), [saved, favs, colls, prefs, query, pending, lastRun, results, toast, notify, clearToast, learned, learnBrands, setQuery, setPending, setLastRun, setPref,
    setStoreResult, findItem, runSearch, relaunch, saveSearch, deleteSearch, toggleFav, setTarget, refreshFav, applyRecheck, setFavColl, addColl, removeColl]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
