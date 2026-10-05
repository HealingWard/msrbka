import { GLYPH } from '../lib/search.js';
import { productView } from '../lib/product.js';
import { Icon } from './Icon.jsx';
import { Photo, PriceChange, PromoTag } from './ui.jsx';

const stop = (e) => e.stopPropagation();
const onKeyOpen = (open) => (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); };
// Пропорции фото на доске чередуются — как у настоящих снимков разного кадра.
const AR = ['3 / 4', '4 / 5', '1 / 1', '2 / 3', '4 / 5', '3 / 4', '5 / 6', '2 / 3'];
const CHG_TITLE = 'к обычной цене за 90 дней';

export { Photo };

function FollowBtn({ on, onClick, className = 'follow', size = 18 }) {
  return (
    <button type="button" className={className + (on ? ' on' : '')} aria-pressed={on} title={on ? 'Вы следите за ценой' : 'Следить за ценой'}
      aria-label={on ? 'Вы следите за ценой' : 'Следить за ценой'} onClick={(e) => { stop(e); onClick(); }}>
      <Icon name="ruler" size={size} />
    </button>
  );
}

/** Карточка вещи в выдаче. s — { badge, spark:{d,trend} } по истории цены. */
export function ProductCard({ p, m, s, best, fav, onOpen, onFav, checked, label }) {
  const v = productView(p);
  const trend = s?.spark?.trend || 0;
  return (
    <article className="pcard" onClick={onOpen} onKeyDown={onKeyOpen(onOpen)} tabIndex={0} aria-label={(p.brand ? p.brand + ' — ' : '') + p.title}>
      <div className={'best' + (best ? ' on' : '')} title={best ? 'Лучшая цена на экране' : undefined} />
      <div className="pcard-body">
        <div style={{ position: 'relative' }}>
          <Photo src={p.image} label={'фото' + (p.kind ? ' · ' + p.kind : '')} />
          <FollowBtn on={fav} onClick={onFav} />
        </div>
        <div className="label">{label}</div>
        <PromoTag promo={p.promo} />
        <div>
          {p.brand && <div className="brand">{p.brand}</div>}
          <div className="title">{p.title}</div>
        </div>
        <div className="price-row">
          <span className="price">{v.priceStr}</span>
          <PriceChange badge={s?.badge} title={CHG_TITLE} />
        </div>
        <div className="spark">
          <svg viewBox="0 0 200 32" preserveAspectRatio="none" aria-hidden="true">
            <path d={s?.spark?.d || 'M0 16 H200'} style={{ stroke: trend < 0 ? 'var(--drop)' : trend > 0 ? 'var(--rise)' : 'var(--muted)', strokeDasharray: trend > 0 ? '4 3' : 'none' }} />
          </svg>
          <div className="axis" />
          <div className="ends"><span>30 дней</span><span>сегодня</span></div>
        </div>
        <div className="pmeta">
          {(v.rating || v.reviewsStr || v.stock) && (
            <span>
              {v.rating && <span className="ink">★ {v.rating}</span>}
              {v.reviewsStr && <>{v.rating ? ' · ' : ''}{v.reviewsStr}</>}
              {v.stock && <>{v.rating || v.reviewsStr ? ' · ' : ''}<span className={v.lowStock ? 'low' : 'ink'}>{v.stock}</span></>}
            </span>
          )}
          <span className="row">
            <span className="sz">{(p.sizes || []).length ? p.sizes.join(' ') : 'размеры — в магазине'}</span>
            {p.color && <> · {v.colorHex && <i className="sw10" style={{ background: v.colorHex }} />}{p.color}</>}
          </span>
        </div>
        <div className="why">
          <div className="why-head"><span className="label">Почему подходит</span><span className="score">{m.score}&nbsp;%</span></div>
          {m.pills.length > 0 && (
            <div className="pills">
              {m.pills.map((x) => <span key={x.key} className={'pill ' + x.s}>{GLYPH[x.s]} {x.label}</span>)}
            </div>
          )}
          <div className="why-text">{m.summary}</div>
        </div>
        <div className="pcard-foot">
          <span>Проверено {checked}</span>
          <a href={v.url} target="_blank" rel="noopener noreferrer" onClick={stop}>{v.domain}<Icon name="external-link" size={14} /></a>
        </div>
      </div>
    </article>
  );
}

/** Доска для стилиста: фото разных пропорций, бренд с названием, цена. */
export function BoardCard({ p, s, best, fav, onOpen, onFav, label, i }) {
  const v = productView(p);
  return (
    <div className="bcard" role="link" tabIndex={0} onClick={onOpen} onKeyDown={onKeyOpen(onOpen)} aria-label={(p.brand ? p.brand + ' — ' : '') + p.title}>
      <div className={'best' + (best ? ' on' : '')} />
      <div style={{ position: 'relative' }}>
        <Photo src={p.image} label={'фото' + (p.kind ? ' · ' + p.kind : '')} style={{ aspectRatio: AR[i % AR.length] }} />
        <FollowBtn on={fav} onClick={onFav} />
      </div>
      <div className="bcard-body">
        <div className="label">{label}</div>
        <div className="t">{p.brand && <b>{p.brand}</b>} {p.title}</div>
        <div className="price-row"><span className="price">{v.priceStr}</span><PriceChange badge={s?.badge} title={CHG_TITLE} /></div>
      </div>
    </div>
  );
}

/** Таблица выдачи (режим ресейлера): светлая или тёмная. */
export function ResultsTable({ rows, dark, favs, onOpen, onFav, checked }) {
  return (
    <div className={'tbl' + (dark ? ' dark' : '')}>
      <div className="tbl-in">
        <div className="trow head">
          <span>Вещь</span><span>Магазин</span><span>Цена</span><span>К обычной</span><span>Рейтинг</span><span>Размеры</span>
          <span>Цвет</span><span>Наличие</span><span>Почему подходит</span><span />
        </div>
        {rows.map(({ p, m, s, best }) => {
          const v = productView(p);
          const fav = !!favs[p.id];
          return (
            <div key={p.id} className={'trow body' + (best ? ' best' : '')} onClick={() => onOpen(p.id)} onKeyDown={onKeyOpen(() => onOpen(p.id))} tabIndex={0}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <div className="tph">{p.image && <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}</div>
                <div style={{ minWidth: 0 }}>{p.brand && <div style={{ fontSize: 13, fontWeight: 700 }}>{p.brand}</div>}<div style={{ lineHeight: '18px' }}>{p.title}</div><PromoTag promo={p.promo} /></div>
              </div>
              <span>{p.store}</span>
              <div className="mono">{v.priceStr}</div>
              <span>{s?.badge ? <PriceChange badge={s.badge} title={CHG_TITLE} /> : <span className="sub">копится</span>}</span>
              <div>{v.rating ? <><div className="mono" style={{ fontWeight: 400 }}>★ {v.rating}</div><div className="sub">{v.reviewsStr}</div></> : <span className="sub">—</span>}</div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 400 }}>{(p.sizes || []).length ? p.sizes.join(' ') : '—'}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{v.colorHex && <i className="sw10" style={{ background: v.colorHex, borderColor: 'rgba(128,120,110,.4)' }} />}{p.color || '—'}</span>
              <div><div style={{ fontWeight: v.lowStock ? 700 : 500 }}>{v.stock || '—'}</div><div className="sub">{checked}</div></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 400, minWidth: 40 }}>{m.score}&nbsp;%</span>
                <span className="sub" style={{ fontSize: 13, lineHeight: '18px' }}>{m.summary}</span>
              </div>
              <div className="t-acts">
                <a className="t-btn" href={v.url} target="_blank" rel="noopener noreferrer" onClick={stop} title="Открыть в магазине" aria-label="Открыть в магазине"><Icon name="external-link" size={16} /></a>
                <FollowBtn on={fav} onClick={() => onFav(p)} className="t-btn" size={16} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
