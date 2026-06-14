#!/usr/bin/env bash
# Phase 7/8 link: collect all deployed fn-* service URLs and update the gateway
# so /functions/v1/<name> routes to the right service (makes
# supabase.functions.invoke() and direct /functions/v1 fetches work).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults

log "Collecting fn-* service URLs..."
PAIRS=""
while IFS=$'\t' read -r name url; do
  [[ -z "${name}" ]] && continue
  fn="${name#fn-}"                       # strip the fn- prefix
  PAIRS="${PAIRS}${PAIRS:+ }${fn}=${url}"
done < <(gcloud run services list --region="${REGION}" \
            --filter='metadata.name ~ ^fn-' \
            --format='value(metadata.name, status.url)')

[[ -z "${PAIRS}" ]] && die "No fn-* services found. Deploy functions first (10-deploy-functions.sh)."
log "Function upstreams: ${PAIRS}"

log "Updating gateway env FUNCTIONS_UPSTREAMS..."
gcloud run services update aczen-gateway \
  --region="${REGION}" \
  --update-env-vars="FUNCTIONS_UPSTREAMS=${PAIRS}"

log "Gateway now routes /functions/v1/<name> to each service."
