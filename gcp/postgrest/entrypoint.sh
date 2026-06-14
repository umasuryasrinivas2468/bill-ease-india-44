#!/bin/sh
# Render PostgREST config from environment and start, binding to Cloud Run's $PORT.
set -e

: "${PORT:=3000}"
: "${PGRST_DB_SCHEMAS:=public}"
: "${PGRST_DB_ANON_ROLE:=anon}"
: "${PGRST_DB_POOL:=10}"

CONF=/tmp/postgrest.conf
cat > "${CONF}" <<EOF
db-uri = "${PGRST_DB_URI}"
db-schemas = "${PGRST_DB_SCHEMAS}"
db-anon-role = "${PGRST_DB_ANON_ROLE}"
db-pool = ${PGRST_DB_POOL}
jwt-secret = "${PGRST_JWT_SECRET}"
jwt-role-claim-key = ".role"
server-host = "0.0.0.0"
server-port = ${PORT}
# Forward request.jwt.claims GUC so RLS policies can read sub/role.
db-pre-request = ""
EOF

echo "[postgrest] starting on 0.0.0.0:${PORT}, schemas=${PGRST_DB_SCHEMAS}"
exec postgrest "${CONF}"
