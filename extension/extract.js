// Разбор страницы магазина внутри вкладки (мир страницы, чтобы видеть window.__NUXT__ и т. п.).
// Определяет window.__pricelExtract(mode, opts):
//   'search'  — ждёт появления товаров, возвращает { blocked, items, title, url }
//   'product' — ждёт карточку, возвращает { blocked, item }
//   'html'    — возвращает отрисованный HTML страницы (для настройки разбора)
// Ничего не меняет на странице и никуда не отправляет данные — только читает.

(() => {
  if (window.__pricelExtract) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const PRICE_RE = /(\d{1,3}(?:[\s  ]\d{3})+|\d{3,7})(?:[.,]\d{1,2})?\s*(?:₽|руб\.?|р\.)/gi;
  const NOISE_RE = /(цена с картой|с картой|вместо|в корзину|купить|рассрочк|кешбэк|кэшбэк|баллами|доставка|осталось|хит продаж|новинка|скидка|отзыв|добавить в)/i;

  function parsePrice(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
    if (typeof v === 'object') return parsePrice(v.value ?? v.amount ?? v.current ?? v.final ?? v.price ?? v.sale ?? v.actual ?? null);
    const s = String(v).replace(/[  \s]/g, '').replace(/[^\d.,]/g, '');
    if (!s) return null;
    const m = s.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
    const n = m ? +m[1] : parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const parseNumber = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v > 0 ? v : null;
    if (typeof v === 'object') return parseNumber(v.value ?? v.rate ?? null);
    const m = String(v).replace(',', '.').match(/\d+(?:\.\d+)?/);
    return m ? +m[0] : null;
  };
  const abs = (u) => {
    if (!u || typeof u !== 'string') return null;
    try { const x = new URL(u, location.href); x.hash = ''; return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; }
  };
  const key = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase(); } catch { return u; } };
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return undefined; };
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
  const textOf = (el) => clean(el ? (el.innerText || el.textContent || '') : '');

  // ——— блокировка / капча ———
  function blockedState() {
    const html = document.documentElement ? document.documentElement.outerHTML.slice(0, 20000) : '';
    if (/servicepipe\.tech|<js-challenge-loader|get_cookie_spsn\(/i.test(html)) return 'challenge';
    if (/запрос отклонен|запрос отклонён|access denied/i.test(document.title)) return 'denied';
    if (document.querySelector('iframe[src*="captcha"], #id_captcha_frame_div:not([style*="none"]), .smart-captcha, [class*="captcha"]')) return 'captcha';
    return null;
  }

  // ——— JSON-LD ———
  const typeOf = (n) => [].concat(n?.['@type'] || []).map(String);
  function fromLd(n) {
    const offers = [].concat(n.offers || []).flatMap((o) => (o && o['@type'] === 'AggregateOffer' && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
    const offer = offers.find((o) => o.price != null || o.lowPrice != null) || offers[0] || {};
    const price = parsePrice(offer.price ?? offer.lowPrice);
    const rating = n.aggregateRating || {};
    const sizes = [];
    for (const o of offers) {
      const z = clean(String(o.size || o.name || o.itemOffered?.size || ''));
      if (z && z.length <= 12) sizes.push({ z, av: !/OutOfStock|SoldOut/i.test(String(o.availability || '')) });
    }
    const avails = offers.map((o) => String(o.availability || '')).filter(Boolean);
    const avail = avails.find((a) => !/OutOfStock|SoldOut/i.test(a)) || avails[0] || '';
    return {
      url: abs(n.url || offer.url || n['@id']),
      title: clean(n.name),
      brand: brandName(n.brand || n.manufacturer),
      price,
      image: abs(firstImage(n.image)),
      rating: parseNumber(rating.ratingValue),
      reviews: parsePrice(rating.reviewCount ?? rating.ratingCount),
      sku: clean(String(n.sku || n.productID || n.mpn || '')) || null,
      color: clean(typeof n.color === 'string' ? n.color : ''),
      inStock: avail ? !/OutOfStock|SoldOut/i.test(avail) : null,
      sizes: sizes.filter((x) => x.av).map((x) => x.z),
      sizesOut: sizes.filter((x) => !x.av).map((x) => x.z),
    };
  }
  function jsonLd() {
    const out = [];
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (typeOf(n).some((t) => /Product/.test(t))) out.push(fromLd(n));
      if (typeOf(n).includes('ItemList')) for (const el of [].concat(n.itemListElement || [])) walk(el?.item && typeof el.item === 'object' ? el.item : el);
      if (n['@graph']) walk(n['@graph']);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { walk(JSON.parse(s.textContent)); } catch { /* битый JSON */ }
    }
    return out;
  }

  // ——— состояние приложения (Nuxt/Next/Redux) ———
  const NAME_KEYS = ['name', 'title', 'product_name', 'productName', 'displayName', 'display_name', 'model_name', 'full_name', 'fullName'];
  const PRICE_KEYS = ['price', 'final_price', 'finalPrice', 'price_amount', 'priceAmount', 'current_price', 'currentPrice', 'sale_price', 'salePrice', 'actual_price', 'actualPrice', 'min_price', 'minPrice', 'priceValue', 'prices'];
  const OLD_KEYS = ['old_price', 'oldPrice', 'original_price', 'originalPrice', 'price_original', 'base_price', 'basePrice', 'full_price', 'fullPrice', 'priceOld', 'crossed_price', 'crossedPrice', 'regular_price', 'regularPrice', 'price_without_discount'];
  const URL_KEYS = ['url', 'link', 'href', 'product_url', 'productUrl', 'seo_url', 'seoUrl', 'canonical', 'canonical_url', 'path', 'page_url', 'web_url'];
  const SKU_KEYS = ['sku', 'article', 'articul', 'vendor_code', 'vendorCode', 'product_id', 'productId', 'id', 'code'];
  const IMG_KEYS = ['image', 'images', 'thumbnail', 'thumb', 'picture', 'pictures', 'img', 'photo', 'photos', 'gallery', 'image_url', 'imageUrl', 'main_image'];
  const BRAND_KEYS = ['brand', 'brand_name', 'brandName', 'manufacturer', 'vendor', 'designer'];
  const SIZE_KEYS = ['sizes', 'size_list', 'sizeList', 'available_sizes', 'availableSizes', 'size_grid', 'sizeGrid'];

  function sizesFrom(raw) {
    if (!Array.isArray(raw)) return { av: [], out: [] };
    const av = [], out = [];
    for (const z of raw) {
      if (z == null) continue;
      if (typeof z !== 'object') { const s = clean(String(z)); if (s) av.push(s); continue; }
      const label = clean(String(pick(z, ['brand_title', 'title', 'name', 'value', 'size', 'label', 'size_name', 'sizeName', 'ru']) || ''));
      if (!label || label.length > 16) continue;
      const qty = z.stock_quantity ?? z.quantity ?? z.qty ?? z.stock ?? null;
      const available = z.is_available ?? z.isAvailable ?? z.available ?? z.in_stock ?? z.inStock ?? (qty != null ? qty > 0 : true);
      (available ? av : out).push(label);
    }
    return { av, out };
  }

  function fromObject(o) {
    const nameRaw = pick(o, NAME_KEYS);
    const title = typeof nameRaw === 'string' ? clean(nameRaw) : '';
    if (title.length < 3 || title.length > 300 || /^https?:/.test(title)) return null;
    let priceRaw = pick(o, PRICE_KEYS);
    if (Array.isArray(priceRaw)) priceRaw = priceRaw[0];
    const price = parsePrice(priceRaw);
    if (!price || price < 50 || price > 10_000_000) return null;
    const urlRaw = pick(o, URL_KEYS);
    const url = typeof urlRaw === 'string' && /[/.]/.test(urlRaw) ? abs(urlRaw) : null;
    const skuRaw = pick(o, SKU_KEYS);
    const sku = skuRaw != null && typeof skuRaw !== 'object' ? String(skuRaw) : null;
    if (!url && !sku) return null;
    const oldObj = priceRaw && typeof priceRaw === 'object' ? parsePrice(priceRaw.old ?? priceRaw.original ?? priceRaw.base ?? priceRaw.full ?? null) : null;
    const old = parsePrice(pick(o, OLD_KEYS)) || oldObj;
    const colorRaw = pick(o, ['color', 'colour', 'color_name', 'colorName', 'color_family']);
    const sz = sizesFrom(pick(o, SIZE_KEYS));
    return {
      url, title, sku, price,
      brand: brandName(pick(o, BRAND_KEYS)),
      old: old && old > price ? old : null,
      image: abs(firstImage(pick(o, IMG_KEYS))),
      rating: parseNumber(pick(o, ['rating', 'ratingValue', 'rating_value', 'average_rating'])),
      reviews: parsePrice(pick(o, ['reviews_count', 'reviewsCount', 'reviewCount', 'review_count', 'feedbacks'])),
      color: typeof colorRaw === 'string' ? clean(colorRaw) : clean(colorRaw?.name || colorRaw?.title || ''),
      sizes: sz.av,
      sizesOut: sz.out,
    };
  }
  function stateProducts() {
    const blobs = [];
    for (const k of ['__NUXT__', '__NEXT_DATA__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', '__STATE__', '__DATA__', '__APP_STATE__']) {
      try { if (window[k] && typeof window[k] === 'object') blobs.push(window[k]); } catch { /* доступ запрещён */ }
    }
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      try { blobs.push(JSON.parse(s.textContent)); } catch { /* не JSON */ }
    }
    const out = [];
    const seen = new Set();
    let visited = 0;
    const walk = (n, d) => {
      if (!n || typeof n !== 'object' || d > 30 || seen.has(n) || ++visited > 200000) return;
      seen.add(n);
      if (Array.isArray(n)) { for (const x of n) walk(x, d + 1); return; }
      const p = fromObject(n);
      if (p) out.push(p);
      for (const k in n) { const v = n[k]; if (v && typeof v === 'object') walk(v, d + 1); }
    };
    for (const b of blobs) walk(b, 0);
    return out;
  }

  // ——— карточки в отрисованной странице ———
  function pricesIn(text) {
    const out = [];
    for (const m of text.matchAll(PRICE_RE)) { const n = parsePrice(m[1]); if (n && n >= 50) out.push(n); }
    return out;
  }
  function cleanTitle(s) {
    const t = clean(String(s || '').replace(PRICE_RE, ' ').replace(/[−-]\s?\d{1,2}\s?%/g, ' '));
    return t.length >= 3 && !NOISE_RE.test(t) && /[a-zа-яё]{3}/i.test(t) ? t : '';
  }
  function domCards(linkRe) {
    const by = new Map();
    for (const a of document.querySelectorAll('a[href]')) {
      const url = abs(a.getAttribute('href'));
      if (!url || !linkRe.test(new URL(url).pathname)) continue;
      let node = a, card = null;
      for (let i = 0; i < 8 && node && node !== document.body; i++) {
        if (pricesIn(textOf(node)).length) { card = node; break; }
        node = node.parentElement;
      }
      if (!card) continue;
      const cardText = textOf(card);
      if (cardText.length > 2500) continue;
      const prices = pricesIn(cardText);
      const price = Math.min(...prices), maxP = Math.max(...prices);
      const img = card.querySelector('img');
      const imgSrc = img && (img.currentSrc || img.getAttribute('src') || img.getAttribute('data-src'));
      const named = card.querySelector('[class*="name" i], [class*="title" i], [itemprop="name"]');
      const brandEl = card.querySelector('[class*="brand" i], [itemprop="brand"]');
      const title = [named && textOf(named), a.getAttribute('title'), textOf(a), img && img.alt].map(cleanTitle).find(Boolean) || '';
      const item = {
        url, title, price,
        old: maxP > price && maxP < price * 5 ? maxP : null,
        image: imgSrc && !imgSrc.startsWith('data:') ? abs(imgSrc) : null,
        brand: brandEl ? clean(textOf(brandEl)).slice(0, 60) : '',
        text: cardText.slice(0, 400),
      };
      const k = key(url), prev = by.get(k);
      if (!prev) by.set(k, item);
      else for (const [f, v] of Object.entries(item)) if (!prev[f] && v) prev[f] = v;
    }
    return [...by.values()];
  }

  function merge(lists, accept) {
    const by = new Map(), order = [];
    for (const list of lists) {
      for (const it of list) {
        if (!it || !it.url || !it.price || !accept(it.url)) continue;
        const k = key(it.url);
        const prev = by.get(k);
        if (prev) { for (const [f, v] of Object.entries(it)) if ((prev[f] == null || prev[f] === '' || (Array.isArray(prev[f]) && !prev[f].length)) && v != null) prev[f] = v; }
        else if (it.title) { by.set(k, { ...it }); order.push(k); }
      }
    }
    return order.map((k) => by.get(k));
  }

  // ——— размеры/цвет на странице товара ———
  const SIZE_TEXT = /^(?:[2-4]?XS|XXS|XS|S|M|L|XL|XXL|[2-5]XL|\d{2}(?:[.,]5)?(?:\s?(?:RU|EU|IT|FR))?|\d{2}\/\d{2}|\d{2}-\d{2}|one ?size|единый)$/i;
  function sizesFromDom() {
    const containers = document.querySelectorAll('[class*="size" i], [data-test*="size" i], [data-testid*="size" i]');
    const av = [], out = [];
    for (const c of containers) {
      for (const el of c.querySelectorAll('button, li, label, a, span, div')) {
        if (el.children.length > 2) continue;
        const t = clean(el.textContent).replace(/\s+/g, ' ');
        const m = t.match(/^([^\s(]+(?:\s?(?:RU|EU|IT|FR))?)/);
        const z = m ? m[1] : '';
        if (!SIZE_TEXT.test(z)) continue;
        const cls = (el.className && String(el.className)) || '';
        const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || /disabled|unavailable|out|inactive|soldout|not-available/i.test(cls);
        (disabled ? out : av).push(z);
      }
      if (av.length + out.length >= 2) break;
    }
    const uniq = (a) => [...new Set(a)];
    return { av: uniq(av), out: uniq(out).filter((z) => !av.includes(z)) };
  }
  function colorFromDom() {
    const el = document.querySelector('[class*="color" i] [class*="name" i], [class*="colour" i], [itemprop="color"], [data-test*="color" i]');
    const t = el ? textOf(el) : '';
    return t && t.length < 40 ? t.replace(/^цвет:?\s*/i, '') : '';
  }

  async function waitFor(check, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = check();
      if (r) return r;
      await sleep(500);
    }
    return null;
  }

  window.__pricelExtract = async (mode, opts = {}) => {
    const linkRe = new RegExp(opts.linkPattern || '^/(product|p)/', 'i');
    const host = opts.host || location.hostname.replace(/^www\./, '');
    const accept = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '').endsWith(host) && linkRe.test(x.pathname); } catch { return false; } };

    if (mode === 'html') return { html: document.documentElement.outerHTML, url: location.href, title: document.title };

    if (mode === 'search') {
      const ready = await waitFor(() => {
        const b = blockedState();
        if (b) return { blocked: b };
        const links = [...document.querySelectorAll('a[href]')].filter((a) => accept(abs(a.getAttribute('href')) || '')).length;
        return links >= 2 ? { links } : null;
      }, opts.timeoutMs || 25000);
      if (ready && ready.blocked) return { blocked: ready.blocked, items: [], url: location.href, title: document.title };
      await sleep(800); // даём догрузиться ценам и картинкам
      window.scrollTo(0, document.body.scrollHeight / 2);
      await sleep(400);
      let items = merge([jsonLd(), stateProducts(), domCards(linkRe)], accept);
      let guessed = false;
      if (!items.length) {
        // Запасной путь, если адреса карточек устроены иначе: ссылки своего сайта с фото и ценой в карточке.
        const sameHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').endsWith(host); } catch { return false; } };
        items = merge([domCards(/\/[^/]+\/[^/]+/)], sameHost).filter((x) => x.image);
        guessed = items.length > 0;
      }
      return { blocked: null, items, guessed, url: location.href, title: document.title };
    }

    if (mode === 'product') {
      const ready = await waitFor(() => blockedState() ? { blocked: blockedState() } : (document.querySelector('h1') ? { ok: 1 } : null), opts.timeoutMs || 20000);
      if (ready && ready.blocked) return { blocked: ready.blocked };
      await sleep(1000);
      const here = key(location.href);
      const ld = jsonLd();
      const st = stateProducts();
      const main = ld.find((x) => x.url && key(x.url) === here) || ld.find((x) => x.price) || st.find((x) => x.url && key(x.url) === here) || st.find((x) => x.sizes && x.sizes.length) || {};
      const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`)?.getAttribute('content') || '';
      const dom = sizesFromDom();
      const withSizes = [main, ...st].find((x) => x && x.sizes && x.sizes.length);
      const item = {
        url: location.href.split('#')[0],
        title: main.title || clean(document.querySelector('h1')?.innerText || meta('og:title')),
        brand: main.brand || clean(meta('product:brand')) || clean(textOf(document.querySelector('[class*="brand" i]'))).slice(0, 60),
        price: main.price || parsePrice(meta('product:price:amount')) || null,
        old: main.old || null,
        image: main.image || abs(meta('og:image')),
        images: [...new Set([...document.querySelectorAll('meta[property="og:image"]')].map((m) => abs(m.content)).filter(Boolean))].slice(0, 6),
        color: main.color || colorFromDom(),
        sizes: withSizes ? withSizes.sizes : dom.av,
        sizesOut: withSizes ? (withSizes.sizesOut || []) : dom.out,
        rating: main.rating || null,
        reviews: main.reviews || null,
        inStock: main.inStock ?? null,
      };
      return { blocked: null, item };
    }
    return { error: 'unknown mode' };
  };
})();
