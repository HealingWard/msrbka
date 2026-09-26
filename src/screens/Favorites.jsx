import { useState } from 'react';
import { PRODUCT_BY_ID } from '../data/catalog.js';
import { PRODUCTS_F, countStr, dayLabel, daysAgo, plural, rub, signedPct } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { HISTORY_DAYS, priceDaysAgo, priceHistory, sparkPath } from '../lib/priceHistory.js';
import { useApp } from '../state.jsx';

export function Favorites() {
  const app = useApp();
  const { colls } = app;
  const [active, setActive] = useState('all');
  const [newName, setNewName] = useState(null);

  const rowsAll = Object.entries(app.favs)
    .filter(([id]) => PRODUCT_BY_ID[id])
    .sort((a, b) => new Date(b[1].addedAt) - new Date(a[1].addedAt))
    .map(([id, fv]) => {
      const p = PRODUCT_BY_ID[id];
      const days = Math.min(daysAgo(fv.addedAt), HISTORY_DAYS - 1);
      const was = priceDaysAgo(p, days);
      const dl = Math.round(((p.price - was) / was) * 100);
      return { id, p, coll: colls.some((c) => c.id === fv.coll) ? fv.coll : '', days, was, dl, spark: sparkPath(priceHistory(p).slice(HISTORY_DAYS - 1 - days)) };
    });

  const activeValid = active === 'all' || active === 'none' || colls.some((c) => c.id === active) ? active : 'all';
  const rows = rowsAll.filter((r) => activeValid === 'all' || (activeValid === 'none' ? !r.coll : r.coll === activeValid));
  const cheaper = rowsAll.filter((r) => r.dl < 0).length;
  const activeName = activeValid === 'all' ? 'Все товары' : activeValid === 'none' ? 'Без подборки' : colls.find((c) => c.id === activeValid).name;
  const rc = rows.filter((r) => r.dl < 0).length;

  const create = () => {
    const nm = (newName || '').trim();
    setNewName(null);
    if (!nm) return;
    setActive(app.addColl(nm));
  };

  const collItem = (id, name, count, removable) => (
    <div key={id} className="coll-wrap">
      <button type="button" className={'coll' + (activeValid === id ? ' on' : '')} aria-pressed={activeValid === id} onClick={() => setActive(id)}>
        <span>{name}</span><span className="n">{count}</span>
      </button>
      {removable && (
        <button type="button" className="coll-del" title="Удалить подборку" aria-label={'Удалить подборку «' + name + '»'}
          onClick={() => { if (window.confirm('Удалить подборку «' + name + '»? Товары останутся в избранном.')) { app.removeColl(id); setActive('all'); } }}>✕</button>
      )}
    </div>
  );

  return (
    <div className="page favorites">
      <div className="page-head">
        <div>
          <h1>Избранное</h1>
          <p>
            {countStr(rowsAll.length, PRODUCTS_F)} · {colls.length} {plural(colls.length, ['подборка', 'подборки', 'подборок'])} · {cheaper} подешевели с момента добавления
          </p>
        </div>
      </div>
      <div className="fav-layout">
        <aside className="colls">
          <div className="mono-label" style={{ letterSpacing: '.06em', marginBottom: 8 }}>Подборки</div>
          {collItem('all', 'Все товары', rowsAll.length)}
          {colls.map((c) => collItem(c.id, c.name, rowsAll.filter((r) => r.coll === c.id).length, true))}
          {collItem('none', 'Без подборки', rowsAll.filter((r) => !r.coll).length)}
          {newName != null ? (
            <div className="new-coll">
              <input value={newName} autoFocus placeholder="Название подборки" aria-label="Название подборки"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setNewName(null); }} />
              <button type="button" onClick={create}>OK</button>
            </div>
          ) : (
            <button type="button" className="link-btn add-coll" style={{ fontSize: 13.5 }} onClick={() => setNewName('')}>+ Новая подборка</button>
          )}
        </aside>
        <main style={{ minWidth: 0 }}>
          <div className="fav-main-head">
            <div className="title">{activeName}</div>
            <div className="stat">{rows.length ? rc + ' из ' + rows.length + ' подешевели · динамика с даты добавления' : ''}</div>
          </div>
          <div className="table-wrap">
            <div className="frow head">
              <span /><span>Товар</span><span>Магазин</span><span>При добавлении</span><span>Сейчас</span><span>Δ</span><span>Динамика</span><span>Подборка</span><span />
            </div>
            {rows.map((r) => {
              const open = () => navigate('/product/' + r.id + '?from=favorites');
              return (
                <div key={r.id} className="frow">
                  <button type="button" className="thumb lg" style={{ border: 'none', padding: 0 }} onClick={open} aria-label={'Открыть ' + r.p.title} />
                  <button type="button" className="title-link" onClick={open}>
                    <div className="brand" style={{ fontSize: 11 }}>{r.p.brand}</div>
                    <div className="t" style={{ marginTop: 2, lineHeight: 1.3 }}>{r.p.title}</div>
                  </button>
                  <span>{r.p.store}</span>
                  <div><div>{rub(r.was)}</div><div className="cell-sub">{r.days ? 'добавлен ' + dayLabel(r.days) : 'добавлен сегодня'}</div></div>
                  <div className={r.p.old ? 'sale-text' : ''} style={{ fontWeight: 600 }}>{rub(r.p.price)}</div>
                  <span style={{ fontWeight: 600, color: r.dl < 0 ? 'var(--acc)' : r.dl > 0 ? 'var(--ink)' : 'var(--ink3)' }}>{r.dl === 0 ? '0%' : signedPct(r.dl)}</span>
                  <svg viewBox="0 0 130 36" style={{ width: 130, height: 36, overflow: 'visible' }} aria-hidden="true">
                    <path d={r.spark} style={{ fill: 'none', stroke: r.dl < 0 ? 'var(--acc)' : 'var(--ink)', strokeWidth: 1.5, strokeLinejoin: 'round' }} />
                  </svg>
                  <select value={r.coll} onChange={(e) => app.setFavColl(r.id, e.target.value)} aria-label="Подборка">
                    <option value="">Без подборки</option>
                    {colls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" className="x-btn" title="Убрать из избранного" aria-label="Убрать из избранного" onClick={() => app.toggleFav(r.id)}>✕</button>
                </div>
              );
            })}
            {!rows.length && <div className="table-empty">В этой подборке пока пусто — добавляйте товары сердечком в выдаче.</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
