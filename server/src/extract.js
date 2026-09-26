// Извлечение товаров из HTML страниц магазинов, независимое от конкретной вёрстки.
// Три источника, от самого надёжного к запасному:
//   1) schema.org JSON-LD (Product, ItemList, Offer);
//   2) данные, встроенные в страницу (<script type="application/json">, __NEXT_DATA__, window.__STATE__ = {...});
//   3) DOM: ссылки на карточки товаров (шаблон пути задаёт адаптер магазина) и цена рядом с ними.
// Найденное объединяется по URL товара.

import { parse } from 'node-html-parser';

// ——— числа и строки ———

export function parsePrice(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'object') {
    return parsePrice(v.value ?? v.amount ?? v.current ?? v.final ?? v.price ?? v.sale ?? v.actual ?? null);
  }
  const s = String(v).replace(/ | |\s/g, '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  // «12 990,00» или «12990.00» — отбрасываем копейки
  const m = s.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  const n = m ? +m[1] : parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Дробное число (рейтинг): «4,5» → 4.5. */
export function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'object') return parseNumber(v.value ?? v.rate ?? v.average ?? null);
  const m = String(v).replace(',', '.').match(/\d+(?:\.\d+)?/);
  return m && +m[0] > 0 ? +m[0] : null;
}

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const decodeEntities = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

export function absUrl(href, base) {
  if (!href || typeof href !== 'string') return null;
  try {
    const u = new URL(decodeEntities(href.trim()), base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Ключ для склейки дублей: без query, без завершающего «/», в нижнем регистре. */
export const urlKey = (u) => {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return u;
  }
};

const pick = (o, keys) => {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return undefined;
};

const firstImage = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (typeof v === 'object') return pick(v, ['url', 'src', 'contentUrl', 'href', 'original', 'big', 'medium', 'small']) || null;
  return null;
};

const brandName = (b) => {
  if (!b) return '';
  if (typeof b === 'string') return clean(b);
  if (Array.isArray(b)) return brandName(b[0]);
  if (typeof b === 'object') return clean(pick(b, ['name', 'title', 'brand_name', 'brandName']) || '');
  return '';
};

// ——— 1. JSON-LD ———

function parseJsonLoose(text) {
  const t = text.trim().replace(/^<!--|-->$/g, '').replace(/;\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(t.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

const typeOf = (n) => [].concat(n?.['@type'] || []).map(String);

function fromLdProduct(n, base) {
  const offers = [].concat(n.offers || []);
  const offer = offers.find((o) => o && (o.price != null || o.lowPrice != null)) || offers[0] || {};
  const price = parsePrice(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price);
  const old = parsePrice(offer.highPrice && offer.lowPrice && offer.highPrice !== offer.lowPrice ? null : offer.priceSpecification?.referencePrice) || null;
  const avails = offers.map((o) => String(o?.availability || '')).filter(Boolean);
  const avail = avails.find((a) => !/OutOfStock|SoldOut|Discontinued/i.test(a)) || avails[0] || '';
  const rating = n.aggregateRating || {};
  return {
    url: absUrl(n.url || offer.url || n['@id'], base),
    title: clean(n.name),
    brand: brandName(n.brand || n.manufacturer),
    price,
    old: old && price && old > price ? old : null,
    image: absUrl(firstImage(n.image), base),
    rating: parseNumber(rating.ratingValue),
    reviews: parsePrice(rating.reviewCount ?? rating.ratingCount),
    sku: clean(String(n.sku || n.productID || n.mpn || '')) || null,
    color: clean(n.color || ''),
    inStock: avail ? !/OutOfStock|SoldOut|Discontinued/i.test(avail) : null,
    sizes: offers.length > 1 ? offers.map((o) => clean(o.name || o.size || '')).filter(Boolean) : [],
  };
}

export function extractJsonLd(root, base) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const types = typeOf(n);
    if (types.some((t) => /Product|IndividualProduct|ProductModel/.test(t))) out.push(fromLdProduct(n, base));
    if (types.includes('ItemList') || types.includes('OfferCatalog')) {
      for (const el of [].concat(n.itemListElement || [])) {
        const item = el?.item && typeof el.item === 'object' ? el.item : el;
        if (item && typeTypeless(item)) out.push(fromLdProduct(item, base));
        else if (item) walk(item);
        else if (el?.url) out.push({ url: absUrl(el.url, base), title: clean(el.name || '') });
      }
    }
    if (n['@graph']) walk(n['@graph']);
  };
  const typeTypeless = (x) => typeOf(x).some((t) => /Product/.test(t)) || (x.offers && x.name);
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) walk(parseJsonLoose(s.rawText));
  return out;
}

// ——— 2. Встроенные данные ———

/** Вырезает сбалансированный JSON-объект/массив, начинающийся с позиции i. */
export function sliceBalanced(text, i) {
  const open = text[i];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0, inStr = false, q = '', esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}

const STATE_ASSIGN = /(?:window\.|self\.|globalThis\.)?(__[A-Z0-9_]+__|[A-Za-z_$][\w$]*(?:State|STATE|Data|DATA|Props|PROPS|Store|STORE|Config|CONFIG))\s*=\s*(?=[{[])/g;

export function extractEmbeddedJson(root, html) {
  const blobs = [];
  for (const s of root.querySelectorAll('script')) {
    const type = (s.getAttribute('type') || '').toLowerCase();
    const text = s.rawText;
    if (!text || text.length < 50) continue;
    if (type === 'application/json' || type === 'text/json') {
      const j = parseJsonLoose(text);
      if (j) blobs.push(j);
      continue;
    }
    if (type && !/javascript|module/.test(type)) continue;
    STATE_ASSIGN.lastIndex = 0;
    let m;
    while ((m = STATE_ASSIGN.exec(text))) {
      const raw = sliceBalanced(text, m.index + m[0].length);
      if (!raw || raw.length < 50) continue;
      const j = parseJsonLoose(raw) || parseJsonLoose(raw.replace(/\bundefined\b/g, 'null'));
      if (j) blobs.push(j);
    }
    // JSON.parse('...') с экранированным JSON
    const jp = text.match(/JSON\.parse\((["'])((?:\\.|(?!\1).)*)\1\)/);
    if (jp) {
      try {
        const j = JSON.parse(JSON.parse('"' + jp[2].replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'));
        if (j && typeof j === 'object') blobs.push(j);
      } catch { /* not JSON */ }
    }
  }
  void html;
  return blobs;
}

const NAME_KEYS = ['name', 'title', 'product_name', 'productName', 'displayName', 'display_name', 'model_name', 'full_name', 'fullName'];
const PRICE_KEYS = ['price', 'final_price', 'finalPrice', 'price_amount', 'priceAmount', 'current_price', 'currentPrice', 'sale_price', 'salePrice', 'actual_price', 'actualPrice', 'min_price', 'minPrice', 'priceValue', 'prices', 'offers'];
const OLD_KEYS = ['old_price', 'oldPrice', 'original_price', 'originalPrice', 'price_original', 'priceOriginal', 'base_price', 'basePrice', 'full_price', 'fullPrice', 'priceOld', 'crossed_price', 'crossedPrice', 'regular_price', 'regularPrice', 'price_without_discount', 'priceWithoutDiscount'];
const URL_KEYS = ['url', 'link', 'href', 'product_url', 'productUrl', 'seo_url', 'seoUrl', 'canonical', 'canonical_url', 'canonicalUrl', 'path', 'slug_url', 'page_url', 'pageUrl', 'web_url', 'webUrl'];
const SKU_KEYS = ['sku', 'article', 'articul', 'vendor_code', 'vendorCode', 'product_id', 'productId', 'offer_id', 'offerId', 'id', 'code'];
const IMG_KEYS = ['image', 'images', 'thumbnail', 'thumb', 'picture', 'pictures', 'img', 'photo', 'photos', 'gallery', 'image_url', 'imageUrl', 'main_image', 'mainImage'];
const BRAND_KEYS = ['brand', 'brand_name', 'brandName', 'manufacturer', 'vendor', 'designer'];

function oldFromPriceObj(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return parsePrice(p.old ?? p.original ?? p.base ?? p.full ?? p.regular ?? p.crossed ?? p.old_price ?? p.oldPrice ?? null);
}

function productFromObject(o, base) {
  const nameRaw = pick(o, NAME_KEYS);
  const title = typeof nameRaw === 'string' ? clean(nameRaw) : '';
  if (title.length < 3 || title.length > 300 || /^https?:/.test(title)) return null;
  let priceRaw = pick(o, PRICE_KEYS);
  if (Array.isArray(priceRaw)) priceRaw = priceRaw[0];
  const price = parsePrice(priceRaw);
  if (!price || price < 50 || price > 10_000_000) return null;
  const urlRaw = pick(o, URL_KEYS);
  const url = typeof urlRaw === 'string' && /[/.]/.test(urlRaw) ? absUrl(urlRaw, base) : null;
  const skuRaw = pick(o, SKU_KEYS);
  const sku = skuRaw != null && typeof skuRaw !== 'object' ? String(skuRaw) : null;
  if (!url && !sku) return null;
  const old = parsePrice(pick(o, OLD_KEYS)) || oldFromPriceObj(priceRaw);
  const rating = pick(o, ['rating', 'ratingValue', 'rating_value', 'average_rating', 'averageRating', 'stars']);
  const reviews = pick(o, ['reviews_count', 'reviewsCount', 'reviewCount', 'review_count', 'feedbacks', 'feedbacksCount', 'ratingCount', 'rating_count', 'opinions']);
  const sizesRaw = pick(o, ['sizes', 'size_list', 'sizeList', 'available_sizes', 'availableSizes']);
  const sizes = Array.isArray(sizesRaw)
    ? sizesRaw.map((z) => (typeof z === 'object' && z ? clean(String(pick(z, ['title', 'name', 'value', 'size', 'label', 'brand_title']) || '')) : clean(String(z)))).filter(Boolean)
    : [];
  const colorRaw = pick(o, ['color', 'colour', 'color_name', 'colorName', 'color_family']);
  return {
    url,
    title,
    brand: brandName(pick(o, BRAND_KEYS)),
    price,
    old: old && old > price ? old : null,
    image: absUrl(firstImage(pick(o, IMG_KEYS)), base),
    rating: parseNumber(rating),
    reviews: parsePrice(typeof reviews === 'object' ? reviews?.count : reviews),
    sku,
    color: typeof colorRaw === 'string' ? clean(colorRaw) : clean(colorRaw?.name || colorRaw?.title || ''),
    inStock: o.in_stock ?? o.inStock ?? o.available ?? o.is_available ?? o.isAvailable ?? null,
    sizes,
  };
}

export function productsFromJson(blobs, base) {
  const out = [];
  const seen = new Set();
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 40 || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const x of n) walk(x, depth + 1); return; }
    const p = productFromObject(n, base);
    if (p) out.push(p);
    for (const k in n) if (n[k] && typeof n[k] === 'object') walk(n[k], depth + 1);
  };
  for (const b of blobs) walk(b, 0);
  return out;
}

// ——— 3. DOM-карточки ———

// Служебные подписи в карточках, которые не являются названием товара.
const NOISE_RE = /(цена с картой|цена со скидкой|с картой|вместо|в корзину|купить|рассрочк|кешбэк|кэшбэк|баллами|доставка|осталось|хит продаж|новинка|скидка|отзыв)/i;

function cleanTitle(s) {
  const t = clean(s.replace(PRICE_RE, ' ').replace(/[−-]\s?\d{1,2}\s?%/g, ' '));
  if (t.length < 3 || NOISE_RE.test(t) || !/[a-zа-яё]{3}/i.test(t)) return '';
  return t;
}

/** Текст узла с пробелами между элементами (textContent склеивает «12 Storeez» и «Тренч» в одно слово). */
function textOf(node) {
  const parts = [];
  const walk = (n) => {
    if (n.nodeType === 3) parts.push(n.text);
    else if (n.childNodes && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') n.childNodes.forEach(walk);
  };
  walk(node);
  return decodeEntities(parts.join(' ')).replace(/\s+/g, ' ').trim();
}

const PRICE_RE = /(\d{1,3}(?:[\s  ]\d{3})+|\d{3,7})(?:[.,]\d{1,2})?\s*(?:₽|руб\.?|р\.)/gi;

function pricesInText(text) {
  const out = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const n = parsePrice(m[1]);
    if (n && n >= 50) out.push(n);
  }
  return out;
}

export function extractDomCards(root, base, productPath) {
  if (!productPath) return [];
  const byUrl = new Map();
  for (const a of root.querySelectorAll('a[href]')) {
    const url = absUrl(a.getAttribute('href'), base);
    if (!url) continue;
    let path;
    try { path = new URL(url).pathname; } catch { continue; }
    if (!productPath.test(path)) continue;
    const key = urlKey(url);
    // Поднимаемся к контейнеру карточки: первый предок, в тексте которого есть цена.
    let node = a, card = null;
    for (let i = 0; i < 7 && node; i++) {
      const txt = textOf(node);
      if (pricesInText(txt).length) { card = node; break; }
      node = node.parentNode;
    }
    const cardText = card ? textOf(card) : '';
    if (!card || cardText.length > 3000) continue;
    const prices = pricesInText(cardText);
    const price = Math.min(...prices);
    const maxP = Math.max(...prices);
    const img = card.querySelector('img');
    const imgSrc = img && (img.getAttribute('src') || img.getAttribute('data-src') || (img.getAttribute('srcset') || '').split(/[\s,]+/)[0]);
    const title = [a.getAttribute('title'), textOf(a), img && img.getAttribute('alt')].map((x) => cleanTitle(x || '')).find(Boolean) || '';
    const prev = byUrl.get(key);
    const item = {
      url,
      title,
      brand: '',
      price,
      old: maxP > price && maxP < price * 5 ? maxP : null,
      image: absUrl(imgSrc && !imgSrc.startsWith('data:') ? imgSrc : null, base),
      cardText: cardText.slice(0, 400),
    };
    // Внутри карточки у одной ссылки бывает картинка, у другой — полное название: берём более полное.
    if (prev && item.title.length > prev.title.length && item.title.length < 200) prev.title = item.title;
    byUrl.set(key, prev ? merge(prev, item) : item);
  }
  return [...byUrl.values()].filter((x) => x.price);
}

// ——— объединение ———

function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    // Первое непустое значение побеждает: источники идут от надёжных (JSON-LD) к запасным (текст карточки).
    if (cur == null || cur === '' || (Array.isArray(cur) && !cur.length)) out[k] = v;
  }
  return out;
}

export function mergeItems(lists) {
  const byKey = new Map();
  const order = [];
  for (const list of lists) {
    for (const it of list) {
      if (!it || !it.url || !it.price) continue;
      const key = urlKey(it.url);
      if (byKey.has(key)) byKey.set(key, merge(byKey.get(key), it));
      // Карточка без распознанного названия может только дополнить уже найденный товар (фото, старая цена).
      else if (it.title) { byKey.set(key, it); order.push(key); }
    }
  }
  return order.map((k) => byKey.get(k));
}

/**
 * Все товары на странице выдачи.
 * opts.productPath — RegExp пути карточки товара в этом магазине;
 * opts.isProductUrl — дополнительная проверка, что URL ведёт на товар магазина.
 */
export function extractListing(html, base, opts = {}) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: false, noscript: false, pre: true } });
  const accept = (it) => it.url && (!opts.isProductUrl || opts.isProductUrl(it.url));
  const ld = extractJsonLd(root, base).filter(accept);
  const js = productsFromJson(extractEmbeddedJson(root, html), base).filter(accept);
  const dom = extractDomCards(root, base, opts.productPath).filter(accept);
  const items = mergeItems([ld, js, dom]);
  return { items, sources: { jsonld: ld.length, embedded: js.length, dom: dom.length } };
}

/** Подробности со страницы товара: цена, фото, размеры, цвет, наличие. */
export function extractProduct(html, url, opts = {}) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: false, noscript: false, pre: true } });
  const meta = (name) => root.querySelector(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`)?.getAttribute('content') || '';
  const key = urlKey(url);
  const same = (it) => it.url && urlKey(it.url) === key;

  const ld = extractJsonLd(root, url);
  const js = productsFromJson(extractEmbeddedJson(root, html), url);
  const main = ld.find(same) || ld.find((x) => x.price) || js.find(same) || null;

  const og = {
    url,
    title: clean(decodeEntities(meta('og:title') || root.querySelector('h1')?.textContent || root.querySelector('title')?.textContent || '')),
    image: absUrl(meta('og:image'), url),
    price: parsePrice(meta('product:price:amount') || meta('og:price:amount') || meta('price')),
    brand: clean(meta('product:brand') || meta('og:brand') || ''),
  };
  let item = merge(main ? { ...main, url } : { url }, og);

  // Размеры: объединяем все найденные списки размеров для этого товара.
  if (!item.sizes || !item.sizes.length) {
    const withSizes = js.filter((x) => x.sizes && x.sizes.length && (!x.url || same(x)));
    if (withSizes.length) item.sizes = withSizes[0].sizes;
  }
  if (!item.price) {
    const priced = js.find(same);
    if (priced) item = merge(item, priced);
  }
  if (!opts.keepAllImages) {
    const images = [];
    for (const m of root.querySelectorAll('meta[property="og:image"]')) {
      const u = absUrl(m.getAttribute('content'), url);
      if (u && !images.includes(u)) images.push(u);
    }
    item.images = images.slice(0, 6);
  }
  return item;
}
