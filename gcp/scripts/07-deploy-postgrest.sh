#!/usr/bin/env bash
# Phase 4: build + deploy PostgREST to Cloud Run (internal ingress, private
# egress to Cloud SQL over the VPC connector). Validates JWTs with the shared
# secret; service_role tokens bypass RLS.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require AR_REPO CONNECTOR_NAME SQL_PRIVATE_IP AUTHENTICATOR_PASSWORD SQL_DB PGRST_JWT_SECRET

IMG="$(image_uri postgrest)"
log "Building PostgREST image ${IMG}..."
gcloud builds submit "${GCP_DIR}/postgrest" --tag "${IMG}"

DB_URI="postgres://authenticator:${AUTHENTICATOR_PASSWORD}@${SQL_PRIVATE_IP}:5432/${SQL_DB}"

log "Deploying PostgREST to Cloud Run..."
gcloud run deploy aczen-postgrest \
  --image="${IMG}" \
  --region="${REGION}" \
  --ingress=internal \
  --vpc-connector="${CONNECTOR_NAME}" \
  --vpc-egress=private-ranges-only \
  --allow-unauthenticated \
  --min-instances="${PGRST_MIN_INSTANCES:-0}" \
  --set-env-vars="PGRST_DB_URI=${DB_URI},PGRST_DB_SCHEMAS=public,PGRST_DB_ANON_ROLE=anon" \
  --set-secrets="PGRST_JWT_SECRET=pgrst-jwt-secret:latest"

URL="$(gcloud run services describe aczen-postgrest --region="${REGION}" --format='value(status.url)')"
log "PostgREST deployed (internal ingress; JWT-enforced): ${URL}"
log "Set in gcp/.env.migration:  export POSTGREST_URL=\"${URL}\""
log "Note: ingress=internal keeps it off the public internet; the gateway reaches it via the VPC connector."
