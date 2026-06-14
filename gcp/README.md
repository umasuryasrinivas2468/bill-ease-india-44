# Supabase to GCP Migration (GCP-native, India residency)

This directory contains everything needed to move the app off Supabase Cloud onto
a GCP-native stack in `asia-south1` (Mumbai), keeping Clerk as the identity
provider. The frontend keeps using `@supabase/supabase-js` unchanged thanks to a
Supabase-compatible gateway in front of self-hosted PostgREST.

## Target architecture

```
Browser (Clerk JWT) ──► aczen-gateway (Cloud Run, public)
                           ├─ /rest/v1/*       ─► aczen-postgrest (Cloud Run, internal) ─► Cloud SQL (private IP)
                           ├─ /storage/v1/*    ─► aczen-storage-shim (Cloud Run, internal) ─► GCS bucket
                           └─ /functions/v1/*  ─► fn-<name> (Cloud Run, public, Deno)
Edge functions ─► gateway (service_role JWT) ─► PostgREST ─► Cloud SQL
Node server (aczen-node-server) ─► Cloud SQL (server_kv table)
Secrets ─► Secret Manager       Clerk ─► validates JWTs (shared HS256 secret)
```

Realtime (one hook) is replaced by polling. Auth stays in Clerk.

## Prerequisites

Run the scripts from a Unix shell (Google Cloud Shell is easiest; WSL or git-bash
on Windows also work). Install:
- `gcloud` CLI (authenticated: `gcloud auth login`)
- `psql` + `pg_dump`/`pg_restore` (PostgreSQL 16 client)
- [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) (`cloud-sql-proxy`)
- `node` (for `mint-jwt.mjs`)
- (optional) `rclone` for Storage object migration

Builds use **Cloud Build**, so local Docker is not required.

## Configuration

```bash
cd gcp
cp .env.migration.example .env.migration
# Fill in PROJECT_ID, passwords, SUPABASE_DB_URL, PGRST_JWT_SECRET (= your current
# Supabase JWT secret), and the third-party API secrets.
```

`gcp/.env.migration` and any dumps/JWTs are gitignored. Never commit them.

## Run order

| Step | Script | What it does |
|---|---|---|
| 1 | `scripts/00-enable-apis.sh` | Enable GCP APIs |
| 2 | `scripts/01-network.sh` | VPC, subnet, private services access, VPC connector, Cloud NAT, Artifact Registry |
| 3 | `scripts/02-cloudsql.sh` | Cloud SQL Postgres (private IP, HA, backups + PITR). Copy the printed `SQL_PRIVATE_IP` into `.env.migration`. |
| 4 | start the Cloud SQL Auth Proxy (see below), then `scripts/03-db-bootstrap.sh` | Create roles + `auth` helper schema |
| 5a | `scripts/04-run-migrations.sh` | Apply all `supabase/migrations` + grants (schema-from-repo) |
| 5b | `scripts/05-migrate-data.sh` | Copy data from Supabase (data-only; or `--full` for 1:1) |
| 5c | `scripts/verify-counts.sh` | Compare row counts |
| 6 | `scripts/06-secrets.sh` | Mint service_role/anon JWTs + push all secrets to Secret Manager |
| 7 | `scripts/07-deploy-postgrest.sh` | PostgREST on Cloud Run. Copy `POSTGREST_URL`. |
| 8 | `scripts/08-deploy-storage.sh` | GCS bucket + storage shim. Copy `STORAGE_SHIM_URL`. |
| 9 | `scripts/09-deploy-gateway.sh` | Gateway on Cloud Run. Copy `GATEWAY_URL`. |
| 10 | `scripts/10-deploy-functions.sh` | All 24 Deno functions as `fn-*` services |
| 11 | `scripts/11-wire-functions-gateway.sh` | Add `/functions/v1/<name>` routes to the gateway |
| 12 | `scripts/12-deploy-node-server.sh` | Node/Express backend on Cloud Run |
| 13 | `scripts/13-frontend-config.sh` | Generate `.env.production.local` for the frontend |
| - | `scripts/print-urls.sh` | List all service URLs |
| - | `scripts/verify-smoke.sh` | End-to-end smoke test through the gateway |

After steps 7/8/9 update the corresponding `*_URL` in `.env.migration` before the
next step (each script prints the value to set).

## Connecting to Cloud SQL (for psql/pg_restore)

Cloud SQL uses a private IP, so connect through the Auth Proxy:

```bash
cloud-sql-proxy "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" --port 5432 &
# now PGHOST=127.0.0.1 PGPORT=5432 (the defaults the scripts use)
```

## Auth / Clerk JWT template

PostgREST validates every JWT with a single HS256 secret (`PGRST_JWT_SECRET`).
Set it to your **current Supabase JWT secret** so the existing Clerk "supabase"
JWT template (which already signs with that secret, `role=authenticated`,
`sub={{user.id}}`) keeps working with zero Clerk changes. The backend
`service_role`/`anon` tokens are minted with the same secret (`mint-jwt.mjs`).

## Storage migration

The bucket is created private. To copy existing `journal-attachments` objects from
Supabase Storage (S3-compatible) using rclone:

```bash
# Configure an rclone S3 remote 'supabase' pointing at
#   https://<ref>.supabase.co/storage/v1/s3  (region: any; use your storage keys)
rclone copy supabase:journal-attachments "gs://${GCS_BUCKET}/journal-attachments"
```

`getPublicUrl()` targets `/storage/v1/object/public/...`, which the shim serves by
streaming from the private bucket (objects are not made world-readable in GCS).

## Production cutover (low downtime)

For minimal downtime prefer **Database Migration Service** (continuous logical
replication) instead of the one-shot dump:
1. Build schema (step 5a) on Cloud SQL.
2. Create a DMS continuous migration job from Supabase → Cloud SQL.
3. Deploy all services (steps 6-13) and smoke-test against the gateway using a
   staging frontend build.
4. At cutover: freeze writes on Supabase, let DMS catch up, promote Cloud SQL,
   flip the frontend env / DNS to the gateway, update webhook URLs (`WEBHOOKS.md`).
5. Monitor logs (`gcloud run services logs read ...`) and metrics.

## Rollback

Until you decommission Supabase, rollback = point the frontend env
(`VITE_SUPABASE_URL` / keys) back at Supabase and restore the old webhook URLs.
Keep both stacks live through a verification window.

## Decommission Supabase

Only after a clean verification window:
- Remove webhook/OAuth URLs pointing at Supabase.
- Export a final backup (`pg_dump`) and store it.
- Pause/delete the Supabase project.

## Security hardening (recommended follow-ups)

- PostgREST and the storage shim use `internal` ingress (reachable only via the
  VPC). Keep them that way; only the gateway is public.
- Consider a Cloud Armor policy + custom domain on the gateway.
- Rotate `PGRST_JWT_SECRET` periodically (re-mint service/anon tokens after).
- The storage shim's public route streams private objects; switch to short-lived
  signed URLs if you need stricter access control.

See `WEBHOOKS.md` for the external dashboard URL changes.
