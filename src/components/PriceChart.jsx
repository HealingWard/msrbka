import { useState } from 'react';
import { dayLabel, fmt, rub } from '../lib/format.js';
import { niceStep, periodStats, priceHistory } from '../lib/priceHistory.js';
import { Segmented } from './ui.jsx';

const PERIODS = [[30, '30 дней'], [90, '90 дней'], [180, '180 дней']];

export function PriceChart({ p, children }) {
  const [period, setPeriod] = useState(90);
  const [hover, setHover] = useState(null);

  const st = periodStats(priceHistory(p), period);
  const n = st.v.length;
  const step = niceStep((st.max - st.min) / 4 || st.min * 0.05);
  const lo = Math.floor((st.min * 0.97) / step) * step;
  const hi = Math.ceil((st.max * 1.02) / step) * step;
  const X = (i) => (i / (n - 1)) * 1000;
  const Y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;

  let line = 'M0 ' + Y(st.v[0]).toFixed(2);
  for (let i = 1; i < n; i++) line += ' H' + X(i).toFixed(1) + ' V' + Y(st.v[i]).toFixed(2);
  const yt = [];
  for (let v = lo; v <= hi + 1; v += step) yt.push({ label: fmt(v), top: Y(v) + '%' });
  const xt = [0, 1, 2, 3, 4].map((k) => {
    const i = Math.round((k * (n - 1)) / 4);
    return { label: k === 4 ? 'сегодня' : dayLabel(n - 1 - i), left: (i / (n - 1)) * 100 + '%', tx: k === 0 ? '0' : k === 4 ? '-100%' : '-50%' };
  });

  const avgR = Math.round(st.avg / 10) * 10;
  const va = Math.round(((st.cur - st.avg) / st.avg) * 100);
  const vm = Math.round(((st.cur - st.min) / st.min) * 100);
  const pl = period + ' дней';
  const stats = [
    { label: 'Текущая', value: rub(st.cur), cls: p.old ? 'sale-text' : '', note: va === 0 ? 'на уровне средней' : 'на ' + Math.abs(va) + '% ' + (va < 0 ? 'ниже' : 'выше') + ' средней', noteCls: va < 0 ? 'sale-text' : '' },
    { label: 'Средняя за ' + pl, value: rub(avgR), note: 'по ежедневным проверкам', noteCls: 'muted' },
    { label: 'Минимальная за ' + pl, value: rub(st.min), note: vm === 0 ? 'текущая цена — минимальная' : 'была ' + dayLabel(n - 1 - st.minIdx) + ' · текущая выше на ' + vm + '%', noteCls: vm === 0 ? 'sale-text' : '' },
  ];

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
    if (i !== hover) setHover(i);
  };
  const h = hover != null && hover < n ? hover : null;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <div className="title">История цены</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{p.store} · ежедневная проверка</div>
        </div>
        <Segmented label="Период" options={PERIODS} value={period} onChange={(k) => { setPeriod(k); setHover(null); }} />
      </div>
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
            <path d={line + ' V100 H0 Z'} style={{ fill: 'rgba(20,21,24,0.035)', stroke: 'none' }} />
            <path d={'M0 ' + Y(st.avg).toFixed(2) + ' H1000'} style={{ fill: 'none', stroke: '#8C8F96', strokeWidth: 1, strokeDasharray: '4 4', vectorEffect: 'non-scaling-stroke' }} />
            <path d={line} style={{ fill: 'none', stroke: '#141518', strokeWidth: 1.75, strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }} />
          </svg>
          <div className="chart-label" style={{ right: 0, top: Y(st.avg) + '%', transform: 'translateY(-130%)', color: 'var(--ink2)' }}>средняя {rub(avgR)}</div>
          <div className="chart-dot" style={{ left: X(st.minIdx) / 10 + '%', top: Y(st.min) + '%', background: 'var(--acc)' }} />
          <div className="chart-label" style={{ left: X(st.minIdx) / 10 + '%', top: Y(st.min) + '%', transform: 'translate(-50%,10px)', color: 'var(--acc)' }}>мин. {rub(st.min)}</div>
          <div className="chart-dot" style={{ left: '100%', top: Y(st.cur) + '%', background: 'var(--ink)' }} />
          {h != null && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: (h / (n - 1)) * 100 + '%', borderLeft: '1px solid var(--ink)', pointerEvents: 'none' }} />
              <div className="chart-dot" style={{ left: (h / (n - 1)) * 100 + '%', top: Y(st.v[h]) + '%', background: '#fff', border: '2px solid var(--ink)', boxShadow: 'none', pointerEvents: 'none' }} />
              <div className="chart-tip" style={{ left: Math.min(94, Math.max(6, (h / (n - 1)) * 100)) + '%' }}>
                <span style={{ opacity: 0.65 }}>{n - 1 - h === 0 ? 'сегодня' : dayLabel(n - 1 - h)}</span>{'  '}
                <span style={{ fontWeight: 600 }}>{rub(st.v[h])}</span>
              </div>
            </>
          )}
        </div>
        <div />
        <div className="chart-x">
          {xt.map((t) => <div key={t.left} className="x-tick" style={{ left: t.left, transform: 'translateX(' + t.tx + ')' }}>{t.label}</div>)}
        </div>
      </div>
      {children}
    </div>
  );
}
