import { NEAR, STORE_NAMES, allBrands, brandKey } from '../data/catalog.js';
import { cap, rub } from './format.js';

export const colorList = (c) => [].concat(c || []);
const genitive = (c) => (c.endsWith('ый') ? c.slice(0, -2) + 'ого' : c.endsWith('ий') ? c.slice(0, -2) + 'его' : c);
const genitiveList = (c) => colorList(c).map(genitive).join(' / ');
export const colorStr = (c) => colorList(c).join(' / ');

// Основа слова → цвет в словарной форме: «бирюзовые», «голубая» → «бирюзовый», «голубой».
const COLOR_STEMS = [
  ['бежев', 'бежевый'], ['молочн', 'молочный'], ['песочн', 'песочный'], ['черн', 'чёрный'], ['хаки', 'хаки'],
  ['кремов', 'кремовый'], ['шоколад', 'шоколадный'], ['коричнев', 'коричневый'], ['графит', 'графитовый'], ['кэмел', 'кэмел'],
  ['бирюз', 'бирюзовый'], ['голуб', 'голубой'], ['мятн', 'мятный'], ['зелен', 'зелёный'], ['оливк', 'оливковый'], ['оливков', 'оливковый'],
  ['изумруд', 'изумрудный'], ['розов', 'розовый'], ['пудров', 'пудровый'], ['персик', 'персиковый'], ['коралл', 'коралловый'],
  ['красн', 'красный'], ['бордо', 'бордовый'], ['вишнев', 'бордовый'], ['винн', 'бордовый'], ['марсал', 'бордовый'], ['терракот', 'терракотовый'],
  ['рыж', 'рыжий'], ['оранж', 'оранжевый'], ['желт', 'жёлтый'], ['горчич', 'горчичный'], ['лимон', 'жёлтый'],
  ['фиолет', 'фиолетовый'], ['сирен', 'сиреневый'], ['лилов', 'лиловый'], ['лаванд', 'сиреневый'], ['фукси', 'фуксия'],
  ['золот', 'золотой'], ['серебр', 'серебряный'], ['бронз', 'бронзовый'], ['слонов', 'молочный'], ['айвори', 'молочный'], ['экрю', 'молочный'],
  ['антрацит', 'графитовый'], ['индиго', 'тёмно-синий'], ['ультрамарин', 'синий'], ['нюдов', 'бежевый'], ['таупе', 'коричневый'], ['мокко', 'коричневый'],
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
    if (/^(небесн|лазурн)/.test(w)) add('голубой');
  }
  return colors;
}

const brandRe = (b) => new RegExp('(^|[^a-zа-я0-9])' + escapeRe(norm(b)) + '(?=$|[^a-zа-я0-9])');

/** Бренды из списка, упомянутые в тексте; «Esprit» отбрасывается, если нашёлся «Esprit Casual». */
export function detectBrands(text) {
  const low = norm(text);
  return allBrands()
    .filter((b) => brandRe(b).test(low))
    .filter((b, _, arr) => !arr.some((o) => o !== b && o.toLowerCase().includes(b.toLowerCase())));
}

// Аксессуары: размер для них не нужен.
const ACC_RE = /чемодан|саквояж|дорожн[а-я]* (?:сумк|кейс|несессер)|кейс|сумк|сумоч|рюкзак|клатч|шоппер|кошел|портмоне|бумажник|картхолдер|визитниц|косметичк|ремень|ремн|шарф|платок|платк|палантин|очки|часы|зонт|украшен|серьг|браслет|колье|кулон|подвеск|кольц|брошь|бижутер|перчатк|варежк|кепк|берет|панам|шапк|аксессуар|чехол|брелок/;

// Товары для дома: размер одежды и «для кого» не нужны. Проверяем начало слов.
const HOME_WORD = /^(постел|простын|пододеяльн|наволоч|полотенц|плед|покрывал|подушк|одеял|наматрасник|матрас|скатерт|салфетк|штор|занавес|тюл|ков[её]р|ковр|коврик|посуд|сервиз|тарелк|блюд[оа]|чашк|кружк|бокал|фужер|стакан|кастрюл|сковород|чайник|кофевар|кофемаш|турк|блендер|миксер|тостер|свеч|подсвечник|диффузор|аромадиффузор|ароматизатор|ваз[аыу]?$|интерьер|кухон|текстил|декор$|полотенцедержател|вешалк|корзин|органайзер|шкатулк|рамк|подставк|термос|графин|кувшин|солонк|ножи$|разделочн)/;
const isHomeQuery = (low) => /для дома|для кухни|для ванн|для спальн/.test(low) || low.split(/[^a-zа-я0-9]+/).some((w) => HOME_WORD.test(w));

/** Размер белья в тексте запроса: «евро», «2-спальный», «1,5 сп», «полуторное». */
export const BED_SIZE = String.raw`(евро\s*-?\s*макси|евромакси|евро|семейн[а-я]*|двуспальн[а-я]*|односпальн[а-я]*|полуторн[а-я]*(?:\s*-?\s*спальн[а-я]*)?|(?:1[,.]5|2|1|двух)\s*-?\s*(?:х\s*)?(?:спальн[а-я]*|сп\.?))`;
/** Размер постельного белья: «2-спальный», «евро», «семейный» → общий ключ; null — не размер белья. */
export function bedKey(x) {
  const t = String(x || '').toLowerCase().replace(/ё/g, 'е');
  if (/евро\s*-?\s*макси|евромакси|king/.test(t)) return 'евромакси';
  if (/евро/.test(t)) return 'евро';
  if (/семейн|дуэт/.test(t)) return 'семейный';
  if (/(1[,.]5|полутор)/.test(t) && /сп/.test(t)) return '1,5-спальный';
  if (/(^|\D)2(\D|$)|двух|двусп|двуx/.test(t) && /сп/.test(t)) return '2-спальный';
  if (/(^|\D)1(\D|$)|односп/.test(t) && /сп/.test(t)) return '1-спальный';
  return null;
}
/** Нужен ли размер для категории: у аксессуаров и товаров для дома — нет. */
export const sizeRequired = (ds) => ds === 'trench' || ds === 'shoes';

// Одежда: только для неё нужен размер XS–XXL / 42–56. Всё, что не распознано ни как одежда,
// ни как обувь, аксессуар или товар для дома, ищется без обязательного размера («прочее»).
const CLOTHES_WORD = /^(одежд|тренч|плащ|пальт|куртк|пуховик|парк[аи]$|бомбер|ветровк|анорак|дублен|шуб|жилет|жакет|пиджак|блейзер|костюм|плать|сарафан|юбк|брюк|джинс|шорт|бридж|кюлот|леггинс|легинс|лосин|комбинезон|блуз|рубаш|сорочк|туник|футболк|лонгслив|майк|топ(ы|ик)?$|боди$|корсет|свитер|джемпер|пуловер|кардиган|водолазк|худи|толстовк|свитшот|олимпийк|кофт|пижам|халат|купальн|плавк|трус|бюстгальтер|бюстье|бель[её]$|колгот|чулк|носк|носоч|гольф[ыа]$|кимоно|жакетн|брючн|вечерн|одеж)/;
const isClothesQuery = (low) => low.split(/[^a-zа-я0-9]+/).some((w) => CLOTHES_WORD.test(w));

// ——— Для кого ———
export const GENDER_LABEL = { women: 'женщинам', men: 'мужчинам', girls: 'девочкам', boys: 'мальчикам', kids: 'детям' };
/** Пол из текста запроса: «женские», «для мужчин», «для девочки»… */
export function detectGender(text) {
  const low = norm(String(text || ''));
  if (/(^|[^а-я])(девоч|для девоч)/.test(low)) return 'girls';
  if (/(^|[^а-я])(мальч|для мальч)/.test(low)) return 'boys';
  if (/(^|[^а-я])(детск|для дет|ребен)/.test(low)) return 'kids';
  if (/(^|[^а-я])(женск|женщин|для женщин)/.test(low)) return 'women';
  if (/(^|[^а-я])(мужск|мужчин|для мужчин)/.test(low)) return 'men';
  return null;
}
const GENDER_OK = { women: ['women', 'unisex'], men: ['men', 'unisex'], kids: ['kids', 'girls', 'boys', 'unisex'], girls: ['girls', 'kids', 'unisex'], boys: ['boys', 'kids', 'unisex'] };
/** Товар другого пола (если пол товара известен). */
export const genderMismatch = (p, g) => !!g && !!p.gender && !(GENDER_OK[g] || [g]).includes(p.gender);
const GENDER_ITEM = { women: 'женские', men: 'мужские', girls: 'для девочек', boys: 'для мальчиков', kids: 'детские', unisex: 'унисекс' };

export const categoryLabel = (ds) => (ds === 'shoes' ? 'обувь' : ds === 'acc' ? 'аксессуары' : ds === 'home' ? 'товары для дома' : ds === 'other' ? 'прочее' : 'одежда');

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

  let ds = 'other';
  if (isHomeQuery(low)) ds = 'home';
  else if (/кед|кросс|обув|ботин|ботильон|туфл|лофер|мокасин|сапог|сандал|босонож|балетк|мюли|слипон|оксфорд|дерби|челси|сабо|шлепанц|шлёпанц|эспадриль|тапоч|угги/.test(low)) ds = 'shoes';
  else if (ACC_RE.test(low)) ds = 'acc';
  else if (isClothesQuery(low)) ds = 'trench';
  else if (!/тренч|плащ|одежд|пальт|куртк/.test(low) && cats.includes('Обувь') && !cats.includes('Одежда')) ds = 'shoes';
  else if (!/тренч|плащ|одежд|пальт|куртк/.test(low) && cats.length === 1 && cats[0] === 'Аксессуары') ds = 'acc';
  else if (!/тренч|плащ|одежд|пальт|куртк/.test(low) && cats.length === 1 && cats[0] === 'Товары для дома') ds = 'home';
  // Буквенный или «NN размер» в запросе без названия вещи — это одежда.
  if (ds === 'other' && (size || /размер/.test(low))) ds = 'trench';

  // Товары для дома: размер — только размер постельного белья, пол не учитываем.
  if (ds === 'home') {
    const bed = low.match(new RegExp(BED_SIZE + '(?=[^а-яa-z0-9]|$)'));
    const key = bed ? bedKey(bed[0] + (/евро|семейн/.test(bed[0]) ? '' : ' сп')) : null;
    return { color: colors.length ? colors : null, size: key, budget, brands, ds, gender: null };
  }

  // Размер без слова «размер»: «лоферы 40», «платье 46» (не бюджет «до 40 000»).
  if (!size && sizeRequired(ds)) {
    const bare = low.replace(/до\s*\d[\d\s]*(к|тыс)?/g, ' ').match(/(^|[^\d])(3[3-9]|[45]\d|6[0-2])(?=[^\d]|$)/);
    if (bare) size = bare[2];
  }
  return { color: colors.length ? colors : null, size, budget, brands, ds, gender: detectGender(q) };
}

/** Какие параметры нужно уточнить перед поиском. */
export function missingCriteria(crit, ds) {
  const m = [];
  if (!crit.size && (sizeRequired(ds) || ds === 'home')) m.push('size'); // для дома размер спрашиваем, но он необязателен
  if (!crit.brands.length) m.push('brand');
  if (!crit.color) m.push('color');
  if (!crit.budget) m.push('budget');
  return m;
}

const WEIGHTS = { brand: 40, size: 30, color: 20, price: 10 };
// unk — магазин не сообщил этот параметр, подтвердить совпадение нельзя: баллов не даёт
// (иначе «ничего не известно» оценивалось выше, чем «совпал размер»).
const FACTOR = { ok: 1, any: 1, near: 0.5, unk: 0, no: 0 };
export const GLYPH = { ok: '✓', near: '≈', no: '✕', any: '—', unk: '?' };
const LABEL = { brand: 'Бренд', size: 'Размер', color: 'Цвет', price: 'Цена' };
const KEYS = ['brand', 'size', 'color', 'price'];

/** Оценивает товар по критериям: процент соответствия, пояснение и разбор по пунктам. */
export function matchProduct(p, c = {}) {
  const r = {};
  r.brand = c.brands && c.brands.length
    ? (!p.brand ? { s: 'unk', t: 'магазин не указал бренд' }
      : c.brands.some((b) => brandKey(b) === brandKey(p.brand)) ? { s: 'ok', t: 'совпадает — ' + p.brand } : { s: 'no', t: 'другой бренд — ' + p.brand })
    : { s: 'any', t: 'не важен' };
  const sizes = p.sizes || [];
  const sizesOut = p.sizesOut || [];
  r.size = c.size && bedKey(c.size) && ![...sizes, ...sizesOut].some(bedKey)
    ? (sizes.length ? { s: 'unk', t: 'размеры: ' + sizes.join(', ') + ' — сверьте с ' + c.size } : { s: 'unk', t: 'наличие ' + c.size + ' уточните в магазине' })
    : c.size
    ? (!sizes.length && sizesOut.length ? { s: 'no', t: 'нет в наличии ни одного размера' }
      : !sizes.length ? { s: 'unk', t: 'наличие ' + c.size + ' уточните в магазине' }
      : sizes.some((z) => sizeEq(z, c.size) && !isUniversalSize(z)) ? { s: 'ok', t: c.size + ' в наличии' }
        : sizes.some(isUniversalSize) ? { s: 'ok', t: 'единый размер' }
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
      ? { s: 'ok', t: d === 0 ? 'ровно в бюджет' : 'на ' + -d + '\u00a0% ниже бюджета' }
      : { s: d <= 10 ? 'near' : 'no', t: 'на ' + d + '\u00a0% выше бюджета' };
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
    summary: cap(parts.join(', ')) + '.',
    pills: KEYS.filter((k) => r[k].s !== 'any').map((k) => ({ key: k, label: LABEL[k], s: r[k].s })),
    reasons: KEYS.map((k, i) => ({ key: k, label: i + 1 + '. ' + LABEL[k], text: r[k].t, s: r[k].s })),
  };
}

/** Товары, которые попадают в выдачу: нужный размер есть в наличии или магазин не сообщил размеры. */
export const baseProducts = (items, crit) =>
  items.filter((p) => {
    if (!crit.size) return true;
    // Размер белья («евро») проверяем, только если магазин назвал размеры так же, а не в сантиметрах.
    const all = [...(p.sizes || []), ...(p.sizesOut || [])];
    const known = bedKey(crit.size) ? all.some(bedKey) : all.length;
    return !known || (p.sizes || []).some((z) => sizeEq(z, crit.size) || sizeNear(z, crit.size));
  });

// «Без размера», OneSize и т. п. подходят под любой запрошенный размер.
const UNIVERSAL = /^(без размера|one ?size|onesize|ns|uni|единый|универсальн)/i;
export const isUniversalSize = (z) => UNIVERSAL.test(String(z).trim());

const normSize = (x) => String(x).toLowerCase().replace(/\s*(ru|rus|eu|it|fr|int)$/i, '').trim();
/** «XS/42» → ['xs', '42']: у Lamoda размер указан сразу в двух системах. */
/** «XS/42» → ['xs', '42']; диапазон «39-41» → ['39', '40', '41'] (так размечают тапочки, носки). */
const sizeTokens = (x) => String(x).split(/[/,()]/).map(normSize).filter(Boolean).flatMap((t) => {
  const r = t.match(/^(\d{2})\s*[-–—]\s*(\d{2})$/);
  if (!r || +r[2] <= +r[1] || +r[2] - +r[1] > 4) return [t];
  return Array.from({ length: +r[2] - +r[1] + 1 }, (_, i) => String(+r[1] + i));
});

/** Точное совпадение: «M» = «m», «38» = «38 RU», «XS/42» = «XS» и = «42». */
export function sizeEq(a, b) {
  if (isUniversalSize(a) || isUniversalSize(b)) return true;
  const ka = bedKey(a), kb = bedKey(b);
  if (ka || kb) return ka === kb;
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

const SORTERS = {
  match: (x, y) => y.m.score - x.m.score || x.p.price - y.p.price,
  priceAsc: (x, y) => x.p.price - y.p.price,
  priceDesc: (x, y) => y.p.price - x.p.price,
};

// ——— Тип товара ———
// Поиск магазина приводит слова к основе: «брючный костюм» находит брюки. Поэтому тип товара
// определяем по названию и отсеиваем товары другого типа. Синонимы — в одной группе.
const TYPE_GROUPS = [
  ['костюм', /^костюм/], ['брюки', /^брюк(и|ах|ами|ов)?$/], ['джинсы', /^джинс(ы|ах|ов)?$/], ['юбка', /^юбк/],
  ['платье', /^плать/], ['жакет', /^(жакет|пиджак|блейзер)/], ['жилет', /^жилет/], ['блузка', /^блуз/], ['рубашка', /^рубаш/],
  ['футболка', /^(футболк|лонгслив)/], ['топ', /^топ(ы|ик)?$/], ['свитер', /^(свитер|джемпер|пуловер)/], ['кардиган', /^кардиган/],
  ['худи', /^(худи|толстовк|свитшот)/], ['пальто', /^пальт/], ['куртка', /^(куртк|бомбер|ветровк|парк[аи]$)/], ['пуховик', /^пуховик/],
  ['тренч', /^(тренч|плащ)/], ['шорты', /^шорт/], ['комбинезон', /^комбинезон/], ['водолазка', /^водолазк/],
  ['леггинсы', /^(леггинс|легинс|лосин)/], ['пижама', /^(пижам|халат)/], ['купальник', /^(купальн|плавк)/],
  ['бельё', /^(трус|бюстгальтер|бюстье)/], ['колготки', /^(колгот|чулк)/], ['носки', /^(носк|носоч|подследник)/],
  ['сумка', /^(сумк|сумоч|клатч|шоппер|портфел|саквояж|кроссбоди|хобо|тоут|тоте|багет|торб|ридикюл|бананк)/],
  ['рюкзак', /^рюкзак/], ['чемодан', /^(чемодан|кейс$)/], ['кошелёк', /^(кошел|портмоне|бумажник|картхолдер|визитниц)/],
  ['ремень', /^(ремень|ремн|пояс$)/], ['шарф', /^(шарф|платок|палантин|снуд|косынк)/],
  ['шапка', /^(шапк|шапоч|берет|балаклав)/], ['кепка', /^(кепк|бейсболк|панам)/], ['шляпа', /^шляп/],
  ['перчатки', /^(перчат|варежк|митенк)/], ['галстук', /^галстук/], ['запонки', /^запонк/],
  ['очки', /^очк/], ['часы', /^час(ы|ов)$/], ['зонт', /^зонт/],
  ['украшение', /^(серьг|серёж|сереж|браслет|кольц|колье|цепоч|подвес|кулон|брош|ожерель|бусы|чокер)/],
  ['косметичка', /^(косметич|несессер)/], ['ключница', /^(ключниц|брелок|брелк)/], ['обложка', /^обложк/], ['чехол', /^(чехол|чехл)/],
  ['парфюм', /^(парфюм|духи)/],
  ['постельное бельё', /^(постельн|простын|пододеяльн|наволоч)/], ['полотенце', /^полотен/], ['плед', /^(плед|покрывал)/],
  ['подушка', /^подушк/], ['одеяло', /^одеял/], ['скатерть', /^скатерт/], ['шторы', /^(штор|занавес|тюл)/],
  ['ковёр', /^(ков[её]р|ковр|коврик)/], ['свеча', /^(свеч|подсвечник)/], ['диффузор', /^(диффузор|аромадиффузор)/],
  ['посуда', /^(посуд|сервиз|тарелк|блюд[оа]$|чашк|кружк|бокал|фужер|стакан|кастрюл|сковород)/],
  ['лоферы', /^лофер/], ['ботильоны', /^ботильон/], ['ботинки', /^ботин/], ['кеды', /^кед/], ['кроссовки', /^кроссовк/],
  ['туфли', /^туфл/], ['сапоги', /^сапог/], ['мокасины', /^мокасин/], ['босоножки', /^босонож/], ['сандалии', /^сандал/],
  ['балетки', /^балетк/], ['мюли', /^мюли/], ['сабо', /^сабо$/],
  ['тапочки', /^(тапоч|тапк|чешк)/], ['шлёпанцы', /^(шлепанц|шлепк|сланц|вьетнамк)/], ['слипоны', /^слипон/], ['эспадрильи', /^эспадрил/],
  ['угги', /^угг/], ['валенки', /^валенк/], ['полусапоги', /^полусапог/], ['ботфорты', /^ботфорт/], ['оксфорды', /^оксфорд/],
  ['дерби', /^дерби$/], ['броги', /^броги?$/], ['кроксы', /^крокс/],
];
/** Типы товара, упомянутые в тексте: «Брючный костюм» → ['костюм'] («брючный» — не брюки). */
export function detectTypes(text) {
  // Слово после «для» — не тип товара: «Ремень для сумки» — ремень, а не сумка.
  const words = norm(String(text || '')).split(/[^a-zа-я0-9]+/).filter(Boolean).filter((w, i, a) => a[i - 1] !== 'для');
  const out = [];
  for (const [name, re] of TYPE_GROUPS) if (words.some((w) => re.test(w)) && !out.includes(name)) out.push(name);
  return out;
}
/** Прилагательные, которые поиск магазина путает с другим товаром: «брючный» → брюки. */
export const CONFUSING_ADJ = /(^|[\s,])(брючн|юбочн|джинсов|пальтов|платьев|рубашечн|курточ|жакетн)[а-яё]*(?=[\s,]|$)/i;

/**
 * opts.types — типы товара из запроса; товары с другим типом в названии не входят в выдачу
 * (возвращаются в hidden), если не задано opts.showOther.
 */
/** Одна и та же вещь у магазина несколькими предложениями (разные продавцы) — оставляем самую дешёвую. */
function dedupe(items) {
  const byKey = new Map();
  for (const p of items) {
    const k = [p.store, brandKey(p.brand), norm(p.title || '').replace(/[^a-zа-я0-9]+/g, ' ').trim(), p.image && !String(p.image).startsWith('data:') ? p.image : 'url:' + p.url].join('|');
    const cur = byKey.get(k);
    if (!cur || p.price < cur.price) byKey.set(k, p);
  }
  const keep = new Set(byKey.values());
  return items.filter((p) => keep.has(p));
}

/**
 * В выдачу попадают только вещи, которые подтверждённо подходят по заданным размеру и цвету,
 * нужного типа и для нужного пола. Остальные — в hidden с причинами (их можно показать: opts.showOther).
 * opts.types — типы товара из запроса.
 */
export function getResults(items, crit, filters, sort, opts = {}) {
  const sorter = SORTERS[sort] || SORTERS.match;
  const types = opts.types || [];
  const reasonOf = (p) => {
    if (types.length) { const t = detectTypes(p.title); if (t.length > 0 && !t.some((x) => types.includes(x))) return 'type'; }
    if (genderMismatch(p, crit.gender)) return 'gender';
    const m = matchProduct(p, crit);
    if (crit.size && m.reasons[1].s === 'no') return 'size';
    // Размер белья в сантиметрах («200×220») сверить с «евро» нельзя — такие комплекты не прячем.
    if (crit.size && m.reasons[1].s === 'unk' && !(bedKey(crit.size) && (p.sizes || []).length)) return 'sizeUnk';
    if (crit.color && m.reasons[2].s === 'no') return 'color';
    if (crit.color && m.reasons[2].s === 'unk') return 'colorUnk';
    return null;
  };
  const all = dedupe(items).map((p) => ({ p, why: reasonOf(p) }));
  const hiddenList = all.filter((x) => x.why);
  const pool = (opts.showOther ? all : all.filter((x) => !x.why)).map((x) => x.p);
  const base = pool.map((p) => ({ p, m: matchProduct(p, crit) })).sort(sorter);
  const f = filters;
  const list = base.filter(({ p }) =>
    (!f.stores.length || f.stores.includes(p.store)) &&
    (!f.brands.length || f.brands.includes(p.brand)) &&
    (!f.sizes.length || f.sizes.some((z) => (p.sizes || []).includes(z))) &&
    (!f.colors.length || f.colors.includes(p.color)) &&
    (!f.min || p.price >= +f.min) &&
    (!f.max || p.price <= +f.max));
  const count = (w) => hiddenList.filter((x) => x.why === w).length;
  // Причины, почему вещи скрыты, — для строки над выдачей.
  const hiddenWhy = [
    count('type') && 'другого типа (' + [...new Set(hiddenList.filter((x) => x.why === 'type').flatMap((x) => detectTypes(x.p.title)))].join(', ') + ') — ' + count('type'),
    count('gender') && [...new Set(hiddenList.filter((x) => x.why === 'gender').map((x) => GENDER_ITEM[x.p.gender] || x.p.gender))].join(', ') + ' — ' + count('gender'),
    count('size') && 'нет размера ' + crit.size + ' — ' + count('size'),
    count('sizeUnk') && 'магазин не указал размеры — ' + count('sizeUnk'),
    count('color') && 'другого цвета — ' + count('color'),
    count('colorUnk') && 'магазин не указал цвет — ' + count('colorUnk'),
  ].filter(Boolean);
  const hiddenTypes = [...new Set(hiddenList.filter((x) => x.why === 'type').flatMap((x) => detectTypes(x.p.title)))];
  const hiddenGenders = [...new Set(hiddenList.filter((x) => x.why === 'gender').map((x) => GENDER_ITEM[x.p.gender] || x.p.gender))];
  return { base, list, hidden: hiddenList.length, hiddenWhy, hiddenTypes, hiddenGenders };
}

/** Чипы с параметрами поиска для шапки результатов и «Моих поисков». */
export function criteriaChips(c, stores, ds) {
  const brands = c.brands || [];
  const chips = [
    { k: 'Категория', v: categoryLabel(ds) },
    {
      k: brands.length > 1 ? 'Бренды' : 'Бренд',
      v: brands.length ? (brands.length > 2 ? brands.slice(0, 2).join(', ') + ' и ещё ' + (brands.length - 2) : brands.join(', ')) : 'любой',
      t: brands.join(', '),
    },
  ];
  if (c.size) chips.push({ k: 'Размер', v: c.size });
  if (c.color) chips.push({ k: colorList(c.color).length > 1 ? 'Цвета' : 'Цвет', v: colorStr(c.color) });
  if (c.budget) chips.push({ k: 'Бюджет', v: 'до ' + rub(c.budget) });
  if (c.gender) chips.push({ k: 'Для кого', v: GENDER_LABEL[c.gender] || c.gender });
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
  if (run.crit.gender) sp.set('gender', run.crit.gender);
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
    ds: ['shoes', 'acc', 'home', 'other'].includes(sp.get('ds')) ? sp.get('ds') : 'trench',
    stores,
    crit: {
      brands: list('brands'), size: sp.get('size') || null, color: color.length ? color : null, budget,
      ...(GENDER_LABEL[sp.get('gender')] ? { gender: sp.get('gender') } : {}),
    },
  };
}

export const runKey = (run) => runToParams(run);
