// Откуда берутся товары: сервер поиска (живой режим) или демо-каталог.

import { DEMO_BY_ID, DEMO_ITEMS, liveItem } from './items.js';
import { apiUrl, isLive } from './config.js';
import { STORES, storeByName } from '../data/catalog.js';
import { HISTORY_DAYS, priceHistory } from './priceHistory.js';

const DAY = 86400000;
const STORE_IDS = { 'Яндекс Маркет': 'market', Lamoda: 'lamoda', Stockmann: 'stockmann' };

/** Текст запроса для магазина: без бюджета и размера, с брендом, если он выбран отдельно. */
export function storeQuery(run) {
  let q = ' ' + run.q + ' ';
  // \b в JS не работает с кириллицей, поэтому границы слов задаём явно.
  q = q.replace(/(^|[\s,])до\s*\d[\d\s]*(?:к|тыс\.?)?\s*(?:₽|руб\.?|р\.)?(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])\d{2}\s*-?\s*(?:й\s*)?размер[а-я]*(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])размер[а-я]*\s*\d{2}(?=[\s,]|$)/gi, ' ');
  q = q.replace(/(^|[\s,])(?:xxs|xs|s|m|l|xl|xxl)(?=[\s,]|$)/gi, ' ');
  q = q.replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
  const brands = run.crit.brands || [];
  if (brands.length === 1 && !q.toLowerCase().includes(brands[0].toLowerCase())) q = brands[0] + ' ' + q;
  if (run.crit.color && !/[а-я]/i.test(q)) q += ' ' + [].concat(run.crit.color)[0];
  return q || run.q;
}

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

/** Поиск в одном магазине → { status: 'ok'|'blocked'|'error', items, error, searchUrl }. */
export async function searchOne(run, storeName, signal, index = 0) {
  const store = storeByName(storeName);
  const q = storeQuery(run);
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
