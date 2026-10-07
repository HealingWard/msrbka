import { describe, expect, it } from 'vitest';
import { priceStats, priceSteps } from '../pricing.js';
import { withAdded, withCurrent } from '../useHistories.js';

const DAY = 86400000;
const now = Date.UTC(2026, 8, 30, 12);

describe('история цены в первую неделю', () => {
  it('цена при добавлении возвращается в историю, если сервер её затёр', () => {
    const added = now - 4 * DAY;
    // На сервере за день добавления осталась только цена со страницы товара.
    const server = [{ t: added + 60000, price: 12312 }];
    const pts = withAdded(withCurrent(server, 12312, now), { addedAt: new Date(added).toISOString(), priceAtAdd: 15390 });
    expect(pts.map((x) => x.price)).toEqual([15390, 12312]);
    const st = priceStats(pts, 90, now);
    expect(st.known).toBe(false);
    expect(priceSteps(pts)).toEqual([{ t: added, price: 15390 }, { t: added + 60000, price: 12312 }]);
  });

  it('если цена при добавлении уже есть в истории — ничего не добавляем', () => {
    const added = now - 2 * DAY;
    const server = [{ t: added - 1000, price: 5000 }, { t: now - DAY, price: 4500 }];
    expect(withAdded(server, { addedAt: new Date(added).toISOString(), priceAtAdd: 5000 })).toBe(server);
    expect(withAdded(server, null)).toBe(server);
  });

  it('изменения цены: одинаковые подряд проверки схлопываются', () => {
    const pts = [{ t: 1, price: 100 }, { t: 2, price: 100 }, { t: 3, price: 90 }, { t: 4, price: 90 }, { t: 5, price: 100 }];
    expect(priceSteps(pts)).toEqual([{ t: 1, price: 100 }, { t: 3, price: 90 }, { t: 5, price: 100 }]);
  });
});

import { changeBadge, itemStatus, priceSignal } from '../pricing.js';

describe('правило статусов (исследование: «Пора» — от 30 % ниже обычной)', () => {
  // Ежедневные проверки за последние n дней с ценой f(день).
  const hist = (n, f) => Array.from({ length: n }, (_, k) => ({ t: now - (n - 1 - k) * DAY, price: f(k, n) }));
  const st = (h) => { const s = priceSignal(h, now); return { s, status: itemStatus(h[h.length - 1].price, null, s) }; };

  it('цена не менялась — «Ждём · цена не менялась N дней»', () => {
    const { s, status } = st(hist(30, () => 18990));
    expect(s.level).toBe('normal');
    expect(status).toMatchObject({ k: 'wait', note: 'цена не менялась 30 дней' });
    expect(changeBadge(s)).toBe(null);
  });
  it('подешевела на 1 ₽ или на 5 % — не повод: «Ждём»', () => {
    expect(st(hist(30, (k, n) => (k === n - 1 ? 18989 : 18990))).status.k).toBe('wait');
    expect(st(hist(30, (k, n) => (k === n - 1 ? 18040 : 18990))).status.k).toBe('wait');
  });
  it('на 15–29 % ниже обычной и дешевле, чем в 80 % дней — «Хорошая цена», но не «Пора»', () => {
    const { s, status } = st(hist(40, (k, n) => (k >= n - 2 ? 16000 : 20000)));
    expect(s.level).toBe('good');
    expect(status.k).toBe('good');
  });
  it('на 30 %+ ниже обычной и это минимум за 30 дней — «Пора»', () => {
    const { s, status } = st(hist(40, (k, n) => (k >= n - 2 ? 13900 : 20000)));
    expect(s.level).toBe('excellent');
    expect(status.k).toBe('pora');
  });
  it('история меньше 7 дней — оценки нет, только «история копится»', () => {
    expect(st(hist(6, (k, n) => (k >= n - 1 ? 13000 : 20000))).s.level).toBe('young');
  });
  it('с 7 дней истории −35 % — уже «Пора»', () => {
    expect(st(hist(8, (k, n) => (k >= n - 1 ? 13000 : 20000))).s.level).toBe('excellent');
  });
  it('«у минимума» смотрит на последние 30 дней: два месяца назад было дешевле — всё равно «Пора»', () => {
    // 90 дней: 20 000, в днях 20–30 уценка до 12 000, сейчас 13 900 — минимум за последние 30 дней.
    expect(st(hist(90, (k, n) => (k >= n - 2 ? 13900 : k >= 20 && k < 30 ? 12000 : 20000))).s.level).toBe('excellent');
  });
  it('копейки не считаются: разница меньше 300 ₽ — без статуса', () => {
    expect(st(hist(40, (k, n) => (k >= n - 2 ? 600 : 800))).s.level).toBe('normal');
  });
  it('цену подняли перед «распродажей» — «Выше обычной»', () => {
    const { s, status } = st(hist(60, (k, n) => (k >= n - 5 ? 23000 : 20000)));
    expect(s.level).toBe('high');
    expect(status.k).toBe('high');
  });
  it('один выброс (сбой) не сдвигает обычную цену', () => {
    const s = priceSignal(hist(30, (k) => (k === 10 ? 2000 : 20000)), now);
    expect(s.usual).toBe(20000);
  });
});
