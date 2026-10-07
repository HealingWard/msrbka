import { describe, expect, it } from 'vitest';
import { isSoldOut, productView, promoDate, saleStarts } from '../product.js';

// 7 октября 2026: «Сумасшедшие дни» Stockmann начинаются 14 октября.
const NOW = new Date(2026, 9, 7, 20, 45).getTime();
const crazy = (crazyDate) => ({ v: 2, crazy: true, crazyDate, crazyText: crazyDate, badges: [] });
const bag = (promo, extra = {}) => ({ store: 'Stockmann', price: 19990, stock: 'Нет в наличии', sizes: ['без размера'], sizesOut: [], promo, ...extra });

describe('продажа с даты «Сумасшедших дней»', () => {
  it('разбирает даты акции', () => {
    expect(promoDate('ср | с 14 октября', new Date(NOW)).getDate()).toBe(14);
    expect(promoDate('2026-10-17').getMonth()).toBe(9);
    expect(promoDate('17.10', new Date(NOW)).getDate()).toBe(17);
    expect(promoDate('скоро')).toBe(null);
  });
  it('до начала акции магазин пишет «недоступно» — это не «нет в наличии»', () => {
    const p = bag(crazy('ср | с 14 октября'));
    expect(saleStarts(p, NOW).getDate()).toBe(14);
    // isSoldOut и productView смотрят на сегодняшнюю дату — проверяем на дате в будущем относительно реального «сегодня».
    const future = new Date(); future.setDate(future.getDate() + 7);
    const q = bag(crazy(future.getDate() + '.' + (future.getMonth() + 1) + '.' + future.getFullYear()));
    expect(isSoldOut(q)).toBe(false);
    expect(productView(q).stock).toMatch(/^Купить можно с \d+ [а-я]+$/);
  });
  it('акция уже идёт или прошла, а магазин пишет «недоступно» — нет в наличии', () => {
    const past = new Date(); past.setDate(past.getDate() - 1);
    const p = bag(crazy(past.getDate() + '.' + (past.getMonth() + 1) + '.' + past.getFullYear()));
    expect(saleStarts(p)).toBe(null);
    expect(isSoldOut(p)).toBe(true);
  });
  it('без акции «нет в наличии» от магазина остаётся', () => {
    expect(isSoldOut(bag(null))).toBe(true);
    expect(isSoldOut(bag(null, { stock: 'В наличии' }))).toBe(false);
  });
  it('проверка не нашла цену и магазин сказал «нет» — нет в наличии даже в акции', () => {
    const future = new Date(); future.setDate(future.getDate() + 7);
    expect(isSoldOut(bag(crazy(future.getDate() + '.' + (future.getMonth() + 1) + '.' + future.getFullYear())), { checkStatus: 'noprice' })).toBe(true);
  });
});
