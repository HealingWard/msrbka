import { HEX, productUrl, storeByName } from '../data/catalog.js';
import { fmt, plural, rub } from './format.js';

/** Отображаемые поля товара, общие для карточки, строки таблицы, страницы товара и выгрузки. */
export function productView(p) {
  const disc = p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
  return {
    priceStr: rub(p.price),
    oldStr: p.old ? rub(p.old) : '',
    hasOld: !!p.old,
    disc,
    discStr: '−' + disc + '%',
    rating: p.rating.toFixed(1).replace('.', ','),
    reviewsStr: fmt(p.reviews) + ' ' + plural(p.reviews, ['отзыв', 'отзыва', 'отзывов']),
    lowStock: p.stock !== 'В наличии',
    sizesStr: p.sizes.join(' · '),
    colorHex: HEX[p.color] || '#ccc',
    url: productUrl(p),
    domain: storeByName(p.store).domain,
  };
}
