#!/usr/bin/env bash
# Phase 3b: copy data from Supabase into Cloud SQL.
#
# Two modes:
#   (default)  data-only: assumes schema already built via 04-run-migrations.sh.
#              Dumps only the `public` schema data and restores with triggers
#              disabled (avoids re-firing accounting triggers during load).
#   --full     dumps the full `public` schema + data from Supabase and restores
#              it (exact 1:1 copy). Run 03-db-bootstrap.sh first, then this; do
#              NOT run 04-run-migrations.sh. Apply grants afterward.
#
# For minimal-downtime production cutover prefer GCP Database Migration Service
# (continuous) instead of this one-shot copy (see gcp/README.md).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require SUPABASE_DB_URL SQL_ROOT_PASSWORD SQL_DB

MODE="data-only"
[[ "${1:-}" == "--full" ]] && MODE="full"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
WORK="$(mktemp -d)"
DUMP="${WORK}/supabase_public.dump"

log "Dumping Supabase public schema (${MODE}) ..."
if [[ "${MODE}" == "full" ]]; then
  pg_dump "${SUPABASE_DB_URL}" --schema=public --no-owner --no-privileges \
    --format=custom --file="${DUMP}"
else
  pg_dump "${SUPABASE_DB_URL}" --schema=public --data-only --no-owner \
    --no-privileges --disable-triggers --format=custom --file="${DUMP}"
fi
log "Dump written to ${DUMP} ($(du -h "${DUMP}" | cut -f1))."

export PGPASSWORD="${SQL_ROOT_PASSWORD}"
CONN="host=${PGHOST} port=${PGPORT} dbname=${SQL_DB} user=postgres sslmode=disable"

log "Restoring into Cloud SQL (${SQL_DB}) ..."
if [[ "${MODE}" == "full" ]]; then
  pg_restore --no-owner --no-privileges --clean --if-exists \
    --dbname="${CONN}" "${DUMP}"
  log "Applying grants after full restore..."
  psql "${CONN}" -v ON_ERROR_STOP=1 -f "${GCP_DIR}/sql/02-grants.sql"
else
  pg_restore --no-owner --no-privileges --data-only --disable-triggers \
    --dbname="${CONN}" "${DUMP}"
fi

log "Data restore complete. Run verify-counts.sh to compare row counts."
rm -rf "${WORK}"
