#!/usr/bin/env bash
# Phase 2: provision Cloud SQL for PostgreSQL with private IP, backups + PITR.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require SQL_INSTANCE SQL_PG_VERSION SQL_TIER VPC_NAME SQL_ROOT_PASSWORD SQL_DB

# Cost-tuned defaults: ZONAL (not REGIONAL HA), PITR off.
# To re-enable for prod: SQL_AVAILABILITY=REGIONAL SQL_PITR=1 ./02-cloudsql.sh
SQL_AVAILABILITY="${SQL_AVAILABILITY:-ZONAL}"
SQL_PITR_FLAG=""
[[ "${SQL_PITR:-0}" == "1" ]] && SQL_PITR_FLAG="--enable-point-in-time-recovery"

log "Creating Cloud SQL instance ${SQL_INSTANCE} (${SQL_PG_VERSION}, ${SQL_TIER}, ${SQL_AVAILABILITY}) in ${REGION}..."
gcloud sql instances create "${SQL_INSTANCE}" \
  --database-version="${SQL_PG_VERSION}" \
  --tier="${SQL_TIER}" \
  --region="${REGION}" \
  --network="projects/${PROJECT_ID}/global/networks/${VPC_NAME}" \
  --no-assign-ip \
  --availability-type="${SQL_AVAILABILITY}" \
  --storage-auto-increase \
  --backup-start-time=18:30 \
  ${SQL_PITR_FLAG} \
  --database-flags=cloudsql.iam_authentication=on \
  || warn "instance may already exist"

log "Setting postgres superuser password..."
gcloud sql users set-password postgres \
  --instance="${SQL_INSTANCE}" --password="${SQL_ROOT_PASSWORD}"

log "Creating application database ${SQL_DB}..."
gcloud sql databases create "${SQL_DB}" --instance="${SQL_INSTANCE}" \
  || warn "database may already exist"

PRIVATE_IP="$(gcloud sql instances describe "${SQL_INSTANCE}" \
  --format='value(ipAddresses[0].ipAddress)')"
log "Cloud SQL private IP: ${PRIVATE_IP}"
log "Add this to gcp/.env.migration:  export SQL_PRIVATE_IP=\"${PRIVATE_IP}\""
log "Cloud SQL ready."
