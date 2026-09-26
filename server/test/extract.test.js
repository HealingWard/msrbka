import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractListing, extractProduct, parsePrice, sliceBalanced } from '../src/extract.js';
import { looksBlocked } from '../src/http.js';
import { STORES, storeForUrl } from '../src/stores.js';

const fx = (n) => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');

test('parsePrice понимает разные записи цены', () => {
  assert.equal(parsePrice('23 990 ₽'), 23990);
  assert.equal(parsePrice('18990.00'), 18990);
  assert.equal(parsePrice('12 990,50'), 12990);
  assert.equal(parsePrice({ current: 16990 }), 16990);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(0), null);
});

test('sliceBalanced учитывает строки со скобками', () => {
  const s = 'x = {"a":"}{","b":[1,{"c":2}]}; y';
  assert.equal(sliceBalanced(s, 4), '{"a":"}{","b":[1,{"c":2}]}');
});

test('карточки в DOM (вёрстка как у Lamoda)', () => {
  const { items, sources } = extractListing(fx('lamoda-like.html'), 'https://www.lamoda.ru/catalogsearch/result/?q=x', STORES.lamoda);
  assert.equal(sources.dom, 2);
  const [a, b] = items;
  assert.equal(a.url, 'https://www.lamoda.ru/p/mp002xw0abcd/clothes-12storeez-trench/');
  assert.equal(a.price, 23990);
  assert.equal(a.old, 29990);
  assert.match(a.title, /Тренч/);
  assert.equal(a.image, 'https://a.lmcdn.ru/img236x341/M/P/MP002XW0ABCD_1.jpg');
  assert.equal(b.price, 11999);
  assert.equal(b.old, null);
  assert.equal(b.image, 'https://a.lmcdn.ru/img/RTLAAA123456.jpg');
});

test('schema.org ItemList', () => {
  const { items } = extractListing(fx('jsonld-list.html'), 'https://stockmann.ru/search/?q=x', STORES.stockmann);
  assert.equal(items.length, 2);
  assert.deepEqual(
    { url: items[0].url, brand: items[0].brand, price: items[0].price, rating: items[0].rating, reviews: items[0].reviews, inStock: items[0].inStock, sku: items[0].sku },
    { url: 'https://stockmann.ru/product/1234567-trench-gerry-weber/', brand: 'Gerry Weber', price: 18990, rating: 4.5, reviews: 92, inStock: true, sku: '1234567' },
  );
  assert.equal(items[1].url, 'https://stockmann.ru/product/7654321-trench-max-mara/');
  assert.equal(items[1].inStock, false);
});

test('встроенные данные: __NEXT_DATA__ и window.__INITIAL_STATE__', () => {
  const { items, sources } = extractListing(fx('next-data.html'), 'https://stockmann.ru/search/?q=x', STORES.stockmann);
  assert.equal(sources.embedded, 3);
  const veja = items.find((x) => x.title === 'Кеды V-10 из кожи');
  assert.equal(veja.price, 16990);
  assert.equal(veja.old, 19990);
  assert.equal(veja.brand, 'Veja');
  assert.deepEqual(veja.sizes, ['37', '38']);
  assert.equal(veja.image, 'https://cdn.example/101.jpg');
  assert.equal(items.find((x) => x.title === 'Кеды Campo').price, 14990);
});

test('ссылки не на товары магазина отбрасываются', () => {
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Чужой товар","url":"https://evil.example/p/1","offers":{"price":100}}</script>';
  assert.equal(extractListing(html, 'https://stockmann.ru/', STORES.stockmann).items.length, 0);
});

test('страница товара: размеры, цвет, фото', () => {
  const it = extractProduct(fx('product-page.html'), 'https://stockmann.ru/product/1234567-trench-gerry-weber/');
  assert.equal(it.price, 18990);
  assert.equal(it.brand, 'Gerry Weber');
  assert.equal(it.color, 'бежевый');
  assert.deepEqual(it.sizes, ['M', 'L']);
  assert.deepEqual(it.images, ['https://stockmann.ru/upload/big1.jpg', 'https://stockmann.ru/upload/big2.jpg']);
});

test('JS-проверка Servicepipe (Lamoda, Stockmann) распознаётся как блокировка', () => {
  const small = '<html><head><noscript><meta http-equiv="refresh" content="0; url=/exhkqyad"></noscript></head>'
    + '<script src="https://abc.servicepipe.tech/loaders/x.js" async></script><body><js-challenge-loader></js-challenge-loader>'
    + '<script>function get_cookie_spsn() { return "spsn=1_"; }</script></body></html>';
  assert.equal(looksBlocked(200, small), true);
  // Stockmann: тот же механизм, но страница ~400 КБ из-за встроенного скрипта
  const big = '<html><head></head><body><div id="id_spinner"></div><script>' + 'x'.repeat(400000)
    + '</script><script>function get_cookie_spsn() { return "spsn=1_"; }</script></body></html>';
  assert.equal(looksBlocked(200, big), true);
});

test('капча распознаётся как блокировка', () => {
  assert.equal(looksBlocked(200, fx('captcha.html')), true);
  assert.equal(looksBlocked(200, fx('lamoda-like.html')), false);
  assert.equal(looksBlocked(429, ''), true);
});

test('storeForUrl принимает только карточки товаров', () => {
  assert.equal(storeForUrl('https://www.lamoda.ru/p/mp002xw0abcd/x/')?.id, 'lamoda');
  assert.equal(storeForUrl('https://market.yandex.ru/product--kedy/123456?sku=1')?.id, 'market');
  assert.equal(storeForUrl('https://stockmann.ru/product/1234567-x/')?.id, 'stockmann');
  assert.equal(storeForUrl('https://www.lamoda.ru/c/355/'), null);
  assert.equal(storeForUrl('http://169.254.169.254/p/abcdef12/'), null);
});

test('название из schema.org важнее подписей в карточке; служебный текст не становится названием', () => {
  const { items } = extractListing(fx('market-like.html'), 'https://market.yandex.ru/search?text=x', STORES.market);
  const a = items.find((x) => x.url.includes('4927342664'));
  assert.equal(a.title, 'Тренч с поясом');
  assert.equal(a.image, 'https://avatars.mds.yandex.net/x.jpg');
  const b = items.find((x) => x.url.includes('6199948627'));
  assert.equal(b.title, 'Тренч женский двубортный');
  assert.equal(b.price, 4603);
});
