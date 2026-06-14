#!/usr/bin/env bash
# Phase 1: VPC, subnet, private services access, Serverless VPC connector,
# and the Artifact Registry repo. All in REGION (asia-south1) for residency.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
gcloud_defaults
require VPC_NAME SUBNET_NAME CONNECTOR_NAME AR_REPO

log "Creating VPC ${VPC_NAME}..."
gcloud compute networks create "${VPC_NAME}" \
  --subnet-mode=custom || warn "VPC may already exist"

log "Creating subnet ${SUBNET_NAME} in ${REGION}..."
gcloud compute networks subnets create "${SUBNET_NAME}" \
  --network="${VPC_NAME}" --region="${REGION}" --range="10.20.0.0/24" \
  || warn "subnet may already exist"

# Private Services Access range so Cloud SQL gets a private IP in our VPC.
log "Reserving private services range + peering (for Cloud SQL private IP)..."
gcloud compute addresses create google-managed-services-"${VPC_NAME}" \
  --global --purpose=VPC_PEERING --prefix-length=16 \
  --network="${VPC_NAME}" || warn "range may already exist"
gcloud services vpc-peerings connect \
  --service=servicenetworking.googleapis.com \
  --ranges=google-managed-services-"${VPC_NAME}" \
  --network="${VPC_NAME}" || warn "peering may already exist"

log "Creating Serverless VPC Access connector ${CONNECTOR_NAME}..."
gcloud compute networks vpc-access connectors create "${CONNECTOR_NAME}" \
  --region="${REGION}" --network="${VPC_NAME}" --range="10.8.0.0/28" \
  || warn "connector may already exist"

# Cloud NAT so services using vpc-egress=all-traffic (the gateway) can still
# reach the public internet (function *.run.app URLs, external APIs, GCS).
log "Creating Cloud Router + NAT for egress..."
gcloud compute routers create "${VPC_NAME}-router" \
  --network="${VPC_NAME}" --region="${REGION}" || warn "router may already exist"
gcloud compute routers nats create "${VPC_NAME}-nat" \
  --router="${VPC_NAME}-router" --region="${REGION}" \
  --auto-allocate-nat-external-ips \
  --nat-all-subnet-ip-ranges || warn "nat may already exist"

log "Creating Artifact Registry repo ${AR_REPO}..."
gcloud artifacts repositories create "${AR_REPO}" \
  --repository-format=docker --location="${REGION}" \
  --description="Aczen container images" || warn "repo may already exist"

gcloud auth configure-docker "$(ar_host)" --quiet
log "Network + registry ready."
