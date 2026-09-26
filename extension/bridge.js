// Мост между страницей «Прицела» и расширением.
// Страница шлёт window.postMessage({ pricel: 'hello' | 'search' | 'details' | 'brands', id, ... }),
// мост пересылает в фоновый скрипт и возвращает ответы/прогресс тем же способом.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const reply = (msg) => window.postMessage({ ...msg, pricelExt: true }, window.location.origin);

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== window.location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.pricelExt || typeof m.pricel !== 'string') return;
    if (m.pricel === 'hello') { reply({ pricel: 'ready', version: VERSION }); return; }
    if (m.pricel !== 'search' && m.pricel !== 'details' && m.pricel !== 'brands') return;
    let port;
    try {
      port = chrome.runtime.connect({ name: 'pricel' });
    } catch {
      reply({ pricel: 'error', id: m.id, error: 'расширение обновилось — перезагрузите страницу' });
      return;
    }
    port.onMessage.addListener((msg) => reply({ ...msg, id: m.id }));
    port.onDisconnect.addListener(() => { if (chrome.runtime.lastError) reply({ pricel: 'error', id: m.id, error: 'расширение прервало запрос' }); });
    port.postMessage({ type: m.pricel, store: m.store, query: m.query, url: m.url, limit: m.limit, force: m.force });
  });

  // Сообщаем странице, что расширение есть (и отвечаем на hello, если страница загрузилась раньше).
  reply({ pricel: 'ready', version: VERSION });
})();
