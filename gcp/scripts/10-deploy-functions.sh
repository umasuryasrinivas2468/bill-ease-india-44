#!/usr/bin/env bash
# Phase 7: build the shared Deno image and deploy each edge function as its own
# Cloud Run service. Functions are pointed at the public gateway via SUPABASE_URL
# and use the minted service_role JWT (Secret Manager) as SUPABASE_SERVICE_ROLE_KEY.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require AR_REPO GATEWAY_URL

IMG="$(image_uri functions)"
log "Building shared functions image ${IMG} (context = repo root)..."
( cd "${REPO_DIR}" && gcloud builds submit --config gcp/functions/cloudbuild.yaml \
    --substitutions=_IMAGE="${IMG}" . )

# Attach a secret env var only if the secret exists (06-secrets.sh skips empties).
SECRET_FLAGS=""
add_secret() { # env_name secret_name
  if gcloud secrets describe "$2" >/dev/null 2>&1; then
    SECRET_FLAGS="${SECRET_FLAGS}${SECRET_FLAGS:+,}$1=$2:latest"
  fi
}
add_secret SUPABASE_SERVICE_ROLE_KEY service-role-jwt
add_secret SUPABASE_ANON_KEY         anon-jwt
add_secret LOVABLE_API_KEY           lovable-api-key
add_secret GEMINI_API_KEY            gemini-api-key
add_secret MISTRAL_API_KEY           mistral-api-key
add_secret RAZORPAY_KEY_ID           razorpay-key-id
add_secret RAZORPAY_KEY_SECRET       razorpay-key-secret
add_secret RAZORPAY_PARTNER_CLIENT_ID     razorpay-partner-client-id
add_secret RAZORPAY_PARTNER_CLIENT_SECRET razorpay-partner-client-secret
add_secret RAZORPAY_WEBHOOK_SECRET   razorpay-webhook-secret
add_secret DIGILOCKER_CLIENT_ID      digilocker-client-id
add_secret DIGILOCKER_CLIENT_SECRET  digilocker-client-secret
add_secret CASHFREE_CLIENT_ID        cashfree-client-id
add_secret CASHFREE_CLIENT_SECRET    cashfree-client-secret
add_secret ACZEN_MCP_API_KEY         aczen-mcp-api-key
add_secret MCP_API_KEY               mcp-api-key

# Non-secret env shared by all functions (unused vars are ignored per-function).
COMMON_ENV="SUPABASE_URL=${GATEWAY_URL}"
COMMON_ENV="${COMMON_ENV},RAZORPAY_MODE=${RAZORPAY_MODE:-live}"
COMMON_ENV="${COMMON_ENV},APP_URL=${APP_URL:-https://app.aczen.in}"
COMMON_ENV="${COMMON_ENV},PUBLIC_APP_URL=${PUBLIC_APP_URL:-https://app.aczen.in}"
COMMON_ENV="${COMMON_ENV},MISTRAL_API_URL=${MISTRAL_API_URL:-https://api.mistral.ai/v1/chat/completions}"
COMMON_ENV="${COMMON_ENV},MISTRAL_MODEL=${MISTRAL_MODEL:-mistral-medium}"
COMMON_ENV="${COMMON_ENV},CASHFREE_BASE_URL=${CASHFREE_BASE_URL:-https://api.cashfree.com}"
COMMON_ENV="${COMMON_ENV},CASHFREE_API_VERSION=${CASHFREE_API_VERSION:-2022-09-01}"
[[ -n "${DIGILOCKER_REDIRECT_URI:-}" ]] && COMMON_ENV="${COMMON_ENV},DIGILOCKER_REDIRECT_URI=${DIGILOCKER_REDIRECT_URI}"

FUNCS_DIR="${REPO_DIR}/supabase/functions"
for d in "${FUNCS_DIR}"/*/; do
  fn="$(basename "$d")"
  [[ -f "${d}/index.ts" ]] || continue
  svc="fn-${fn}"
  log "Deploying ${svc} ..."
  gcloud run deploy "${svc}" \
    --image="${IMG}" \
    --region="${REGION}" \
    --port=8000 \
    --ingress=all \
    --allow-unauthenticated \
    --set-env-vars="FUNCTION_NAME=${fn},${COMMON_ENV}" \
    ${SECRET_FLAGS:+--set-secrets="${SECRET_FLAGS}"}
done

log "All edge functions deployed. List URLs with:"
log "  gcloud run services list --region=${REGION} --filter='metadata.name ~ ^fn-' --format='table(metadata.name, status.url)'"
log "The aczen-mcp Remote MCP URL is the fn-aczen-mcp service URL."
