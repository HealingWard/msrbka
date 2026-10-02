import { useEffect, useMemo, useRef, useState } from 'react';
import { dateShort, plural, rub, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { priceAt } from '../lib/history.js';
import { detectTypes } from '../lib/search.js';
import { changePct, deltaBadge, goalProgress, itemStatus, priceStats } from '../lib/pricing.js';
import { useHistories, withAdded } from '../lib/useHistories.js';
import { recheckFavorites } from '../lib/source.js';
import { isLive } from '../lib/config.js';
import { DEMO_BY_ID } from '../lib/items.js';
import { isSoldOut } from '../lib/product.js';
import { ExportModal } from '../components/ExportModal.jsx';
import { Icon } from '../components/Icon.jsx';
import { PriceChange, PromoTag, Tape, inCrazyDays } from '../components/ui.jsx';
import { useApp } from '../state.jsx';
import { usePersistentState } from '../lib/storage.js';

const THINGS = ['вещь', 'вещи', 'вещей'];
const ST_COLOR = { pora: 'c-drop', wait: 'c-muted', high: 'c-rise', out: 'c-rise' };

export function Lists() {
  const app = useApp();
  const { colls } = app;
  // Выбранный список и фильтры живут в сессии вкладки: вернулись со страницы вещи — всё как было.
  const [active, setActive] = usePersistentState('listsActive', 'all', 'session');
  const [priceF, setPriceF] = usePersistentState('listsPrice', 'all', 'session'); // all | down | up — изменение цены с момента добавления
  const [statusF, setStatusF] = usePersistentState('listsStatus', '', 'session'); // '' | pora | wait | high | out | crazy — клик по счётчику статуса
  const [lastOpen, setLastOpen] = usePersistentState('listsLastOpen', null, 'session');
  const [newName, setNewName] = useState(null);
  const [check, setCheck] = useState(null); // { busy, text, summary, error }
  const [exportOpen, setExportOpen] = useState(false);
  const [reload, setReload] = useState(0);

  const entries = useMemo(() => Object.entries(app.favs)
    .map(([id, fv]) => ({ id, fv, item: fv.item || DEMO_BY_ID[id] }))
    .filter((x) => x.item)
    .sort((a, b) => new Date(b.fv.addedAt) - new Date(a.fv.addedAt)), [app.favs]);
  // reload — после проверки цен история на сервере пополнилась, загружаем заново.
  const hist = useHistories(entries.map((x) => ({ ...x.item, id: x.id })), undefined, reload);

  const all = entries.map(({ id, fv, item }) => {
    const checkedAt = fv.checkedAt ? new Date(fv.checkedAt).getTime() : undefined;
    const pts = withAdded(hist(item, checkedAt), fv);
    const st = priceStats(pts, 90);
    const cur = item.price;
    const addedAt = new Date(fv.addedAt).getTime();
    const was = fv.priceAtAdd || priceAt(pts, addedAt) || cur;
    const tg = fv.target || null;
    const soldOut = isSoldOut(item, fv);
    return {
      id, item, fv, st, cur, was, tg, addedAt, soldOut,
      list: colls.some((c) => c.id === fv.coll) ? fv.coll : '',
      dl: changePct(cur, was),
      // Нет в наличии — главный статус: подходящая цена ничего не значит, пока вещь не купить.
      status: soldOut ? { k: 'out', label: 'Нет в наличии', note: cur < was ? 'подешевела, но купить нельзя' : 'ждём, когда вернётся', icon: 'ban' } : itemStatus(cur, tg, st),
      prog: goalProgress(was, cur, tg),
      checkFailed: fv.checkStatus === 'blocked' || fv.checkStatus === 'error',
    };
  });

  const activeValid = active === 'all' || active === 'none' || colls.some((c) => c.id === active) ? active : 'all';
  const listRows = all.filter((r) => activeValid === 'all' || (activeValid === 'none' ? !r.list : r.list === activeValid));
  // Два фильтра в одной строке счётчиков: статус и изменение цены с момента добавления; сочетаются друг с другом.
  const PRICE_TEST = { all: () => true, down: (r) => r.cur < r.was, up: (r) => r.cur > r.was };
  const STATUS_TEST = (k) => (k === 'crazy' ? (r) => inCrazyDays(r.item) : (r) => r.status.k === k);
  const priceRows = listRows.filter(PRICE_TEST[priceF] || PRICE_TEST.all);
  const statusRows = statusF ? listRows.filter(STATUS_TEST(statusF)) : listRows;
  const rows = statusF ? priceRows.filter(STATUS_TEST(statusF)) : priceRows;
  const sum = (a) => a.reduce((x, r) => x + r.cur, 0);
  const down = all.filter((r) => r.cur < r.was).length;
  const activeName = activeValid === 'all' ? 'Все вещи' : activeValid === 'none' ? 'Без списка' : colls.find((c) => c.id === activeValid).name;
  // Счётчик статуса считается с учётом фильтра цены, счётчик цены — с учётом статуса.
  const counts = [['pora', 'Пора', 'scissors'], ['wait', 'Ждём', 'hourglass'], ['high', 'Выше обычной', 'trending-up'], ['out', 'Нет в наличии', 'ban'], ['crazy', 'Сумасшедшие дни', null]]
    .map(([k, l, ic]) => ({ k, l, ic, n: priceRows.filter(STATUS_TEST(k)).length }))
    .filter((c) => (c.k !== 'out' && c.k !== 'crazy') || c.n > 0 || statusF === c.k);
  const priceCounts = [['down', 'Подешевели', '↓', 'c-drop'], ['up', 'Подорожали', '↑', 'c-rise']]
    .map(([k, l, ar, cls]) => ({ k, l, ar, cls, n: statusRows.filter(PRICE_TEST[k]).length }));
  const sCur = sum(rows);
  const sWas = rows.reduce((x, r) => x + r.was, 0);
  const sTg = rows.reduce((x, r) => x + (r.tg && r.cur > r.tg ? r.tg : r.cur), 0);
  const dlt = sCur - sWas;
  const unassigned = all.filter((r) => !r.list).length;

  const create = () => {
    const nm = (newName || '').trim();
    setNewName(null);
    if (nm) setActive(app.addColl(nm));
  };
  const open = (id) => { setLastOpen(id); navigate('/product/' + encodeURIComponent(id) + '?from=lists'); };
  // Вернулись со страницы вещи — прокручиваем к ней и коротко подсвечиваем.
  const backTo = useRef(lastOpen);
  useEffect(() => {
    const id = backTo.current;
    if (!id) return;
    backTo.current = null;
    setLastOpen(null);
    const el = document.querySelector('[data-row="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('back');
    setTimeout(() => el.classList.remove('back'), 1600);
  }, [setLastOpen]);

  const runCheck = async () => {
    const before = Object.fromEntries(all.map((r) => [r.id, r.cur]));
    setCheck({ busy: true, text: 'Открываю карточки вещей в магазинах…' });
    const r = await recheckFavorites(entries.map((x) => ({ ...x.item, id: x.id })), (p) => {
      if (p.stage === 'human') setCheck({ busy: true, text: 'Магазин просит подтвердить, что вы не робот, — пройдите проверку в открывшемся окне.' });
      else if (p.stage === 'recheck') setCheck({ busy: true, text: 'Проверяю ' + (p.done + 1) + ' из ' + p.total + '…' });
    });
    if (r.status !== 'ok') {
      const msg = r.status === 'noext' ? 'Нужно расширение «Отмерь» для Chrome.'
        : r.status === 'none' ? 'В списках нет вещей Stockmann и Lamoda — проверять нечего.'
          : r.status === 'demo' ? 'В демо-режиме цены не проверяются.' : 'Не получилось: ' + (r.error || 'ошибка расширения');
      setCheck({ busy: false, error: msg });
      return;
    }
    app.applyRecheck(r.results);
    const n = { down: 0, up: 0, same: 0, gone: 0, failed: 0 };
    for (const x of r.results) {
      if (x.status === 'noprice') n.gone++;
      else if (x.status !== 'ok' || !x.item) n.failed++;
      else if (x.item.price < before[x.id]) n.down++;
      else if (x.item.price > before[x.id]) n.up++;
      else n.same++;
    }
    const crazy = r.results.filter((x) => x.item && inCrazyDays(x.item)).map((x) => x.item);
    const parts = [n.down && 'подешевели ' + n.down, n.up && 'подорожали ' + n.up, n.same && 'без изменений ' + n.same,
      n.gone && 'нет в продаже ' + n.gone, n.failed && 'не открылись ' + n.failed].filter(Boolean);
    if (r.results.some((x) => x.item?.store === 'Stockmann')) parts.push(crazy.length
      ? 'в «Сумасшедших днях» Stockmann — ' + crazy.length + ': ' + crazy.map((p) => (p.brand ? p.brand + ' ' : '') + p.title).join(', ')
      : 'в «Сумасшедших днях» Stockmann — ни одной');
    setCheck({ busy: false, summary: 'Проверено ' + r.results.length + ' ' + plural(r.results.length, THINGS) + ': ' + parts.join(', ') + '.' });
    setTimeout(() => setReload((x) => x + 1), 1500);
  };

  const navItem = (id, name, list, removable) => (
    <div key={id} className="lnav-wrap">
      <button type="button" className={'lnav' + (activeValid === id ? ' on' : '')} aria-pressed={activeValid === id} onClick={() => setActive(id)}>
        <span className="nm">{name}</span>
        <span className="meta">{list.length ? list.length + ' · ' + rub(sum(list)) : 'пусто'}</span>
      </button>
      {removable && (
        <button type="button" className="del" title="Удалить список" aria-label={'Удалить список «' + name + '»'}
          onClick={() => { if (window.confirm('Удалить список «' + name + '»? Вещи останутся, но без списка.')) { app.removeColl(id); setActive('all'); } }}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="page w-lists">
      <div className="page-head">
        <div>
          <h1 className="h1">Списки и цели</h1>
          <p>{all.length} {plural(all.length, THINGS)} в {colls.length} {plural(colls.length, ['списке', 'списках', 'списках'])}. {down} подешевели с момента добавления.</p>
        </div>
        {isLive() && all.length > 0 && (
          <button type="button" className="btn btn-secondary" disabled={!!check?.busy} onClick={runCheck}>
            <Icon name="rotate-ccw" size={16} />{check?.busy ? 'Проверяю…' : 'Проверить цены'}
          </button>
        )}
      </div>
      {check && (
        <div className="note recheck-note" role="status" style={{ marginTop: 24, marginBottom: 0, ...(check.error ? { color: 'var(--rise)' } : {}) }}>
          {check.busy ? check.text + ' Окно расширения свёрнуто, на вещь уходит 5–10 секунд.' : check.error || check.summary}
        </div>
      )}

      <div className="lists-layout">
        <aside className="lists-nav" aria-label="Списки">
          <div className="label">Списки</div>
          {navItem('all', 'Все вещи', all)}
          {colls.map((c) => navItem(c.id, c.name, all.filter((r) => r.list === c.id), true))}
          {unassigned > 0 && navItem('none', 'Без списка', all.filter((r) => !r.list))}
          {newName != null ? (
            <div className="new-list">
              <input value={newName} autoFocus placeholder="Для кого список" aria-label="Для кого список"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setNewName(null); }} />
              <button type="button" className="btn btn-primary" onClick={create}>Готово</button>
            </div>
          ) : (
            <button type="button" className="add-list" onClick={() => setNewName('')}><Icon name="plus" size={16} />Новый список</button>
          )}
        </aside>

        <section className="list-main">
          <div className="list-top">
            <h2 className="h2">{activeName}</h2>
            <div className="st-counts">
              {counts.map((c) => (
                <button key={c.k} type="button" className={'stc' + (statusF === c.k ? ' on' : '')} aria-pressed={statusF === c.k}
                  title={statusF === c.k ? 'Показать все статусы' : 'Показать только «' + c.l + '»'} onClick={() => setStatusF(statusF === c.k ? '' : c.k)}>
                  {c.ic ? <Icon name={c.ic} size={16} className={ST_COLOR[c.k]} /> : <i className="sw10" style={{ background: 'var(--tape)', borderColor: 'var(--tape)' }} />}
                  {c.l} <span className="mono">{c.n}</span>
                  {statusF === c.k && <Icon name="x" size={12} />}
                </button>
              ))}
              <span className="stc-sep" aria-hidden="true" />
              {priceCounts.map((c) => (
                <button key={c.k} type="button" className={'stc' + (priceF === c.k ? ' on' : '')} aria-pressed={priceF === c.k}
                  title={priceF === c.k ? 'Показать все цены' : c.l + ' с момента добавления в списки'} onClick={() => setPriceF(priceF === c.k ? 'all' : c.k)}>
                  <span className={'ar ' + c.cls}>{c.ar}</span>{c.l} <span className="mono">{c.n}</span>
                  {priceF === c.k && <Icon name="x" size={12} />}
                </button>
              ))}
            </div>
          </div>

          {rows.length > 0 ? (
            <>
              <div className="ltbl">
                <div className="ltbl-in">
                  <div className="lrow head"><span /><span>Вещь</span><span>Статус</span><span>Сейчас</span><span>До цели</span><span>Список</span><span /></div>
                  {rows.map((r) => {
                    const type = r.item.kind || detectTypes(r.item.title)[0] || '';
                    return (
                      <div key={r.id} data-row={r.id} className={'lrow' + (r.soldOut ? ' out' : '')}>
                        <button type="button" className="tph" onClick={() => open(r.id)} aria-label={'Открыть ' + r.item.title}>
                          {r.item.image && <img src={r.item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}
                        </button>
                        <button type="button" className="item" onClick={() => open(r.id)}>
                          <div className="label">{r.item.store}{type ? ' · ' + type : ''}</div>
                          <div style={{ marginTop: 2 }}>{r.item.brand && <b>{r.item.brand}</b>} {r.item.title}</div>
                          {r.soldOut && <span className="oos-tag">Нет в наличии</span>}
                          <PromoTag promo={r.item.promo} />
                        </button>
                        <div className="lst">
                          <Icon name={r.status.icon} size={18} className={ST_COLOR[r.status.k]} />
                          <div><b>{r.status.label}</b><small>{r.status.note}</small></div>
                        </div>
                        <div className="lnow">
                          <span className="price">{rub(r.cur)}</span>
                          <PriceChange small badge={deltaBadge(r.dl)} title={'с момента добавления: было ' + rub(r.was) + ', сейчас ' + rub(r.cur)}>{' '}<span>с {dateShort(r.addedAt)}</span></PriceChange>
                          {(r.checkFailed || r.fv.checkedAt) && (
                            <span className="sub">{r.checkFailed ? 'не удалось проверить' : (r.soldOut ? 'цена последней проверки · ' : 'проверено ') + whenStr(r.fv.checkedAt)}</span>
                          )}
                        </div>
                        <div>
                          {r.tg ? (
                            <div className="lgoal">
                              <Tape value={r.prog} done={r.prog >= 1} />
                              <div className="row"><span>цель {rub(r.tg)}</span><span>{r.cur <= r.tg ? 'достигнута' : 'осталось ' + rub(r.cur - r.tg)}</span></div>
                            </div>
                          ) : (
                            <button type="button" className="link small" onClick={() => open(r.id)}>Задать цель</button>
                          )}
                        </div>
                        <select value={r.list} onChange={(e) => app.setFavColl(r.id, e.target.value)} aria-label="Список">
                          {!r.list && <option value="">Без списка</option>}
                          {colls.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <button type="button" className="btn-icon sm ghost" title="Больше не следить" aria-label="Больше не следить" onClick={() => app.toggleFav(r.item)}>
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="totals">
                <div><div className="label">Итог списка сейчас</div><div className="v">{rub(sCur)}</div></div>
                <div><div className="label">Если дождаться целей</div><div className="v">{rub(sTg)}</div></div>
                <div><div className="label">С момента добавления</div><div className="v">{(dlt < 0 ? '↓ −' : dlt > 0 ? '↑ +' : '= ') + rub(Math.abs(dlt))}</div></div>
                <button type="button" className="btn btn-paper" onClick={() => setExportOpen(true)}><Icon name="sheet" size={18} />Выгрузить в Google Sheets</button>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: '80px 40px' }}>
              <div className="ruler mini" aria-hidden="true" />
              <div className="h1">Семь раз отмерь — один раз купи.</div>
              {listRows.length > 0 ? (
                <>
                  <div className="muted">{statusF ? 'С таким статусом вещей нет' + (priceF !== 'all' ? ' среди отобранных по цене.' : '.') : priceF === 'down' ? 'Ни одна вещь в этом списке не подешевела с момента добавления.' : priceF === 'up' ? 'Ни одна вещь в этом списке не подорожала с момента добавления.' : 'Цены вещей в этом списке не менялись с момента добавления.'}</div>
                  <button type="button" className="btn btn-primary" onClick={() => { setPriceF('all'); setStatusF(''); }}>Показать все вещи</button>
                </>
              ) : (
                <>
                  <div className="muted">В этом списке пока нет вещей.</div>
                  <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Найти вещь</button>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {exportOpen && (
        <ExportModal kind="lists" query="списки и цели" listRows={rows} allRows={all} colls={colls} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}
