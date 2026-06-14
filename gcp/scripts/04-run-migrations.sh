#!/usr/bin/env bash
# Phase 3a: apply all repo SQL migrations to Cloud SQL in timestamp order,
# then apply role grants. Use this for a schema-from-repo build.
# (If you prefer an exact 1:1 copy of Supabase, use 05-migrate-data.sh with
#  the --full flag instead and skip this script.)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require SQL_ROOT_PASSWORD SQL_DB

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${SQL_ROOT_PASSWORD}"
CONN="host=${PGHOST} port=${PGPORT} dbname=${SQL_DB} user=postgres sslmode=disable"

MIG_DIR="${REPO_DIR}/supabase/migrations"
log "Applying migrations from ${MIG_DIR} (sorted by filename)..."

count=0
# Supabase migration filenames are timestamp-prefixed, so lexical sort == order.
while IFS= read -r f; do
  log "  -> $(basename "$f")"
  psql "${CONN}" -v ON_ERROR_STOP=1 -f "$f"
  count=$((count+1))
done < <(find "${MIG_DIR}" -maxdepth 1 -name '*.sql' | LC_ALL=C sort)

log "Applied ${count} migrations."

log "Applying grants (02-grants.sql)..."
psql "${CONN}" -v ON_ERROR_STOP=1 -f "${GCP_DIR}/sql/02-grants.sql"

log "Migrations + grants complete."
