import { useState } from 'react';
import { dateLong, dateShort, fmt, plural, rub } from '../lib/format.js';
import { niceStep } from '../lib/priceHistory.js';
import { SIGNAL, changePct, deltaBadge, priceSignal, priceStats, priceSteps } from '../lib/pricing.js';
import { PriceChange, Segmented } from './ui.jsx';

const PERIODS = [[30, '30 дней'], [90, '90 дней'], [180, '180 дней']];
const DAY = 86400000;
const DAYS_F = ['день', 'дня', 'дней'];
const timeStr = (t) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** История цены: статистика, коридор обычной цены, минимум, текущая точка, цель, подсказка при наведении. */
export function PriceChart({ p, points, loading, target, children }) {
  const [period, setPeriod] = useState(90);
  const [hover, setHover] = useState(null);
  const now = Date.now();
  const st = priceStats(points, period, now);
  // Обычная цена и оценка — по правилу статусов (180 дней нашей истории), график — за выбранный период.
  const sig = priceSignal(points, now);
  const ready = st && sig && sig.known && st.v.length >= 2;

  let body;
  if (loading && !st) {
    body = <div className="hist-empty">Загружаю историю цены…</div>;
  } else if (!ready) {
    body = st ? <ShortHistory points={points} st={st} sig={sig} now={now} /> : <div className="hist-empty">Пока нет ни одной проверки цены этой вещи.</div>;
  } else {
    const n = st.v.length;
    const vmax = Math.max(...st.v);
    const lowV = Math.min(st.mn, target || st.mn, sig.p25);
    const highV = Math.max(vmax, target || vmax, sig.p75);
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
    const usualR = rub(Math.round(sig.usual / 10) * 10);
    const P = (n) => Math.abs(n) + ' %';
    const sentence = sig.level === 'excellent' ? 'Отличная цена: на ' + P(sig.pct) + ' ниже обычной (' + usualR + '). Пора покупать.'
      : sig.level === 'good' ? 'Хорошая цена: на ' + P(sig.pct) + ' ниже обычной (' + usualR + '). Отличной будет цена от ' + rub(Math.floor((sig.usual * (1 - SIGNAL.excellent)) / 100) * 100) + ' и ниже.'
        : sig.level === 'high' ? 'Пока рано: цена на ' + P(sig.pct) + ' выше обычной (' + usualR + ').'
          : sig.flat ? 'Цена не менялась ' + sig.days + ' ' + plural(sig.days, DAYS_F) + '. Отличной будет цена от ' + rub(Math.floor((sig.usual * (1 - SIGNAL.excellent)) / 100) * 100) + ' и ниже.'
            : 'Цена обычная. Минимум за ' + pl + ' — ' + rub(st.mn) + ' (' + minDate + ').';
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
            <div className="sn">{sig.pct !== 0 && <PriceChange small badge={deltaBadge(sig.pct)} />}{sig.pct !== 0 ? 'к обычной цене' : 'как обычно'}</div>
          </div>
          <div>
            <div className="label">Обычная цена</div>
            <div className="v">{usualR}</div>
            <div className="sn">{sig.p25 !== sig.p75 ? 'коридор ' + fmt(sig.p25) + '–' + rub(sig.p75) + ' · ' : ''}за {sig.days} {plural(sig.days, DAYS_F)} наблюдений</div>
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
            role="img" aria-label={'График цены за ' + pl + ': обычная ' + usualR + ', минимум ' + rub(st.mn) + ', сейчас ' + rub(st.cur)}>
            <div className="cor" style={{ top: Y(sig.p75) + '%', height: Math.max(0.6, Y(sig.p25) - Y(sig.p75)) + '%' }} />
            <div className="cor-l label" style={{ top: Y(sig.p75) + '%' }}>Обычная цена · {sig.p25 !== sig.p75 ? fmt(sig.p25) + '–' + rub(sig.p75) : usualR}</div>
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
    <section className={'hist' + (ready ? '' : ' short')} aria-labelledby="hist-h">
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

/**
 * Первая неделя наблюдений: для «обычной цены» и графика данных мало, но все проверки и изменения цены
 * уже показываем — первая цена, текущая, минимум и список изменений.
 */
function ShortHistory({ points, st, sig, now }) {
  const steps = priceSteps(points);
  const first = steps[0];
  const dl = changePct(st.cur, first.price);
  const mn = Math.min(...steps.map((x) => x.price));
  const minAt = steps.filter((x) => x.price === mn).pop().t;
  const leftDays = Math.max(0, SIGNAL.youngDays - (Math.floor((now - first.t) / DAY) + 1));
  const leftChecks = Math.max(0, SIGNAL.youngChecks - (sig?.checks || 0));
  return (
    <>
      <div className="hist-stats">
        <div>
          <div className="label">Первая проверка</div>
          <div className="v">{rub(first.price)}</div>
          <div className="sn">{dateLong(first.t)}</div>
        </div>
        <div>
          <div className="label">Сейчас</div>
          <div className="v">{rub(st.cur)}</div>
          <div className="sn">{dl !== 0 && <PriceChange small badge={deltaBadge(dl)} />}{dl !== 0 ? 'к первой проверке' : 'цена не менялась'}</div>
        </div>
        <div>
          <div className="label">Минимум</div>
          <div className="v">{rub(mn)}</div>
          <div className="sn">{mn === st.cur ? 'текущая цена — минимальная' : dateLong(minAt)}</div>
        </div>
      </div>
      {steps.length > 1 && (
        <ol className="hist-steps" aria-label="Изменения цены">
          {steps.slice(-8).map((x, i, a) => {
            const d = i ? changePct(x.price, a[i - 1].price) : 0;
            return (
              <li key={x.t}>
                <span className="d">{dateLong(x.t)}{a.some((y) => y !== x && dateLong(y.t) === dateLong(x.t)) ? ', ' + timeStr(x.t) : ''}</span>
                <span className="mono">{rub(x.price)}</span>
                {i > 0 ? <PriceChange small badge={deltaBadge(d)} /> : <span className="sub">первая проверка</span>}
              </li>
            );
          })}
        </ol>
      )}
      <p className="hist-empty">
        Цена записывается при каждом поиске и проверке. Обычная цена, оценка и график появятся после {SIGNAL.youngDays} дней наблюдений
        и {SIGNAL.youngChecks} проверок{leftDays || leftChecks ? ' — ' + [leftDays && 'ещё ' + leftDays + ' ' + plural(leftDays, DAYS_F), leftChecks && 'ещё ' + leftChecks + ' ' + plural(leftChecks, ['проверка', 'проверки', 'проверок'])].filter(Boolean).join(' и ') : ''}.
        Скидкам магазина не верим — только своей истории.
      </p>
    </>
  );
}
