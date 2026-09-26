import { useState } from 'react';
import { MONTHS, fmt, rub } from '../lib/format.js';
import { niceStep } from '../lib/priceHistory.js';
import { historyStats } from '../lib/history.js';
import { Segmented } from './ui.jsx';

const PERIODS = [[30, '30 дней'], [90, '90 дней'], [180, '180 дней']];
const DAY = 86400000;
const dateLabel = (t, now) => {
  const d = new Date(t), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return 'сегодня';
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
};

export function PriceChart({ p, history, loading, children }) {
  const [period, setPeriod] = useState(90);
  const [hover, setHover] = useState(null);
  const now = Date.now();
  const st = historyStats(history, period, now);
  const enough = st && st.count >= 2;

  let body;
  if (loading && !st) {
    body = <div className="chart-empty">Загружаю историю цены…</div>;
  } else if (!enough) {
    body = (
      <div className="chart-empty">
        {st
          ? <>История цены копится: первая проверка — {dateLabel(st.first, now)}, цена {rub(st.cur)}. Сервер записывает цену при каждой проверке, и график появится после следующих.</>
          : <>Пока нет ни одной проверки цены этого товара.</>}
      </div>
    );
  } else {
    const t0 = st.from, t1 = now, span = t1 - t0;
    const step = niceStep((st.max - st.min) / 4 || st.min * 0.05);
    const lo = Math.floor((st.min * 0.97) / step) * step;
    const hi = Math.ceil((st.max * 1.02) / step) * step;
    const X = (t) => ((Math.min(Math.max(t, t0), t1) - t0) / span) * 1000;
    const Y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
    const pts = st.pts;

    // Линия начинается с первой известной цены, а не с начала периода.
    const x0 = X(pts[0].t).toFixed(1);
    let line = 'M' + x0 + ' ' + Y(pts[0].price).toFixed(2);
    for (let i = 1; i < pts.length; i++) line += ' H' + X(pts[i].t).toFixed(1) + ' V' + Y(pts[i].price).toFixed(2);
    line += ' H1000';
    const yt = [];
    for (let v = lo; v <= hi + 1; v += step) yt.push({ label: fmt(v), top: Y(v) + '%' });
    const xt = [0, 1, 2, 3, 4].map((k) => ({
      label: k === 4 ? 'сегодня' : dateLabel(t0 + (span * k) / 4, now),
      left: k * 25 + '%', tx: k === 0 ? '0' : k === 4 ? '-100%' : '-50%',
    }));
    const avgR = Math.round(st.avg / 10) * 10;
    const va = Math.round(((st.cur - st.avg) / st.avg) * 100);
    const vm = Math.round(((st.cur - st.min) / st.min) * 100);
    const pl = period + ' дней';
    const stats = [
      { label: 'Текущая', value: rub(st.cur), cls: p.old ? 'sale-text' : '', note: va === 0 ? 'на уровне средней' : 'на ' + Math.abs(va) + '% ' + (va < 0 ? 'ниже' : 'выше') + ' средней', noteCls: va < 0 ? 'sale-text' : '' },
      { label: 'Средняя за ' + pl, value: rub(avgR), note: 'по проверкам цены', noteCls: 'muted' },
      { label: 'Минимальная за ' + pl, value: rub(st.min), note: vm === 0 ? 'текущая цена — минимальная' : 'была ' + dateLabel(st.minAt, now) + ' · текущая выше на ' + vm + '%', noteCls: vm === 0 ? 'sale-text' : '' },
    ];
    const priceAtT = (t) => { let v = pts[0].price; for (const x of pts) { if (x.t <= t) v = x.price; else break; } return v; };
    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const t = t0 + Math.round((frac * span) / DAY) * DAY;
      if (t !== hover) setHover(Math.min(t, t1));
    };
    const h = hover != null ? { t: hover, price: priceAtT(hover), left: ((hover - t0) / span) * 100 } : null;

    body = (
      <>
        <div className="chart-stats">
          {stats.map((t) => (
            <div key={t.label}>
              <div className="label">{t.label}</div>
              <div className={'value ' + (t.cls || '')}>{t.value}</div>
              <div className={'note ' + t.noteCls}>{t.note}</div>
            </div>
          ))}
        </div>
        <div className="chart">
          <div className="chart-y">
            {yt.map((t) => <div key={t.label} className="y-tick" style={{ top: t.top }}>{t.label}</div>)}
          </div>
          <div className="chart-plot" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
            role="img" aria-label={'График цены за ' + pl + ': от ' + rub(st.min) + ' до ' + rub(st.max) + ', сейчас ' + rub(st.cur)}>
            {yt.map((t) => <div key={t.label} className="grid-line" style={{ top: t.top }} />)}
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
              <path d={line + ' V100 H' + x0 + ' Z'} style={{ fill: 'rgba(20,21,24,0.035)', stroke: 'none' }} />
              <path d={'M' + x0 + ' ' + Y(st.avg).toFixed(2) + ' H1000'} style={{ fill: 'none', stroke: '#8C8F96', strokeWidth: 1, strokeDasharray: '4 4', vectorEffect: 'non-scaling-stroke' }} />
              <path d={line} style={{ fill: 'none', stroke: '#141518', strokeWidth: 1.75, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }} />
            </svg>
            <div className="chart-label" style={{ right: 0, top: Y(st.avg) + '%', transform: 'translateY(-130%)', color: 'var(--ink2)' }}>средняя {rub(avgR)}</div>
            <div className="chart-dot" style={{ left: X(st.minAt) / 10 + '%', top: Y(st.min) + '%', background: 'var(--acc)' }} />
            <div className="chart-label" style={{ left: X(st.minAt) / 10 + '%', top: Y(st.min) + '%', transform: 'translate(-50%,10px)', color: 'var(--acc)' }}>мин. {rub(st.min)}</div>
            <div className="chart-dot" style={{ left: '100%', top: Y(st.cur) + '%', background: 'var(--ink)' }} />
            {h && (
              <>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: h.left + '%', borderLeft: '1px solid var(--ink)', pointerEvents: 'none' }} />
                <div className="chart-dot" style={{ left: h.left + '%', top: Y(h.price) + '%', background: '#fff', border: '2px solid var(--ink)', boxShadow: 'none', pointerEvents: 'none' }} />
                <div className="chart-tip" style={{ left: Math.min(94, Math.max(6, h.left)) + '%' }}>
                  <span style={{ opacity: 0.65 }}>{dateLabel(h.t, now)}</span>{'  '}
                  <span style={{ fontWeight: 600 }}>{rub(h.price)}</span>
                </div>
              </>
            )}
          </div>
          <div />
          <div className="chart-x">
            {xt.map((t) => <div key={t.left} className="x-tick" style={{ left: t.left, transform: 'translateX(' + t.tx + ')' }}>{t.label}</div>)}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <div className="title">История цены</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{p.store} · {p.demo ? 'ежедневная проверка' : 'по проверкам сервера'}</div>
        </div>
        {enough && <Segmented label="Период" options={PERIODS} value={period} onChange={(k) => { setPeriod(k); setHover(null); }} />}
      </div>
      {body}
      {children}
    </div>
  );
}
