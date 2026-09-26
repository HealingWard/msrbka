// Демо-история цены за 180 дней: последний элемент — сегодня.
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

export function niceStep(r) {
  const p = 10 ** Math.floor(Math.log10(r));
  const n = r / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
