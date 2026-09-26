// Локальная проверка без доступа к магазинам: настоящий API и разбор страниц,
// но вместо сети — сгенерированные страницы «магазинов» (Lamoda — карточки в вёрстке,
// Stockmann — schema.org, Яндекс Маркет — капча). Картинки отдаются с этого же сервера.
//   node scripts/mock-server.js   → http://localhost:8787

import http from 'node:http';
import { createApp } from '../src/index.js';
import { PriceHistory } from '../src/history.js';

const PORT = +process.env.PORT || 8787;
const IMG = `http://localhost:${PORT}/img/`;

const LAMODA = [
  ['mp002xw0tr01', '12 Storeez', 'Тренч из хлопкового габардина', 23990, 29990, 'd8c3a0'],
  ['mp002xw0tr02', 'Mango', 'Классический тренч с поясом, бежевый', 11999, 17999, 'cdb48a'],
  ['mp002xw0tr03', 'Lime', 'Тренч оверсайз', 12999, null, 'f0eadc'],
  ['mp002xw0kd01', 'Veja', 'Кеды V-10 из кожи белые', 16990, 19990, 'fbfbf8'],
];
const STOCKMANN = [
  ['1234567', 'Gerry Weber', 'Тренч средней длины', 18990, 'бежевый', ['M', 'L', 'XL']],
  ['2345678', 'Massimo Dutti', 'Двубортный тренч из хлопка', 26990, 'бежевый', ['S', 'M']],
  ['3456789', 'Geox', 'Кеды кожаные', 13990, 'белый', ['37', '38', '39']],
];
const match = (q, title, brand) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => (title + ' ' + brand).toLowerCase().includes(w.slice(0, 5)));

function lamodaSearch(q) {
  const cards = LAMODA.filter(([, b, t]) => match(q, t, b)).map(([sku, brand, title, price, old, color]) => `
    <div class="x-product-card__card">
      <a href="/p/${sku}/clothes-${sku}/"><img src="${IMG}${color}.svg" alt="${title}"></a>
      <div>${old ? `<span class="old">${old.toLocaleString('ru-RU')} ₽</span>` : ''}<span class="new">${price.toLocaleString('ru-RU')} ₽</span>
      <div class="brand">${brand}</div><a href="/p/${sku}/clothes-${sku}/">${title}</a></div>
    </div>`).join('');
  return `<html><body><div class="grid">${cards}</div></body></html>`;
}
function stockmannSearch(q) {
  const list = STOCKMANN.filter(([, b, t]) => match(q, t, b)).map(([sku, brand, name, price, color]) => ({
    '@type': 'Product', name, sku, brand: { '@type': 'Brand', name: brand }, color, url: `https://stockmann.ru/product/${sku}-item/`,
    image: `${IMG}${color === 'белый' ? 'fbfbf8' : 'b8894f'}.svg`, offers: { '@type': 'Offer', price, priceCurrency: 'RUB', availability: 'https://schema.org/InStock' },
    aggregateRating: { ratingValue: 4.6, reviewCount: 57 },
  }));
  return `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'ItemList', itemListElement: list.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) })}</script></head><body></body></html>`;
}
function stockmannProduct(sku) {
  const p = STOCKMANN.find((x) => x[0] === sku);
  if (!p) return null;
  const [, brand, name, price, color, sizes] = p;
  return `<html><head><meta property="og:image" content="${IMG}b8894f.svg"><meta property="og:image" content="${IMG}d8c3a0.svg">
  <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name, brand, color, sku, offers: sizes.map((z) => ({ '@type': 'Offer', name: z, price, availability: 'InStock' })) })}</script></head><body><h1>${name}</h1></body></html>`;
}
function lamodaProduct(sku) {
  const p = LAMODA.find((x) => x[0] === sku);
  if (!p) return null;
  const [, brand, title, price, old, color] = p;
  return `<html><head><meta property="og:title" content="${brand} ${title}"><meta property="og:image" content="${IMG}${color}.svg">
  <meta property="product:price:amount" content="${price}"></head><body>
  <script>window.__INITIAL_STATE__ = ${JSON.stringify({ product: { sku, title, brand: { name: brand }, price: { current: price, old }, url: `/p/${sku}/clothes-${sku}/`, sizes: [{ title: 'XS' }, { title: 'S' }, { title: 'M' }] } })};</script></body></html>`;
}

const fakeFetch = async (url) => {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  let body = '<html><body>home</body></html>', status = 200;
  const q = u.searchParams.get('q') || u.searchParams.get('text') || '';
  if (host === 'lamoda.ru' && u.pathname.startsWith('/catalogsearch')) body = lamodaSearch(q);
  else if (host === 'lamoda.ru' && u.pathname.startsWith('/p/')) body = lamodaProduct(u.pathname.split('/')[2]) || (status = 404, 'nf');
  else if (host === 'stockmann.ru' && u.pathname.startsWith('/search')) body = stockmannSearch(q);
  else if (host === 'stockmann.ru' && u.pathname.startsWith('/product/')) body = stockmannProduct((u.pathname.match(/(\d{5,})/) || [])[1]) || (status = 404, 'nf');
  else if (host === 'market.yandex.ru' && u.pathname.startsWith('/search')) body = '<html><body>Подтвердите, что запросы отправляли вы, а не робот <script src="https://smartcaptcha.yandexcloud.net/x.js"></script></body></html>';
  await new Promise((r) => setTimeout(r, 300));
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
};

const history = new PriceHistory('/tmp/pricel-mock-prices.json');
history.save = async () => {};
// Немного прошлой истории, чтобы было видно график.
const DAY = 86400000;
history.data['stockmann:1234567'] = { points: [[Date.now() - 40 * DAY, 21990], [Date.now() - 12 * DAY, 19990]] };
const api = createApp({ history, fetchImpl: fakeFetch, storeGapMs: 200 });

http.createServer((req, res) => {
  const m = req.url.match(/^\/img\/([0-9a-f]{6})\.svg$/);
  if (m) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect width="300" height="400" fill="#${m[1]}"/><path d="M110 60h80l30 60-20 260H100L80 120z" fill="#0002"/></svg>`);
  }
  return api(req, res);
}).listen(PORT, () => console.log('mock API http://localhost:' + PORT));
