import { useEffect, useMemo, useState } from 'react';
import { ALLSIZES, HEX } from '../data/catalog.js';
import { ddmm, fmt, plural, toggle, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { criteriaChips, detectTypes, emptyFilters, getResults, hasFilters, runKey } from '../lib/search.js';
import { searchOne } from '../lib/source.js';
import { changeBadge, priceStats, sparkline } from '../lib/pricing.js';
import { useHistories } from '../lib/useHistories.js';
import { ExportModal } from '../components/ExportModal.jsx';
import { BoardCard, ProductCard, ResultsTable } from '../components/ProductCard.jsx';
import { Icon } from '../components/Icon.jsx';
import { Badges, CheckRow, Segmented, Tape } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const THINGS = ['вещь', 'вещи', 'вещей'];
const STATUS_TEXT = { blocked: 'магазин не пустил', error: 'ошибка', empty: 'вещи не распознаны', noext: 'нужно расширение' };
const NOTE_PREFIX = { blocked: 'не удалось получить выдачу: ', empty: '', error: 'ошибка: ', noext: '' };

function progressText(p) {
  if (!p) return 'сравниваю…';
  const pre = p.part ? '«' + p.query + '» ' + p.part + '/' + p.parts + ' · ' : '';
  if (p.stage === 'human') return pre + 'пройдите проверку «не робот» в окне браузера';
  if (p.stage === 'details') return pre + 'нашёл ' + p.found + ' · размеры ' + p.done + '/' + p.total;
  if (p.stage === 'search' && p.page) return pre + 'страница ' + p.page + ' · ' + p.found + (p.total ? ' из ' + p.total : '');
  return pre + 'открываю выдачу…';
}
// Доля готовности магазина для ленты-прогресса.
function storeShare(r, p) {
  if (r) return 1;
  if (!p) return 0.1;
  const part = p.parts ? (p.part - 1) / p.parts : 0;
  const inPart = p.stage === 'details' && p.total ? 0.5 + (0.5 * p.done) / p.total : p.stage === 'search' && p.page ? 0.15 + 0.05 * p.page : 0.15;
  return Math.min(0.95, part + inPart / (p.parts || 1));
}

function Loading({ run, entry, progress }) {
  const stores = entry?.stores || {};
  const share = run.stores.reduce((a, n) => a + storeShare(stores[n], progress[n]), 0) / run.stores.length;
  return (
    <div className="page w-loading" aria-live="polite">
      <div className="label">Отмеряем</div>
      <h1 className="h1" style={{ margin: '8px 0 40px' }}>«{run.q}»</h1>
      <Tape value={share} />
      <div style={{ marginTop: 24 }}>
        {run.stores.map((name) => {
          const r = stores[name];
          const status = r ? (r.status === 'ok' ? 'готово · ' + r.items.length + ' ' + plural(r.items.length, THINGS) : STATUS_TEXT[r.status] || r.status) : progressText(progress[name]);
          return (
            <div key={name} className="load-row">
              <span>{name}</span>
              <span className={'st' + (r ? (r.status === 'ok' ? ' done' : ' fail') : '')}>{status}</span>
            </div>
          );
        })}
      </div>
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
    <aside className={'flt' + (open ? ' open' : '')} id="filters" aria-label="Фильтры">
      <div className="flt-head">
        <span className="t">Фильтры</span>
        <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {hasFilters(f) && <button type="button" onClick={() => setF(emptyFilters())}>Сбросить</button>}
          <button type="button" className="btn-icon sm flt-close" onClick={onClose} aria-label="Закрыть фильтры"><Icon name="x" size={16} /></button>
        </span>
      </div>
      <div>
        <div className="label">Магазин</div>
        {Object.keys(sc).map((k) => <CheckRow key={k} on={f.stores.includes(k)} label={k} meta={sc[k]} onClick={() => set('stores', toggle(f.stores, k))} />)}
      </div>
      {Object.keys(bc).length > 0 && (
        <div>
          <div className="label">Бренд</div>
          <div className="flt-scroll">
            {Object.keys(bc).sort((a, b) => a.localeCompare(b, 'ru')).map((k) => (
              <CheckRow key={k} on={f.brands.includes(k)} label={k} meta={bc[k]} onClick={() => set('brands', toggle(f.brands, k))} />
            ))}
          </div>
        </div>
      )}
      {Object.keys(zc).length > 0 && (
        <div>
          <div className="label">Размер</div>
          <div className="sizes">
            {sizeOrder.filter((z) => zc[z]).map((z) => (
              <button key={z} type="button" aria-pressed={f.sizes.includes(z)} className={'size-btn' + (f.sizes.includes(z) ? ' on' : '')}
                onClick={() => set('sizes', toggle(f.sizes, z))}>{z}</button>
            ))}
          </div>
        </div>
      )}
      {Object.keys(cc).length > 0 && (
        <div>
          <div className="label">Цвет</div>
          {Object.keys(cc).map((k) => (
            <CheckRow key={k} on={f.colors.includes(k)} label={k} meta={cc[k]} onClick={() => set('colors', toggle(f.colors, k))}>
              <i className="sw" style={{ background: HEX[k] || 'transparent' }} />
            </CheckRow>
          ))}
        </div>
      )}
      <div>
        <div className="label">Цена, ₽</div>
        <div className="price-in">
          <input inputMode="numeric" aria-label="Цена от" value={f.min} placeholder={prices.length ? 'от ' + fmt(Math.min(...prices)) : 'от'}
            onChange={(e) => set('min', e.target.value.replace(/\D/g, ''))} />
          <input inputMode="numeric" aria-label="Цена до" value={f.max} placeholder={prices.length ? 'до ' + fmt(Math.max(...prices)) : 'до'}
            onChange={(e) => set('max', e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <div className="flt-apply">
        <button type="button" className="btn btn-primary" onClick={onClose}>Показать {shown} {plural(shown, THINGS)}</button>
      </div>
    </aside>
  );
}

const SORTS = [['match', 'По соответствию'], ['priceAsc', 'Дешевле'], ['priceDesc', 'Дороже'], ['usual', 'Ниже обычной']];
const VIEWS = [['grid', 'Карточки'], ['table', 'Таблица'], ['board', 'Доска']];
const THEMES = [[false, 'Светлая'], [true, 'Тёмная']];

export function Results({ run }) {
  const app = useApp();
  const key = runKey(run);
  const [f, setF] = useState(emptyFilters);
  const [sort, setSort] = useState('match');
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [progress, setProgress] = useState({});
  const [showOther, setShowOther] = useState(false);
  const types = useMemo(() => detectTypes(run.q), [run.q]);

  const entry = app.results[key];
  const missing = run.stores.filter((n) => !entry?.stores?.[n]);
  const loading = missing.length > 0;

  // Запрашиваем магазины, по которым ещё нет ответа; каждый ответ сразу появляется на экране загрузки.
  const { setStoreResult, setLastRun, learnBrands } = app;
  const missingKey = missing.join('|');
  useEffect(() => {
    if (!missingKey) return undefined;
    const ctrl = new AbortController();
    missingKey.split('|').forEach((name, i) => {
      searchOne(run, name, ctrl.signal, i, (p) => { if (!ctrl.signal.aborted) setProgress((st) => ({ ...st, [name]: p })); })
        .then((res) => {
          if (ctrl.signal.aborted) return;
          if (res.brands && res.brands.length) learnBrands(res.brands);
          const { brands: _b, ...rest } = res;
          setStoreResult(key, name, rest);
        })
        .catch(() => { /* отменено */ });
    });
    return () => ctrl.abort();
    // missingKey меняется по мере ответов, но запрос уже в пути — перезапускать его не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading]);

  // Для страницы вещи запоминаем текущий поиск (в т.ч. открытый по ссылке).
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
  const baseSort = sort === 'usual' ? 'match' : sort;
  const { base, list, hidden, hiddenTypes, hiddenGenders } = useMemo(
    () => getResults(items, run.crit, f, baseSort, { types, showOther }),
    [items, run.crit, f, baseSort, types, showOther],
  );

  // История цены каждой вещи: бейдж «к обычной» и спарклайн за 30 дней.
  const at = entry?.at ? new Date(entry.at).getTime() : Date.now();
  const hist = useHistories(base.map((x) => x.p), at);
  const stat = useMemo(() => {
    const out = {};
    for (const { p } of base) {
      const pts = hist(p, at);
      const st = priceStats(pts, 90);
      out[p.id] = { st, badge: changeBadge(st), spark: sparkline(pts) };
    }
    return out;
  }, [base, hist, at]);

  if (loading) return <Loading run={run} entry={entry} progress={progress} />;

  const va = (p) => (stat[p.id]?.st?.known ? stat[p.id].st.va : Infinity);
  const shown = sort === 'usual' ? list.slice().sort((x, y) => va(x.p) - va(y.p) || y.m.score - x.m.score) : list;
  const minP = shown.length ? Math.min(...shown.map((x) => x.p.price)) : 0;
  const bestId = shown.find((x) => x.p.price === minP)?.p.id;

  const checked = whenStr(entry.at);
  const label = (p) => p.store.toUpperCase() + ' · ' + ddmm(entry.at);
  const failed = run.stores.map((n) => ({ name: n, ...entry.stores[n] })).filter((r) => r.status !== 'ok');
  const full = base.filter((x) => x.m.score === 100).length;
  const view = ['table', 'board'].includes(app.prefs.view) ? app.prefs.view : 'grid';
  const dark = app.prefs.tableDark !== false;
  const isSaved = app.saved.some((x) => x.q === run.q && x.ds === run.ds);
  const open = (id) => navigate('/product/' + encodeURIComponent(id) + '?from=results');
  const d = new Date(entry.at);
  const summary = base.length + ' ' + plural(base.length, THINGS) + ' · ' + run.stores.length + ' ' + plural(run.stores.length, ['магазин', 'магазина', 'магазинов'])
    + ' · ' + full + ' подходят полностью · проверено ' + ddmm(d) + ', ' + d.toTimeString().slice(0, 5);

  return (
    <div className="page w-results">
      <div className="res-head">
        <div>
          <div className="label">{summary}</div>
          <h1 className="h1">«{run.q.replace(/(\d) (\d)/g, '$1 $2')}»</h1>
          <div className="badges">
            <Badges items={criteriaChips(run.crit, run.stores, run.ds)} />
            <button type="button" className="link small" style={{ marginLeft: 8, fontWeight: 600 }} onClick={() => { app.setQuery(run.q); navigate('/'); }}>Изменить</button>
            <button type="button" className="link small" style={{ fontWeight: 600 }} onClick={() => app.runSearch(run)}>Отмерить заново</button>
          </div>
        </div>
        <div className="acts">
          <button type="button" className="btn btn-secondary" aria-pressed={isSaved}
            title={isSaved ? 'Поиск в «Моих поисках». Нажмите, чтобы убрать' : undefined}
            onClick={() => {
              const saved = app.saved.find((x) => x.q === run.q && x.ds === run.ds);
              if (saved) { app.deleteSearch(saved.id); app.notify('Поиск убран из «Моих поисков»'); }
              else { app.saveSearch({ ...run, at: entry.at }); app.notify('Поиск сохранён в «Мои поиски»'); }
            }}>
            {isSaved ? 'Поиск сохранён' : 'Сохранить поиск'}
          </button>
          <button type="button" className="btn btn-moss" onClick={() => setExportOpen(true)} disabled={!base.length}>
            <Icon name="sheet" size={18} />Выгрузить в Google Sheets
          </button>
        </div>
      </div>

      <div className="res-layout">
        <Filters base={base} ds={run.ds} f={f} setF={setF} open={filtersOpen} onClose={() => setFiltersOpen(false)} shown={list.length} />
        <section style={{ minWidth: 0 }}>
          {failed.map((r) => (
            <div key={r.name} className="note" role="status">
              <b>{r.name}</b>
              <span>{NOTE_PREFIX[r.status] ?? 'ошибка: '}{r.error || 'неизвестная ошибка'}</span>
              {r.status === 'noext'
                ? <a className="push" href="#/extension">Установить расширение</a>
                : r.searchUrl && <a className="push" href={r.searchUrl} target="_blank" rel="noopener noreferrer">Искать на сайте магазина ↗</a>}
            </div>
          ))}
          {hidden > 0 && (
            <div className="note" role="status">
              <span>
                {(() => {
                  const why = [hiddenTypes.length ? 'другого типа (' + hiddenTypes.join(', ') + ')' : '', hiddenGenders.join(', ')].filter(Boolean).join('; ');
                  return showOther
                    ? <>Показаны и неподходящие вещи ({hidden}: {why}).</>
                    : <>Скрыто {hidden} {plural(hidden, THINGS)}: {why} — магазин нашёл их по похожим словам.</>;
                })()}
              </span>
              <button type="button" className="link push" onClick={() => setShowOther(!showOther)}>{showOther ? 'Скрыть' : 'Показать'}</button>
            </div>
          )}
          <div className="toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" className="btn btn-secondary flt-toggle" aria-expanded={filtersOpen} aria-controls="filters" onClick={() => setFiltersOpen(!filtersOpen)}>
                <Icon name="sliders" size={16} />Фильтры{hasFilters(f) ? ' •' : ''}
              </button>
              <div className="count">Показано <b>{shown.length}</b> из <span>{base.length}</span></div>
            </div>
            <div className="toolbar-r">
              <Segmented label="Сортировка" options={SORTS} value={sort} onChange={setSort} />
              <Segmented label="Вид" options={VIEWS} value={view} onChange={(v) => app.setPref('view', v)} />
              {view === 'table' && <Segmented label="Тема таблицы" options={THEMES} value={dark} onChange={(v) => app.setPref('tableDark', v)} />}
            </div>
          </div>

          {!base.length && (
            <div className="empty-state">
              <div className="ruler mini" aria-hidden="true" />
              <div className="h1">Семь раз отмерь — один раз купи.</div>
              <div className="muted">{failed.length === run.stores.length ? 'Ни один магазин не ответил.' : 'В выбранных магазинах ничего не нашлось под этот запрос.'}</div>
              <button type="button" className="btn btn-primary" onClick={() => { app.setQuery(run.q); navigate('/'); }}>Изменить запрос</button>
            </div>
          )}
          {!!base.length && !shown.length && (
            <div className="empty-state">
              <div className="ruler mini" aria-hidden="true" />
              <div className="h1">Семь раз отмерь — один раз купи.</div>
              <div className="muted">Под эти фильтры ничего не подошло.</div>
              <button type="button" className="btn btn-primary" onClick={() => setF(emptyFilters())}>Сбросить фильтры</button>
            </div>
          )}
          {!!shown.length && view === 'grid' && (
            <div className="cards">
              {shown.map(({ p, m }) => (
                <ProductCard key={p.id} p={p} m={m} s={stat[p.id]} best={p.id === bestId} checked={checked} label={label(p)}
                  fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p)} />
              ))}
            </div>
          )}
          {!!shown.length && view === 'board' && (
            <div className="board">
              {shown.map(({ p }, i) => (
                <BoardCard key={p.id} i={i} p={p} s={stat[p.id]} best={p.id === bestId} label={label(p)}
                  fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p)} />
              ))}
            </div>
          )}
          {!!shown.length && view === 'table' && (
            <ResultsTable rows={shown.map((x) => ({ ...x, s: stat[x.p.id], best: x.p.id === bestId }))} dark={dark} favs={app.favs}
              checked={checked} onOpen={open} onFav={(p) => app.toggleFav(p)} />
          )}
        </section>
      </div>

      {exportOpen && <ExportModal kind="results" query={run.q} list={shown} base={base} checked={checked} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
