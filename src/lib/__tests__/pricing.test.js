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
