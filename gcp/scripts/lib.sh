#!/usr/bin/env bash
# Shared helpers + config loader for all migration scripts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GCP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${GCP_DIR}/.." && pwd)"

ENV_FILE="${GCP_DIR}/.env.migration"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found. Copy gcp/.env.migration.example -> gcp/.env.migration and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "${ENV_FILE}"

log()  { printf '\033[1;34m[migrate]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[migrate]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[migrate] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require() {
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then die "Required variable '${v}' is empty in ${ENV_FILE}"; fi
  done
}

gcloud_defaults() {
  require PROJECT_ID REGION
  gcloud config set project "${PROJECT_ID}" >/dev/null
  gcloud config set run/region "${REGION}" >/dev/null
}

ar_host() { echo "${REGION}-docker.pkg.dev"; }
image_uri() { echo "$(ar_host)/${PROJECT_ID}/${AR_REPO}/$1:${2:-latest}"; }
