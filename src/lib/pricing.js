// Статистика цены по истории проверок: «обычная цена» (коридор p25–p75), минимум, «к обычной»,
// статус вещи, за которой следите («Пора» / «Ждём» / «Выше обычной»), и прогресс до цели.

import { plural, rub, pct } from './format.js';

const DAY = 86400000;

/**
 * Дневной ряд цены за periodDays (с первой проверки, если она позже начала периода).
 * Цена между проверками считается прежней. known — истории достаточно, чтобы говорить об «обычной цене»:
 * хотя бы две проверки и неделя наблюдений.
 */
export function priceStats(points, periodDays = 90, now = Date.now()) {
  const all = (points || []).filter((x) => x && x.price > 0).sort((a, b) => a.t - b.t);
  if (!all.length) return null;
  const from = now - (periodDays - 1) * DAY;
  const start = Math.max(from, all[0].t);
  const days = Math.max(1, Math.floor((now - start) / DAY) + 1);
  const v = [], t = [];
  let j = 0, price = all[0].price;
  for (let i = 0; i < days; i++) {
    const at = i === days - 1 ? now : start + i * DAY;
    while (j < all.length && all[j].t <= at) price = all[j++].price;
    v.push(price);
    t.push(at);
  }
  const cur = all[all.length - 1].price;
  v[v.length - 1] = cur;
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  const mn = Math.min(...v);
  const so = v.slice().sort((a, b) => a - b);
  const q = (f) => so[Math.floor((so.length - 1) * f)];
  const span = now - all[0].t;
  const known = all.length >= 2 && span >= 7 * DAY;
  // Минимум — последний день с минимальной ценой.
  let minIdx = v.lastIndexOf(mn);
  return {
    v, t, cur, avg, mn, minIdx, minAt: t[minIdx], p25: q(0.25), p75: q(0.75),
    va: Math.round(((cur - avg) / avg) * 100), isMin: known && cur <= mn && so[so.length - 1] > mn,
    known, count: all.length, first: all[0].t, from: start, periodDays,
  };
}

/**
 * Правило статусов цены (исследование 2026-10, см. docs/price-signal.md):
 * «обычная цена» — медиана нашей истории за 180 дней (сглаженной медианой по 5 дням, чтобы один сбой не решал исход),
 * коридор — p25…p75 того же ряда. Скидкам магазина не верим: только своя история.
 */
export const SIGNAL = {
  window: 180,        // дней для «обычной цены»
  youngDays: 7,       // меньше — «история копится» (MVP; пересмотр — после сезона распродаж, docs/price-signal.md)
  youngChecks: 4,     // и минимум проверок
  excellent: 0.30,    // «Отличная цена — пора»: на 30 % ниже обычной…
  excellentP75: 0.40, // …или на 40 % ниже верхней границы коридора (если наблюдаем 45+ дней)
  p75Days: 45,
  minDays: 30,        // и не выше минимума за последние 30 дней наших наблюдений (сколько их есть)…
  minSlack: 0.02,     // …+ 2 %
  excellentDays: 7,   // и история от 7 дней
  good: 0.15,         // «Хорошая цена»: на 15 % ниже обычной и дешевле, чем в 80 % дней
  goodRank: 0.20,
  high: 0.08,         // «Выше обычной»: на 8 % выше обычной и выше p75
  minRub: 300,        // и разница не меньше 300 ₽ — копейки не считаются
};

const median = (a) => { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (sorted, f) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * f)))];

/**
 * Сигнал цены по нашей истории → { level, cur, usual, p25, p75, minRecent, rank, days, checks, flat, pct, sinceChange, known }
 * level: 'young' (история копится) | 'excellent' (пора) | 'good' | 'normal' | 'high'. pct — к обычной цене, %.
 */
export function priceSignal(points, now = Date.now()) {
  const all = (points || []).filter((x) => x && x.price > 0).sort((a, b) => a.t - b.t);
  if (!all.length) return null;
  const C = SIGNAL;
  const cur = all[all.length - 1].price;
  const days = Math.floor((now - all[0].t) / DAY) + 1;
  const checks = all.length;
  const st = priceStats(all, C.window, now);
  const v = st.v;
  // Сглаживание медианой по 5 дням — только для статистики, не для текущей цены.
  const sm = v.map((_, i) => median(v.slice(Math.max(0, i - 2), Math.min(v.length, i + 3))));
  const sorted = sm.slice().sort((a, b) => a - b);
  const usual = median(sm);
  const p25 = quant(sorted, 0.25), p75 = quant(sorted, 0.75);
  // Минимум за последние minDays дней из того, что есть: ждать 30 дней не нужно.
  const minRecent = Math.min(...v.slice(-C.minDays));
  const rank = v.filter((x) => x < cur).length / v.length;
  const flat = Math.min(...v) === Math.max(...v);
  let lastChange = all[0].t;
  for (let i = 1; i < all.length; i++) if (all[i].price !== all[i - 1].price) lastChange = all[i].t;
  const sinceChange = Math.floor((now - lastChange) / DAY);
  const pct = changePct(cur, usual);
  const below = usual - cur;
  let level = 'normal';
  if (days < C.youngDays || checks < C.youngChecks) level = 'young';
  else if ((cur <= usual * (1 - C.excellent) || (days >= C.p75Days && cur <= p75 * (1 - C.excellentP75)))
    && cur <= minRecent * (1 + C.minSlack) && below >= C.minRub && days >= C.excellentDays) level = 'excellent';
  else if (cur <= usual * (1 - C.good) && below >= C.minRub && rank <= C.goodRank) level = 'good';
  else if (cur >= usual * (1 + C.high) && cur - usual >= C.minRub && cur > p75) level = 'high';
  return { level, cur, usual, p25, p75, minRecent, rank, days, checks, flat, pct, sinceChange, known: level !== 'young' };
}

/** Изменения цены по проверкам: первая проверка и каждая смена цены → [{ t, price }]. */
export function priceSteps(points) {
  const all = (points || []).filter((x) => x && x.price > 0).sort((a, b) => a.t - b.t);
  const out = [];
  for (const x of all) if (!out.length || out[out.length - 1].price !== x.price) out.push({ t: x.t, price: x.price });
  return out;
}

/** Бейдж цены по нашей истории: отличная / хорошая / выше обычной. Обычная цена и копящаяся история — без бейджа. */
export function changeBadge(sig) {
  if (!sig || !sig.known) return null;
  if (sig.level === 'excellent') return { text: 'Отличная цена ' + pct(sig.pct), tone: 'min' };
  if (sig.level === 'good') return { text: pct(sig.pct), tone: 'drop' };
  if (sig.level === 'high') return { text: pct(sig.pct), tone: 'rise' };
  return null;
}

/**
 * Изменение цены в процентах. Меньше 1 % показываем с десятыми (−0,4 %), чтобы изменение
 * на 110 ₽ у дорогой вещи не выглядело как «= 0 %»; 0 — только когда цена не изменилась.
 */
export function changePct(cur, was) {
  if (!was || cur === was) return 0;
  const x = ((cur - was) / was) * 100;
  if (Math.abs(x) >= 1) return Math.round(x);
  const r = Math.round(x * 10) / 10;
  return r === 0 ? (x < 0 ? -0.1 : 0.1) : r;
}

export const deltaBadge = (n) => ({ text: pct(n), tone: n < 0 ? 'drop' : n > 0 ? 'rise' : 'flat' });

/** Спарклайн за 30 дней в поле 200×32 и направление: вниз — сплошная зелёная, вверх — пунктир. */
export function sparkline(points, now = Date.now()) {
  const st = priceStats(points, 30, now);
  if (!st) return { d: 'M0 16 H200', trend: 0 };
  const v = st.v.length > 1 ? st.v : [st.v[0], st.v[0]];
  const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
  // Ряд прижат к правому краю: если истории меньше 30 дней, линия начинается позже.
  const off = 30 - v.length;
  const X = (i) => (((off + i) / 29) * 200).toFixed(1);
  const Y = (y) => (mx === mn ? 16 : 28 - ((y - mn) / rg) * 24).toFixed(1);
  let d = 'M' + X(0) + ' ' + Y(v[0]);
  for (let i = 1; i < v.length; i++) d += ' H' + X(i) + ' V' + Y(v[i]);
  return { d, trend: Math.sign(v[v.length - 1] - v[0]) };
}

/**
 * Статус вещи, за которой следите. cur — текущая цена, tg — цель (или null), sig — priceSignal по нашей истории.
 * «Пора» — только цель достигнута или отличная цена (на 30 %+ ниже обычной и у минимума за 30 дней, см. SIGNAL).
 * → { k: 'pora'|'good'|'wait'|'high', label, note, icon }
 */
export function itemStatus(cur, tg, sig) {
  const p = (n) => Math.abs(n) + '\u00a0%';
  if (tg && cur <= tg) return { k: 'pora', label: 'Пора', note: 'цель достигнута', icon: 'scissors' };
  if (sig && sig.level === 'excellent') return { k: 'pora', label: 'Пора', note: 'отличная цена: на ' + p(sig.pct) + ' ниже обычной', icon: 'scissors' };
  if (sig && sig.level === 'high') return { k: 'high', label: 'Выше обычной', note: 'на ' + p(sig.pct) + ' выше обычной', icon: 'trending-up' };
  if (sig && sig.level === 'good') return { k: 'good', label: 'Хорошая цена', note: 'на ' + p(sig.pct) + ' ниже обычной' + (tg ? ' · до цели ' + rub(cur - tg) : ''), icon: 'trending-down' };
  if (tg) return { k: 'wait', label: 'Ждём', note: 'до цели ' + rub(cur - tg), icon: 'hourglass' };
  if (!sig || !sig.known) return { k: 'wait', label: 'Ждём', note: 'история цены копится', icon: 'hourglass' };
  return { k: 'wait', label: 'Ждём', note: sig.flat ? 'цена не менялась ' + sig.days + ' ' + plural(sig.days, ['день', 'дня', 'дней']) : 'обычная цена', icon: 'hourglass' };
}

/** Прогресс до цели 0…1: (цена при добавлении − текущая) / (цена при добавлении − цель). */
export function goalProgress(was, cur, tg) {
  if (!tg) return 0;
  if (cur <= tg) return 1;
  if (was <= tg) return 0;
  return Math.max(0, Math.min(1, (was - cur) / (was - tg)));
}
