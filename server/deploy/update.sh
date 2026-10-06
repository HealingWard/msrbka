#!/usr/bin/env bash
# Автообновление сервера «Отмерь». Запускается таймером systemd pricel-update.timer раз в час (ставит install.sh).
# Смотрит ветку из /etc/pricel/env (main). Если код сервера изменился — обновляет зависимости и перезапускает службу.
# Не поднялся за минуту — возвращает прежнюю версию. Поменялся сам install.sh — запускает его целиком (службы, Caddy).
# Журнал: journalctl -u pricel-update -n 50

# Весь скрипт — одна функция: bash прочитает её целиком до того, как git reset заменит этот файл на диске.
main() {
  set -euo pipefail
  local APP_DIR REF=main DOMAIN='' OLD NEW
  [ -f "${PRICEL_ENV:-/etc/pricel/env}" ] && . "${PRICEL_ENV:-/etc/pricel/env}"
  APP_DIR="${PRICEL_APP_DIR:-/opt/pricel}"
  REF="${PRICEL_REF:-$REF}"
  DOMAIN="${PRICEL_DOMAIN:-}"
  cd "$APP_DIR"
  git fetch -q origin "$REF"
  OLD=$(git rev-parse HEAD)
  NEW=$(git rev-parse FETCH_HEAD)
  [ "$OLD" = "$NEW" ] && return 0
  # Версия, которая уже не поднялась, — не пробуем каждый час заново, ждём следующего коммита.
  [ "$(cat "$APP_DIR/.git/pricel-bad" 2>/dev/null)" = "$NEW" ] && return 0

  if ! git diff --quiet "$OLD" "$NEW" -- server/deploy/install.sh; then
    echo "Изменился install.sh — запускаю установку целиком"
    git show "$NEW:server/deploy/install.sh" > /tmp/pricel-install.sh
    bash /tmp/pricel-install.sh ${DOMAIN:+"$DOMAIN"}
    return 0
  fi

  git reset -q --hard "$NEW"
  if git diff --quiet "$OLD" "$NEW" -- server/; then
    echo "Код сервера не менялся ($(git log -1 --format='%h %s'))"
    return 0
  fi

  deploy() {
    (cd "$APP_DIR/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
    git log -1 --format='%h %cs' > "$APP_DIR/server/version.txt"
    systemctl restart pricel
    for _ in $(seq 1 30); do
      curl -fsS --max-time 3 http://127.0.0.1:8787/api/health >/dev/null 2>&1 && return 0
      sleep 2
    done
    return 1
  }

  if deploy; then
    echo "Обновлено: $(git log -1 --format='%h %s')"
  else
    echo "Новая версия не поднялась — возвращаю $(git log -1 --format='%h' "$OLD")" >&2
    echo "$NEW" > "$APP_DIR/.git/pricel-bad"
    git reset -q --hard "$OLD"
    deploy || true
    return 1
  fi
}
main "$@"
exit $?
