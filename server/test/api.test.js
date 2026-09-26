import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/index.js';
import { PriceHistory } from '../src/history.js';

const fx = (n) => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');

// Подменяем сеть: страницы магазинов берутся из фикстур.
const PAGES = {
  'www.lamoda.ru/catalogsearch/result/': () => fx('lamoda-like.html'),
  'stockmann.ru/search/': () => fx('jsonld-list.html'),
  'market.yandex.ru/search': () => fx('captcha.html'),
  'stockmann.ru/product/1234567-trench-gerry-weber/': () => fx('product-page.html'),
};
let calls = 0;
const fakeFetch = async (url) => {
  calls++;
  const u = new URL(url);
  const key = u.host + u.pathname;
  const page = PAGES[key];
  const body = page ? page() : '<html><body>home</body></html>';
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'sid=1; Path=/' } });
};

async function withServer(fn) {
  const history = new PriceHistory('/tmp/pricel-test-' + process.pid + '.json');
  history.save = async () => {};
  const server = http.createServer(createApp({ history, fetchImpl: fakeFetch, storeGapMs: 0, log: {} }));
  await new Promise((r) => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json(), headers: r.headers }; };
  const post = async (p, body) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  try { await fn(get, history, post); } finally { server.close(); }
}

test('поиск по магазину, кэш и история цен', async () => {
  await withServer(async (get) => {
    const r = await get('/api/search?store=lamoda&q=' + encodeURIComponent('бежевый тренч'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.items.length, 2);
    const it = r.body.items[0];
    assert.equal(it.id, 'lamoda:MP002XW0ABCD');
    assert.equal(it.store, 'Lamoda');
    assert.equal(it.url, 'https://www.lamoda.ru/p/mp002xw0abcd/clothes-12storeez-trench/');

    const before = calls;
    const again = await get('/api/search?store=lamoda&q=' + encodeURIComponent('бежевый тренч'));
    assert.equal(again.body.cached, true);
    assert.equal(calls, before, 'второй запрос из кэша');

    const h = await get('/api/history?ids=' + encodeURIComponent(it.id));
    assert.equal(h.body[it.id].length, 1);
    assert.equal(h.body[it.id][0].price, 23990);
  });
});

test('капча у магазина — статус blocked, без падения', async () => {
  await withServer(async (get) => {
    const r = await get('/api/search?store=market&q=kedy');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'blocked');
    assert.deepEqual(r.body.items, []);
  });
});

test('карточка товара и защита от чужих адресов', async () => {
  await withServer(async (get) => {
    const ok = await get('/api/product?url=' + encodeURIComponent('https://stockmann.ru/product/1234567-trench-gerry-weber/'));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.id, 'stockmann:1234567');
    assert.deepEqual(ok.body.sizes, ['M', 'L']);
    assert.equal(ok.body.history.length, 1);
    const bad = await get('/api/product?url=' + encodeURIComponent('http://127.0.0.1:22/'));
    assert.equal(bad.status, 400);
    const unknown = await get('/api/search?store=ozon&q=x');
    assert.equal(unknown.status, 400);
  });
});

test('история: одна точка в день', () => {
  const h = new PriceHistory('/tmp/x.json');
  h.scheduleSave = () => {};
  const day = 86400000;
  h.record({ id: 'a', price: 100 }, 0);
  h.record({ id: 'a', price: 90 }, 1000);
  h.record({ id: 'a', price: 80 }, day * 2);
  assert.deepEqual(h.get('a'), [{ t: 1000, price: 90 }, { t: day * 2, price: 80 }]);
});

test('POST /api/record: цены из расширения попадают в историю, чужие ссылки отбрасываются', async () => {
  await withServer(async (get, history, post) => {
    const r = await post('/api/record', { items: [
      { id: 'stockmann:1234567', url: 'https://stockmann.ru/product/1234567-trench/', title: 'Тренч', price: 18990, old: 23990 },
      { id: 'lamoda:MP002XW0ABCD', url: 'https://www.lamoda.ru/p/mp002xw0abcd/x/', title: 'Тренч', price: 11999 },
      { id: 'stockmann:1', url: 'https://evil.example/product/1/', price: 100 },
      { id: 'lamoda:X', url: 'https://stockmann.ru/product/7654321-x/', price: 5000 },
      { id: 'stockmann:2', url: 'https://stockmann.ru/product/2222222-x/', price: 'NaN' },
    ] });
    assert.equal(r.status, 200);
    assert.equal(r.body.saved, 2);
    const h = await get('/api/history?id=stockmann:1234567&id=lamoda:MP002XW0ABCD');
    assert.equal(h.body['stockmann:1234567'][0].price, 18990);
    assert.equal(h.body['lamoda:MP002XW0ABCD'][0].price, 11999);
    assert.equal((await post('/api/record', '{bad')).status, 400);
  });
});
