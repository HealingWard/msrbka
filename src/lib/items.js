// Единая модель товара для демо-каталога и живой выдачи с сервера.
// { id, store, url, title, brand, price, old, image, images, rating, reviews, sizes, color, stock, kind, demo }

import { PRODUCTS, productUrl, storeByName } from '../data/catalog.js';
import { detectBrands, detectColors } from './search.js';

export function demoItem(p) {
  return {
    id: p.id, store: p.store, url: productUrl(p), title: p.title, brand: p.brand, price: p.price, old: p.old,
    image: null, images: [], rating: p.rating, reviews: p.reviews, sizes: p.sizes, color: p.color,
    stock: p.stock, kind: p.kind, ds: p.ds, demo: true,
  };
}

export const DEMO_ITEMS = PRODUCTS.map(demoItem);
export const DEMO_BY_ID = Object.fromEntries(DEMO_ITEMS.map((p) => [p.id, p]));

/** Стабильный id товара по ссылке (совпадает с id на сервере — для истории цен). */
export function idFor(storeName, url) {
  const st = storeByName(storeName);
  let sku = null;
  try {
    const u = new URL(url);
    if (st?.id === 'lamoda') sku = (u.pathname.match(/\/p\/([a-z0-9]+)\//i) || [])[1]?.toUpperCase();
    else if (st?.id === 'stockmann') sku = (u.pathname.match(/(\d{5,})/) || [])[1];
    else if (st?.id === 'market') sku = u.searchParams.get('sku') || (u.pathname.match(/\/(\d{4,})(?:\/|$)/) || [])[1];
  } catch { /* не URL */ }
  return (st?.id || 'x') + ':' + (sku || url);
}

/** Пол товара из данных магазина: women | men | girls | boys | kids | unisex | ''. */
export function normGender(g) {
  const x = String(g || '').toLowerCase();
  if (/^(woman|women|female|w|жен)/.test(x)) return 'women';
  if (/^(man|men|male|m|муж)/.test(x)) return 'men';
  if (/^(girl|дев)/.test(x)) return 'girls';
  if (/^(boy|мал)/.test(x)) return 'boys';
  if (/^(kid|child|дет|baby|infant)/.test(x)) return 'kids';
  if (/^(unisex|уни)/.test(x)) return 'unisex';
  return '';
}

const stockLabel = (inStock) => (inStock === false ? 'Нет в наличии' : inStock === true ? 'В наличии' : null);

/** Товар из ответа сервера → модель сайта; бренд и цвет дополняются из названия, если магазин их не дал. */
export function liveItem(raw) {
  const text = [raw.title, raw.text].filter(Boolean).join(' ');
  const brand = raw.brand || detectBrands(text)[0] || '';
  const color = detectColors(raw.color || '')[0] || (raw.color ? raw.color.toLowerCase() : '') || detectColors(raw.title || '')[0] || '';
  return {
    id: raw.id, store: raw.store, url: raw.url, title: raw.title, brand, price: raw.price, old: raw.old || null,
    image: raw.image || null, images: raw.images || [], rating: raw.rating || null, reviews: raw.reviews || null,
    sizes: raw.sizes || [], sizesOut: raw.sizesOut || [], color, stock: stockLabel(raw.inStock), kind: '', demo: false,
    detailed: !!raw.detailed,
    gender: normGender(raw.gender),
    promo: raw.promo || null,
  };
}

/** Снимок товара для избранного — без лишних полей. */
export const snapshot = (p) => ({
  id: p.id, store: p.store, url: p.url, title: p.title, brand: p.brand, price: p.price, old: p.old,
  image: p.image, rating: p.rating, reviews: p.reviews, sizes: p.sizes, sizesOut: p.sizesOut, color: p.color, stock: p.stock, kind: p.kind,
  demo: p.demo, detailed: p.detailed, gender: p.gender, promo: p.promo || null,
});
