#!/usr/bin/env bash
# Phase 9: generate the frontend's production env (.env.production.local) pointing
# at the GCP gateway + anon JWT. Run a staging build, verify, then deploy.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require GATEWAY_URL

log "Fetching anon JWT from Secret Manager..."
ANON_JWT="$(gcloud secrets versions access latest --secret=anon-jwt)"
[[ -z "${ANON_JWT}" ]] && die "anon-jwt secret not found. Run 06-secrets.sh first."

OUT="${REPO_DIR}/.env.production.local"
log "Writing ${OUT}..."
cat > "${OUT}" <<EOF
VITE_SUPABASE_URL=${GATEWAY_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_JWT}
VITE_SUPABASE_ANON_KEY=${ANON_JWT}
VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-CHANGE_ME}
EOF

log "Wrote frontend env. Now:"
log "  1) Ensure the Clerk 'supabase' JWT template signs with the SAME HS256"
log "     secret as PGRST_JWT_SECRET, with claims: role=authenticated, sub={{user.id}}."
log "  2) Build:  npm ci && npm run build"
log "  3) Smoke-test against the gateway, then deploy the static build."
log "NOTE: .env.production.local is gitignored-sensitive; do not commit it."
