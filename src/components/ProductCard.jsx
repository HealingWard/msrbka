import { GLYPH } from '../lib/search.js';
import { productView } from '../lib/product.js';

const stop = (e) => e.stopPropagation();
const onKeyOpen = (open) => (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); };

export function ProductCard({ p, m, fav, onOpen, onFav, checked }) {
  const v = productView(p);
  return (
    <article className="card" onClick={onOpen} onKeyDown={onKeyOpen(onOpen)} tabIndex={0} aria-label={p.brand + ' — ' + p.title}>
      <div className="card-photo">
        <span className="photo-label">фото · {p.kind}</span>
        <div className="card-badges">
          <span className="badge">{p.store}</span>
          {v.hasOld && <span className="badge sale">{v.discStr}</span>}
        </div>
        <button type="button" className={'fav-btn' + (fav ? ' on' : '')} title={fav ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={fav} onClick={(e) => { stop(e); onFav(); }}>{fav ? '♥' : '♡'}</button>
        <div className="card-score badge dark">Соответствие {m.score}%</div>
      </div>
      <div className="card-body">
        <div>
          <div className="brand">{p.brand}</div>
          <div className="card-title">{p.title}</div>
        </div>
        <div className="price-line">
          <span className={'price' + (v.hasOld ? ' sale' : '')}>{v.priceStr}</span>
          {v.hasOld && <span className="old-price">{v.oldStr}</span>}
        </div>
        <div className="meta-line">
          <span className="rating">★ {v.rating}</span><span>{v.reviewsStr}</span>
          <span className={v.lowStock ? 'low-stock' : ''}>· {p.stock}</span>
        </div>
        <div className="kv">
          <span>Размеры</span><span>{v.sizesStr}</span>
          <span>Цвет</span><span className="inline-color"><i className="swatch sm" style={{ background: v.colorHex }} />{p.color}</span>
        </div>
        <div className="why">
          <div className="why-head">
            <span>Почему подходит</span>
            <div className="meter"><i style={{ width: m.score + '%' }} /></div>
          </div>
          {m.pills.length > 0 && (
            <div className="pills">
              {m.pills.map((x) => <span key={x.key} className={'pill ' + x.s}>{GLYPH[x.s]} {x.label}</span>)}
            </div>
          )}
          <div className="why-text">{m.summary}</div>
        </div>
        <div className="card-foot">
          <span>Проверено {checked}</span>
          <a href={v.url} target="_blank" rel="noopener noreferrer" onClick={stop}>{v.domain} ↗</a>
        </div>
      </div>
    </article>
  );
}

export function ProductTable({ items, favs, onOpen, onFav, checked }) {
  return (
    <div className="table-wrap">
      <div className="trow head">
        <span>Товар</span><span>Магазин</span><span>Цена</span><span>Рейтинг</span><span>Размеры</span>
        <span>Цвет</span><span>Наличие</span><span>Почему подходит</span><span />
      </div>
      {items.map(({ p, m }) => {
        const v = productView(p);
        const fav = !!favs[p.id];
        return (
          <div key={p.id} className="trow body" onClick={() => onOpen(p.id)} onKeyDown={onKeyOpen(() => onOpen(p.id))} tabIndex={0}>
            <div className="cell-product">
              <div className="thumb" />
              <div style={{ minWidth: 0 }}><div className="brand">{p.brand}</div><div style={{ marginTop: 2, lineHeight: 1.3 }}>{p.title}</div></div>
            </div>
            <span>{p.store}</span>
            <div>
              <div className={v.hasOld ? 'sale-text' : ''} style={{ fontWeight: 600 }}>{v.priceStr}</div>
              {v.hasOld && <div className="cell-sub"><s>{v.oldStr}</s> <span className="sale-text">{v.discStr}</span></div>}
            </div>
            <div><div>★ {v.rating}</div><div className="cell-sub">{v.reviewsStr}</div></div>
            <span style={{ fontSize: 12.5 }}>{v.sizesStr}</span>
            <span className="inline-color"><i className="swatch sm" style={{ background: v.colorHex }} />{p.color}</span>
            <div><div className={v.lowStock ? 'low-stock' : ''}>{p.stock}</div><div className="cell-sub">{checked}</div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600, minWidth: 38 }}>{m.score}%</span>
              <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-soft)' }}>{m.summary}</span>
            </div>
            <div className="row-actions">
              <a className="sq-btn" href={v.url} target="_blank" rel="noopener noreferrer" onClick={stop} title="Открыть в магазине">↗</a>
              <button type="button" className={'sq-btn' + (fav ? ' on' : '')} aria-pressed={fav} title={fav ? 'Убрать из избранного' : 'В избранное'}
                onClick={(e) => { stop(e); onFav(p.id); }}>{fav ? '♥' : '♡'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
