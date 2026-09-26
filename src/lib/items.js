// Единая модель товара для демо-каталога и живой выдачи с сервера.
// { id, store, url, title, brand, price, old, image, images, rating, reviews, sizes, color, stock, kind, demo }

import { PRODUCTS, productUrl } from '../data/catalog.js';
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

const stockLabel = (inStock) => (inStock === false ? 'Нет в наличии' : inStock === true ? 'В наличии' : null);

/** Товар из ответа сервера → модель сайта; бренд и цвет дополняются из названия, если магазин их не дал. */
export function liveItem(raw) {
  const text = [raw.title, raw.text].filter(Boolean).join(' ');
  const brand = raw.brand || detectBrands(text)[0] || '';
  const color = detectColors(raw.color || '')[0] || (raw.color ? raw.color.toLowerCase() : '') || detectColors(raw.title || '')[0] || '';
  return {
    id: raw.id, store: raw.store, url: raw.url, title: raw.title, brand, price: raw.price, old: raw.old || null,
    image: raw.image || null, images: raw.images || [], rating: raw.rating || null, reviews: raw.reviews || null,
    sizes: raw.sizes || [], color, stock: stockLabel(raw.inStock), kind: '', demo: false,
  };
}

/** Снимок товара для избранного — без лишних полей. */
export const snapshot = (p) => ({
  id: p.id, store: p.store, url: p.url, title: p.title, brand: p.brand, price: p.price, old: p.old,
  image: p.image, rating: p.rating, reviews: p.reviews, sizes: p.sizes, color: p.color, stock: p.stock, kind: p.kind, demo: p.demo,
});
