document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;
const btn = document.getElementById('dump');
const out = document.getElementById('out');
btn.addEventListener('click', () => {
  btn.disabled = true;
  out.textContent = 'Открываю Stockmann и Lamoda… Это займёт до минуты. Окно расширения можно закрыть — файлы всё равно сохранятся в «Загрузки/otmer».';
  chrome.runtime.sendMessage({ type: 'dump', query: document.getElementById('q').value || 'бежевый тренч' }, (r) => {
    btn.disabled = false;
    if (!r || !r.ok) { out.textContent = 'Ошибка: ' + (r?.error || chrome.runtime.lastError?.message || 'неизвестно'); return; }
    out.textContent = Object.entries(r.report).map(([k, v]) => `${k}: найдено ${v.found ?? 0}${v.blocked ? ' (проверка: ' + v.blocked + ')' : ''}${v.error ? ' — ' + v.error : ''}`).join('\n')
      + '\n\nГотово. Файлы — в «Загрузки/otmer».';
  });
});

const tabBtn = document.getElementById('tab');
const out2 = document.getElementById('out2');
tabBtn.addEventListener('click', () => {
  tabBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'dumpTab' }, (r) => {
    tabBtn.disabled = false;
    out2.textContent = r && r.ok ? 'Сохранено: «Загрузки/' + r.name + '».' : 'Ошибка: ' + (r?.error || chrome.runtime.lastError?.message || 'неизвестно');
  });
});

// ——— автопроверка ———
const auto = document.getElementById('auto');
const autoOn = document.getElementById('autoOn');
const autoNow = document.getElementById('autoNow');
const when = (t) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
function showAuto() {
  chrome.runtime.sendMessage({ type: 'autoStatus' }, (st) => {
    if (!st) { auto.textContent = 'Не удалось узнать состояние.'; return; }
    autoOn.checked = !!st.enabled;
    if (!st.count) { auto.textContent = 'Пока нечего проверять: откройте сайт «Отмерь» — расширение узнает, за какими вещами вы следите.'; autoNow.disabled = true; return; }
    const last = Math.max(st.lastRun || 0, st.lastManual || 0);
    const parts = ['Вещей: ' + st.count + '.'];
    if (st.running) parts.push('Идёт проверка (начата ' + when(st.running) + ') — в свёрнутом окне, 5–10 секунд на вещь.');
    else if (last) parts.push('Последняя проверка: ' + when(last) + (st.last && st.last.at === last ? ' — ' + (st.last.count ? 'новостей: ' + st.last.count : 'без новостей') + ', цены прочитаны у ' + st.last.ok + ' из ' + st.last.total + (st.last.failed ? ' (не удалось: ' + st.last.failed + ')' : '') : '') + '.');
    else parts.push('Ещё не проверялись.');
    if (!st.running && st.enabled) parts.push('Следующая: ' + (st.nextAt && st.nextAt > Date.now() ? 'после ' + when(st.nextAt) : 'в течение часа, пока открыт Chrome') + '.');
    auto.textContent = parts.join(' ');
    autoNow.disabled = !!st.running;
  });
}
autoOn.addEventListener('change', () => chrome.runtime.sendMessage({ type: 'autoToggle', enabled: autoOn.checked }, showAuto));
autoNow.addEventListener('click', () => {
  autoNow.disabled = true;
  chrome.runtime.sendMessage({ type: 'autoNow' }, showAuto);
  setTimeout(showAuto, 500);
});
showAuto();

const diagBtn = document.getElementById('diag');
const out3 = document.getElementById('out3');
diagBtn.addEventListener('click', () => {
  diagBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'diag' }, (r) => {
    diagBtn.disabled = false;
    out3.textContent = r && r.ok ? 'Сохранено в «Загрузки/' + r.folder + '»: отчёт' + (r.pages ? ' и ' + r.pages + ' стр.' : '') + '.' : 'Ошибка: ' + (r?.error || chrome.runtime.lastError?.message || 'неизвестно');
  });
});
