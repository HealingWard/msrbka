import { describe, expect, it } from 'vitest';
import { NEAR, detectColors, isMulti } from '../colors.js';
import { parseQuery } from '../search.js';

describe('база цветов', () => {
  it('формы и синонимы', () => {
    expect(detectColors('бирюзовые тапочки')).toEqual(['бирюзовый']);
    expect(detectColors('сумка цвета тиффани')).toEqual(['бирюзовый']);
    expect(detectColors('черная сумка')).toEqual(['чёрный']);
    expect(detectColors('платье цвета слоновой кости')).toHaveLength(1);
  });
  it('модификаторы: «темно синий», «светло серый», «ярко-синий»', () => {
    expect(detectColors('темно синее пальто')).toEqual(['тёмно-синий']);
    expect(detectColors('светло-серый свитер')).toEqual(['светло-серый']);
    expect(detectColors('ярко-синий шарф')).toEqual(['электрик']);
  });
  it('не путает с предметами и материалами', () => {
    expect(detectColors('розетка')).toEqual([]);
    expect(detectColors('мультиварка')).toEqual([]);
    expect(detectColors('серьги с бирюзой')).toEqual([]);
    expect(detectColors('постельное белье')).toEqual([]);
  });
  it('в товарах для дома «ванильный» — запах, а не цвет', () => {
    expect(parseQuery('свеча ванильная', []).color).toBeNull();
  });
  it('близкие цвета: вместо бирюзового — голубой, синий, зелёный', () => {
    expect(NEAR['бирюзовый']).toEqual(expect.arrayContaining(['голубой', 'синий', 'зелёный']));
  });
  it('разноцветное', () => {
    expect(isMulti('платье в полоску')).toBe(true);
    expect(isMulti('черное платье')).toBe(false);
  });
});
