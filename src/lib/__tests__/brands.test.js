import { describe, expect, it } from 'vitest';
import { addCatBrands, allBrands, brandsForCats } from '../../data/catalog.js';

describe('бренды по категориям', () => {
  const bags = ['Furla', 'Coccinelle', 'Pinko', 'Braccialini', 'Piquadro', 'Lancaster', 'Guess', 'Michael Michael Kors', 'Karl Lagerfeld', 'Calvin Klein'];
  it('пока список категории не собран — все бренды', () => {
    expect(brandsForCats(['home'])).toEqual(expect.arrayContaining(allBrands()));
    expect(brandsForCats([])).toEqual(expect.arrayContaining(allBrands()));
  });
  it('аксессуары — только бренды аксессуаров, выбранные остаются', () => {
    addCatBrands('acc', bags);
    const list = brandsForCats(['acc'], ['Ecco']);
    expect(list).toEqual(expect.arrayContaining([...bags, 'Ecco']));
    expect(list).toHaveLength(bags.length + 1);
    expect(list).not.toContain('Nike');
  });
  it('написание бренда — как в общем списке', () => {
    addCatBrands('acc', ['12 STOREEZ']);
    expect(brandsForCats(['acc'])).toContain('12 Storeez');
    expect(brandsForCats(['acc'])).not.toContain('12 STOREEZ');
  });
  it('повторы без учёта регистра не добавляются', () => {
    expect(addCatBrands('acc', ['FURLA', 'furla'])).toBe(0);
  });
});

describe('бренды: категория без собранного списка не открывает все бренды', () => {
  it('аксессуары собраны, дом нет — только аксессуары', () => {
    const list = brandsForCats(['acc', 'home']);
    expect(list).toContain('Furla');
    expect(list).not.toContain('Nike');
  });
});
