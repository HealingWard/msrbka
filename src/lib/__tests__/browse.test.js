import { describe, expect, it } from 'vitest';
import { browseRun, browseQueries, runFromParams, runToParams } from '../search.js';
import { storeQueries } from '../source.js';

describe('поиск без текста — все вещи разделов', () => {
  it('четыре категории для женщин — запрос по каждому разделу', () => {
    const run = browseRun({ cats: ['Одежда', 'Обувь', 'Аксессуары', 'Товары для дома'], gender: 'women', stores: ['Stockmann'] });
    expect(run.q).toBe('Все вещи: одежда, обувь, аксессуары, товары для дома, женщинам');
    expect(run.ds).toBe('other');
    expect(storeQueries(run)).toEqual(['женская одежда', 'женская обувь', 'женские аксессуары', 'товары для дома']);
  });
  it('бренд по разделам', () => {
    const run = browseRun({ cats: ['Аксессуары'], brands: ['Furla'], gender: 'women', stores: ['Stockmann'] });
    expect(run.ds).toBe('acc');
    expect(browseQueries(run)).toEqual(['Furla женские аксессуары']);
  });
  it('ничего не выбрано — поиска нет', () => {
    expect(browseRun({ cats: [], brands: [], stores: ['Stockmann'] })).toBeNull();
  });
  it('переживает ссылку на выдачу', () => {
    const run = browseRun({ cats: ['Обувь'], gender: 'women', stores: ['Stockmann', 'Lamoda'] });
    const back = runFromParams(new URLSearchParams(runToParams(run)));
    expect(back.browse).toEqual({ cats: ['Обувь'] });
    expect(storeQueries(back)).toEqual(['женская обувь']);
  });
});
