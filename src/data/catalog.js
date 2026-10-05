// Каталог «Отмерь». Демонстрационные данные из дизайна: товары, магазины, бренды, цвета.
// Ссылки на товары ведут на реальный поиск в соответствующем магазине.

// Порядок — по приоритету: Stockmann, Lamoda, затем Яндекс Маркет.
// ext: магазин ищется через расширение для Chrome (сайты закрыты от серверных запросов).
export const STORES = [
 {id:'stockmann',name:'Stockmann',domain:'stockmann.ru',search:'https://stockmann.ru/search/?q=',ext:true},
 {id:'lamoda',name:'Lamoda',domain:'lamoda.ru',search:'https://www.lamoda.ru/catalogsearch/result/?q=',ext:true},
 {id:'market',name:'Яндекс Маркет',domain:'market.yandex.ru',search:'https://market.yandex.ru/search?text='}];

export const STORE_NAMES = STORES.map((s) => s.name);

const STOCKMANN_BRANDS = ['A + MORE','Airwool','Artie','Ash','BCONB','Be mine','Belucci','Benetton','Benetton Undercolors','Betty & Co','Betty Barclay','Blauer','Boboli','Bodyguard','Bogi','Bogi Accessories','BOSS','Braccialini','Brax','Bronx','Bugatti','Calvin Klein','Calvin Klein Jeans','Canoe','Cap Horn','Choupette','Cole Haan','Colorplay','Comma','Consliue','Converse','Crocs','Cube Co','cut pret','cut pret PLUS','D.Molina','Dare 2b','DeCoussart','Delsey','Desigual','Digel','Dirk Bikkembergs','Dixi Coat','Doppler','Dr Martens','Dustin','EA7','Eberhart','EDC','Esprit','Esprit Casual','Esprit Collection','Ever be','FILA','Freestyle','Gant','Geox','Gerry Weber','Gerry Weber Casual','Gioseppo','Green Coast','Guess','Guess Jeans','Hobbs','HUGO','iBlues','Icepeak','IDO','Imac','Jack & Jones','Juicy Couture','Jupiter','Karl Lagerfeld','Kerry','Kivat','Lasessor','Lassie','Lauren Ralph Lauren','Lee','Lerros','Levi\'s','Lindbergh','Losan','Love Moschino','Luhta','Manila Grace','Marc O\'Polo','Marc O\'Polo Denim','Marco di Radi','Marvelis','Maximo','Mayoral','Michael Michael Kors','Minelli','Molo','More & More','Mum of Six','Mursu','Name It','Napapijri','Nike','Noom','Norveg','Oasis','Odri Mio','Oldos','Olymp','Only','Only & Sons','Original Marines','OVS','Paola Ray','Peter Jorgen','Petit Bateau','Pierre Cardin','Pollini','Puma','Regatta','Reima','Reporter Young','Rinascimento','Robinzon','s.Oliver','Sabrina Scala','Samoon','Sand','Selected','Serefina','Shine Original','Silver Spoon Life','Silvian Heach','Steve Madden','Stockmann 1862','Superdry','Superfit','Taifun','Tommy Hilfiger','Tommy Jeans','Trussardi Jeans','Twinset','UGG','Ugo Carducci','United Nude','Vagabond','Valentino','Vero Moda','Viking','Warehouse','Woden','Wonders','Wool&Cotton','Андерсен','Эвантюэль',
 'COS','Massimo Dutti','Weekend Max Mara','Veja','New Balance'];

// Бренды из меню Stockmann (сумки, аксессуары, обувь), которых нет в фильтрах одежды.
const STOCKMANN_MENU_BRANDS = ['Furla','Coccinelle','Pinko','Moschino','Mellizos','Franco Vello','Auranna','Oulyss','Piquadro',
 'Emporio Armani','Cerruti 1881','Armani Exchange','Sandro','Allsaints','Ted Baker','Marc Jacobs','Maje','Hunter','Rich&Royal',
 'Diesel','Didriksons','C.P. Company','Autry','Dsquared2','Vivienne Westwood','MM6','Ferragamo','Versace','Alessandro Borelli',
 'DKNY','Lancaster','Kersten','Andrea Fontebasso','Emme Marella','Gioco','PlayToday','Kisu'];

/** Ключ для сравнения брендов: без регистра, пробелов и знаков («Marc O’Polo» = «MARC O'POLO»). */
export const brandKey = (b) => String(b || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');

const dedupeBrands = (list) => {
  const m = new Map();
  for (const b of list) if (!m.has(brandKey(b))) m.set(brandKey(b), b);
  return [...m.values()];
};

export const BRANDS = dedupeBrands(['12 Storeez','Adidas','Befree','Ekonika','Lime','Love Republic','Mango',...STOCKMANN_BRANDS,...STOCKMANN_MENU_BRANDS]).sort((a,b)=>a.localeCompare(b,'ru',{sensitivity:'base'}));

// Бренды, которые встретились в фильтрах магазинов при поиске (Stockmann, Lamoda), — пополняют список выше.
const brandKeys = new Set(BRANDS.map(brandKey));
const learnedBrands = [];
let allBrandsCache = BRANDS;
/** Добавляет бренды в общий список (без учёта регистра и знаков). Возвращает число новых. */
export function addKnownBrands(list) {
  let added = 0;
  for (const raw of list || []) {
    const b = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!b || b.length > 60 || !brandKey(b) || brandKeys.has(brandKey(b))) continue;
    brandKeys.add(brandKey(b));
    learnedBrands.push(b);
    added++;
  }
  if (added) allBrandsCache = [...BRANDS, ...learnedBrands].sort((a,b)=>a.localeCompare(b,'ru',{sensitivity:'base'}));
  return added;
}
export const allBrands = () => allBrandsCache;
export const learnedBrandList = () => learnedBrands.slice();
export const CATS=['Одежда','Обувь','Аксессуары','Товары для дома'];

// Бренды по категориям: из фильтра «Бренд» в выдаче магазинов (раз в неделю расширение открывает выдачу
// по «одежда», «обувь», «аксессуары», «сумки», «товары для дома») и из выдачи ваших поисков.
export const CAT_KEY = { 'Одежда': 'clothes', 'Обувь': 'shoes', 'Аксессуары': 'acc', 'Товары для дома': 'home' };
export const DS_CAT = { trench: 'clothes', shoes: 'shoes', acc: 'acc', home: 'home' };
const MIN_CAT_BRANDS = 10; // меньше — список категории ещё не собран, показываем все бренды
const catBrands = { clothes: new Map(), shoes: new Map(), acc: new Map(), home: new Map() };
/** Добавляет бренды категории (clothes | shoes | acc | home). Возвращает число новых. */
export function addCatBrands(cat, list) {
  const m = catBrands[cat];
  if (!m) return 0;
  let added = 0;
  for (const raw of list || []) {
    const b = String(raw || '').replace(/\s+/g, ' ').trim();
    const k = brandKey(b);
    if (!b || b.length > 60 || !k || m.has(k)) continue;
    m.set(k, b);
    added++;
  }
  if (added) addKnownBrands(list);
  return added;
}
/** Сколько брендов собрано по категории. */
export const catBrandCount = (cat) => catBrands[cat]?.size || 0;
/**
 * Бренды для выбора: только бренды выбранных категорий (ключи clothes | shoes | acc | home).
 * Категории, по которым список ещё не собран, пропускаем; все бренды — только если не собран ни один.
 * keep — бренды, которые должны остаться в списке (уже выбранные).
 */
export function brandsForCats(cats, keep = []) {
  const keys = (cats || []).filter((c) => catBrands[c] && catBrands[c].size >= MIN_CAT_BRANDS);
  const sort = (a) => a.sort((x, y) => x.localeCompare(y, 'ru', { sensitivity: 'base' }));
  if (!keys.length) return sort(dedupeBrands([...allBrands(), ...keep]));
  // Написание — как в нашем списке («12 Storeez», а не «12 STOREEZ» из фильтра магазина).
  const canon = new Map(BRANDS.map((b) => [brandKey(b), b]));
  return sort(dedupeBrands([...keep, ...keys.flatMap((c) => [...catBrands[c].values()]).map((b) => canon.get(brandKey(b)) || b)]));
}
export const HEX={'бежевый':'#D8C3A0','молочный':'#F0EADC','песочный':'#CDB48A','кэмел':'#B8894F','кремовый':'#EDE3CC','хаки':'#8A8664','чёрный':'#1E1E1E','белый':'#FBFBF8','серый':'#9A9A96','синий':'#2F4A7A','тёмно-синий':'#1F2B45','шоколадный':'#5A3A28','коричневый':'#7A5234','графитовый':'#4A4B4F','бирюзовый':'#3FB5AE','голубой':'#8EC5E6','мятный':'#A8DCC4','зелёный':'#3E8E5A','оливковый':'#707A3A','изумрудный':'#1F7A5C','розовый':'#F2A7BE','пудровый':'#E8C4BE','персиковый':'#F6B98E','коралловый':'#F07A5F','красный':'#C8302F','бордовый':'#7A2230','терракотовый':'#B4532A','рыжий':'#C0662B','оранжевый':'#EE8A2E','жёлтый':'#EFCB3A','горчичный':'#C9A227','фиолетовый':'#6A4C93','сиреневый':'#B9A2D6','лиловый':'#9C6FB6','фуксия':'#C8358C','золотой':'#C9A64A','серебряный':'#BFC3C7','бронзовый':'#9A6B3A'};
export const NEAR={'бежевый':['песочный','молочный','кэмел','кремовый'],'белый':['молочный','кремовый'],'чёрный':['серый'],'молочный':['белый','кремовый','бежевый'],'серый':['графитовый'],'песочный':['бежевый','кэмел'],'синий':['тёмно-синий'],'тёмно-синий':['синий'],'шоколадный':['коричневый','кэмел'],'коричневый':['шоколадный','кэмел'],'графитовый':['серый','чёрный'],'бирюзовый':['голубой','мятный','изумрудный'],'голубой':['бирюзовый','синий','мятный'],'мятный':['бирюзовый','зелёный','голубой'],'зелёный':['мятный','изумрудный','оливковый','хаки'],'изумрудный':['зелёный','бирюзовый'],'оливковый':['хаки','зелёный'],'хаки':['оливковый','зелёный'],'розовый':['пудровый','персиковый','фуксия'],'пудровый':['розовый','бежевый'],'персиковый':['розовый','коралловый'],'коралловый':['красный','персиковый','оранжевый'],'красный':['бордовый','коралловый'],'бордовый':['красный','фиолетовый'],'терракотовый':['рыжий','коричневый','оранжевый'],'рыжий':['терракотовый','оранжевый','кэмел'],'оранжевый':['рыжий','коралловый'],'жёлтый':['горчичный'],'горчичный':['жёлтый','кэмел'],'фиолетовый':['лиловый','сиреневый'],'сиреневый':['лиловый','фиолетовый'],'лиловый':['сиреневый','фиолетовый'],'фуксия':['розовый'],'золотой':['бронзовый','жёлтый'],'серебряный':['серый'],'бронзовый':['золотой','коричневый']};
export const ALLSIZES={trench:['XS','S','M','L','XL'],shoes:['36','37','38','39','40','41']};

const TR=[
 ['t1','12 Storeez','Тренч из хлопкового габардина','бежевый',23990,29990,'Lamoda',4.8,312,['XS','S','M','L']],
 ['t2','Lime','Тренч оверсайз с поясом','молочный',12999,15999,'Lamoda',4.6,1204,['XS','S','M']],
 ['t3','Massimo Dutti','Двубортный тренч из хлопка','бежевый',26990,null,'Stockmann',4.7,88,['S','M','L','XL']],
 ['t4','Mango','Классический тренч с поясом','песочный',11999,17999,'Яндекс Маркет',4.5,640,['XS','S','M','L','XL']],
 ['t5','COS','Тренч свободного кроя','бежевый',24500,27900,'Stockmann',4.6,57,['M','L']],
 ['t6','Calvin Klein','Тренч из водоотталкивающего хлопка','кэмел',28990,34990,'Lamoda',4.4,96,['S','M','L']],
 ['t7','Weekend Max Mara','Тренч из габардина','бежевый',54900,61000,'Stockmann',4.9,23,['S','M']],
 ['t8','Love Republic','Укороченный тренч','молочный',7999,9999,'Яндекс Маркет',4.3,2210,['XS','S','M','L']],
 ['t9','Befree','Тренч с погонами','песочный',5499,6999,'Яндекс Маркет',4.1,3480,['XS','S','M','L','XL']],
 ['t10','Tommy Hilfiger','Тренч с поясом и логотипом','хаки',31990,39990,'Lamoda',4.7,141,['M','L','XL']],
 ['t11','12 Storeez','Тренч-рубашка из вискозы','чёрный',18990,null,'Lamoda',4.7,76,['S','M']],
 ['t12','Lime','Удлинённый тренч из хлопка','бежевый',16999,null,'Яндекс Маркет',4.5,402,['S','L'],'Осталось мало'],
 ['t13','Mango','Тренч из смесового хлопка','бежевый',13999,19999,'Lamoda',4.4,518,['XS','XL']],
 ['t14','Massimo Dutti','Тренч с кожаными деталями','кремовый',32990,null,'Stockmann',4.8,34,['M'],'Осталось мало'],
 ['t29','Marc O\'Polo','Тренч из хлопка с поясом','синий',28990,35990,'Stockmann',4.6,74,['S','M','L','XL']],
 ['t30','BOSS','Тренч прямого кроя','тёмно-синий',44990,54990,'Stockmann',4.8,38,['M','L','XL']],
 ['t31','Tommy Hilfiger','Классический тренч','синий',31990,39990,'Lamoda',4.7,146,['XS','S','M','L','XL']],
 ['t32','Gerry Weber','Тренч средней длины','серый',18990,23990,'Stockmann',4.5,92,['M','L','XL']],
 ['t33','Massimo Dutti','Тренч из смесовой шерсти','серый',26990,null,'Lamoda',4.7,203,['XS','S','M','L']],
 ['t34','Lauren Ralph Lauren','Тренч с поясом','графитовый',39990,48990,'Stockmann',4.8,27,['S','M','L','XL']],
 ['t35','Weekend Max Mara','Тренч из габардина','шоколадный',64990,79990,'Stockmann',4.9,33,['S','M','L','XL']],
 ['t36','Karl Lagerfeld','Тренч с поясом','шоколадный',36990,null,'Stockmann',4.6,21,['XS','S','M','XL'],'Осталось мало'],
 ['t37','Esprit','Тренч из переработанного хлопка','коричневый',15990,19990,'Яндекс Маркет',4.4,318,['S','M','L','XL']],
 ['t38','s.Oliver','Тренч с капюшоном','синий',13990,17490,'Яндекс Маркет',4.3,642,['M','L','XL']],
 ['t15','BOSS','Тренч из хлопкового твила','бежевый',42990,53990,'Stockmann',4.8,64,['S','M','L']],
 ['t16','Marc O\'Polo','Тренч прямого кроя с поясом','песочный',27990,34990,'Stockmann',4.7,112,['XS','S','M','L']],
 ['t17','Gerry Weber','Тренч средней длины','бежевый',19990,24990,'Stockmann',4.5,187,['M','L','XL']],
 ['t18','Esprit','Тренч из переработанного хлопка','кэмел',14990,18990,'Stockmann',4.4,236,['XS','S','M']],
 ['t19','Lauren Ralph Lauren','Двубортный тренч с погонами','бежевый',38990,null,'Stockmann',4.9,41,['S','M']],
 ['t20','Guess','Тренч с металлической фурнитурой','молочный',24990,31990,'Lamoda',4.5,158,['XS','S','M','L']],
 ['t21','Karl Lagerfeld','Укороченный тренч с логотипом','чёрный',34990,43990,'Stockmann',4.6,52,['S','M','L']],
 ['t22','Vero Moda','Тренч свободного силуэта','бежевый',7490,9990,'Яндекс Маркет',4.3,1640,['XS','S','M','L','XL']],
 ['t23','Desigual','Тренч с контрастной подкладкой','хаки',17990,22490,'Stockmann',4.2,73,['S','M','L']],
 ['t24','Twinset','Тренч из габардина с поясом','кремовый',46990,null,'Stockmann',4.8,19,['XS','S','M'],'Осталось мало'],
 ['t25','s.Oliver','Классический тренч','бежевый',12990,15990,'Lamoda',4.4,521,['M','L','XL']],
 ['t26','Tommy Jeans','Тренч оверсайз','песочный',21990,27490,'Stockmann',4.5,88,['XS','S','M','L']],
 ['t27','Michael Michael Kors','Тренч с поясом и пряжкой','бежевый',36990,45990,'Lamoda',4.7,97,['S','M','L']],
 ['t28','Only','Короткий тренч','молочный',5990,7490,'Яндекс Маркет',4.2,2380,['XS','S','M','L']]];
const SH=[
 ['s1','Veja','Кеды V-10 из кожи','белый',16990,19990,'Lamoda',4.8,264,['37','38','39']],
 ['s2','Veja','Кеды Campo','белый',14990,null,'Stockmann',4.7,58,['36','38','40']],
 ['s3','New Balance','Кроссовки 550','молочный',13490,15990,'Яндекс Маркет',4.6,1890,['37','38','39','40','41']],
 ['s4','Adidas','Кеды Stan Smith','белый',9990,12990,'Lamoda',4.7,4120,['36','37','39','40']],
 ['s5','Nike','Кеды Court Legacy','белый',7990,null,'Яндекс Маркет',4.5,2750,['38','39','40','41']],
 ['s6','Ekonika','Кожаные кеды на платформе','молочный',8490,11990,'Lamoda',4.4,312,['36','37','38']],
 ['s7','Veja','Кеды Esplar из кожи','кремовый',15990,null,'Lamoda',4.6,97,['38','39'],'Осталось мало'],
 ['s8','New Balance','Кроссовки 480','белый',11990,14490,'Stockmann',4.5,143,['36','37','38','39']],
 ['s17','Geox','Замшевые кеды','синий',12990,16490,'Stockmann',4.5,88,['37','38','39','40']],
 ['s18','New Balance','Кроссовки 574','серый',11990,null,'Яндекс Маркет',4.8,2140,['36','37','38','39','40','41']],
 ['s19','Tommy Hilfiger','Замшевые кеды','шоколадный',13990,17990,'Stockmann',4.6,54,['37','38','39']],
 ['s20','Converse','Кеды Chuck 70 High','тёмно-синий',10990,null,'Lamoda',4.8,1760,['36','37','38','39','40']],
 ['s9','Geox','Кожаные кеды Blomiee','белый',13990,17490,'Stockmann',4.6,204,['36','37','38','39','40']],
 ['s10','Converse','Кеды Chuck 70 Low','молочный',9990,null,'Lamoda',4.8,3120,['36','37','38','39','40','41']],
 ['s11','Vagabond','Кеды Zoe на платформе','белый',15990,19990,'Stockmann',4.7,168,['37','38','39']],
 ['s12','Puma','Кеды Mayze Leather','белый',8990,11990,'Яндекс Маркет',4.5,980,['36','38','39','40']],
 ['s13','Tommy Hilfiger','Кожаные кеды с логотипом','белый',12990,16490,'Stockmann',4.6,241,['37','38','40','41']],
 ['s14','Superdry','Кеды из кожи Vintage','кремовый',7990,9990,'Stockmann',4.3,76,['36','37','38']],
 ['s15','Calvin Klein','Кеды Classic Cupsole','белый',11490,14990,'Lamoda',4.5,332,['38','39','40']],
 ['s16','Steve Madden','Кеды на массивной подошве','белый',10990,null,'Stockmann',4.4,58,['36','37','39'],'Осталось мало']];

// [id, бренд, название, цвет, цена, старая цена, магазин, рейтинг, отзывы, размеры, наличие?]
const mk = (rows, ds, kind) =>
  rows.map((r) => ({
    id: r[0], brand: r[1], title: r[2], color: r[3], price: r[4], old: r[5], store: r[6],
    rating: r[7], reviews: r[8], sizes: r[9], stock: r[10] || 'В наличии', ds, kind,
  }));

export const PRODUCTS = [...mk(TR, 'trench', 'тренч'), ...mk(SH, 'shoes', 'кеды')];
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const storeByName = (name) => STORES.find((s) => s.name === name);
export const productUrl = (p) => storeByName(p.store).search + encodeURIComponent(p.brand + ' ' + p.title);
