// История цены за 180 дней: последний элемент — сегодня.
// Ряд детерминирован (сид от id товара), поэтому одинаков при каждом открытии.

export const HISTORY_DAYS = 180;
const cache = {};

export function priceHistory(p) {
  if (cache[p.id]) return cache[p.id];
  let seed = 7;
  for (const c of p.id) seed = (seed * 31 + c.charCodeAt(0)) % 100000;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  const base = p.old || Math.round(p.price * 1.1);
  let cur = base * 0.97;
  const a = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    if (rnd() < 0.07) cur = base * (0.9 + rnd() * 0.12);
    if (i >= HISTORY_DAYS - 12) { a.push(p.price); continue; }
    let v = cur;
    if (i >= 62 && i < 80) v = cur * 0.8; // распродажа
    a.push(Math.max(990, Math.round(v / 100) * 100 - 10));
  }
  a[HISTORY_DAYS - 1] = p.price;
  return (cache[p.id] = a);
}

/** Цена N дней назад (0 — сегодня). */
export const priceDaysAgo = (p, n) => priceHistory(p)[HISTORY_DAYS - 1 - Math.min(n, HISTORY_DAYS - 1)];

export function periodStats(h, period) {
  const v = h.slice(-period);
  const cur = v[v.length - 1];
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const min = Math.min(...v);
  return { v, cur, avg, min, max: Math.max(...v), minIdx: v.indexOf(min) };
}

export function niceStep(r) {
  const p = 10 ** Math.floor(Math.log10(r));
  const n = r / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Мини-график для таблицы избранного (130×36). */
export function sparkPath(points, w = 130, h = 36) {
  const pts = points.length < 2 ? [points[0], points[0]] : points;
  const mn = Math.min(...pts), mx = Math.max(...pts), rg = mx - mn || 1;
  return pts
    .map((v, i) => (i ? 'L' : 'M') + ((i / (pts.length - 1)) * w).toFixed(1) + ' ' + (h - 4 - ((v - mn) / rg) * (h - 8)).toFixed(1))
    .join(' ');
}
