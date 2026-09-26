import { useEffect, useMemo, useState } from 'react';
import { ALLSIZES, HEX } from '../data/catalog.js';
import { PRODUCTS_F, STORES_F, countStr, fmt, toggle, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { criteriaChips, emptyFilters, getResults, hasFilters, runKey } from '../lib/search.js';
import { searchOne } from '../lib/source.js';
import { ExportModal } from '../components/ExportModal.jsx';
import { ProductCard, ProductTable } from '../components/ProductCard.jsx';
import { CheckRow, Segmented, Tags } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const STATUS_TEXT = { blocked: 'магазин не пустил', error: 'ошибка', empty: 'товары не распознаны', noext: 'нужно расширение' };
const NOTE_PREFIX = { blocked: 'не удалось получить выдачу: ', empty: '', error: 'ошибка: ', noext: '' };

function progressText(p) {
  if (!p) return 'ищу…';
  if (p.stage === 'human') return 'магазин просит проверку «не робот» — пройдите её в окне браузера';
  if (p.stage === 'details') return 'нашёл ' + p.found + ' · смотрю размеры и цвет ' + p.done + '/' + p.total;
  return 'открываю выдачу…';
}

function Loading({ run, entry, progress }) {
  const stores = entry?.stores || {};
  return (
    <div className="page loading" aria-live="polite">
      <div className="mono-label">Ищу</div>
      <h1>«{run.q}»</h1>
      {run.stores.map((name) => {
        const r = stores[name];
        const status = r
          ? r.status === 'ok' ? 'готово · ' + countStr(r.items.length, PRODUCTS_F) : STATUS_TEXT[r.status] || r.status
          : progressText(progress[name]);
        const pr = progress[name];
        const width = r ? '100%' : pr && pr.stage === 'details' && pr.total ? 30 + (70 * pr.done) / pr.total + '%' : '30%';
        return (
          <div key={name} className="load-row">
            <div className="top">
              <span>{name}</span>
              <span className={'status' + (r ? (r.status === 'ok' ? ' done' : ' fail') : '')}>{status}</span>
            </div>
            <div className="bar"><i style={{ width }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Filters({ base, ds, f, setF, open, onClose, shown }) {
  const count = (fn) => {
    const m = {};
    base.forEach(({ p }) => [].concat(fn(p)).filter(Boolean).forEach((v) => { m[v] = (m[v] || 0) + 1; }));
    return m;
  };
  const sc = count((p) => p.store), bc = count((p) => p.brand), zc = count((p) => p.sizes || []), cc = count((p) => p.color);
  const known = ALLSIZES[ds] || [];
  const sizeOrder = [...known, ...Object.keys(zc).filter((z) => !known.includes(z)).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }))];
  const prices = base.map((x) => x.p.price);
  const set = (k, v) => setF((st) => ({ ...st, [k]: v }));
  return (
    <aside className={'filters' + (open ? ' open' : '')} id="filters">
      <div className="filters-head">
        <span className="title">Фильтры</span>
        <span style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          {hasFilters(f) && <button type="button" className="link-btn" onClick={() => setF(emptyFilters())}>Сбросить</button>}
          <button type="button" className="modal-close filters-close" onClick={onClose} aria-label="Закрыть фильтры">✕</button>
        </span>
      </div>
      <div>
        <div className="filter-title">Магазин</div>
        {Object.keys(sc).map((k) => <CheckRow compact key={k} on={f.stores.includes(k)} label={k} meta={sc[k]} onClick={() => set('stores', toggle(f.stores, k))} />)}
      </div>
      {Object.keys(bc).length > 0 && (
        <div>
          <div className="filter-title">Бренд</div>
          {Object.keys(bc).sort((a, b) => a.localeCompare(b, 'ru')).map((k) => (
            <CheckRow compact key={k} on={f.brands.includes(k)} label={k} meta={bc[k]} onClick={() => set('brands', toggle(f.brands, k))} />
          ))}
        </div>
      )}
      {Object.keys(zc).length > 0 && (
        <div>
          <div className="filter-title" style={{ marginBottom: 10 }}>Размер</div>
          <div className="size-grid">
            {sizeOrder.filter((z) => zc[z]).map((z) => (
              <button key={z} type="button" aria-pressed={f.sizes.includes(z)} className={'size-btn' + (f.sizes.includes(z) ? ' on' : '')}
                onClick={() => set('sizes', toggle(f.sizes, z))}>{z}</button>
            ))}
          </div>
        </div>
      )}
      {Object.keys(cc).length > 0 && (
        <div>
          <div className="filter-title">Цвет</div>
          {Object.keys(cc).map((k) => (
            <CheckRow compact key={k} on={f.colors.includes(k)} label={k} meta={cc[k]} onClick={() => set('colors', toggle(f.colors, k))}>
              <i className="swatch" style={{ background: HEX[k] || 'transparent' }} />
            </CheckRow>
          ))}
        </div>
      )}
      <div>
        <div className="filter-title" style={{ marginBottom: 10 }}>Цена, ₽</div>
        <div className="price-inputs">
          <input inputMode="numeric" aria-label="Цена от" value={f.min} placeholder={prices.length ? 'от ' + fmt(Math.min(...prices)) : 'от'}
            onChange={(e) => set('min', e.target.value.replace(/\D/g, ''))} />
          <input inputMode="numeric" aria-label="Цена до" value={f.max} placeholder={prices.length ? 'до ' + fmt(Math.max(...prices)) : 'до'}
            onChange={(e) => set('max', e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <div className="filters-apply">
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Показать {countStr(shown, PRODUCTS_F)}</button>
      </div>
    </aside>
  );
}

const SORTS = [['match', 'По соответствию'], ['priceAsc', 'Дешевле'], ['priceDesc', 'Дороже'], ['discount', 'По скидке']];
const VIEWS = [['grid', 'Сетка'], ['table', 'Таблица']];

export function Results({ run }) {
  const app = useApp();
  const key = runKey(run);
  const [f, setF] = useState(emptyFilters);
  const [sort, setSort] = useState('match');
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [progress, setProgress] = useState({});

  const entry = app.results[key];
  const missing = run.stores.filter((n) => !entry?.stores?.[n]);
  const loading = missing.length > 0;

  // Запрашиваем магазины, по которым ещё нет ответа; каждый ответ сразу появляется на экране загрузки.
  const { setStoreResult, setLastRun } = app;
  const missingKey = missing.join('|');
  useEffect(() => {
    if (!missingKey) return undefined;
    const ctrl = new AbortController();
    missingKey.split('|').forEach((name, i) => {
      searchOne(run, name, ctrl.signal, i, (p) => { if (!ctrl.signal.aborted) setProgress((st) => ({ ...st, [name]: p })); })
        .then((res) => { if (!ctrl.signal.aborted) setStoreResult(key, name, res); })
        .catch(() => { /* отменено */ });
    });
    return () => ctrl.abort();
    // missingKey меняется по мере ответов, но запрос уже в пути — перезапускать его не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading]);

  // Для страницы товара запоминаем текущий поиск (в т.ч. открытый по ссылке).
  const sameRun = app.lastRun && runKey(app.lastRun) === key;
  useEffect(() => {
    if (!sameRun) setLastRun({ ...run, at: new Date().toISOString() });
  }, [sameRun, run, setLastRun]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [filtersOpen]);

  const items = useMemo(() => (loading ? [] : run.stores.flatMap((n) => entry.stores[n].items || [])), [loading, run.stores, entry]);
  const { base, list } = useMemo(() => getResults(items, run.crit, f, sort), [items, run.crit, f, sort]);

  if (loading) return <Loading run={run} entry={entry} progress={progress} />;

  const checked = whenStr(entry.at);
  const failed = run.stores.map((n) => ({ name: n, ...entry.stores[n] })).filter((r) => r.status !== 'ok');
  const full = base.filter((x) => x.m.score === 100).length;
  const view = app.prefs.view === 'table' ? 'table' : 'grid';
  const isSaved = app.saved.some((x) => x.q === run.q && x.ds === run.ds);
  const open = (id) => navigate('/product/' + encodeURIComponent(id) + '?from=results');

  return (
    <div className="page results">
      <div className="results-head">
        <div style={{ minWidth: 0 }}>
          <div className="mono-label">
            Результаты · {countStr(base.length, PRODUCTS_F)} · {countStr(run.stores.length, STORES_F)} · {full} полностью подходят · проверено {checked}
          </div>
          <h1>«{run.q}»</h1>
          <div className="tags">
            <Tags items={criteriaChips(run.crit, run.stores, run.ds)} variant="outlined" />
            <button type="button" className="link-btn underline" style={{ fontSize: 12.5, marginLeft: 6 }}
              onClick={() => { app.setQuery(run.q); navigate('/'); }}>Изменить</button>
            <button type="button" className="link-btn underline" style={{ fontSize: 12.5, marginLeft: 6 }}
              onClick={() => app.runSearch(run)}>Обновить</button>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-secondary btn-md" disabled={isSaved}
            onClick={() => { app.saveSearch({ ...run, at: entry.at }); app.notify('Поиск сохранён в «Мои поиски»'); }}>
            {isSaved ? '✓ Поиск сохранён' : 'Сохранить поиск'}
          </button>
          <button type="button" className="btn btn-primary btn-md" onClick={() => setExportOpen(true)} disabled={!base.length}>
            <span className="sheet-icon" />Выгрузить в Google Таблицу
          </button>
        </div>
      </div>

      <div className="results-layout">
        <Filters base={base} ds={run.ds} f={f} setF={setF} open={filtersOpen} onClose={() => setFiltersOpen(false)} shown={list.length} />
        <main style={{ minWidth: 0 }}>
          {failed.length > 0 && (
            <div className="store-notes">
              {failed.map((r) => (
                <div key={r.name} className="store-note" role="status">
                  <b>{r.name}</b>
                  <span>{NOTE_PREFIX[r.status] ?? 'ошибка: '}{r.error || 'неизвестная ошибка'}</span>
                  {r.status === 'noext'
                    ? <a href="#/extension">Установить расширение →</a>
                    : <a href={r.searchUrl} target="_blank" rel="noopener noreferrer">Искать на сайте магазина ↗</a>}
                </div>
              ))}
            </div>
          )}
          <div className="toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" className="btn btn-secondary btn-sm filters-toggle" aria-expanded={filtersOpen} aria-controls="filters"
                onClick={() => setFiltersOpen(!filtersOpen)}>
                Фильтры{hasFilters(f) ? ' •' : ''}
              </button>
              <div className="count">Показано <b>{list.length}</b> из {base.length}</div>
            </div>
            <div className="toolbar-right">
              <Segmented label="Сортировка" options={SORTS} value={sort} onChange={setSort} />
              <Segmented label="Вид" options={VIEWS} value={view} onChange={(v) => app.setPref('view', v)} />
            </div>
          </div>

          {!base.length && (
            <div className="empty">
              {failed.length === run.stores.length ? 'Ни один магазин не ответил. ' : 'В выбранных магазинах ничего не нашлось под этот запрос. '}
              <button type="button" className="link-btn underline" style={{ color: 'var(--ink)', fontSize: 14 }} onClick={() => navigate('/')}>Изменить запрос</button>
            </div>
          )}
          {!!base.length && !list.length && (
            <div className="empty">
              Под фильтры ничего не попало.{' '}
              <button type="button" className="link-btn underline" style={{ color: 'var(--ink)', fontSize: 14 }} onClick={() => setF(emptyFilters())}>Сбросить фильтры</button>
            </div>
          )}
          {!!list.length && view === 'grid' && (
            <div className="grid">
              {list.map(({ p, m }) => (
                <ProductCard key={p.id} p={p} m={m} checked={checked} fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p)} />
              ))}
            </div>
          )}
          {!!list.length && view === 'table' && (
            <ProductTable items={list} favs={app.favs} checked={checked} onOpen={open} onFav={(p) => app.toggleFav(p)} />
          )}
        </main>
      </div>

      {exportOpen && <ExportModal query={run.q} list={list} base={base} checked={checked} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
