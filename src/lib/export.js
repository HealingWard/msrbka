import { fmt, rub, signedPct } from './format.js';
import { historyStats } from './history.js';
import { productView } from './product.js';

export const EXPORT_COLUMNS = [
  ['Фото', 80], ['Название', 240], ['Бренд', 120], ['Магазин', 120], ['Текущая цена', 110], ['Старая цена', 110],
  ['Скидка', 70], ['Средняя, 90 дн', 120], ['Мин., 90 дн', 110], ['К средней', 84], ['Рейтинг', 70], ['Отзывы', 76],
  ['Наличие', 116], ['Размеры', 120], ['Цвет', 96], ['Соответствие', 104], ['Почему подходит', 400], ['Проверено', 124],
  ['Ссылка на товар', 150],
];

export const columnLetter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const cell = (v, align = 'left', href = '') => ({ v: String(v), align, href });

/** Строки выгрузки: по одной ячейке на колонку EXPORT_COLUMNS. */
/** histories: { [id]: [{t, price}] } — средняя и минимум считаются, если проверок хотя бы две. */
export function exportRows(items, checked, histories = {}) {
  return items.map(({ p, m }) => {
    const v = productView(p);
    const st = historyStats(histories[p.id], 90);
    const has = st && st.count >= 2;
    const va = has ? Math.round(((p.price - st.avg) / st.avg) * 100) : null;
    return [
      cell(p.image ? 'фото' : '', 'left', p.image || ''), cell(p.title), cell(p.brand || ''), cell(p.store),
      cell(rub(p.price), 'right'), cell(v.hasOld ? rub(p.old) : '', 'right'), cell(v.hasOld ? v.discStr : '', 'right'),
      cell(has ? rub(Math.round(st.avg / 10) * 10) : '', 'right'), cell(has ? rub(st.min) : '', 'right'), cell(has ? signedPct(va) : '', 'right'),
      cell(v.rating, 'right'), cell(p.reviews ? fmt(p.reviews) : '', 'right'), cell(v.stock), cell((p.sizes || []).join(', ')), cell(p.color || ''),
      cell(m.score + '%', 'right'), cell(m.summary), cell(checked), cell(v.domain + (p.demo ? ' / поиск' : ''), 'left', v.url),
    ];
  });
}

const csvEscape = (s) => (/[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
// В CSV цены пишем числами без пробелов и «₽», чтобы таблица могла их считать.
const plainNumber = (s) => (/^[\d\s ]+\s?₽$/.test(s) ? s.replace(/[^\d]/g, '') : s);

export function toCSV(rows) {
  const head = EXPORT_COLUMNS.map((c) => c[0]);
  const body = rows.map((r) => r.map((c) => (c.href ? c.href : plainNumber(c.v))));
  return '﻿' + [head, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML-таблица: при вставке в Google Таблицы ссылки становятся гиперссылками. */
export function toHTML(rows) {
  const head = '<tr>' + EXPORT_COLUMNS.map((c) => '<th>' + esc(c[0]) + '</th>').join('') + '</tr>';
  const body = rows.map((r) => '<tr>' + r.map((c) => '<td>' + (c.href ? '<a href="' + esc(c.href) + '">' + esc(c.v) + '</a>' : esc(c.v)) + '</td>').join('') + '</tr>').join('');
  return '<meta charset="utf-8"><table>' + head + body + '</table>';
}

export function toTSV(rows) {
  const head = EXPORT_COLUMNS.map((c) => c[0]);
  return [head, ...rows.map((r) => r.map((c) => (c.href && c.v === 'фото' ? c.href : c.v)))].map((r) => r.join('\t')).join('\n');
}

function copyViaSelection(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(el);
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  el.remove();
  return ok;
}

/** Копирует таблицу в буфер как HTML + текст. Возвращает true при успехе. */
export async function copyTable(rows) {
  const html = toHTML(rows);
  const text = toTSV(rows);
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return true;
    }
  } catch { /* пробуем запасной путь */ }
  if (copyViaSelection(html)) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFileName = (s) => (s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Отмерь').slice(0, 120);
