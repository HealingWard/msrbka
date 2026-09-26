// Статистика по точкам истории цены {t, price} за период.

const DAY = 86400000;

/**
 * Точки за последние periodDays: плюс последняя точка до начала периода — цена «на входе».
 * Возвращает { pts, cur, avg, min, max, minAt, first } или null, если данных нет.
 */
export function historyStats(points, periodDays, now = Date.now()) {
  const all = (points || []).filter((x) => x && x.price > 0).sort((a, b) => a.t - b.t);
  if (!all.length) return null;
  const from = now - periodDays * DAY;
  const inside = all.filter((x) => x.t >= from);
  const before = all.filter((x) => x.t < from).pop();
  const pts = before ? [{ t: from, price: before.price }, ...inside] : inside;
  if (!pts.length) pts.push({ t: from, price: all[all.length - 1].price });
  const prices = pts.map((x) => x.price);
  const min = Math.min(...prices);
  // Средняя, взвешенная по времени действия цены
  let sum = 0, span = 0;
  for (let i = 0; i < pts.length; i++) {
    const end = i + 1 < pts.length ? pts[i + 1].t : now;
    const d = Math.max(end - pts[i].t, 1);
    sum += pts[i].price * d;
    span += d;
  }
  const minPt = pts.find((x) => x.price === min);
  return {
    pts, cur: all[all.length - 1].price, avg: sum / span, min, max: Math.max(...prices),
    minAt: minPt.t, first: all[0].t, count: all.length, from,
  };
}

/** Цена на момент t (последняя известная до t). */
export function priceAt(points, t) {
  const all = (points || []).filter((x) => x.t <= t).sort((a, b) => a.t - b.t);
  return all.length ? all[all.length - 1].price : null;
}

export function sparkFromPoints(points, since, w = 130, h = 36, now = Date.now()) {
  const pts = (points || []).filter((x) => x.t >= since).sort((a, b) => a.t - b.t);
  const start = priceAt(points, since);
  const series = [...(start != null ? [{ t: since, price: start }] : []), ...pts];
  if (!series.length) return '';
  if (series.length === 1) series.push({ t: now, price: series[0].price });
  const t0 = series[0].t, t1 = Math.max(now, series[series.length - 1].t), dt = t1 - t0 || 1;
  const mn = Math.min(...series.map((x) => x.price)), mx = Math.max(...series.map((x) => x.price)), rg = mx - mn || 1;
  const X = (t) => (((t - t0) / dt) * w).toFixed(1);
  const Y = (v) => (h - 4 - ((v - mn) / rg) * (h - 8)).toFixed(1);
  let d = 'M' + X(series[0].t) + ' ' + Y(series[0].price);
  for (let i = 1; i < series.length; i++) d += ' H' + X(series[i].t) + ' V' + Y(series[i].price);
  return d + ' H' + w;
}
