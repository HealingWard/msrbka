import { useState } from 'react';
import { dateLong, dateShort, fmt, rub } from '../lib/format.js';
import { niceStep } from '../lib/priceHistory.js';
import { deltaBadge, priceStats } from '../lib/pricing.js';
import { PriceChange, Segmented } from './ui.jsx';

const PERIODS = [[30, '30 дней'], [90, '90 дней'], [180, '180 дней']];

/** История цены: статистика, коридор обычной цены, минимум, текущая точка, цель, подсказка при наведении. */
export function PriceChart({ p, points, loading, target, children }) {
  const [period, setPeriod] = useState(90);
  const [hover, setHover] = useState(null);
  const now = Date.now();
  const st = priceStats(points, period, now);
  const ready = st && st.known && st.v.length >= 2;

  let body;
  if (loading && !st) {
    body = <div className="hist-empty">Загружаю историю цены…</div>;
  } else if (!ready) {
    body = (
      <div className="hist-empty">
        {st
          ? <>История цены копится: первая проверка — {dateLong(st.first)}, цена {rub(st.cur)}. Цена записывается при каждом поиске и проверке. Через неделю наблюдений здесь появятся обычная цена, минимум и график.</>
          : <>Пока нет ни одной проверки цены этой вещи.</>}
      </div>
    );
  } else {
    const n = st.v.length;
    const vmax = Math.max(...st.v);
    const lowV = Math.min(st.mn, target || st.mn);
    const highV = Math.max(vmax, target || vmax);
    const step = niceStep((highV - lowV) / 4 || lowV * 0.05);
    const lo = Math.floor((lowV * 0.97) / step) * step;
    const hi = Math.ceil((highV * 1.02) / step) * step;
    const X = (i) => (i / (n - 1)) * 1000;
    const Y = (v) => 100 - ((v - lo) / (hi - lo)) * 100;
    let line = 'M0 ' + Y(st.v[0]).toFixed(2);
    for (let i = 1; i < n; i++) line += ' H' + X(i).toFixed(1) + ' V' + Y(st.v[i]).toFixed(2);
    const yt = [];
    for (let v = lo; v <= hi + 1; v += step) yt.push({ label: fmt(v), top: Y(v) + '%' });
    const xt = [0, 1, 2, 3, 4].map((k) => {
      const i = Math.round((k * (n - 1)) / 4);
      return { label: k === 4 ? 'сегодня' : dateShort(st.t[i]), left: (i / (n - 1)) * 100 + '%', tx: k === 0 ? '0' : k === 4 ? '-100%' : '-50%' };
    });
    const vm = Math.round(((st.cur - st.mn) / st.mn) * 100);
    const days = Math.round((now - st.from) / 86400000) + 1;
    const pl = (days < period ? days : period) + ' дней';
    const minDate = dateLong(st.minAt);
    const sentence = st.isMin ? 'Сейчас минимальная цена за ' + pl + '. Хороший момент, чтобы купить.'
      : st.va < 0 ? 'Сейчас на ' + -st.va + ' % ниже обычной. Минимум — ' + rub(st.mn) + ' (' + minDate + ').'
        : st.va > 0 ? 'Пока рано: цена выше обычной на ' + st.va + ' %. Минимум — ' + rub(st.mn) + ' (' + minDate + ').'
          : 'Цена на обычном уровне. Минимум — ' + rub(st.mn) + ' (' + minDate + ').';
    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1))));
      if (i !== hover) setHover(i);
    };
    const h = hover != null && hover < n ? hover : null;

    body = (
      <>
        <div className="hist-stats">
          <div>
            <div className="label">Сейчас</div>
            <div className="v">{rub(st.cur)}</div>
            <div className="sn"><PriceChange small badge={deltaBadge(st.va)} />к обычной цене</div>
          </div>
          <div>
            <div className="label">Обычная цена</div>
            <div className="v">{fmt(st.p25)}–{fmt(st.p75)}&nbsp;₽</div>
            <div className="sn">средняя {rub(Math.round(st.avg / 10) * 10)}</div>
          </div>
          <div>
            <div className="label">Минимум за {pl}</div>
            <div className="v">{rub(st.mn)}</div>
            <div className="sn">
              {vm > 0 && <PriceChange small badge={deltaBadge(vm)} />}
              {vm === 0 ? 'текущая цена — минимальная' : 'сейчас выше · ' + minDate}
            </div>
          </div>
        </div>
        <div className="chart">
          <div className="chart-y">{yt.map((t) => <div key={t.label} style={{ top: t.top }}>{t.label}</div>)}</div>
          <div className="plot" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
            role="img" aria-label={'График цены за ' + pl + ': обычная ' + fmt(st.p25) + '–' + rub(st.p75) + ', минимум ' + rub(st.mn) + ', сейчас ' + rub(st.cur)}>
            <div className="cor" style={{ top: Y(st.p75) + '%', height: Y(st.p25) - Y(st.p75) + '%' }} />
            <div className="cor-l label" style={{ top: Y(st.p75) + '%' }}>Обычная цена · {fmt(st.p25)}–{rub(st.p75)}</div>
            {yt.map((t) => <div key={t.label} className="gl" style={{ top: t.top }} />)}
            {target && (
              <>
                <div className="tg" style={{ top: Y(target) + '%' }} />
                <div className="tg-l" style={{ top: Y(target) + '%' }}>цель {rub(target)}</div>
              </>
            )}
            <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true"><path d={line} /></svg>
            <div className="mn" style={{ left: X(st.minIdx) / 10 + '%', top: Y(st.mn) + '%' }} />
            <div className="mn-l" style={{ left: Math.min(92, Math.max(8, X(st.minIdx) / 10)) + '%', top: Y(st.mn) + '%' }}>мин. {rub(st.mn)}</div>
            <div className="cur" style={{ top: Y(st.cur) + '%' }} />
            {h != null && (
              <>
                <div className="hv" style={{ left: (h / (n - 1)) * 100 + '%' }} />
                <div className="hv-d" style={{ left: (h / (n - 1)) * 100 + '%', top: Y(st.v[h]) + '%' }} />
                <div className="tip" style={{ left: Math.min(94, Math.max(6, (h / (n - 1)) * 100)) + '%' }}>
                  {h === n - 1 ? 'сегодня' : dateLong(st.t[h])} · {rub(st.v[h])}
                </div>
              </>
            )}
          </div>
          <div />
          <div className="chart-x">
            <div className="ticks" />
            {xt.map((t) => <div key={t.left} className="label" style={{ left: t.left, transform: 'translateX(' + t.tx + ')' }}>{t.label}</div>)}
          </div>
        </div>
        <p className="sentence">{sentence}</p>
      </>
    );
  }

  return (
    <section className="hist" aria-labelledby="hist-h">
      <div className="hist-head">
        <div>
          <h2 className="h2" id="hist-h">История цены</h2>
          <div className="label">{p.store} · {p.demo ? 'проверка каждый день' : 'проверка при каждом поиске'}</div>
        </div>
        {ready && <Segmented label="Период" options={PERIODS} value={period} onChange={(k) => { setPeriod(k); setHover(null); }} />}
      </div>
      {body}
      {children}
    </section>
  );
}
