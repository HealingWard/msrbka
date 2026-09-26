import { useEffect, useMemo, useState } from 'react';
import { EXPORT_COLUMNS, columnLetter, copyTable, downloadFile, exportRows, safeFileName, toCSV } from '../lib/export.js';
import { countStr, dateStamp } from '../lib/format.js';
import { fetchHistories } from '../lib/source.js';
import { Segmented } from './ui.jsx';

const SHEETS_URL = { new: 'https://sheets.new', existing: 'https://docs.google.com/spreadsheets/' };

export function ExportModal({ query, list, base, checked, onClose }) {
  const [scope, setScope] = useState('filtered');
  const [dest, setDest] = useState('new');
  const [name, setName] = useState(() => 'Отмерь — ' + query + ' — ' + dateStamp());
  const [state, setState] = useState('idle'); // idle | working | done | failed

  const [histories, setHistories] = useState({});
  useEffect(() => {
    const ctrl = new AbortController();
    fetchHistories(base.map((x) => x.p), ctrl.signal).then(setHistories).catch(() => {});
    return () => ctrl.abort();
  }, [base]);

  const items = scope === 'filtered' ? list : base;
  const rows = useMemo(() => exportRows(items, checked, histories), [items, checked, histories]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useEffect(() => setState('idle'), [scope, dest]);

  const copy = async () => {
    setState('working');
    setState((await copyTable(rows)) ? 'done' : 'failed');
  };
  const csv = () => downloadFile(safeFileName(name) + '.csv', toCSV(rows), 'text/csv;charset=utf-8');

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="modal-head">
          <div>
            <div className="title" id="export-title">Выгрузка в Google Таблицу</div>
            <div className="sub">Предпросмотр листа. Ссылки на товары и фото станут гиперссылками.</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        <div className="modal-controls">
          <div>
            <div className="field-label">Название таблицы</div>
            <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="field-label">Куда</div>
            <Segmented tall label="Куда" value={dest} onChange={setDest} options={[['new', 'Новая таблица'], ['existing', 'Лист в существующей']]} />
          </div>
          <div>
            <div className="field-label">Строки</div>
            <Segmented tall label="Строки" value={scope} onChange={setScope}
              options={[['filtered', 'С фильтрами · ' + list.length], ['all', 'Все · ' + base.length]]} />
          </div>
        </div>
        <div className="sheet">
          <table>
            <thead>
              <tr>
                <th className="corner" />
                {EXPORT_COLUMNS.map((c, i) => <th key={c[0]} className="letter" style={{ minWidth: c[1], width: c[1] }}>{columnLetter(i)}</th>)}
              </tr>
              <tr>
                <th className="rownum-h">1</th>
                {EXPORT_COLUMNS.map((c) => <th key={c[0]} className="colname">{c[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="rownum">{i + 2}</td>
                  {r.map((c, j) => (
                    <td key={j} style={{ textAlign: c.align }} title={c.v}>
                      {c.href ? <a href={c.href} target="_blank" rel="noopener noreferrer">{c.v}</a> : c.v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <span className="meta">
            {countStr(rows.length, ['строка', 'строки', 'строк'])} × {EXPORT_COLUMNS.length} колонок · лист «Результаты»
          </span>
          {state === 'done' ? (
            <>
              <span className="done-note">
                <span className="tick">✓</span>
                {dest === 'new' ? 'Скопировано — вставьте в ячейку A1 новой таблицы' : 'Скопировано — вставьте на новый лист'}
              </span>
              <a className="btn btn-primary btn-md" href={SHEETS_URL[dest]} target="_blank" rel="noopener noreferrer">
                {dest === 'new' ? 'Создать таблицу ↗' : 'Открыть Google Таблицы ↗'}
              </a>
            </>
          ) : (
            <>
              {state === 'failed' && <span className="sale-text" style={{ fontSize: 13 }}>Браузер не дал доступ к буферу — скачайте CSV</span>}
              <button type="button" className="btn btn-secondary btn-md" onClick={csv}>Скачать CSV</button>
              <button type="button" className="btn btn-primary btn-md" style={{ minWidth: 170 }} onClick={copy} disabled={state === 'working' || !rows.length}>
                {state === 'working' ? 'Копирую…' : 'Скопировать для таблицы'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
