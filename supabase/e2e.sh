#!/usr/bin/env bash
# Prova l'app in modalità Supabase contro lo schema vero: PostgreSQL locale + finto Supabase (e2e/shim.mjs) + app (RemoteApi).
# Uso: npm run db:e2e
set -euo pipefail
cd "$(dirname "$0")"
source ./pg-local.sh
SHIM_PORT=${SHIM_PORT:-54330}
SHIM_PID=
cleanup() { [ -n "$SHIM_PID" ] && kill "$SHIM_PID" 2>/dev/null || true; pg_stop; }
trap cleanup EXIT
pg_fresh
pg_file test-stubs.sql
pg_file schema.sql
PGPORT=$PORT SHIM_PORT=$SHIM_PORT node e2e/shim.mjs >"$DIR/shim.log" 2>&1 &
SHIM_PID=$!
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$SHIM_PORT/__none" && break; sleep 0.1; done
SHIM_URL="http://127.0.0.1:$SHIM_PORT" node e2e/run.mjs
