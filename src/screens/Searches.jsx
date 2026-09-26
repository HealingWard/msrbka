import { PRODUCTS } from '../data/catalog.js';
import { PRODUCTS_F, countStr, rub, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { criteriaChips } from '../lib/search.js';
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
          const found = PRODUCTS.filter((p) => p.ds === x.ds && x.stores.includes(p.store) && (!x.crit.size || p.sizes.includes(x.crit.size)));
          return (
            <div key={x.id} className="saved-item">
              <div style={{ minWidth: 0 }}>
                <div className="q">{x.q}</div>
                <div className="tags"><Tags items={criteriaChips(x.crit, x.stores, x.ds)} variant="small" /></div>
                <div className="meta">
                  Последний запуск {whenStr(x.last)} · {countStr(found.length, PRODUCTS_F)}
                  {found.length ? ' · от ' + rub(Math.min(...found.map((p) => p.price))) : ''}
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
