#!/usr/bin/env bash
# One-command install of Signs Around You · آيات حولك on a clean Ubuntu/Debian server.
#
#   curl -fsSL https://raw.githubusercontent.com/semicolon-git/Islamic/main/deploy/install.sh | sudo bash -s -- your.domain.com
#
# Without a domain argument it uses <server-ip>.sslip.io, so HTTPS still works (phones need HTTPS for the camera).
# Safe to re-run: it keeps the existing secrets and data and just updates and restarts.
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
REPO="${REPO:-https://github.com/semicolon-git/Islamic.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/signs-around-you}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (prefix with sudo)."
command -v apt-get >/dev/null || die "This script supports Ubuntu/Debian. On other systems install Docker and follow deploy/README.md."

say "Base packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git openssl >/dev/null

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# The production build needs ~3 GB of memory; add swap on small servers.
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
  say "Adding 3 GB swap (server has ${MEM_MB} MB RAM)"
  fallocate -l 3G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=3072
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Fetching the code ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

ENV_FILE="$DIR/deploy/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -z "$DOMAIN" ]; then
    IP=$(curl -fsS4 https://api.ipify.org || curl -fsS4 https://ifconfig.me || true)
    [ -n "$IP" ] || die "Couldn't detect the public IP. Re-run with your domain: ... | sudo bash -s -- your.domain.com"
    DOMAIN="${IP//./-}.sslip.io"
  fi
  say "Creating $ENV_FILE for https://$DOMAIN"
  cat > "$ENV_FILE" <<ENV
DOMAIN=$DOMAIN
DB_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
DEMO_MODE=true
DEMO_PIN=1448
# Optional: switches on the AI paths (photo recognition, composed answers, manuscript drafts)
ANTHROPIC_API_KEY=
ENV
  chmod 600 "$ENV_FILE"
elif [ -n "$DOMAIN" ]; then
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE"
fi
DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  say "Opening ports 80 and 443 in ufw"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
fi

say "Building and starting (first time: about 5–10 minutes)"
docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE" up -d --build

say "Waiting for the app (first start seeds the Quran, hadith and demo data)"
for i in $(seq 1 120); do
  if docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE" exec -T app node deploy/healthcheck.mjs >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE" exec -T app node deploy/healthcheck.mjs >/dev/null 2>&1 \
  || die "The app did not become healthy. Check: docker compose -f $DIR/deploy/docker-compose.yml logs app"

printf '\n\033[1;32m✓ Signs Around You is running.\033[0m\n'
printf '  Visitor app : https://%s\n' "$DOMAIN"
printf '  Portal      : https://%s/portal   (demo PIN %s)\n' "$DOMAIN" "$(grep '^DEMO_PIN=' "$ENV_FILE" | cut -d= -f2-)"
printf '  Settings    : %s\n' "$ENV_FILE"
printf '  The HTTPS certificate is issued on the first visit; allow up to a minute.\n'
printf '  If %s is your own domain, point its DNS A record at this server first.\n\n' "$DOMAIN"
