import { describe, expect, it } from 'vitest';
import { typeQuery } from '../typeBrands.js';

describe('вещь из запроса для списка брендов', () => {
  it('убирает бренд, цвет, размер и бюджет, добавляет «для кого» к одежде и обуви', () => {
    expect(typeQuery('черные кроссовки Nike 38 размер до 10000', { gender: 'women' })).toBe('кроссовки женские');
    expect(typeQuery('платье', { gender: 'women' })).toBe('платье женские');
  });
  it('аксессуары и дом — без «для кого»', () => {
    expect(typeQuery('кольцо', { gender: 'women' })).toBe('кольцо');
    expect(typeQuery('нож для кухни', { gender: 'women' })).toBe('нож для кухни');
  });
  it('вещь не названа — нет запроса', () => {
    expect(typeQuery('что-нибудь бежевое', {})).toBeNull();
    expect(typeQuery('', {})).toBeNull();
  });
});
