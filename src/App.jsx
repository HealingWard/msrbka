import { useEffect, useMemo, useState } from 'react';
import { navigate, useRoute } from './lib/router.js';
import { runFromParams, runKey } from './lib/search.js';
import { startSearch } from './lib/startSearch.js';
import { ddmm } from './lib/format.js';
import { Icon } from './components/Icon.jsx';
import { Toast } from './components/ui.jsx';
import { isLive } from './lib/config.js';
import { Clarify } from './screens/Clarify.jsx';
import { Lists } from './screens/Lists.jsx';
import { Home } from './screens/Home.jsx';
import { Product } from './screens/Product.jsx';
import { Results } from './screens/Results.jsx';
import { Searches } from './screens/Searches.jsx';
import { ExtensionPage } from './screens/ExtensionPage.jsx';
import { useApp } from './state.jsx';

function HeaderSearch() {
  const app = useApp();
  const [q, setQ] = useState(app.query);
  useEffect(() => setQ(app.query), [app.query]);
  return (
    <form className="hdr-search" role="search" onSubmit={(e) => { e.preventDefault(); startSearch(app, q); }}>
      <Icon name="search" size={18} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Что отмерить" aria-label="Что отмерить" />
    </form>
  );
}

function Header({ section, isHome }) {
  const app = useApp();
  const nav = [
    ['search', '/', 'Поиск', ''],
    ['searches', '/searches', 'Мои поиски', app.saved.length],
    ['lists', '/lists', 'Списки и цели', Object.keys(app.favs).length],
  ];
  return (
    <header className="hdr">
      <a className="logo" href="#/" aria-label="Отмерь — на главную">
        <span className="logo-text">Отмерь</span>
        <span className="logo-tape" aria-hidden="true"><i /><i /><i /></span>
      </a>
      <nav className="nav" aria-label="Разделы">
        {nav.map(([k, href, label, count]) => (
          <a key={k} href={'#' + href} className={section === k ? 'on' : ''} aria-current={section === k ? 'page' : undefined}>
            {label}{count !== '' && <span className="n">{count}</span>}
          </a>
        ))}
      </nav>
      <div className="hdr-right">
        {!isHome && <HeaderSearch />}
        <a className="avatar" href="#/extension" title="Расширение для Chrome">А</a>
      </div>
    </header>
  );
}

function Footer() {
  const app = useApp();
  const at = app.lastRun?.at;
  const checked = at ? ' · проверено ' + ddmm(at) + ', ' + new Date(at).toTimeString().slice(0, 5) : '';
  return (
    <footer className="ftr">
      <span className="slogan">Семь раз отмерь — один раз купи.</span>
      <span className="label">
        {isLive() ? <>Stockmann · Lamoda · Яндекс Маркет{checked} · <a href="#/extension">расширение для Chrome</a></>
          : 'Демо-режим: каталог и история цен — демонстрационные данные'}
      </span>
    </footer>
  );
}

const TITLES = { search: '', searches: 'Мои поиски', lists: 'Списки и цели' };

export function App() {
  const route = useRoute();
  const app = useApp();
  const { path, params } = route;
  const qs = params.toString();
  const run = useMemo(() => (path === '/results' ? runFromParams(new URLSearchParams(qs)) : null), [path, qs]);

  let screen = null;
  let section = 'search';
  let title = null;
  const productMatch = path.match(/^\/product\/(.+)$/);
  let productId = null;
  if (productMatch) { try { productId = decodeURIComponent(productMatch[1]); } catch { productId = productMatch[1]; } }

  if (path === '/') { screen = <Home />; }
  else if (path === '/clarify') { screen = <Clarify />; title = 'Уточнение'; }
  else if (path === '/results' && run) { screen = <Results key={runKey(run)} run={run} />; title = run.q; }
  else if (productMatch) {
    const from = params.get('from') || '';
    if (from === 'favorites' || from === 'lists') section = 'lists';
    if (from === 'searches') section = 'searches';
    screen = <Product key={productId} id={productId} from={from === 'favorites' ? 'lists' : from} />;
  } else if (path === '/searches') { screen = <Searches />; section = 'searches'; }
  else if (path === '/lists' || path === '/favorites') { screen = <Lists />; section = 'lists'; }
  else if (path === '/extension') { screen = <ExtensionPage />; title = 'Расширение для Chrome'; }

  const found = !!screen;
  useEffect(() => {
    if (!found) navigate('/', { replace: true });
  }, [found]);

  useEffect(() => {
    const t = title || TITLES[section];
    document.title = (t ? t + ' — ' : '') + 'Отмерь';
  }, [title, section]);

  return (
    <>
      <Header section={section} isHome={path === '/'} />
      <main className="main">{screen}</main>
      <Footer />
      <Toast message={app.toast} onDone={app.clearToast} />
    </>
  );
}
