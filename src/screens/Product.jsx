import { useEffect, useRef, useState } from 'react';
import { ALLSIZES } from '../data/catalog.js';
import { dateLong, ddmm, pct, rub, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { priceAt } from '../lib/history.js';
import { productView } from '../lib/product.js';
import { GLYPH, matchProduct, runToParams } from '../lib/search.js';
import { fetchDetails } from '../lib/source.js';
import { changeBadge, changePct, goalProgress, priceStats } from '../lib/pricing.js';
import { withCurrent } from '../lib/useHistories.js';
import { PriceChart } from '../components/PriceChart.jsx';
import { Icon } from '../components/Icon.jsx';
import { Chip, Photo, PriceChange, PromoTag, Tape } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const BACK = { results: 'К результатам', lists: 'К спискам', searches: 'К моим поискам' };

export function Product({ id, from }) {
  const app = useApp();
  const [photo, setPhoto] = useState(0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalVal, setGoalVal] = useState('');
  // Вещь держим и после «Больше не следить»: иначе, открытая из списка, она пропадала бы со страницы.
  const found = app.findItem(id);
  const keep = useRef(found);
  if (found) keep.current = found;
  const base = found || keep.current;
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
    // Загружаем один раз на вещь.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!base]);

  if (!base) {
    return (
      <div className="page w-product">
        <h1 className="h1">Вещь не найдена</h1>
        <p className="muted" style={{ margin: '16px 0 24px' }}>Ссылка устарела или выдача, из которой открыта вещь, больше не хранится. Повторите поиск.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Новый поиск</button>
      </div>
    );
  }

  const p = details.item || base;
  const run = from === 'results' ? app.lastRun : null;
  const showMatch = !!run && (!p.demo || run.ds === p.ds);
  const m = matchProduct(p, showMatch ? run.crit : {});
  const v = productView(p);
  const fav = app.favs[p.id];
  const target = fav?.target || null;
  const want = showMatch ? run.crit.size : null;
  const checkedIso = details.checkedAt || fav?.checkedAt || run?.at;
  const points = withCurrent(details.history, p.price, Date.now());
  const st90 = priceStats(points, 90);
  const images = p.images && p.images.length ? p.images : p.image ? [p.image] : [];
  const sizeList = p.demo
    ? ALLSIZES[p.ds].map((z) => ({ z, av: p.sizes.includes(z) }))
    : [...(p.sizes || []).map((z) => ({ z, av: true })), ...(p.sizesOut || []).map((z) => ({ z, av: false }))];

  const back = () => {
    if (from === 'results' && run) navigate('/results?' + runToParams(run));
    else if (from === 'lists' || from === 'searches') navigate('/' + from);
    else navigate('/');
  };

  let follow = null;
  if (fav) {
    const addedAt = new Date(fav.addedAt).getTime();
    const was = fav.priceAtAdd || priceAt(points, addedAt) || p.price;
    const dl = changePct(p.price, was);
    follow = { since: dateLong(addedAt), was, dl, prog: goalProgress(was, p.price, target) };
  }
  const sugs = [
    ...(st90 && st90.known ? [['Минимум за 90 дней', st90.mn], ['Нижняя граница обычной', st90.p25]] : []),
    ['−10 % от текущей', Math.floor((p.price * 0.9) / 100) * 100],
  ].filter(([, x], i, a) => a.findIndex(([, y]) => y === x) === i);
  const saveGoal = () => {
    const x = +goalVal;
    if (!x) return;
    app.setTarget(p, x);
    setGoalOpen(false);
    setGoalVal('');
    app.notify('Цель ' + rub(x) + ' сохранена');
  };

  return (
    <div className="page w-product">
      <button type="button" className="back" onClick={back}><Icon name="arrow-left" size={16} />{BACK[from] || 'На главную'}</button>
      <div className="prod-top">
        <div className="gallery">
          <Photo key={images[photo] || 'none'} className="main" src={images[photo]} label={'фото вещи целиком' + (p.kind ? ' · ' + p.kind : '')} />
          <div className="thumbs">
            {(images.length > 1 ? images.slice(0, 4) : [images[0], null, null, null]).map((src, i) => (
              <button key={i} type="button" className={photo === i ? 'on' : ''} aria-label={'Фото ' + (i + 1)} aria-pressed={photo === i}
                onClick={() => src && setPhoto(i)} style={{ position: 'relative', overflow: 'hidden' }}>
                {src && <img src={src} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: 'var(--paper)' }} />}
              </button>
            ))}
          </div>
        </div>

        <div className="info">
          <div>
            <div className="label">{(p.brand ? p.brand + ' · ' : '') + p.store} · {ddmm(checkedIso || Date.now())}</div>
            {p.brand && <div className="brand">{p.brand}</div>}
            <h1 className="h1" style={{ marginTop: p.brand ? 4 : 16 }}>{p.title}</h1>
            {(v.rating || v.reviewsStr || v.stock) && (
              <div className="meta">
                {v.rating && <span className="ink">★ {v.rating}</span>}
                {v.reviewsStr && <>{v.rating ? ' · ' : ''}{v.reviewsStr}</>}
                {v.stock && <>{v.rating || v.reviewsStr ? ' · ' : ''}<span className="ink" style={{ fontWeight: v.lowStock ? 700 : 500 }}>{v.stock}</span></>}
              </div>
            )}
          </div>

          <div className="big-price">
            <span className="price">{v.priceStr}</span>
            {v.hasOld && <span className="old">{v.oldStr}</span>}
            <PriceChange badge={changeBadge(st90)} title="к обычной цене за 90 дней" />
            <PromoTag promo={p.promo} />
          </div>

          <div className="spec">
            <span className="k">Размеры</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {sizeList.length
                ? sizeList.map(({ z, av }) => (
                  <span key={z + av} className={'size-tag' + (av ? '' : ' na') + (av && want && z.toLowerCase() === want.toLowerCase() ? ' want' : '')}
                    title={av ? 'Есть в наличии' : 'Нет в наличии'}>{z}</span>
                ))
                : <span className="muted">{details.loading ? 'загружаю…' : 'уточните на сайте магазина'}</span>}
            </div>
            <span className="k">Цвет</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {v.colorHex && <i className="sw10" style={{ width: 14, height: 14, background: v.colorHex }} />}{v.colorStr}
            </span>
            <span className="k">Проверено</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 400 }}>
              {checkedIso ? whenStr(checkedIso) : '—'}
              {details.error && <span style={{ color: 'var(--rise)', fontFamily: 'var(--sans)' }}> · не удалось обновить: {details.error}</span>}
            </span>
          </div>

          <div className="btns">
            <button type="button" className={'btn ' + (fav ? 'btn-secondary' : 'btn-accent')} aria-pressed={!!fav} onClick={() => app.toggleFav(p)}>
              <Icon name="ruler" size={18} />{fav ? 'Вы следите' : 'Следить за ценой'}
            </button>
            <button type="button" className="btn btn-secondary" aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
              <Icon name="hourglass" size={18} />{target ? 'Изменить цель' : 'Задать цель'}
            </button>
            <a className="btn btn-primary" href={v.url} target="_blank" rel="noopener noreferrer"><Icon name="scissors" size={18} />Купить в {p.store}</a>
          </div>

          {goalOpen && (
            <div className="goal-panel">
              <div className="t">Какую цену ждём?</div>
              <div className="row">
                {sugs.map(([l, x]) => (
                  <Chip key={l} on={+goalVal === x} onClick={() => setGoalVal(String(x))}>{l} <span className="mono">{rub(x)}</span></Chip>
                ))}
              </div>
              <div className="row">
                <input className="field" inputMode="numeric" value={goalVal} placeholder="Своя цена, ₽" aria-label="Своя цена, ₽"
                  onChange={(e) => setGoalVal(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(); }} />
                <button type="button" className="btn btn-primary" onClick={saveGoal}>Сохранить цель</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setGoalOpen(false); setGoalVal(''); }}>Отмена</button>
                {target && <button type="button" className="link small" onClick={() => { app.setTarget(p, null); setGoalOpen(false); }}>Убрать цель</button>}
              </div>
            </div>
          )}

          {target && follow && (
            <div className="goal">
              <div className="goal-top">
                <b>Цель <span className="mono">{rub(target)}</span></b>
                <span className="mono muted" style={{ fontSize: 13, fontWeight: 400 }}>{p.price <= target ? 'цель достигнута' : 'осталось ' + rub(p.price - target)}</span>
              </div>
              <Tape value={follow.prog} done={follow.prog >= 1} />
            </div>
          )}

          {showMatch && (
            <div className="match">
              <div className="match-head"><span className="label">Почему подходит</span><span className="score">{m.score}&nbsp;%</span></div>
              <div className="sum">{m.summary}</div>
              {m.reasons.map((r) => (
                <div key={r.key} className="reason">
                  <span className={'g ' + r.s}>{GLYPH[r.s]}</span>
                  <span className="muted">{r.label}</span>
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          )}
          {p.demo && <div className="demo-note">Демо-вещь: кнопка «Купить» откроет поиск по названию на сайте магазина.</div>}
        </div>
      </div>

      <PriceChart p={p} points={points} loading={details.loading} target={target}>
        {follow && (
          <div className="since">
            Следите с {follow.since}: было <span className="mono">{rub(follow.was)}</span>, сейчас <span className="mono">{v.priceStr}</span>&nbsp;{' '}
            <span className={'mono ' + (follow.dl < 0 ? 'drop' : follow.dl > 0 ? 'rise' : '')}>{pct(follow.dl)}</span>
          </div>
        )}
      </PriceChart>
    </div>
  );
}
