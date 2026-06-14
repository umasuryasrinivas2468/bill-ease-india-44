#!/usr/bin/env bash
# Print all deployed Cloud Run URLs (gateway, functions, node server) so you can
# update third-party dashboards and frontend config.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults

log "Gateway / core services:"
gcloud run services list --region="${REGION}" \
  --filter='metadata.name ~ ^aczen-' \
  --format='table(metadata.name, status.url)'

log "Edge functions:"
gcloud run services list --region="${REGION}" \
  --filter='metadata.name ~ ^fn-' \
  --format='table(metadata.name, status.url)'
