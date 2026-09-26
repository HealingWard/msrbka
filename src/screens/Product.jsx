import { useState } from 'react';
import { ALLSIZES, PRODUCT_BY_ID } from '../data/catalog.js';
import { dayLabel, daysAgo, rub, signedPct, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { priceDaysAgo } from '../lib/priceHistory.js';
import { productView } from '../lib/product.js';
import { GLYPH, matchProduct, runToParams } from '../lib/search.js';
import { PriceChart } from '../components/PriceChart.jsx';
import { useApp } from '../state.jsx';

const BACK = {
  results: 'К результатам',
  favorites: 'К избранному',
  searches: 'К моим поискам',
};

export function Product({ id, from }) {
  const app = useApp();
  const [photo, setPhoto] = useState(0);
  const p = PRODUCT_BY_ID[id];
  if (!p) {
    return (
      <div className="page searches">
        <h1 style={{ fontSize: 32, margin: 0 }}>Товар не найден</h1>
        <p className="muted">Возможно, ссылка устарела.</p>
        <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('/')}>Новый поиск</button>
      </div>
    );
  }

  const run = from === 'results' ? app.lastRun : null;
  const showMatch = !!run && run.ds === p.ds;
  const m = matchProduct(p, showMatch ? run.crit : {});
  const v = productView(p);
  const fav = app.favs[p.id];
  const want = showMatch ? run.crit.size : null;
  const checked = whenStr(run ? run.at : new Date().toISOString());

  const back = () => {
    if (from === 'results' && run) navigate('/results?' + runToParams(run));
    else if (from === 'favorites' || from === 'searches') navigate('/' + from);
    else navigate('/');
  };

  let favNote = null;
  if (fav) {
    const days = daysAgo(fav.addedAt);
    const was = priceDaysAgo(p, days);
    const dl = Math.round(((p.price - was) / was) * 100);
    favNote = { since: days ? dayLabel(days) : 'сегодня', was: rub(was), delta: dl === 0 ? '±0%' : signedPct(dl), cls: dl < 0 ? 'sale-text' : '' };
  }

  return (
    <div className="page product">
      <button type="button" className="link-btn back" onClick={back}>← {BACK[from] || 'На главную'}</button>
      <div className="product-top">
        <div className="gallery">
          <div className="gallery-main"><span className="photo-label" style={{ fontSize: 12 }}>фото товара · {p.kind} · {photo + 1}/4</span></div>
          <div className="gallery-thumbs">
            {[0, 1, 2, 3].map((i) => (
              <button key={i} type="button" className={photo === i ? 'on' : ''} aria-label={'Фото ' + (i + 1)} aria-pressed={photo === i} onClick={() => setPhoto(i)} />
            ))}
          </div>
        </div>
        <div className="product-info">
          <div>
            <div className="brand">{p.brand} · {p.store}</div>
            <h1>{p.title}</h1>
            <div className="meta-line">
              <span className="rating">★ {v.rating}</span><span>{v.reviewsStr}</span>
              <span className={v.lowStock ? 'low-stock' : ''}>· {p.stock}</span>
            </div>
          </div>
          <div className="big-price">
            <span className={'price' + (v.hasOld ? ' sale' : '')}>{v.priceStr}</span>
            {v.hasOld && <><span className="old-price">{v.oldStr}</span><span className="badge sale">{v.discStr}</span></>}
          </div>
          <div className="spec">
            <span className="k">Размеры</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ALLSIZES[p.ds].map((z) => {
                const av = p.sizes.includes(z);
                return <span key={z} className={'size-tag' + (av ? '' : ' na') + (av && z === want ? ' want' : '')} title={av ? 'Есть в наличии' : 'Нет в наличии'}>{z}</span>;
              })}
            </div>
            <span className="k">Цвет</span>
            <span className="inline-color" style={{ gap: 8 }}><i className="swatch lg" style={{ background: v.colorHex }} />{p.color}</span>
            <span className="k">Проверено</span><span>{checked}</span>
          </div>
          <div className="product-actions">
            <a className="btn btn-primary" style={{ fontSize: 14.5, padding: '0 20px' }} href={v.url} target="_blank" rel="noopener noreferrer">Открыть в {p.store} ↗</a>
            <button type="button" className="btn btn-secondary" aria-pressed={!!fav} onClick={() => app.toggleFav(p.id)}>
              {fav ? '♥ В избранном' : '♡ В избранное'}
            </button>
          </div>
          {showMatch && (
            <div className="panel">
              <div className="panel-head"><span className="title">Почему подходит</span><span className="score">{m.score}%</span></div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 14, lineHeight: 1.45 }}>{m.summary}</div>
              {m.reasons.map((r) => (
                <div key={r.key} className="reason">
                  <span className={'dot ' + r.s}>{GLYPH[r.s]}</span>
                  <span className="muted">{r.label}</span>
                  <span style={r.s === 'no' ? { color: 'var(--ink3)' } : undefined}>{r.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PriceChart p={p}>
        {favNote && (
          <div className="fav-note">
            В избранном с {favNote.since}: было {favNote.was} → сейчас {v.priceStr} <b className={favNote.cls}>{favNote.delta}</b>
          </div>
        )}
      </PriceChart>
    </div>
  );
}
