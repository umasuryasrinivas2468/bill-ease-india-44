#!/usr/bin/env bash
# Phase 8: deploy the Node/Express server to Cloud Run. Connects to Cloud SQL
# (private IP) over the VPC connector; durable state in the server_kv table.
# max-instances=1 keeps the write-through cache authoritative.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require AR_REPO CONNECTOR_NAME SQL_PRIVATE_IP SQL_ROOT_PASSWORD SQL_DB

IMG="$(image_uri node-server)"
log "Building node server image ${IMG}..."
( cd "${REPO_DIR}/server" && gcloud builds submit --tag "${IMG}" . )

DB_URL="postgres://postgres:${SQL_ROOT_PASSWORD}@${SQL_PRIVATE_IP}:5432/${SQL_DB}"

# Attach secrets that exist.
SECRET_FLAGS=""
add_secret() { gcloud secrets describe "$2" >/dev/null 2>&1 && \
  SECRET_FLAGS="${SECRET_FLAGS}${SECRET_FLAGS:+,}$1=$2:latest"; return 0; }
add_secret GEMINI_API_KEY        gemini-api-key
add_secret RAZORPAY_KEY_ID       razorpay-key-id
add_secret RAZORPAY_KEY_SECRET   razorpay-key-secret
add_secret SENDGRID_API_KEY      sendgrid-api-key
add_secret DECENTRO_CLIENT_ID    decentro-client-id
add_secret DECENTRO_CLIENT_SECRET decentro-client-secret
add_secret DECENTRO_MODULE_SECRET decentro-module-secret
add_secret DECENTRO_PROVIDER_SECRET decentro-provider-secret

ENV="DATABASE_URL=${DB_URL}"
ENV="${ENV},DECENTRO_BASE_URL=${DECENTRO_BASE_URL:-https://in.staging.decentro.tech}"
ENV="${ENV},SUPPORT_FROM_EMAIL=${SUPPORT_FROM_EMAIL:-no-reply@aczen.in}"
ENV="${ENV},SUPPORT_FROM_NAME=${SUPPORT_FROM_NAME:-Aczen}"

log "Deploying node server to Cloud Run..."
gcloud run deploy aczen-node-server \
  --image="${IMG}" \
  --region="${REGION}" \
  --ingress=all \
  --allow-unauthenticated \
  --vpc-connector="${CONNECTOR_NAME}" \
  --vpc-egress=private-ranges-only \
  --max-instances=1 \
  --min-instances="${NODE_SERVER_MIN_INSTANCES:-0}" \
  --set-env-vars="${ENV}" \
  ${SECRET_FLAGS:+--set-secrets="${SECRET_FLAGS}"}

URL="$(gcloud run services describe aczen-node-server --region="${REGION}" --format='value(status.url)')"
log "Node server deployed: ${URL}"
log "Point the frontend's backend base URL (Decentro/Federal Bank calls) at this URL."
