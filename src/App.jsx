import { useEffect, useMemo } from 'react';
import { navigate, useRoute } from './lib/router.js';
import { runFromParams, runKey } from './lib/search.js';
import { Toast } from './components/ui.jsx';
import { isLive } from './lib/config.js';
import { Clarify } from './screens/Clarify.jsx';
import { Favorites } from './screens/Favorites.jsx';
import { Home } from './screens/Home.jsx';
import { Product } from './screens/Product.jsx';
import { Results } from './screens/Results.jsx';
import { Searches } from './screens/Searches.jsx';
import { ExtensionPage } from './screens/ExtensionPage.jsx';
import { useApp } from './state.jsx';

function Header({ section }) {
  const app = useApp();
  const nav = [
    ['search', '/', 'Поиск', ''],
    ['searches', '/searches', 'Мои поиски', app.saved.length],
    ['favorites', '/favorites', 'Избранное', Object.keys(app.favs).length],
  ];
  return (
    <header className="header">
      <a className="logo" href="#/" aria-label="Отмерь — на главную">
        <span className="logo-mark"><i /></span>
        <span className="logo-text">Отмерь</span>
      </a>
      <nav className="nav" aria-label="Разделы">
        {nav.map(([k, href, label, count]) => (
          <a key={k} href={'#' + href} className={section === k ? 'active' : ''} aria-current={section === k ? 'page' : undefined}>
            {label}<span className="count">{count}</span>
          </a>
        ))}
      </nav>
      <div className="header-right">
        <span className="status">Выгрузка в Google Таблицы</span>
        <div className="avatar" aria-hidden="true">А</div>
      </div>
    </header>
  );
}

const TITLES = { search: 'Поиск', searches: 'Мои поиски', favorites: 'Избранное' };

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
    if (from === 'favorites' || from === 'searches') section = from;
    screen = <Product key={productId} id={productId} from={from} />;
  } else if (path === '/searches') { screen = <Searches />; section = 'searches'; }
  else if (path === '/favorites') { screen = <Favorites />; section = 'favorites'; }
  else if (path === '/extension') { screen = <ExtensionPage />; title = 'Расширение для Chrome'; }

  const found = !!screen;
  useEffect(() => {
    if (!found) navigate('/', { replace: true });
  }, [found]);

  useEffect(() => {
    document.title = (title ? title + ' — ' : TITLES[section] !== 'Поиск' ? TITLES[section] + ' — ' : '') + 'Отмерь';
  }, [title, section]);

  return (
    <>
      <Header section={section} />
      {screen}
      <footer className="footer">
        {isLive()
          ? <>Отмерь · поиск товаров в Stockmann, Lamoda и Яндекс Маркете. Stockmann и Lamoda — через <a href="#/extension" className="underline">расширение для Chrome</a>. Цены и наличие — с сайтов магазинов на момент проверки; история цены копится с первой проверки.</>
          : 'Отмерь · демо-режим: каталог и история цен — демонстрационные данные, кнопки «Открыть в магазине» ведут на поиск по названию. Подключите сервер поиска (server/), чтобы искать настоящие товары. Поиски и избранное хранятся в этом браузере.'}
      </footer>
      <Toast message={app.toast} onDone={app.clearToast} />
    </>
  );
}
