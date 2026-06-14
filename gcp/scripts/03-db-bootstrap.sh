#!/usr/bin/env bash
# Phase 2: create roles + auth helper schema on Cloud SQL.
# Connects through the Cloud SQL Auth Proxy on 127.0.0.1:5432.
# Start the proxy first (see gcp/README.md "Connecting to Cloud SQL").
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require SQL_ROOT_PASSWORD AUTHENTICATOR_PASSWORD SQL_DB

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
export PGPASSWORD="${SQL_ROOT_PASSWORD}"

PSQL=(psql "host=${PGHOST} port=${PGPORT} dbname=${SQL_DB} user=postgres sslmode=disable" -v ON_ERROR_STOP=1)

log "Applying roles (00-roles.sql)..."
"${PSQL[@]}" -v authenticator_password="${AUTHENTICATOR_PASSWORD}" -f "${GCP_DIR}/sql/00-roles.sql"

log "Applying auth helper schema (01-auth-schema.sql)..."
"${PSQL[@]}" -f "${GCP_DIR}/sql/01-auth-schema.sql"

log "DB bootstrap complete. Grants (02-grants.sql) run after migrations in step 04."
