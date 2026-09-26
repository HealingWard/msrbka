#!/usr/bin/env bash
# Пробный запуск браузера на сервере: пускают ли Stockmann и Lamoda обычный Chromium.
# Ничего не меняет в работающем сервере «Отмерь»; всё ставится во временную папку /opt/pricel-probe.
#   curl -fsSL https://raw.githubusercontent.com/HealingWard/msrbka/claude/happy-faraday-s7rzl8/server/deploy/browser-probe.sh | bash
set -euo pipefail
REF="${PRICEL_REF:-claude/happy-faraday-s7rzl8}"
DIR=/opt/pricel-probe
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
command -v node >/dev/null || { echo "Сначала выполните установку сервера (install.sh)"; exit 1; }
rm -rf "$DIR"
git clone -q --depth 1 --branch "$REF" https://github.com/HealingWard/msrbka.git "$DIR"
cd "$DIR/server"
echo "▸ Устанавливаю браузер Chromium (1–3 минуты)…"
npm install --no-audit --no-fund --loglevel=error >/dev/null
npm install --no-save --no-audit --no-fund --loglevel=error playwright@1 >/dev/null
npx --yes playwright install --with-deps chromium >/dev/null 2>&1 || npx --yes playwright install --with-deps chromium
echo "▸ Открываю магазины в браузере…"
node scripts/browser-probe.js "бежевый тренч" 2>&1 | tee /var/lib/pricel/browser-probe.txt
echo
echo "Скопируйте всё начиная со строки «Открываю магазины в браузере» и пришлите в чат."
