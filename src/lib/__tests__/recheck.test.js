import { describe, expect, it } from 'vitest';
import { recheckResults, storeIssues } from '../source.js';
import { isSoldOut } from '../product.js';

const fav = (n, store = 'Stockmann') => ({ id: 's' + n, store, url: 'https://stockmann.ru/product/' + n + '/', title: 'Вещь ' + n, price: 1000 });
const byUrl = (list) => new Map(list.map((f) => [f.url, f]));

describe('проверка цен: «нет в наличии» только по словам магазина', () => {
  it('страница без цены (капча, сбой) — не распродажа', () => {
    const f = fav(1);
    const [r] = recheckResults([{ url: f.url, status: 'noprice', item: { title: 'Вещь 1' } }], byUrl([f]));
    expect(r.status).toBe('unparsed');
  });
  it('магазин пишет «нет в наличии» — распродана', () => {
    const f = fav(1);
    const [r] = recheckResults([{ url: f.url, status: 'noprice', item: { title: 'Вещь 1', inStock: false } }], byUrl([f]));
    expect(r.status).toBe('noprice');
  });
  it('половина вещей магазина «пропала» разом — сбой, наличие не трогаем', () => {
    const favs = [1, 2, 3, 4, 5, 6].map((n) => fav(n));
    const raw = favs.map((f, i) => (i < 3 ? { url: f.url, status: 'noprice', why: 'магазин пишет, что товара нет', item: { inStock: false } } : { url: f.url, status: 'ok', item: { title: 'x', price: 900 } }));
    const res = recheckResults(raw, byUrl(favs));
    expect(res.filter((r) => r.status === 'suspect')).toHaveLength(3);
    expect(res.filter((r) => r.status === 'noprice')).toHaveLength(0);
  });
  it('одна распроданная из многих — распродана', () => {
    const favs = [1, 2, 3, 4, 5, 6].map((n) => fav(n));
    const raw = favs.map((f, i) => (i === 0 ? { url: f.url, status: 'noprice', item: { inStock: false } } : { url: f.url, status: 'ok', item: { title: 'x', price: 900 } }));
    expect(recheckResults(raw, byUrl(favs))[0].status).toBe('noprice');
    expect(storeIssues(recheckResults(raw, byUrl(favs)))).toEqual({});
  });
  it('магазин не проверился у большинства вещей — предупреждение', () => {
    const favs = [1, 2, 3, 4].map((n) => fav(n));
    const raw = favs.map((f) => ({ url: f.url, status: 'unparsed' }));
    expect(Object.keys(storeIssues(recheckResults(raw, byUrl(favs))))).toEqual(['Stockmann']);
  });
});

describe('isSoldOut', () => {
  it('все размеры «нет», но магазин говорит «в наличии» — не распродано', () => {
    expect(isSoldOut({ sizes: [], sizesOut: ['38'], stock: 'В наличии' }, { checkStatus: 'ok' })).toBe(false);
    expect(isSoldOut({ sizes: [], sizesOut: ['38'], stock: null }, { checkStatus: 'ok' })).toBe(true);
  });
  it('сбой проверки не делает вещь распроданной', () => {
    expect(isSoldOut({ sizes: ['38'], stock: null }, { checkStatus: 'unparsed' })).toBe(false);
    expect(isSoldOut({ sizes: ['38'], stock: null }, { checkStatus: 'stale' })).toBe(false);
  });
});
