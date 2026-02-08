# Aiva Invoice Detection - Quick Start Guide

## What's New? 🆕

Aiva now **automatically detects invoice-related questions** and provides **direct navigation links** to the relevant pages!

## Try It Out! 👉

Click the **Aiva button** (bottom-right corner) and ask any of these questions:

### Invoice Questions
- ✅ "What are my pending invoices?"
- ✅ "Show me outstanding amounts"
- ✅ "List all unpaid bills"
- ✅ "How many invoices have I created?"
- ✅ "What's my total outstanding amount?"

### Payment Status Questions
- ✅ "Show me payment records"
- ✅ "What invoices are overdue?"
- ✅ "Which clients haven't paid?"

### GST Questions
- ✅ "How much GST have I collected?"
- ✅ "What's my GST liability?"
- ✅ "Show me GST records"

### Billing Questions
- ✅ "Show me paid invoices"
- ✅ "What's my billing status?"
- ✅ "List all recent bills"

## How It Works 🔄

```
┌─────────────────────────────────────────────┐
│ You ask Aiva about invoices                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Aiva detects invoice-related keywords       │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ AI generates accurate answer                │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Action link appears: "View All Invoices"   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ Click button → Jump to Invoices page        │
└─────────────────────────────────────────────┘
```

## Supported Keywords 📝

### Primary Keywords
- `invoice` → View All Invoices
- `billing` → Go to Invoices
- `bill` → Go to Invoices
- `payment` → Manage Invoices
- `gst` → View GST Filing

### Secondary Keywords (Trigger Primary Actions)
- payment record
- payment status
- invoice number
- invoice date
- invoice amount
- paid invoice
- pending invoice
- overdue
- outstanding
- client payment
- customer payment
- payment due
- invoice list
- all invoices
- recent invoices
- invoice total
- invoice status
- unpaid
- payment received

## Action Links Available 🔗

| Action | Destination | Use When Asking About |
|--------|------------|----------------------|
| **View All Invoices** | Invoices page | General invoice questions |
| **Go to Invoices** | Invoices page | Billing-related questions |
| **View GST Filing** | GST3 Filing | GST collection & liability |
| **Manage Invoices** | Invoices page | Payment status questions |

## Example Conversation 💬

```
You: "How many pending invoices do I have?"

Aiva: "Based on your data, you have 5 pending invoices 
totaling ₹45,000. The oldest pending invoice is from 
December 20, 2024.

[View All Invoices →]
        ↓ Click this button
        ↓ Automatically opens Invoices page
```

## Tips & Tricks 💡

### ✓ DO's
- ✅ Ask specific questions ("Show me pending invoices")
- ✅ Use the suggested questions (they work great!)
- ✅ Click action links to see detailed data
- ✅ Ask multiple questions in one conversation

### ✗ DON'Ts
- ❌ Don't worry about exact wording
- ❌ Capitalization doesn't matter
- ❌ You don't need to phrase it perfectly

## Common Scenarios 🎯

### Scenario 1: Quick Invoices Overview
```
Question: "Show me my invoices"
Result: Gets invoice summary + link to Invoices page
Action: Click link to see full invoice list
```

### Scenario 2: Payment Status Check
```
Question: "What payments am I waiting for?"
Result: Shows pending payments + link to manage
Action: Click to mark as paid or follow up
```

### Scenario 3: GST Filing Help
```
Question: "How much GST do I owe?"
Result: Shows GST calculation + link to filing
Action: Click to prepare GST filing
```

### Scenario 4: Financial Analysis
```
Question: "What's my profit and loss?"
Result: Shows P&L analysis (no action link needed)
Action: Continue asking related questions
```

## Navigation Behavior 🚀

When you click an action link:
1. **Chat closes automatically** ← Keeps UI clean
2. **Navigate to page** ← You're taken directly to the page
3. **Resume chat later** ← Click Aiva button anytime to continue

## Troubleshooting 🔧

### Q: "The action link doesn't appear"
**A:** Try using keywords like "invoice", "billing", "payment", or "gst"

### Q: "I clicked the link but nothing happened"
**A:** Check your browser console for errors, or try refreshing the page

### Q: "Can I customize the links?"
**A:** Yes! Edit the action map in `supabase/functions/financial-advisor/index.ts`

### Q: "Can I add more keywords?"
**A:** Yes! Update the `invoiceKeywords` array in the Edge Function

## What Gets Sent to Aiva? 📤

Your financial data context (no sensitive details):
- ✓ Invoice count and totals
- ✓ Payment status summary
- ✓ GST collection data
- ✓ Outstanding receivables
- ✓ Basic business summary
- ✗ No passwords
- ✗ No customer personal data
- ✗ No payment methods

## Next Steps 🎓

1. **Click the Aiva button** (bottom-right)
2. **Try a suggested question** or ask your own
3. **Click the action link** when it appears
4. **Enjoy faster navigation!** 🚀

---

**Have questions?** Check the full documentation at `AIVA_INVOICE_DETECTION_FEATURE.md`