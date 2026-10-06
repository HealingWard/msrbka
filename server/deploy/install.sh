#!/usr/bin/env bash
# Установка сервера поиска «Отмерь» на чистый VPS (Ubuntu/Debian), одной командой от root:
#   curl -fsSL https://raw.githubusercontent.com/HealingWard/msrbka/main/server/deploy/install.sh | bash
# Свой домен (необязательно):  ... | bash -s -- api.example.ru
# Повторный запуск обновляет код и перезапускает сервер. Дальше сервер обновляется сам:
# таймер pricel-update раз в час берёт свежий код из main (deploy/update.sh).
#
# Что делает: ставит Node.js и Caddy (HTTPS-сертификат выпускается сам), скачивает код из GitHub,
# запускает сервер как службу systemd, проверяет, что видно в магазинах, и печатает адрес API.
# Docker не нужен.

set -euo pipefail

REPO="${PRICEL_REPO:-https://github.com/HealingWard/msrbka.git}"
REF="${PRICEL_REF:-main}"
SITE_ORIGIN="${PRICEL_ORIGIN:-https://healingward.github.io}"
APP_DIR=/opt/pricel
DATA_DIR=/var/lib/pricel
NODE_MAJOR=22
DOMAIN="${1:-}"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✕ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Запустите от root (или через sudo)."
command -v apt-get >/dev/null || die "Нужна Ubuntu или Debian."

case "$(uname -m)" in
  x86_64|amd64) ARCH_NODE=x64; ARCH_CADDY=amd64 ;;
  aarch64|arm64) ARCH_NODE=arm64; ARCH_CADDY=arm64 ;;
  *) die "Неподдерживаемая архитектура: $(uname -m)" ;;
esac

say "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates tar xz-utils libcap2-bin >/dev/null

say "Node.js $NODE_MAJOR"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  FILE=$(curl -fsSL "$BASE/SHASUMS256.txt" | awk '{print $2}' | grep -E "^node-v[0-9.]+-linux-${ARCH_NODE}\.tar\.xz$" | head -1)
  [ -n "$FILE" ] || die "Не удалось найти сборку Node.js"
  curl -fsSL "$BASE/$FILE" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm -f /tmp/node.tar.xz
fi
echo "node $(node -v), npm $(npm -v)"

say "Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  TAG=$(curl -fsSL https://api.github.com/repos/caddyserver/caddy/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 || true)
  TAG="${TAG:-v2.10.0}"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/${TAG}/caddy_${TAG#v}_linux_${ARCH_CADDY}.tar.gz" -o /tmp/caddy.tgz
  tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy
  rm -f /tmp/caddy.tgz
fi
setcap cap_net_bind_service=+ep "$(command -v caddy)"
caddy version

say "Код «Отмерь»"
id pricel >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin pricel
mkdir -p "$DATA_DIR" && chown pricel:pricel "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$REF" && git -C "$APP_DIR" reset -q --hard FETCH_HEAD
else
  rm -rf "$APP_DIR"
  git clone -q --depth 1 --branch "$REF" "$REPO" "$APP_DIR"
fi
(cd "$APP_DIR/server" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
git -C "$APP_DIR" log -1 --format='%h %cs' > "$APP_DIR/server/version.txt"
echo "версия: $(git -C "$APP_DIR" log -1 --format='%h %s')"

say "Служба pricel"
cat > /etc/systemd/system/pricel.service <<UNIT
[Unit]
Description=Pricel store search API
After=network-online.target
Wants=network-online.target

[Service]
User=pricel
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production PORT=8787 HOST=127.0.0.1 DATA_DIR=$DATA_DIR ALLOWED_ORIGINS=$SITE_ORIGIN
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

say "Адрес API"
if [ -z "$DOMAIN" ]; then
  IP=$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me || true)
  [ -n "$IP" ] || die "Не удалось узнать внешний IP. Запустите с доменом: ... | bash -s -- api.example.ru"
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "https://$DOMAIN"

id caddy >/dev/null 2>&1 || useradd --system --home /var/lib/caddy --create-home --shell /usr/sbin/nologin caddy
mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}
CADDY
cat > /etc/systemd/system/caddy.service <<UNIT
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
User=caddy
Environment=HOME=/var/lib/caddy
ExecStart=$(command -v caddy) run --config /etc/caddy/Caddyfile
ExecReload=$(command -v caddy) reload --config /etc/caddy/Caddyfile
Restart=always
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT

say "Автообновление"
mkdir -p /etc/pricel
cat > /etc/pricel/env <<ENV
PRICEL_REF=$REF
PRICEL_DOMAIN=$DOMAIN
ENV
cat > /etc/systemd/system/pricel-update.service <<UNIT
[Unit]
Description=Pricel: update from GitHub
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=PATH=$(dirname "$(command -v node)"):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/bin/bash $APP_DIR/server/deploy/update.sh
UNIT
cat > /etc/systemd/system/pricel-update.timer <<UNIT
[Unit]
Description=Pricel: check for updates hourly

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
UNIT
echo "сервер сам берёт новые версии из $REF раз в час (журнал: journalctl -u pricel-update)"

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

systemctl daemon-reload
systemctl enable -q pricel caddy
systemctl enable -q --now pricel-update.timer
systemctl restart pricel caddy

say "Проверка"
for i in $(seq 1 45); do
  curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1 && break
  sleep 2
done
if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
  echo "HTTPS работает: https://$DOMAIN/api/health"
  HTTPS_OK=yes
else
  HTTPS_OK=no
  echo "HTTPS пока не отвечает. Сервер локально: $(curl -fsS --max-time 5 http://127.0.0.1:8787/api/health || echo 'не отвечает')"
  echo "Проверьте, что в панели хостинга открыты порты 80 и 443. Журнал: journalctl -u caddy -n 30"
fi

say "Что сервер видит в магазинах"
cd "$DATA_DIR"
runuser -u pricel -- node "$APP_DIR/server/scripts/probe.js" all "бежевый тренч" 2>&1 | tee "$DATA_DIR/probe.txt" || true

printf '\n\033[1m================ ГОТОВО ================\033[0m\n'
echo "Адрес API:  https://$DOMAIN   (HTTPS: $HTTPS_OK)"
echo "Скопируйте всё начиная со строки «Что сервер видит в магазинах» и пришлите в чат."
