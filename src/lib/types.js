// Типы вещей: определение по тексту запроса и названию вещи (504 типа одежды, обуви, аксессуаров и товаров для дома).
// Данные — src/data/types.json (собрано в 2026-10, см. docs/knowledge-base.md).
// Порядок: фразы («поясная сумка», «нож для хлеба») важнее слов; у слова побеждает самая длинная основа;
// короткие и опасные слова (бра, топ, нож, кед…) — только целиком; слово после «для» — не тип («ремень для сумки»).

import DB from '../data/types.json';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const STOP = new Set(['для', 'на', 'под', 'с', 'со', 'из', 'в', 'по', 'и']);
const W = 'a-zа-я0-9';
const trimEnd = (w) => { while (w.length > 3 && /[аеиоуыэюяйь]$/.test(w)) w = w.slice(0, -1); return w; };
function phraseRegex(p) {
  const parts = norm(p).split(new RegExp(`[^${W}]+`)).filter(Boolean);
  const body = parts.map((w) => (STOP.has(w) ? w : trimEnd(w) + `[${W}]{0,3}`)).join(`[^${W}]+`);
  return new RegExp(`(?:^|[^${W}])(${body})(?![${W}])`);
}

export const TYPES = new Map(DB.types.map((t) => [t.key, t]));
const STEMS = DB.types.flatMap((t) => (t.stems || []).map((s) => [norm(s), t.key])).sort((a, b) => b[0].length - a[0].length);
const EXACTS = DB.types.flatMap((t) => (t.exact || []).map((x) => [new RegExp(`^(?:${norm(x)})$`), t.key]));
const PHRASES = DB.types.flatMap((t) => (t.phrases || []).map((p) => [phraseRegex(p), t.key]));

/** Более общие типы: хобо → сумка → сумки. */
export function ancestors(k) {
  const out = [];
  let t = TYPES.get(k);
  while (t && t.parent && TYPES.has(t.parent) && !out.includes(t.parent)) { out.push(t.parent); t = TYPES.get(t.parent); }
  return out;
}

function wordHit(w) {
  let best = null;
  for (const [re, key] of EXACTS) if (re.test(w) && (!best || w.length + 0.5 > best.score)) best = { key, score: w.length + 0.5 };
  for (const [s, key] of STEMS) {
    if (best && s.length <= best.score - 0.5) break;
    if (w.startsWith(s)) { if (!best || s.length > best.score) best = { key, score: s.length }; break; }
  }
  return best;
}

/** Главный тип вещи в тексте → { key, category } или null. «Сумка хобо» → хобо (подтип важнее общего). */
export function resolveType(text) {
  const low = norm(text);
  let ph = null;
  for (const [re, key] of PHRASES) {
    const m = re.exec(low);
    if (m && (!ph || m[1].length > ph.len || (m[1].length === ph.len && m.index < ph.pos))) ph = { key, len: m[1].length, pos: m.index };
  }
  if (ph) return { key: ph.key, category: TYPES.get(ph.key).category };
  const words = low.split(new RegExp(`[^${W}]+`)).filter(Boolean);
  const hits = [];
  words.forEach((w, i) => {
    if (i > 0 && words[i - 1] === 'для') return;
    const h = wordHit(w);
    if (h) hits.push({ ...h, pos: i });
  });
  if (!hits.length) return null;
  const hitKeys = new Set(hits.map((h) => h.key));
  const general = new Set([...hitKeys].flatMap((k) => ancestors(k).filter((a) => hitKeys.has(a))));
  const h = hits.filter((x) => !general.has(x.key)).sort((a, b) => a.pos - b.pos)[0] || hits[0];
  return { key: h.key, category: TYPES.get(h.key).category };
}

/**
 * Типы, названные в запросе: по одному на вариант («лоферы или дерби» → ['лоферы', 'дерби']).
 * Для названия вещи — её главный тип.
 */
export function detectTypes(text) {
  const out = [];
  for (const part of norm(text).split(/(?:^|[\s,])(?:или|либо)(?=[\s,]|$)|[,/;]/)) {
    const r = resolveType(part);
    if (r && !out.includes(r.key)) out.push(r.key);
  }
  return out;
}

/**
 * Подходит ли тип вещи под тип из запроса: тот же, его разновидность (запрос «сумка» — хобо, тоут, кросс-боди)
 * или общее название из списка близких («тренч» — «плащ»). Типы из списка «точно не то» не подходят никогда.
 */
export function typeFits(itemType, queryType) {
  if (itemType === queryType) return true;
  const q = TYPES.get(queryType);
  if (!q) return false;
  if ((q.notSame || []).includes(itemType)) return false;
  if (ancestors(itemType).includes(queryType)) return true;
  // Общее название той же вещи: магазины пишут «Плащ» про тренч, «Сумка» про хобо — если оно в списке близких.
  return q.parent === itemType && (q.near || []).includes(itemType);
}

/** Категория по типу: clothes | shoes | acc | home → ds поиска. */
export const DS_OF_CATEGORY = { clothes: 'trench', shoes: 'shoes', acc: 'acc', home: 'home' };
