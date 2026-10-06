// Размеры: разбор меток («M/46», «EU 39», «75B», «евро»), эквиваленты и сравнение запроса с размером вещи.
// Данные — src/data/sizes.json (собрано в 2026-10, см. docs/knowledge-base.md).
import SIZE_DATA from '../data/sizes.json';

const DATA = SIZE_DATA;
const T = DATA.tables;
export { DATA };

export const SYSTEMS = ['clothesWomen', 'clothesMen', 'jeans', 'shoesWomen', 'shoesMen', 'kids', 'kidsShoes', 'bra', 'tights', 'rings', 'belts', 'gloves', 'hats', 'bedding'];

const half = (x) => Math.round(x * 2) / 2;
const fmt = (x) => String(+(+x).toFixed(2));
const LETTER_ORDER = ['3XS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'];
const normLetter = (x) => {
  const t = String(x).toUpperCase().replace(/\s+/g, '');
  const m = t.match(/^([2-6])X([SL])$/); if (m) return m[1] === '2' ? 'XX' + m[2] : m[1] + 'X' + m[2];
  const n = t.match(/^(X{3,6})([SL])$/); if (n) return n[1].length + 'X' + n[2];
  return LETTER_ORDER.includes(t) ? t : null;
};
const letterSpan = (a, b) => { const i = LETTER_ORDER.indexOf(a), j = LETTER_ORDER.indexOf(b); return i >= 0 && j > i ? LETTER_ORDER.slice(i, j + 1) : null; };

// ——— Постельное бельё (как bedKey в src/lib/search.js, плюс king/queen/дуэт/детский) ———
export function bedKey(x) {
  const t = String(x || '').toLowerCase().replace(/ё/g, 'е');
  if (/евро\s*-?\s*макси|евромакси|king/.test(t)) return 'евромакси';
  if (/евро|euro|queen/.test(t)) return 'евро';
  if (/семейн|дуэт|family/.test(t)) return 'семейный';
  if (/детск|ясельн/.test(t)) return 'детский';
  if (/(1[,.]5|полутор)/.test(t) && /сп|полутор/.test(t)) return '1,5-спальный';
  if ((/(^|\D)2(\D|$)|двух|двусп/.test(t) && /сп/.test(t)) || /double/.test(t)) return '2-спальный';
  if ((/(^|\D)1(\D|$)|односп/.test(t) && /сп/.test(t)) || /single/.test(t)) return '1-спальный';
  return null;
}

const UNIVERSAL = /^(без размера|one ?size|onesize|ns|uni|единый|универсальн)/i;
const SYS_WORD = { ru: 'ru', rus: 'ru', рос: 'ru', рф: 'ru', eu: 'eu', eur: 'eu', евр: 'eu', it: 'it', fr: 'fr', de: 'de', uk: 'uk', gb: 'uk', us: 'us', usa: 'us', int: 'int', cm: 'cm', см: 'cm', iso: 'iso', mm: 'mm', мм: 'mm' };
const SYS_RE = '(ru|rus|рос|рф|eu|eur|евр|it|fr|de|uk|gb|us|usa|int|cm|см|iso|mm|мм)';
const CUP = '(aa|ddd|dd|ff|a|b|c|d|e|f|g|h)';

/** Разбор метки размера на части: [{sys, v}|{sys:'int', v:'M'}|{sys, band, cup}|{sys:'w', v, l}|{sys:'age', months}]. */
export function parse(label, system) {
  let s = String(label ?? '').toLowerCase().replace(/ё/g, 'е').replace(/ /g, ' ').trim();
  if (!s) return { parts: [] };
  if (UNIVERSAL.test(s)) return { universal: true, parts: [] };
  if (system === 'bedding') { const k = bedKey(s); return { bed: k, parts: k ? [{ sys: 'bed', v: k }] : [] }; }
  s = s.replace(/(?:^|\s)(?:размер[а-я]*|р-р|р\.|size)(?=\s|$|\d)/g, ' ').replace(/(\d)\s*-?\s*(?:й|го|ой)\b/g, '$1')
    .replace(/(\d),(\d)(?!\d)/g, '$1.$2').replace(/½/g, '.5').replace(/⅓/g, '.33').replace(/⅔/g, '.67')
    .replace(/(\d+)\s+(\d)\/(\d)(?!\d)/g, (_, a, b, c) => fmt(+a + b / c)).replace(/\s+/g, ' ').trim();
  // Джинсы: «W28 L32», «W28/L32», «28/32», «28x32».
  const jw = s.match(/^w\s*(\d{2})(?:\s*[/ ]?\s*l\s*(\d{2}))?$/) || (system === 'jeans' && s.match(/^(\d{2})\s*[/x]\s*(\d{2})$/));
  if (jw) return { parts: [{ sys: 'w', v: +jw[1], l: jw[2] ? +jw[2] : null }] };
  const parts = [];
  for (let p of s.split(/\s*(?:[/;|(),]|\sили\s)\s*/)) {
    p = p.trim(); if (!p) continue;
    let sys = null;
    const pre = p.match(new RegExp('^' + SYS_RE + '\\.?\\s*(?:([wm])\\s+)?(.+)$'));
    const suf = p.match(new RegExp('^(.+?)\\s*' + SYS_RE + '(?:\\s*([wm]))?$'));
    if (pre && /\d|^[xsml]/.test(pre[3])) { sys = SYS_WORD[pre[1]]; p = pre[3].trim(); }
    else if (suf) { sys = SYS_WORD[suf[2]]; p = suf[1].trim(); }
    parts.push(...parsePart(p, sys, system));
  }
  return { parts };
}

function parsePart(p, sys, system) {
  let m;
  if ((m = p.match(/^w\s*(\d{2})$/))) return [{ sys: 'w', v: +m[1], l: null }];
  const L = normLetter(p); if (L) return [{ sys: 'int', v: L }];
  if ((m = p.match(/^([2-6]?x{0,3}[sml])\s*[-–—]\s*([2-6]?x{0,3}[sml])$/))) {
    const span = letterSpan(normLetter(m[1]), normLetter(m[2])); if (span) return span.map((v) => ({ sys: 'int', v }));
  }
  if ((m = p.match(new RegExp('^(\\d{1,3})\\s*-?\\s*' + CUP + '$'))) || (m = p.match(new RegExp('^' + CUP + '\\s*(\\d{1,3})$')))) {
    const [band, cup] = /^\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    return [{ sys: sys || 'auto', band, cup: cup.toUpperCase() }];
  }
  if ((m = p.match(/^(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?\s*(лет|года?|год|y|yrs?|years?|a|ans|t|мес|м|m|months?)$/))) {
    const k = /^(мес|м|m|months?)$/.test(m[3]) ? 1 : 12;
    return [{ sys: 'age', from: m[2] ? +m[1] * k : null, months: +(m[2] || m[1]) * k }];
  }
  if ((m = p.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*[-–—]\s*(\d{1,3}(?:\.\d{1,2})?)$/))) {
    const a = +m[1], b = +m[2];
    if (b > a && b - a <= 12) return [{ sys: sys || 'auto', range: [a, b] }];
  }
  if ((m = p.match(/^(\d{1,3}(?:\.\d{1,3})?)$/))) return [{ sys: sys || 'auto', v: +m[1] }];
  return [{ sys: 'raw', v: p }];
}

// ——— Ключи: всё приводится к одной «опорной» шкале системы ———
const between = (a, b, step, grid) => (grid ? grid.filter((x) => x >= a && x <= b) : Array.from({ length: Math.floor((b - a) / step + 1e-9) + 1 }, (_, i) => +(a + i * step).toFixed(2)));
const CLOTHES = {
  clothesWomen: { rows: T.clothesWomen, letters: DATA.letterRu.women, off: { ru: 0, eu: 6, de: 6, fr: 4, it: 2, uk: 34, us: 38 } },
  clothesMen: { rows: T.clothesMen, letters: DATA.letterRu.men, off: { ru: 0, eu: 0, de: 0, fr: 0, it: 0, uk: 10, us: 10 } },
};
const ruFromW = (w) => (w % 2 === 0 ? [w + 16] : [w + 15, w + 17]);
const KID_H = T.kids.map((r) => r.height);
const BRA_CUPS = T.braCups;
const SHOES = { shoesWomen: T.shoesWomen, shoesMen: T.shoesMen };

/** Части метки → { nums: ключи по числам, lets: буквы, letKeys: ключи по буквам, raw }. */
function keysOf(label, system) {
  const pr = parse(label, system);
  const out = { universal: !!pr.universal, nums: new Set(), lets: new Set(), letKeys: new Set(), raw: new Set(), wl: [] };
  const addN = (k) => out.nums.add(typeof k === 'number' ? fmt(k) : k);
  for (const x of pr.parts) {
    if (x.sys === 'raw') { out.raw.add(x.v); continue; }
    const vals = x.range ? null : x.v;
    if (system === 'bedding') { addN(x.v); continue; }
    if (CLOTHES[system]) {
      const c = CLOTHES[system];
      if (x.sys === 'int') { out.lets.add(x.v); (c.letters[x.v] || []).forEach((k) => out.letKeys.add(fmt(k))); continue; }
      if (x.sys === 'w') { ruFromW(x.v).forEach(addN); continue; }
      const sys = x.sys === 'auto' ? 'ru' : x.sys; const off = c.off[sys]; if (off == null) continue;
      if (x.range) between(x.range[0] + off, x.range[1] + off, 2).forEach(addN); else addN(vals + off);
      continue;
    }
    if (system === 'jeans') {
      if (x.sys === 'w') { out.wl.push([x.v, x.l]); addN(x.v); continue; }
      if (x.sys === 'int') { out.lets.add(x.v); continue; }
      if (x.sys === 'ru') { if (x.range) between(x.range[0] - 16, x.range[1] - 16, 1).forEach(addN); else addN(vals - 16); continue; }
      if (x.v >= 22 && x.v <= 44) { addN(x.v); out.wl.push([x.v, null]); }
      continue;
    }
    if (SHOES[system]) {
      const rows = SHOES[system];
      const one = (v, sys) => {
        if (sys === 'ru' || sys === 'auto') return [half(v)];
        if (sys === 'eu' || sys === 'fr' || sys === 'de' || sys === 'it') return [half(v - 1)];
        if (sys === 'uk' || sys === 'us') return rows.filter((r) => r[sys] === v).map((r) => r.ru);
        if (sys === 'cm') { const best = Math.min(...rows.map((r) => Math.abs(r.cm - v))); return best <= 0.35 ? rows.filter((r) => Math.abs(r.cm - v) - best < 0.01).map((r) => r.ru) : []; }
        return [];
      };
      if (x.range) { const [a, b] = x.range.map((v) => one(v, x.sys)[0]); if (a != null && b != null) between(a, b, 0.5).forEach(addN); }
      else if (vals != null) one(vals, x.sys).forEach(addN);
      continue;
    }
    if (system === 'kidsShoes') {
      const rows = T.kidsShoes;
      if (x.sys === 'cm') { rows.filter((r) => Math.abs(r.cm - vals) <= 0.35).forEach((r) => addN(r.eu)); continue; }
      if (x.sys === 'uk' || x.sys === 'us') { rows.filter((r) => parseFloat(r[x.sys]) === vals && !/[YвV]/.test(r[x.sys])).forEach((r) => addN(r.eu)); continue; }
      if (x.range) between(x.range[0], x.range[1], 0.5).forEach(addN); else if (vals != null) addN(half(vals));
      continue;
    }
    if (system === 'kids') {
      const near = (h) => KID_H.reduce((b, k) => (Math.abs(k - h) < Math.abs(b - h) ? k : b), KID_H[0]);
      if (x.sys === 'age') {
        const rows = x.from != null ? T.kids.filter((r) => r.ageMonths[0] === x.from && r.ageMonths[1] === x.months) : [];
        (rows.length ? rows : T.kids.filter((r) => r.ageMonths[1] === x.months)).forEach((r) => addN(r.height));
        continue;
      }
      if (x.range) { between(near(x.range[0]), near(x.range[1]), 6, KID_H).forEach(addN); continue; }
      if (vals != null && vals >= 44 && vals <= 188) addN(near(vals));
      continue;
    }
    if (system === 'bra') {
      if (x.band == null) continue;
      let sys = x.sys; const b = x.band;
      if (sys === 'auto') sys = b >= 60 && b <= 110 ? 'eu' : b >= 28 && b <= 48 ? 'uk' : b >= 0 && b <= 9 ? 'it' : null;
      const eu = sys === 'eu' || sys === 'ru' || sys === 'de' ? b : sys === 'fr' ? b - 15 : sys === 'it' ? 60 + 5 * b : sys === 'uk' || sys === 'us' ? 75 + (b - 34) / 2 * 5 : null;
      if (eu == null) continue;
      const col = sys === 'uk' || sys === 'us' ? sys : 'eu';
      const cups = BRA_CUPS.filter((c) => c[col].split('/').map((z) => z.toUpperCase()).includes(x.cup)).map((c) => c.eu);
      (cups.length ? cups : [x.cup]).forEach((c) => addN(eu + c));
      continue;
    }
    if (system === 'rings') {
      const toD = (v, sys) => (sys === 'us' ? 11.63 + 0.8255 * v : sys === 'iso' || sys === 'eu' || (sys === 'auto' && v >= 40) ? v / Math.PI : sys === 'auto' && v < 14 ? 11.63 + 0.8255 * v : v);
      if (x.range) between(half(toD(x.range[0], x.sys)), half(toD(x.range[1], x.sys)), 0.5).forEach(addN);
      else if (vals != null) addN(half(toD(vals, x.sys)));
      continue;
    }
    if (system === 'tights') {
      if (x.sys === 'int') { T.tights.filter((r) => r.int === x.v).forEach((r) => addN(r.n)); continue; }
      if (x.range) between(x.range[0], x.range[1], 1).forEach(addN); else if (vals >= 1 && vals <= 7) addN(vals);
      continue;
    }
    if (system === 'belts') {
      if (x.sys === 'int') { out.lets.add(x.v); T.belts.filter((r) => r.int === x.v).forEach((r) => between(r.cm[0], r.cm[1], 5).forEach((k) => out.letKeys.add(fmt(k)))); continue; }
      if (x.sys === 'w') { T.belts.filter((r) => x.v >= r.jeansW[0] && x.v <= r.jeansW[1]).forEach((r) => between(r.cm[0], r.cm[1], 5).forEach(addN)); continue; }
      if (vals != null && vals >= 50 && vals <= 150) addN(Math.round(vals / 5) * 5);
      continue;
    }
    if (system === 'gloves') {
      if (x.sys === 'int') { out.lets.add(x.v); T.gloves.filter((r) => r.int === x.v).forEach((r) => out.letKeys.add(fmt(r.size))); continue; }
      if (x.sys === 'cm') { T.gloves.filter((r) => vals >= r.palmCm[0] - 0.25 && vals <= r.palmCm[1] + 0.25).forEach((r) => addN(r.size)); continue; }
      if (x.range) between(half(x.range[0]), half(x.range[1]), 0.5).forEach(addN); else if (vals >= 5 && vals <= 12) addN(half(vals));
      continue;
    }
    if (system === 'hats') {
      if (x.sys === 'int') { out.lets.add(x.v); T.hats.filter((r) => r.int === x.v).forEach((r) => out.letKeys.add(fmt(r.cm))); continue; }
      if (x.range) { between(Math.round(x.range[0]), Math.round(x.range[1]), 1).forEach(addN); continue; }
      if (vals == null) continue;
      if (vals >= 6 && vals <= 8.5) addN(Math.round(vals * Math.PI * 2.54)); // US fitted 7 1/8
      else if (vals >= 40 && vals <= 66) addN(Math.round(vals));
    }
  }
  return out;
}

/** Совпадает ли размер из запроса с размером вещи. */
export function matches(querySize, itemLabel, system) {
  const q = keysOf(querySize, system), it = keysOf(itemLabel, system);
  if (q.universal || it.universal) return true;
  if (system === 'jeans' && q.wl.length && it.wl.length) {
    return q.wl.some(([w, l]) => it.wl.some(([w2, l2]) => w === w2 && (l == null || l2 == null || l === l2)));
  }
  const inter = (a, b) => [...a].some((k) => b.has(k));
  // Буква с обеих сторон — сравниваем буквы (как sizeEq), RU-число вещи важнее буквы.
  if (q.lets.size && it.lets.size) return inter(q.lets, it.lets);
  if (q.nums.size && it.nums.size) return inter(q.nums, it.nums);
  if (q.lets.size && it.nums.size) return inter(q.letKeys, it.nums);
  if (q.nums.size && it.lets.size) return inter(q.nums, it.letKeys);
  if (q.raw.size && it.raw.size) return inter(q.raw, it.raw);
  return false;
}

// ——— Эквиваленты ———
const rowLabels = {
  clothesWomen: (r) => [String(r.ru), r.eu + ' EU', r.fr + ' FR', r.it + ' IT', r.uk + ' UK', r.us + ' US'],
  clothesMen: (r) => [String(r.ru), r.eu + ' EU', r.it + ' IT', r.uk + ' UK', r.us + ' US'],
  shoes: (r) => [fmt(r.ru), fmt(r.eu) + ' EU', fmt(r.uk) + ' UK', fmt(r.us) + ' US', fmt(r.cm) + ' см'],
};

/** Все эквивалентные обозначения размера в системе: equivalents('M','clothesWomen') → {'M','44','46','38 EU',…}. */
export function equivalents(token, system) {
  const k = keysOf(token, system), out = new Set();
  if (k.universal) return new Set(['ONE SIZE']);
  const keys = new Set([...k.nums, ...k.letKeys]);
  k.lets.forEach((l) => out.add(l));
  if (CLOTHES[system]) {
    const c = CLOTHES[system];
    for (const r of c.rows) if (keys.has(fmt(r.ru))) {
      rowLabels[system](r).forEach((x) => out.add(x));
      if (!k.lets.size) for (const [l, span] of Object.entries(c.letters)) if (span.includes(r.ru)) out.add(l);
      T.jeans.filter((j) => (system === 'clothesWomen' ? j.ruWomen : j.ruMen).includes(r.ru)).forEach((j) => out.add('W' + j.w));
    }
  } else if (SHOES[system]) {
    for (const r of SHOES[system]) if (keys.has(fmt(r.ru))) rowLabels.shoes(r).forEach((x) => out.add(x));
  } else if (system === 'kidsShoes') {
    for (const r of T.kidsShoes) if (keys.has(fmt(r.eu))) [fmt(r.eu), r.eu + ' EU', r.cm + ' см', r.uk + ' UK', r.us + ' US'].forEach((x) => out.add(x));
  } else if (system === 'kids') {
    for (const r of T.kids) if (keys.has(fmt(r.height))) [String(r.height), r.age, r.us + ' US', r.uk + ' UK'].forEach((x) => out.add(x));
  } else if (system === 'jeans') {
    for (const r of T.jeans) if (keys.has(fmt(r.w))) {
      out.add('W' + r.w); out.add(r.waistCm + ' см');
      r.ruWomen.forEach((x) => out.add(x + ' RU (ж)')); r.ruMen.forEach((x) => out.add(x + ' RU (м)'));
      k.wl.filter(([w, l]) => w === r.w && l).forEach(([w, l]) => out.add('W' + w + ' L' + l));
    }
  } else if (system === 'bra') {
    for (const key of keys) {
      const m = key.match(/^(\d+)([A-Z]+)$/); if (!m) continue;
      const band = +m[1], cup = BRA_CUPS.find((c) => c.eu === m[2]); const row = T.bra.find((r) => r.eu === band);
      out.add(band + m[2]);
      if (row && cup) [row.uk + cup.uk + ' UK', row.us + cup.us.split('/')[0] + ' US', row.fr + cup.fr + ' FR', row.it + cup.it + ' IT'].forEach((x) => out.add(x));
    }
  } else if (system === 'rings') {
    for (const r of T.rings) if (keys.has(fmt(r.ru))) [fmt(r.ru), r.us + ' US', r.uk + ' UK', r.iso + ' ISO', r.circumferenceMm + ' мм'].forEach((x) => out.add(x));
  } else if (system === 'tights') {
    for (const r of T.tights) if (keys.has(fmt(r.n))) { out.add(String(r.n)); out.add(r.int); }
  } else if (system === 'belts') {
    for (const key of keys) { out.add(key); T.belts.filter((r) => +key >= r.cm[0] && +key <= r.cm[1]).forEach((r) => out.add(r.int)); }
  } else if (system === 'gloves') {
    for (const r of T.gloves) if (keys.has(fmt(r.size))) { out.add(fmt(r.size)); out.add(r.int + (r.gender === 'women' ? ' (ж)' : ' (м)')); }
  } else if (system === 'hats') {
    for (const r of T.hats) if (keys.has(fmt(r.cm))) { out.add(String(r.cm)); out.add(r.int); out.add(r.us + ' US'); }
  } else if (system === 'bedding') {
    for (const key of keys) { out.add(key); const r = T.bedding.find((b) => b.key === key); r && r.aliases.forEach((a) => out.add(a)); }
  }
  if (!out.size) k.raw.forEach((x) => out.add(x.toUpperCase()));
  return out;
}
