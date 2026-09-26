// Откуда берутся товары: сервер поиска (живой режим) или демо-каталог.

import { DEMO_BY_ID, DEMO_ITEMS, idFor, liveItem } from './items.js';
import { extDetails, extSearch, extensionVersion } from './extension.js';
import { detectColors } from './search.js';
import { apiUrl, isLive } from './config.js';
import { STORES, storeByName } from '../data/catalog.js';
import { HISTORY_DAYS, priceHistory } from './priceHistory.js';

const DAY = 86400000;
const STORE_IDS = { 'Яндекс Маркет': 'market', Lamoda: 'lamoda', Stockmann: 'stockmann' };
export const NOEXT_ERROR = 'поиск в этом магазине идёт через расширение «Прицел» для Chrome — установите его';

/**
 * Запросы для поиска в магазине. Бюджет и размер убираются (их фильтрует «Прицел»),
 * несколько цветов — тоже; альтернативы через «или» («ботильоны или ботинки») становятся
 * отдельными запросами: поиск магазина ищет товары со всеми словами сразу.
 */
export function storeQueries(run) {
  let q = ' ' + run.q + ' ';
  // \b в JS не работает с кириллицей, поэтому границы слов задаём явно.
  q = q.replace(/(^|[\s,])до\s*\d[\d\s]*(?:к|тыс\.?)?\s*(?:₽|руб\.?|р\.)?(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])\d{2}\s*-?\s*(?:й\s*)?размер[а-я]*(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])размер[а-я]*\s*\d{2}(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])(?:xxs|xs|s|m|l|xl|xxl)(?=[\s,]|$)/gi, ' ');
  // Несколько цветов («черные или коричневые») поиск магазина понимает плохо — их фильтрует «Прицел».
  // Один цвет оставляем: он хорошо сужает выдачу магазина.
  if ([].concat(run.crit.color || []).length > 1) {
    q = q.replace(/(^|[\s,])цвет[а-я]*(?=[\s,]|$)/gi, ' ');
    q = q.split(/\s+/).filter((w) => !detectColors(w).length).join(' ');
  }
  const GENDER = /^(женск|мужск|детск|девоч|мальч|унисекс)/i;
  // «женские» и единственный цвет относятся ко всем вариантам, даже если написаны один раз.
  const shared = q.split(/[\s,]+/).filter((w) => GENDER.test(w) || detectColors(w).length);
  const brands = run.crit.brands || [];
  const parts = q
    .split(/(?:^|[\s,])(?:или|либо)(?=[\s,]|$)|[/;]/i)
    .map((x) => x.replace(/(^|[\s,])и(?=[\s,]|$)/gi, ' ').replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((x) => /[a-zа-яё]{3}/i.test(x))
    .map((x) => {
      let part = x;
      for (const w of shared) {
        const isColor = detectColors(w).length > 0;
        const has = part.split(/\s+/).some((t) => (isColor ? detectColors(t).length > 0 : t.toLowerCase() === w.toLowerCase()));
        if (!has) part = isColor ? w + ' ' + part : part + ' ' + w;
      }
      if (brands.length === 1 && !part.toLowerCase().includes(brands[0].toLowerCase())) part = brands[0] + ' ' + part;
      return part;
    });
  const uniq = [...new Set(parts.map((x) => x.toLowerCase()))].map((l) => parts.find((x) => x.toLowerCase() === l));
  if (!uniq.length) {
    const fallback = q.replace(/(^|[\s,])(?:и|или|либо)(?=[\s,]|$)/gi, ' ').replace(/\s+/g, ' ').trim();
    return [fallback || (run.crit.color ? [].concat(run.crit.color)[0] : run.q)];
  }
  return uniq.slice(0, 3);
}

export const storeQuery = (run) => storeQueries(run)[0];

async function getJson(path, signal) {
  const r = await fetch(apiUrl() + path, { signal });
  let body = null;
  try { body = await r.json(); } catch { /* пустой ответ */ }
  if (!r.ok) throw new Error(body?.error || 'сервер ответил ' + r.status);
  return body;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); });
});

/** Отправляет увиденные цены на сервер — из них складывается история цен. */
function recordPrices(items) {
  if (!isLive() || !items.length) return;
  const body = JSON.stringify({ items: items.map((p) => ({ id: p.id, url: p.url, title: p.title, store: p.store, price: p.price, old: p.old })) });
  fetch(apiUrl() + '/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}

const extItem = (storeName) => (raw) => liveItem({ ...raw, store: storeName, id: idFor(storeName, raw.url) });

/**
 * Поиск в одном магазине → { status: 'ok'|'blocked'|'empty'|'noext'|'error', items, error, searchUrl }.
 * onProgress получает промежуточные шаги расширения ({ stage, done, total, found }).
 */
export async function searchOne(run, storeName, signal, index = 0, onProgress) {
  const store = storeByName(storeName);
  const q = storeQuery(run);
  if (isLive() && store.ext) {
    const queries = storeQueries(run);
    const searchUrl = store.search + encodeURIComponent(queries[0]);
    if (!(await extensionVersion())) return { status: 'noext', items: [], error: NOEXT_ERROR, searchUrl };
    const byUrl = new Map();
    const statuses = [];
    for (let i = 0; i < queries.length; i++) {
      try {
        const progress = (p) => onProgress?.({ ...p, part: queries.length > 1 ? i + 1 : null, parts: queries.length, query: queries[i] });
        const r = await extSearch(store.id, queries[i], { onProgress: progress, signal, limit: Math.floor(150 / queries.length) });
        statuses.push(r);
        for (const x of r.items || []) if (x.url && x.price && x.title && !byUrl.has(x.url)) byUrl.set(x.url, x);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        statuses.push({ status: 'error', error: e.message });
      }
    }
    const items = [...byUrl.values()].map(extItem(storeName));
    recordPrices(items);
    const ok = statuses.some((r) => r.status === 'ok');
    const first = statuses.find((r) => r.status !== 'ok') || statuses[0] || {};
    return {
      status: ok ? 'ok' : first.status || 'error', items, error: ok ? null : first.error || null,
      searchUrl: statuses[0]?.searchUrl || searchUrl, queries,
    };
  }
  if (!isLive()) {
    await sleep(450 * (index + 1), signal);
    const items = DEMO_ITEMS.filter((p) => p.ds === run.ds && p.store === storeName);
    return { status: 'ok', items, searchUrl: store.search + encodeURIComponent(q) };
  }
  try {
    const r = await getJson('/api/search?store=' + STORE_IDS[storeName] + '&q=' + encodeURIComponent(q), signal);
    return { status: r.status, items: (r.items || []).map(liveItem), error: r.error || null, searchUrl: r.searchUrl || store.search + encodeURIComponent(q) };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return { status: 'error', items: [], error: e.message === 'Failed to fetch' ? 'сервер поиска недоступен' : e.message, searchUrl: store.search + encodeURIComponent(q) };
  }
}

/** Синтетическая история демо-товара как точки {t, price}. */
export function demoHistory(id, now = Date.now()) {
  const p = DEMO_BY_ID[id];
  if (!p) return [];
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return priceHistory(p).map((price, i) => ({ t: today.getTime() - (HISTORY_DAYS - 1 - i) * DAY, price }));
}

/** Подробности и история: для живого товара — со страницы магазина через сервер. */
export async function fetchDetails(item, signal) {
  if (item.demo || !isLive()) return { item, history: demoHistory(item.id) };
  const store = storeByName(item.store);
  if (store?.ext) {
    // Карточка — через расширение (если размеры ещё не собраны), история — с сервера.
    let merged = item;
    if (!item.detailed && (await extensionVersion())) {
      try {
        const r = await extDetails(item.url, { signal });
        if (r.status === 'ok' && r.item) {
          const fresh = extItem(item.store)(r.item);
          merged = { ...item };
          for (const [k, v] of Object.entries(fresh)) {
            if (k === 'title' && item.title) continue;
            if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) merged[k] = v;
          }
          merged.id = item.id;
          merged.detailed = true;
          recordPrices([merged]);
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
      }
    }
    let history = [];
    try { history = (await getJson('/api/history?id=' + encodeURIComponent(item.id), signal))[item.id] || []; } catch (e) { if (e.name === 'AbortError') throw e; }
    return { item: merged, history };
  }
  const r = await getJson('/api/product?url=' + encodeURIComponent(item.url), signal);
  const fresh = liveItem(r);
  const merged = { ...item };
  for (const [k, v] of Object.entries(fresh)) {
    // Название из выдачи обычно чище заголовка страницы («Бренд Название — купить…»).
    if (k === 'title' && item.title) continue;
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) merged[k] = v;
  }
  merged.id = item.id;
  return { item: merged, history: r.history || [] };
}

/** История цен для списка товаров (избранное, выгрузка). */
export async function fetchHistories(items, signal) {
  const out = {};
  const live = [];
  for (const p of items) {
    if (p.demo || !isLive()) out[p.id] = demoHistory(p.id);
    else live.push(p.id);
  }
  for (let i = 0; i < live.length; i += 100) {
    const chunk = live.slice(i, i + 100);
    try {
      Object.assign(out, await getJson('/api/history?' + chunk.map((id) => 'id=' + encodeURIComponent(id)).join('&'), signal));
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
  }
  return out;
}

export { STORES };
