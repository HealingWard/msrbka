// Бренды, у которых есть именно эта вещь: из фильтра «Бренд» в выдаче магазина по запросу вещи
// («кроссовки женские», «кольцо», «нож кухонный»). Магазин показывает в фильтре только бренды найденных вещей —
// то есть те, у которых она сейчас есть. Берём при открытии списка брендов и из каждого поиска, храним неделю.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORE_NAMES, brandKey, storeByName } from '../data/catalog.js';
import { detectBrands, detectColors, detectTypes, parseQuery } from './search.js';
import { storeQueries } from './source.js';
import { extSearch, extensionVersion, versionAtLeast } from './extension.js';
import { isLive } from './config.js';

const KEY = 'pricel:typeBrands';
const TTL = 7 * 86400000;
const MAX = 300;

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeAll(all) {
  const keys = Object.keys(all).sort((a, b) => all[b].t - all[a].t).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, all[k]])))); } catch { /* нет места */ }
}
const cacheKey = (store, query) => store + '|' + query.toLowerCase();

/** Запомнить бренды из фильтра выдачи магазина по запросу (зовём и после обычного поиска). */
export function rememberTypeBrands(store, query, list) {
  if (!store || !query || !list || !list.length) return;
  const all = readAll();
  all[cacheKey(store, query)] = { t: Date.now(), list: [...new Set(list)].slice(0, 3000) };
  writeAll(all);
}

/**
 * Запрос вещи без бренда, цвета, размера и бюджета: «черные кроссовки Nike 38» → «кроссовки женские».
 * null — в тексте не названа вещь (тогда бренды — по категории).
 */
export function typeQuery(q, { cats = [], gender = null } = {}) {
  const text = String(q || '').trim();
  if (!text || !detectTypes(text).length) return null;
  const p = parseQuery(text, cats);
  const brands = detectBrands(text).map((b) => b.toLowerCase());
  const words = text.split(/\s+/).filter((w) => !detectColors(w).length && !brands.some((b) => b.split(/\s+/).includes(w.toLowerCase())));
  const base = words.join(' ').trim();
  if (!base) return null;
  const g = p.gender || (gender && gender !== 'any' ? gender : null);
  const qs = storeQueries({ q: base, ds: p.ds, crit: { brands: [], size: p.size, color: null, budget: p.budget, ...(g && p.ds !== 'home' ? { gender: g } : {}) } });
  return qs[0] || null;
}

/**
 * Бренды, у которых есть вещь из запроса, в выбранных магазинах (Stockmann, Lamoda — через расширение).
 * → { query, list, state: 'none'|'cached'|'loading'|'ok'|'unavailable', load() }. load() — загрузить, если ещё нет.
 */
export function useTypeBrands(q, { cats, gender, stores }) {
  const query = useMemo(() => typeQuery(q, { cats, gender }), [q, cats, gender]);
  const extStores = useMemo(() => (stores || STORE_NAMES).filter((n) => storeByName(n)?.ext), [stores]);
  const fromCache = useCallback(() => {
    if (!query) return null;
    const all = readAll();
    const parts = extStores.map((s) => all[cacheKey(s, query)]).filter((x) => x && Date.now() - x.t < TTL);
    if (!parts.length) return null;
    return { list: dedupe(parts.flatMap((x) => x.list)), full: parts.length === extStores.length };
  }, [query, extStores]);
  const [state, setState] = useState({ query: null, list: null, state: 'none' });
  useEffect(() => {
    const c = fromCache();
    setState({ query, list: c ? c.list : null, state: !query ? 'none' : c ? (c.full ? 'ok' : 'cached') : 'none' });
  }, [query, fromCache]);
  const load = useCallback(async () => {
    if (!query || !isLive() || !extStores.length) return;
    const c = fromCache();
    if (c && c.full) return;
    const v = await extensionVersion();
    if (!v || !versionAtLeast(v, '0.6.1')) { setState((s) => ({ ...s, state: s.list ? s.state : 'unavailable' })); return; }
    setState((s) => ({ ...s, query, state: 'loading' }));
    const all = readAll();
    await Promise.all(extStores.map(async (store) => {
      const k = cacheKey(store, query);
      if (all[k] && Date.now() - all[k].t < TTL) return;
      try {
        const r = await extSearch(storeByName(store).id, query, { page: 1, brandsOnly: true, timeoutMs: 90000 });
        if (r.status === 'ok' && r.facetBrands?.length) rememberTypeBrands(store, query, r.facetBrands);
      } catch { /* магазин не ответил — останутся бренды категории */ }
    }));
    const after = fromCache();
    setState({ query, list: after ? after.list : null, state: after ? 'ok' : 'unavailable' });
  }, [query, extStores, fromCache]);
  return { ...state, query, load };
}

function dedupe(list) {
  const m = new Map();
  for (const b of list) { const k = brandKey(b); if (k && !m.has(k)) m.set(k, b); }
  return [...m.values()];
}
