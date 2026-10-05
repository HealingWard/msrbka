import { describe, expect, it } from 'vitest';
import CASES from './types-selftest.json';
import { detectTypes, resolveType, typeFits } from '../types.js';
import { emptyFilters, getResults, parseQuery } from '../search.js';
import { liveItem } from '../items.js';

describe('база типов вещей', () => {
  it.each(CASES)('«%s» → %s', (q, key) => {
    expect(resolveType(q)?.key ?? null).toBe(key);
  });
  it('категория по названной вещи', () => {
    expect(parseQuery('кроссовки', []).ds).toBe('shoes');
    expect(parseQuery('кольцо', []).ds).toBe('acc');
    expect(parseQuery('нож для кухни', []).ds).toBe('home');
    expect(parseQuery('платье миди', []).ds).toBe('trench');
  });
  it('несколько вариантов в запросе', () => {
    expect(detectTypes('лоферы или дерби')).toEqual(['лоферы', 'дерби']);
  });
  it('разновидность и общее название подходят, «точно не то» — нет', () => {
    expect(typeFits('хобо', 'сумка')).toBe(true);
    expect(typeFits('плащ', 'тренч')).toBe(true);
    expect(typeFits('сабо', 'тапочки')).toBe(false);
    expect(typeFits('ремешок для сумки', 'сумка')).toBe(false);
  });
  it('в выдаче тапочек нет сабо, в выдаче тренча есть плащи', () => {
    const mk = (id, title) => liveItem({ id, store: 'Lamoda', url: 'u' + id, title, price: 5000 });
    const slippers = getResults([mk('1', 'Тапочки домашние'), mk('2', 'Сабо кожаные')], { brands: [] }, emptyFilters(), 'match', { types: detectTypes('тапочки') });
    expect(slippers.base.map((x) => x.p.title)).toEqual(['Тапочки домашние']);
    const trench = getResults([mk('1', 'Плащ хлопковый'), mk('2', 'Тренч с поясом'), mk('3', 'Пуховик')], { brands: [] }, emptyFilters(), 'match', { types: detectTypes('бежевый тренч') });
    expect(trench.base.map((x) => x.p.title).sort()).toEqual(['Плащ хлопковый', 'Тренч с поясом']);
  });
});
