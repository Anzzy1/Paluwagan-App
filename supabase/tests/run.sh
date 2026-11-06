#!/usr/bin/env bash
# Spins up a throwaway Postgres in Docker, applies a Supabase stub + the migration,
# and runs the end-to-end flow test.  Usage: bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
NAME=paluwagan-sqltest
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1' EXIT
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1
run() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
run < supabase/tests/00_supabase_stub.sql
run < supabase/migrations/0001_init.sql
run < supabase/tests/01_flow_test.sql
