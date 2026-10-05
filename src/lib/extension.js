// Связь с расширением «Отмерь» для Chrome (папка extension/).
// Расширение встраивает на страницу мост (bridge.js); общаемся через window.postMessage.

let ready = null;      // Promise<string|null> — версия расширения или null
let seq = 0;

export function extensionVersion(timeoutMs = 1200) {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    const on = (e) => {
      if (e.source !== window || !e.data || !e.data.pricelExt || e.data.pricel !== 'ready') return;
      window.removeEventListener('message', on);
      clearTimeout(t);
      resolve(e.data.version || '0');
    };
    const t = setTimeout(() => { window.removeEventListener('message', on); ready = null; resolve(null); }, timeoutMs);
    window.addEventListener('message', on);
    window.postMessage({ pricel: 'hello' }, window.location.origin);
  });
  return ready;
}

/** Запрос к расширению. timeoutMs — сколько ждать без вестей: каждое сообщение о ходе работы продлевает ожидание. */
function request(payload, { onProgress, signal, timeoutMs = 5 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const id = 'r' + (++seq) + '-' + Date.now();
    let t = null;
    const arm = () => { clearTimeout(t); t = setTimeout(() => { cleanup(); reject(new Error('расширение не ответило вовремя')); }, timeoutMs); };
    const cleanup = () => { window.removeEventListener('message', on); clearTimeout(t); };
    const on = (e) => {
      const m = e.data;
      if (e.source !== window || !m || !m.pricelExt || m.id !== id) return;
      if (m.pricel === 'progress') { arm(); onProgress?.(m); return; }
      cleanup();
      if (m.pricel === 'error') reject(new Error(m.error));
      else resolve(m);
    };
    arm();
    signal?.addEventListener('abort', () => { cleanup(); reject(new DOMException('aborted', 'AbortError')); });
    window.addEventListener('message', on);
    window.postMessage({ ...payload, id }, window.location.origin);
  });
}

// page — номер страницы выдачи магазина (расширение 0.6+); старое расширение отдаёт сразу до limit вещей.
export const extSearch = (store, query, opts = {}) => request({ pricel: 'search', store, query, page: opts.page || 1, limit: opts.limit || 150, brandsOnly: !!opts.brandsOnly }, opts);
export const extDetails = (url, opts) => request({ pricel: 'details', url }, { ...opts, timeoutMs: 90000 });
export const extCatBrands = (opts = {}) => request({ pricel: 'catbrands', force: !!opts.force }, { ...opts, timeoutMs: 6 * 60000 });
export const extBrands = (store, opts = {}) => request({ pricel: 'brands', store, force: !!opts.force }, { ...opts, timeoutMs: 4 * 60000 });
export const extRecheck = (urls, opts = {}) => request({ pricel: 'recheck', urls }, { ...opts, timeoutMs: Math.max(3, urls.length) * 60000 });
export const extWatch = (payload) => request({ pricel: 'watch', ...payload }, { timeoutMs: 8000 });

/** Версия расширения не ниже нужной: «0.5.0» ≥ «0.4.4». */
export function versionAtLeast(v, need) {
  const a = String(v || '0').split('.').map(Number), b = String(need).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}
