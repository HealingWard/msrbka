import { useEffect, useMemo, useState } from 'react';
import { EXPORT_COLUMNS, LIST_COLUMNS, columnLetter, copyTable, downloadFile, exportRows, listExportRows, safeFileName, toCSV } from '../lib/export.js';
import { dateStamp, plural } from '../lib/format.js';
import { fetchHistories } from '../lib/source.js';
import { Icon } from './Icon.jsx';
import { Segmented } from './ui.jsx';

const SHEETS_URL = { new: 'https://sheets.new', existing: 'https://docs.google.com/spreadsheets/' };

/**
 * Выгрузка в Google Sheets: предпросмотр листа, затем таблица копируется в буфер (ссылки остаются гиперссылками)
 * и открывается Google Таблица, куда её вставить. Или CSV-файл.
 * kind='results': list/base — выдача; kind='lists': listRows/allRows — строки «Списков и целей».
 */
export function ExportModal({ kind = 'results', query, list = [], base = [], checked, listRows = [], allRows = [], colls = [], onClose }) {
  const isLists = kind === 'lists';
  const [scope, setScope] = useState('filtered');
  const [dest, setDest] = useState('new');
  const [name, setName] = useState(() => 'Отмерь — ' + query + ' — ' + dateStamp());
  const [state, setState] = useState('idle'); // idle | working | done | failed

  const [histories, setHistories] = useState({});
  useEffect(() => {
    if (isLists) return undefined;
    const ctrl = new AbortController();
    fetchHistories(base.map((x) => x.p), ctrl.signal).then(setHistories).catch(() => {});
    return () => ctrl.abort();
  }, [base, isLists]);

  const columns = isLists ? LIST_COLUMNS : EXPORT_COLUMNS;
  const rows = useMemo(() => (isLists
    ? listExportRows(scope === 'filtered' ? listRows : allRows, colls)
    : exportRows(scope === 'filtered' ? list : base, checked, histories)), [isLists, scope, listRows, allRows, colls, list, base, checked, histories]);
  const nF = isLists ? listRows.length : list.length;
  const nA = isLists ? allRows.length : base.length;
  const sheet = isLists ? 'Списки' : 'Результаты';

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
    setState((await copyTable(rows, columns)) ? 'done' : 'failed');
  };
  const csv = () => downloadFile(safeFileName(name) + '.csv', toCSV(rows, columns), 'text/csv;charset=utf-8');

  return (
    <div className="mdl-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="mdl-head">
          <div className="l">
            <Icon name="sheet" size={24} />
            <div>
              <div className="h2" id="export-title">Выгрузка в Google Sheets</div>
              <div className="sub">Предпросмотр листа. Ссылки на вещи станут гиперссылками.</div>
            </div>
          </div>
          <button type="button" className="mdl-close" onClick={onClose} aria-label="Закрыть"><Icon name="x" size={16} /></button>
        </div>
        <div className="mdl-ctrl">
          <div>
            <div className="label">Название таблицы</div>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Название таблицы" />
          </div>
          <div>
            <div className="label">Куда</div>
            <Segmented label="Куда" value={dest} onChange={setDest} options={[['new', 'Новая таблица'], ['existing', 'Лист в существующей']]} />
          </div>
          <div>
            <div className="label">Строки</div>
            <Segmented label="Строки" value={scope} onChange={setScope}
              options={isLists
                ? [['filtered', 'Текущий список · ' + nF], ['all', 'Все списки · ' + nA]]
                : [['filtered', 'С фильтрами · ' + nF], ['all', 'Все · ' + nA]]} />
          </div>
        </div>
        <div className="sheet">
          <table>
            <thead>
              <tr>
                <th className="corner" />
                {columns.map((c, i) => <th key={c[0]} className="letter" style={{ minWidth: c[1], width: c[1] }}>{columnLetter(i)}</th>)}
              </tr>
              <tr>
                <th className="rn">1</th>
                {columns.map((c) => <th key={c[0]} className="col">{c[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="rn">{i + 2}</td>
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
        <div className="mdl-foot">
          <span className="meta">{rows.length} {plural(rows.length, ['строка', 'строки', 'строк'])} × {columns.length} колонок · лист «{sheet}»</span>
          {state === 'done' ? (
            <>
              <span className="done"><Icon name="check" size={18} />{dest === 'new' ? 'Скопировано — вставьте в ячейку A1 новой таблицы' : 'Скопировано — вставьте на новый лист'}</span>
              <a className="btn btn-primary" href={SHEETS_URL[dest]} target="_blank" rel="noopener noreferrer">{dest === 'new' ? 'Открыть новую таблицу' : 'Открыть таблицу'}</a>
            </>
          ) : (
            <>
              {state === 'failed' && <span className="fail">Браузер не дал доступ к буферу — скачайте CSV</span>}
              <button type="button" className="btn btn-secondary" onClick={csv}>Скачать CSV</button>
              <button type="button" className="btn btn-primary" style={{ minWidth: 170 }} onClick={copy} disabled={state === 'working' || !rows.length}>
                {state === 'working' ? 'Копирую…' : dest === 'new' ? 'Создать таблицу' : 'Добавить лист'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
