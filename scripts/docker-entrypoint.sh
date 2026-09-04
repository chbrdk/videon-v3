#!/bin/sh
set -e

if [ -z "$AUTH_SECRET" ] || [ "${#AUTH_SECRET}" -lt 32 ]; then
  echo "[VIDEON-v3] AUTH_SECRET is missing or shorter than 32 chars (Runtime env). Refusing to start."
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[VIDEON-v3] DATABASE_URL is required in production. Refusing to start."
  exit 1
fi

echo "[VIDEON-v3] Checking DATABASE_URL..."
node ./scripts/check-database-url.mjs

echo "[VIDEON-v3] Applying reviewed SQL migrations..."
node ./scripts/apply-sql-migrations.mjs

exec npm run start -w web
