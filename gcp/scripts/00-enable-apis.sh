#!/usr/bin/env bash
# Phase 1: enable all required GCP APIs.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults

log "Enabling required APIs on ${PROJECT_ID}..."
gcloud services enable \
  sqladmin.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com \
  servicenetworking.googleapis.com \
  compute.googleapis.com \
  storage.googleapis.com \
  cloudbuild.googleapis.com \
  datamigration.googleapis.com

log "APIs enabled."
