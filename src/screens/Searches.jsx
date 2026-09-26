import { PRODUCTS_F, countStr, rub, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { baseProducts, criteriaChips, runKey } from '../lib/search.js';
import { isLive } from '../lib/config.js';
import { DEMO_ITEMS } from '../lib/items.js';
import { Tags } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

export function Searches() {
  const app = useApp();
  return (
    <div className="page searches">
      <div className="page-head">
        <div>
          <h1>Мои поиски</h1>
          <p>Сохранённые запросы со всеми параметрами. Запускаются вручную, когда вам нужно.</p>
        </div>
        <button type="button" className="btn btn-primary btn-md" onClick={() => navigate('/')}>Новый поиск</button>
      </div>
      <div className="saved-list">
        {app.saved.map((x) => {
          // Сколько нашлось: в демо — по каталогу, в живом режиме — по последней выдаче, если она ещё в памяти.
          const cached = app.results[runKey(x)];
          const pool = isLive()
            ? (cached ? x.stores.flatMap((n) => cached.stores[n]?.items || []) : null)
            : DEMO_ITEMS.filter((p) => p.ds === x.ds && x.stores.includes(p.store));
          const found = pool ? baseProducts(pool, x.crit) : null;
          return (
            <div key={x.id} className="saved-item">
              <div style={{ minWidth: 0 }}>
                <div className="q">{x.q}</div>
                <div className="tags"><Tags items={criteriaChips(x.crit, x.stores, x.ds)} variant="small" /></div>
                <div className="meta">
                  Последний запуск {whenStr(x.last)}
                  {found && ' · ' + countStr(found.length, PRODUCTS_F)}
                  {found && found.length ? ' · от ' + rub(Math.min(...found.map((p) => p.price))) : ''}
                </div>
              </div>
              <div className="saved-actions">
                <button type="button" className="btn-icon" title="Удалить" aria-label={'Удалить поиск «' + x.q + '»'}
                  onClick={() => { app.deleteSearch(x.id); app.notify('Поиск удалён'); }}>✕</button>
                <button type="button" className="btn btn-outline" onClick={() => app.relaunch(x.id)}>↻ Перезапустить</button>
              </div>
            </div>
          );
        })}
        {!app.saved.length && (
          <div className="empty" style={{ padding: 64 }}>Пока нет сохранённых поисков. Нажмите «Сохранить поиск» на экране результатов.</div>
        )}
      </div>
    </div>
  );
}
