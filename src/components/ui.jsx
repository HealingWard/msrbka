import { useEffect, useRef, useState } from 'react';

export function Box({ on }) {
  return <span className={'box' + (on ? ' on' : '')} aria-hidden="true">{on ? '✓' : ''}</span>;
}

export function CheckRow({ on, label, meta, onClick, compact, children }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className={'checkbox-row' + (compact ? ' compact' : '')} onClick={onClick}>
      <Box on={on} />
      {children}
      <span className="label">{label}</span>
      {meta != null && meta !== '' && <span className="meta">{meta}</span>}
    </button>
  );
}

export function Segmented({ options, value, onChange, tall, label }) {
  return (
    <div className={'segmented' + (tall ? ' tall' : '')} role="radiogroup" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Tags({ items, variant = '' }) {
  return items.map((x) => (
    <span key={x.k} className={'tag ' + variant} title={x.t || undefined}>
      <span className="k">{x.k}</span><span className="v">{x.v}</span>
    </span>
  ));
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

/** Выпадающий список с чекбоксами и поиском — для брендов. */
export function BrandPicker({ brands, selected, onToggle, onAdd, footer, meta, wide, label, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const list = brands.filter((b) => b.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={'dd-trigger' + (wide ? ' wide' : '')} aria-expanded={open} onClick={() => { setOpen(!open); setQ(''); }}>
        <span className="k">Бренды</span><span className="v">{label || emptyLabel}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className="dd-panel" style={wide ? { width: 320 } : undefined}>
          <input className="dd-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти бренд" autoFocus />
          <div className="dd-list" style={wide ? { maxHeight: 300 } : undefined}>
            {list.map((b) => (
              <CheckRow key={b} on={selected.includes(b)} label={b} meta={meta ? meta(b) : null} onClick={() => onToggle(b)} />
            ))}
            {q.trim().length >= 2 && !brands.some((b) => b.toLowerCase() === q.trim().toLowerCase()) && (
              <button type="button" className="checkbox-row" onClick={() => { const b = q.trim(); onAdd?.([b]); onToggle(b); setQ(''); }}>
                <span className="box" aria-hidden="true">+</span><span className="label">Добавить бренд «{q.trim()}»</span>
              </button>
            )}
            {!list.length && q.trim().length < 2 && <div className="dd-empty">Ничего не нашлось</div>}
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
