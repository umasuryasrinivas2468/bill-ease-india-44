#!/usr/bin/env bash
# Phase 10: smoke-test the GCP stack end to end through the gateway.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require GATEWAY_URL

SR_JWT="$(gcloud secrets versions access latest --secret=service-role-jwt)"
PASS=0; FAIL=0
check() { # name expected_substr actual
  if echo "$3" | grep -q "$2"; then log "PASS: $1"; PASS=$((PASS+1));
  else warn "FAIL: $1 (expected '$2')"; echo "    got: $(echo "$3" | head -c 300)"; FAIL=$((FAIL+1)); fi
}

log "1) Gateway health"
check "gateway /" "gateway ok" "$(curl -s "${GATEWAY_URL}/")"

log "2) PostgREST via gateway (service_role bypasses RLS)"
REST="$(curl -s "${GATEWAY_URL}/rest/v1/apps?select=id&limit=1" \
  -H "apikey: ${SR_JWT}" -H "Authorization: Bearer ${SR_JWT}")"
check "rest apps select" "\[" "${REST}"   # expect a JSON array

log "3) RPC reachability (PostgREST exposes functions under /rest/v1/rpc/*)"
RPC_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "${GATEWAY_URL}/rest/v1/rpc/nonexistent_fn_smoke" \
  -H "Content-Type: application/json" -H "Authorization: Bearer ${SR_JWT}" -d '{}')"
# 404 = routing works (function simply doesn't exist); 5xx = broken.
[[ "${RPC_CODE}" =~ ^4 ]] && { log "PASS: rpc routing (${RPC_CODE})"; PASS=$((PASS+1)); } \
  || { warn "FAIL: rpc routing (${RPC_CODE})"; FAIL=$((FAIL+1)); }

log "4) Edge function via gateway (aczen-mcp health)"
MCP="$(curl -s "${GATEWAY_URL}/functions/v1/aczen-mcp")"
check "fn aczen-mcp health" "Aczen MCP Server" "${MCP}"

log "5) Storage shim via gateway"
ST_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  "${GATEWAY_URL}/storage/v1/object/public/journal-attachments/__smoke__missing")"
[[ "${ST_CODE}" == "404" ]] && { log "PASS: storage routing (404 for missing object)"; PASS=$((PASS+1)); } \
  || { warn "FAIL: storage routing (${ST_CODE})"; FAIL=$((FAIL+1)); }

echo
log "Smoke summary: ${PASS} passed, ${FAIL} failed."
[[ "${FAIL}" -eq 0 ]] || exit 1
