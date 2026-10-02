// Фоновая часть расширения «Отмерь».
// По запросу сайта открывает поиск магазина в свёрнутом окне вашего браузера, читает выдачу,
// затем открывает карточки найденных товаров (по 2 одновременно) и собирает размеры, цвет, бренд.
// Если магазин спрашивает «вы не робот?», окно разворачивается, чтобы вы прошли проверку сами.

const STORES = {
  stockmann: {
    name: 'Stockmann', host: 'stockmann.ru',
    search: (q) => 'https://stockmann.ru/search/?q=' + encodeURIComponent(q),
    // Параметр страницы у Stockmann не документирован — пробуем варианты и проверяем номер страницы в данных.
    page: (q, n, param) => 'https://stockmann.ru/search/?q=' + encodeURIComponent(q) + '&' + param + '=' + n,
    pageParams: ['page', 'PAGEN_1'],
    maxPages: 6,
    linkPattern: '^/(?:product|catalog/product|p)/[^/]+',
    brands: ['https://stockmann.ru/brands/', 'https://stockmann.ru/brands/?role=women'],
  },
  lamoda: {
    name: 'Lamoda', host: 'lamoda.ru',
    search: (q) => 'https://www.lamoda.ru/catalogsearch/result/?q=' + encodeURIComponent(q),
    page: (q, n, param) => 'https://www.lamoda.ru/catalogsearch/result/?q=' + encodeURIComponent(q) + '&' + param + '=' + n,
    pageParams: ['page'],
    maxPages: 3,
    linkPattern: '^/p/[a-z0-9]{6,}/',
  },
};

const DETAILS_LIMIT = 16;       // сколько карточек открывать ради размеров/цвета
const DETAILS_PARALLEL = 2;     // одновременно открытых карточек на магазин
const DETAILS_TTL = 12 * 3600e3; // кэш карточек
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const storeForUrl = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    return Object.entries(STORES).find(([, s]) => host === s.host || host.endsWith('.' + s.host)) || null;
  } catch {
    return null;
  }
};

// ——— вкладки ———

async function openWindow() {
  const w = await chrome.windows.create({ url: 'about:blank', state: 'minimized' });
  return w.id;
}
async function closeWindow(id) { try { await chrome.windows.remove(id); } catch { /* уже закрыто */ } }

function waitLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(on); clearTimeout(t); resolve(); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === 'complete' && tab.url !== 'about:blank') done(); }).catch(done);
  });
}

async function extract(tabId, mode, opts) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['extract.js'] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: (m, o) => window.__pricelExtract(m, o),
    args: [mode, opts],
  });
  return res?.result;
}

/** Ждёт, пока человек пройдёт проверку «не робот» во вкладке (до 3 минут). Переживает перезагрузки страницы. */
async function waitHuman(tabId, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
    try { await chrome.tabs.get(tabId); } catch { return false; } // вкладку закрыли
    let st;
    try { st = await extract(tabId, 'state', {}); } catch { continue; } // страница перезагружается
    if (st && st.ready && !st.blocked) return true;
  }
  return false;
}

/** Открывает url во вкладке окна и разбирает. Если магазин показывает проверку — просит пользователя её пройти. */
async function visit(windowId, url, mode, opts, onNeedHuman, quiet = false) {
  const tab = await chrome.tabs.create({ windowId, url, active: false });
  try {
    await waitLoaded(tab.id);
    let r = await extract(tab.id, mode, opts);
    // Автопроверка (quiet) не разворачивает окно посреди вашей работы: проверку «не робот» просто пропускаем.
    if (r && (r.blocked === 'captcha' || r.blocked === 'challenge') && quiet) return { blocked: r.blocked };
    if (r && (r.blocked === 'captcha' || r.blocked === 'challenge')) {
      // Показываем вкладку человеку и ждём, пока проверка будет пройдена.
      onNeedHuman?.();
      await chrome.windows.update(windowId, { state: 'normal', focused: true, width: 1100, height: 850 }).catch(() => {});
      await chrome.tabs.update(tab.id, { active: true });
      chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'Отмерь', message: 'Магазин просит подтвердить, что вы не робот. Пройдите проверку в открывшемся окне — поиск продолжится сам.' });
      const passed = await waitHuman(tab.id);
      if (!passed) return { blocked: r.blocked };
      await waitLoaded(tab.id, 10000);
      r = await extract(tab.id, mode, opts);
      await chrome.windows.update(windowId, { state: 'minimized' }).catch(() => {});
    }
    return r;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// ——— кэш карточек ———

async function cachedDetails(url) {
  const k = 'd2:' + url; // d2 — с полной галереей фото
  const v = (await chrome.storage.local.get(k))[k];
  return v && Date.now() - v.t < DETAILS_TTL ? v.item : null;
}
async function saveDetails(url, item) {
  await chrome.storage.local.set({ ['d2:' + url]: { t: Date.now(), item } });
}

function mergeDetails(item, d) {
  if (!d) return item;
  const out = { ...item };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'url' || k === 'title') continue;
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) out[k] = v;
  }
  if (!out.title && d.title) out.title = d.title;
  // Акция с карточки важнее, чем её отсутствие в выдаче; но и «акции больше нет» с карточки — тоже правда.
  if ('promo' in d) out.promo = d.promo;
  out.detailed = true;
  return out;
}

// ——— задачи ———

async function searchJob(storeId, query, limit, send) {
  const s = STORES[storeId];
  if (!s) return send({ pricel: 'result', status: 'error', items: [], error: 'неизвестный магазин' });
  const searchUrl = s.search(query);
  const win = await openWindow();
  try {
    send({ pricel: 'progress', stage: 'search' });
    const r = await visit(win, searchUrl, 'search', { linkPattern: s.linkPattern, host: s.host }, () => send({ pricel: 'progress', stage: 'human' }));
    if (!r) return send({ pricel: 'result', status: 'error', items: [], error: 'страница не открылась', searchUrl });
    if (r.blocked) {
      const why = r.blocked === 'denied' ? 'магазин отклонил запрос' : 'проверка «не робот» не пройдена';
      return send({ pricel: 'result', status: 'blocked', items: [], error: why, searchUrl });
    }
    if (!r.items.length) return send({ pricel: 'result', status: 'empty', items: [], error: 'на странице не нашлось товаров', searchUrl });

    // Следующие страницы выдачи: пока есть новые товары и не набран лимит.
    const max = limit || 150;
    const seen = new Set(r.items.map((x) => x.url));
    let all = r.items.slice();
    let total = r.page?.total || null;
    let param = null;
    for (let n = 2; n <= (s.maxPages || 1) && all.length < max && (!total || n <= total); n++) {
      send({ pricel: 'progress', stage: 'search', page: n, found: all.length, total: r.page?.found || null });
      let fresh = null;
      for (const p of param ? [param] : s.pageParams) {
        await sleep(1200);
        let pr = null;
        try { pr = await visit(win, s.page(query, n, p), 'search', { linkPattern: s.linkPattern, host: s.host }, () => send({ pricel: 'progress', stage: 'human' })); } catch { pr = null; }
        if (!pr || pr.blocked || !pr.items?.length) continue;
        // Магазин проигнорировал параметр и вернул первую страницу — пробуем другой.
        if (pr.page?.current && pr.page.current !== n) continue;
        const items = pr.items.filter((x) => !seen.has(x.url));
        if (!items.length) continue;
        param = p;
        total = pr.page?.total || total;
        fresh = items;
        break;
      }
      if (!fresh) break;
      fresh.forEach((x) => seen.add(x.url));
      all = all.concat(fresh);
    }
    let items = all.slice(0, max);

    // Карточки открываем только для товаров, по которым выдача не дала размеров
    // (у Stockmann и Lamoda размеры, цвет и бренд обычно есть прямо в выдаче).
    const need = items.filter((x) => !x.detailed).slice(0, DETAILS_LIMIT);
    let done = 0;
    send({ pricel: 'progress', stage: 'details', done, total: need.length, found: items.length });
    const queue = [...need];
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        let d = await cachedDetails(it.url);
        if (!d) {
          try {
            const pr = await visit(win, it.url, 'product', { linkPattern: s.linkPattern, host: s.host });
            if (pr && pr.item) { d = pr.item; await saveDetails(it.url, d); }
          } catch { /* карточка не открылась — оставляем данные из выдачи */ }
          await sleep(700);
        }
        const i = items.indexOf(it);
        if (i >= 0) items[i] = mergeDetails(it, d);
        done++;
        send({ pricel: 'progress', stage: 'details', done, total: need.length, found: items.length });
      }
    };
    await Promise.all(Array.from({ length: DETAILS_PARALLEL }, worker));
    items = items.map((x) => ({ ...x, store: s.name, storeId }));
    send({ pricel: 'result', status: 'ok', items, searchUrl, brands: (r.brands || []).slice(0, 2000) });
  } catch (e) {
    send({ pricel: 'result', status: 'error', items: [], error: String(e.message || e), searchUrl });
  } finally {
    await closeWindow(win);
  }
}

async function detailsJob(url, send) {
  const found = storeForUrl(url);
  if (!found) return send({ pricel: 'result', status: 'error', error: 'ссылка не на поддерживаемый магазин' });
  const [storeId, s] = found;
  const cached = await cachedDetails(url);
  if (cached) return send({ pricel: 'result', status: 'ok', item: { ...cached, store: s.name, storeId } });
  const win = await openWindow();
  try {
    const r = await visit(win, url, 'product', { linkPattern: s.linkPattern, host: s.host });
    if (!r || r.blocked || !r.item) return send({ pricel: 'result', status: 'blocked', error: 'карточка не открылась' });
    await saveDetails(url, r.item);
    send({ pricel: 'result', status: 'ok', item: { ...r.item, store: s.name, storeId } });
  } catch (e) {
    send({ pricel: 'result', status: 'error', error: String(e.message || e) });
  } finally {
    await closeWindow(win);
  }
}

/**
 * Свежие цены товаров из избранного: открывает карточки по очереди в одном свёрнутом окне, без кэша.
 * auto — автопроверка: без проверки «не робот» (магазин, который дважды её показал, пропускаем до следующего раза)
 * и без кэша карточек (в нём фото, а хранилище расширения не резиновое).
 */
async function recheckJob(urls, send, auto = false) {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && storeForUrl(u)).slice(0, auto ? 300 : 100);
  if (!list.length) return send({ pricel: 'result', status: 'empty', items: [] });
  const win = await openWindow();
  const out = [];
  const blockedBy = {};
  try {
    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      const [storeId, s] = storeForUrl(url);
      send({ pricel: 'progress', stage: 'recheck', done: i, total: list.length });
      if (auto && blockedBy[storeId] >= 2) { out.push({ url, status: 'blocked' }); continue; }
      let r = null;
      try { r = await visit(win, url, 'product', { linkPattern: s.linkPattern, host: s.host }, () => send({ pricel: 'progress', stage: 'human' }), auto); } catch { r = null; }
      if (r && r.blocked) blockedBy[storeId] = (blockedBy[storeId] || 0) + 1;
      if (r && r.item && r.item.price) {
        if (!auto) await saveDetails(url, r.item);
        out.push({ url, status: 'ok', item: { ...r.item, url, store: s.name, storeId } });
      } else if (r && r.item) {
        // Карточка открылась, но цены нет — обычно товар распродан или снят с продажи.
        out.push({ url, status: 'noprice', item: { ...r.item, url, store: s.name, storeId } });
      } else {
        out.push({ url, status: r && r.blocked ? 'blocked' : 'error' });
      }
      if (i < list.length - 1) await sleep(900);
    }
    send({ pricel: 'result', status: 'ok', items: out });
  } catch (e) {
    send({ pricel: 'result', status: 'error', items: out, error: String(e.message || e) });
  } finally {
    await closeWindow(win);
  }
}

const BRANDS_TTL = 7 * 86400e3;

/** Полный список брендов магазина со страницы «Все бренды» (кэш на неделю). */
async function brandsJob(storeId, force, send) {
  const s = STORES[storeId];
  if (!s || !s.brands) return send({ pricel: 'result', status: 'error', brands: [], error: 'у магазина нет списка брендов' });
  const k = 'brands:' + storeId;
  const cached = (await chrome.storage.local.get(k))[k];
  if (!force && cached && Date.now() - cached.t < BRANDS_TTL) return send({ pricel: 'result', status: 'ok', brands: cached.list, cached: true });
  const win = await openWindow();
  try {
    const all = new Map();
    let blocked = null;
    for (const url of s.brands) {
      let r = null;
      try { r = await visit(win, url, 'brands', { host: s.host }, () => send({ pricel: 'progress', stage: 'human' })); } catch { r = null; }
      if (r?.blocked) { blocked = r.blocked; break; }
      for (const b of r?.brands || []) if (!all.has(b.toLowerCase())) all.set(b.toLowerCase(), b);
      if (all.size >= 150) break; // на общей странице уже все бренды
      await sleep(800);
    }
    const list = [...all.values()].slice(0, 5000);
    if (list.length) await chrome.storage.local.set({ [k]: { t: Date.now(), list } });
    if (!list.length) return send({ pricel: 'result', status: blocked ? 'blocked' : 'empty', brands: cached?.list || [], error: blocked ? 'проверка «не робот» не пройдена' : 'на странице брендов ничего не нашлось' });
    send({ pricel: 'result', status: 'ok', brands: list });
  } catch (e) {
    send({ pricel: 'result', status: 'error', brands: cached?.list || [], error: String(e.message || e) });
  } finally {
    await closeWindow(win);
  }
}

// ——— автопроверка цен избранного ———
// Сайт сообщает расширению список вещей, за которыми вы следите (сообщение watch). Раз в день, пока открыт Chrome,
// расширение само открывает их карточки в свёрнутом окне, отправляет цены на сервер истории и, если что-то
// подешевело, дошло до цели или вернулось в продажу, показывает уведомление. Сайт забирает результаты при открытии.

const AUTO_KEY = 'auto';
const AUTO_EVERY = 24 * 3600e3;
const AUTO_RUNS = 14; // сколько последних проверок храним, пока сайт их не забрал
let autoBusy = false;

async function autoState() {
  const st = (await chrome.storage.local.get(AUTO_KEY))[AUTO_KEY] || {};
  return { enabled: true, items: [], runs: [], ...st };
}
async function saveAuto(patch) {
  const st = await autoState();
  await chrome.storage.local.set({ [AUTO_KEY]: { ...st, ...patch } });
}
const lastCheck = (st) => Math.max(st.lastRun || 0, st.lastManual || 0);

// Без фото: в результатах хватает цены, наличия и размеров; фото на сайте уже есть.
function slim(item) {
  if (!item) return item;
  const { images, image, ...rest } = item;
  return { ...rest, image: typeof image === 'string' && !image.startsWith('data:') ? image : null };
}

/** Убирает устаревшие карточки из кэша, чтобы хранилище не переполнялось фотографиями. */
async function purgeDetails() {
  const all = await chrome.storage.local.get(null);
  const old = Object.keys(all).filter((k) => k.startsWith('d2:') && !(all[k] && Date.now() - all[k].t < DETAILS_TTL));
  if (old.length) await chrome.storage.local.remove(old);
}

async function recordPrices(api, results, byUrl) {
  if (!api) return;
  const items = results.filter((x) => x.status === 'ok' && x.item && x.item.price && byUrl[x.url])
    .map((x) => ({ id: byUrl[x.url].id, url: x.url, title: byUrl[x.url].title || x.item.title, store: x.item.store, price: x.item.price, old: x.item.old || null }));
  if (!items.length) return;
  try { await fetch(api + '/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }); } catch { /* сайт запишет сам */ }
}

const rub = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const nameOf = (w) => ((w.brand ? w.brand + ' ' : '') + (w.title || '')).trim().slice(0, 60);

/** Что сообщить после проверки: подешевели, дошли до цели, вернулись в продажу. */
function autoNews(results, byUrl) {
  const goal = [], down = [], back = [];
  for (const x of results) {
    const w = byUrl[x.url];
    if (!w || x.status !== 'ok' || !x.item?.price) continue;
    const p = x.item.price;
    if (w.soldOut) back.push(w);
    else if (w.target && p <= w.target && !(w.price <= w.target)) goal.push({ w, p });
    else if (w.price && p < w.price) down.push({ w, p, d: Math.round((1 - p / w.price) * 100) });
  }
  const lines = [
    ...goal.map(({ w, p }) => 'Цель достигнута: ' + nameOf(w) + ' — ' + rub(p)),
    ...down.map(({ w, p, d }) => nameOf(w) + ' — ' + rub(p) + (d ? ' (−' + d + ' %)' : '')),
    ...back.map((w) => 'Снова в продаже: ' + nameOf(w)),
  ];
  return { count: goal.length + down.length + back.length, goal: goal.length, down: down.length, back: back.length, lines };
}

async function autoRun(force = false) {
  if (autoBusy) return { status: 'busy' };
  const st = await autoState();
  if (!st.items.length) return { status: 'empty' };
  if (!force && (!st.enabled || Date.now() - lastCheck(st) < AUTO_EVERY)) return { status: 'skip' };
  autoBusy = true;
  await saveAuto({ running: Date.now() });
  try {
    await purgeDetails().catch(() => {});
    const byUrl = Object.fromEntries(st.items.map((w) => [w.url, w]));
    const r = await new Promise((resolve) => recheckJob(st.items.map((w) => w.url), (m) => { if (m.pricel === 'result') resolve(m); }, true));
    const results = (r.items || []).map((x) => ({ ...x, item: slim(x.item) }));
    const at = Date.now();
    await recordPrices(st.api, results, byUrl);
    const news = autoNews(results, byUrl);
    // Следующее сравнение — с только что увиденными ценами.
    const fresh = await autoState();
    const seen = Object.fromEntries(results.filter((x) => x.status === 'ok' || x.status === 'noprice').map((x) => [x.url, x]));
    const items = fresh.items.map((w) => (seen[w.url] ? { ...w, price: seen[w.url].item?.price || w.price, soldOut: seen[w.url].status === 'noprice' } : w));
    const ok = results.filter((x) => x.status === 'ok').length;
    const run = { at, results, news: { count: news.count, goal: news.goal, down: news.down, back: news.back }, ok, total: results.length };
    await saveAuto({ items, lastRun: at, running: null, runs: [...(fresh.runs || []), run].slice(-AUTO_RUNS), lastSummary: { at, ...run.news, ok, total: results.length } });
    if (news.count) {
      chrome.notifications.create('otmer-auto', {
        type: 'basic', iconUrl: 'icon.png', priority: 1,
        title: 'Отмерь: ' + (news.goal ? 'пора покупать' : news.down ? 'подешевело' : 'снова в продаже'),
        message: news.lines.slice(0, 3).join('\n') + (news.lines.length > 3 ? '\nи ещё ' + (news.lines.length - 3) : ''),
      });
    }
    return { status: 'ok', run };
  } catch (e) {
    await saveAuto({ running: null });
    return { status: 'error', error: String(e.message || e) };
  } finally {
    autoBusy = false;
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== 'otmer-auto') return;
  const st = await autoState();
  chrome.tabs.create({ url: (st.site || 'https://healingward.github.io/msrbka/') + '#/lists' });
  chrome.notifications.clear(id);
});

// Будильник раз в час: если с последней проверки прошли сутки — проверяем. Так проверка случится и после того,
// как компьютер был выключен (Chrome не умеет будить сам себя).
function ensureAlarm() {
  chrome.alarms.get('otmer-auto', (a) => { if (!a) chrome.alarms.create('otmer-auto', { delayInMinutes: 2, periodInMinutes: 60 }); });
}
chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'otmer-auto') autoRun(false); });

/** Сообщение сайта: список вещей для автопроверки. В ответ — проверки, которые сайт ещё не забрал. */
async function autoWatch(m) {
  const items = (Array.isArray(m.items) ? m.items : []).filter((w) => w && typeof w.url === 'string' && storeForUrl(w.url)).slice(0, 300)
    .map((w) => ({ id: String(w.id || ''), url: w.url, title: String(w.title || '').slice(0, 120), brand: String(w.brand || '').slice(0, 60),
      price: +w.price || 0, target: +w.target || null, soldOut: !!w.soldOut }));
  const st = await autoState();
  // Цены, которые уже видело расширение, новее цен сайта, пока сайт не забрал проверку.
  const prev = Object.fromEntries(st.items.map((w) => [w.url, w]));
  const applied = +m.applied || 0;
  const merged = items.map((w) => (prev[w.url] && (st.lastRun || 0) > applied ? { ...w, price: prev[w.url].price, soldOut: prev[w.url].soldOut } : w));
  const runs = (st.runs || []).filter((r) => r.at > applied);
  await saveAuto({ items: merged, site: typeof m.site === 'string' ? m.site : st.site, api: typeof m.api === 'string' ? m.api : st.api,
    lastManual: Math.max(st.lastManual || 0, +m.lastManual || 0), runs });
  return { status: 'ok', runs, auto: { enabled: st.enabled, lastRun: st.lastRun || null, running: st.running || null, every: AUTO_EVERY } };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pricel') return;
  let alive = true;
  port.onDisconnect.addListener(() => { alive = false; });
  const send = (m) => { if (alive) try { port.postMessage(m); } catch { alive = false; } };
  port.onMessage.addListener((m) => {
    if (m.type === 'search') searchJob(m.store, String(m.query || '').slice(0, 200), m.limit, send);
    else if (m.type === 'details' && typeof m.url === 'string') detailsJob(m.url, send);
    else if (m.type === 'brands') brandsJob(m.store, !!m.force, send);
    else if (m.type === 'recheck') recheckJob(m.urls, send);
  });
});

// ——— диагностика для настройки разбора (кнопка в окне расширения) ———

function toDataUrl(text, type) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:' + type + ';base64,' + btoa(bin);
}

async function dumpPages(query) {
  const report = {};
  for (const [storeId, s] of Object.entries(STORES)) {
    const win = await openWindow();
    try {
      const tab = await chrome.tabs.create({ windowId: win, url: s.search(query), active: false });
      await waitLoaded(tab.id);
      const r = await extract(tab.id, 'search', { linkPattern: s.linkPattern, host: s.host });
      const page = await extract(tab.id, 'html', {});
      await chrome.downloads.download({ url: toDataUrl(page.html, 'text/html'), filename: `otmer/${storeId}-search.html`, conflictAction: 'overwrite' });
      report[storeId] = { searchUrl: page.url, title: page.title, blocked: r?.blocked || null, found: r?.items?.length || 0, items: (r?.items || []).slice(0, 5) };
      // Первая карточка: из выдачи или любая ссылка, похожая на товар.
      const first = r?.items?.[0]?.url;
      if (first) {
        await chrome.tabs.update(tab.id, { url: first });
        await sleep(1000);
        await waitLoaded(tab.id);
        const pr = await extract(tab.id, 'product', { linkPattern: s.linkPattern, host: s.host });
        const ph = await extract(tab.id, 'html', {});
        await chrome.downloads.download({ url: toDataUrl(ph.html, 'text/html'), filename: `otmer/${storeId}-product.html`, conflictAction: 'overwrite' });
        report[storeId].product = pr?.item || null;
      }
    } catch (e) {
      report[storeId] = { ...(report[storeId] || {}), error: String(e.message || e) };
    } finally {
      await closeWindow(win);
    }
  }
  await chrome.downloads.download({ url: toDataUrl(JSON.stringify(report, null, 2), 'application/json'), filename: 'otmer/report.json', conflictAction: 'overwrite' });
  return report;
}

/** Сохраняет открытую сейчас страницу магазина — чтобы прислать её для настройки разбора. */
async function dumpActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !storeForUrl(tab.url || '')) throw new Error('откройте страницу товара Stockmann или Lamoda и нажмите кнопку ещё раз');
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => document.documentElement.outerHTML });
  const name = 'otmer/page-' + new URL(tab.url).hostname.replace(/^www\./, '') + '-' + Date.now() + '.html';
  await chrome.downloads.download({ url: toDataUrl(res.result, 'text/html'), filename: name, conflictAction: 'overwrite' });
  return name;
}

chrome.runtime.onMessage.addListener((m, _sender, sendResponse) => {
  if (m && m.type === 'watch') {
    autoWatch(m).then(sendResponse, (e) => sendResponse({ status: 'error', error: String(e.message || e) }));
    return true;
  }
  if (m && m.type === 'autoStatus') {
    autoState().then((st) => sendResponse({ enabled: st.enabled, count: st.items.length, lastRun: st.lastRun || null, lastManual: st.lastManual || null,
      running: autoBusy ? st.running : null, last: st.lastSummary || null, site: st.site }));
    return true;
  }
  if (m && m.type === 'autoNow') {
    autoRun(true).then(sendResponse);
    return true;
  }
  if (m && m.type === 'autoToggle') {
    saveAuto({ enabled: !!m.enabled }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (m && m.type === 'dumpTab') {
    dumpActiveTab().then((name) => sendResponse({ ok: true, name }), (e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (m && m.type === 'dump') {
    dumpPages(m.query || 'бежевый тренч').then((r) => sendResponse({ ok: true, report: r }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
