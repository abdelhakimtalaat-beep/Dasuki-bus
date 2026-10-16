#!/usr/bin/env bash
# تشغيل اختبارات قاعدة البيانات على PostgreSQL محلي (ليس على مشروع Supabase الحقيقي)
# الاستخدام: PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./supabase/tests/run-db-tests.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${TEST_DB:-dasuki_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/00_supabase_stub.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/../migrations/20261014000000_init.sql"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/10_acceptance_tests.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p; /=====/p'
"$DIR/20_concurrency_test.sh" "$DB"
