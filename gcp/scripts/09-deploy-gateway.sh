#!/usr/bin/env bash
# Phase 5 (run AFTER storage + PostgREST): build + deploy the Supabase-compatible
# gateway. Public ingress; routes through the VPC connector (egress=all-traffic,
# with Cloud NAT) so it can reach the internal PostgREST + storage shim AND the
# public function services. Function routes are added later by 11-wire-functions.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require AR_REPO CONNECTOR_NAME POSTGREST_URL STORAGE_SHIM_URL

IMG="$(image_uri gateway)"
log "Building gateway image ${IMG}..."
gcloud builds submit "${GCP_DIR}/gateway" --tag "${IMG}"

log "Deploying gateway to Cloud Run..."
gcloud run deploy aczen-gateway \
  --image="${IMG}" \
  --region="${REGION}" \
  --ingress=all \
  --allow-unauthenticated \
  --vpc-connector="${CONNECTOR_NAME}" \
  --vpc-egress=all-traffic \
  --min-instances="${GATEWAY_MIN_INSTANCES:-0}" \
  --set-env-vars="POSTGREST_UPSTREAM=${POSTGREST_URL},STORAGE_UPSTREAM=${STORAGE_SHIM_URL}"

URL="$(gcloud run services describe aczen-gateway --region="${REGION}" --format='value(status.url)')"
log "Gateway deployed (public): ${URL}"
log "This is your new VITE_SUPABASE_URL. Set:  export GATEWAY_URL=\"${URL}\""
log "Next: deploy functions (10), then wire them into the gateway (11)."
