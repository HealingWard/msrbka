import { useEffect, useState } from 'react';
import { extensionVersion } from '../lib/extension.js';

export function ExtensionPage() {
  const [ver, setVer] = useState(undefined);
  useEffect(() => { extensionVersion(1500).then(setVer); }, []);
  return (
    <div className="page searches ext-page">
      <div className="page-head">
        <div>
          <h1>Расширение для Chrome</h1>
          <p>Stockmann и Lamoda закрыты от запросов с серверов, поэтому «Отмерь» ищет в них через ваш браузер:
            расширение открывает выдачу и карточки товаров в свёрнутом окне и собирает цены, размеры, цвет и бренд.</p>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 28 }}>
        {ver === undefined && <b>Проверяю, установлено ли расширение…</b>}
        {ver && <b>✓ Расширение установлено (версия {ver}). Можно искать.</b>}
        {ver === null && <b>Расширение не найдено. Установите его по шагам ниже — это займёт пару минут.</b>}
      </div>
      <ol className="ext-steps">
        <li>
          <b>Скачайте расширение:</b> <a className="btn btn-primary btn-md" href="./otmer-extension.zip" download>Скачать otmer-extension.zip</a>
          <div className="muted">Откройте скачанный файл в «Загрузках» — появится папка <code>otmer-extension</code>. Переложите её туда, где она будет лежать постоянно (например, в «Документы»): Chrome загружает расширение из этой папки.</div>
        </li>
        <li>
          <b>Откройте страницу расширений:</b> вставьте в адресную строку Chrome <code>chrome://extensions</code> и нажмите Enter.
        </li>
        <li>
          <b>Включите «Режим разработчика»</b> — переключатель справа вверху.
        </li>
        <li>
          <b>Нажмите «Загрузить распакованное расширение»</b> (слева вверху) и выберите папку <code>otmer-extension</code>.
        </li>
        <li>
          <b>Вернитесь на эту страницу и обновите её</b> (Cmd+R) — вверху должно появиться «Расширение установлено».
        </li>
      </ol>
      <div className="panel">
        <b>Как это работает</b>
        <ul className="ext-list">
          <li>Когда вы ищете, расширение открывает в свёрнутом окне поиск Stockmann и Lamoda и до 16 карточек товаров — по две одновременно, с паузами. Поиск занимает 20–60 секунд.</li>
          <li>Если магазин попросит подтвердить, что вы не робот, окно развернётся — пройдите проверку, поиск продолжится.</li>
          <li>Расширение только читает страницы магазинов. Цены отправляются на сервер «Отмерь», чтобы копилась история цен.</li>
          <li>Обновление: скачайте zip заново, замените папку и нажмите ↻ у расширения на странице <code>chrome://extensions</code>.</li>
          <li>Если у вас стояло прежнее расширение «Прицел» (папка <code>pricel-extension</code>): удалите его на странице <code>chrome://extensions</code> кнопкой «Удалить», удалите старую папку и установите <code>otmer-extension</code> по шагам выше. Сохранённые поиски и избранное на сайте останутся.</li>
        </ul>
      </div>
    </div>
  );
}
