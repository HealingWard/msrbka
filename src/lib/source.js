// Откуда берутся товары: сервер поиска (живой режим) или демо-каталог.

import { DEMO_BY_ID, DEMO_ITEMS, idFor, liveItem } from './items.js';
import { extDetails, extRecheck, extSearch, extWatch, extensionVersion, versionAtLeast } from './extension.js';
import { isSoldOut } from './product.js';
import { BED_SIZE, CONFUSING_ADJ, detectColors, detectTypes } from './search.js';
import { apiUrl, isLive } from './config.js';
import { STORES, storeByName } from '../data/catalog.js';
import { HISTORY_DAYS, priceHistory } from './priceHistory.js';

const DAY = 86400000;
const STORE_IDS = { 'Яндекс Маркет': 'market', Lamoda: 'lamoda', Stockmann: 'stockmann' };
export const NOEXT_ERROR = 'поиск в этом магазине идёт через расширение «Отмерь» для Chrome — установите его';

/**
 * Запросы для поиска в магазине. Бюджет и размер убираются (их фильтрует «Отмерь»),
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
  // Размер белья («евро», «2-спальный») фильтрует «Отмерь»: в запросе магазина он сужает выдачу до нуля.
  if (run.ds === 'home') q = q.replace(new RegExp('(^|[\\s,])' + BED_SIZE + '(?=[\\s,]|$)', 'gi'), ' ');
  if (run.crit.size && /^\d{2}$/.test(run.crit.size)) q = q.replace(new RegExp('(^|[\\s,])' + run.crit.size + '(?=[\\s,]|$)', 'g'), ' ');
  // Несколько цветов («черные или коричневые») поиск магазина понимает плохо — их фильтрует «Отмерь».
  // Один цвет оставляем: он хорошо сужает выдачу магазина.
  if ([].concat(run.crit.color || []).length > 1) {
    q = q.replace(/(^|[\s,])цвет[а-я]*(?=[\s,]|$)/gi, ' ');
    q = q.split(/\s+/).filter((w) => !detectColors(w).length).join(' ');
  }
  const GENDER = /^(женск|мужск|детск|девоч|мальч|унисекс)/i;
  // «Для кого» из настройки, если в тексте запроса пол не указан: так магазин сразу ищет в нужном разделе.
  const GENDER_WORD = { women: 'женские', men: 'мужские', girls: 'для девочек', boys: 'для мальчиков', kids: 'детские' };
  // Только для одежды и обуви: «чемодан женские» магазин не находит — там пол отсеивает сам «Отмерь».
  const wearable = !run.ds || run.ds === 'trench' || run.ds === 'shoes';
  if (wearable && run.crit.gender && !q.split(/[\s,]+/).some((w) => GENDER.test(w)) && GENDER_WORD[run.crit.gender]) q += ' ' + GENDER_WORD[run.crit.gender];
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
  // «брючный костюм»: поиск магазина находит брюки — добавляем запрос по главному слову («костюм»).
  for (const part of [...parts]) {
    if (!CONFUSING_ADJ.test(' ' + part + ' ')) continue;
    const core = part.split(/\s+/).filter((w) => !CONFUSING_ADJ.test(' ' + w + ' ')).join(' ').trim();
    if (detectTypes(core).length) parts.push(core);
  }
  // Цвет в запросе магазина сильно сужает выдачу (у магазина «голубые» могут не называться «бирюзовыми»):
  // добавляем запрос без цвета — цвет и близкие оттенки проверит «Отмерь» по данным вещей.
  for (const part of [...parts]) {
    const plain = part.split(/\s+/).filter((w) => !detectColors(w).length && !/^цвет/i.test(w)).join(' ').trim();
    if (plain !== part && /[a-zа-яё]{3}/i.test(plain)) parts.push(plain);
  }
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
    const brands = new Set();
    const facetBrands = new Set();
    const statuses = [];
    for (let i = 0; i < queries.length; i++) {
      try {
        const progress = (p) => onProgress?.({ ...p, part: queries.length > 1 ? i + 1 : null, parts: queries.length, query: queries[i] });
        const r = await extSearch(store.id, queries[i], { onProgress: progress, signal, limit: Math.floor(150 / queries.length) });
        statuses.push(r);
        for (const b of r.brands || []) brands.add(b);
        for (const b of r.facetBrands || []) facetBrands.add(b);
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
      searchUrl: statuses[0]?.searchUrl || searchUrl, queries, brands: [...brands], facetBrands: [...facetBrands],
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
    // Карточка — через расширение (если размеры ещё не собраны или в выдаче было одно фото), история — с сервера.
    let merged = item;
    const historyP = getJson('/api/history?id=' + encodeURIComponent(item.id), signal).then((h) => h[item.id] || []).catch(() => []);
    if ((!item.detailed || (item.images || []).length < 2) && (await extensionVersion())) {
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
    return { item: merged, history: await historyP };
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
/**
 * Свежие цены товаров из избранного через расширение (Stockmann и Lamoda).
 * → { status: 'ok'|'noext'|'demo'|'none'|'error', results: [{ id, status: 'ok'|'noprice'|'blocked'|'error', item }], error }
 */
export async function recheckFavorites(items, onProgress) {
  if (!isLive()) return { status: 'demo', results: [] };
  const byUrl = new Map(items.filter((p) => !p.demo && p.url && storeByName(p.store)?.ext).map((p) => [p.url, p]));
  if (!byUrl.size) return { status: 'none', results: [] };
  if (!(await extensionVersion())) return { status: 'noext', results: [], error: NOEXT_ERROR };
  let r;
  try {
    r = await extRecheck([...byUrl.keys()], { onProgress });
  } catch (e) {
    return { status: 'error', results: [], error: e.message };
  }
  const results = recheckResults(r.items, byUrl);
  recordPrices(results.filter((x) => x.status === 'ok' && x.item && x.item.price).map((x) => x.item));
  return { status: r.status === 'error' && !results.length ? 'error' : 'ok', results, error: r.error };
}

/** Ответ расширения о проверке цен → [{ id, status, item }] для вещей из избранного (byUrl: url → вещь). */
function recheckResults(raw, byUrl) {
  return (raw || []).map((x) => {
    const fav = byUrl.get(x.url);
    if (!fav) return null;
    const item = x.item ? liveItem({ ...x.item, store: fav.store, id: fav.id, url: fav.url }) : null;
    return { id: fav.id, status: x.status, item };
  }).filter(Boolean);
}

export const AUTO_MIN_VERSION = '0.5.0';

/**
 * Автопроверка цен: сообщает расширению, за какими вещами вы следите, и забирает проверки, сделанные без вас.
 * favs — избранное, applied — время последней уже применённой проверки.
 * → { status: 'ok'|'noext'|'old'|'none', auto, runs: [{ at, results: [{ id, status, item }], news }] }
 */
export async function syncAutoCheck(favs, applied) {
  if (!isLive()) return { status: 'none', runs: [] };
  const v = await extensionVersion();
  if (!v) return { status: 'noext', runs: [] };
  if (!versionAtLeast(v, AUTO_MIN_VERSION)) return { status: 'old', version: v, runs: [] };
  const list = Object.entries(favs)
    .map(([id, fv]) => ({ id, fv, item: fv.item }))
    .filter((x) => x.item && !x.item.demo && x.item.url && storeByName(x.item.store)?.ext);
  const byUrl = new Map(list.map((x) => [x.item.url, { ...x.item, id: x.id }]));
  const lastManual = Math.max(0, ...list.map((x) => (x.fv.checkedAt ? new Date(x.fv.checkedAt).getTime() : 0)));
  const r = await extWatch({
    items: list.map(({ id, fv, item }) => ({ id, url: item.url, title: item.title, brand: item.brand, price: item.price, target: fv.target || null, soldOut: isSoldOut(item, fv) })),
    site: window.location.origin + window.location.pathname, api: apiUrl(), applied: applied || 0, lastManual,
  });
  const runs = (r.runs || []).map((run) => ({ at: run.at, news: run.news || {}, results: recheckResults(run.results, byUrl) }));
  return { status: 'ok', auto: r.auto || null, runs };
}

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
