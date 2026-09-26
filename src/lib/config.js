// Настройки, которые читаются при запуске из public/config.json — их можно менять без пересборки.
//   { "apiUrl": "https://api.example.ru" }  — адрес сервера поиска; пусто — демо-каталог.
// Для локальной разработки можно задать VITE_API_URL.

const config = { apiUrl: '' };

export async function loadConfig() {
  try {
    const r = await fetch('./config.json', { cache: 'no-store' });
    if (r.ok) Object.assign(config, await r.json());
  } catch { /* нет файла — демо-режим */ }
  if (import.meta.env.VITE_API_URL) config.apiUrl = import.meta.env.VITE_API_URL;
  config.apiUrl = String(config.apiUrl || '').trim().replace(/\/+$/, '');
  return config;
}

export const apiUrl = () => config.apiUrl;
export const isLive = () => !!config.apiUrl;
