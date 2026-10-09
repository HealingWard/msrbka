// Фоновая часть расширения «Отмерь».
// По запросу сайта открывает в свёрнутом окне вашего браузера нужную страницу выдачи магазина и читает её:
// цены, размеры, цвет и бренд Stockmann и Lamoda отдают прямо в выдаче. Следующие страницы сайт просит по мере просмотра.
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
    // Для диагностики: страница, на которой не нашлось цены, сохраняется целиком.
    if (opts && opts.snapOnFail && !(r && r.item && r.item.price) && !(r && r.blocked)) {
      try { const h = await extract(tab.id, 'html', {}); r = { ...(r || {}), html: h?.html, pageUrl: h?.url, pageTitle: h?.title }; } catch { /* вкладка закрылась */ }
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


// ——— задачи ———

// Окно для поиска одно на все запросы и живёт 2 минуты после последнего: следующая страница
// выдачи открывается в уже открытом окне — так быстрее.
let shared = null; // { id, busy, timer }
async function acquireWindow() {
  if (shared) {
    try { await chrome.windows.get(shared.id); } catch { shared = null; }
  }
  if (!shared) shared = { id: await openWindow(), busy: 0, timer: null };
  clearTimeout(shared.timer);
  shared.busy++;
  return shared.id;
}
function releaseWindow() {
  if (!shared) return;
  shared.busy = Math.max(0, shared.busy - 1);
  if (shared.busy) return;
  const id = shared.id;
  shared.timer = setTimeout(() => { if (shared && shared.id === id && !shared.busy) { shared = null; closeWindow(id); } }, 120000);
}

/**
 * Одна страница выдачи магазина (page — номер страницы магазина, с 1). Сайт сам решает, когда нужна следующая:
 * так первая страница появляется за секунды, а дальше страницы подгружаются по мере просмотра.
 * Карточки вещей не открываем: размеры, цвет и бренд Stockmann и Lamoda отдают прямо в выдаче.
 */
// Не больше двух страниц выдачи одного магазина одновременно — чтобы не выглядеть роботом.
const STORE_SLOTS = 2;
const slots = {};
async function takeSlot(storeId) {
  const q = slots[storeId] || (slots[storeId] = { busy: 0, wait: [] });
  if (q.busy >= STORE_SLOTS) await new Promise((r) => q.wait.push(r));
  q.busy++;
}
function freeSlot(storeId) {
  const q = slots[storeId];
  if (!q) return;
  q.busy--;
  q.wait.shift()?.();
}

/** brandsOnly — нужны только бренды из фильтра «Бренд» выдачи (бренды, у которых эта вещь есть), без вещей и фото. */
async function searchJob(storeId, query, page, send, brandsOnly = false) {
  const s = STORES[storeId];
  if (!s) return send({ pricel: 'result', status: 'error', items: [], error: 'неизвестный магазин' });
  const searchUrl = s.search(query);
  const n = Math.max(1, Math.floor(+page) || 1);
  const opts = { linkPattern: s.linkPattern, host: s.host, brandsOnly };
  const human = () => send({ pricel: 'progress', stage: 'human' });
  send({ pricel: 'progress', stage: 'queue', page: n });
  await takeSlot(storeId);
  const win = await acquireWindow();
  try {
    send({ pricel: 'progress', stage: 'search', page: n });
    let r = null;
    if (n === 1) {
      r = await visit(win, searchUrl, 'search', opts, human);
    } else {
      // Параметр номера страницы у магазина может быть разным — запоминаем тот, что сработал.
      const k = 'pageParam:' + storeId;
      const known = (await chrome.storage.local.get(k))[k];
      const params = known ? [known, ...s.pageParams.filter((x) => x !== known)] : s.pageParams;
      for (const p of params) {
        let pr = null;
        try { pr = await visit(win, s.page(query, n, p), 'search', opts, human); } catch { pr = null; }
        r = pr;
        if (!pr || pr.blocked || !pr.items?.length) continue;
        if (pr.page?.current && pr.page.current !== n) { r = null; continue; } // магазин проигнорировал параметр
        if (p !== known) await chrome.storage.local.set({ [k]: p });
        break;
      }
    }
    if (!r) return send({ pricel: 'result', status: n === 1 ? 'error' : 'end', items: [], error: 'страница не открылась', searchUrl });
    if (r.blocked) {
      const why = r.blocked === 'denied' ? 'магазин отклонил запрос' : 'проверка «не робот» не пройдена';
      return send({ pricel: 'result', status: 'blocked', items: [], error: why, searchUrl });
    }
    if (brandsOnly) return send({ pricel: 'result', status: 'ok', items: [], searchUrl, page: { current: n, total: r.page?.total || null, found: r.page?.found || null }, facetBrands: (r.facetBrands || []).slice(0, 3000) });
    if (!r.items?.length) return send({ pricel: 'result', status: n === 1 ? 'empty' : 'end', items: [], error: n === 1 ? 'на странице не нашлось товаров' : null, searchUrl });
    const items = r.items.map((x) => ({ ...x, store: s.name, storeId }));
    send({
      pricel: 'result', status: 'ok', items, searchUrl,
      page: { current: n, total: r.page?.total || null, found: r.page?.found || null },
      brands: (r.brands || []).slice(0, 2000), facetBrands: (r.facetBrands || []).slice(0, 2000),
    });
  } catch (e) {
    send({ pricel: 'result', status: 'error', items: [], error: String(e.message || e), searchUrl });
  } finally {
    releaseWindow();
    freeSlot(storeId);
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

// ——— диагностика проверок ———
// Если в одном магазине за проверку не разобралась или «распродалась» половина вещей — это сбой магазина
// (капча, сайт поменялся), а не распродажа: отметки «нет в наличии» по нему не ставим.
function guardStores(out) {
  const by = {};
  for (const x of out) {
    const b = by[x.storeId] || (by[x.storeId] = { total: 0, bad: 0, noprice: 0, unparsed: 0, blocked: 0 });
    b.total++;
    if (x.status !== 'ok') b.bad++;
    if (b[x.status] != null) b[x.status]++;
  }
  const issues = {};
  for (const [storeId, b] of Object.entries(by)) {
    if (b.total >= 4 && b.bad / b.total >= 0.5) {
      issues[storeId] = b;
      for (const x of out) if (x.storeId === storeId && x.status === 'noprice') { x.status = 'suspect'; x.why = 'слишком много вещей магазина «пропало» сразу — похоже на сбой, наличие не меняем'; }
    }
  }
  return issues;
}
async function saveDiag(d) { try { await chrome.storage.local.set({ 'diag:last': d, ...(d.auto ? { 'diag:auto': d } : { 'diag:manual': d }) }); } catch { /* хранилище */ } }
async function saveDiagPage(storeId, page) {
  try { await chrome.storage.local.set({ ['diag:page:' + storeId]: { ...page, html: String(page.html || '').slice(0, 4_000_000) } }); } catch { /* хранилище */ }
}
/** Скачивает отчёт о последних проверках и страницы, которые не удалось разобрать, в «Загрузки/otmer/diagnostics». */
async function downloadDiag() {
  const all = await chrome.storage.local.get(null);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const report = { version: chrome.runtime.getManifest().version, at: new Date().toISOString(), last: all['diag:last'] || null, manual: all['diag:manual'] || null, auto: all['diag:auto'] || null,
    autoLog: all[LOG_KEY] || [], autoPartial: all[PARTIAL_KEY] ? { started: all[PARTIAL_KEY].started, done: (all[PARTIAL_KEY].items || []).length } : null,
    autoState: all[AUTO_KEY] ? { ...all[AUTO_KEY], runs: (all[AUTO_KEY].runs || []).map((r) => ({ at: r.at, news: r.news, ok: r.ok, total: r.total, statuses: (r.results || []).map((x) => x.status) })) } : null };
  await chrome.downloads.download({ url: toDataUrl(JSON.stringify(report, null, 2), 'application/json'), filename: 'otmer/diagnostics-' + stamp + '/report.json', conflictAction: 'overwrite' });
  let pages = 0;
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith('diag:page:') || !v || !v.html) continue;
    await chrome.downloads.download({ url: toDataUrl(v.html, 'text/html'), filename: 'otmer/diagnostics-' + stamp + '/' + k.slice(10) + '-failed-page.html', conflictAction: 'overwrite' });
    pages++;
  }
  return { pages, folder: 'otmer/diagnostics-' + stamp };
}

/**
 * Свежие цены товаров из избранного: открывает карточки по очереди в одном свёрнутом окне, без кэша.
 * auto — автопроверка: без проверки «не робот» (магазин, который дважды её показал, пропускаем до следующего раза)
 * и без кэша карточек (в нём фото, а хранилище расширения не резиновое).
 */
async function recheckJob(urls, send, auto = false, interactive = false, opts = {}) {
  if (!auto) manualJobs++;
  try { return await recheckList(urls, send, auto, interactive, opts); } finally { if (!auto) manualJobs--; }
}

// Спокойный темп автопроверки: страницы этих магазинов открываем не чаще раза в столько миллисекунд,
// как обычный посетитель, а не десятки подряд (так Stockmann и просит «не робот»).
const AUTO_PACE = { stockmann: 75000 };
/** interactive — автопроверка по нажатию на уведомление: проверку «не робот» показываем человеку, как при ручной. */
async function recheckList(urls, send, auto, interactive = false, opts = {}) {
  const pace = opts.pace || {};
  const all = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && storeForUrl(u)).slice(0, auto ? 300 : 100);
  // Сначала быстрые магазины, потом те, что в спокойном темпе.
  const list = [...all.filter((u) => !pace[storeForUrl(u)[0]]), ...all.filter((u) => pace[storeForUrl(u)[0]])];
  const lastAt = {};
  if (!list.length) return send({ pricel: 'result', status: 'empty', items: [] });
  const win = await openWindow();
  const out = [];
  const blockedBy = {};
  try {
    for (let i = 0; i < list.length; i++) {
      const url = list[i];
      const [storeId, s] = storeForUrl(url);
      send({ pricel: 'progress', stage: 'recheck', done: i, total: list.length, ...(auto ? { items: out } : {}) });
      if (auto && !interactive && blockedBy[storeId] >= 2) { out.push({ url, storeId, status: 'blocked', why: 'магазин попросил подтвердить, что вы не робот' }); continue; }
      if (pace[storeId] && lastAt[storeId]) {
        const wait = lastAt[storeId] + pace[storeId] - Date.now();
        if (wait > 0) await sleep(wait);
      }
      // Человек отошёл от компьютера — ставим на паузу: продолжим с этого места, когда вернётся.
      if (opts.stop && await opts.stop()) { send({ pricel: 'result', status: 'paused', items: out }); return; }
      lastAt[storeId] = Date.now();
      let r = null;
      try { r = await visit(win, url, 'product', { linkPattern: s.linkPattern, host: s.host, snapOnFail: true }, () => send({ pricel: 'progress', stage: 'human' }), auto && !interactive); } catch (e) { r = { error: String(e.message || e) }; }
      if (r && r.blocked) blockedBy[storeId] = (blockedBy[storeId] || 0) + 1;
      if (r && r.item && r.item.price) {
        if (!auto) await saveDetails(url, r.item);
        out.push({ url, storeId, status: 'ok', item: { ...r.item, url, store: s.name, storeId } });
      } else if (r && r.item && (r.item.inStock === false || r.soldText)) {
        // Цены нет, и магазин сам пишет, что товара нет, — распродан или снят с продажи.
        out.push({ url, storeId, status: 'noprice', why: 'магазин пишет, что товара нет', item: { ...r.item, url, store: s.name, storeId } });
      } else if (r && r.blocked) {
        out.push({ url, storeId, status: 'blocked', why: 'магазин попросил подтвердить, что вы не робот' });
      } else {
        // Страница открылась, но цену прочитать не удалось: это сбой, о наличии он ничего не говорит.
        out.push({ url, storeId, status: 'unparsed', why: r && r.item ? 'цена не нашлась на странице' : 'страница не открылась' + (r && r.error ? ': ' + r.error : ''), diag: r?.diag || null });
        if (r && r.html) await saveDiagPage(storeId, { at: Date.now(), url, pageUrl: r.pageUrl, title: r.pageTitle, diag: r.diag || null, html: r.html });
      }
      if (i < list.length - 1) await sleep(900);
    }
    const storeIssues = guardStores(out);
    await saveDiag({ at: Date.now(), auto, total: out.length, storeIssues, items: out.map(({ url, storeId, status, why, diag, item }) => ({ url, storeId, status, why: why || null, diag: diag || null, price: item?.price || null })) });
    send({ pricel: 'result', status: 'ok', items: out, storeIssues });
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
const AUTO_EVERY = 24 * 3600e3; // для сайта и окна расширения: «раз в день»
const AUTO_GAP = 12 * 3600e3;   // не чаще, чем раз в 12 часов
const AUTO_RUNS = 14; // сколько последних проверок храним, пока сайт их не забрал
const PARTIAL_KEY = 'auto:partial'; // проверенное до обрыва (Chrome закрыли, расширение перезапустилось)
const PARTIAL_TTL = 12 * 3600e3;
const LOG_KEY = 'auto:log';
let autoBusy = false;
let manualJobs = 0; // ручные проверки с сайта, идущие сейчас

/** Журнал автопроверки: когда и почему запускалась или пропускалась (последние 60 записей, попадает в диагностику). */
async function autoLog(ev, extra = {}) {
  try {
    const log = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] || [];
    const last = log[log.length - 1];
    // Повторяющиеся «рано» и «занято» не забивают журнал: обновляем последнюю запись и считаем повторы.
    const entry = { at: new Date().toISOString(), ev, ...extra };
    const next = last && last.ev === ev && ['not-due', 'busy', 'manual-busy', 'away'].includes(ev) ? [...log.slice(0, -1), { ...entry, n: (last.n || 1) + 1 }] : [...log, entry];
    await chrome.storage.local.set({ [LOG_KEY]: next.slice(-60) });
  } catch { /* хранилище */ }
}

/**
 * Пора ли проверять: раз в календарный день. Последняя проверка была вчера или раньше — проверяем при первом
 * будильнике сегодня (то есть вскоре после того, как открыт Chrome), но не раньше чем через 12 часов после неё.
 */
function autoDue(last, now = Date.now()) {
  if (!last) return true;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return last < today.getTime() && now - last >= AUTO_GAP;
}
const dayKey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const RETRY_GAP = 50 * 60e3; // повтор не удавшихся вещей — не чаще раза в час…
const RETRY_MAX = 3;          // …и не больше трёх раз за день
const FAILED = (x) => x.status !== 'ok' && x.status !== 'noprice';
/** Вещи, которые сегодняшняя проверка не смогла прочитать (капча, сбой сети) и которые пора попробовать снова. */
function retryDue(st, now = Date.now()) {
  const r = st.retry;
  return !!(r && r.urls && r.urls.length && r.day === dayKey(now) && (r.tries || 0) < RETRY_MAX && now - (r.at || 0) >= RETRY_GAP);
}

/** Когда будет следующая автопроверка (для окна расширения). */
function autoNextAt(last) {
  if (!last) return Date.now();
  const next = new Date(last); next.setHours(24, 0, 0, 0);
  return Math.max(next.getTime(), last + AUTO_GAP);
}

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

async function autoRun(force = false, why = 'alarm', interactive = false) {
  if (autoBusy) { await autoLog('busy', { why }); return { status: 'busy' }; }
  const st = await autoState();
  // Прошлая проверка оборвалась (Chrome закрыли, расширение перезапустилось): снимаем отметку «идёт».
  if (st.running) { await autoLog('interrupted', { startedAt: new Date(st.running).toISOString() }); await saveAuto({ running: null }); }
  if (!st.items.length) { await autoLog('empty', { why }); return { status: 'empty' }; }
  if (!force && !st.enabled) { await autoLog('off', { why }); return { status: 'skip' }; }
  if (!force && manualJobs) { await autoLog('manual-busy', { why }); return { status: 'busy' }; }
  // Проверку поставили на паузу (человек отошёл) — её продолжаем, даже если сегодня уже проверяли вручную.
  const part0 = (await chrome.storage.local.get(PARTIAL_KEY))[PARTIAL_KEY];
  const resume = !!(part0 && Date.now() - part0.started < PARTIAL_TTL);
  const retryOnly = !resume && !autoDue(lastCheck(st)) && (retryDue(st) || (force && !!st.retry?.urls?.length && why === 'captcha'));
  if (!force && !resume && !autoDue(lastCheck(st)) && !retryOnly) { await autoLog('not-due', { why, last: new Date(lastCheck(st)).toISOString() }); return { status: 'skip' }; }
  // Только когда человек за компьютером: ночью ноутбук спит, сеть отключена — страницы магазинов не открываются
  // (так 8 октября в 4 утра не открылись 76 вещей из 86).
  if (!force && chrome.idle) {
    const state = await chrome.idle.queryState(600).catch(() => 'active');
    if (state !== 'active') { await autoLog('away', { why, state }); return { status: 'skip' }; }
  }
  autoBusy = true;
  await saveAuto({ running: Date.now() });
  // Расширение Chrome может усыпить фоновую часть посреди долгой проверки: регулярный вызов API её не даёт усыпить.
  const keep = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  try {
    await purgeDetails().catch(() => {});
    const byUrl = Object.fromEntries(st.items.map((w) => [w.url, w]));
    // Продолжаем оборванную проверку: уже проверенные вещи не открываем заново.
    const part = (await chrome.storage.local.get(PARTIAL_KEY))[PARTIAL_KEY];
    const prior = part && Date.now() - part.started < PARTIAL_TTL ? (part.items || []).filter((x) => byUrl[x.url]) : [];
    const doneUrls = new Set(prior.map((x) => x.url));
    const want = retryOnly ? new Set(st.retry.urls) : null;
    const todo = st.items.map((w) => w.url).filter((u) => !doneUrls.has(u) && (!want || want.has(u)));
    const started = prior.length ? part.started : Date.now();
    await autoLog(retryOnly ? 'retry' : 'start', { why, items: retryOnly ? todo.length : st.items.length, resumed: prior.length, ...(retryOnly ? { try: (st.retry.tries || 0) + 1 } : {}) });
    let saved = 0;
    const r = await new Promise((resolve) => {
      recheckJob(todo, (m) => {
        if (m.pricel === 'result') resolve(m);
        // Каждые 5 вещей запоминаем проверенное, чтобы после обрыва продолжить с того же места.
        else if (m.pricel === 'progress' && m.items && m.items.length - saved >= 5) {
          saved = m.items.length;
          chrome.storage.local.set({ [PARTIAL_KEY]: { started, items: [...prior, ...m.items.map((x) => ({ ...x, item: slim(x.item) }))] } }).catch(() => {});
        }
      }, true, interactive, {
        pace: interactive ? {} : AUTO_PACE,
        stop: interactive || !chrome.idle ? null : async () => (await chrome.idle.queryState(600).catch(() => 'active')) !== 'active',
      }).catch((e) => resolve({ status: 'error', items: [], error: String(e.message || e) }));
    });
    if (r.status === 'paused') {
      const items = [...prior, ...(r.items || []).map((x) => ({ ...x, item: slim(x.item) }))];
      await chrome.storage.local.set({ [PARTIAL_KEY]: { started, items } });
      await saveAuto({ running: null });
      await autoLog('paused', { done: items.length, of: st.items.length });
      return { status: 'paused' };
    }
    if (r.status === 'error' && !(r.items || []).length && !prior.length) throw new Error(r.error || 'проверка не удалась');
    const results = [...prior, ...(r.items || []).map((x) => ({ ...x, item: slim(x.item) }))];
    const at = Date.now();
    await recordPrices(st.api, results, byUrl);
    const news = autoNews(results, byUrl);
    // Следующее сравнение — с только что увиденными ценами.
    const fresh = await autoState();
    const seen = Object.fromEntries(results.filter((x) => x.status === 'ok' || x.status === 'noprice').map((x) => [x.url, x]));
    const failedList = results.filter(FAILED);
    const failed = failedList.length;
    const items = fresh.items.map((w) => (seen[w.url] ? { ...w, price: seen[w.url].item?.price || w.price, soldOut: seen[w.url].status === 'noprice' } : w));
    const ok = results.filter((x) => x.status === 'ok').length;
    const run = { at, results, news: { count: news.count, goal: news.goal, down: news.down, back: news.back, failed }, ok, total: results.length, storeIssues: r.storeIssues || {} };
    // Не прочитанные вещи (капча, сбой сети) пробуем снова через час, до трёх раз за день.
    const tries = retryOnly && fresh.retry?.day === dayKey(at) ? (fresh.retry.tries || 0) + 1 : 0;
    const retry = failed ? { urls: failedList.map((x) => x.url), day: dayKey(at), tries, at } : null;
    await saveAuto({ items, lastRun: at, running: null, retry, runs: [...(fresh.runs || []), run].slice(-AUTO_RUNS), lastSummary: { at, ...run.news, ok, total: results.length } });
    await chrome.storage.local.remove(PARTIAL_KEY);
    await autoLog('done', { ok, total: results.length, failed, news: news.count, minutes: Math.round((at - started) / 6000) / 10 });
    if (news.count) {
      chrome.notifications.create('otmer-auto', {
        type: 'basic', iconUrl: 'icon.png', priority: 1,
        title: 'Отмерь: ' + (news.goal ? 'пора покупать' : news.down ? 'подешевело' : 'снова в продаже'),
        message: news.lines.slice(0, 3).join('\n') + (news.lines.length > 3 ? '\nи ещё ' + (news.lines.length - 3) : ''),
      });
    }
    // Магазин просит «не робот»: сами её не проходим — просим человека одним нажатием.
    const blocked = failedList.filter((x) => x.status === 'blocked');
    if (blocked.length && !interactive) {
      const names = [...new Set(blocked.map((x) => (STORES[x.storeId] || {}).name).filter(Boolean))].join(' и ') || 'Магазин';
      chrome.notifications.create('otmer-captcha', {
        type: 'basic', iconUrl: 'icon.png', priority: 2, requireInteraction: true,
        title: 'Отмерь: ' + names + ' просит подтвердить «не робот»',
        message: 'Не проверено вещей: ' + blocked.length + '. Нажмите — откроется окно магазина, подтвердите, и проверка продолжится сама.',
      });
    }
    return { status: 'ok', run };
  } catch (e) {
    await saveAuto({ running: null });
    await autoLog('error', { error: String(e.message || e) });
    return { status: 'error', error: String(e.message || e) };
  } finally {
    clearInterval(keep);
    autoBusy = false;
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (id === 'otmer-captcha') { chrome.notifications.clear(id); autoRun(true, 'captcha', true); return; }
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
chrome.runtime.onInstalled.addListener((d) => { autoLog('installed', { reason: d.reason, version: chrome.runtime.getManifest().version }); ensureAlarm(); });
chrome.runtime.onStartup.addListener(() => { autoLog('chrome-start'); ensureAlarm(); });
ensureAlarm();
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'otmer-auto') autoRun(false, 'alarm'); });
// Человек вернулся к компьютеру (открыл ноутбук, разблокировал экран) — не ждём будильника до часа.
if (chrome.idle) chrome.idle.onStateChanged.addListener((state) => { if (state === 'active') setTimeout(() => autoRun(false, 'back'), 60000); });

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
  // Открыли сайт — повод проверить, если сегодня ещё не проверяли (будильник мог не сработать, пока компьютер спал).
  setTimeout(() => autoRun(false, 'site'), 5000);
  return { status: 'ok', runs, auto: { enabled: st.enabled, lastRun: st.lastRun || null, running: autoBusy ? st.running : null, every: AUTO_EVERY } };
}

// ——— бренды по категориям ———
// Чтобы в выборе брендов были только бренды нужной категории, раз в неделю открываем выдачу магазина
// по общему запросу категории («обувь», «сумки»…) и берём список из фильтра «Бренд» этой выдачи.
const CAT_QUERIES = { clothes: ['одежда'], shoes: ['обувь'], acc: ['аксессуары', 'сумки'], home: ['товары для дома'] };

async function catBrandsJob(force, send) {
  const k = 'catBrands';
  const cached = (await chrome.storage.local.get(k))[k];
  if (!force && cached && Date.now() - cached.t < BRANDS_TTL) return send({ pricel: 'result', status: 'ok', cats: cached.cats, cached: true });
  const cats = {};
  const win = await openWindow();
  try {
    for (const s of Object.values(STORES)) {
      let blocked = 0;
      for (const [cat, queries] of Object.entries(CAT_QUERIES)) {
        for (const q of queries) {
          if (blocked >= 2) break;
          let r = null;
          try { r = await visit(win, s.search(q), 'search', { linkPattern: s.linkPattern, host: s.host, brandsOnly: true }, () => send({ pricel: 'progress', stage: 'human' })); } catch { r = null; }
          if (r?.blocked) { blocked++; continue; }
          const list = r?.facetBrands || [];
          if (list.length) cats[cat] = [...(cats[cat] || []), ...list];
          await sleep(800);
        }
      }
    }
    // Бренды обоих магазинов вместе, без повторов; пустая категория — не затираем прошлый список.
    const out = { ...(cached?.cats || {}) };
    for (const [cat, list] of Object.entries(cats)) {
      const m = new Map();
      for (const b of list) if (b && !m.has(b.toLowerCase())) m.set(b.toLowerCase(), b);
      if (m.size) out[cat] = [...m.values()].slice(0, 5000);
    }
    if (Object.keys(cats).length) await chrome.storage.local.set({ [k]: { t: Date.now(), cats: out } });
    send({ pricel: 'result', status: Object.keys(out).length ? 'ok' : 'empty', cats: out });
  } catch (e) {
    send({ pricel: 'result', status: 'error', cats: cached?.cats || {}, error: String(e.message || e) });
  } finally {
    await closeWindow(win);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pricel') return;
  let alive = true;
  port.onDisconnect.addListener(() => { alive = false; });
  const send = (m) => { if (alive) try { port.postMessage(m); } catch { alive = false; } };
  port.onMessage.addListener((m) => {
    if (m.type === 'search') searchJob(m.store, String(m.query || '').slice(0, 200), m.page, send, !!m.brandsOnly);
    else if (m.type === 'details' && typeof m.url === 'string') detailsJob(m.url, send);
    else if (m.type === 'brands') brandsJob(m.store, !!m.force, send);
    else if (m.type === 'catbrands') catBrandsJob(!!m.force, send);
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
      running: autoBusy ? st.running : null, last: st.lastSummary || null, site: st.site, nextAt: autoNextAt(Math.max(st.lastRun || 0, st.lastManual || 0)) }));
    return true;
  }
  if (m && m.type === 'autoNow') {
    autoRun(true, 'button').then(sendResponse);
    return true;
  }
  if (m && m.type === 'autoToggle') {
    saveAuto({ enabled: !!m.enabled }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (m && m.type === 'diag') {
    downloadDiag().then((r) => sendResponse({ ok: true, ...r }), (e) => sendResponse({ ok: false, error: String(e.message || e) }));
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
