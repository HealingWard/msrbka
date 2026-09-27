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

function request(payload, { onProgress, signal, timeoutMs = 5 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const id = 'r' + (++seq) + '-' + Date.now();
    const cleanup = () => { window.removeEventListener('message', on); clearTimeout(t); };
    const on = (e) => {
      const m = e.data;
      if (e.source !== window || !m || !m.pricelExt || m.id !== id) return;
      if (m.pricel === 'progress') { onProgress?.(m); return; }
      cleanup();
      if (m.pricel === 'error') reject(new Error(m.error));
      else resolve(m);
    };
    const t = setTimeout(() => { cleanup(); reject(new Error('расширение не ответило вовремя')); }, timeoutMs);
    signal?.addEventListener('abort', () => { cleanup(); reject(new DOMException('aborted', 'AbortError')); });
    window.addEventListener('message', on);
    window.postMessage({ ...payload, id }, window.location.origin);
  });
}

export const extSearch = (store, query, opts = {}) => request({ pricel: 'search', store, query, limit: opts.limit || 150 }, opts);
export const extDetails = (url, opts) => request({ pricel: 'details', url }, { ...opts, timeoutMs: 90000 });
export const extBrands = (store, opts = {}) => request({ pricel: 'brands', store, force: !!opts.force }, { ...opts, timeoutMs: 4 * 60000 });
export const extRecheck = (urls, opts = {}) => request({ pricel: 'recheck', urls }, { ...opts, timeoutMs: Math.max(3, urls.length) * 60000 });
