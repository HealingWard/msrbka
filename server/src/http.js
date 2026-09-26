// HTTP-клиент для страниц магазинов: браузерные заголовки, cookie-сессия на магазин,
// таймаут и распознавание блокировки/капчи.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export class BlockedError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BlockedError';
    this.status = status;
  }
}

const CAPTCHA_MARKERS = [
  /showcaptcha/i, /smartcaptcha/i, /captcha-page/i, /checkcaptcha/i, /подтвердите,? что[^<]{0,40}не робот/i,
  /are you a robot/i, /access denied/i, /qrator/i, /ddos-guard/i, /cf-challenge|challenge-platform/i,
];

const isCaptcha = (html) =>
  // Страница капчи короткая; на обычной выдаче слово «captcha» может встретиться в скриптах.
  html.length < 150000 && CAPTCHA_MARKERS.some((re) => re.test(html));

// JS-проверка антибот-сервисов: вместо выдачи — спиннер и скрипт, который должен выполнить браузер.
// Так закрыты Lamoda и Stockmann (Servicepipe). Страница может быть большой из-за встроенного скрипта.
const JS_CHALLENGE_MARKERS = [/servicepipe\.tech/i, /<js-challenge-loader/i, /function get_cookie_spsn\(/];
const isJsChallenge = (html) => JS_CHALLENGE_MARKERS.some((re) => re.test(html.slice(0, 5000)) || re.test(html.slice(-5000)));

export function looksBlocked(status, html) {
  return status === 403 || status === 429 || status === 451 || isJsChallenge(html) || isCaptcha(html);
}

const blockReason = (status, html) =>
  isJsChallenge(html) ? 'сайт закрыт защитой от автоматических запросов (JS-проверка браузера)'
    : isCaptcha(html) ? 'магазин запросил проверку «не робот»'
    : status === 429 ? 'магазин ограничил частоту запросов (429)'
      : 'магазин отказал в доступе (HTTP ' + status + ')';

/** Простейший cookie-jar: имя → значение, без учёта путей и сроков (достаточно для сессии магазина). */
export class CookieJar {
  constructor() { this.map = new Map(); }
  store(headers) {
    const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const line of list) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      if (i > 0) this.map.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  header() { return [...this.map].map(([k, v]) => k + '=' + v).join('; '); }
}

/**
 * Загружает страницу. Возвращает { status, url, html }.
 * Бросает BlockedError, если магазин отдал капчу или отказ.
 */
export async function fetchPage(url, { jar, referer, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.6',
    'Cache-Control': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  };
  if (referer) headers.Referer = referer;
  if (jar && jar.map.size) headers.Cookie = jar.header();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { headers, redirect: 'follow', signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'таймаут ' + timeoutMs / 1000 + ' с' : 'сеть: ' + (e.cause?.code || e.message));
  } finally {
    clearTimeout(timer);
  }
  if (jar) jar.store(res.headers);
  const html = await res.text();
  if (looksBlocked(res.status, html)) throw new BlockedError(blockReason(res.status, html), res.status);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { status: res.status, url: res.url || url, html };
}
