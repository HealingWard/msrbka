// Цвета: распознавание в тексте запроса и названии вещи, близкие цвета и HEX для образцов.
// Данные — src/data/colors.json (143 цвета, собрано в 2026-10, см. docs/knowledge-base.md).

import DATA from '../data/colors.json';

const N = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

export const COLORS = DATA.colors.map((c) => c.name);
export const HEX = Object.fromEntries(DATA.colors.map((c) => [c.name, c.hex]));
export const NEAR = Object.fromEntries(DATA.colors.map((c) => [c.name, c.near]));
export const FAMILY = Object.fromEntries(DATA.colors.map((c) => [c.name, c.family]));
const BY_NORM = new Map(DATA.colors.map((c) => [N(c.name), c.name]));

// Стемы — с начала слова, самые длинные первыми («розовое золото» раньше «розов»); фразы — по всему тексту.
const STEMS = DATA.colors.flatMap((c) => c.stems.map((s) => [N(s), c.name])).sort((a, b) => b[0].length - a[0].length);
const PHRASES = STEMS.filter(([s]) => /\s/.test(s));
const WORD_STEMS = STEMS.filter(([s]) => !/\s/.test(s));
const WORDS = new Map(DATA.colors.flatMap((c) => c.words.map((w) => [N(w), c.name])));
const MODS = DATA.modifiers.map((m) => ({ ...m, stems: m.stems.map(N).sort((a, b) => b.length - a.length), overrides: m.overrides || {} }));
const SUFFIX = new RegExp('(' + DATA.suffix.map(N).join('|') + ')[а-я]*$');
const MULTI = DATA.multi.map(N);
const HOME_CTX = new Set(DATA.homeOnlyWithColorWord.map(N));
const JOIN = /(светло|темно|бледно|ярко|пыльно|нежно|пастельно|насыщенно|серо|сине|зелено|бело|черно|красно|желто|голубо|розово)\s*-?\s*(?=[а-я])/g;
const isWordStart = (text, i) => i === 0 || /[^a-zа-я0-9]/.test(text[i - 1]);

/** Цвет одного слова (без модификаторов) или null. */
function wordColor(w) {
  if (WORDS.has(w)) return WORDS.get(w);
  for (const [s, c] of WORD_STEMS) if (w.startsWith(s)) return c;
  // «голубоватый», «сероватый» → оттенок базового цвета.
  const m = w.match(SUFFIX);
  if (m) {
    const base = w.slice(0, m.index);
    for (const [s, c] of WORD_STEMS) if ((base + 'ый').startsWith(s) || (base + 'ой').startsWith(s)) return c;
    for (const [word, c] of WORDS) if (word.startsWith(base) && word.length - base.length <= 3) return c;
  }
  return null;
}

/** «светло-серый», «пастельно-розовый», «ярко-синий» → свой цвет, замена из overrides или базовый цвет. */
function modified(tok) {
  for (const m of MODS) {
    const s = m.stems.find((x) => tok.startsWith(x) && tok.length > x.length);
    if (!s) continue;
    const rest = tok.slice(s.length).replace(/^-/, '');
    const base = wordColor(rest) || modified(rest);
    if (!base) continue;
    const full = m.as ? m.as + base : base;
    if (m.overrides[full]) return m.overrides[full];
    // «бледно-», «нежно-», «пастельно-» ведут себя как «светло-»: берём замену из «светло-», если она есть.
    const twin = MODS.find((x) => x.as === m.as && x.overrides[full]);
    if (twin) return twin.overrides[full];
    if (m.as && BY_NORM.has(N(full))) return BY_NORM.get(N(full));
    return base;
  }
  return null;
}

/**
 * Цвета, упомянутые в тексте, в каноничной форме («бирюзовый», «тёмно-синий»).
 * home — товары для дома: «ванильный», «лавандовый»… там чаще запах, цвет — только рядом со словом «цвет».
 */
export function detectColors(text, { home = false } = {}) {
  const low = N(text).replace(JOIN, '$1-');
  const out = [];
  const add = (c) => { if (c && !out.includes(c)) out.push(c); };
  let rest = low;
  for (const [s, c] of PHRASES) {
    let i = rest.indexOf(s);
    while (i >= 0) {
      if (isWordStart(rest, i)) { add(c); rest = rest.slice(0, i) + ' '.repeat(s.length) + rest.slice(i + s.length); }
      i = rest.indexOf(s, i + 1);
    }
  }
  const colorWord = /(^|[^а-я])цвет/.test(low);
  for (const tok of rest.split(/[^a-zа-я0-9-]+/).filter(Boolean)) {
    const c = wordColor(tok) || modified(tok);
    if (c && home && !colorWord && HOME_CTX.has(N(c))) continue;
    if (c) { add(c); continue; }
    // Составной цвет без своего названия («серо-зелёный») — оба цвета.
    if (tok.includes('-')) for (const part of tok.split('-')) add(wordColor(part.length > 3 ? part : part + 'ый'));
  }
  return out;
}

/** Разноцветный, принт, полоска — вещь не одного цвета. */
export const isMulti = (text) => { const low = N(text); return MULTI.some((s) => low.includes(s)); };
