#!/usr/bin/env bash
# Diagnose a Signs Around You deployment. Run on the server:
#   curl -fsSL https://raw.githubusercontent.com/semicolon-git/Islamic/main/deploy/doctor.sh | sudo bash
# Paste the whole output when asking for help. It prints no secrets.
DIR="${DIR:-/opt/signs-around-you}"
C="docker compose -f $DIR/deploy/docker-compose.yml --env-file $DIR/deploy/.env"
sec() { printf '\n===== %s =====\n' "$*"; }

sec "system"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"; uname -m; nproc; free -h | sed -n 1,3p; df -h / | tail -1
sec "public IP and domain"
curl -fsS4 -m 8 https://api.ipify.org; echo
grep '^DOMAIN=' "$DIR/deploy/.env" 2>/dev/null || echo "no $DIR/deploy/.env (install did not get that far)"
D=$(grep '^DOMAIN=' "$DIR/deploy/.env" 2>/dev/null | cut -d= -f2-)
[ -n "$D" ] && getent hosts "$D"
sec "docker"
docker --version 2>&1; docker compose version 2>&1
sec "containers"
$C ps -a 2>&1
sec "app health (inside the container)"
$C exec -T app node deploy/healthcheck.mjs >/dev/null 2>&1 && echo "app: HEALTHY" || echo "app: NOT healthy"
sec "AI (Claude)"
if grep -q '^ANTHROPIC_API_KEY=.' "$DIR/deploy/.env" 2>/dev/null; then $C exec -T app npx tsx scripts/ai-check.ts 2>&1 | tail -6; else echo "AI off (no ANTHROPIC_API_KEY): deterministic fallbacks in use"; fi
sec "local HTTP through Caddy"
[ -n "$D" ] && curl -sS -m 10 -o /dev/null -w "http://127.0.0.1 (Host: $D) -> %{http_code} %{redirect_url}\n" -H "Host: $D" http://127.0.0.1/
[ -n "$D" ] && curl -sS -m 10 -k -o /dev/null -w "https://$D via 127.0.0.1 -> %{http_code}\n" --resolve "$D:443:127.0.0.1" "https://$D/api/health"
sec "listening ports"
ss -ltnp 2>/dev/null | grep -E ':(80|443|3000)\b' || echo "nothing listening on 80/443"
sec "host firewall"
(command -v ufw >/dev/null && ufw status) 2>&1 | head -5
iptables -S INPUT 2>/dev/null | head -12
sec "app log (last 40)"
$C logs --tail=40 app 2>&1
sec "caddy log (last 40)"
$C logs --tail=40 caddy 2>&1
sec "db log (last 15)"
$C logs --tail=15 db 2>&1
