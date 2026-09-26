export const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
export const rub = (n) => fmt(n) + ' ₽';

export const plural = (n, forms) => {
  const a = n % 10, b = n % 100;
  return forms[a === 1 && b !== 11 ? 0 : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? 1 : 2];
};
export const countStr = (n, forms) => n + ' ' + plural(n, forms);
export const PRODUCTS_F = ['товар', 'товара', 'товаров'];
export const STORES_F = ['магазин', 'магазина', 'магазинов'];

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
export const signedPct = (d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '%';

const DAY = 86400000;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const daysAgo = (date, now = new Date()) =>
  Math.max(0, Math.round((startOfDay(now) - startOfDay(new Date(date))) / DAY));

/** «26 сен» для даты N дней назад. */
export const dayLabel = (n, now = new Date()) => {
  const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  return x.getDate() + ' ' + MONTHS[x.getMonth()];
};

const hhmm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

/** «сегодня, 09:44» / «вчера, 18:12» / «24 сен, 18:12». */
export const whenStr = (iso, now = new Date()) => {
  const d = new Date(iso);
  const n = daysAgo(d, now);
  const day = n === 0 ? 'сегодня' : n === 1 ? 'вчера' : d.getDate() + ' ' + MONTHS[d.getMonth()];
  return day + ', ' + hhmm(d);
};

export const dateStamp = (d = new Date()) =>
  [d.getDate(), d.getMonth() + 1].map((x) => String(x).padStart(2, '0')).join('.') + '.' + d.getFullYear();
