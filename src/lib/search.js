import { BRANDS, NEAR, STORE_NAMES } from '../data/catalog.js';
import { cap, rub } from './format.js';

export const colorList = (c) => [].concat(c || []);
const genitive = (c) => (c.endsWith('ый') ? c.slice(0, -2) + 'ого' : c.endsWith('ий') ? c.slice(0, -2) + 'его' : c);
const genitiveList = (c) => colorList(c).map(genitive).join(' / ');
export const colorStr = (c) => colorList(c).join(' / ');

const COLOR_STEMS = [
  ['бежев', 'бежевый'], ['молочн', 'молочный'], ['песочн', 'песочный'], ['черн', 'чёрный'], ['хаки', 'хаки'],
  ['кремов', 'кремовый'], ['шоколад', 'шоколадный'], ['коричнев', 'коричневый'], ['графит', 'графитовый'], ['кэмел', 'кэмел'],
];
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Разбирает свободный запрос: цвет(а), размер, бюджет, бренды и тип товара.
 * `cats` — выбранные на главной категории, помогают, если тип не назван в тексте.
 */
/** Цвета, упомянутые в тексте (в каноничной форме: «бежевый», «тёмно-синий»…). */
export function detectColors(text) {
  const low = norm(text);
  const words = low.split(/[^a-zа-я0-9]+/).filter(Boolean);
  const colors = [];
  const add = (c) => { if (!colors.includes(c)) colors.push(c); };
  if (/темно\s*-?\s*син/.test(low)) add('тёмно-синий');
  for (const w of words) {
    for (const [stem, c] of COLOR_STEMS) if (w.startsWith(stem)) add(c);
    if (/^син(ий|ие|яя|ее|их|юю|его|ей)$/.test(w) && !colors.includes('тёмно-синий')) add('синий');
    if (/^бел(ый|ые|ая|ое|ых|ую|ого|ой)$/.test(w)) add('белый');
    if (/^сер(ый|ые|ая|ое|ых|ую|ого|ой)$/.test(w)) add('серый');
  }
  return colors;
}

const brandRe = (b) => new RegExp('(^|[^a-zа-я0-9])' + escapeRe(norm(b)) + '(?=$|[^a-zа-я0-9])');

/** Бренды из списка, упомянутые в тексте; «Esprit» отбрасывается, если нашёлся «Esprit Casual». */
export function detectBrands(text) {
  const low = norm(text);
  return BRANDS
    .filter((b) => brandRe(b).test(low))
    .filter((b, _, arr) => !arr.some((o) => o !== b && o.toLowerCase().includes(b.toLowerCase())));
}

export function parseQuery(q, cats = []) {
  const low = norm(q);
  const words = low.split(/[^a-zа-я0-9]+/).filter(Boolean);
  let size = null, budget = null;
  const colors = detectColors(q);
  for (const w of words) {
    if (['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'].includes(w)) size = w.toUpperCase();
  }
  const sizeMatch = low.match(/(\d{2})\s*-?\s*(й\s*)?размер/) || low.match(/размер[а-я]*\s*(\d{2})/);
  if (sizeMatch) size = sizeMatch[1];

  const budgetMatch = low.replace(/\s/g, '').match(/до(\d+)(к|тыс)?/);
  if (budgetMatch) {
    budget = +budgetMatch[1] * (budgetMatch[2] ? 1000 : 1);
    if (budget < 500) budget = null;
  }

  const brands = detectBrands(q);

  let ds = 'trench';
  if (/кед|кросс|обув|ботин|туфл/.test(low)) ds = 'shoes';
  else if (!/тренч|плащ|одежд|пальт|куртк/.test(low) && cats.includes('Обувь') && !cats.includes('Одежда')) ds = 'shoes';

  return { color: colors.length ? colors : null, size, budget, brands, ds };
}

/** Какие параметры нужно уточнить перед поиском. */
export function missingCriteria(crit) {
  const m = [];
  if (!crit.size) m.push('size');
  if (!crit.brands.length) m.push('brand');
  if (!crit.color) m.push('color');
  if (!crit.budget) m.push('budget');
  return m;
}

const WEIGHTS = { brand: 40, size: 30, color: 20, price: 10 };
// unk — магазин не сообщил этот параметр (например, размеры в выдаче), проверить нельзя.
const FACTOR = { ok: 1, any: 1, near: 0.5, unk: 0.5, no: 0 };
export const GLYPH = { ok: '✓', near: '≈', no: '✕', any: '—', unk: '?' };
const LABEL = { brand: 'Бренд', size: 'Размер', color: 'Цвет', price: 'Цена' };
const KEYS = ['brand', 'size', 'color', 'price'];

/** Оценивает товар по критериям: процент соответствия, пояснение и разбор по пунктам. */
export function matchProduct(p, c = {}) {
  const r = {};
  const lc = (x) => x.toLowerCase();
  r.brand = c.brands && c.brands.length
    ? (!p.brand ? { s: 'unk', t: 'магазин не указал бренд' }
      : c.brands.some((b) => lc(b) === lc(p.brand)) ? { s: 'ok', t: 'совпадает — ' + p.brand } : { s: 'no', t: 'другой бренд — ' + p.brand })
    : { s: 'any', t: 'не важен' };
  const sizes = p.sizes || [];
  const sizesOut = p.sizesOut || [];
  r.size = c.size
    ? (!sizes.length && sizesOut.length ? { s: 'no', t: 'нет в наличии ни одного размера' }
      : !sizes.length ? { s: 'unk', t: 'наличие ' + c.size + ' уточните в магазине' }
      : sizes.some((z) => sizeEq(z, c.size)) ? { s: 'ok', t: c.size + ' в наличии' }
        : sizes.some((z) => sizeNear(z, c.size)) ? { s: 'near', t: 'есть ' + sizes.filter((z) => sizeNear(z, c.size)).join(', ') + ' ≈ ' + c.size }
          : { s: 'no', t: 'нет ' + c.size + ', есть ' + sizes.join(', ') })
    : { s: 'any', t: 'не указан' };
  if (c.color && !p.color) r.color = { s: 'unk', t: 'магазин не указал цвет' };
  else if (c.color) {
    const cs = colorList(c.color);
    if (cs.includes(p.color)) r.color = { s: 'ok', t: p.color + ' — как в запросе' };
    else {
      const nb = cs.find((x) => (NEAR[x] || []).includes(p.color));
      r.color = nb
        ? { s: 'near', t: 'близкий: ' + p.color + ' вместо ' + genitive(nb) }
        : { s: 'no', t: p.color + ' вместо ' + genitiveList(cs) };
    }
  } else r.color = { s: 'any', t: 'не указан' };
  if (c.budget) {
    const d = Math.round(((p.price - c.budget) / c.budget) * 100);
    r.price = p.price <= c.budget
      ? { s: 'ok', t: d === 0 ? 'ровно в бюджет' : 'на ' + -d + '% ниже бюджета' }
      : { s: d <= 10 ? 'near' : 'no', t: 'на ' + d + '% выше бюджета' };
  } else r.price = { s: 'any', t: 'бюджет не указан' };

  const score = Math.round(KEYS.reduce((a, k) => a + WEIGHTS[k] * FACTOR[r[k].s], 0));

  const names = { brand: 'бренд', size: 'размер', color: 'цвет' };
  const ok = ['brand', 'size', 'color'].filter((k) => r[k].s === 'ok').map((k) => names[k]);
  const parts = [];
  if (ok.length) {
    parts.push((ok.length > 2 ? 'совпадают ' : 'совпадает ') +
      (ok.length === 1 ? ok[0] : ok.slice(0, -1).join(', ') + ' и ' + ok[ok.length - 1]));
  }
  if (r.brand.s === 'no') parts.push('другой бренд (' + p.brand + ')');
  if (r.size.s === 'no') parts.push('нет размера ' + c.size);
  if (r.size.s === 'near') parts.push('размер ' + r.size.t.replace('есть ', ''));
  if (r.color.s === 'near') parts.push('цвет близкий (' + r.color.t.replace('близкий: ', '') + ')');
  if (r.color.s === 'no') parts.push('другой цвет (' + p.color + ')');
  const unk = ['brand', 'size', 'color'].filter((k) => r[k].s === 'unk').map((k) => names[k]);
  if (unk.length) parts.push(unk.join(' и ') + ' — уточните в магазине');
  if (r.price.s === 'ok') parts.push('в пределах бюджета');
  else if (r.price.s !== 'any') parts.push('цена ' + r.price.t);
  if (!parts.length) parts.push('подходит по описанию запроса');

  return {
    score,
    summary: cap(parts.join(', ')),
    pills: KEYS.filter((k) => r[k].s !== 'any').map((k) => ({ key: k, label: LABEL[k], s: r[k].s })),
    reasons: KEYS.map((k, i) => ({ key: k, label: i + 1 + '. ' + LABEL[k], text: r[k].t, s: r[k].s })),
  };
}

/** Товары, которые попадают в выдачу: нужный размер есть в наличии или магазин не сообщил размеры. */
export const baseProducts = (items, crit) =>
  items.filter((p) => {
    if (!crit.size) return true;
    const known = (p.sizes && p.sizes.length) || (p.sizesOut && p.sizesOut.length);
    return !known || (p.sizes || []).some((z) => sizeEq(z, crit.size) || sizeNear(z, crit.size));
  });

const normSize = (x) => String(x).toLowerCase().replace(/\s*(ru|rus|eu|it|fr|int)$/i, '').trim();
/** «XS/42» → ['xs', '42']: у Lamoda размер указан сразу в двух системах. */
const sizeTokens = (x) => String(x).split(/[/,()]/).map(normSize).filter(Boolean);

/** Точное совпадение: «M» = «m», «38» = «38 RU», «XS/42» = «XS» и = «42». */
export function sizeEq(a, b) {
  const tb = sizeTokens(b);
  return sizeTokens(a).some((t) => tb.includes(t));
}

// Буквенные размеры одежды ↔ российские (как в таблицах размеров Lamoda/Stockmann, женская одежда).
const LETTER_RU = { xxs: [38, 40], xs: [40, 42], s: [42, 44], m: [44, 46], l: [46, 48], xl: [48, 50], xxl: [50, 52] };

/** Примерное совпадение буквенного и российского размера: «M» ≈ «44 RU» / «46 RU». */
export function sizeNear(a, b) {
  const ta = sizeTokens(a), tb = sizeTokens(b);
  const letters = (t) => t.filter((x) => LETTER_RU[x]);
  const nums = (t) => t.filter((x) => /^\d{2}$/.test(x));
  // Если буквенный размер указан с обеих сторон — сравниваем только буквы (это делает sizeEq).
  if (letters(ta).length && letters(tb).length) return false;
  const check = (ls, ns) => ls.some((l) => ns.some((n) => LETTER_RU[l].includes(+n)));
  return check(letters(ta), nums(tb)) || check(letters(tb), nums(ta));
}

export const emptyFilters = () => ({ stores: [], brands: [], sizes: [], colors: [], min: '', max: '' });
export const hasFilters = (f) => !!(f.stores.length || f.brands.length || f.sizes.length || f.colors.length || f.min || f.max);

const discount = (p) => (p.old ? 1 - p.price / p.old : 0);
const SORTERS = {
  match: (x, y) => y.m.score - x.m.score || x.p.price - y.p.price,
  priceAsc: (x, y) => x.p.price - y.p.price,
  priceDesc: (x, y) => y.p.price - x.p.price,
  discount: (x, y) => discount(y.p) - discount(x.p),
};

export function getResults(items, crit, filters, sort) {
  const sorter = SORTERS[sort] || SORTERS.match;
  const base = baseProducts(items, crit).map((p) => ({ p, m: matchProduct(p, crit) })).sort(sorter);
  const f = filters;
  const list = base.filter(({ p }) =>
    (!f.stores.length || f.stores.includes(p.store)) &&
    (!f.brands.length || f.brands.includes(p.brand)) &&
    (!f.sizes.length || f.sizes.some((z) => (p.sizes || []).includes(z))) &&
    (!f.colors.length || f.colors.includes(p.color)) &&
    (!f.min || p.price >= +f.min) &&
    (!f.max || p.price <= +f.max));
  return { base, list };
}

/** Чипы с параметрами поиска для шапки результатов и «Моих поисков». */
export function criteriaChips(c, stores, ds) {
  const brands = c.brands || [];
  const chips = [
    { k: 'Категория', v: ds === 'shoes' ? 'обувь' : 'одежда' },
    {
      k: brands.length > 1 ? 'Бренды' : 'Бренд',
      v: brands.length ? (brands.length > 2 ? brands.slice(0, 2).join(', ') + ' и ещё ' + (brands.length - 2) : brands.join(', ')) : 'любой',
      t: brands.join(', '),
    },
  ];
  if (c.size) chips.push({ k: 'Размер', v: c.size });
  if (c.color) chips.push({ k: colorList(c.color).length > 1 ? 'Цвета' : 'Цвет', v: colorStr(c.color) });
  if (c.budget) chips.push({ k: 'Бюджет', v: 'до ' + rub(c.budget) });
  chips.push({ k: 'Магазины', v: stores.length === STORE_NAMES.length ? 'все ' + stores.length : stores.join(', ') });
  return chips;
}

// ——— Сериализация поиска в URL, чтобы выдачу можно было обновить и отправить ссылкой ———

const SEP = '|';
export function runToParams(run) {
  const sp = new URLSearchParams();
  sp.set('q', run.q);
  sp.set('ds', run.ds);
  sp.set('stores', run.stores.join(SEP));
  if (run.crit.brands.length) sp.set('brands', run.crit.brands.join(SEP));
  if (run.crit.size) sp.set('size', run.crit.size);
  if (run.crit.color) sp.set('color', colorList(run.crit.color).join(SEP));
  if (run.crit.budget) sp.set('budget', String(run.crit.budget));
  return sp.toString();
}

export function runFromParams(sp) {
  const list = (k) => (sp.get(k) || '').split(SEP).map((x) => x.trim()).filter(Boolean);
  const stores = list('stores').filter((s) => STORE_NAMES.includes(s));
  const q = sp.get('q');
  if (!q || !stores.length) return null;
  const color = list('color');
  const budget = +(sp.get('budget') || '').replace(/\D/g, '') || null;
  return {
    q,
    ds: sp.get('ds') === 'shoes' ? 'shoes' : 'trench',
    stores,
    crit: { brands: list('brands'), size: sp.get('size') || null, color: color.length ? color : null, budget },
  };
}

export const runKey = (run) => runToParams(run);
