import { useEffect, useState } from 'react';
import { ALLSIZES } from '../data/catalog.js';
import { MONTHS, rub, signedPct, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { priceAt } from '../lib/history.js';
import { productView } from '../lib/product.js';
import { GLYPH, matchProduct, runToParams } from '../lib/search.js';
import { fetchDetails } from '../lib/source.js';
import { PriceChart } from '../components/PriceChart.jsx';
import { Photo } from '../components/ProductCard.jsx';
import { useApp } from '../state.jsx';

const BACK = {
  results: 'К результатам',
  favorites: 'К избранному',
  searches: 'К моим поискам',
};
const dateStr = (iso) => { const d = new Date(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()]; };

export function Product({ id, from }) {
  const app = useApp();
  const [photo, setPhoto] = useState(0);
  const base = app.findItem(id);
  const [details, setDetails] = useState({ item: null, history: [], loading: true, error: null, checkedAt: null });

  const { refreshFav } = app;
  const isFav = !!app.favs[id];
  useEffect(() => {
    if (!base) return undefined;
    const ctrl = new AbortController();
    fetchDetails(base, ctrl.signal)
      .then((r) => {
        setDetails({ item: r.item, history: r.history, loading: false, error: null, checkedAt: new Date().toISOString() });
        if (isFav && !r.item.demo) refreshFav(r.item);
      })
      .catch((e) => { if (e.name !== 'AbortError') setDetails((d) => ({ ...d, loading: false, error: e.message })); });
    return () => ctrl.abort();
    // Загружаем один раз на товар.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!base]);

  if (!base) {
    return (
      <div className="page searches">
        <h1 style={{ fontSize: 32, margin: 0 }}>Товар не найден</h1>
        <p className="muted">Ссылка устарела или выдача, из которой открыт товар, больше не хранится. Повторите поиск.</p>
        <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('/')}>Новый поиск</button>
      </div>
    );
  }

  const p = details.item || base;
  const run = from === 'results' ? app.lastRun : null;
  const showMatch = !!run && (!p.demo || run.ds === p.ds);
  const m = matchProduct(p, showMatch ? run.crit : {});
  const v = productView(p);
  const fav = app.favs[p.id];
  const want = showMatch ? run.crit.size : null;
  const checked = details.checkedAt ? whenStr(details.checkedAt) : run ? whenStr(run.at) : '—';
  const images = p.images && p.images.length ? p.images : p.image ? [p.image] : [];
  const sizeList = p.demo
    ? ALLSIZES[p.ds].map((z) => ({ z, av: p.sizes.includes(z) }))
    : (p.sizes || []).map((z) => ({ z, av: true }));

  const back = () => {
    if (from === 'results' && run) navigate('/results?' + runToParams(run));
    else if (from === 'favorites' || from === 'searches') navigate('/' + from);
    else navigate('/');
  };

  let favNote = null;
  if (fav) {
    const addedAt = new Date(fav.addedAt).getTime();
    const was = fav.priceAtAdd || priceAt(details.history, addedAt) || p.price;
    const dl = Math.round(((p.price - was) / was) * 100);
    favNote = { since: dateStr(fav.addedAt), was: rub(was), delta: dl === 0 ? '±0%' : signedPct(dl), cls: dl < 0 ? 'sale-text' : '' };
  }

  return (
    <div className="page product">
      <button type="button" className="link-btn back" onClick={back}>← {BACK[from] || 'На главную'}</button>
      <div className="product-top">
        <div className="gallery">
          <div className="gallery-main">
            <Photo key={images[photo] || 'none'} src={images[photo]} label={'фото товара' + (p.kind ? ' · ' + p.kind : '') + (images.length ? '' : ' · ' + (photo + 1) + '/4')} />
          </div>
          <div className="gallery-thumbs">
            {(images.length > 1 ? images.slice(0, 4) : [0, 1, 2, 3]).map((src, i) => (
              <button key={i} type="button" className={photo === i ? 'on' : ''} aria-label={'Фото ' + (i + 1)} aria-pressed={photo === i} onClick={() => setPhoto(i)}>
                {typeof src === 'string' && <Photo src={src} />}
              </button>
            ))}
          </div>
        </div>
        <div className="product-info">
          <div>
            <div className="brand">{p.brand ? p.brand + ' · ' : ''}{p.store}</div>
            <h1>{p.title}</h1>
            {(v.rating || v.stock) && (
              <div className="meta-line">
                {v.rating && <span className="rating">★ {v.rating}</span>}
                {v.reviewsStr && <span>{v.reviewsStr}</span>}
                {v.stock && <span className={v.lowStock ? 'low-stock' : ''}>{v.rating ? '· ' : ''}{v.stock}</span>}
              </div>
            )}
          </div>
          <div className="big-price">
            <span className={'price' + (v.hasOld ? ' sale' : '')}>{v.priceStr}</span>
            {v.hasOld && <><span className="old-price">{v.oldStr}</span><span className="badge sale">{v.discStr}</span></>}
          </div>
          <div className="spec">
            <span className="k">Размеры</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sizeList.length
                ? sizeList.map(({ z, av }) => (
                  <span key={z} className={'size-tag' + (av ? '' : ' na') + (av && want && z.toLowerCase() === want.toLowerCase() ? ' want' : '')} title={av ? 'Есть в наличии' : 'Нет в наличии'}>{z}</span>
                ))
                : <span className="muted">{details.loading ? 'загружаю…' : 'уточните на сайте магазина'}</span>}
            </div>
            <span className="k">Цвет</span>
            <span className={'inline-color' + (p.color ? '' : ' muted')} style={{ gap: 8 }}>
              {v.colorHex && <i className="swatch lg" style={{ background: v.colorHex }} />}{v.colorStr}
            </span>
            <span className="k">Проверено</span>
            <span>{checked}{details.error && <span className="sale-text" style={{ fontSize: 12.5 }}> · не удалось обновить: {details.error}</span>}</span>
          </div>
          <div className="product-actions">
            <a className="btn btn-primary" style={{ fontSize: 14.5, padding: '0 20px' }} href={v.url} target="_blank" rel="noopener noreferrer">Открыть в {p.store} ↗</a>
            <button type="button" className="btn btn-secondary" aria-pressed={!!fav} onClick={() => app.toggleFav(p)}>
              {fav ? '♥ В избранном' : '♡ В избранное'}
            </button>
          </div>
          {p.demo && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: -12 }}>
              Демо-товар: кнопка откроет поиск по названию на сайте магазина. Подключите сервер поиска, чтобы видеть настоящие карточки.
            </div>
          )}
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

      <PriceChart p={p} history={details.history} loading={details.loading}>
        {favNote && (
          <div className="fav-note">
            В избранном с {favNote.since}: было {favNote.was} → сейчас {v.priceStr} <b className={favNote.cls}>{favNote.delta}</b>
          </div>
        )}
      </PriceChart>
    </div>
  );
}
