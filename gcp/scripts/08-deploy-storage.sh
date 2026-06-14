#!/usr/bin/env bash
# Phase 6 (run BEFORE the gateway): create the private GCS bucket, optionally
# migrate existing objects, and deploy the storage shim (internal ingress, so
# only the gateway can reach it via the VPC).
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require AR_REPO GCS_BUCKET

log "Creating private GCS bucket gs://${GCS_BUCKET} in ${REGION}..."
gcloud storage buckets create "gs://${GCS_BUCKET}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --public-access-prevention || warn "bucket may already exist"

# --- Optional: migrate existing journal-attachments objects from Supabase ----
# Supabase Storage is S3-compatible. Configure an rclone remote 'supabase'
# (S3 endpoint https://<ref>.supabase.co/storage/v1/s3) then:
#   rclone copy supabase:journal-attachments gs://${GCS_BUCKET}/journal-attachments
log "If you have existing Storage objects, copy them now (see gcp/README.md 'Storage migration')."

IMG="$(image_uri storage-shim)"
log "Building storage shim image ${IMG}..."
gcloud builds submit "${GCP_DIR}/storage-shim" --tag "${IMG}"

log "Deploying storage shim to Cloud Run (internal ingress)..."
gcloud run deploy aczen-storage-shim \
  --image="${IMG}" \
  --region="${REGION}" \
  --ingress=internal \
  --allow-unauthenticated \
  --set-env-vars="GCS_BUCKET=${GCS_BUCKET}"

SA="$(gcloud run services describe aczen-storage-shim --region="${REGION}" \
  --format='value(spec.template.spec.serviceAccountName)')"
SA="${SA:-$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')-compute@developer.gserviceaccount.com}"
log "Granting storage.objectAdmin on the bucket to ${SA}..."
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${SA}" --role="roles/storage.objectAdmin"

URL="$(gcloud run services describe aczen-storage-shim --region="${REGION}" --format='value(status.url)')"
log "Storage shim deployed (internal): ${URL}"
log "Set in gcp/.env.migration:  export STORAGE_SHIM_URL=\"${URL}\""
