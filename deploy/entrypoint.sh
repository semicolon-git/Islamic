#!/bin/sh
# Apply database migrations, seed on first boot only, then start the app.
set -e
echo "[signs] migrations + first-time seed (skipped when the database already has data)"
npx tsx scripts/seed.ts --if-empty
echo "[signs] starting on :${PORT:-3000}"
exec npx next start -p "${PORT:-3000}" -H 0.0.0.0
