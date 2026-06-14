# Cloud Shell Playbook — Supabase → GCP migration

Paste-ready. Run every command **inside Cloud Shell** (`shell.cloud.google.com`).
Each phase is bounded so you can pause between them. If a step fails, stop and
ask before re-running blindly — most scripts are idempotent but not all.

---

## Phase 0 — One-time GCP setup (do once)

### 0.1 Create GCP project + link billing (~10 min, in browser)
1. Console → top-left project dropdown → **New Project**. Name it `aczen-prod` (or similar).
2. Copy the **Project ID** (the string in parentheses — NOT the display name).
3. Console → Billing → link your billing account (the one with the $28K credit) to this project.

### 0.2 Open Cloud Shell + clone repo

```bash
# Click the Cloud Shell icon (>_) in the top-right of the GCP console.

# Set the active project
gcloud config set project <PASTE_YOUR_PROJECT_ID>

# Clone your repo into Cloud Shell. Replace with your actual GitHub URL.
git clone https://github.com/<your-org>/bill-ease-india-44-12.git
cd bill-ease-india-44-12/gcp

# Make scripts executable
chmod +x scripts/*.sh
```

### 0.3 Fill in `.env.migration`

The file `gcp/.env.migration` is already in your repo with cost-tuned defaults.
You only need to replace the `PASTE_HERE_*` values:

```bash
# Use Cloud Shell's built-in editor — opens in browser
cloudshell edit .env.migration
```

You'll need to paste:
- `PROJECT_ID` → the project ID from 0.1
- `SQL_ROOT_PASSWORD` + `AUTHENTICATOR_PASSWORD` → generate two strong ones:
  ```bash
  openssl rand -base64 32     # run twice, copy each into the file
  ```
- `SUPABASE_DB_URL` → Supabase dashboard → Project Settings → Database → URI (direct)
- `PGRST_JWT_SECRET` → Supabase dashboard → Project Settings → API → JWT Secret
- All third-party API keys (look at `supabase secrets list` for the names)

Save. Then load it into your shell:

```bash
set -a
source .env.migration
set +a
```

**Verify it loaded:**
```bash
echo "$PROJECT_ID"           # should print your project id
echo "$REGION"               # should print asia-south1
echo "$PGRST_JWT_SECRET" | head -c 20    # should print first 20 chars of secret
```

---

## Phase 1 — Provision GCP infrastructure (~30 min, mostly waiting)

```bash
./scripts/00-enable-apis.sh         # ~3 min
./scripts/01-network.sh             # ~10 min — creates VPC, NAT, connector
./scripts/02-cloudsql.sh            # ~15 min — Cloud SQL provisioning is slow
```

At the end of script 02 you'll see:
```
Cloud SQL private IP: 10.x.x.x
Add this to gcp/.env.migration:  export SQL_PRIVATE_IP="10.x.x.x"
```

**Edit `.env.migration` and paste that IP into `SQL_PRIVATE_IP`. Then re-source:**

```bash
cloudshell edit .env.migration
# update SQL_PRIVATE_IP, save, then:
set -a; source .env.migration; set +a
```

---

## Phase 2 — Database bootstrap + schema (~20 min)

Cloud SQL has private IP only, so we tunnel through the Cloud SQL Auth Proxy.

### 2.1 Start the proxy (leave it running in a second tab)

Open a **second Cloud Shell tab** (click the `+` icon in the Cloud Shell toolbar):

```bash
cd ~/bill-ease-india-44-12/gcp
set -a; source .env.migration; set +a

# Cloud SQL Auth Proxy is pre-installed in Cloud Shell
cloud-sql-proxy "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" --port 5432
# Leave this running. Switch back to tab 1 for everything else.
```

### 2.2 Back in tab 1 — bootstrap + run migrations

```bash
./scripts/03-db-bootstrap.sh        # ~2 min — creates roles + auth schema
./scripts/04-run-migrations.sh      # ~5-15 min — applies all supabase/migrations/*
```

### 2.3 Copy data from Supabase

```bash
./scripts/05-migrate-data.sh        # Time depends on data size
./scripts/verify-counts.sh          # MUST show all green / matching counts
```

**If any row count mismatches, STOP. Tell me what failed before continuing.**

---

## Phase 3 — Backend services (~45 min)

```bash
./scripts/06-secrets.sh             # Mints JWTs + pushes secrets — ~3 min
./scripts/07-deploy-postgrest.sh    # ~8 min
```

Paste the printed `POSTGREST_URL` into `.env.migration` → re-source.

```bash
./scripts/08-deploy-storage.sh      # ~8 min
```

Paste the printed `STORAGE_SHIM_URL` → re-source.

```bash
./scripts/09-deploy-gateway.sh      # ~8 min
```

Paste the printed `GATEWAY_URL` → re-source. **This URL is your new VITE_SUPABASE_URL.**

---

## Phase 4 — Functions + Node server (~50 min)

```bash
./scripts/10-deploy-functions.sh    # ~30-40 min — deploys 24 services
./scripts/11-wire-functions-gateway.sh    # ~3 min
./scripts/12-deploy-node-server.sh        # ~8 min
```

---

## Phase 5 — Frontend cutover (~30 min)

```bash
./scripts/13-frontend-config.sh
# Generates .env.production.local in repo root. Download it:
cloudshell download .env.production.local
```

Then on your Windows machine:
- Drop the downloaded file into your frontend repo as `.env.production.local`
- `npm run build`
- Deploy the build to wherever you host (Vercel / Netlify / Cloud Run static).

### 5.1 Smoke test

```bash
./scripts/verify-smoke.sh
```

### 5.2 Browser test (do this yourself)
- Sign in (Clerk should be unchanged — same user accounts work)
- Open dashboard
- Open one journal entry
- Upload a file
- Trigger one AI function (e.g. bill OCR)
- Open Banking page (Decentro / Federal Bank — uses node server)

---

## Phase 6 — Webhook URLs (~45 min, no code)

Open `gcp/WEBHOOKS.md` and walk through every external dashboard. Replace the
old `https://<ref>.supabase.co/functions/v1/<name>` URLs with
`<GATEWAY_URL>/functions/v1/<name>`:
- Razorpay (payments + transfer webhooks)
- Cashfree
- DigiLocker (redirect URI — needs re-registration with MeriPehchaan)
- Any cron triggers
- Clerk webhooks (if any)

---

## Phase 7 — Verification window (1 week, passive)

Don't delete Supabase yet. Keep both stacks live for at least 7 days. If
anything breaks, point `VITE_SUPABASE_URL` back to Supabase and redeploy
your frontend — instant rollback.

After 7 clean days:
```bash
# On your local machine, final backup
pg_dump "${SUPABASE_DB_URL}" -Fc -f supabase-final-backup.dump
# Then pause/delete the Supabase project in their dashboard.
```

---

## Troubleshooting cheatsheet

| Symptom | Fix |
|---|---|
| `gcloud: command not found` | You're not in Cloud Shell. Open shell.cloud.google.com |
| `permission denied` on `./scripts/x.sh` | `chmod +x scripts/*.sh` |
| Script can't find a var (`PROJECT_ID: unbound variable`) | You forgot `set -a; source .env.migration; set +a` after editing |
| `cloud-sql-proxy: connection refused` | Check proxy tab is still running; check `SQL_PRIVATE_IP` is set |
| `pg_restore: error: relation X already exists` | Schema was applied twice. Drop the DB and re-run, or use `--clean` flag |
| Cloud Run deploy hangs | Cloud Build is building the image — check progress at console → Cloud Build → History |
| Function deploys are slow (24 services × 1-2 min) | Normal. Go get coffee. |
| Smoke test fails on `/rest/v1/...` | Verify gateway → postgrest reachability: `gcloud run services logs read aczen-gateway --region=$REGION --limit=50` |

---

## Cost monitoring (set this up early)

```bash
# Set a budget alert at $50 to catch surprises
# Console → Billing → Budgets & alerts → Create budget → $50 → email me
```

Expected idle cost with these settings: **~$80-100/month** until you have real traffic.
