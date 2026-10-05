// Статистика цены по истории проверок: «обычная цена» (коридор p25–p75), минимум, «к обычной»,
// статус вещи, за которой следите («Пора» / «Ждём» / «Выше обычной»), и прогресс до цели.

import { rub, pct } from './format.js';

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

/** Изменения цены по проверкам: первая проверка и каждая смена цены → [{ t, price }]. */
export function priceSteps(points) {
  const all = (points || []).filter((x) => x && x.price > 0).sort((a, b) => a.t - b.t);
  const out = [];
  for (const x of all) if (!out.length || out[out.length - 1].price !== x.price) out.push({ t: x.t, price: x.price });
  return out;
}

/** Бейдж изменения цены: к обычной или «МИНИМУМ ЗА N ДНЕЙ». null — истории пока мало. */
export function changeBadge(st, days = 90) {
  if (!st || !st.known) return null;
  if (st.isMin) return { text: 'Минимум за ' + days + ' дней', tone: 'min' };
  return { text: pct(st.va), tone: st.va < 0 ? 'drop' : st.va > 0 ? 'rise' : 'flat' };
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
 * Статус вещи, за которой следите. cur — текущая цена, tg — цель (или null), st — статистика за 90 дней.
 * → { k: 'pora'|'wait'|'high', label, note, icon }
 */
export function itemStatus(cur, tg, st) {
  if (tg && cur <= tg) return { k: 'pora', label: 'Пора', note: 'цель достигнута', icon: 'scissors' };
  if (st && st.known && cur > st.p75) return { k: 'high', label: 'Выше обычной', note: st.va > 0 ? 'на ' + st.va + ' % выше обычной' : 'выше коридора', icon: 'trending-up' };
  if (tg) return { k: 'wait', label: 'Ждём', note: 'до цели ' + rub(cur - tg), icon: 'hourglass' };
  // «Пора» — только если цена действительно ниже обычной: ниже нижней границы коридора или минимум за период.
  // Цена, которая не менялась, равна обычной — это не повод покупать (раньше такие вещи получали «ниже обычной на 0 %»).
  if (st && st.known && (cur < st.p25 || st.isMin) && st.va < 0) {
    return { k: 'pora', label: 'Пора', note: st.isMin ? 'минимум за 90 дней' : 'ниже обычной на ' + Math.max(1, Math.abs(st.va)) + ' %', icon: 'scissors' };
  }
  const flat = st && st.known && Math.min(...st.v) === Math.max(...st.v);
  return { k: 'wait', label: 'Ждём', note: !st || !st.known ? 'история цены копится' : flat ? 'цена не менялась' : 'цена в обычном коридоре', icon: 'hourglass' };
}

/** Прогресс до цели 0…1: (цена при добавлении − текущая) / (цена при добавлении − цель). */
export function goalProgress(was, cur, tg) {
  if (!tg) return 0;
  if (cur <= tg) return 1;
  if (was <= tg) return 0;
  return Math.max(0, Math.min(1, (was - cur) / (was - tg)));
}
