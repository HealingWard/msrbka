import { useMemo } from 'react';
import { CATS, CAT_KEY, STORE_NAMES, brandsForCats } from '../data/catalog.js';
import { cap, rub, pct, toggle } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { detectTypes } from '../lib/search.js';
import { priceAt } from '../lib/history.js';
import { changePct, deltaBadge, goalProgress, itemStatus, priceStats } from '../lib/pricing.js';
import { useHistories, withAdded } from '../lib/useHistories.js';
import { startSearch } from '../lib/startSearch.js';
import { isLive } from '../lib/config.js';
import { DEMO_BY_ID, DEMO_ITEMS } from '../lib/items.js';
import { isSoldOut } from '../lib/product.js';
import { Icon } from '../components/Icon.jsx';
import { BrandPicker, Chip, PriceChange } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const GENDERS = [['women', 'Женщинам'], ['men', 'Мужчинам'], ['any', 'Всем']];
const kindOf = (p) => p.kind || detectTypes(p.title)[0] || '';
const openItem = (id, from = 'home') => navigate('/product/' + encodeURIComponent(id) + '?from=' + from);

/** Вещи, за которыми следите: статус, прогресс до цели. */
function useFollowRows(app) {
  const entries = useMemo(() => Object.entries(app.favs)
    .map(([id, fv]) => ({ id, fv, item: fv.item || DEMO_BY_ID[id] }))
    .filter((x) => x.item), [app.favs]);
  const hist = useHistories(entries.map((x) => x.item));
  return entries.map(({ id, fv, item }) => {
    const pts = withAdded(hist(item, fv.checkedAt ? new Date(fv.checkedAt).getTime() : undefined), fv);
    const st = priceStats(pts, 90);
    const cur = item.price;
    const was = fv.priceAtAdd || priceAt(pts, new Date(fv.addedAt).getTime()) || cur;
    const tg = fv.target || null;
    return { id, item, cur, was, tg, st, soldOut: isSoldOut(item, fv), dl: changePct(cur, was), status: itemStatus(cur, tg, st), prog: goalProgress(was, cur, tg) };
  });
}

/** Находки дня: вещи из последних поисков (не из списков), которые сильнее всего ниже обычной цены. */
function useFinds(app) {
  const pool = useMemo(() => {
    const seen = new Set();
    const out = [];
    const runs = Object.values(app.results).sort((a, b) => new Date(b.at) - new Date(a.at));
    for (const e of runs) {
      for (const st of Object.values(e.stores || {})) {
        for (const p of st.items || []) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      }
    }
    if (!out.length && !isLive()) return DEMO_ITEMS;
    return out.slice(0, 300);
  }, [app.results]);
  const hist = useHistories(pool);
  return pool
    .filter((p) => !app.favs[p.id])
    .map((p) => {
      const st = priceStats(hist(p), 90);
      if (st && st.known) return { p, score: st.va, badge: deltaBadge(st.va) };
      // История ещё копится — берём скидку магазина к старой цене.
      if (p.old && p.old > p.price) { const d = -Math.round((1 - p.price / p.old) * 100); return { p, score: d, badge: deltaBadge(d) }; }
      return null;
    })
    .filter((x) => x && x.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);
}

export function Home() {
  const app = useApp();
  const { prefs, setPref, query, setQuery } = app;
  const { selStores, selBrands, cats } = prefs;
  const rows = useFollowRows(app);
  const finds = useFinds(app);

  // Вещь, которой нет в наличии, купить нельзя — в «Пора покупать» её не показываем.
  const pora = rows.filter((r) => r.status.k === 'pora' && !r.soldOut);
  const wait = rows.filter((r) => r.tg && r.cur > r.tg);
  const brandsLabel = !selBrands.length ? 'любые' : selBrands.length === 1 ? selBrands[0] : selBrands[0] + ' +' + (selBrands.length - 1);
  const go = () => startSearch(app, query);

  return (
    <div className="page w-home">
      <div className="home-intro">
        <h1 className="display">Что будем отмерять?</h1>
        <p className="sub">Опишите вещь своими словами. Сравню цены в выбранных магазинах и подскажу, когда покупать.</p>
        <form className="qbox" role="search" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <Icon name="search" size={24} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Например, бежевый тренч до 25 000" aria-label="Что ищем" autoFocus />
          <button type="submit" className="btn btn-primary">Найти</button>
        </form>
        <div className="opt-row">
          <div className="chip-row">
            <span className="label">Где искать</span>
            {STORE_NAMES.map((n) => {
              const on = selStores.includes(n);
              return <Chip key={n} on={on} onClick={() => setPref('selStores', (l) => toggle(l, n))}>{on ? '✓ ' : ''}{n}</Chip>;
            })}
          </div>
          {/* Бренды только выбранных категорий: обувь — бренды обуви, аксессуары — аксессуаров. */}
          <BrandPicker brands={brandsForCats(cats.map((c) => CAT_KEY[c]), selBrands)} selected={selBrands} label={brandsLabel} onAdd={app.learnBrands}
            onToggle={(b) => setPref('selBrands', (list) => toggle(list, b))}
            footer={() => (
              <div className="dd-foot">
                <span className="muted">{selBrands.length ? 'Выбрано: ' + selBrands.length : 'Не выбрано — любые'}</span>
                <button type="button" onClick={() => setPref('selBrands', [])}>Сбросить</button>
              </div>
            )} />
        </div>
        <div className="chip-row" style={{ marginTop: 16 }}>
          <span className="label">Категории</span>
          {CATS.map((c) => <Chip key={c} on={cats.includes(c)} onClick={() => setPref('cats', (list) => toggle(list, c))}>{c}</Chip>)}
        </div>
        <div className="chip-row" style={{ marginTop: 16 }}>
          <span className="label">Для кого</span>
          {GENDERS.map(([k, l]) => <Chip key={k} on={(prefs.gender || 'any') === k} onClick={() => setPref('gender', k)}>{l}</Chip>)}
        </div>
        <div className="small home-hint">
          {selStores.length ? 'Ищем в: ' + selStores.join(', ') + '. Enter — найти.' : 'Отметьте магазины — или спрошу после запроса.'}
          {isLive() && <> Stockmann и Lamoda — через <a href="#/extension">расширение для Chrome</a>.</>}
        </div>
      </div>

      <div className="ruler home-divider" aria-hidden="true" />

      <div className="blocks">
        <section className="blk" aria-labelledby="pora-h">
          <div className="blk-head">
            <Icon name="scissors" size={20} className="c-drop" />
            <h2 className="h2" id="pora-h">Пора покупать</h2>
            <span className="n">{pora.length}</span>
          </div>
          <div className="blk-rows">
            {pora.slice(0, 3).map((r) => {
              const reached = r.tg && r.cur <= r.tg;
              const n = reached ? r.dl : r.st?.va || 0;
              const kind = kindOf(r.item);
              const what = (kind ? cap(kind) + ' ' : '') + (r.item.brand || (kind ? '' : r.item.title)) + ' в ' + r.item.store;
              const ctx = reached ? 'цель ' + rub(r.tg) + ' достигнута' : r.st?.isMin ? 'минимум за 90 дней' : 'ниже обычной цены';
              return (
                <div key={r.id} className="blk-row">
                  <b style={{ fontWeight: 600 }}>{what.trim()}</b>: <span className={'chg-inline ' + (n < 0 ? 'drop' : n > 0 ? 'rise' : '')}>{pct(n)}</span>, {ctx}.{' '}
                  <button type="button" className="link" style={{ fontWeight: 400 }} onClick={() => openItem(r.id, 'lists')}>Посмотреть</button>
                </div>
              );
            })}
            {!pora.length && <div className="blk-empty">Пока рано. Когда цена опустится до цели или ниже обычной, вещь появится здесь.</div>}
          </div>
        </section>

        <section className="blk" aria-labelledby="wait-h">
          <div className="blk-head">
            <Icon name="hourglass" size={20} className="c-muted" />
            <h2 className="h2" id="wait-h">Ждём</h2>
            <span className="n">{wait.length}</span>
          </div>
          <div className="blk-rows">
            {wait.slice(0, 3).map((r) => (
              <button type="button" key={r.id} className="blk-row clickable btnrow" onClick={() => openItem(r.id, 'lists')}>
                <span className="t">{r.item.brand ? r.item.brand + ' · ' : ''}{r.item.title}</span>
                <span className="bar4"><i style={{ width: Math.round(r.prog * 100) + '%' }} /></span>
                <span className="meta">{r.soldOut && <span className="oos-tag">Нет в наличии</span>}ЦЕЛЬ {rub(r.tg)} · ОСТАЛОСЬ {rub(r.cur - r.tg)}</span>
              </button>
            ))}
            {!wait.length && <div className="blk-empty">Задайте цель на странице вещи — здесь появится, сколько осталось до неё.</div>}
          </div>
        </section>

        <section className="blk-moss" aria-label="Находки дня">
          <div className="blk-head" style={{ gap: 12 }}>
            <span className="tape-label">Находки дня</span>
            <span className="small" style={{ color: 'var(--on-moss-2)' }}>ниже обычной сильнее всего</span>
          </div>
          <div className="blk-rows">
            {finds.map(({ p, badge }) => (
              <div key={p.id} className="find" role="link" tabIndex={0} onClick={() => openItem(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') openItem(p.id); }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="label">{p.store}{p.brand ? ' · ' + p.brand : ''}</div>
                  <div className="t">{p.title}</div>
                </div>
                <div className="r">
                  <span className="price">{rub(p.price)}</span>
                  <PriceChange badge={badge} />
                </div>
              </div>
            ))}
            {!finds.length && (
              <div className="find" style={{ cursor: 'default', color: 'var(--on-moss-2)', fontSize: 15 }}>
                Здесь появятся вещи из ваших поисков, которые сейчас дешевле обычного.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
