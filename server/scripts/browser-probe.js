// Проверка: открывают ли Stockmann и Lamoda выдачу настоящему браузеру (Chromium через Playwright),
// запущенному на сервере. Никакой маскировки: обычный браузер с русской локалью, по одному запросу.
//   node scripts/browser-probe.js "бежевый тренч"
// Результаты (HTML после загрузки и скриншоты) сохраняются в ./probe-browser/.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const q = process.argv.slice(2).join(' ') || 'бежевый тренч';
const OUT = 'probe-browser';
await mkdir(OUT, { recursive: true });

const STORES = [
  { id: 'stockmann', name: 'Stockmann', url: 'https://stockmann.ru/search/?q=' + encodeURIComponent(q), product: 'a[href*="/product/"]' },
  { id: 'lamoda', name: 'Lamoda', url: 'https://www.lamoda.ru/catalogsearch/result/?q=' + encodeURIComponent(q), product: 'a[href^="/p/"], a[href*="lamoda.ru/p/"]' },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Europe/Moscow', viewport: { width: 1366, height: 900 } });

const isChallenge = (html) => /servicepipe\.tech|<js-challenge-loader|get_cookie_spsn\(/.test(html);

for (const s of STORES) {
  console.log(`\n=== ${s.name}: ${s.url}`);
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Ждём, пока пройдёт проверка браузера и появятся ссылки на товары (до 40 с).
    let links = 0;
    for (let i = 0; i < 40; i++) {
      links = await page.locator(s.product).count().catch(() => 0);
      if (links > 0) break;
      await page.waitForTimeout(1000);
    }
    const html = await page.content();
    await writeFile(`${OUT}/${s.id}.html`, html);
    await page.screenshot({ path: `${OUT}/${s.id}.png` });
    const title = await page.title();
    console.log(`  за ${Math.round((Date.now() - t0) / 1000)} с · адрес: ${page.url()}`);
    console.log(`  заголовок: ${title}`);
    console.log(`  проверка Servicepipe на странице: ${isChallenge(html) ? 'ДА (не пропустили)' : 'нет'}`);
    console.log(`  ссылок на товары: ${links}`);
    if (links > 0) {
      const hrefs = await page.locator(s.product).evaluateAll((as) => [...new Set(as.map((a) => a.href))].slice(0, 5));
      hrefs.forEach((h) => console.log('   · ' + h));
      // Открываем первую карточку: там должны быть размеры, цвет, бренд.
      const p = await context.newPage();
      await p.goto(hrefs[0], { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(5000);
      const phtml = await p.content();
      await writeFile(`${OUT}/${s.id}-product.html`, phtml);
      await p.screenshot({ path: `${OUT}/${s.id}-product.png`, fullPage: false });
      console.log(`  карточка товара: ${await p.title()} · ${Math.round(phtml.length / 1024)} КБ · проверка: ${isChallenge(phtml) ? 'ДА' : 'нет'}`);
      await p.close();
    }
  } catch (e) {
    console.log('  ✕ ошибка: ' + e.message.split('\n')[0]);
  }
  await page.close();
  await new Promise((r) => setTimeout(r, 3000));
}
await browser.close();
console.log(`\nФайлы: ${process.cwd()}/${OUT}/`);
