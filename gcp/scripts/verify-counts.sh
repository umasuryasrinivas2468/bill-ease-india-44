#!/usr/bin/env bash
# Phase 3 verification: compare per-table row counts between Supabase and Cloud SQL.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require SUPABASE_DB_URL SQL_ROOT_PASSWORD SQL_DB

PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-5432}"
COUNT_SQL="SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"

log "Source (Supabase) counts:"
psql "${SUPABASE_DB_URL}" -At -c "${COUNT_SQL}" | sort > /tmp/src_counts.txt
cat /tmp/src_counts.txt

log "Target (Cloud SQL) counts:"
PGPASSWORD="${SQL_ROOT_PASSWORD}" psql \
  "host=${PGHOST} port=${PGPORT} dbname=${SQL_DB} user=postgres sslmode=disable" \
  -At -c "ANALYZE; ${COUNT_SQL}" | sort > /tmp/tgt_counts.txt
cat /tmp/tgt_counts.txt

log "Diff (lines only in one side):"
diff /tmp/src_counts.txt /tmp/tgt_counts.txt && log "Row counts match." || \
  warn "Differences found above. Note: pg_stat counts are approximate; spot-check critical tables with SELECT count(*)."
