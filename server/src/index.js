// HTTP API «Отмерь».
//   GET /api/health
//   GET /api/stores
//   GET /api/search?store=lamoda&q=тренч          — товары одного магазина
//   GET /api/product?url=https://www.lamoda.ru/p/…  — карточка товара + история цены
//   GET /api/history?id=lamoda:ABC&id=stockmann:123  — история цен для избранного (или ids=a,b)
//
// Переменные окружения: PORT (8787), HOST (0.0.0.0), DATA_DIR (./data),
// ALLOWED_ORIGINS (через запятую, по умолчанию «*»), CACHE_MINUTES (20), STORE_GAP_MS (1500), RATE_PER_MINUTE (60).

import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Inflight, RateLimit, Throttle, TtlCache } from './cache.js';
import { BlockedError } from './http.js';
import { PriceHistory } from './history.js';
import { STORES, fetchProduct, searchStore, storeForUrl } from './stores.js';

// Версия кода (коммит и дата) — её пишут install.sh и update.sh; видна в /api/health.
const VERSION = (() => {
  try { return readFileSync(new URL('../version.txt', import.meta.url), 'utf8').trim(); } catch { return 'dev'; }
})();

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Проверка записи цены: ссылка на карточку поддерживаемого магазина, id соответствует магазину, разумная цена. */
export function validRecord(it) {
  if (!it || typeof it !== 'object' || typeof it.url !== 'string' || typeof it.id !== 'string') return null;
  const store = storeForUrl(it.url);
  if (!store || !it.id.startsWith(store.id + ':') || it.id.length > 300) return null;
  const price = Number(it.price);
  if (!Number.isFinite(price) || price < 50 || price > 10_000_000) return null;
  const old = Number(it.old);
  return {
    id: it.id, url: it.url, store: store.name, title: String(it.title || '').slice(0, 300),
    price: Math.round(price), old: Number.isFinite(old) && old > price ? Math.round(old) : null,
  };
}

export function createApp({
  history,
  fetchImpl,
  cacheMs = 20 * 60000,
  storeGapMs = 1500,
  ratePerMinute = 60,
  allowedOrigins = ['*'],
  log = console,
} = {}) {
  const cache = new TtlCache(cacheMs);
  const throttle = new Throttle(storeGapMs);
  const inflight = new Inflight();
  const limiter = new RateLimit(ratePerMinute);

  async function search(storeId, q) {
    const store = STORES[storeId];
    const key = 'search:' + storeId + ':' + q.toLowerCase();
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true };
    return inflight.run(key, async () => {
      const t0 = Date.now();
      try {
        const r = await throttle.run(storeId, () => searchStore(store, q, { fetchImpl }));
        const now = Date.now();
        for (const it of r.items) history.record(it, now);
        const empty = !r.items.length;
        const out = {
          store: store.name, storeId, status: empty ? 'empty' : 'ok', items: r.items, sources: r.sources, searchUrl: r.url, checkedAt: now, tookMs: now - t0,
          error: empty ? 'на странице магазина не удалось распознать товары' : null,
        };
        cache.set(key, out, empty ? 2 * 60000 : undefined);
        log.info?.(`search ${storeId} «${q}»: ${r.items.length} (ld ${r.sources.jsonld}, js ${r.sources.embedded}, dom ${r.sources.dom}) ${now - t0}ms`);
        return out;
      } catch (e) {
        const blocked = e instanceof BlockedError;
        const out = { store: store.name, storeId, status: blocked ? 'blocked' : 'error', items: [], error: e.message, searchUrl: store.searchUrl(q), checkedAt: Date.now(), tookMs: Date.now() - t0 };
        // Ошибки кэшируем ненадолго, чтобы не долбить магазин.
        cache.set(key, out, 2 * 60000);
        log.warn?.(`search ${storeId} «${q}»: ${out.status} — ${e.message}`);
        return out;
      }
    });
  }

  async function product(url) {
    const key = 'product:' + url;
    const hit = cache.get(key);
    if (hit) return { ...hit, history: history.get(hit.id), cached: true };
    return inflight.run(key, async () => {
      const store = storeForUrl(url);
      const it = await throttle.run(store.id, () => fetchProduct(url, { fetchImpl }));
      it.checkedAt = Date.now();
      history.record(it, it.checkedAt);
      cache.set(key, it);
      return { ...it, history: history.get(it.id) };
    });
  }

  const allowAll = allowedOrigins.includes('*');

  return async function handler(req, res) {
    const origin = req.headers.origin;
    const corsOrigin = allowAll ? '*' : origin && allowedOrigins.includes(origin) ? origin : null;
    const send = (status, body) => {
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (corsOrigin) { headers['Access-Control-Allow-Origin'] = corsOrigin; headers.Vary = 'Origin'; }
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsOrigin ? {
        'Access-Control-Allow-Origin': corsOrigin, 'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
      } : {});
      return res.end();
    }
    const u = new URL(req.url, 'http://localhost');
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

    // Цены, которые расширение увидело в браузере пользователя (Stockmann, Lamoda) — для истории.
    if (req.method === 'POST' && u.pathname === '/api/record') {
      if (!limiter.allow(ip)) return send(429, { error: 'слишком много запросов' });
      let body;
      try { body = JSON.parse(await readBody(req, 512 * 1024)); } catch (e) { return send(400, { error: e.message === 'too large' ? 'слишком большой запрос' : 'неверный JSON' }); }
      const now = Date.now();
      let saved = 0;
      for (const it of [].concat(body?.items || []).slice(0, 200)) {
        const rec = validRecord(it);
        if (rec) { history.record(rec, now); saved++; }
      }
      return send(200, { saved });
    }
    if (req.method !== 'GET') return send(405, { error: 'только GET и POST /api/record' });

    try {
      if (u.pathname === '/api/health') return send(200, { ok: true, version: VERSION });
      if (u.pathname === '/api/stores') {
        return send(200, Object.values(STORES).map((s) => ({ id: s.id, name: s.name, domain: s.domain, note: s.note || null })));
      }
      if (!limiter.allow(ip)) return send(429, { error: 'слишком много запросов, попробуйте через минуту' });

      if (u.pathname === '/api/search') {
        const storeId = u.searchParams.get('store') || '';
        const q = (u.searchParams.get('q') || '').trim().slice(0, 200);
        if (!STORES[storeId]) return send(400, { error: 'неизвестный магазин' });
        if (q.length < 2) return send(400, { error: 'пустой запрос' });
        return send(200, await search(storeId, q));
      }
      if (u.pathname === '/api/product') {
        const url = u.searchParams.get('url') || '';
        if (!storeForUrl(url)) return send(400, { error: 'ссылка не на товар поддерживаемого магазина' });
        try {
          return send(200, await product(url));
        } catch (e) {
          return send(e instanceof BlockedError ? 503 : 502, { error: e.message, status: e instanceof BlockedError ? 'blocked' : 'error' });
        }
      }
      if (u.pathname === '/api/history') {
        const ids = [...u.searchParams.getAll('id'), ...(u.searchParams.get('ids') || '').split(',')].map((x) => x.trim()).filter(Boolean).slice(0, 200);
        return send(200, Object.fromEntries(ids.map((id) => [id, history.get(id)])));
      }
      return send(404, { error: 'не найдено' });
    } catch (e) {
      log.error?.(e);
      return send(500, { error: 'внутренняя ошибка' });
    }
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const env = process.env;
  const dataDir = env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const history = await new PriceHistory(path.join(dataDir, 'prices.json')).load();
  const handler = createApp({
    history,
    cacheMs: (+env.CACHE_MINUTES || 20) * 60000,
    storeGapMs: +env.STORE_GAP_MS || 1500,
    ratePerMinute: +env.RATE_PER_MINUTE || 60,
    allowedOrigins: (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  });
  const server = http.createServer(handler);
  const port = +env.PORT || 8787;
  server.listen(port, env.HOST || '0.0.0.0', () => console.log(`Отмерь API: http://localhost:${port}/api/health`));
  const stop = async () => { await history.save(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
