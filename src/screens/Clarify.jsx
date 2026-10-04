import { useEffect, useState } from 'react';
import { DS_CAT, PRODUCTS, STORE_NAMES, allBrands, brandsForCats } from '../data/catalog.js';
import { isLive } from '../lib/config.js';
import { plural, rub, toggle } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { GENDER_LABEL, categoryLabel, colorList, colorStr, detectColors, sizeRequired } from '../lib/search.js';
import { Badges, BrandPicker, Chip } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useApp } from '../state.jsx';

const ANY_BRAND = 'Любой бренд';
const SIZE_OPTS = {
  trench: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], shoes: ['36', '37', '38', '39', '40', '41', '42'],
  home: ['1,5-спальный', '2-спальный', 'евро', 'семейный', 'не важно'],
};

function questionsFor(ds) {
  return {
    store: { title: 'В каких магазинах искать?', hint: 'Ищу только в отмеченных — выберите те, которым доверяете', opts: STORE_NAMES, multi: true, required: true, noCustom: true },
    size: ds === 'home'
      ? { title: 'Какой размер?', hint: 'Для постельного белья — покажу комплекты нужного размера; для остального выберите «не важно»', opts: SIZE_OPTS.home, ph: 'Свой, например 200×220' }
      : { title: 'Какой размер?', hint: 'Покажу только вещи, где ваш размер есть в наличии', opts: SIZE_OPTS[ds] || SIZE_OPTS.trench, required: true, ph: 'Свой, например 44' },
    brand: { title: 'Есть предпочтения по бренду?', hint: 'Бренд — главный критерий при сравнении', multi: true, ph: 'Другой бренд' },
    color: { title: 'Какой цвет?', hint: 'Близкие оттенки тоже покажу, но ниже', opts: ['бежевый', 'чёрный', 'белый', 'серый', 'синий', 'шоколадный', 'молочный', 'хаки', 'любой'], multi: true, ph: 'Свои, через запятую' },
    budget: { title: 'Какой бюджет?', hint: 'Вещи чуть дороже бюджета отмечу отдельно', opts: ['до 10 000 ₽', 'до 25 000 ₽', 'до 50 000 ₽', 'Не важно'], ph: 'Своя сумма, ₽' },
  };
}

function resolve(pending, ans, custom, skip) {
  const c = { ...pending.crit, brands: pending.crit.brands.slice() };
  for (const k of pending.missing) {
    if (skip && k !== 'size') continue;
    const cu = (custom[k] || '').trim();
    const a = ans[k];
    if (k === 'size') { const v = cu ? (pending.ds === 'home' ? cu : cu.toUpperCase()) : a; if (v && v !== 'не важно') c.size = v; }
    if (k === 'brand') {
      c.brands = cu
        ? cu.split(',').map((x) => x.trim()).filter(Boolean).map((x) => allBrands().find((b) => b.toLowerCase() === x.toLowerCase()) || x)
        : (a || []).filter((x) => x !== ANY_BRAND);
    }
    if (k === 'color') {
      // Свой цвет приводим к словарной форме («бирюзовые» → «бирюзовый»), чтобы он совпадал с цветом вещей.
      const v = cu ? cu.toLowerCase().split(/[,/;]+/).map((x) => x.trim()).filter(Boolean).map((x) => detectColors(x)[0] || x) : colorList(a).filter((x) => x !== 'любой');
      if (v.length) c.color = v;
    }
    if (k === 'budget') {
      const v = cu ? +cu.replace(/\D/g, '') : a && a !== 'Не важно' ? +a.replace(/\D/g, '') : null;
      if (v) c.budget = v;
    }
  }
  const stores = pending.missing.includes('store') ? ans.store || [] : pending.stores;
  return { crit: c, stores };
}

export function Clarify() {
  const app = useApp();
  const { pending } = app;
  const [ans, setAns] = useState(() => ({ brand: [], store: pending ? pending.stores.slice() : [] }));
  const [custom, setCustom] = useState({});
  const [tried, setTried] = useState(false);

  useEffect(() => { if (!pending) navigate('/', { replace: true }); }, [pending]);
  if (!pending) return null;

  const { ds, crit: c, missing } = pending;
  const Q = questionsFor(ds);
  const known = [{ k: 'Категория', v: categoryLabel(ds) }];
  if (c.color) known.push({ k: colorList(c.color).length > 1 ? 'Цвета' : 'Цвет', v: colorStr(c.color) });
  if (c.budget) known.push({ k: 'Бюджет', v: 'до ' + rub(c.budget) });
  if (c.size) known.push({ k: 'Размер', v: c.size });
  if (c.brands.length) known.push({ k: 'Бренд', v: c.brands.join(', '), t: c.brands.join(', ') });
  if (c.gender) known.push({ k: 'Для кого', v: GENDER_LABEL[c.gender] || c.gender });

  const noStore = missing.includes('store') && !(ans.store || []).length;
  const noSize = sizeRequired(ds) && missing.includes('size') && !ans.size && !(custom.size || '').trim();
  const errText = noStore && noSize
    ? 'Отметьте магазины и укажите размер — без них не получится отмерить точно.'
    : noStore ? 'Отметьте хотя бы один магазин.' : 'Укажите размер — в выдаче будут только вещи вашего размера.';

  const apply = (skip) => {
    const { crit, stores } = resolve(pending, ans, custom, skip);
    if (!stores.length || (!crit.size && sizeRequired(ds))) { setTried(true); return; }
    app.setPref('selStores', stores.slice());
    app.runSearch({ q: pending.q, ds, stores, crit });
  };

  const pick = (k, q, o) => setAns((st) => {
    let v;
    if (q.multi) v = toggle(st[k] || [], o);
    else v = st[k] === o ? null : o;
    return { ...st, [k]: v };
  });

  const qBrands = (ans.brand || []).filter((x) => x !== ANY_BRAND);
  const anyOn = (ans.brand || []).includes(ANY_BRAND);
  const inResults = (b) => {
    if (isLive()) return '';
    const n = PRODUCTS.filter((p) => p.ds === ds && p.brand === b).length;
    return n ? n + ' в выдаче' : '';
  };

  return (
    <div className="page w-clarify">
      <button type="button" className="back" style={{ marginBottom: 40 }} onClick={() => navigate('/')}><Icon name="arrow-left" size={16} />Изменить запрос</button>
      <div className="label">Уточнение · {missing.length} {plural(missing.length, ['вопрос', 'вопроса', 'вопросов'])}</div>
      <h1 className="h1" style={{ margin: '8px 0 16px' }}>«{pending.q}»</h1>
      <div className="badges">
        <span className="small muted" style={{ marginRight: 4 }}>Уже понятно</span>
        <Badges items={known} />
      </div>
      <p className="muted" style={{ margin: '24px 0', maxWidth: 600, textWrap: 'pretty' }}>Чтобы отмерить точно, нужно ещё несколько деталей. Выберите вариант или впишите свой.</p>
      <div className="q-list">
        {missing.map((k, i) => {
          const q = Q[k];
          return (
            <section key={k} className="qcard" aria-labelledby={'q-' + k}>
              <div className="qcard-head">
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div className="t" id={'q-' + k}>{q.title}{q.required && <span className="req">обязательно</span>}</div>
                  <div className="small muted" style={{ marginTop: 4 }}>{q.hint}</div>
                </div>
              </div>
              {k === 'brand' ? (
                <div className="qcard-opts">
                  <BrandPicker wide brands={brandsForCats(DS_CAT[ds] ? [DS_CAT[ds]] : [], qBrands)} selected={qBrands} onAdd={app.learnBrands} emptyLabel={anyOn ? 'любой' : 'не выбраны'}
                    label={qBrands.length ? (qBrands.length <= 2 ? qBrands.join(', ') : qBrands[0] + ' +' + (qBrands.length - 1)) : ''}
                    meta={inResults}
                    onToggle={(b) => setAns((st) => ({ ...st, brand: toggle((st.brand || []).filter((x) => x !== ANY_BRAND), b) }))}
                    footer={(close) => (
                      <div className="dd-foot">
                        <button type="button" className="strong" onClick={close}>Готово</button>
                        <button type="button" onClick={() => setAns((st) => ({ ...st, brand: [] }))}>Сбросить</button>
                      </div>
                    )} />
                  <Chip className="lg" on={anyOn} onClick={() => setAns((st) => ({ ...st, brand: anyOn ? [] : [ANY_BRAND] }))}>{ANY_BRAND}</Chip>
                </div>
              ) : (
                <div className="qcard-opts">
                  {q.opts.map((o) => {
                    const on = q.multi ? (ans[k] || []).includes(o) : ans[k] === o;
                    return <Chip key={o} on={on} onClick={() => pick(k, q, o)}>{o}</Chip>;
                  })}
                  {!q.noCustom && (
                    <input className="field-dashed" value={custom[k] || ''} placeholder={q.ph} aria-label={q.ph}
                      onChange={(e) => { const v = e.target.value; setCustom((st) => ({ ...st, [k]: v })); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') apply(false); }} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {tried && (noStore || noSize) && <div className="err" role="alert">{errText}</div>}
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => apply(false)}>Показать результаты</button>
        <button type="button" className="btn btn-secondary" onClick={() => apply(true)}>Пропустить необязательные</button>
      </div>
    </div>
  );
}
