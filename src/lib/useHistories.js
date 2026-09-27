import { useEffect, useState } from 'react';
import { fetchHistories } from './source.js';

/**
 * Истории цен для списка вещей: { [id]: [{t, price}] }. Загружаются пачками с сервера (в демо — синтетические).
 * К истории добавляется текущая цена вещи — вдруг сервер ещё не успел её записать.
 * version — сменить, чтобы загрузить заново (например, после проверки цен).
 */
export function useHistories(items, now = Date.now(), version = 0) {
  const [map, setMap] = useState({});
  const ids = items.map((p) => p.id).join('|');
  useEffect(() => {
    if (!ids) return undefined;
    const ctrl = new AbortController();
    fetchHistories(items, ctrl.signal).then(setMap).catch(() => {});
    return () => ctrl.abort();
    // Перезагружаем, только когда меняется набор вещей.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, version]);
  return (p, at) => withCurrent(map[p.id], p.price, at || now);
}

/** История + текущая цена как последняя точка (если она отличается от последней записанной или новее). */
export function withCurrent(points, price, at = Date.now()) {
  const all = (points || []).filter((x) => x && x.price > 0).slice().sort((a, b) => a.t - b.t);
  if (!price) return all;
  const last = all[all.length - 1];
  if (!last || (last.price !== price && at >= last.t)) all.push({ t: Math.max(at, last ? last.t : 0), price });
  return all;
}
