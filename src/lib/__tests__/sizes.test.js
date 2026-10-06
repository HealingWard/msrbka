import { test } from 'vitest';
import assert from 'node:assert/strict';
import { matches, equivalents, parse } from '../sizes.js';

// [запрос, метка вещи, система, ожидание]
const PAIRS = [
  // Обувь: голое число — RU, «EU» сдвигаем на 1
  ['38 размер', 'EU 39', 'shoesWomen', true],
  ['38 размер', 'EU 38', 'shoesWomen', false],
  ['38', '38', 'shoesWomen', true],
  ['38', '38 RU', 'shoesWomen', true],
  ['37', '38 EU', 'shoesWomen', true],
  ['39,5', '39.5', 'shoesWomen', true],
  ['39,5', '40,5 EU', 'shoesWomen', true],
  ['39', '39,5', 'shoesWomen', false],
  ['40', '40-41', 'shoesMen', true],
  ['41', '40-41', 'shoesMen', true],
  ['42', '40-41', 'shoesMen', false],
  ['37', 'UK 5', 'shoesWomen', true],
  ['37', 'US 7', 'shoesWomen', true],
  ['42', 'US 10', 'shoesMen', true],
  ['37', '24 см', 'shoesWomen', true],
  ['37,5', 'EU 38 2/3', 'shoesWomen', true],
  ['37', '38⅔ EU', 'shoesWomen', false],
  ['р. 36', '37 eu', 'shoesWomen', true],
  // Одежда
  ['M', '46', 'clothesWomen', true],
  ['M', '44', 'clothesWomen', true],
  ['M', '48', 'clothesWomen', false],
  ['44', 'S/44', 'clothesWomen', true],
  ['44', 'M/46', 'clothesWomen', false],
  ['M', 'M/46', 'clothesWomen', true],
  ['S', 'M/46', 'clothesWomen', false],
  ['XS', 'XS/40', 'clothesWomen', true],
  ['xs', 'XS', 'clothesWomen', true],
  ['XXL', '2XL', 'clothesWomen', true],
  ['XXXL', '3XL/54', 'clothesWomen', true],
  ['S', 'XS-S', 'clothesWomen', true],
  ['M', 'XS-S', 'clothesWomen', false],
  ['44', 'EU 38', 'clothesWomen', true],
  ['44', 'IT 42', 'clothesWomen', true],
  ['44', 'IT 44', 'clothesWomen', false],
  ['46', '44-46', 'clothesWomen', true],
  ['44', 'W28', 'clothesWomen', true],
  ['48', 'M/48', 'clothesMen', true],
  ['M', '50', 'clothesMen', true],
  ['48', 'EU 48', 'clothesMen', true],
  ['50', 'UK 40', 'clothesMen', true],
  ['44 размер', 'One Size', 'clothesWomen', true],
  // Джинсы
  ['W28 L32', '28/32', 'jeans', true],
  ['W28 L32', 'W28/L34', 'jeans', false],
  ['W28', '28/34', 'jeans', true],
  ['29', 'W29 L30', 'jeans', true],
  // Бюстгальтеры
  ['75B', '75 B', 'bra', true],
  ['75B', '34B', 'bra', true],
  ['75B', 'B75', 'bra', true],
  ['75B', '75C', 'bra', false],
  ['80E', '36DD', 'bra', true],
  ['75B', '90B FR', 'bra', true],
  ['75B', '3B', 'bra', true],
  // Кольца
  ['17', '17,5', 'rings', false],
  ['17,5', '17.5', 'rings', true],
  ['17,5', 'US 7', 'rings', true],
  ['17', '6,5', 'rings', true],
  ['17', '53 ISO', 'rings', true],
  // Постельное бельё
  ['евро', 'Евро', 'bedding', true],
  ['евро', 'Евро макси', 'bedding', false],
  ['1,5-сп', 'полуторный', 'bedding', true],
  ['2-спальный', 'двуспальное', 'bedding', true],
  ['семейный', 'дуэт', 'bedding', true],
  ['евромакси', 'King Size', 'bedding', true],
  ['1,5-сп', '2-сп', 'bedding', false],
  // Дети
  ['104', '104', 'kids', true],
  ['104', '98/104', 'kids', true],
  ['4 года', '104', 'kids', true],
  ['3-4 года', '104', 'kids', true],
  ['110', '4Y', 'kids', false],
  ['110', '104-110', 'kids', true],
  ['12 мес', '80', 'kids', true],
  ['25', 'EU 25', 'kidsShoes', true],
  ['25', '15,7 см', 'kidsShoes', true],
  // Прочее
  ['3', 'M', 'tights', true],
  ['2', 'L', 'tights', false],
  ['85', 'M', 'belts', true],
  ['85', '90', 'belts', false],
  ['W32', '95', 'belts', true],
  ['7', 'S', 'gloves', true],
  ['7,5', '8', 'gloves', false],
  ['56', 'M', 'hats', true],
  ['7 1/8', '57', 'hats', true],
  ['58', '56-57', 'hats', false],
];

test(`пары размеров (${PAIRS.length})`, () => {
  const bad = PAIRS.filter(([q, i, s, want]) => matches(q, i, s) !== want);
  assert.deepEqual(bad.map(([q, i, s, w]) => `${s}: «${q}» vs «${i}» ожидали ${w}`), []);
});

test('equivalents', () => {
  const m = equivalents('M', 'clothesWomen');
  for (const x of ['M', '44', '46', '38 EU', '40 EU', '42 IT', '44 IT']) assert.ok(m.has(x), x + ' в ' + [...m]);
  assert.ok(!m.has('48'));
  const sh = equivalents('38', 'shoesWomen');
  for (const x of ['38', '39 EU', '24.7 см']) assert.ok(sh.has(x), x + ' в ' + [...sh]);
  const b = equivalents('75B', 'bra');
  for (const x of ['75B', '34B UK', '34B US', '90B FR', '3B IT']) assert.ok(b.has(x), x + ' в ' + [...b]);
  const r = equivalents('17,5', 'rings');
  assert.ok(r.has('17.5') && r.has('7 US'), [...r].join());
  assert.ok(equivalents('евро', 'bedding').has('евро'));
  assert.ok(equivalents('46', 'clothesWomen').has('M') && equivalents('46', 'clothesWomen').has('L'));
});

test('parse', () => {
  assert.deepEqual(parse('M/46', 'clothesWomen').parts, [{ sys: 'int', v: 'M' }, { sys: 'auto', v: 46 }]);
  assert.deepEqual(parse('EU 39', 'shoesWomen').parts, [{ sys: 'eu', v: 39 }]);
  assert.deepEqual(parse('W28 L32', 'jeans').parts, [{ sys: 'w', v: 28, l: 32 }]);
  assert.deepEqual(parse('75B', 'bra').parts, [{ sys: 'auto', band: 75, cup: 'B' }]);
  assert.deepEqual(parse('1,5-сп', 'bedding').parts, [{ sys: 'bed', v: '1,5-спальный' }]);
});

import { getResults, emptyFilters } from '../search.js';
test('выдача: «38 размер» обуви находит вещь с размером «EU 39»', () => {
  const item = { id: 'x', store: 'Lamoda', title: 'Ботинки', brand: 'Geox', price: 9000, sizes: ['EU 39'], url: 'u' };
  const r = getResults([item], { brands: [], size: '38', color: null, budget: null }, emptyFilters(), 'match', { ds: 'shoes' });
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].m.reasons.find((x) => x.key === 'size').s, 'ok');
});
