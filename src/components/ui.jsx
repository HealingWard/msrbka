import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

export function Box({ on }) {
  return <span className={'cbx' + (on ? ' on' : '')} aria-hidden="true">{on && <Icon name="check" size={10} />}</span>;
}

/** Строка с чекбоксом (фильтры, списки брендов). children — например, квадрат цвета. */
export function CheckRow({ on, label, meta, onClick, children, className = 'crow' }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className={className} onClick={onClick}>
      <Box on={on} />
      {children}
      <span className="l">{label}</span>
      {meta != null && meta !== '' && <span className="n">{meta}</span>}
    </button>
  );
}

export function Chip({ on, onClick, children, className = '' }) {
  return (
    <button type="button" aria-pressed={!!on} className={'chip' + (on ? ' on' : '') + (className ? ' ' + className : '')} onClick={onClick}>
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Бейджи критериев запроса: «Бренд Storeez», «Размер M». */
export function Badges({ items, small }) {
  return items.map((x) => (
    <span key={x.k} className={'badge' + (small ? ' sm' : '')} title={x.t || x.v}>
      <span className="k">{x.k}</span>{x.v}
    </span>
  ));
}

/** Изменение цены: «↓ −18 %», «↑ +6 %» или «МИНИМУМ ЗА 90 ДНЕЙ». */
export function PriceChange({ badge, small, title, children }) {
  if (!badge) return null;
  return (
    <span className={'chg ' + badge.tone + (small ? ' sm' : '')} title={title}>{badge.text}{children}</span>
  );
}

/** Плашка акции магазина: «Сумасшедшие дни» Stockmann или другая плашка товара. */
export function PromoTag({ promo }) {
  if (!promo) return null;
  const crazy = inCrazyDaysPromo(promo);
  const text = crazy ? 'Сумасшедшие дни' : promo.badges?.[0];
  if (!text) return null;
  const date = crazy ? crazyDateLabel(promo.crazyDate) : '';
  const extra = [date, crazy && promo.crazyText && promo.crazyText !== date ? promo.crazyText : ''].filter(Boolean).join(' · ');
  // «Выгоду», которую пишет магазин, не показываем: скидкам магазина не доверяем — только своей истории цен.
  const title = [text, extra, ...(promo.badges || [])].filter(Boolean).join(' · ');
  return <span className="promo" title={title}>{text}{extra ? ' · ' + extra : ''}</span>;
}
// Участие в «Сумасшедших днях» — только по данным расширения 0.4.4+ (v: 2): в 0.4.3 в акцию ошибочно попадали все товары.
const inCrazyDaysPromo = (promo) => !!promo && promo.v >= 2 && !!promo.crazy;
export const inCrazyDays = (p) => inCrazyDaysPromo(p?.promo);
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
/** «2026-10-17» / «17.10» / «17 октября» → «сб, с 17 октября». */
function crazyDateLabel(s) {
  if (!s) return '';
  let d = null;
  let m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  m = !d && String(s).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (m) d = new Date(m[3] ? +m[3] : new Date().getFullYear(), +m[2] - 1, +m[1]);
  m = !d && String(s).match(/(\d{1,2})\s+([а-я]+)/i);
  if (m && MONTHS_G.indexOf(m[2].toLowerCase()) >= 0) d = new Date(new Date().getFullYear(), MONTHS_G.indexOf(m[2].toLowerCase()), +m[1]);
  if (!d || Number.isNaN(d.getTime())) return String(s);
  return WD[d.getDay()] + ', с ' + d.getDate() + ' ' + MONTHS_G[d.getMonth()];
}

/** Лента-прогресс: жёлтая заливка с делениями, трек tape-soft, когда цель достигнута. */
export function Tape({ value, done }) {
  return <div className={'tape' + (done ? ' done' : '')}><i style={{ width: Math.round(Math.max(0, Math.min(1, value)) * 100) + '%' }} /></div>;
}

/** Фото вещи целиком (contain); если его нет или оно не загрузилось — полосатая заглушка с подписью. */
export function Photo({ src, label, className = '', style }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={'ph ' + className} style={style}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : label ? <span className="ph-l">{label}</span> : null}
    </div>
  );
}

/** Закрывает выпадающее меню по клику снаружи и по Escape. */
export function useDismiss(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/** Выпадающий список брендов с поиском и чекбоксами; можно добавить свой бренд. */
export function BrandPicker({ brands, selected, onToggle, onAdd, footer, meta, wide, label, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const qq = q.trim().toLowerCase();
  const list = brands.filter((b) => b.toLowerCase().includes(qq));
  const canAdd = qq.length >= 2 && !brands.some((b) => b.toLowerCase() === qq);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={'dd-trigger' + (wide ? ' wide' : '')} aria-expanded={open} onClick={() => { setOpen(!open); setQ(''); }}>
        <span className="k">Бренды</span><span className="v">{label || emptyLabel}</span><Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className={'dd-panel' + (wide ? ' wide' : '')}>
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти бренд" autoFocus aria-label="Найти бренд" />
          <div className="dd-list">
            {list.map((b) => (
              <CheckRow key={b} className="dd-opt" on={selected.includes(b)} label={b} meta={meta ? meta(b) : null} onClick={() => onToggle(b)} />
            ))}
            {canAdd && (
              <button type="button" className="dd-opt" onClick={() => { const b = q.trim(); onAdd?.([b]); onToggle(b); setQ(''); }}>
                <span className="cbx" aria-hidden="true"><Icon name="plus" size={10} style={{ color: 'var(--ink)' }} /></span>
                <span className="l">Добавить бренд «{q.trim()}»</span>
              </button>
            )}
            {!list.length && !canAdd && <div className="dd-empty">Такого бренда нет в списке</div>}
          </div>
          {footer && footer(close)}
        </div>
      )}
    </div>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}
