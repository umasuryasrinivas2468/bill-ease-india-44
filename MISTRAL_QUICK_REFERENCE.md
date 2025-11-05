# 🚀 Mistral API - Quick Reference Card

## One-Liner Setup
```powershell
supabase secrets set APIMYST="your-mistral-api-key" && supabase functions deploy financial-advisor
```

---

## Essential Info

| Item | Value |
|------|-------|
| **API Provider** | Mistral AI |
| **Base URL** | https://api.mistral.ai/v1 |
| **Model** | mistral-medium |
| **Endpoint** | /chat/completions |
| **Auth Method** | Bearer token |
| **Env Variable** | APIMYST |
| **Supabase Function** | financial-advisor |

---

## Environment Setup

### Supabase Dashboard
```
Project Settings → Environment Variables → New Secret
Key: APIMYST
Value: (your-mistral-api-key)
```

### CLI
```powershell
supabase secrets set APIMYST="sk-..."
```

### Local Dev (PowerShell)
```powershell
$env:APIMYST = 'sk-...'
deno run --allow-net --allow-env supabase/functions/financial-advisor/index.ts
```

---

## API Request Format

```typescript
{
  model: "mistral-medium",
  messages: [
    { role: "system", content: "System instructions..." },
    { role: "user", content: "User question..." }
  ],
  temperature: 0.3,
  max_tokens: 1024
}
```

---

## API Response Format

```typescript
{
  choices: [
    {
      message: {
        content: "AI generated response..."
      }
    }
  ]
}
```

---

## Error Codes & Solutions

| Code | Meaning | Action |
|------|---------|--------|
| **429** | Rate limited | Wait & retry |
| **401** | Bad API key | Verify APIMYST value |
| **402** | No credits | Add credits to Mistral account |
| **500** | Server error | Retry or check status page |

---

## Frontend Integration

```typescript
// Aiva component automatically uses financial-advisor function
// No changes needed! Just set APIMYST in Supabase and deploy.

// Manual usage:
const response = await supabase.functions.invoke('financial-advisor', {
  body: {
    question: 'What is my profit?',
    dataContext: { /* financial data */ }
  }
});
console.log(response.data.response); // AI response
```

---

## Deployment Steps

```powershell
# 1. Set the secret
supabase secrets set APIMYST="your-api-key"

# 2. Deploy function
supabase functions deploy financial-advisor --project-ref YOUR_PROJECT_REF

# 3. Test (open your app and click Aiva)
# Done! 🎉
```

---

## Cost Estimation

| Usage | Cost |
|-------|------|
| 1 small query | ~$0.002 |
| 10 queries/day | ~$0.20/month |
| 100 queries/day | ~$2/month |
| 1000 queries/day | ~$20/month |

Monitor on Mistral dashboard regularly.

---

## Security Checklist

- ✅ Never hardcode API keys
- ✅ Use Supabase secrets only
- ✅ Rotate keys periodically
- ✅ Monitor usage on Mistral dashboard
- ✅ Clear error logs regularly

---

## Common Issues

**"API key not configured"**
```powershell
supabase secrets set APIMYST="your-key"
supabase functions deploy financial-advisor
```

**"Rate limit exceeded"**
```
Just wait a moment and retry
(Or upgrade your Mistral plan)
```

**"Auth failed (401)"**
```
Check your APIMYST value is correct and active
Generate new key from console.mistral.ai if needed
```

**Empty response**
```
Ensure financial data is populated in database
Check browser console for more details
```

---

## Useful Links

- 🔗 [Mistral API Docs](https://docs.mistral.ai/)
- 🔗 [Get API Key](https://console.mistral.ai/)
- 🔗 [Models Reference](https://docs.mistral.ai/capabilities/overview/#models)
- 🔗 [Pricing](https://mistral.ai/pricing/)
- 🔗 [Supabase Secrets](https://supabase.com/docs/guides/functions/secrets)

---

## Database Context (Sent to AI)

```typescript
{
  summary: {
    businessName,
    period,
    totalRevenue,
    invoicesCreated,
    quotationsSent,
    quotationsAccepted,
    clientsCount,
    tdsAmount,
    paidInvoices,
    pendingInvoices,
    overDueInvoices,
    totalGstCollected,
    cashIn,
    cashOut
  },
  invoices: [ /* simplified invoice data */ ],
  revenueByClient: [ /* revenue breakdown */ ],
  journals: [ /* journal entries */ ],
  accounts: [ /* chart of accounts */ ],
  inventories: [ /* inventory items */ ]
}
```

---

## Testing Commands

```powershell
# Check if APIMYST is set
$env:APIMYST

# View Supabase secrets
supabase secrets list

# Deploy function
supabase functions deploy financial-advisor --project-ref YOUR_PROJECT_REF

# View function logs
supabase functions download financial-advisor

# Local testing
deno run --allow-net --allow-env supabase/functions/financial-advisor/index.ts
```

---

## Model Comparison

| Model | Speed | Cost | Quality |
|-------|-------|------|---------|
| mistral-small | ⚡ Fast | 💰 Cheap | ⭐⭐⭐ |
| **mistral-medium** | ⚡⚡ Good | 💰💰 Medium | ⭐⭐⭐⭐ |
| mistral-large | ⚡⚡⚡ Slow | 💰💰💰 Expensive | ⭐⭐⭐⭐⭐ |

*Currently using: **mistral-medium***

---

## Status Dashboard

Check these regularly:

1. **Mistral Console** → Usage & Billing
   - https://console.mistral.ai/

2. **Supabase Dashboard** → Edge Functions Logs
   - Project → Edge Functions → financial-advisor → Logs

3. **Application**
   - Monitor Aiva response times
   - Check browser console for errors

---

## Rollback Plan

If anything goes wrong:

```powershell
# Option 1: Disable function temporarily
supabase functions delete financial-advisor

# Option 2: Check git history
git log supabase/functions/financial-advisor/

# Option 3: Restore from backup
git checkout HEAD supabase/functions/financial-advisor/
supabase functions deploy financial-advisor
```

---

## Support Resources

📧 **Mistral Support**: support@mistral.ai
📖 **Docs**: https://docs.mistral.ai/
🐛 **Report Issues**: Check Supabase function logs first

---

**Last Updated**: 2025
**Status**: ✅ Production Ready
**Version**: Mistral-Medium v1.0
