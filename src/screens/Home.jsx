import { useState } from 'react';
import { CATS, STORES, STORE_NAMES, allBrands } from '../data/catalog.js';
import { STORES_F, countStr, toggle, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { missingCriteria, parseQuery, sizeRequired } from '../lib/search.js';
import { BrandPicker, CheckRow, useDismiss } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

const EXAMPLES = [
  ['бежевый тренч до 25 000', 'уточню размер и бренд'],
  ['белые кеды Veja, 38 размер, до 15 000', 'без уточнений, если магазины выбраны'],
  ['чёрный тренч 12 Storeez S до 30 000', 'сразу к результатам'],
];

function StorePicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const n = selected.length;
  const label = n === STORE_NAMES.length ? 'все ' + n : !n ? 'не выбраны' : n === 1 ? selected[0] : n + ' из ' + STORE_NAMES.length;
  return (
    <div className="dd" ref={ref}>
      <button type="button" className="dd-trigger" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">Магазины</span><span className="v">{label}</span><span className="caret">▾</span>
      </button>
      {open && (
        <div className="dd-panel" style={{ width: 280 }}>
          <div className="dd-note">Ищем во всех отмеченных</div>
          {STORES.map((s) => (
            <CheckRow key={s.name} on={selected.includes(s.name)} label={s.name} meta={s.domain} onClick={() => onChange(toggle(selected, s.name))} />
          ))}
          <div className="dd-foot">
            <button type="button" className="strong" onClick={() => onChange(STORE_NAMES.slice())}>Выбрать все</button>
            <button type="button" onClick={() => onChange([])}>Сбросить</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Home() {
  const app = useApp();
  const { prefs, setPref, query, setQuery } = app;
  const { selStores, selBrands, cats } = prefs;

  const start = () => {
    const q = query.trim();
    if (!q) return;
    const p = parseQuery(q, cats);
    // «Для кого» к товарам для дома не относится.
    const gender = p.ds === 'home' ? null : p.gender || (prefs.gender && prefs.gender !== 'any' ? prefs.gender : null);
    const crit = { brands: p.brands.length ? p.brands : selBrands.slice(), size: p.size, color: p.color, budget: p.budget, ...(gender ? { gender } : {}) };
    let missing = missingCriteria(crit, p.ds);
    if (!prefs.askClarify) missing = crit.size || !sizeRequired(p.ds) ? [] : ['size'];
    if (!selStores.length || missing.length) {
      // Вопрос о магазинах показываем всегда — с уже отмеченными вариантами.
      missing = ['store', ...missing];
      app.setPending({ q, ds: p.ds, crit, missing, stores: selStores.slice() });
      navigate('/clarify');
    } else {
      app.runSearch({ q, ds: p.ds, stores: selStores.slice(), crit });
    }
  };

  const brandsLabel = !selBrands.length ? 'любые' : selBrands.length === 1 ? selBrands[0] : selBrands[0] + ' +' + (selBrands.length - 1);

  return (
    <div className="page home">
      <div className="mono-label">Новый поиск</div>
      <h1>Опишите, что хотите найти — я проверю все выбранные магазины</h1>
      <form className="searchbox" onSubmit={(e) => { e.preventDefault(); start(); }} role="search">
        <input className="q" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Что ищем"
          placeholder="Например, бежевый тренч до 25 000" autoFocus />
        <div className="searchbox-bar">
          <StorePicker selected={selStores} onChange={(v) => setPref('selStores', v)} />
          <BrandPicker brands={allBrands()} selected={selBrands} label={brandsLabel} onAdd={app.learnBrands}
            onToggle={(b) => setPref('selBrands', (list) => toggle(list, b))}
            footer={() => (
              <div className="dd-foot">
                <span className="muted">{selBrands.length ? 'Выбрано: ' + selBrands.length : 'Не выбрано — любые'}</span>
                <button type="button" onClick={() => setPref('selBrands', [])}>Сбросить</button>
              </div>
            )} />
          <div className="spacer" />
          <span className="hint">{selStores.length ? 'Enter — искать' : 'Магазины не выбраны — спрошу'}</span>
          <button type="submit" className="btn btn-primary">Найти</button>
        </div>
      </form>
      <div className="cat-row">
        <span className="label">Для кого</span>
        {[['women', 'Женщинам'], ['men', 'Мужчинам'], ['any', 'Всем']].map(([k, l]) => {
          const on = (prefs.gender || 'any') === k;
          return <button key={k} type="button" aria-pressed={on} className={'chip' + (on ? ' on' : '')} onClick={() => setPref('gender', k)}>{l}</button>;
        })}
      </div>
      <div className="cat-row" style={{ marginTop: 10 }}>
        <span className="label">Категории</span>
        {CATS.map((c) => (
          <button key={c} type="button" aria-pressed={cats.includes(c)} className={'chip' + (cats.includes(c) ? ' on' : '')}
            onClick={() => setPref('cats', (list) => toggle(list, c))}>{c}</button>
        ))}
      </div>
      <div className="two-col">
        <div>
          <div className="mono-label section-head">Примеры запросов</div>
          {EXAMPLES.map(([q, note]) => (
            <button key={q} type="button" className="example" onClick={() => setQuery(q)}>
              <span>{q}</span><span className="note">{note}</span>
            </button>
          ))}
        </div>
        <div>
          <div className="mono-label section-head">Мои поиски</div>
          {app.saved.slice(0, 3).map((x) => (
            <div key={x.id} className="recent">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="q">{x.q}</div>
                <div className="meta">{countStr(x.stores.length, STORES_F)} · запуск {whenStr(x.last)}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => app.relaunch(x.id)}>↻ Запустить</button>
            </div>
          ))}
          {!app.saved.length && <div className="empty-note">Сохраните поиск на экране результатов — он появится здесь.</div>}
        </div>
      </div>
    </div>
  );
}
