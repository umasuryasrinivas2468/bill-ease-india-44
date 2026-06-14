#!/usr/bin/env bash
# Phase 4 prep: mint service_role/anon JWTs and push all secrets to Secret Manager.
# Idempotent: creates the secret if missing, then adds a new version.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require PGRST_JWT_SECRET

put_secret() {
  local name="$1"; local value="$2"
  [[ -z "${value}" ]] && { warn "skip ${name} (empty)"; return 0; }
  if ! gcloud secrets describe "${name}" >/dev/null 2>&1; then
    gcloud secrets create "${name}" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "${value}" | gcloud secrets versions add "${name}" --data-file=- >/dev/null
  log "secret set: ${name}"
}

log "Minting service_role + anon JWTs from PGRST_JWT_SECRET..."
SERVICE_ROLE_JWT="$(PGRST_JWT_SECRET="${PGRST_JWT_SECRET}" node "${SCRIPT_DIR}/mint-jwt.mjs" service_role)"
ANON_JWT="$(PGRST_JWT_SECRET="${PGRST_JWT_SECRET}" node "${SCRIPT_DIR}/mint-jwt.mjs" anon)"

# Core auth/identity secrets
put_secret pgrst-jwt-secret      "${PGRST_JWT_SECRET}"
put_secret service-role-jwt      "${SERVICE_ROLE_JWT}"
put_secret anon-jwt              "${ANON_JWT}"

# AI providers
put_secret lovable-api-key       "${LOVABLE_API_KEY:-}"
put_secret gemini-api-key        "${GEMINI_API_KEY:-}"
put_secret mistral-api-key       "${MISTRAL_API_KEY:-}"

# Razorpay
put_secret razorpay-key-id               "${RAZORPAY_KEY_ID:-}"
put_secret razorpay-key-secret           "${RAZORPAY_KEY_SECRET:-}"
put_secret razorpay-partner-client-id    "${RAZORPAY_PARTNER_CLIENT_ID:-}"
put_secret razorpay-partner-client-secret "${RAZORPAY_PARTNER_CLIENT_SECRET:-}"
put_secret razorpay-webhook-secret       "${RAZORPAY_WEBHOOK_SECRET:-}"

# DigiLocker
put_secret digilocker-client-id     "${DIGILOCKER_CLIENT_ID:-}"
put_secret digilocker-client-secret "${DIGILOCKER_CLIENT_SECRET:-}"

# Cashfree
put_secret cashfree-client-id     "${CASHFREE_CLIENT_ID:-}"
put_secret cashfree-client-secret "${CASHFREE_CLIENT_SECRET:-}"

# MCP
put_secret aczen-mcp-api-key  "${ACZEN_MCP_API_KEY:-}"
put_secret mcp-api-key        "${MCP_API_KEY:-}"

# Node server extras
put_secret sendgrid-api-key       "${SENDGRID_API_KEY:-}"
put_secret decentro-client-id     "${DECENTRO_CLIENT_ID:-}"
put_secret decentro-client-secret "${DECENTRO_CLIENT_SECRET:-}"
put_secret decentro-module-secret "${DECENTRO_MODULE_SECRET:-}"
put_secret decentro-provider-secret "${DECENTRO_PROVIDER_SECRET:-}"

log "All secrets pushed. service_role/anon JWTs stored as service-role-jwt / anon-jwt."
