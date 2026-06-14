#!/bin/sh
set -e
: "${FUNCTION_NAME:?FUNCTION_NAME env required (e.g. aczen-mcp)}"
TARGET="/app/functions/${FUNCTION_NAME}/index.ts"
[ -f "${TARGET}" ] || { echo "function not found: ${TARGET}" >&2; exit 1; }
echo "[functions] running ${FUNCTION_NAME} (listens on :8000)"
exec deno run --allow-net --allow-env --allow-read "${TARGET}"
