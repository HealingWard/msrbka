// Мост между страницей «Отмерь» и расширением.
// Страница шлёт window.postMessage({ pricel: 'hello' | 'search' | 'details' | 'brands' | 'catbrands' | 'recheck' | 'watch' | 'stop', id, ... }),
// мост пересылает в фоновый скрипт и возвращает ответы/прогресс тем же способом.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const reply = (msg) => window.postMessage({ ...msg, pricelExt: true }, window.location.origin);
  const ports = new Map(); // id запроса → порт к расширению (для «Остановить»)

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.pricelExt || typeof m.pricel !== 'string') return;
    if (m.pricel === 'hello') { reply({ pricel: 'ready', version: VERSION }); return; }
    // Список вещей для автопроверки цен; в ответ — проверки, которые сайт ещё не забрал.
    if (m.pricel === 'watch') {
      try {
        chrome.runtime.sendMessage({ type: 'watch', items: m.items, site: m.site, api: m.api, applied: m.applied, lastManual: m.lastManual }, (r) => {
          if (chrome.runtime.lastError || !r) reply({ pricel: 'error', id: m.id, error: 'расширение не ответило' });
          else reply({ ...r, pricel: 'result', id: m.id });
        });
      } catch {
        reply({ pricel: 'error', id: m.id, error: 'расширение обновилось — перезагрузите страницу' });
      }
      return;
    }
    // «Остановить»: задача отдаст найденное.
    if (m.pricel === 'stop') { try { ports.get(m.id)?.postMessage({ type: 'stop' }); } catch { /* уже закончилась */ } return; }
    if (!['search', 'details', 'brands', 'catbrands', 'recheck'].includes(m.pricel)) return;
    let port;
    try {
      port = chrome.runtime.connect({ name: 'pricel' });
    } catch {
      reply({ pricel: 'error', id: m.id, error: 'расширение обновилось — перезагрузите страницу' });
      return;
    }
    ports.set(m.id, port);
    let done = false;
    port.onMessage.addListener((msg) => { if (msg.pricel === 'result') { done = true; ports.delete(m.id); } reply({ ...msg, id: m.id }); });
    // Связь оборвалась до ответа (расширение перезапустилось) — сообщаем сразу, а не ждём таймаута.
    port.onDisconnect.addListener(() => { ports.delete(m.id); if (!done) reply({ pricel: 'error', id: m.id, error: 'расширение прервало запрос — нажмите ещё раз' }); });
    port.postMessage({ type: m.pricel, store: m.store, query: m.query, url: m.url, urls: m.urls, limit: m.limit, force: m.force });
  });

  // Сообщаем странице, что расширение есть (и отвечаем на hello, если страница загрузилась раньше).
  reply({ pricel: 'ready', version: VERSION });
})();
