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
