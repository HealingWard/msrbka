import { useEffect, useMemo, useRef, useState } from 'react';
import { ALLSIZES, DS_CAT, HEX } from '../data/catalog.js';
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
const PAGE = 60; // вещей на экране за раз — выдача бывает на тысячи вещей
const STATUS_TEXT = { blocked: 'магазин не пустил', error: 'ошибка', empty: 'вещи не распознаны', noext: 'нужно расширение' };
const NOTE_PREFIX = { blocked: 'не удалось получить выдачу: ', empty: '', error: 'ошибка: ', noext: '' };

function progressText(p) {
  if (!p) return 'сравниваю…';
  const pre = p.part ? '«' + p.query + '» ' + p.part + '/' + p.parts + ' · ' : '';
  if (p.stage === 'human') return pre + 'пройдите проверку «не робот» в окне браузера';
  if (p.stage === 'details') return pre + 'нашёл ' + p.found + ' · размеры ' + p.done + '/' + p.total;
  if (p.stage === 'search' && p.page) return pre + 'страница ' + p.page + (p.pages ? ' из ' + p.pages : '') + ' · найдено ' + fmt(p.found) + (p.total > p.found ? ' из ~' + fmt(p.total) : '');
  return pre + 'открываю выдачу…';
}
// Доля готовности магазина для ленты-прогресса.
function storeShare(r, p) {
  if (r) return 1;
  if (!p) return 0.1;
  const part = p.parts ? (p.part - 1) / p.parts : 0;
  const inPart = p.stage === 'details' && p.total ? 0.85 + (0.15 * p.done) / p.total
    : p.stage === 'search' && p.page ? (p.pages ? 0.1 + (0.75 * p.page) / p.pages : Math.min(0.8, 0.15 + 0.05 * p.page)) : 0.1;
  return Math.min(0.95, part + inPart / (p.parts || 1));
}

function Loading({ run, entry, progress, onStop, stopping }) {
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
      {onStop && (
        <div style={{ marginTop: 24, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={stopping} onClick={onStop}>{stopping ? 'Останавливаю…' : 'Остановить и показать найденное'}</button>
          <span className="small muted">Ищу по всей выдаче магазина, страница за страницей: большая выдача может занять несколько минут.</span>
        </div>
      )}
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
          <input inputMode="numeric" aria-label="Цена от" value={f.min} placeholder={prices.length ? 'от ' + fmt(prices.reduce((a, b) => Math.min(a, b), Infinity)) : 'от'}
            onChange={(e) => set('min', e.target.value.replace(/\D/g, ''))} />
          <input inputMode="numeric" aria-label="Цена до" value={f.max} placeholder={prices.length ? 'до ' + fmt(prices.reduce((a, b) => Math.max(a, b), 0)) : 'до'}
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
  // Поиск без текста («Все вещи: …») тип вещи не ограничивает.
  const types = useMemo(() => (run.browse ? [] : detectTypes(run.q)), [run.q, run.browse]);

  const entry = app.results[key];
  // Пока не прочитана сохранённая выдача, поиск не запускаем — иначе после перезагрузки искали бы заново.
  const ready = app.resultsReady;
  const missing = ready ? run.stores.filter((n) => !entry?.stores?.[n]) : run.stores;
  const loading = !ready || missing.length > 0;
  // «Остановить и показать найденное»: магазины отдают уже найденное.
  const stopRef = useRef(null);
  const [stopping, setStopping] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Запрашиваем магазины, по которым ещё нет ответа; каждый ответ сразу появляется на экране загрузки.
  const { setStoreResult, setLastRun, learnBrands, learnCatBrands } = app;
  const missingKey = missing.join('|');
  useEffect(() => {
    if (!ready || !missingKey) return undefined;
    const ctrl = new AbortController();
    const stopCtrl = new AbortController();
    stopRef.current = stopCtrl;
    setStopping(false);
    missingKey.split('|').forEach((name, i) => {
      searchOne(run, name, ctrl.signal, i, (p) => { if (!ctrl.signal.aborted) setProgress((st) => ({ ...st, [name]: p })); }, stopCtrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          if (res.brands && res.brands.length) learnBrands(res.brands);
          // Бренды из фильтра выдачи — бренды категории этого поиска (тапочки → обувь).
          if (res.facetBrands && res.facetBrands.length && DS_CAT[run.ds]) learnCatBrands(DS_CAT[run.ds], res.facetBrands);
          const { brands: _b, facetBrands: _f, ...rest } = res;
          setStoreResult(key, name, rest);
        })
        .catch(() => { /* отменено */ });
    });
    return () => ctrl.abort();
    // missingKey меняется по мере ответов, но запрос уже в пути — перезапускать его не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loading, ready]);
  // Новая выдача, фильтры или сортировка — снова с первой порции.
  useEffect(() => { setLimit(PAGE); }, [key, f, sort, showOther]);

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
  const { base, list, hidden, hiddenWhy } = useMemo(
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

  if (loading) return <Loading run={run} entry={entry} progress={progress} stopping={stopping}
    onStop={ready && missing.length ? () => { setStopping(true); stopRef.current?.abort(); } : null} />;

  // «Ниже обычной» — только по нашей истории цены. Скидке магазина к «старой» цене не верим: её нельзя проверить.
  const va = (p) => (stat[p.id]?.st?.known ? stat[p.id].st.va : Infinity);
  const canUsual = base.some(({ p }) => Number.isFinite(va(p)));
  const sortKey = sort === 'usual' && !canUsual ? 'match' : sort;
  const shown = sortKey === 'usual' ? list.slice().sort((x, y) => va(x.p) - va(y.p) || y.m.score - x.m.score) : list;
  const minP = shown.reduce((m, x) => Math.min(m, x.p.price), shown.length ? Infinity : 0);
  const page = shown.slice(0, limit);
  const partial = run.stores.filter((n) => entry.stores[n]?.partial).map((n) => ({ name: n, ...entry.stores[n] }));
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
            <button type="button" className="link small" style={{ marginLeft: 8, fontWeight: 600 }} onClick={() => { app.setQuery(run.browse ? '' : run.q); navigate('/'); }}>Изменить</button>
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
          {!showOther && run.stores.map((n) => {
            const r = entry.stores[n];
            const total = r?.status === 'ok' ? (r.items || []).length : 0;
            if (!total || base.some(({ p }) => p.store === n)) return null;
            return (
              <div key={'all-hidden-' + n} className="note" role="status">
                <b>{n}</b>
                <span>нашлось {total} {plural(total, THINGS)}, но ни одна не подошла по запросу — причины ниже.</span>
                {r.searchUrl && <a className="push" href={r.searchUrl} target="_blank" rel="noopener noreferrer">Открыть выдачу магазина ↗</a>}
              </div>
            );
          })}
          {partial.map((r) => (
            <div key={'partial-' + r.name} className="note" role="status">
              <b>{r.name}</b>
              <span>поиск остановлен: найдено {fmt((r.items || []).length)} {plural((r.items || []).length, THINGS)}{r.storeTotal > (r.items || []).length ? ' из примерно ' + fmt(r.storeTotal) + ' в магазине' : ''}.</span>
              <button type="button" className="link push" onClick={() => app.runSearch(run)}>Искать заново целиком</button>
            </div>
          ))}
          {hidden > 0 && (
            <div className="note" role="status">
              <span>
                {showOther
                  ? <>Показаны и вещи, которые не подходят или не подтверждены: {hiddenWhy.join('; ')}.</>
                  : <>Скрыто {hidden} {plural(hidden, THINGS)}, которые не подходят или не подтверждены магазином: {hiddenWhy.join('; ')}.</>}
              </span>
              <button type="button" className="link push" onClick={() => setShowOther(!showOther)}>{showOther ? 'Скрыть' : 'Показать'}</button>
            </div>
          )}
          <div className="toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" className="btn btn-secondary flt-toggle" aria-expanded={filtersOpen} aria-controls="filters" onClick={() => setFiltersOpen(!filtersOpen)}>
                <Icon name="sliders" size={16} />Фильтры{hasFilters(f) ? ' •' : ''}
              </button>
              <div className="count">Подходят <b>{fmt(shown.length)}</b> из <span>{fmt(base.length)}</span></div>
            </div>
            <div className="toolbar-r">
              <Segmented label="Сортировка" options={canUsual ? SORTS : SORTS.filter(([k]) => k !== 'usual')} value={sortKey} onChange={setSort} />
              <Segmented label="Вид" options={VIEWS} value={view} onChange={(v) => app.setPref('view', v)} />
              {view === 'table' && <Segmented label="Тема таблицы" options={THEMES} value={dark} onChange={(v) => app.setPref('tableDark', v)} />}
            </div>
          </div>

          {!base.length && (
            <div className="empty-state">
              <div className="ruler mini" aria-hidden="true" />
              <div className="h1">Семь раз отмерь — один раз купи.</div>
              <div className="muted">{failed.length === run.stores.length ? 'Ни один магазин не ответил.' : 'В выбранных магазинах ничего не нашлось под этот запрос.'}</div>
              <button type="button" className="btn btn-primary" onClick={() => { app.setQuery(run.browse ? '' : run.q); navigate('/'); }}>Изменить запрос</button>
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
              {page.map(({ p, m }) => (
                <ProductCard key={p.id} p={p} m={m} s={stat[p.id]} best={p.id === bestId} checked={checked} label={label(p)}
                  fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p)} />
              ))}
            </div>
          )}
          {!!shown.length && view === 'board' && (
            <div className="board">
              {page.map(({ p }, i) => (
                <BoardCard key={p.id} i={i} p={p} s={stat[p.id]} best={p.id === bestId} label={label(p)}
                  fav={!!app.favs[p.id]} onOpen={() => open(p.id)} onFav={() => app.toggleFav(p)} />
              ))}
            </div>
          )}
          {!!shown.length && view === 'table' && (
            <ResultsTable rows={page.map((x) => ({ ...x, s: stat[x.p.id], best: x.p.id === bestId }))} dark={dark} favs={app.favs}
              checked={checked} onOpen={open} onFav={(p) => app.toggleFav(p)} />
          )}
          {shown.length > page.length && (
            <div className="more-row">
              <button type="button" className="btn btn-secondary" onClick={() => setLimit((n) => n + PAGE)}>
                Показать ещё {Math.min(PAGE, shown.length - page.length)}
              </button>
              {shown.length - page.length > PAGE && (
                <button type="button" className="link small" onClick={() => setLimit(shown.length)}>Показать все {fmt(shown.length)}</button>
              )}
              <span className="small muted">показано {fmt(page.length)} из {fmt(shown.length)}</span>
            </div>
          )}
        </section>
      </div>

      {exportOpen && <ExportModal kind="results" query={run.q} list={shown} base={base} checked={checked} onClose={() => setExportOpen(false)} />}
    </div>
  );
}
