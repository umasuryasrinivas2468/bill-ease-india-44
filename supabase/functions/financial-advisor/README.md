# Financial Advisor Edge Function

This Supabase Edge Function (`financial-advisor`) provides a server-side AI proxy for the in-app assistant (Aiva) powered by **Mistral AI**.

## Configuration

### API Provider
- **Provider**: Mistral AI (https://api.mistral.ai/v1)
- **Model**: mistral-medium (balanced performance and cost)

### Required Environment Variable

You **must** set either `MISTRAL_API_KEY` or `APIMYST` environment variable with your Mistral API key. Do NOT commit the key into the repository.

## How to Add the API Key

### 1) Supabase Dashboard (Recommended)
1. Open your Supabase project dashboard
2. Go to **Project Settings** → **API** / **Environment Variables** (or **Secrets** section)
3. Add a new secret:
   - **Key**: `APIMYST`
   - **Value**: `<your-mistral-api-key>`
4. Redeploy the function or wait for secrets to propagate

### 2) Supabase CLI (PowerShell)

```powershell
# Set the secret (preferred key name: MISTRAL_API_KEY)
supabase secrets set MISTRAL_API_KEY="your-mistral-api-key"

# Or set the legacy alias
supabase secrets set APIMYST="your-mistral-api-key"

# Deploy the function
supabase functions deploy financial-advisor --project-ref <your-project-ref>
```

### 3) Local Development (PowerShell - Dev Only)

```powershell
# Set environment variable for testing
$env:APIMYST = 'your-mistral-api-key'

# Run the function locally (requires Deno)
deno run --allow-net --allow-env supabase/functions/financial-advisor/index.ts
```

## Getting a Mistral API Key

1. Visit [Mistral AI Console](https://console.mistral.ai/)
2. Sign up or log in to your account
3. Navigate to **API Keys**
4. Create a new API key
5. Copy the key and add it to your Supabase environment variables as `APIMYST`

## Security Notes

⚠️ **Important**:
- Never commit API keys to source control
- Never store API keys in the frontend code
- Always use Supabase secrets or your host's secret manager for production
- The `APIMYST` key is read from environment variables only (server-side)

## Function Behavior

- Accepts financial data context (invoices, journals, accounts, inventory, etc.)
- Uses Mistral's `mistral-medium` model for balanced performance
- System prompt provides accounting and finance expertise
- Returns AI-generated financial insights and analysis
- Handles rate limiting (429) and quota errors (402) gracefully
