// Адаптеры магазинов. Каждый задаёт адрес поиска, шаблон адреса карточки товара
// и (при необходимости) дополнительную обработку. Общий разбор — в extract.js.

import { CookieJar, fetchPage } from './http.js';
import { extractListing, extractProduct } from './extract.js';

const hostIs = (...hosts) => (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return hosts.some((x) => h === x || h.endsWith('.' + x));
  } catch {
    return false;
  }
};

export const STORES = {
  lamoda: {
    id: 'lamoda',
    name: 'Lamoda',
    domain: 'lamoda.ru',
    home: 'https://www.lamoda.ru/',
    searchUrl: (q) => 'https://www.lamoda.ru/catalogsearch/result/?q=' + encodeURIComponent(q),
    // https://www.lamoda.ru/p/mp002xw0abcd/clothes-brand-trench/
    productPath: /^\/p\/[a-z0-9]{6,}\//i,
    isProductUrl: (u) => hostIs('lamoda.ru')(u) && /\/p\/[a-z0-9]{6,}\//i.test(new URL(u).pathname),
    skuFromUrl: (u) => (new URL(u).pathname.match(/\/p\/([a-z0-9]+)\//i) || [])[1]?.toUpperCase() || null,
    note: 'закрыт защитой от роботов (Servicepipe)',
  },
  stockmann: {
    id: 'stockmann',
    name: 'Stockmann',
    domain: 'stockmann.ru',
    home: 'https://stockmann.ru/',
    searchUrl: (q) => 'https://stockmann.ru/search/?q=' + encodeURIComponent(q),
    // https://stockmann.ru/product/1234567-trench-gerry-weber/
    productPath: /^\/(?:product|catalog\/product|p)\/[\w-]*\d{4,}[\w-]*\/?/i,
    isProductUrl: (u) => hostIs('stockmann.ru')(u) && /\/(?:product|p)\//i.test(new URL(u).pathname),
    skuFromUrl: (u) => (new URL(u).pathname.match(/(\d{5,})/) || [])[1] || null,
    note: 'закрыт защитой от роботов (Servicepipe)',
  },
  market: {
    id: 'market',
    name: 'Яндекс Маркет',
    domain: 'market.yandex.ru',
    home: 'https://market.yandex.ru/',
    searchUrl: (q) => 'https://market.yandex.ru/search?text=' + encodeURIComponent(q),
    // https://market.yandex.ru/product--slug/123456 или /card/slug/123456
    productPath: /^\/(?:product--[^/]+\/\d+|product\/\d+|card\/[^/]+\/\d+)/i,
    isProductUrl: (u) => hostIs('market.yandex.ru')(u) && /^\/(?:product|card)/i.test(new URL(u).pathname),
    skuFromUrl: (u) => {
      const x = new URL(u);
      return x.searchParams.get('sku') || (x.pathname.match(/\/(\d{4,})(?:\/|$)/) || [])[1] || null;
    },
    // Проверено на VPS в РФ: выдача приходит, 8 товаров в серверной разметке страницы.
    note: null,
  },
};

export const STORE_IDS = Object.keys(STORES);
export const storeByName = (name) => Object.values(STORES).find((s) => s.name === name || s.id === name);
export const storeForUrl = (url) => Object.values(STORES).find((s) => s.isProductUrl(url)) || null;

const jars = new Map();
const jarFor = (id) => {
  if (!jars.has(id)) jars.set(id, new CookieJar());
  return jars.get(id);
};

function finishItem(store, it) {
  const sku = it.sku || store.skuFromUrl(it.url);
  return {
    id: store.id + ':' + (sku || it.url),
    store: store.name,
    storeId: store.id,
    url: it.url,
    title: it.title,
    brand: it.brand || '',
    price: Math.round(it.price),
    old: it.old ? Math.round(it.old) : null,
    image: it.image || null,
    rating: it.rating && it.rating <= 5 ? Math.round(it.rating * 10) / 10 : null,
    reviews: it.reviews ? Math.round(it.reviews) : null,
    sizes: it.sizes || [],
    color: it.color || '',
    inStock: it.inStock ?? null,
    text: it.cardText || '',
  };
}

/** Поиск в магазине. Возвращает { items, sources, url }. Ошибки пробрасываются (BlockedError и др.). */
export async function searchStore(store, query, { fetchImpl, limit = 60 } = {}) {
  const jar = jarFor(store.id);
  // Первый заход — на главную, чтобы получить сессионные cookie, как браузер.
  if (!jar.map.size) {
    try { await fetchPage(store.home, { jar, fetchImpl }); } catch { /* не критично */ }
  }
  const url = store.searchUrl(query);
  const page = await fetchPage(url, { jar, referer: store.home, fetchImpl });
  const { items, sources } = extractListing(page.html, page.url, store);
  return { url, sources, items: items.slice(0, limit).map((it) => finishItem(store, it)) };
}

/** Подробности товара по ссылке на карточку. */
export async function fetchProduct(url, { fetchImpl } = {}) {
  const store = storeForUrl(url);
  if (!store) throw new Error('адрес не относится к поддерживаемым магазинам');
  const page = await fetchPage(url, { jar: jarFor(store.id), referer: store.home, fetchImpl });
  const it = extractProduct(page.html, url);
  if (!it.price) throw new Error('не удалось найти цену на странице товара');
  return { ...finishItem(store, { ...it, url }), images: it.images || [] };
}
