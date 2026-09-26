import { describe, expect, it } from 'vitest';
import { PRODUCT_BY_ID } from '../../data/catalog.js';
import { columnLetter, exportRows, toCSV } from '../export.js';
import { plural, rub } from '../format.js';
import { getResults, emptyFilters, matchProduct, missingCriteria, parseQuery, runFromParams, runToParams } from '../search.js';
import { DEMO_ITEMS, liveItem } from '../items.js';
import { storeQuery } from '../source.js';
import { historyStats, priceAt } from '../history.js';

describe('parseQuery', () => {
  it('понимает цвет, тип и бюджет', () => {
    const p = parseQuery('бежевый тренч до 25 000');
    expect(p).toMatchObject({ color: ['бежевый'], budget: 25000, size: null, ds: 'trench', brands: [] });
  });
  it('понимает бренд, размер обуви и тип', () => {
    const p = parseQuery('белые кеды Veja, 38 размер, до 15 000');
    expect(p).toMatchObject({ color: ['белый'], size: '38', budget: 15000, brands: ['Veja'], ds: 'shoes' });
  });
  it('понимает буквенный размер и бренд с цифрами', () => {
    const p = parseQuery('чёрный тренч 12 Storeez S до 30 000');
    expect(p).toMatchObject({ color: ['чёрный'], size: 'S', budget: 30000, brands: ['12 Storeez'] });
  });
  it('различает тёмно-синий и синий', () => {
    expect(parseQuery('тёмно-синий тренч').color).toEqual(['тёмно-синий']);
    expect(parseQuery('синий тренч').color).toEqual(['синий']);
  });
  it('выбирает самый длинный бренд', () => {
    expect(parseQuery('тренч Esprit Casual').brands).toEqual(['Esprit Casual']);
  });
  it('поддерживает «до 20к»', () => {
    expect(parseQuery('тренч до 20к').budget).toBe(20000);
  });
  it('берёт тип из категорий, если в запросе его нет', () => {
    expect(parseQuery('что-нибудь белое', ['Обувь']).ds).toBe('shoes');
    expect(parseQuery('что-нибудь белое', ['Одежда']).ds).toBe('trench');
  });
});

describe('matchProduct', () => {
  it('даёт 100% при полном совпадении', () => {
    const m = matchProduct(PRODUCT_BY_ID.t1, { brands: ['12 Storeez'], size: 'M', color: ['бежевый'], budget: 25000 });
    expect(m.score).toBe(100);
    expect(m.summary).toBe('Совпадают бренд, размер и цвет, в пределах бюджета');
  });
  it('снижает оценку за близкий цвет и другой бренд', () => {
    const m = matchProduct(PRODUCT_BY_ID.t4, { brands: ['12 Storeez'], size: 'M', color: ['бежевый'], budget: 25000 });
    expect(m.score).toBe(30 + 10 + 10); // размер + половина цвета + бюджет
    expect(m.reasons.find((r) => r.key === 'color').s).toBe('near');
  });
});

describe('missingCriteria', () => {
  it('перечисляет не указанные параметры', () => {
    expect(missingCriteria({ brands: [], size: null, color: null, budget: 1 })).toEqual(['size', 'brand', 'color']);
  });
});

describe('results', () => {
  const run = { q: 'бежевый тренч до 25 000', ds: 'trench', stores: ['Lamoda', 'Stockmann'], crit: { brands: [], size: 'M', color: ['бежевый'], budget: 25000 } };
  const items = DEMO_ITEMS.filter((p) => p.ds === run.ds && run.stores.includes(p.store));
  it('фильтрует по размеру, сортирует по соответствию', () => {
    const { base } = getResults(items, run.crit, emptyFilters(), 'match');
    expect(base.length).toBeGreaterThan(0);
    expect(base.every(({ p }) => run.stores.includes(p.store) && p.sizes.includes('M'))).toBe(true);
    const scores = base.map((x) => x.m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
  it('применяет фильтры цены', () => {
    const { list } = getResults(items, run.crit, { ...emptyFilters(), max: '20000' }, 'priceAsc');
    expect(list.every(({ p }) => p.price <= 20000)).toBe(true);
    expect(list.map((x) => x.p.price)).toEqual([...list.map((x) => x.p.price)].sort((a, b) => a - b));
  });
  it('сохраняет поиск в URL и читает обратно', () => {
    const back = runFromParams(new URLSearchParams(runToParams(run)));
    expect(back).toEqual(run);
  });
  it('отбрасывает неизвестные магазины в URL', () => {
    expect(runFromParams(new URLSearchParams('q=x&stores=Nope'))).toBeNull();
  });
});

describe('export', () => {
  it('буквы колонок как в таблицах', () => {
    expect([0, 25, 26, 27].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB']);
  });
  it('CSV содержит заголовок, числа без ₽ и ссылки', () => {
    const p = PRODUCT_BY_ID.t1;
    const item = DEMO_ITEMS.find((x) => x.id === p.id);
    const csv = toCSV(exportRows([{ p: item, m: matchProduct(item, {}) }], 'сегодня, 10:00'));
    const [head, row] = csv.replace('﻿', '').split('\r\n');
    expect(head.split(',')[0]).toBe('Фото');
    expect(row).toContain('23990');
    expect(row).toContain('https://www.lamoda.ru/catalogsearch/result/?q=');
  });
});

describe('format', () => {
  it('склоняет числительные', () => {
    expect([1, 2, 5, 11, 21, 22].map((n) => plural(n, ['товар', 'товара', 'товаров']))).toEqual(['товар', 'товара', 'товаров', 'товаров', 'товар', 'товара']);
  });
  it('форматирует рубли', () => {
    expect(rub(23990)).toMatch(/^23\s990 ₽$/);
  });
});

describe('живые товары', () => {
  it('запрос для магазина без бюджета и размера', () => {
    expect(storeQuery({ q: 'бежевый тренч до 25 000', crit: { brands: [] } })).toBe('бежевый тренч');
    expect(storeQuery({ q: 'белые кеды Veja, 38 размер, до 15 000', crit: { brands: ['Veja'] } })).toBe('белые кеды Veja');
    expect(storeQuery({ q: 'чёрный тренч 12 Storeez S до 30 000', crit: { brands: ['12 Storeez'] } })).toBe('чёрный тренч 12 Storeez');
    expect(storeQuery({ q: 'тренч M', crit: { brands: ['Mango'] } })).toBe('Mango тренч');
  });
  it('бренд и цвет берутся из названия, если магазин их не дал', () => {
    const it = liveItem({ id: 'lamoda:X', store: 'Lamoda', url: 'https://www.lamoda.ru/p/x/', title: 'Тренч Gerry Weber бежевого цвета', price: 18990, inStock: true });
    expect(it.brand).toBe('Gerry Weber');
    expect(it.color).toBe('бежевый');
    expect(it.stock).toBe('В наличии');
  });
  it('неизвестные размер и бренд не обнуляют соответствие', () => {
    const it = liveItem({ id: 'x', store: 'Lamoda', url: 'u', title: 'Тренч', price: 10000 });
    const m = matchProduct(it, { brands: ['Mango'], size: 'M', color: ['бежевый'], budget: 20000 });
    expect(m.score).toBe(20 + 15 + 10 + 10);
    expect(m.reasons.find((r) => r.key === 'size').s).toBe('unk');
    const { base } = getResults([it], { size: 'M', brands: [] }, emptyFilters(), 'match');
    expect(base.length).toBe(1);
  });
});

describe('история цены', () => {
  const day = 86400000, now = 100 * day;
  const pts = [{ t: 10 * day, price: 1000 }, { t: 80 * day, price: 800 }, { t: 95 * day, price: 900 }];
  it('статистика за период с ценой «на входе»', () => {
    const st = historyStats(pts, 30, now);
    expect(st.cur).toBe(900);
    expect(st.min).toBe(800);
    expect(st.pts[0]).toEqual({ t: 70 * day, price: 1000 });
    expect(Math.round(st.avg)).toBe(Math.round((1000 * 10 + 800 * 15 + 900 * 5) / 30));
  });
  it('цена на дату', () => {
    expect(priceAt(pts, 50 * day)).toBe(1000);
    expect(priceAt(pts, 5 * day)).toBe(null);
  });
});

describe('размеры', () => {
  it('буквенный и российский размер — примерное совпадение', async () => {
    const { sizeNear, sizeEq } = await import('../search.js');
    expect(sizeEq('38', '38 RU')).toBe(true);
    expect(sizeNear('M', '46 RU')).toBe(true);
    expect(sizeNear('44 RU', 'm')).toBe(true);
    expect(sizeNear('M', '50 RU')).toBe(false);
    expect(sizeEq('XS/42', 'XS')).toBe(true);
    expect(sizeEq('XS/42', '42')).toBe(true);
    expect(sizeEq('XS/42', 'M')).toBe(false);
    expect(sizeNear('XS/42', 'M')).toBe(false);
    expect(sizeNear('S/44', 'M')).toBe(false);
    expect(sizeNear('46', 'M')).toBe(true);
  });
  it('товар с размерами RU остаётся в выдаче по M и помечается «≈»', () => {
    const it = liveItem({ id: 'lamoda:X', store: 'Lamoda', url: 'u', title: 'Тренч', brand: 'Mango', price: 10000, sizes: ['42 RU', '46 RU'] });
    const { base } = getResults([it], { size: 'M', brands: [] }, emptyFilters(), 'match');
    expect(base.length).toBe(1);
    const r = base[0].m.reasons.find((x) => x.key === 'size');
    expect(r.s).toBe('near');
    expect(r.text).toBe('есть 46 RU ≈ M');
  });
  it('размеры известны, но нужного нет — товар отсеивается', () => {
    const it = liveItem({ id: 'x', store: 'Stockmann', url: 'u', title: 'Тренч', price: 10000, sizes: ['XS', 'S'], sizesOut: ['M'] });
    expect(getResults([it], { size: 'M', brands: [] }, emptyFilters(), 'match').base.length).toBe(0);
  });
});
