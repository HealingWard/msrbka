import { navigate } from './router.js';
import { missingCriteria, parseQuery, sizeRequired } from './search.js';

/**
 * Запуск поиска из строки запроса (главная и поле в шапке): разбирает запрос и либо сразу ищет,
 * либо ведёт на уточняющие вопросы (магазины и размер обязательны).
 */
export function startSearch(app, query) {
  const { prefs } = app;
  const q = String(query || '').trim();
  if (!q) return;
  const p = parseQuery(q, prefs.cats);
  // «Для кого» к товарам для дома не относится; к нераспознанным («прочее») — только если сказано в запросе.
  const gender = p.ds === 'home' ? null : p.gender || (p.ds !== 'other' && prefs.gender && prefs.gender !== 'any' ? prefs.gender : null);
  const crit = { brands: p.brands.length ? p.brands : prefs.selBrands.slice(), size: p.size, color: p.color, budget: p.budget, ...(gender ? { gender } : {}) };
  let missing = missingCriteria(crit, p.ds);
  if (!prefs.askClarify) missing = crit.size || !sizeRequired(p.ds) ? [] : ['size'];
  app.setQuery(q);
  // Бренды, отмеченные на главной, относятся к этому поиску — к следующим они не «прилипают».
  if (prefs.selBrands.length) app.setPref('selBrands', []);
  if (!prefs.selStores.length || missing.length) {
    // Вопрос о магазинах показываем всегда — с уже отмеченными вариантами.
    missing = ['store', ...missing];
    app.setPending({ q, ds: p.ds, crit, missing, stores: prefs.selStores.slice() });
    navigate('/clarify');
  } else {
    app.runSearch({ q, ds: p.ds, stores: prefs.selStores.slice(), crit });
  }
}
