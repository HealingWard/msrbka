import { fmt, pct, rub } from './format.js';
import { priceStats } from './pricing.js';
import { productView } from './product.js';

export const EXPORT_COLUMNS = [
  ['Фото', 80], ['Название', 240], ['Бренд', 120], ['Магазин', 120], ['Текущая цена', 110],
  ['Средняя, 90 дн', 120], ['Мин., 90 дн', 110], ['К обычной', 90], ['Рейтинг', 70], ['Отзывы', 76],
  ['Наличие', 116], ['Размеры', 120], ['Цвет', 96], ['Соответствие', 104], ['Почему подходит', 400], ['Проверено', 124],
  ['Ссылка на вещь', 150],
];

export const LIST_COLUMNS = [
  ['Фото', 80], ['Название', 240], ['Бренд', 120], ['Магазин', 120], ['Список', 120], ['Текущая цена', 110], ['При добавлении', 120],
  ['Изменение', 96], ['Средняя, 90 дн', 120], ['Мин., 90 дн', 110], ['Цель', 100], ['Статус', 120], ['Ссылка на вещь', 150],
];

export const columnLetter = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const cell = (v, align = 'left', href = '') => ({ v: String(v), align, href });

/** Строки выгрузки: по одной ячейке на колонку EXPORT_COLUMNS. */
/** histories: { [id]: [{t, price}] } — средняя и минимум считаются, когда истории хотя бы неделя. */
export function exportRows(items, checked, histories = {}) {
  return items.map(({ p, m }) => {
    const v = productView(p);
    const st = priceStats(histories[p.id], 90);
    const has = st && st.known;
    const va = has ? st.va : null;
    return [
      cell(p.image ? 'фото' : '', 'left', p.image || ''), cell(p.title), cell(p.brand || ''), cell(p.store),
      cell(rub(p.price), 'right'),
      cell(has ? rub(Math.round(st.avg / 10) * 10) : '', 'right'), cell(has ? rub(st.mn) : '', 'right'), cell(has ? pct(va) : '', 'right'),
      cell(v.rating, 'right'), cell(p.reviews ? fmt(p.reviews) : '', 'right'), cell(v.stock), cell((p.sizes || []).join(', ')), cell(p.color || ''),
      cell(m.score + '\u00a0%', 'right'), cell(m.summary), cell(checked), cell(v.domain + (p.demo ? ' / поиск' : ''), 'left', v.url),
    ];
  });
}

/** Строки выгрузки списков: r — строки экрана «Списки и цели». */
export function listExportRows(rows, colls) {
  const name = (id) => colls.find((c) => c.id === id)?.name || '';
  return rows.map((r) => {
    const v = productView(r.item);
    const has = r.st && r.st.known;
    return [
      cell(r.item.image ? 'фото' : '', 'left', r.item.image || ''), cell(r.item.title), cell(r.item.brand || ''), cell(r.item.store), cell(name(r.list)),
      cell(rub(r.cur), 'right'), cell(rub(r.was), 'right'), cell(pct(r.dl), 'right'),
      cell(has ? rub(Math.round(r.st.avg / 10) * 10) : '', 'right'), cell(has ? rub(r.st.mn) : '', 'right'), cell(r.tg ? rub(r.tg) : '', 'right'),
      cell(r.status.label), cell(v.domain, 'left', v.url),
    ];
  });
}

const csvEscape = (s) => (/[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
// В CSV цены пишем числами без пробелов и «₽», чтобы таблица могла их считать.
const plainNumber = (s) => (/^[\d\s ]+\s?₽$/.test(s) ? s.replace(/[^\d]/g, '') : s);

export function toCSV(rows, columns = EXPORT_COLUMNS) {
  const head = columns.map((c) => c[0]);
  const body = rows.map((r) => r.map((c) => (c.href ? c.href : plainNumber(c.v))));
  return '﻿' + [head, ...body].map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML-таблица: при вставке в Google Таблицы ссылки становятся гиперссылками. */
export function toHTML(rows, columns = EXPORT_COLUMNS) {
  const head = '<tr>' + columns.map((c) => '<th>' + esc(c[0]) + '</th>').join('') + '</tr>';
  const body = rows.map((r) => '<tr>' + r.map((c) => '<td>' + (c.href ? '<a href="' + esc(c.href) + '">' + esc(c.v) + '</a>' : esc(c.v)) + '</td>').join('') + '</tr>').join('');
  return '<meta charset="utf-8"><table>' + head + body + '</table>';
}

export function toTSV(rows, columns = EXPORT_COLUMNS) {
  const head = columns.map((c) => c[0]);
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
export async function copyTable(rows, columns = EXPORT_COLUMNS) {
  const html = toHTML(rows, columns);
  const text = toTSV(rows, columns);
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
