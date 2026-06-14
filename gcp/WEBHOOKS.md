# External webhook & OAuth callback cutover

After `10-deploy-functions.sh`, run `gcp/scripts/print-urls.sh` to get each
`fn-<name>` Cloud Run URL, then update the corresponding third-party dashboards.

Old base: `https://vhntnkvtzmerpdhousfr.supabase.co/functions/v1/<name>`
New base: the `fn-<name>` Cloud Run service URL (one URL per function).

## Razorpay (Partner Dashboard -> Webhooks / OAuth)
| Purpose | Old path | New service | Notes |
|---|---|---|---|
| Payments/account webhook | `/razorpay-webhook` | `fn-razorpay-webhook` | Keep the same signing secret (`RAZORPAY_WEBHOOK_SECRET`). |
| Transfer/route webhook | `/razorpay-transfer-webhook` | `fn-razorpay-transfer-webhook` | Same secret. |
| OAuth redirect/callback | `/razorpay-oauth-callback` | `fn-razorpay-oauth-callback` | Update the redirect URI in the Razorpay OAuth app config. |
| Partner authorize entry | `/razorpay-partner-authorize` | `fn-razorpay-partner-authorize` | Update any links that point to it. |

## Cashfree
| Purpose | Old path | New service |
|---|---|---|
| Reverse penny drop callbacks (if any) | `/cashfree-reverse-penny-drop` | `fn-cashfree-reverse-penny-drop` |

## DigiLocker
| Purpose | Old | New |
|---|---|---|
| OAuth redirect URI | `/digilocker-oauth-exchange` | `fn-digilocker-oauth-exchange` |
Set `DIGILOCKER_REDIRECT_URI` (in `gcp/.env.migration`) to the new service URL
and register the same URI in the DigiLocker/Meripehchaan app settings.

## MCP server URL (Claude/Cursor/GPT tool callers)
- Old: `https://vhntnkvtzmerpdhousfr.supabase.co/functions/v1/aczen-mcp`
- New: the `fn-aczen-mcp` Cloud Run URL. Endpoints unchanged:
  - `GET  <fn-aczen-mcp>/tools`
  - `POST <fn-aczen-mcp>/call`
  - `GET  <fn-aczen-mcp>` (health)
- Auth unchanged: `x-api-key: <ACZEN_MCP_API_KEY>` or `Authorization: Bearer <jwt>`.

## App config that references function URLs
The frontend calls functions via `supabase.functions.invoke('<name>')` and a few
direct `fetch(${VITE_SUPABASE_URL}/functions/v1/<name>)`. After step 11
(`11-wire-functions-gateway.sh`), the gateway proxies `/functions/v1/<name>` to
each `fn-<name>` service, so setting `VITE_SUPABASE_URL` to the gateway is all the
frontend needs - no per-function URLs required. External callers (Razorpay,
DigiLocker, MCP clients) should use the direct `fn-<name>` URLs from the table
above.
