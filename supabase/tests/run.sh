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
run < supabase/migrations/0002_english_messages.sql
run < supabase/migrations/0003_ipon.sql
run < supabase/migrations/0004_schedule_password.sql
run < supabase/migrations/0005_payout_schedule.sql
run < supabase/migrations/0006_avatars.sql
run < supabase/migrations/0007_delete_circle.sql
run < supabase/migrations/0008_fair_rounds.sql
run < supabase/migrations/0009_circle_chat.sql
run < supabase/migrations/0010_open_slots.sql
run < supabase/migrations/0011_preview_joined.sql
run < supabase/migrations/0012_min_three_people.sql
run < supabase/migrations/0013_goal_completed.sql
run < supabase/migrations/0014_no_split_slots.sql
run < supabase/tests/01_flow_test.sql
run < supabase/tests/02_schedule_password_test.sql
run < supabase/tests/03_fair_rounds_test.sql
run < supabase/tests/04_chat_test.sql
run < supabase/tests/05_open_slots_test.sql
