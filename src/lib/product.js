import { HEX, storeByName } from '../data/catalog.js';
import { fmt, plural, rub } from './format.js';

/** Вещи нет в наличии: магазин не показал цену при проверке, отметил «нет в наличии» или все размеры распроданы. */
export const isSoldOut = (item, fv) => fv?.checkStatus === 'noprice' || item?.stock === 'Нет в наличии'
  || (item?.stock !== 'В наличии' && !(item?.sizes || []).length && (item?.sizesOut || []).length > 0);
/** Последняя проверка цены не удалась (капча, страница не разобралась, не открылась). */
export const CHECK_FAILED = ['blocked', 'error', 'unparsed', 'suspect'];

/**
 * Отображаемые поля товара, общие для карточки, строки таблицы, страницы товара и выгрузки.
 * «Старую» цену и скидку магазина не показываем: им не доверяем, верим только своей истории цен (см. CLAUDE.md).
 */
export function productView(p) {
  const sizes = p.sizes || [];
  const store = storeByName(p.store);
  return {
    priceStr: rub(p.price),
    rating: p.rating ? p.rating.toFixed(1).replace('.', ',') : '',
    reviewsStr: p.reviews ? fmt(p.reviews) + ' ' + plural(p.reviews, ['отзыв', 'отзыва', 'отзывов']) : '',
    stock: p.stock || '',
    lowStock: !!p.stock && p.stock !== 'В наличии',
    sizesStr: sizes.length ? sizes.join(' · ') : 'уточните в магазине',
    colorStr: p.color || 'не указан',
    colorHex: HEX[p.color] || null,
    url: p.url,
    domain: store ? store.domain : (() => { try { return new URL(p.url).host.replace(/^www\./, ''); } catch { return ''; } })(),
  };
}
