import { useState } from 'react';
import { GLYPH } from '../lib/search.js';
import { productView } from '../lib/product.js';

const stop = (e) => e.stopPropagation();
const onKeyOpen = (open) => (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); };

/** Фото товара; если его нет или оно не загрузилось — штриховка-заглушка из дизайна. */
export function Photo({ src, label, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img className={'photo-img ' + className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  }
  return label ? <span className="photo-label">{label}</span> : null;
}

export function ProductCard({ p, m, fav, onOpen, onFav, checked }) {
  const v = productView(p);
  return (
    <article className="card" onClick={onOpen} onKeyDown={onKeyOpen(onOpen)} tabIndex={0} aria-label={(p.brand ? p.brand + ' — ' : '') + p.title}>
      <div className="card-photo">
        <Photo src={p.image} label={'фото' + (p.kind ? ' · ' + p.kind : '')} />
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
          {p.brand && <div className="brand">{p.brand}</div>}
          <div className="card-title">{p.title}</div>
        </div>
        <div className="price-line">
          <span className={'price' + (v.hasOld ? ' sale' : '')}>{v.priceStr}</span>
          {v.hasOld && <span className="old-price">{v.oldStr}</span>}
        </div>
        {(v.rating || v.stock) && (
          <div className="meta-line">
            {v.rating && <span className="rating">★ {v.rating}</span>}
            {v.reviewsStr && <span>{v.reviewsStr}</span>}
            {v.stock && <span className={v.lowStock ? 'low-stock' : ''}>{v.rating ? '· ' : ''}{v.stock}</span>}
          </div>
        )}
        <div className="kv">
          <span>Размеры</span><span className={p.sizes && p.sizes.length ? '' : 'muted'}>{v.sizesStr}</span>
          <span>Цвет</span>
          <span className={'inline-color' + (p.color ? '' : ' muted')}>{v.colorHex && <i className="swatch sm" style={{ background: v.colorHex }} />}{v.colorStr}</span>
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
              <div className="thumb"><Photo src={p.image} /></div>
              <div style={{ minWidth: 0 }}>{p.brand && <div className="brand">{p.brand}</div>}<div style={{ marginTop: 2, lineHeight: 1.3 }}>{p.title}</div></div>
            </div>
            <span>{p.store}</span>
            <div>
              <div className={v.hasOld ? 'sale-text' : ''} style={{ fontWeight: 600 }}>{v.priceStr}</div>
              {v.hasOld && <div className="cell-sub"><s>{v.oldStr}</s> <span className="sale-text">{v.discStr}</span></div>}
            </div>
            <div>{v.rating ? <><div>★ {v.rating}</div><div className="cell-sub">{v.reviewsStr}</div></> : <span className="muted">—</span>}</div>
            <span style={{ fontSize: 12.5 }} className={p.sizes && p.sizes.length ? '' : 'muted'}>{p.sizes && p.sizes.length ? v.sizesStr : '—'}</span>
            <span className={'inline-color' + (p.color ? '' : ' muted')}>{v.colorHex && <i className="swatch sm" style={{ background: v.colorHex }} />}{p.color || '—'}</span>
            <div><div className={v.lowStock ? 'low-stock' : ''}>{v.stock || <span className="muted">—</span>}</div><div className="cell-sub">{checked}</div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 600, minWidth: 38 }}>{m.score}%</span>
              <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--ink-soft)' }}>{m.summary}</span>
            </div>
            <div className="row-actions">
              <a className="sq-btn" href={v.url} target="_blank" rel="noopener noreferrer" onClick={stop} title="Открыть в магазине">↗</a>
              <button type="button" className={'sq-btn' + (fav ? ' on' : '')} aria-pressed={fav} title={fav ? 'Убрать из избранного' : 'В избранное'}
                onClick={(e) => { stop(e); onFav(p); }}>{fav ? '♥' : '♡'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
