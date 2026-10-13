#!/usr/bin/env bash
# Prova lo schema su un PostgreSQL locale (senza Supabase): finge auth.users, auth.uid() e i ruoli anon/authenticated.
# Uso: npm run db:test
set -euo pipefail
cd "$(dirname "$0")"
source ./pg-local.sh
trap pg_stop EXIT
pg_fresh
pg_file test-stubs.sql
pg_file schema.sql
pg_file schema.sql   # rieseguibile senza errori
pg_file test.sql
echo "Schema SQL: prove superate."
