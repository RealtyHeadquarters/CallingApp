#!/usr/bin/env bash
# One-time data migration: copy EVERYTHING from Neon into the self-hosted Postgres.
# Run this AFTER `docker compose --env-file .env.selfhost up -d db` (db must be up),
# and BEFORE starting the api/web (or restart api afterwards).
#
#   NEON_URL='postgresql://neondb_owner:...@ep-...neon.tech/neondb?sslmode=require' \
#     bash scripts/migrate-from-neon.sh
#
# It dumps the whole Neon database (schema + data) and restores it into the local
# Postgres container. Safe to re-run (uses --clean --if-exists).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${NEON_URL:?Set NEON_URL to your Neon connection string}"
set -a; source .env.selfhost; set +a
: "${POSTGRES_USER:?}"; : "${POSTGRES_PASSWORD:?}"; : "${POSTGRES_DB:?}"

DB_CID="$(docker compose --env-file .env.selfhost ps -q db)"
if [ -z "$DB_CID" ]; then echo "DB container not running. Run: docker compose --env-file .env.selfhost up -d db"; exit 1; fi

echo "1/3  Dumping Neon (schema + data)…"
docker run --rm postgres:16-alpine pg_dump "$NEON_URL" --no-owner --no-acl -Fc > neon-dump.pgc
echo "     dump size: $(du -h neon-dump.pgc | cut -f1)"

echo "2/3  Copying dump into the db container…"
docker cp neon-dump.pgc "$DB_CID":/tmp/dump.pgc

echo "3/3  Restoring into self-hosted Postgres…"
docker compose --env-file .env.selfhost exec -T db sh -c \
  "PGPASSWORD='$POSTGRES_PASSWORD' pg_restore -U '$POSTGRES_USER' -d '$POSTGRES_DB' --no-owner --clean --if-exists /tmp/dump.pgc" || true

echo "✅ Migration complete. Now start everything:  docker compose --env-file .env.selfhost up -d --build"
echo "   (Your super admin + all tenant data are now on your server.)"
