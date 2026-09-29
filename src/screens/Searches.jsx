import { plural, rub, whenStr } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { criteriaChips, detectTypes, emptyFilters, getResults, runKey } from '../lib/search.js';
import { isLive } from '../lib/config.js';
import { DEMO_ITEMS } from '../lib/items.js';
import { Icon } from '../components/Icon.jsx';
import { Badges } from '../components/ui.jsx';
import { useApp } from '../state.jsx';

export function Searches() {
  const app = useApp();
  return (
    <div className="page w-searches">
      <div className="page-head">
        <div>
          <h1 className="h1">Мои поиски</h1>
          <p>Сохранённые запросы со всеми параметрами. Запускаются вручную, когда вам удобно.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Новый поиск</button>
      </div>
      <div className="saved">
        {app.saved.map((x) => {
          // Сколько нашлось: в демо — по каталогу, в живом режиме — по последней выдаче, если она ещё в памяти.
          const cached = app.results[runKey(x)];
          const pool = isLive()
            ? (cached ? x.stores.flatMap((n) => cached.stores[n]?.items || []) : null)
            : DEMO_ITEMS.filter((p) => p.ds === x.ds && x.stores.includes(p.store));
          const found = pool ? getResults(pool, x.crit, emptyFilters(), 'match', { types: detectTypes(x.q) }).base.map((b) => b.p) : null;
          const meta = ['Последний раз ' + whenStr(x.last)];
          if (found) meta.push(found.length + ' ' + plural(found.length, ['вещь', 'вещи', 'вещей']));
          if (found && found.length) meta.push('от ' + rub(Math.min(...found.map((p) => p.price))));
          return (
            <div key={x.id} className="saved-item">
              <div style={{ minWidth: 0 }}>
                <div className="q">{x.q}</div>
                <div className="badges"><Badges small items={criteriaChips(x.crit, x.stores, x.ds)} /></div>
                <div className="label">{meta.join(' · ')}</div>
              </div>
              <div className="acts">
                <button type="button" className="btn-icon" title="Удалить" aria-label={'Удалить поиск «' + x.q + '»'}
                  onClick={() => { app.deleteSearch(x.id); app.notify('Поиск удалён'); }}><Icon name="trash-2" size={16} /></button>
                <button type="button" className="btn btn-secondary" onClick={() => app.relaunch(x.id)}><Icon name="rotate-ccw" size={16} />Отмерить снова</button>
              </div>
            </div>
          );
        })}
        {!app.saved.length && <div className="saved-empty">Пока нет сохранённых поисков. Нажмите «Сохранить поиск» на экране результатов.</div>}
      </div>
    </div>
  );
}
