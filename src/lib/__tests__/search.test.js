import { describe, expect, it } from 'vitest';
import { PRODUCT_BY_ID } from '../../data/catalog.js';
import { columnLetter, exportRows, toCSV } from '../export.js';
import { plural, rub } from '../format.js';
import { detectTypes, getResults, emptyFilters, matchProduct, missingCriteria, parseQuery, runFromParams, runToParams, sizeEq, sizeRequired } from '../search.js';
import { DEMO_ITEMS, liveItem } from '../items.js';
import { storeQuery, storeQueries } from '../source.js';
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
  it('лоферы и другая обувь — категория «обувь»', () => {
    expect(parseQuery('лоферы женские 40 размер черные или коричневые')).toMatchObject({ ds: 'shoes', size: '40', color: ['чёрный', 'коричневый'] });
    expect(parseQuery('мокасины 38').ds).toBe('shoes');
    expect(parseQuery('сапоги').ds).toBe('shoes');
  });
  it('сумки и другие аксессуары — без размера', () => {
    expect(parseQuery('черная кожаная сумка через плечо').ds).toBe('acc');
    expect(parseQuery('рюкзак до 20 000').ds).toBe('acc');
    expect(missingCriteria({ brands: [], size: null, color: ['чёрный'], budget: 1 }, 'acc')).toEqual(['brand']);
    expect(missingCriteria({ brands: [], size: null, color: ['чёрный'], budget: 1 }, 'shoes')).toEqual(['size', 'brand']);
  });
  it('берёт тип из категорий, если в запросе его нет', () => {
    expect(parseQuery('что-нибудь белое', ['Обувь']).ds).toBe('shoes');
    // Нераспознанный товар — «прочее»: размер одежды не требуется.
    expect(parseQuery('что-нибудь белое', ['Одежда']).ds).toBe('other');
    expect(parseQuery('что-нибудь белое M', ['Одежда']).ds).toBe('trench');
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
    expect(missingCriteria({ brands: [], size: null, color: null, budget: 1 }, 'trench')).toEqual(['size', 'brand', 'color']);
    expect(missingCriteria({ brands: [], size: null, color: null, budget: 1 }, 'other')).toEqual(['brand', 'color']);
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
    expect(storeQuery({ q: 'лоферы женские 40 размер черные или коричневые', crit: { brands: [], color: ['чёрный', 'коричневый'] } })).toBe('лоферы женские');
  });
  it('«или» — отдельные запросы в магазин, пол добавляется к каждому', () => {
    expect(storeQueries({ q: 'Ботильоны или городские ботинки женские 40 размер черные или коричневые', crit: { brands: [], color: ['чёрный', 'коричневый'] } }))
      .toEqual(['Ботильоны женские', 'городские ботинки женские']);
    expect(storeQueries({ q: 'тренч или плащ M', crit: { brands: [] } })).toEqual(['тренч', 'плащ']);
    expect(storeQueries({ q: 'бежевый тренч или плащ L', crit: { brands: [], color: ['бежевый'] } })).toEqual(['бежевый тренч', 'бежевый плащ']);
    expect(storeQueries({ q: 'бежевый тренч до 25 000', crit: { brands: [], color: ['бежевый'] } })).toEqual(['бежевый тренч']);
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

describe('без размера', () => {
  it('«без размера» и OneSize подходят под любой размер', async () => {
    const { sizeEq } = await import('../search.js');
    expect(sizeEq('без размера', 'M')).toBe(true);
    expect(sizeEq('OneSize', '40')).toBe(true);
    const bag = liveItem({ id: 'x', store: 'Stockmann', url: 'u', title: 'Сумка', price: 10000, sizes: ['без размера'] });
    const { base } = getResults([bag], { size: 'M', brands: [] }, emptyFilters(), 'match');
    expect(base.length).toBe(1);
    expect(base[0].m.reasons.find((r) => r.key === 'size')).toMatchObject({ s: 'ok', text: 'единый размер' });
  });
});

describe('тип товара', () => {
  it('«брючный» — не брюки', () => {
    expect(detectTypes('брючный костюм')).toEqual(['костюм']);
    expect(detectTypes('Брюки прямые')).toEqual(['брюки']);
    expect(detectTypes('Жакет двубортный')).toEqual(['жакет']);
    expect(detectTypes('Плащ')).toEqual(['тренч']);
  });
  it('товары другого типа скрываются, но их можно показать', () => {
    const mk = (id, title) => liveItem({ id, store: 'Lamoda', url: 'u' + id, title, price: 10000 });
    const items = [mk('1', 'Костюм брючный'), mk('2', 'Брюки'), mk('3', 'Жакет'), mk('4', 'Комплект Nice')];
    const r = getResults(items, { brands: [] }, emptyFilters(), 'match', { types: ['костюм'] });
    expect(r.base.map((x) => x.p.title)).toEqual(['Костюм брючный', 'Комплект Nice']);
    expect(r.hidden).toBe(2);
    expect(r.hiddenTypes).toEqual(['брюки', 'жакет']);
    expect(getResults(items, { brands: [] }, emptyFilters(), 'match', { types: ['костюм'], showOther: true }).base.length).toBe(4);
  });
  it('в выдаче сумок не остаются головные уборы и другие аксессуары', () => {
    const mk = (id, title) => liveItem({ id, store: 'Stockmann', url: 'u' + id, title, price: 10000 });
    const items = [mk('1', 'Сумка (хобо)'), mk('2', 'Бейсболка вельветовая'), mk('3', 'Шапка из шерсти и кашемира'),
      mk('4', 'Галстук шелковый'), mk('5', 'Кроссбоди'), mk('6', 'Ремень для сумки')];
    const r = getResults(items, { brands: [] }, emptyFilters(), 'match', { types: detectTypes('сумка') });
    expect(r.base.map((x) => x.p.title).sort()).toEqual(['Кроссбоди', 'Сумка (хобо)']);
  });
  it('запрос с «брючный» дополняется запросом по главному слову', () => {
    expect(storeQueries({ q: 'брючный костюм женский M', crit: { brands: [] } })).toEqual(['брючный костюм женский', 'костюм женский']);
  });
});

describe('для кого', () => {
  it('пол из запроса', async () => {
    const { detectGender } = await import('../search.js');
    expect(detectGender('лоферы женские 40')).toBe('women');
    expect(detectGender('костюм для мужчин')).toBe('men');
    expect(detectGender('куртка для девочки')).toBe('girls');
    expect(detectGender('бежевый тренч')).toBe(null);
    expect(parseQuery('брючный костюм женский M').gender).toBe('women');
  });
  it('товары другого пола скрываются, унисекс и неизвестный пол остаются', () => {
    const mk = (id, g) => liveItem({ id, store: 'Stockmann', url: 'u' + id, title: 'Тренч', price: 10000, gender: g });
    const items = [mk('1', 'woman'), mk('2', 'man'), mk('3', 'boy'), mk('4', 'unisex'), mk('5', '')];
    const r = getResults(items, { brands: [], gender: 'women' }, emptyFilters(), 'match', {});
    expect(r.base.map((x) => x.p.id)).toEqual(['1', '4', '5']);
    expect(r.hidden).toBe(2);
    expect(r.hiddenGenders).toEqual(['мужские', 'для мальчиков']);
    expect(r.hiddenTypes).toEqual([]);
  });
  it('пол из настройки добавляется к запросу в магазин', () => {
    expect(parseQuery('лоферы 40').size).toBe('40');
    expect(parseQuery('тренч до 40 000').size).toBe(null);
    expect(storeQueries({ q: 'лоферы 40', crit: { brands: [], gender: 'women', size: '40' } })).toEqual(['лоферы женские']);
    expect(storeQueries({ q: 'лоферы мужские 43', crit: { brands: [], gender: 'men', size: '43' } })).toEqual(['лоферы мужские']);
  });
});

describe('без размера одежды', () => {
  it('чемодан и нераспознанные товары ищутся без размера', () => {
    expect(parseQuery('чемодан').ds).toBe('acc');
    expect(parseQuery('чемодан на колесах 55 см').size).toBe(null);
    expect(parseQuery('наушники').ds).toBe('other');
    expect(missingCriteria({ brands: [], size: null }, parseQuery('наушники').ds)).not.toContain('size');
    expect(parseQuery('лонгслив белый').ds).toBe('trench');
    expect(parseQuery('вечернее платье').ds).toBe('trench');
    expect(storeQueries({ q: 'чемодан', ds: 'acc', crit: { brands: [], gender: 'women' } })).toEqual(['чемодан']);
    expect(storeQueries({ q: 'лоферы', ds: 'shoes', crit: { brands: [], gender: 'women' } })).toEqual(['лоферы женские']);
  });
});

describe('товары для дома', () => {
  it('постельное бельё — дом: без размера одежды и без «для кого»', () => {
    const p = parseQuery('постельное белье');
    expect(p.ds).toBe('home');
    expect(p.size).toBe(null);
    expect(p.gender).toBe(null);
    expect(missingCriteria({ brands: [], size: null }, 'home')).toContain('size');
    expect(sizeRequired('home')).toBe(false);
    expect(parseQuery('кружевное платье M').ds).toBe('trench');
  });
  it('размер белья из запроса и его сравнение', () => {
    expect(parseQuery('комплект постельного белья 2-спальный').size).toBe('2-спальный');
    expect(parseQuery('постельное белье евро').size).toBe('евро');
    expect(parseQuery('полуторное постельное белье').size).toBe('1,5-спальный');
    expect(sizeEq('2 сп', '2-спальный')).toBe(true);
    expect(sizeEq('Евро', 'евро')).toBe(true);
    expect(sizeEq('семейный', 'евро')).toBe(false);
  });
  it('в магазин уходит запрос без размера белья и без «женские»', () => {
    expect(storeQueries({ q: 'постельное белье евро', ds: 'home', crit: { brands: [] } })).toEqual(['постельное белье']);
    expect(storeQueries({ q: 'набор из 2 бокалов', ds: 'home', crit: { brands: [] } })).toEqual(['набор из 2 бокалов']);
  });
  it('размеры в сантиметрах не отсеивают комплект, другой размер белья — отсеивает', () => {
    const mk = (id, sizes) => liveItem({ id, store: 'Stockmann', url: 'u' + id, title: 'Комплект постельного белья', price: 10000, sizes });
    const items = [mk('1', ['200x220']), mk('2', ['евро']), mk('3', ['семейный'])];
    const r = getResults(items, { brands: [], size: 'евро' }, emptyFilters(), 'match', { types: detectTypes('постельное белье') });
    expect(r.base.map((x) => x.p.sizes[0]).sort()).toEqual(['200x220', 'евро']);
    expect(r.base[0].m.reasons.find((x) => x.key === 'size').s).toBe('ok');
  });
});
