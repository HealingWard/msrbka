import { useEffect, useMemo, useState } from 'react';
import { ALLSIZES, HEX } from '../data/catalog.js';
import { PRODUCTS_F, STORES_F, countStr, fmt, toggle, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { baseProducts, criteriaChips, emptyFilters, getResults, hasFilters, runKey } from '../lib/search.js';
import { ExportModal } from '../components/ExportModal.jsx';
import { ProductCard, ProductTable } from '../components/ProductCard.jsx';
import { CheckRow, Segmented, Tags } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const STEP_MS = 450;

function Loading({ run, onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (step > run.stores.length) onDone(); }, [step, run.stores.length, onDone]);
  const all = baseProducts(run);
  return (
    <div className="page loading" aria-live="polite">
      <div className="mono-label">Ищу</div>
      <h1>«{run.q}»</h1>
      {run.stores.map((name, i) => {
        const done = i < step, active = i === step;
        const cnt = all.filter((p) => p.store === name).length;
        return (
          <div key={name} className="load-row">
            <div className="top">
              <span>{name}</span>
              <span className={'status' + (done ? ' done' : '')}>{done ? 'готово · ' + countStr(cnt, PRODUCTS_F) : active ? 'ищу…' : 'в очереди'}</span>
            </div>
            <div className="bar"><i style={{ width: done ? '100%' : active ? '60%' : '0%' }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Filters({ base, ds, f, setF, open, onClose, shown }) {
  const count = (fn) => {
    const m = {};
    base.forEach(({ p }) => [].concat(fn(p)).forEach((v) => { m[v] = (m[v] || 0) + 1; }));
    return m;
  };
  const sc = count((p) => p.store), bc = count((p) => p.brand), zc = count((p) => p.sizes), cc = count((p) => p.color);
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
      <div>
        <div className="filter-title">Бренд</div>
        {Object.keys(bc).sort((a, b) => a.localeCompare(b, 'ru')).map((k) => (
          <CheckRow compact key={k} on={f.brands.includes(k)} label={k} meta={bc[k]} onClick={() => set('brands', toggle(f.brands, k))} />
        ))}
      </div>
      <div>
        <div className="filter-title" style={{ marginBottom: 10 }}>Размер</div>
        <div className="size-grid">
          {ALLSIZES[ds].filter((z) => zc[z]).map((z) => (
            <button key={z} type="button" aria-pressed={f.sizes.includes(z)} className={'size-btn' + (f.sizes.includes(z) ? ' on' : '')}
              onClick={() => set('sizes', toggle(f.sizes, z))}>{z}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="filter-title">Цвет</div>
        {Object.keys(cc).map((k) => (
          <CheckRow compact key={k} on={f.colors.includes(k)} label={k} meta={cc[k]} onClick={() => set('colors', toggle(f.colors, k))}>
            <i className="swatch" style={{ background: HEX[k] }} />
          </CheckRow>
        ))}
      </div>
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
  const loading = app.animateKey === key;

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  }, [filtersOpen]);

  // Для страницы товара и «проверено в …» запоминаем текущий поиск (в т.ч. открытый по ссылке).
  const sameRun = app.lastRun && runKey(app.lastRun) === key;
  const { setLastRun } = app;
  useEffect(() => {
    if (!sameRun) setLastRun({ ...run, at: new Date().toISOString() });
  }, [sameRun, run, setLastRun]);

  const { base, list } = useMemo(() => getResults(run, f, sort), [run, f, sort]);

  if (loading) return <Loading run={run} onDone={() => app.setAnimateKey(null)} />;

  const at = sameRun ? app.lastRun.at : new Date().toISOString();
  const checked = whenStr(at);
  const full = base.filter((x) => x.m.score === 100).length;
  const view = app.prefs.view === 'table' ? 'table' : 'grid';
  const isSaved = app.saved.some((x) => x.q === run.q && x.ds === run.ds);
  const open = (id) => navigate('/product/' + id + '?from=results');

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
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-secondary btn-md" disabled={isSaved}
            onClick={() => { app.saveSearch({ ...run, at }); app.notify('Поиск сохранён в «Мои поиски»'); }}>
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
              В выбранных магазинах нет товаров под этот запрос.{' '}
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
                <ProductCard key={p.id} p={p} m={m} checked={checked} fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p.id)} />
              ))}
            </div>
          )}
          {!!list.length && view === 'table' && (
            <ProductTable items={list} favs={app.favs} checked={checked} onOpen={open} onFav={app.toggleFav} />
          )}
        </main>
      </div>

      {exportOpen && <ExportModal query={run.q} list={list} base={base} checked={checked} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
