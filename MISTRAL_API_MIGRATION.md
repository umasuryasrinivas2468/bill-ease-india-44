# Mistral API Migration - Setup Guide

## 🎯 Migration Summary

Successfully migrated from Google Generative AI to **Mistral AI** for all conversational and financial advisory features.

### What Changed

| Component | Before | After |
|-----------|--------|-------|
| **AI Provider** | Google (Gemini via Lovable Gateway) | Mistral AI |
| **Model** | google/gemini-2.5-flash | mistral-medium |
| **API Key Env Var** | MISTRAL_API_KEY / APIMYST (with hardcoded fallback) | **APIMYST** (only) |
| **API Endpoint** | Multiple fallbacks with hardcoded key | https://api.mistral.ai/v1/chat/completions |
| **Dependencies** | @google/generative-ai included | ✅ Removed |
| **Fallback Logic** | LOVABLE fallback to Google Gemini | ✅ Removed |

### Files Modified

1. ✅ **package.json** - Removed `@google/generative-ai` dependency
2. ✅ **supabase/functions/financial-advisor/index.ts** - Complete rewrite for Mistral API
3. ✅ **supabase/functions/financial-advisor/README.md** - Updated documentation

---

## 🚀 Setup Instructions

### Step 1: Get Your Mistral API Key

1. Go to [Mistral AI Console](https://console.mistral.ai/)
2. Create an account or log in
3. Navigate to **API Keys** section
4. Click **Create new API key**
5. Copy the generated key (looks like: `U6g...c2PXq`)

### Step 2: Add the API Key to Supabase

#### Option A: Via Supabase Dashboard (Recommended)

1. Open your Supabase project dashboard
2. Go to **Project Settings** → **Environment Variables** (or **Secrets** section)
3. Click **New Secret**
4. Enter:
   - **Name**: `APIMYST`
   - **Value**: `<your-mistral-api-key>`
5. Click **Save**
6. Redeploy the `financial-advisor` function or wait for propagation

#### Option B: Via Supabase CLI

```powershell
# Set the secret
supabase secrets set APIMYST="your-mistral-api-key-here"

# Deploy the updated function
supabase functions deploy financial-advisor --project-ref your-project-ref
```

#### Option C: Local Development Testing

```powershell
# Set environment variable (PowerShell)
$env:APIMYST = 'your-mistral-api-key'

# Test the function locally (requires Deno)
deno run --allow-net --allow-env supabase/functions/financial-advisor/index.ts
```

### Step 3: Install Dependencies

Since we removed `@google/generative-ai`, update your dependencies:

```powershell
npm install
# or
yarn install
# or
bun install
```

---

## 🔧 Configuration Details

### Mistral API Settings

- **Model**: `mistral-medium` (balanced performance & cost)
- **Temperature**: 0.3 (precise, deterministic responses)
- **Max Tokens**: 1024 (sufficient for financial analysis)
- **API Base**: https://api.mistral.ai/v1

### Function Behavior

- **Input**: User question + Financial data context
- **Output**: AI-generated financial analysis and recommendations
- **Error Handling**:
  - `429` - Rate limit exceeded → Advises user to wait
  - `401` - Invalid API key → Authentication failed error
  - `402` - Quota exceeded → Add credits to Mistral account
  - Other errors → Retryable service error

---

## 🧪 Testing the Integration

### Test 1: Via Aiva Chat Interface

1. Open the application
2. Click the Aiva button (bottom-right)
3. Select a suggested question or ask a custom one
4. Expected: AI-generated response based on your financial data

### Test 2: Direct Function Call (For Developers)

```typescript
const response = await supabase.functions.invoke('financial-advisor', {
  body: {
    question: 'Show me my last month profit and loss',
    dataContext: {
      summary: { /* financial data */ },
      invoices: [],
      journals: [],
      // ... other context
    }
  }
});

console.log(response.data.response); // AI-generated answer
```

---

## 📊 Cost Considerations

**Mistral Medium Pricing** (as of latest rates):
- Input: ~$0.0007 / 1K tokens
- Output: ~$0.0021 / 1K tokens

**Typical Query Costs**: ~$0.002 - $0.005 per financial analysis

Compare with your usage patterns on the Mistral dashboard to manage costs.

---

## 🔐 Security Best Practices

✅ **DO:**
- Store `APIMYST` in Supabase environment secrets only
- Use Supabase CLI for secure secret management
- Rotate your API key periodically
- Monitor usage on Mistral dashboard

❌ **DON'T:**
- Commit API keys to git or version control
- Store keys in frontend code
- Share keys via email or chat
- Hardcode keys in configuration files

---

## 🆘 Troubleshooting

### Error: "Mistral API key not configured"
- **Solution**: Ensure `APIMYST` environment variable is set in Supabase secrets
- Verify via Supabase Dashboard → Project Settings → Environment Variables

### Error: "Rate limit exceeded"
- **Solution**: Wait a moment before making another request
- Consider upgrading your Mistral plan for higher limits

### Error: "AI service authentication failed"
- **Solution**: Verify your Mistral API key is correct
- Generate a new key from Mistral console if needed
- Wait 1-2 minutes for propagation after adding secret

### Empty or Incomplete Responses
- **Solution**: Ensure sufficient financial data context is provided
- Check that `dataContext` includes necessary tables (invoices, journals, etc.)
- Verify network connectivity to api.mistral.ai

---

## 📝 Migration Checklist

- [x] Removed `@google/generative-ai` from package.json
- [x] Updated financial-advisor function to use Mistral API
- [x] Removed LOVABLE/Google fallback code
- [x] Removed hardcoded API keys
- [x] Updated environment variable to `APIMYST`
- [x] Updated documentation
- [ ] Obtain Mistral API key
- [ ] Add `APIMYST` to Supabase secrets
- [ ] Deploy updated function
- [ ] Test Aiva chat interface
- [ ] Monitor Mistral dashboard for usage

---

## 📚 Additional Resources

- [Mistral AI Documentation](https://docs.mistral.ai/)
- [Mistral API Reference](https://docs.mistral.ai/api/)
- [Supabase Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase Edge Functions Deployment](https://supabase.com/docs/guides/functions/deploy)

---

## ✨ Next Steps (Optional Enhancements)

1. **Usage Monitoring**: Add a Supabase table to log AI queries and token usage
2. **Cost Tracking**: Implement cost calculations based on token usage
3. **Model Options**: Allow users to switch between mistral-small/medium/large
4. **Response Caching**: Cache common financial queries to reduce API calls
5. **Multi-language Support**: Leverage Mistral's language capabilities for international users
