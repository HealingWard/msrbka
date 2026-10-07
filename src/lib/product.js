import { HEX, storeByName } from '../data/catalog.js';
import { fmt, plural, rub } from './format.js';

export const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Дата из полей акции магазина: «2026-10-17», «17.10», «ср | с 14 октября» → Date или null. */
export function promoDate(s, now = new Date()) {
  if (!s) return null;
  const t = String(s);
  let d = null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  m = !d && t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (m) d = new Date(m[3] ? +m[3] : now.getFullYear(), +m[2] - 1, +m[1]);
  m = !d && t.match(/(\d{1,2})\s+([а-я]+)/i);
  if (m && MONTHS_G.includes(m[2].toLowerCase())) d = new Date(now.getFullYear(), MONTHS_G.indexOf(m[2].toLowerCase()), +m[1]);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Вещь участвует в «Сумасшедших днях» Stockmann, и продажа ещё не началась («Можно купить с 14 октября»):
 * до этой даты магазин помечает её недоступной, но это не «нет в наличии». → дата начала или null.
 */
export function saleStarts(item, now = Date.now()) {
  const pr = item?.promo;
  if (!pr || pr.v < 2 || !pr.crazy) return null;
  const d = promoDate(pr.crazyDate) || promoDate(pr.crazyText);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return d && d.getTime() > today.getTime() ? d : null;
}

/** Вещи нет в наличии: магазин не показал цену при проверке, отметил «нет в наличии» или все размеры распроданы. */
export const isSoldOut = (item, fv) => fv?.checkStatus === 'noprice' || (!saleStarts(item) && (item?.stock === 'Нет в наличии'
  || (item?.stock !== 'В наличии' && !(item?.sizes || []).length && (item?.sizesOut || []).length > 0)));
/** Последняя проверка цены не удалась (капча, страница не разобралась, не открылась). */
export const CHECK_FAILED = ['blocked', 'error', 'unparsed', 'suspect'];

/**
 * Отображаемые поля товара, общие для карточки, строки таблицы, страницы товара и выгрузки.
 * «Старую» цену и скидку магазина не показываем: им не доверяем, верим только своей истории цен (см. CLAUDE.md).
 */
export function productView(p) {
  const sizes = p.sizes || [];
  const store = storeByName(p.store);
  const starts = saleStarts(p);
  const stock = starts ? 'Купить можно с ' + starts.getDate() + ' ' + MONTHS_G[starts.getMonth()] : p.stock || '';
  return {
    priceStr: rub(p.price),
    rating: p.rating ? p.rating.toFixed(1).replace('.', ',') : '',
    reviewsStr: p.reviews ? fmt(p.reviews) + ' ' + plural(p.reviews, ['отзыв', 'отзыва', 'отзывов']) : '',
    stock,
    lowStock: !!stock && stock !== 'В наличии',
    sizesStr: sizes.length ? sizes.join(' · ') : 'уточните в магазине',
    colorStr: p.color || 'не указан',
    colorHex: HEX[p.color] || null,
    url: p.url,
    domain: store ? store.domain : (() => { try { return new URL(p.url).host.replace(/^www\./, ''); } catch { return ''; } })(),
  };
}
