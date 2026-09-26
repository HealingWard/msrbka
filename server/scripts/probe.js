// Диагностика: что сервер видит в магазине.
//   npm run probe -- lamoda "бежевый тренч"
//   npm run probe -- all "кеды veja"
//   npm run probe -- url https://www.lamoda.ru/p/…/
// Сырой HTML сохраняется в ./probe/, чтобы можно было поправить разбор под вёрстку магазина.

import { mkdir, writeFile } from 'node:fs/promises';
import { fetchPage, CookieJar } from '../src/http.js';
import { extractListing, extractProduct } from '../src/extract.js';
import { STORES, storeForUrl } from '../src/stores.js';

const [target = 'all', ...rest] = process.argv.slice(2);
const q = rest.join(' ') || 'тренч';
await mkdir('probe', { recursive: true });

async function probeStore(store) {
  const url = store.searchUrl(q);
  console.log(`\n=== ${store.name}: ${url}`);
  try {
    const jar = new CookieJar();
    try { await fetchPage(store.home, { jar }); } catch (e) { console.log('  главная:', e.message); }
    const page = await fetchPage(url, { jar, referer: store.home });
    const file = `probe/${store.id}.html`;
    await writeFile(file, page.html);
    const { items, sources } = extractListing(page.html, page.url, store);
    console.log(`  HTTP ${page.status}, ${Math.round(page.html.length / 1024)} КБ → ${file}`);
    console.log(`  найдено: ${items.length} (JSON-LD ${sources.jsonld}, встроенные данные ${sources.embedded}, карточки ${sources.dom})`);
    for (const it of items.slice(0, 8)) console.log(`   · ${it.price} ₽${it.old ? ' (было ' + it.old + ')' : ''} | ${it.brand ? it.brand + ' | ' : ''}${it.title.slice(0, 70)}\n     ${it.url}`);
    if (!items.length) console.log('  ⚠ товаров не найдено — откройте сохранённый HTML и поправьте productPath в src/stores.js');
  } catch (e) {
    console.log('  ✕', e.name === 'BlockedError' ? 'БЛОКИРОВКА: ' : 'ошибка: ', e.message);
  }
}

if (target === 'url') {
  const url = rest[0];
  const store = storeForUrl(url);
  if (!store) { console.log('Ссылка не на товар поддерживаемого магазина'); process.exit(1); }
  const page = await fetchPage(url, { jar: new CookieJar(), referer: store.home });
  await writeFile(`probe/${store.id}-product.html`, page.html);
  console.log(extractProduct(page.html, url));
} else {
  const list = target === 'all' ? Object.values(STORES) : [STORES[target]].filter(Boolean);
  if (!list.length) { console.log('Магазины:', Object.keys(STORES).join(', '), 'или all'); process.exit(1); }
  for (const s of list) await probeStore(s);
}
