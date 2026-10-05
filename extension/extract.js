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
  // Проверка считается активной, только если на экране её спиннер/капча и нет содержимого.
  // (После прохождения проверки скрипт защиты остаётся на странице — по нему одному судить нельзя.)
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width * r.height > 2500 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'; };
  function blockedState() {
    if (/запрос отклонен|запрос отклонён|access denied/i.test(document.title)) return 'denied';
    const bodyText = (document.body?.innerText || '').trim().length;
    const spinner = document.querySelector('js-challenge-loader, #id_spinner');
    if (spinner && visible(spinner) && bodyText < 300) return 'challenge';
    const cap = [...document.querySelectorAll('iframe[src*="captcha" i], #id_captcha_frame_div, .smart-captcha, [class*="captcha" i]')].find(visible);
    if (cap && bodyText < 3000) return 'captcha';
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
      try {
        const v = window[k];
        if (v && typeof v === 'object' && !(v instanceof Node) && !(v === window)) blobs.push(v);
      } catch { /* доступ запрещён */ }
    }
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      try { blobs.push(JSON.parse(s.textContent)); } catch { /* не JSON */ }
    }
    const out = [];
    const seen = new Set();
    let visited = 0;
    const walk = (n, d) => {
      if (!n || typeof n !== 'object' || d > 30 || seen.has(n) || ++visited > 200000) return;
      // Не заходим в DOM-узлы, окна и фреймы (чужие фреймы бросают SecurityError).
      try { if (n instanceof Node || n === window || (typeof Window !== 'undefined' && n instanceof Window)) return; } catch { return; }
      seen.add(n);
      try {
        if (Array.isArray(n)) { for (const x of n) walk(x, d + 1); return; }
        const p = fromObject(n);
        if (p) out.push(p);
        for (const k in n) { const v = n[k]; if (v && typeof v === 'object') walk(v, d + 1); }
      } catch { /* недоступное свойство — пропускаем */ }
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

  // ——— точный разбор для конкретных магазинов (по их встроенным данным) ———
  // Stockmann (Next.js): <script id="__NEXT_DATA__"> — товары выдачи и карточка с размерами и наличием.
  // Lamoda (Nuxt): window.__NUXT__.payload.state.payload — products[] в выдаче, product на карточке.
  // Из данных берём только товары; остальное (в т. ч. сведения о покупателе) не читаем.

  function nextData() {
    // window.__NEXT_DATA__ может оказаться самим <script id="__NEXT_DATA__"> (элементы с id видны как свойства window).
    try { const w = window.__NEXT_DATA__; if (w && typeof w === 'object' && !(w instanceof Element) && w.props) return w; } catch { /* нет */ }
    const el = document.getElementById('__NEXT_DATA__');
    try { return el ? JSON.parse(el.textContent) : null; } catch { return null; }
  }
  const smImage = (images) => {
    const im = Array.isArray(images) ? images[0] : null;
    return abs(im?.default?.jpg?.src2x || im?.default?.jpg?.src || (im?.source ? 'https://stockmann.ru' + im.source : null));
  };
  // Акции Stockmann: «Сумасшедшие дни» (поля cdDay / cdDayDate / cdBadge / cdInfo / showCd — Crazy Days)
  // и прочие плашки товара (badge, badges, stateBadges, modeBadges, promotions).
  const badgeText = (b) => clean(typeof b === 'string' ? b : b && typeof b === 'object' ? String(b.text || b.name || b.title || b.label || b.value || '') : '');
  // Участие конкретного товара — только его собственная дата «Сумасшедшего дня» (на фото: «сб | с 17 октября»)
  // или его плашка. showCd, current_day_cd, cdInfo и счётчик cdDay заполнены у всех товаров — это общая акция,
  // а не участие вещи (из-за них в 0.4.3 в акцию попадали все товары).
  function stockmannPromo(p) {
    const crazyDate = clean(String(p.cdDayDate || ''));
    const crazyText = badgeText(p.cdBadge);
    const crazy = !!(crazyDate || crazyText);
    const badges = [...new Set([p.badge, ...[].concat(p.badges || [], p.stateBadges || [], p.modeBadges || [], p.promotions || [])].map(badgeText).filter(Boolean))].slice(0, 5);
    const raw = { cdDay: p.cdDay ?? null, cdDayDate: p.cdDayDate ?? null, showCd: p.showCd ?? null, current_day_cd: p.current_day_cd ?? null, cdBadge: p.cdBadge ?? null, profit: p.profit ?? null };
    if (!crazy && !badges.length) return { v: 2, crazy: false, badges: [], raw };
    return { v: 2, crazy, crazyText, crazyDate, profit: +p.profit || 0, badges, raw };
  }
  function stockmannItem(p) {
    if (!p || !p.name) return null;
    const cur = p.priceDiscount && p.priceDiscount < p.price ? p.priceDiscount : p.price;
    const color = (p.colors || []).find((c) => c.checked) || (p.colors || [])[0];
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    // main — российский размер, second — размер бренда (EU/IT); для подбора нужен российский.
    const label = (z) => clean(String(z.main || z.second || ''));
    // Наличие размера: «нет» — только если магазин прямо так говорит. Поле не нашлось — считаем, что неизвестно, а не «распродано».
    const avail = (z) => z.available ?? z.isAvailable ?? z.inStock ?? z.in_stock ?? (z.quantity != null ? z.quantity > 0 : null);
    return {
      url: abs(p.link || p.meta?.canonical || location.pathname),
      title: clean(p.name),
      brand: clean(typeof p.brand === 'string' ? p.brand : p.brand?.name || ''),
      price: parsePrice(cur),
      old: p.priceDiscount && p.priceDiscount < p.price ? parsePrice(p.price) : null,
      image: smImage(p.images),
      images: (p.images || []).slice(0, 6).map((im) => smImage([im])).filter(Boolean),
      color: clean(color?.name || ''),
      sizes: p.noSize ? ['без размера'] : sizes.filter((z) => avail(z) !== false).map(label).filter(Boolean),
      sizesOut: sizes.filter((z) => avail(z) === false).map(label).filter(Boolean),
      rating: parseNumber(p.rating),
      reviews: parsePrice(p.reviewsCount),
      inStock: p.available ?? p.isAvailable ?? null,
      sku: String(p.xmlId || p.productId || ''),
      gender: clean(String(p.gender || '')),
      detailed: sizes.length > 0 || !!p.noSize,
      promo: stockmannPromo(p),
    };
  }
  function stockmannExtract(mode) {
    const pp = nextData()?.props?.pageProps?.pageProps;
    if (!pp) return null;
    if (mode === 'search') {
      const list = pp.category?.products || pp.search?.products || pp.products;
      if (!Array.isArray(list)) return null;
      const pg = pp.category?.pagination || {};
      lastPage = { current: +pg.current || null, total: +pg.total || null, found: +pp.category?.productsCount || null };
      const bf = (pp.category?.filters || []).find((f) => f && (f.id === 'BRAND' || f.type === 'brands'));
      // Бренды из фильтра выдачи + бренды из меню сайта (там, например, Coccinelle и Furla в «Сумках»).
      lastFacetBrands = (bf?.values || []).map((v) => clean(v?.name || '')).filter(Boolean);
      lastBrands = [...lastFacetBrands, ...pageBrands()];
      return list.map(stockmannItem).filter((x) => x && x.url && x.price);
    }
    const it = pp.product ? stockmannItem(pp.product) : null;
    if (it) it.url = location.href.split(/[?#]/)[0];
    return it;
  }

  const LM_IMG = 'https://a.lmcdn.ru/img389x562';
  function lamodaState() {
    try { return window.__NUXT__?.payload?.state?.payload || null; } catch { return null; }
  }
  function lamodaSizes(sizes) {
    const av = [], out = [];
    for (const z of Array.isArray(sizes) ? sizes : []) {
      const brand = clean(String(z.brand_size || z.brand_title || ''));
      const ru = clean(String(z.size || (z.size_system === 'RUS' ? z.title : '') || ''));
      // Буквенный размер бренда (M, XL, OneSize) показываем вместе с российским: «M/46».
      // Числовой размер бренда (европейский, 38/44) не показываем — его легко спутать с российским.
      const letter = /^(?:[2-5]?X{0,3}[SML]|XS|XXS|one ?size)$/i.test(brand);
      const label = letter && ru ? brand + '/' + ru : ru || brand;
      if (!label) continue;
      const qty = z.stock_quantity;
      const available = z.is_available ?? (qty != null ? qty > 0 : true);
      (available ? av : out).push(label);
    }
    return { av, out };
  }
  function lamodaItem(p) {
    if (!p || !p.sku) return null;
    const title = clean(p.name || p.title || '');
    const price = parsePrice(p.price_amount ?? p.price);
    const old = parsePrice(p.old_price_amount ?? p.old_price);
    const sz = lamodaSizes(p.sizes);
    const colorsObj = p.colors;
    const color = clean(p.color_family || (Array.isArray(colorsObj) ? colorsObj[0]?.title : colorsObj && Object.values(colorsObj)[0]) || '');
    const rating = p.rating?.average_rating ?? p.average_rating;
    const thumb = p.thumbnail || (p.gallery || [])[0];
    return {
      url: abs('/p/' + String(p.sku).toLowerCase() + '/' + (p.seo_tail || '') + (p.seo_tail ? '/' : '')),
      title,
      brand: clean(p.brand?.name || ''),
      price,
      old: old && price && old > price ? old : null,
      image: thumb ? LM_IMG + thumb : null,
      images: (p.gallery || []).slice(0, 6).map((g) => LM_IMG + g),
      color,
      sizes: sz.av,
      sizesOut: sz.out,
      rating: rating ? Math.round((rating > 5 ? rating / 20 : rating) * 10) / 10 : null,
      reviews: parsePrice(p.rating?.reviews_count ?? p.reviews?.total ?? null),
      inStock: p.is_in_stock ?? p.is_sellable ?? (sz.av.length ? true : null),
      sku: p.sku,
      gender: clean(String(p.gender || '')),
      detailed: sz.av.length + sz.out.length > 0,
    };
  }
  function lamodaExtract(mode) {
    const st = lamodaState();
    if (!st) return null;
    if (mode === 'search') {
      if (!Array.isArray(st.products)) return null;
      const pg = st.pagination || {};
      lastPage = { current: +pg.page || null, total: +pg.pages || null, found: +pg.found || null };
      const bf = (st.facets || []).find((f) => f && f.name === 'brands');
      lastBrands = (bf?.list_value?.values || []).map((v) => clean(v?.title || v?.formatted_title || '')).filter(Boolean);
      lastFacetBrands = lastBrands;
      return st.products.map(lamodaItem).filter((x) => x && x.title && x.price);
    }
    const it = st.product ? lamodaItem(st.product) : null;
    if (it) it.url = location.href.split(/[?#]/)[0];
    return it;
  }

  // Stockmann отдаёт картинки только своим страницам (защита требует cookie, которые браузер не шлёт
  // для картинок на чужом сайте). Поэтому скачиваем уменьшенное фото здесь, на странице магазина,
  // и передаём сайту как data:-URL. Если не вышло — оставляем обычную ссылку.
  // all — встроить всю галерею (до 6 фото), а не только главное фото: для страницы вещи.
  async function inlineImages(items, max = 60, all = false) {
    const host = location.hostname.replace(/^www\./, '');
    if (!host.endsWith('stockmann.ru')) return items;
    const small = (u) => u.replace('/pi/bx2/', '/pi/b/').replace('/pi/ppx2/', '/pi/b/').replace('/pi/pp/', '/pi/b/');
    const toData = async (url) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const r = await fetch(url, { credentials: 'include', signal: ctrl.signal });
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.startsWith('image/')) return null;
        const blob = await r.blob();
        if (blob.size > 400000) return null;
        return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
      } catch { return null; } finally { clearTimeout(t); }
    };
    const queue = items.filter((x) => x.image && !x.image.startsWith('data:')).slice(0, max);
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        if (all) {
          // Галерея: каждое фото — отдельно; не загрузилось — пропускаем.
          const src = [...new Set([it.image, ...(it.images || [])].filter(Boolean))].slice(0, 6);
          const got = [];
          for (const u of src) { const d = u.startsWith('data:') ? u : (await toData(small(u))) || (await toData(u)); if (d) got.push(d); }
          if (got.length) { it.image = got[0]; it.images = got; }
          continue;
        }
        const data = (await toData(small(it.image))) || (await toData(it.image));
        if (data) { it.image = data; it.images = [data]; }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return items;
  }

  // Все бренды, упомянутые на странице: объекты { name, url: '/brands/…/' } в данных Next.js
  // (меню, страница «Все бренды») и ссылки на страницы брендов в разметке.
  const BRAND_URL = /^\/brands?\/[^/?#]+\/?(?:[?#].*)?$/i;
  const NOT_BRAND = /^(все бренды|бренды|brands|все)$/i;
  function pageBrands() {
    const out = new Map();
    const add = (name) => {
      const n = clean(String(name || '')).replace(/\s*\(\d+\)$/, '');
      if (!n || n.length > 40 || NOT_BRAND.test(n) || /^\d+$/.test(n)) return;
      if (!out.has(n.toLowerCase())) out.set(n.toLowerCase(), n);
    };
    const seen = new Set();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 14 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      const link = o.url || o.link || o.href;
      if (typeof o.name === 'string' && typeof link === 'string' && BRAND_URL.test(link.replace(/^https?:\/\/[^/]+/, ''))) add(o.name);
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1);
    };
    try { walk(nextData(), 0); } catch { /* нет данных Next.js */ }
    for (const a of document.querySelectorAll('a[href]')) {
      let path = '';
      try { path = new URL(a.getAttribute('href'), location.href).pathname; } catch { continue; }
      if (BRAND_URL.test(path)) add(textOf(a) || a.getAttribute('title'));
    }
    return [...out.values()];
  }

  let lastPage = null; // { current, total, found } — пагинация выдачи магазина
  let lastBrands = []; // бренды из фильтров магазина по этому запросу (+ у Stockmann бренды из меню сайта)
  let lastFacetBrands = []; // только бренды из фильтра выдачи — то есть бренды именно этой категории вещей

  function storeExtract(mode) {
    const h = location.hostname.replace(/^www\./, '');
    try {
      if (h.endsWith('stockmann.ru')) return stockmannExtract(mode);
      if (h.endsWith('lamoda.ru')) return lamodaExtract(mode);
    } catch { /* структура изменилась — дальше общий разбор */ }
    return null;
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
    // Быстрый опрос: идёт ли ещё проверка «не робот» (для ожидания, пока её проходит человек).
    if (mode === 'state') return { blocked: blockedState(), ready: document.readyState === 'complete' };
    // Список брендов магазина (страница «Все бренды»).
    if (mode === 'brands') {
      const ready = await waitFor(() => {
        const b = blockedState();
        if (b) return { blocked: b };
        const list = pageBrands();
        return list.length >= 30 ? { list } : null;
      }, opts.timeoutMs || 20000);
      if (ready && ready.blocked) return { blocked: ready.blocked, brands: [] };
      await sleep(600);
      return { blocked: null, brands: pageBrands(), url: location.href };
    }

    if (mode === 'search') {
      const ready = await waitFor(() => {
        const b = blockedState();
        if (b) return { blocked: b };
        const exact = storeExtract('search');
        if (exact && exact.length) return { exact: exact.length };
        const links = [...document.querySelectorAll('a[href]')].filter((a) => accept(abs(a.getAttribute('href')) || '')).length;
        return links >= 2 ? { links } : null;
      }, opts.timeoutMs || 25000);
      if (ready && ready.blocked) return { blocked: ready.blocked, items: [], url: location.href, title: document.title };
      const exact = storeExtract('search');
      if (exact && exact.length) return { blocked: null, items: opts.brandsOnly ? [] : opts.noInline ? exact : await inlineImages(exact), page: lastPage, brands: lastBrands, facetBrands: lastFacetBrands, source: 'store', url: location.href, title: document.title };
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
      const exact = storeExtract('product');
      if (exact && exact.price) return { blocked: null, item: (await inlineImages([exact], 1, true))[0], source: 'store' };
      await sleep(1500); // страница могла не успеть дорисоваться — пробуем ещё раз
      const again = storeExtract('product');
      if (again && again.price) return { blocked: null, item: (await inlineImages([again], 1, true))[0], source: 'store' };
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
        inStock: main.inStock ?? (exact || again)?.inStock ?? null,
      };
      // Цены не нашлось. «Нет в наличии» — только если страница сама так говорит (кнопка, плашка);
      // иначе это сбой разбора (капча, недогруженная страница, магазин поменял сайт), а не распродажа.
      const head = clean((document.querySelector('main') || document.body)?.innerText || '').slice(0, 4000);
      const soldText = !item.price && /нет в наличии|распродан|товар закончился|нет в продаже|снят с продажи|sold out/i.test(head);
      const diag = { title: document.title, h1: clean(document.querySelector('h1')?.innerText || '').slice(0, 120), next: !!nextData(), nuxt: !!lamodaState(),
        storeItem: !!(exact || again), textLen: (document.body?.innerText || '').length };
      return { blocked: null, item, soldText, diag };
    }
    return { error: 'unknown mode' };
  };
})();
